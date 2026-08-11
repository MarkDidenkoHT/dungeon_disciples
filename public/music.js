import { assetUrl } from './asset_base.js';
// Resolved when the track is played, not at import: assetUrl's base can still
// flip to the origin while this module is loading (see asset_base.js), and audio
// has no per-element retry the way <img> does.
const FACTION_THEME_PATH = {
  empire:              '/assets/sfx/themes/empire.mp3',
  choir_of_the_cursed: '/assets/sfx/themes/choir.mp3',
  grail_of_sorrow:     '/assets/sfx/themes/grail.mp3',
};
const themeUrl = faction => {
  const p = FACTION_THEME_PATH[faction];
  return p ? assetUrl(p) : null;
};

let _audio    = null;
let _faction  = null;
let _enabled  = true;
let _unlocked = false;

function createAudio(src) {
  const a  = new Audio(src);
  a.loop   = true;
  a.volume = 0.75;
  return a;
}

function unlockAudio() {
  if (_unlocked) return;
  _unlocked = true;
  ['pointerdown', 'touchstart', 'touchend', 'click'].forEach(evt =>
    document.removeEventListener(evt, unlockAudio, true)
  );
  if (_faction && _enabled) {
    _audio = createAudio(themeUrl(_faction));
    _audio.play().catch(() => {});
  }
}

export function initMusic(player) {
  _enabled = player?.settings?.music_enabled !== false;
  ['pointerdown', 'touchstart', 'touchend', 'click'].forEach(evt =>
    document.addEventListener(evt, unlockAudio, { passive: true, capture: true })
  );
}

export function playFactionTheme(faction) {
  const src = themeUrl(faction);
  if (!src) return;
  if (_faction === faction) {
    if (_enabled && _audio?.paused) _audio.play().catch(() => {});
    return;
  }
  if (_audio) { _audio.pause(); _audio.src = ''; _audio = null; }
  _faction = faction;
  if (!_enabled || !_unlocked) return;
  _audio = createAudio(src);
  _audio.play().catch(() => {});
}

export function stopTheme() {
  if (_audio) { _audio.pause(); _audio.src = ''; _audio = null; }
  _faction = null;
}

export function setMusicEnabled(enabled) {
  _enabled = enabled;
  if (!enabled) {
    if (_audio) _audio.pause();
  } else {
    if (_faction && !_audio && _unlocked) {
      _audio = createAudio(themeUrl(_faction));
      _audio.play().catch(() => {});
    } else if (_audio?.paused) {
      _audio.play().catch(() => {});
    }
  }
}