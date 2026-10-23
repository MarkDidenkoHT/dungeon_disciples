// The landing page's only script: pick a language and a banner, paint the art,
// load the demos when they come into view.
import { STRINGS, detectLang, rememberLang } from './i18n.js';

// The same CDN the game uses. Every image on this page is a file the game is
// already serving, so the page costs no new hosting and no new art.
const CDN = 'https://assets.markdidenkowork.workers.dev';

let lang = detectLang();

// ── Banner ──────────────────────────────────────────────────────────────────
// One faction for the whole page: the header picks it, every demo frame is
// loaded with it, and the page's own palette follows it. Before this each demo
// carried its own tabs and the page could show you an Aurex castle next to a
// Choir hero, which is not a thing any player ever sees.
const FACTIONS = ['empire', 'choir_of_the_cursed', 'grail_of_sorrow'];
const FACTION_SCREEN = {
  empire:              'screens/empire.jpg',
  choir_of_the_cursed: 'screens/choir.jpg',
  grail_of_sorrow:     'screens/grail.jpg',
};
const FACTION_STORAGE = 'sc_faction';

let faction = (() => {
  try {
    const saved = localStorage.getItem(FACTION_STORAGE);
    if (FACTIONS.includes(saved)) return saved;
  } catch { /* private mode */ }
  return 'empire';
})();

// ── Language ────────────────────────────────────────────────────────────────
function applyLang() {
  const dict = STRINGS[lang] || STRINGS.en;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const value = dict[el.dataset.i18n];
    if (value != null) el.textContent = value;
  }
  // A handful of strings are attributes rather than text — the faction group's
  // accessible name has no element of its own to fill.
  for (const el of document.querySelectorAll('[data-i18n-label]')) {
    const value = dict[el.dataset.i18nLabel];
    if (value != null) el.setAttribute('aria-label', value);
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

function applyFaction({ reload = true } = {}) {
  // style.css hangs the whole palette off this attribute, exactly as the game
  // does on its own <body>.
  document.body.dataset.faction = faction;

  for (const btn of document.querySelectorAll('#faction-pick button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.faction === faction));
  }

  document.querySelector('.hero')
    .style.setProperty('--hero-img', `url('${CDN}/${FACTION_SCREEN[faction]}')`);

  // A demo resolves its faction once, at mount, the same way it resolves its
  // language — so switching means reloading the frames that are already up.
  if (reload) {
    for (const frame of document.querySelectorAll('iframe[data-demo][src]')) {
      frame.src = demoSrc(frame.dataset.demo);
    }
  }
  setTrack(faction);
}

function chooseFaction(next) {
  if (!FACTIONS.includes(next) || next === faction) return;
  faction = next;
  try { localStorage.setItem(FACTION_STORAGE, faction); } catch { /* nothing to do */ }
  applyFaction();
}

document.getElementById('faction-pick').addEventListener('click', e => {
  const btn = e.target.closest('button[data-faction]');
  if (btn) chooseFaction(btn.dataset.faction);
});

// The faction tabs inside a demo still work; they just hand the choice up here
// rather than reloading themselves, so the header and the other seven frames
// never disagree with the one you clicked in.
window.addEventListener('message', e => {
  if (e.source?.parent !== window) return;
  if (e.data?.type === 'sc-faction') chooseFaction(e.data.faction);
});

// ── Music ───────────────────────────────────────────────────────────────────
// The game's own faction themes, off until the visitor asks for them. A landing
// page that starts playing at you is a landing page people close; browsers
// block it anyway without a gesture, and the button IS the gesture.
//
// The choice is deliberately not remembered: arriving to unexpected sound on a
// second visit is the same rudeness one navigation later.
const THEME = {
  empire:              `${CDN}/sfx/themes/empire.mp3`,
  choir_of_the_cursed: `${CDN}/sfx/themes/choir.mp3`,
  grail_of_sorrow:     `${CDN}/sfx/themes/grail.mp3`,
};

const musicBtn = document.getElementById('music');
let audio      = null;
let musicOn    = false;

function setTrack(which) {
  if (!musicOn) return;
  const src = THEME[which];
  if (!src || !audio || audio.dataset.faction === which) return;
  audio.dataset.faction = which;
  audio.src = src;
  audio.play().catch(() => {});
}

musicBtn.addEventListener('click', () => {
  musicOn = !musicOn;
  musicBtn.setAttribute('aria-pressed', String(musicOn));
  if (!musicOn) {
    audio?.pause();
    return;
  }
  if (!audio) {
    audio = new Audio();
    audio.loop   = true;
    audio.volume = 0.5;
  }
  if (audio.dataset.faction !== faction) {
    audio.dataset.faction = faction;
    audio.src = THEME[faction];
  }
  // Only ever called from a click, so autoplay policy is satisfied. A failure
  // here is a missing file or a codec, and silence is the right outcome.
  audio.play().catch(() => {
    musicOn = false;
    musicBtn.setAttribute('aria-pressed', 'false');
  });
});

// ── Art ─────────────────────────────────────────────────────────────────────

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
applyFaction({ reload: false });

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
  return `demos/demo.html?demo=${name}&lang=${lang}&faction=${faction}`;
}

for (const frame of document.querySelectorAll('iframe[data-demo]')) {
  frame.src = demoSrc(frame.dataset.demo);
}
