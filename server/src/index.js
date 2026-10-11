const path = require('path');
const fs = require('fs');
const express = require('express');
const { PHOTO_DIR } = require('./db');
const api = require('./api');
const backup = require('./backup');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/api', api);
app.use('/fotky', express.static(PHOTO_DIR, { maxAge: '30d', immutable: true }));

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api|fotky).*/, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
}

// chyby
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Chyba serveru' : err.message });
});

app.listen(PORT, () => {
  console.log(`Naše kuchyně běží na portu ${PORT}`);
  backup.schedule();
});
