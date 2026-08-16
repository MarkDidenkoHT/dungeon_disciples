const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const routes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const CODE_FILE = /\.(?:js|mjs|css|html)$/i;

const ART_PATH = /[\\/]assets[\\/](?:character_art|character_portraits|character_sprites|crests|icons[\\/](?:items|abilities|spells|recources))[\\/]/i;
const ART_CACHE = 'public, max-age=2592000, immutable';
const NO_CACHE = process.env.NO_CACHE
  ? process.env.NO_CACHE !== '0'
  : process.env.NODE_ENV !== 'production';
const staticOpts = NO_CACHE
  ? {
      etag: false,
      lastModified: false,
      maxAge: 0,
      setHeaders(res, filePath) {

        if (ART_PATH.test(filePath)) {
          res.setHeader('Cache-Control', ART_CACHE);
          return;
        }
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      },
    }
  : {
      maxAge: '1d',
      setHeaders(res, filePath) {
        if (ART_PATH.test(filePath)) return res.setHeader('Cache-Control', ART_CACHE);
        if (CODE_FILE.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
      },
    };
if (NO_CACHE) console.log('Static caching DISABLED (dev mode)');

const BUILD_ID =
  (process.env.BUILD_TAG || '').trim() ||
  (process.env.RENDER_GIT_COMMIT || '').slice(0, 8) ||
  Date.now().toString(36);
const BUILD_ID_SOURCE = process.env.BUILD_TAG
  ? 'BUILD_TAG'
  : process.env.RENDER_GIT_COMMIT
    ? 'RENDER_GIT_COMMIT'
    : 'boot timestamp (fallback)';
console.log(`Build id: ${BUILD_ID}  [from ${BUILD_ID_SOURCE}]`);

app.use('/v/:build/public', express.static(path.join(__dirname, 'public'), staticOpts));
app.use('/v/:build/data',   express.static(path.join(__dirname, 'data'),   staticOpts));

const INDEX_FILE = path.join(__dirname, 'public', 'index.html');
app.get(['/', '/index.html'], (req, res, next) => {
  fs.readFile(INDEX_FILE, 'utf8', (err, html) => {
    if (err) return next(err);
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'text/html; charset=utf-8',
    });
    res.send(html.replace(/<head>/i, `<head>\n  <base href="/v/${BUILD_ID}/public/">`));
  });
});


app.use('/data', express.static(path.join(__dirname, 'data'), staticOpts));
app.use(express.static(path.join(__dirname, 'public'), staticOpts));

console.log('Mounting API routes at /api');
app.use('/api', rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
}), routes);

app.get('*', (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));