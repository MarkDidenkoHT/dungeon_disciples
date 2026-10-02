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

applyLang();
