// Jednotky a jejich sčítání.
// g/kg/dag a ml/dl/l se převádí na základní jednotku, ostatní se sčítají jen se stejnou jednotkou.

const UNITS = ['g', 'kg', 'ml', 'dl', 'l', 'ks', 'lžíce', 'lžička', 'hrnek', 'plech.', 'balení', 'stroužek', 'svazek', 'hrst', 'plátek', 'špetka'];

const FAMILY = {
  g: ['g', 1], dag: ['g', 10], kg: ['g', 1000],
  ml: ['ml', 1], dl: ['ml', 100], l: ['ml', 1000],
};

const ALIASES = {
  gram: 'g', gramy: 'g', gramů: 'g', kila: 'kg', kilo: 'kg',
  litr: 'l', litry: 'l', litrů: 'l', kus: 'ks', kusy: 'ks', kusů: 'ks', 'ks.': 'ks',
  lzice: 'lžíce', lžíci: 'lžíce', lžic: 'lžíce', 'lž': 'lžíce', lzicka: 'lžička', lžičky: 'lžička', lžiček: 'lžička', 'lžič': 'lžička',
  plechovka: 'plech.', plechovky: 'plech.', plech: 'plech.', bal: 'balení', 'bal.': 'balení',
  stroužky: 'stroužek', stroužků: 'stroužek', svazky: 'svazek', plátky: 'plátek', hrnky: 'hrnek',
};

function canonicalUnit(u) {
  if (!u) return '';
  const s = String(u).trim().toLowerCase();
  if (UNITS.includes(s) || FAMILY[s]) return s;
  return ALIASES[s] || s;
}

function normalize(amount, unit) {
  let u = canonicalUnit(unit);
  if (u === '' && amount != null) u = 'ks'; // „3 rajčata“ = 3 ks
  const f = FAMILY[u];
  if (f && amount != null) return { amount: amount * f[1], unit: f[0] };
  return { amount: amount == null ? null : amount, unit: u };
}

function num(n) {
  const r = Math.round(n * 100) / 100;
  return String(r).replace('.', ',');
}

// české tvary: 1 lžíce, 2 lžíce, 5 lžic …
const PLURAL = {
  'lžíce': ['lžíce', 'lžíce', 'lžic'], 'lžička': ['lžička', 'lžičky', 'lžiček'], hrnek: ['hrnek', 'hrnky', 'hrnků'],
  'stroužek': ['stroužek', 'stroužky', 'stroužků'], svazek: ['svazek', 'svazky', 'svazků'], 'plátek': ['plátek', 'plátky', 'plátků'],
  hrst: ['hrst', 'hrsti', 'hrstí'], 'špetka': ['špetka', 'špetky', 'špetek'],
};
function unitWord(unit, amount) {
  const f = PLURAL[unit];
  if (!f || amount == null) return unit;
  if (amount === 1) return f[0];
  if (Number.isInteger(amount) && amount >= 2 && amount <= 4) return f[1];
  if (!Number.isInteger(amount)) return f[1];
  return f[2];
}

function formatOne({ amount, unit }) {
  if (amount == null) return unit || '';
  if (unit === 'g' && amount >= 1000) return `${num(amount / 1000)} kg`;
  if (unit === 'ml' && amount >= 1000) return `${num(amount / 1000)} l`;
  return unit ? `${num(amount)} ${unitWord(unit, Math.round(amount * 100) / 100)}` : num(amount);
}

// parts: [{amount, unit}] -> [{amount, unit}] sečtené po jednotkách
function sumParts(parts) {
  const map = new Map();
  for (const p of parts) {
    const n = normalize(p.amount, p.unit);
    const key = n.unit;
    if (!map.has(key)) map.set(key, { amount: null, unit: key });
    const cur = map.get(key);
    if (n.amount != null) cur.amount = (cur.amount || 0) + n.amount;
  }
  // bez množství a bez jednotky nezobrazujeme, pokud existuje jiné množství
  const out = [...map.values()].filter((x) => !(x.amount == null && x.unit === '' && map.size > 1));
  return out;
}

function formatParts(parts) {
  return sumParts(parts).map(formatOne).filter(Boolean).join(' + ');
}

// "2 l mléka", "500g mouky", "mléko"
function parseQuickText(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*([^\d\s]+\.?)?\s+(.+)$/) || t.match(/^(\d+(?:[.,]\d+)?)([a-zA-Z]+)\s+(.+)$/);
  if (m) {
    const amount = parseFloat(m[1].replace(',', '.'));
    const unitRaw = m[2] ? canonicalUnit(m[2]) : '';
    const known = UNITS.includes(unitRaw) || FAMILY[unitRaw];
    if (known) return { amount, unit: unitRaw, name: m[3] };
    // "3 rajčata" -> 3 ks
    return { amount, unit: 'ks', name: m[2] ? `${m[2]} ${m[3]}` : m[3] };
  }
  return { amount: null, unit: '', name: t };
}

module.exports = { UNITS, canonicalUnit, normalize, sumParts, formatOne, formatParts, parseQuickText };
