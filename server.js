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

// Static assets are served with a cache lifetime so a returning player does not
// re-fetch ~27 MB of art on every launch. Not `immutable`: filenames are not
// content-hashed, so replacing an image has to be able to take effect — a day
// is the compromise between that and the bandwidth.
// ...with one exception: CODE. Art can go stale for a day without anyone
// noticing, but a cached .js/.css means a deployed fix simply does not arrive —
// the browser keeps running yesterday's module and never asks for a new one.
// `no-cache` does not mean "do not store", it means "revalidate before use", so
// these still cost only a 304 when unchanged.
//
// While the game is in active development the art churns as fast as the code
// does, and a Telegram WebView gives the player no way to force a reload — so
// the whole 1d story is switched off unless we are explicitly in production.
// Set NODE_ENV=production (or NO_CACHE=0) to get the bandwidth saving back.
const CODE_FILE = /\.(?:js|mjs|css|html)$/i;
const NO_CACHE = process.env.NO_CACHE
  ? process.env.NO_CACHE !== '0'
  : process.env.NODE_ENV !== 'production';
const staticOpts = NO_CACHE
  ? {
      etag: false,
      lastModified: false,
      maxAge: 0,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      },
    }
  : {
      maxAge: '1d',
      setHeaders(res, filePath) {
        if (CODE_FILE.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
      },
    };
if (NO_CACHE) console.log('Static caching DISABLED (dev mode)');

// ── Build-versioned asset URLs ──────────────────────────────────────────────
// Cache headers alone were not enough. Telegram's WebView keeps its own asset
// store and does not reliably honour revalidation, so a deploy would land on
// Render, serve correctly to a normal browser, and STILL replay yesterday's
// style.css inside Telegram — with no Ctrl+F5 available to break out of it.
// Worse, entries cached before `no-store` shipped stay cached: a header change
// cannot evict what is already stored.
//
// So the fix is to stop asking for the same URL twice. Every build serves its
// code from a path nobody has requested before, which a cache cannot possibly
// have a stale copy of. RENDER_GIT_COMMIT changes on every Render deploy; the
// boot timestamp is the local fallback.
const BUILD_ID = (process.env.RENDER_GIT_COMMIT || '').slice(0, 8) || Date.now().toString(36);
console.log('Build id:', BUILD_ID);

// The nesting (/v/:build/public/... rather than /v/:build/...) is load-bearing,
// not decoration. Modules import across the public/data boundary with paths
// like `../../data/units.js` from public/screens/. That needs TWO real
// directory levels above the importer to climb, or the specifier resolves off
// the top of the versioned prefix and lands on an unversioned path.
app.use('/v/:build/public', express.static(path.join(__dirname, 'public'), staticOpts));
app.use('/v/:build/data',   express.static(path.join(__dirname, 'data'),   staticOpts));

// index.html is rewritten in flight to point at the current build, and is the
// one response that must NEVER be cached under any setting — a stored copy
// would pin an old BUILD_ID permanently and defeat the whole mechanism.
// `<base>` only redirects the RELATIVE refs (style.css, main.js and the module
// graph below them). Root-absolute URLs are untouched, which is why /assets/…
// in the CSS and /api/… in api.js keep working off the plain mounts below.
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

// Unversioned mounts stay: they serve /assets/… (referenced absolutely from the
// CSS) and keep any direct link to the old paths working.
app.use('/data', express.static(path.join(__dirname, 'data'), staticOpts));
app.use(express.static(path.join(__dirname, 'public'), staticOpts));

// Rate limiting applies to the API ONLY, and is mounted after the static
// middleware so images never reach it.
//
// This was previously app.use(...) ahead of everything, which counted every
// static file against the budget. The preload alone requests ~486 images, so a
// single cold launch blew through a 400/minute allowance before the player had
// done anything — the limit appeared "too low" when the real problem was that
// it was policing artwork.
console.log('Mounting API routes at /api');
app.use('/api', rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,   // RateLimit-* headers, so the client can see the ceiling
  legacyHeaders: false,
}), routes);

app.get('*', (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));