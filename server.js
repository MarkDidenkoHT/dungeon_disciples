const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
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