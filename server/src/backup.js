// Měsíční záloha: kopie databáze + fotek do BACKUP_DIR (na NASu složka na RAID 1).
const fs = require('fs');
const path = require('path');
const { db, PHOTO_DIR, getSetting, setSetting } = require('./db');

const BACKUP_DIR = process.env.BACKUP_DIR || '';
const EVERY_DAYS = parseInt(process.env.BACKUP_EVERY_DAYS || '30', 10);
const KEEP = parseInt(process.env.BACKUP_KEEP || '6', 10);

let running = null;

function status() {
  const last = getSetting('last_backup');
  let next = null;
  if (last) next = new Date(new Date(last).getTime() + EVERY_DAYS * 864e5).toISOString();
  return { enabled: !!BACKUP_DIR, dir: BACKUP_DIR || null, last, next, every_days: EVERY_DAYS, keep: KEEP };
}

async function run() {
  if (!BACKUP_DIR) throw Object.assign(new Error('Záloha není nastavená (chybí BACKUP_DIR)'), { status: 400 });
  if (running) return running;
  running = (async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const target = path.join(BACKUP_DIR, `kuchyne-${stamp}`);
    fs.mkdirSync(target, { recursive: true });
    await db.backup(path.join(target, 'kuchyne.db'));
    fs.cpSync(PHOTO_DIR, path.join(target, 'fotky'), { recursive: true });
    setSetting('last_backup', new Date().toISOString());
    // smazat staré zálohy
    const dirs = fs.readdirSync(BACKUP_DIR).filter((d) => /^kuchyne-\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    for (const d of dirs.slice(0, Math.max(0, dirs.length - KEEP))) fs.rmSync(path.join(BACKUP_DIR, d), { recursive: true, force: true });
    console.log(`Záloha hotová: ${target}`);
  })();
  try { await running; } finally { running = null; }
}

function schedule() {
  if (!BACKUP_DIR) return;
  const check = () => {
    const last = getSetting('last_backup');
    const due = !last || Date.now() - new Date(last).getTime() >= EVERY_DAYS * 864e5;
    if (due) run().catch((e) => console.error('Záloha selhala:', e.message));
  };
  setTimeout(check, 60 * 1000); // minutu po startu
  setInterval(check, 6 * 3600 * 1000).unref(); // pak každých 6 h kontrola
}

module.exports = { status, run, schedule };
