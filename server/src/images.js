const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PHOTO_DIR } = require('./db');

const MAX = parseInt(process.env.PHOTO_MAX_PX || '1200', 10);
const THUMB = 480;

// Uloží fotku zmenšenou na MAX px (delší strana) + náhled. Vrací základ názvu souboru.
async function savePhoto(buffer, recipeId) {
  const base = `r${recipeId}-${Date.now()}`;
  const img = sharp(buffer, { failOn: 'none' }).rotate();
  await img.clone().resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 }).toFile(path.join(PHOTO_DIR, `${base}.webp`));
  await img.clone().resize({ width: THUMB, height: THUMB, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 }).toFile(path.join(PHOTO_DIR, `${base}-t.webp`));
  return base;
}

function deletePhoto(base) {
  if (!base || !/^r\d+-\d+$/.test(base)) return;
  for (const f of [`${base}.webp`, `${base}-t.webp`]) {
    fs.rm(path.join(PHOTO_DIR, f), { force: true }, () => {});
  }
}

function photoUrls(base) {
  if (!base) return { photo: null, thumb: null };
  return { photo: `/fotky/${base}.webp`, thumb: `/fotky/${base}-t.webp` };
}

module.exports = { savePhoto, deletePhoto, photoUrls };
