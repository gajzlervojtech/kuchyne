const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kuchyne-test-'));

const { formatParts, parseQuickText } = require('../src/units');
const { suggestCategoryName } = require('../src/catalog');
const { db, findOrCreateIngredient, fuzzyFindIngredient } = require('../src/db');
const shopping = require('../src/shopping');

test('jednotky se sčítají a převádí', () => {
  assert.strictEqual(formatParts([{ amount: 600, unit: 'g' }, { amount: 0.6, unit: 'kg' }]), '1,2 kg');
  assert.strictEqual(formatParts([{ amount: 200, unit: 'ml' }, { amount: 1, unit: 'dl' }]), '300 ml');
  assert.strictEqual(formatParts([{ amount: 400, unit: 'g' }, { amount: 1, unit: 'plech.' }]), '400 g + 1 plech.');
  assert.strictEqual(formatParts([{ amount: 2, unit: 'lžička' }, { amount: 3, unit: 'lžička' }]), '5 lžiček');
  assert.strictEqual(formatParts([{ amount: 3, unit: '' }, { amount: 2, unit: 'ks' }]), '5 ks');
  assert.strictEqual(formatParts([{ amount: null, unit: '' }]), '');
});

test('rychlé zadání v nákupu', () => {
  assert.deepStrictEqual(parseQuickText('2 l mléka'), { amount: 2, unit: 'l', name: 'mléka' });
  assert.deepStrictEqual(parseQuickText('500g mouky'), { amount: 500, unit: 'g', name: 'mouky' });
  assert.deepStrictEqual(parseQuickText('banány'), { amount: null, unit: '', name: 'banány' });
  assert.deepStrictEqual(parseQuickText('3 rajčata'), { amount: 3, unit: 'ks', name: 'rajčata' });
});

test('nové suroviny se zařadí do kategorie', () => {
  assert.strictEqual(suggestCategoryName('kardamom zelený'), 'Koření');
  assert.strictEqual(suggestCategoryName('mleté vepřové maso'), 'Maso a ryby');
  assert.strictEqual(suggestCategoryName('kokosové mléko'), 'Trvanlivé');
  assert.strictEqual(suggestCategoryName('hermelín'), 'Mléčné a vejce');
  assert.strictEqual(suggestCategoryName('batáty'), 'Zelenina a ovoce');
  assert.strictEqual(suggestCategoryName('mražené jahody'), 'Mražené');
  assert.strictEqual(suggestCategoryName('pistácie solené'), 'Trvanlivé');
});

test('volné hledání najde surovinu i v jiném tvaru', () => {
  assert.strictEqual(fuzzyFindIngredient('mléka').name, 'Mléko');
  assert.strictEqual(fuzzyFindIngredient('chleba').name, 'Chléb');
  assert.strictEqual(fuzzyFindIngredient('CIBULE').name, 'Cibule');
});

test('stejná surovina z více receptů je v nákupu jen jednou', () => {
  const add = (name, ings) => {
    const id = db.prepare('INSERT INTO recipes (name, servings) VALUES (?, 2)').run(name).lastInsertRowid;
    for (const [n, a, u] of ings) {
      db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit) VALUES (?, ?, ?, ?)').run(id, findOrCreateIngredient(n).id, a, u);
    }
    return id;
  };
  const a = add('A', [['cibule', 1, 'ks'], ['kuřecí prsa', 300, 'g'], ['sůl', 1, 'lžička']]);
  const b = add('B', [['Cibule', 2, 'ks'], ['Kuřecí prsa', 0.5, 'kg']]);
  shopping.addManual({ name: 'cibule', amount: 1, unit: 'ks' });

  const prev = shopping.preview([{ id: a, servings: 4 }, { id: b }]);
  const cib = prev.find((r) => r.name === 'Cibule');
  assert.strictEqual(cib.status, 'merge');
  assert.strictEqual(cib.qty, '4 ks');
  assert.strictEqual(cib.result, '5 ks');
  assert.strictEqual(prev.find((r) => r.name === 'Sůl').include, false);

  shopping.addRecipes([{ id: a, servings: 4 }, { id: b }]);
  const list = shopping.list();
  const all = list.groups.flatMap((g) => g.items);
  assert.strictEqual(all.filter((i) => i.name === 'Cibule').length, 1);
  assert.strictEqual(all.find((i) => i.name === 'Cibule').qty, '5 ks');
  assert.strictEqual(all.find((i) => i.name === 'Kuřecí prsa').qty, '1,1 kg');
  assert.ok(!all.find((i) => i.name === 'Sůl'));
  assert.deepStrictEqual(list.groups.map((g) => g.category), ['Zelenina a ovoce', 'Maso a ryby']);
});
