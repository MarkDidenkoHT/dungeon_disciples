// Where the art comes from.
//
// Assets are served from Cloudflare, not from the app server. This is purely a
// bandwidth decision: the art is ~50 MB and the app server's free tier gets
// 5 GB/month, which ten players can eat on their own. The API, index.html and
// the ~500 KB of code stay on the app server.
//
// The SAME files are still deployed with the app, so the origin is a working
// fallback rather than a hypothetical one. Two things fall back to it:
//
//   1. A boot probe. One tiny image is fetched from the CDN before the first
//      screen renders; if it fails or is slow, ASSET_BASE is emptied and every
//      later URL is same-origin. This is the case that matters — CDN down,
//      blocked by a network, DNS refused.
//   2. A capture-phase error listener on every <img>. If a single file is
//      missing or one request dies, that image retries against the origin.
//      Once per element, so a file that is genuinely absent fails twice and
//      stops rather than looping.
//
// ASSET_BASE is an exported `let` read through live bindings, so flipping it
// here changes every module that imported it. It must therefore be resolved
// BEFORE any screen renders — see the await in main.js.
export const ASSET_CDN = 'https://assets.markdidenkowork.workers.dev';

// Remembering the last verdict matters more than it looks. Module-level
// constants (the resource-bar icons, the music tracks) call assetUrl at IMPORT
// time, which is before the probe can finish — so on a session that starts with
// the CDN unreachable those few URLs would be frozen wrong. Reading the previous
// session's answer here makes the very first evaluation correct, and the probe
// below keeps the flag honest in both directions.
const FALLBACK_KEY = 'asset_origin_fallback';
const remembered = (() => {
  try { return localStorage.getItem(FALLBACK_KEY) === '1'; } catch { return false; }
})();

export let ASSET_BASE = remembered ? '' : ASSET_CDN;

// The CDN holds the CONTENTS of the assets folder at its root (Cloudflare's
// uploader flattens the folder it is given), so the origin's `/assets` segment
// is dropped for CDN URLs and kept for same-origin ones.
// What we have already learned about individual files, for THIS session.
//
// `data-assetRetried` only protects one element. Every re-render builds new
// <img> elements, so a file missing from the CDN cost two fresh requests on
// every single render — and the battle screen re-renders on every poll. These
// two sets make each dead path cost at most two requests for the whole session.
const cdnMissing    = new Set();   // failed on the CDN — go straight to the origin
const originMissing = new Set();   // failed on both — stop asking entirely
export function isAssetMissing(path) { return originMissing.has(normalizePath(path)); }

// A 404 is NOT cached by the browser, so an <img> rebuilt on the next render
// asks for the dead file again — and the battle screen rebuilds its action bar
// several times per action. Handing back a transparent pixel instead of the URL
// costs zero requests and looks the same as the hidden element the inline
// onerror would have produced.
const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Shared with battle-fx.js, whose PIXI textures are loaded outside the DOM and
// so never reach installAssetFallback's error listener. Both now write to and
// read from the same memo, which is what stops a texture that is missing (or
// CORS-blocked) on the CDN from re-attempting it on every single cast.
export function markCdnMissing(path) { cdnMissing.add(normalizePath(path)); }
export function isCdnMissing(path)   { return cdnMissing.has(normalizePath(path)); }

function normalizePath(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return p.startsWith('/assets') ? p : `/assets${p}`;
}

export function assetUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const key = normalizePath(p);
  // Dead everywhere we serve from. Nothing is gained by asking again, this
  // render or any later one.
  if (originMissing.has(key)) return BLANK_PIXEL;
  if (!ASSET_BASE) return p;
  // Already known absent from the CDN: request the origin the FIRST time, so
  // the image that does exist there appears without a failed round trip first.
  if (cdnMissing.has(key)) return p;
  return ASSET_BASE + p.replace(/^\/assets/, '');
}

// The nine background images in style.css cannot call assetUrl, so each one is
// a CSS variable declared with a CDN URL. On fallback they are rewritten here.
const CSS_IMAGE_VARS = [
  ['--img-battle-grid',        '/assets/icons/ui/battle_grid.png'],
  ['--img-nav-active',         '/assets/icons/ui/bottom-nav-active.png'],
  ['--img-nav',                '/assets/icons/ui/bottom-nav.png'],
  ['--img-bottom-ui',          '/assets/icons/ui/bottom_ui.jpg'],
  ['--img-building-slot',      '/assets/icons/ui/building_slot1.png'],
  ['--img-formation',          '/assets/icons/ui/formation.png'],
  ['--img-formation-highlight','/assets/icons/ui/formation_highligt.png'],
  ['--img-resource-bar',       '/assets/icons/ui/recource_bar.png'],
  ['--img-battle-prep-bg',     '/assets/screens/battle_prep_bg.jpeg'],
];

function remember(useFallback) {
  try { localStorage.setItem(FALLBACK_KEY, useFallback ? '1' : '0'); } catch {}
}

function setCssVars(toCdn) {
  const root = document.documentElement;
  for (const [name, path] of CSS_IMAGE_VARS) {
    const url = toCdn ? ASSET_CDN + path.replace(/^\/assets/, '') : path;
    root.style.setProperty(name, `url('${url}')`);
  }
}

function useOrigin(reason) {
  remember(true);
  if (!ASSET_BASE) return;          // already on the origin, nothing to swap
  ASSET_BASE = '';
  setCssVars(false);
  console.warn(`[assets] CDN unavailable (${reason}) — serving from the app server`);
}

// The recovery half. A session that started on the origin because the LAST one
// failed must go back to the CDN as soon as the probe succeeds — otherwise one
// bad session costs a whole good one's bandwidth, and the flag only ever
// unwinds a session late.
function useCdn() {
  remember(false);
  if (ASSET_BASE) return;           // already on the CDN
  ASSET_BASE = ASSET_CDN;
  setCssVars(true);
}

/**
 * Resolve where assets come from. Awaited once at boot, before the first
 * render. Never rejects: a failed probe is an answer, not an error.
 *
 * The timeout is deliberately short. A CDN that is merely slow still costs the
 * player a blank screen, and the origin has the same files.
 */
export function resolveAssetBase({ timeoutMs = 4000, probePath = '/assets/icons/ui/castle.png' } = {}) {
  return new Promise(resolve => {
    if (typeof Image === 'undefined') return resolve(ASSET_BASE);
    // Probe the CDN even when this session started on the origin: the outage
    // that set the flag may be over, and nothing else would ever clear it.
    const img = new Image();
    const done = reason => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      if (reason) useOrigin(reason);
      else useCdn();
      resolve(ASSET_BASE);
    };
    const timer = setTimeout(() => done('timeout'), timeoutMs);
    img.onload  = () => done(null);
    img.onerror = () => done('probe failed');
    img.src = ASSET_CDN + probePath.replace(/^\/assets/, '');
  });
}

/**
 * Per-image safety net. Capture phase, because `error` on <img> does not
 * bubble.
 *
 * THE ORDERING PROBLEM THIS SOLVES
 * Almost every <img> in this app carries an inline onerror that hides it —
 * `this.style.display='none'`, sometimes revealing a placeholder sibling too.
 * That handler is written for "this file does not exist", but it cannot tell
 * that case from "the CDN does not have it". Event order makes it worse: this
 * capture-phase listener runs BEFORE the element's own handler, so the sequence
 * for a file the CDN is missing was
 *
 *   1. CDN 404 -> we point the element at the origin
 *   2. the SAME error event reaches the element -> inline onerror hides it
 *   3. the origin copy loads fine, into an element that is now display:none
 *
 * — an image that exists on Render and never appears. So a retry now snapshots
 * the styles BEFORE the inline handler can touch them and restores them once
 * the origin copy loads. If the origin fails too, the inline handler hides it
 * again on that second error, which is the behaviour it was written for.
 */
export function installAssetFallback() {
  if (typeof document === 'undefined') return;
  document.addEventListener('error', e => {
    const el = e.target;
    if (!(el instanceof HTMLImageElement)) return;
    const src = el.getAttribute('src') || '';
    if (!src) return;

    if (src.startsWith(ASSET_CDN)) {
      const path = '/assets' + src.slice(ASSET_CDN.length);
      // Remember it for every future element pointing at the same file, not
      // just this one — that is what stops the per-render re-request storm.
      cdnMissing.add(path);
      if (originMissing.has(path)) return;   // known dead on both; let it fail
      if (el.dataset.assetRetried) return;
      el.dataset.assetRetried = '1';

      // Captured in THIS phase, which is before any inline onerror has run, so
      // these are the styles the element was authored with.
      const sibling = el.nextElementSibling;
      const before = {
        display:    el.style.display,
        visibility: el.style.visibility,
        sibling,
        siblingDisplay: sibling ? sibling.style.display : null,
      };
      el.addEventListener('load', () => {
        el.style.display    = before.display;
        el.style.visibility = before.visibility;
        // The placeholder the inline handler revealed has to go back down, or
        // the art and its stand-in are shown together.
        if (before.sibling) before.sibling.style.display = before.siblingDisplay;
      }, { once: true });

      el.src = path;
      return;
    }

    // The origin failed too. That file does not exist anywhere we serve from,
    // so nothing is gained by ever asking for it again this session.
    if (src.startsWith('/assets')) originMissing.add(src.split('?')[0]);
  }, true);
}