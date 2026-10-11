const { db, findOrCreateIngredient, fuzzyFindIngredient } = require('./db');
const { formatParts, normalize } = require('./units');

// Sečte suroviny z více receptů (s přepočtem na počet porcí).
// recipes: [{ id, servings? }]
function aggregateRecipes(recipes) {
  const getRecipe = db.prepare('SELECT id, name, servings FROM recipes WHERE id = ?');
  const getIngs = db.prepare(`
    SELECT ri.ingredient_id, ri.amount, ri.unit, i.name, i.pantry, c.name AS category, c.sort AS category_sort
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    JOIN categories c ON c.id = i.category_id
    WHERE ri.recipe_id = ? ORDER BY ri.sort, ri.id`);
  const map = new Map();
  for (const r of recipes) {
    const recipe = getRecipe.get(r.id);
    if (!recipe) continue;
    const factor = r.servings && recipe.servings ? r.servings / recipe.servings : 1;
    for (const ing of getIngs.all(recipe.id)) {
      if (!map.has(ing.ingredient_id)) {
        map.set(ing.ingredient_id, {
          ingredient_id: ing.ingredient_id, name: ing.name, category: ing.category, category_sort: ing.category_sort,
          pantry: !!ing.pantry, parts: [], recipes: new Set(),
        });
      }
      const entry = map.get(ing.ingredient_id);
      entry.parts.push({ amount: ing.amount == null ? null : ing.amount * factor, unit: ing.unit, recipe_id: recipe.id });
      entry.recipes.add(recipe.name);
    }
  }
  return map;
}

function openItemParts(ingredientId) {
  return db.prepare(`
    SELECT p.amount, p.unit FROM shopping_parts p
    JOIN shopping_items s ON s.id = p.item_id
    WHERE s.ingredient_id = ? AND s.done = 0`).all(ingredientId);
}

function hasOpenItem(ingredientId) {
  return !!db.prepare('SELECT 1 FROM shopping_items WHERE ingredient_id = ? AND done = 0').get(ingredientId);
}

// Náhled před přidáním: co je nové, co se přičte.
function preview(recipes) {
  const map = aggregateRecipes(recipes);
  const rows = [...map.values()].map((e) => {
    const existing = openItemParts(e.ingredient_id);
    const inList = hasOpenItem(e.ingredient_id);
    return {
      ingredient_id: e.ingredient_id,
      name: e.name,
      category: e.category,
      category_sort: e.category_sort,
      qty: formatParts(e.parts),
      existing: inList ? formatParts(existing) : null,
      result: inList ? formatParts([...existing, ...e.parts]) : null,
      status: inList ? 'merge' : 'new',
      pantry: e.pantry,
      include: !e.pantry,
      recipes: [...e.recipes],
    };
  });
  rows.sort((a, b) => a.category_sort - b.category_sort || a.name.localeCompare(b.name, 'cs'));
  return rows;
}

// Přidá díly k otevřené položce (nebo položku založí). Stejná surovina = jeden řádek.
function addParts(ingredientId, parts) {
  let item = db.prepare('SELECT id FROM shopping_items WHERE ingredient_id = ? AND done = 0').get(ingredientId);
  if (!item) {
    const info = db.prepare('INSERT INTO shopping_items (ingredient_id) VALUES (?)').run(ingredientId);
    item = { id: info.lastInsertRowid };
  }
  const ins = db.prepare('INSERT INTO shopping_parts (item_id, amount, unit, recipe_id) VALUES (?, ?, ?, ?)');
  for (const p of parts) {
    const n = normalize(p.amount, p.unit);
    ins.run(item.id, n.amount, n.unit, p.recipe_id || null);
  }
  return item.id;
}

const addRecipes = db.transaction((recipes, includeIds) => {
  const map = aggregateRecipes(recipes);
  const include = includeIds ? new Set(includeIds.map(Number)) : null;
  let added = 0;
  for (const e of map.values()) {
    if (include ? !include.has(e.ingredient_id) : e.pantry) continue;
    addParts(e.ingredient_id, e.parts);
    added++;
  }
  return added;
});

const addManual = db.transaction(({ ingredient_id, name, amount, unit }) => {
  const ing = ingredient_id
    ? db.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingredient_id)
    : (fuzzyFindIngredient(name) || findOrCreateIngredient(name));
  if (!ing) throw Object.assign(new Error('Surovina neexistuje'), { status: 404 });
  return addParts(ing.id, [{ amount: amount ?? null, unit: unit || '' }]);
});

function list() {
  const items = db.prepare(`
    SELECT s.id, s.ingredient_id, s.done, i.name, c.id AS category_id, c.name AS category, c.sort AS category_sort
    FROM shopping_items s
    JOIN ingredients i ON i.id = s.ingredient_id
    JOIN categories c ON c.id = i.category_id
    ORDER BY c.sort, i.name COLLATE NOCASE`).all();
  const partsStmt = db.prepare(`
    SELECT p.amount, p.unit, r.name AS recipe FROM shopping_parts p
    LEFT JOIN recipes r ON r.id = p.recipe_id WHERE p.item_id = ?`);
  const open = [];
  const done = [];
  const groups = new Map();
  for (const it of items) {
    const parts = partsStmt.all(it.id);
    const recipes = [...new Set(parts.map((p) => p.recipe).filter(Boolean))];
    const row = {
      id: it.id, ingredient_id: it.ingredient_id, name: it.name, category_id: it.category_id, category: it.category,
      qty: formatParts(parts), recipes, done: !!it.done,
    };
    if (it.done) { done.push(row); continue; }
    open.push(row);
    if (!groups.has(it.category)) groups.set(it.category, { category: it.category, category_id: it.category_id, items: [] });
    groups.get(it.category).items.push(row);
  }
  return { groups: [...groups.values()], done, open_count: open.length, done_count: done.length };
}

module.exports = { preview, addRecipes, addManual, list };
