const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { CATEGORIES, SEED, PANTRY, suggestCategoryName } = require('./catalog');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'fotky');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'kuchyne.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Klíč pro porovnání názvů surovin: malá písmena, jedna mezera.
function nameKey(name) {
  return String(name || '').toLocaleLowerCase('cs').trim().replace(/\s+/g, ' ');
}

function cleanName(name) {
  const s = String(name || '').trim().replace(/\s+/g, ' ');
  return s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);
}

const MIGRATIONS = [
  // v1
  `
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort INTEGER NOT NULL
  );
  CREATE TABLE ingredients (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    pantry INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE recipes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'hlavni' CHECK (kind IN ('hlavni','dezert')),
    servings INTEGER NOT NULL DEFAULT 4,
    prep_min INTEGER,
    cook_min INTEGER,
    steps TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    photo TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE recipe_ingredients (
    id INTEGER PRIMARY KEY,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    amount REAL,
    unit TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX ri_recipe ON recipe_ingredients(recipe_id);
  CREATE INDEX ri_ingredient ON recipe_ingredients(ingredient_id);

  CREATE TABLE plan_weekday (
    week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 4),
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 5),
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    PRIMARY KEY (week, day)
  );
  CREATE TABLE weekend_meals (
    slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 12),
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL
  );
  CREATE TABLE weekend_choice (
    day TEXT PRIMARY KEY CHECK (day IN ('so','ne')),
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL
  );

  CREATE TABLE shopping_items (
    id INTEGER PRIMARY KEY,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX shopping_open ON shopping_items(ingredient_id) WHERE done = 0;
  CREATE TABLE shopping_parts (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES shopping_items(id) ON DELETE CASCADE,
    amount REAL,
    unit TEXT NOT NULL DEFAULT '',
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL
  );

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  `,
];

function migrate() {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (count > 0) return;
  db.transaction(() => {
    const insCat = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)');
    CATEGORIES.forEach((c, i) => insCat.run(c, i));
    const catId = Object.fromEntries(db.prepare('SELECT id, name FROM categories').all().map((r) => [r.name, r.id]));
    const insIng = db.prepare('INSERT OR IGNORE INTO ingredients (name, name_key, category_id, pantry) VALUES (?, ?, ?, ?)');
    for (const [cat, names] of Object.entries(SEED)) {
      for (const n of names) insIng.run(cleanName(n), nameKey(n), catId[cat], PANTRY.has(n) || cat === 'Koření' ? 1 : 0);
    }
    const insW = db.prepare('INSERT INTO plan_weekday (week, day, recipe_id) VALUES (?, ?, NULL)');
    for (let w = 1; w <= 4; w++) for (let d = 1; d <= 5; d++) insW.run(w, d);
    const insS = db.prepare('INSERT INTO weekend_meals (slot, recipe_id) VALUES (?, NULL)');
    for (let s = 1; s <= 12; s++) insS.run(s);
    db.prepare("INSERT INTO weekend_choice (day) VALUES ('so'), ('ne')").run();
  })();
}

migrate();
seed();

function getSetting(key, fallback = null) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? r.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

function categoryIdByName(name) {
  const r = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  return r ? r.id : db.prepare("SELECT id FROM categories WHERE name = 'Ostatní'").get().id;
}

// Najde surovinu podle názvu, případně ji založí (s odhadnutou nebo zadanou kategorií).
function findOrCreateIngredient(name, categoryId) {
  const key = nameKey(name);
  if (!key) throw Object.assign(new Error('Prázdný název suroviny'), { status: 400 });
  const found = db.prepare('SELECT * FROM ingredients WHERE name_key = ?').get(key);
  if (found) return found;
  const suggested = suggestCategoryName(key);
  const cat = categoryId || categoryIdByName(suggested);
  const catRow = db.prepare('SELECT name FROM categories WHERE id = ?').get(cat);
  const pantry = catRow && catRow.name === 'Koření' ? 1 : 0;
  const info = db.prepare('INSERT INTO ingredients (name, name_key, category_id, pantry) VALUES (?, ?, ?, ?)').run(cleanName(name), key, cat, pantry);
  return db.prepare('SELECT * FROM ingredients WHERE id = ?').get(info.lastInsertRowid);
}

// Volné hledání pro rychlé přidání do nákupu: „mléka“ → Mléko, „jablek“ → Jablka.
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function fuzzyFindIngredient(name) {
  const key = nameKey(name);
  const exact = db.prepare('SELECT * FROM ingredients WHERE name_key = ?').get(key);
  if (exact) return exact;
  const all = db.prepare('SELECT * FROM ingredients').all();
  const plain = strip(key);
  const same = all.find((i) => strip(i.name_key) === plain);
  if (same) return same;
  const words = plain.split(' ');
  const last = words[words.length - 1];
  for (const cut of [1, 2]) {
    const stemLast = last.slice(0, last.length - cut);
    if (stemLast.length < 3) break;
    const prefix = [...words.slice(0, -1), stemLast].join(' ');
    if (prefix.length < 4) break;
    const rows = all.filter((i) => strip(i.name_key).startsWith(prefix));
    if (rows.length) {
      rows.sort((a, b) => (a.name_key.split(' ').length !== words.length) - (b.name_key.split(' ').length !== words.length)
        || a.name_key.length - b.name_key.length);
      return rows[0];
    }
  }
  return null;
}

module.exports = { db, DATA_DIR, PHOTO_DIR, nameKey, cleanName, getSetting, setSetting, categoryIdByName, findOrCreateIngredient, fuzzyFindIngredient };
