const { db, getSetting, setSetting } = require('./db');
const { photoUrls } = require('./images');

const DAY = 24 * 3600 * 1000;

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // po = 0
  d.setDate(d.getDate() - dow);
  return d;
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rotationStart() {
  let s = getSetting('rotation_start');
  if (!s) {
    s = iso(mondayOf(new Date()));
    setSetting('rotation_start', s);
  }
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function weekNumberFor(date) {
  const diff = Math.round((mondayOf(date) - rotationStart()) / (7 * DAY));
  return (((diff % 4) + 4) % 4) + 1;
}

// „Tento týden je Týden N“ – posune začátek rotace.
function setCurrentWeek(n) {
  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() - (n - 1) * 7);
  setSetting('rotation_start', iso(monday));
}

function recipeBrief(id) {
  if (!id) return null;
  const r = db.prepare('SELECT id, name, photo, prep_min, cook_min FROM recipes WHERE id = ?').get(id);
  if (!r) return null;
  return { id: r.id, name: r.name, ...photoUrls(r.photo) };
}

function getPlan() {
  const now = new Date();
  const current = weekNumberFor(now);
  const nextMonday = mondayOf(now);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const thisMonday = mondayOf(now);
  const friday = new Date(thisMonday); friday.setDate(friday.getDate() + 4);
  const saturday = new Date(thisMonday); saturday.setDate(saturday.getDate() + 5);
  const sunday = new Date(thisMonday); sunday.setDate(sunday.getDate() + 6);

  const cells = db.prepare('SELECT week, day, recipe_id FROM plan_weekday ORDER BY week, day').all();
  const weeks = [1, 2, 3, 4].map((w) => ({
    week: w,
    days: cells.filter((c) => c.week === w).map((c) => ({ day: c.day, recipe: recipeBrief(c.recipe_id) })),
  }));
  const slots = db.prepare('SELECT slot, recipe_id FROM weekend_meals ORDER BY slot').all()
    .map((s) => ({ slot: s.slot, recipe: recipeBrief(s.recipe_id) }));
  const choice = Object.fromEntries(db.prepare('SELECT day, recipe_id FROM weekend_choice').all()
    .map((c) => [c.day, recipeBrief(c.recipe_id)]));

  return {
    current_week: current,
    next_week: weekNumberFor(nextMonday),
    today_dow: (now.getDay() + 6) % 7 + 1, // 1 = po … 7 = ne
    this_week: { from: iso(thisMonday), to: iso(friday) },
    weekend: { from: iso(saturday), to: iso(sunday) },
    weeks,
    weekend_slots: slots,
    weekend_choice: { so: choice.so || null, ne: choice.ne || null },
  };
}

// Kde všude je recept v plánu (pro štítky „Týden 2“, „Víkend“)
function planTags() {
  const tags = new Map();
  const add = (id, t) => {
    if (!id) return;
    if (!tags.has(id)) tags.set(id, new Set());
    tags.get(id).add(t);
  };
  for (const c of db.prepare('SELECT week, recipe_id FROM plan_weekday').all()) add(c.recipe_id, `Týden ${c.week}`);
  for (const s of db.prepare('SELECT recipe_id FROM weekend_meals').all()) add(s.recipe_id, 'Víkend');
  return tags;
}

module.exports = { getPlan, setCurrentWeek, planTags, weekNumberFor };
