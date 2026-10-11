const express = require('express');
const multer = require('multer');
const { db, nameKey, cleanName, findOrCreateIngredient, fuzzyFindIngredient, categoryIdByName } = require('./db');
const { suggestCategoryName } = require('./catalog');
const { UNITS, canonicalUnit, parseQuickText } = require('./units');
const { savePhoto, deletePhoto, photoUrls } = require('./images');
const { getPlan, setCurrentWeek, planTags } = require('./plan');
const shopping = require('./shopping');
const backup = require('./backup');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const int = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));
const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// ---------- Kategorie a suroviny ----------

router.get('/meta', (req, res) => {
  res.json({
    categories: db.prepare('SELECT id, name, sort FROM categories ORDER BY sort').all(),
    units: UNITS,
  });
});

router.get('/ingredients', (req, res) => {
  const q = nameKey(req.query.q || '');
  if (!q) return res.json([]);
  const rows = db.prepare(`
    SELECT i.id, i.name, i.pantry, i.category_id, c.name AS category,
      CASE WHEN i.name_key = ? THEN 0 WHEN i.name_key LIKE ? THEN 1 ELSE 2 END AS rank
    FROM ingredients i JOIN categories c ON c.id = i.category_id
    WHERE i.name_key LIKE ?
    ORDER BY rank, length(i.name_key), i.name_key LIMIT 8`).all(q, `${q}%`, `%${q}%`);
  if (!rows.length) {
    const f = fuzzyFindIngredient(q);
    if (f) {
      const c = db.prepare('SELECT name FROM categories WHERE id = ?').get(f.category_id);
      rows.push({ id: f.id, name: f.name, pantry: f.pantry, category_id: f.category_id, category: c.name, rank: 3 });
    }
  }
  res.json(rows.map(({ rank, ...r }) => ({ ...r, pantry: !!r.pantry })));
});

router.get('/ingredients/suggest', (req, res) => {
  const name = req.query.name || '';
  const existing = db.prepare('SELECT id, category_id FROM ingredients WHERE name_key = ?').get(nameKey(name));
  if (existing) return res.json({ existing_id: existing.id, category_id: existing.category_id });
  res.json({ existing_id: null, category_id: categoryIdByName(suggestCategoryName(name)) });
});

router.get('/ingredients/all', (req, res) => {
  const rows = db.prepare(`
    SELECT i.id, i.name, i.pantry, i.category_id, c.name AS category,
      (SELECT COUNT(DISTINCT recipe_id) FROM recipe_ingredients WHERE ingredient_id = i.id) AS used
    FROM ingredients i JOIN categories c ON c.id = i.category_id
    ORDER BY c.sort, i.name_key`).all();
  res.json(rows.map((r) => ({ ...r, pantry: !!r.pantry })));
});

router.post('/ingredients', (req, res) => {
  const ing = findOrCreateIngredient(req.body.name, int(req.body.category_id));
  res.status(201).json(ing);
});

router.patch('/ingredients/:id', (req, res) => {
  const id = int(req.params.id);
  const ing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);
  if (!ing) return res.status(404).json({ error: 'Surovina nenalezena' });
  const { name, category_id, pantry } = req.body;
  if (name != null) {
    const key = nameKey(name);
    const clash = db.prepare('SELECT id FROM ingredients WHERE name_key = ? AND id <> ?').get(key, id);
    if (clash) return res.status(409).json({ error: 'Surovina s tímto názvem už existuje – použijte sloučení.', existing_id: clash.id });
    db.prepare('UPDATE ingredients SET name = ?, name_key = ? WHERE id = ?').run(cleanName(name), key, id);
  }
  if (category_id != null) db.prepare('UPDATE ingredients SET category_id = ? WHERE id = ?').run(int(category_id), id);
  if (pantry != null) db.prepare('UPDATE ingredients SET pantry = ? WHERE id = ?').run(pantry ? 1 : 0, id);
  res.json(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id));
});

// Sloučí duplicitní surovinu do jiné (recepty i nákup se přepojí).
router.post('/ingredients/:id/merge', (req, res) => {
  const from = int(req.params.id);
  const into = int(req.body.into);
  if (!from || !into || from === into) return res.status(400).json({ error: 'Neplatné sloučení' });
  db.transaction(() => {
    db.prepare('UPDATE recipe_ingredients SET ingredient_id = ? WHERE ingredient_id = ?').run(into, from);
    const openFrom = db.prepare('SELECT id FROM shopping_items WHERE ingredient_id = ? AND done = 0').get(from);
    const openInto = db.prepare('SELECT id FROM shopping_items WHERE ingredient_id = ? AND done = 0').get(into);
    if (openFrom && openInto) {
      db.prepare('UPDATE shopping_parts SET item_id = ? WHERE item_id = ?').run(openInto.id, openFrom.id);
      db.prepare('DELETE FROM shopping_items WHERE id = ?').run(openFrom.id);
    }
    db.prepare('UPDATE shopping_items SET ingredient_id = ? WHERE ingredient_id = ?').run(into, from);
    db.prepare('DELETE FROM ingredients WHERE id = ?').run(from);
  })();
  res.json({ ok: true });
});

router.delete('/ingredients/:id', (req, res) => {
  const id = int(req.params.id);
  const used = db.prepare('SELECT COUNT(*) AS n FROM recipe_ingredients WHERE ingredient_id = ?').get(id).n
    + db.prepare('SELECT COUNT(*) AS n FROM shopping_items WHERE ingredient_id = ?').get(id).n;
  if (used) return res.status(409).json({ error: 'Surovina se používá v receptu nebo v nákupu.' });
  db.prepare('DELETE FROM ingredients WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------- Recepty ----------

function recipeListRow(r, tags) {
  return {
    id: r.id, name: r.name, kind: r.kind, servings: r.servings,
    total_min: (r.prep_min || 0) + (r.cook_min || 0) || null,
    tags: tags.has(r.id) ? [...tags.get(r.id)] : [],
    ...photoUrls(r.photo),
  };
}

router.get('/recipes', (req, res) => {
  const { kind } = req.query;
  const q = nameKey(req.query.q || '');
  const params = [];
  let where = '1=1';
  if (kind === 'hlavni' || kind === 'dezert') { where += ' AND r.kind = ?'; params.push(kind); }
  const rows = db.prepare(`SELECT r.* FROM recipes r WHERE ${where}`).all(...params)
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  // SQLite neumí malá/velká písmena s diakritikou → hledání (název i suroviny) děláme v JS
  const tags = planTags();
  let filtered = rows;
  if (q) {
    const byIng = new Set(db.prepare(`SELECT DISTINCT ri.recipe_id FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id WHERE instr(i.name_key, ?) > 0`).all(q).map((x) => x.recipe_id));
    filtered = rows.filter((r) => nameKey(r.name).includes(q) || byIng.has(r.id));
  }
  const counts = Object.fromEntries(db.prepare('SELECT kind, COUNT(*) AS n FROM recipes GROUP BY kind').all().map((c) => [c.kind, c.n]));
  res.json({ recipes: filtered.map((r) => recipeListRow(r, tags)), counts: { hlavni: counts.hlavni || 0, dezert: counts.dezert || 0 } });
});

function fullRecipe(id) {
  const r = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  if (!r) return null;
  const ingredients = db.prepare(`
    SELECT ri.id, ri.ingredient_id, ri.amount, ri.unit, ri.note, i.name, i.pantry, c.name AS category
    FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id JOIN categories c ON c.id = i.category_id
    WHERE ri.recipe_id = ? ORDER BY ri.sort, ri.id`).all(id).map((x) => ({ ...x, pantry: !!x.pantry }));
  const tags = planTags();
  const openIds = new Set(db.prepare('SELECT ingredient_id FROM shopping_items WHERE done = 0').all().map((x) => x.ingredient_id));
  return {
    ...r, ...photoUrls(r.photo), photo_base: r.photo,
    tags: tags.has(r.id) ? [...tags.get(r.id)] : [],
    ingredients: ingredients.map((i) => ({ ...i, in_list: openIds.has(i.ingredient_id) })),
  };
}

router.get('/recipes/:id', (req, res) => {
  const r = fullRecipe(int(req.params.id));
  if (!r) return res.status(404).json({ error: 'Recept nenalezen' });
  res.json(r);
});

function parseRecipeBody(req) {
  const data = req.body.data ? JSON.parse(req.body.data) : req.body;
  const name = String(data.name || '').trim();
  if (!name) throw Object.assign(new Error('Recept musí mít název'), { status: 400 });
  return {
    name,
    kind: data.kind === 'dezert' ? 'dezert' : 'hlavni',
    servings: Math.max(1, int(data.servings) || 4),
    prep_min: int(data.prep_min),
    cook_min: int(data.cook_min),
    steps: String(data.steps || ''),
    note: String(data.note || ''),
    remove_photo: !!data.remove_photo,
    ingredients: (Array.isArray(data.ingredients) ? data.ingredients : [])
      .filter((i) => i && (i.ingredient_id || String(i.name || '').trim())),
  };
}

function saveIngredients(recipeId, items) {
  db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);
  const ins = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, note, sort) VALUES (?, ?, ?, ?, ?, ?)');
  items.forEach((i, idx) => {
    let ingId = int(i.ingredient_id);
    if (!ingId || !db.prepare('SELECT 1 FROM ingredients WHERE id = ?').get(ingId)) {
      ingId = findOrCreateIngredient(i.name, int(i.category_id)).id;
    }
    ins.run(recipeId, ingId, numOrNull(i.amount), canonicalUnit(i.unit), String(i.note || ''), idx);
  });
}

router.post('/recipes', upload.single('photo'), wrap(async (req, res) => {
  const d = parseRecipeBody(req);
  const id = db.transaction(() => {
    const info = db.prepare(`INSERT INTO recipes (name, kind, servings, prep_min, cook_min, steps, note) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(d.name, d.kind, d.servings, d.prep_min, d.cook_min, d.steps, d.note);
    saveIngredients(info.lastInsertRowid, d.ingredients);
    return info.lastInsertRowid;
  })();
  if (req.file) {
    const base = await savePhoto(req.file.buffer, id);
    db.prepare('UPDATE recipes SET photo = ? WHERE id = ?').run(base, id);
  }
  res.status(201).json(fullRecipe(id));
}));

router.put('/recipes/:id', upload.single('photo'), wrap(async (req, res) => {
  const id = int(req.params.id);
  const existing = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Recept nenalezen' });
  const d = parseRecipeBody(req);
  db.transaction(() => {
    db.prepare(`UPDATE recipes SET name=?, kind=?, servings=?, prep_min=?, cook_min=?, steps=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(d.name, d.kind, d.servings, d.prep_min, d.cook_min, d.steps, d.note, id);
    saveIngredients(id, d.ingredients);
  })();
  if (req.file) {
    const base = await savePhoto(req.file.buffer, id);
    db.prepare('UPDATE recipes SET photo = ? WHERE id = ?').run(base, id);
    deletePhoto(existing.photo);
  } else if (d.remove_photo && existing.photo) {
    db.prepare('UPDATE recipes SET photo = NULL WHERE id = ?').run(id);
    deletePhoto(existing.photo);
  }
  res.json(fullRecipe(id));
}));

router.patch('/recipes/:id/note', (req, res) => {
  db.prepare('UPDATE recipes SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(String(req.body.note || ''), int(req.params.id));
  res.json({ ok: true });
});

router.delete('/recipes/:id', (req, res) => {
  const id = int(req.params.id);
  const r = db.prepare('SELECT photo FROM recipes WHERE id = ?').get(id);
  if (!r) return res.status(404).json({ error: 'Recept nenalezen' });
  db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
  deletePhoto(r.photo);
  res.json({ ok: true });
});

// ---------- Plán ----------

router.get('/plan', (req, res) => res.json(getPlan()));

router.put('/plan/weekday/:week/:day', (req, res) => {
  const week = int(req.params.week); const day = int(req.params.day);
  if (!(week >= 1 && week <= 4 && day >= 1 && day <= 5)) return res.status(400).json({ error: 'Neplatný den' });
  db.prepare('UPDATE plan_weekday SET recipe_id = ? WHERE week = ? AND day = ?').run(int(req.body.recipe_id), week, day);
  res.json(getPlan());
});

router.put('/plan/weekend/:slot', (req, res) => {
  const slot = int(req.params.slot);
  if (!(slot >= 1 && slot <= 12)) return res.status(400).json({ error: 'Neplatné pole' });
  db.prepare('UPDATE weekend_meals SET recipe_id = ? WHERE slot = ?').run(int(req.body.recipe_id), slot);
  res.json(getPlan());
});

router.put('/plan/weekend-choice/:day', (req, res) => {
  const day = req.params.day;
  if (!['so', 'ne'].includes(day)) return res.status(400).json({ error: 'Neplatný den' });
  db.prepare('UPDATE weekend_choice SET recipe_id = ? WHERE day = ?').run(int(req.body.recipe_id), day);
  res.json(getPlan());
});

router.put('/plan/current-week', (req, res) => {
  const w = int(req.body.week);
  if (!(w >= 1 && w <= 4)) return res.status(400).json({ error: 'Týden 1–4' });
  setCurrentWeek(w);
  res.json(getPlan());
});

// ---------- Nákup ----------

// recipes: [{id, servings?}] | week: 1-4 | weekend: true
function resolveRecipeSet(body) {
  if (Array.isArray(body.recipes)) return body.recipes.map((r) => ({ id: int(r.id), servings: int(r.servings) }));
  if (body.week) {
    return db.prepare('SELECT recipe_id FROM plan_weekday WHERE week = ? AND recipe_id IS NOT NULL').all(int(body.week)).map((r) => ({ id: r.recipe_id }));
  }
  if (body.weekend) {
    return db.prepare('SELECT recipe_id FROM weekend_choice WHERE recipe_id IS NOT NULL').all().map((r) => ({ id: r.recipe_id }));
  }
  return [];
}

router.get('/shopping', (req, res) => res.json(shopping.list()));

router.post('/shopping/preview', (req, res) => res.json(shopping.preview(resolveRecipeSet(req.body))));

router.post('/shopping/add-recipes', (req, res) => {
  const added = shopping.addRecipes(resolveRecipeSet(req.body), req.body.include || null);
  res.json({ added, ...shopping.list() });
});

router.post('/shopping', (req, res) => {
  const b = req.body;
  let payload;
  if (b.ingredient_id) payload = { ingredient_id: int(b.ingredient_id), amount: numOrNull(b.amount), unit: canonicalUnit(b.unit) };
  else {
    const p = parseQuickText(b.text || b.name);
    if (!p.name) return res.status(400).json({ error: 'Prázdná položka' });
    payload = { name: p.name, amount: b.amount != null ? numOrNull(b.amount) : p.amount, unit: b.unit ? canonicalUnit(b.unit) : p.unit };
  }
  shopping.addManual(payload);
  res.status(201).json(shopping.list());
});

router.patch('/shopping/:id', (req, res) => {
  const id = int(req.params.id);
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'Položka nenalezena' });
  const done = req.body.done ? 1 : 0;
  db.transaction(() => {
    if (!done) {
      const open = db.prepare('SELECT id FROM shopping_items WHERE ingredient_id = ? AND done = 0 AND id <> ?').get(item.ingredient_id, id);
      if (open) { // vrácení z košíku – sloučit s otevřenou položkou
        db.prepare('UPDATE shopping_parts SET item_id = ? WHERE item_id = ?').run(open.id, id);
        db.prepare('DELETE FROM shopping_items WHERE id = ?').run(id);
        return;
      }
    }
    db.prepare('UPDATE shopping_items SET done = ? WHERE id = ?').run(done, id);
  })();
  res.json(shopping.list());
});

router.delete('/shopping/done', (req, res) => {
  db.prepare('DELETE FROM shopping_items WHERE done = 1').run();
  res.json(shopping.list());
});

router.delete('/shopping/:id', (req, res) => {
  db.prepare('DELETE FROM shopping_items WHERE id = ?').run(int(req.params.id));
  res.json(shopping.list());
});

// ---------- Záloha ----------

router.get('/backup', (req, res) => res.json(backup.status()));
router.post('/backup', wrap(async (req, res) => {
  await backup.run();
  res.json(backup.status());
}));

module.exports = router;
