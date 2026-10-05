// The landing page's only script: pick a language, paint the art, load the
// demos when they come into view.
import { STRINGS, detectLang, rememberLang } from './i18n.js';

// The same CDN the game uses. Every image on this page is a file the game is
// already serving, so the page costs no new hosting and no new art.
const CDN = 'https://assets.markdidenkowork.workers.dev';

let lang = detectLang();

// ── Language ────────────────────────────────────────────────────────────────
function applyLang() {
  const dict = STRINGS[lang] || STRINGS.en;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const value = dict[el.dataset.i18n];
    if (value != null) el.textContent = value;
  }
  document.documentElement.lang = lang;
  for (const btn of document.querySelectorAll('#lang button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  }
  // A demo bakes its language in when it mounts — the vendored widgets read it
  // once, into a `const` — so switching means reloading the frames. Only the
  // ones already loaded; the rest pick the new language up when they scroll in.
  for (const frame of document.querySelectorAll('iframe[data-demo][src]')) {
    frame.src = demoSrc(frame.dataset.demo);
  }
}

document.getElementById('lang').addEventListener('click', e => {
  const btn = e.target.closest('button[data-lang]');
  if (!btn || btn.dataset.lang === lang) return;
  lang = btn.dataset.lang;
  rememberLang(lang);
  applyLang();
});

// ── Art ─────────────────────────────────────────────────────────────────────
document.querySelector('.hero').style.setProperty('--hero-img', `url('${CDN}/screens/embark.jpg')`);

// ── Backdrop ───────────────────────────────────────────────────────────────
// The eight loading screens dealt out over the page behind the content.
//
// This is built here rather than in CSS because a CSS background cannot vary
// down a column: `repeat-y` paints one image over and over, so the page was the
// same four pictures to the bottom. Tiles can each hold a different one.
//
// The order is a shuffled bag rather than straight random: reshuffling 1..8 and
// dealing from it guarantees all eight appear before any repeats, which keeps
// the spread even. On top of that a tile never takes the image to its left or
// the one directly above, so two of the same are never touching.
const LOADING_SCREENS = Array.from({ length: 8 }, (_, i) => `${CDN}/loading_screens/loading${i + 1}.jpg`);

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildBackdrop() {
  const el = document.querySelector('.backdrop');
  if (!el) return;

  const cols    = getComputedStyle(el).gridTemplateColumns.split(' ').length;
  const tileH   = (el.clientWidth / cols) * (850 / 400);

  // A page laid out at zero width measures zero, and zero tiles are infinitely
  // many rows — which threw, and the throw took the REST of this module with
  // it, `applyLang()` included. A visitor whose browser restored the tab in the
  // background got an untranslated page and no backdrop.
  //
  // That is not hypothetical: a hidden or prerendered tab has an innerWidth of
  // 0 until it is shown. Bail out instead, and let the `load` and `resize`
  // handlers below build it once there is a width to measure.
  if (!Number.isFinite(tileH) || tileH <= 0) return;

  // One row of slack, because the page grows as the demo frames finish loading
  // and a backdrop that stops short is more obvious than one that is clipped.
  const rows    = Math.ceil(document.body.scrollHeight / tileH) + 1;
  const total   = cols * rows;

  let bag = [];
  const draw = (banned) => {
    if (!bag.length) bag = shuffled(LOADING_SCREENS);
    let i = bag.findIndex(url => !banned.includes(url));
    if (i === -1) i = 0;
    return bag.splice(i, 1)[0];
  };

  const picks = [];
  for (let n = 0; n < total; n++) {
    const left  = n % cols ? picks[n - 1] : null;
    const above = n >= cols ? picks[n - cols] : null;
    picks.push(draw([left, above].filter(Boolean)));
  }

  el.innerHTML = picks
    .map(url => `<div class="backdrop-tile" style="background-image:url('${url}')"></div>`)
    .join('');
}

applyLang();

buildBackdrop();
// The page gets taller as the frames load, and the column count changes with
// the breakpoint. Both want a rebuild; neither is worth debouncing hard.
window.addEventListener('load', buildBackdrop);
let backdropTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(backdropTimer);
  backdropTimer = setTimeout(buildBackdrop, 200);
});

for (const el of document.querySelectorAll('[data-bg]')) {
  el.style.backgroundImage = `url('${CDN}/${el.dataset.bg}')`;
}
for (const img of document.querySelectorAll('img[data-src]')) {
  img.src = `${CDN}/${img.dataset.src}`;
}

// ── Demos ───────────────────────────────────────────────────────────────────
// Eight framed demos, each loading the game's whole stylesheet and its data
// modules. Deferring them matters — but the deferral is the browser's job, not
// this file's: every frame carries `loading="lazy"`, so setting the src here
// still leaves an off-screen frame unfetched until it is scrolled near.
//
// This replaced an IntersectionObserver, which was a worse answer for exactly
// one reason: an observer only fires while the page is being rendered. A tab
// that is restored in the background, or a browser that is not painting, left
// every frame empty — eight blank boxes where the demos should be. `lazy` is
// handled by the loader rather than the rendering loop and cannot fail that
// way. Where it is unsupported the frames simply all load, which is heavier
// than it needs to be and still correct; after the first one the stylesheet and
// the data modules are served from cache.
function demoSrc(name) {
  return `demos/${name}.html?lang=${lang}`;
}

for (const frame of document.querySelectorAll('iframe[data-demo]')) {
  frame.src = demoSrc(frame.dataset.demo);
}
