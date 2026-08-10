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

// ── Heavy art: cached hard, on purpose, in dev as well as production ─────────
// These three folders are the bandwidth. Every roster/castle/battle screen pulls
// dozens of portraits and item icons, they are the largest files we serve, and
// unlike UI chrome they are effectively append-only: new units and items get NEW
// filenames, existing art almost never changes under the same name.
//
// So they opt out of the no-store dev rule entirely and get a month of
// `immutable` — the client is told never to even ask again. That is the whole
// point: a revalidation is still a round trip per image, and with a hundred
// images on screen the 304s alone are the slow part on mobile.
//
// The cost of that deal: REPLACING art in place will not reach anyone who has
// already loaded it, for up to a month. Rename the file instead (d6.png →
// d6_v2.png) — a new URL cannot be served from a cache, and it is why the
// filename convention here is worth keeping.
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
        // Art is exempt from the dev kill-switch — see ART_PATH above.
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
// have a stale copy of.
//
// Three sources, in order of preference:
//   BUILD_TAG          - set it by hand in Render's env vars if you want to
//                        control the value; nothing else has to change.
//   RENDER_GIT_COMMIT  - injected by Render for git-backed services, so it
//                        changes on every push with no action needed. It is NOT
//                        listed in the dashboard's env-var table (that shows
//                        only user-defined vars), so absence there proves
//                        nothing — the boot log below is what tells you.
//   boot timestamp     - always works, but changes on every restart rather than
//                        every deploy, so clients re-fetch code more often than
//                        strictly necessary. Correct, just wasteful.
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