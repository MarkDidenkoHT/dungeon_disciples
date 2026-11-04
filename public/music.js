import { createAssetAudio, playAssetAudio, pauseAssetAudio } from './asset_base.js';
const FACTION_THEME_PATH = {
  empire:              '/assets/sfx/themes/empire.mp3',
  choir_of_the_cursed: '/assets/sfx/themes/choir.mp3',
  grail_of_sorrow:     '/assets/sfx/themes/grail.mp3',
};
const themePath = faction => FACTION_THEME_PATH[faction] || null;

let _audio    = null;
let _faction  = null;
let _enabled  = true;
let _unlocked = false;

function createAudio(path) {
  const a  = createAssetAudio(path);
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
    _audio = createAudio(themePath(_faction));
    playAssetAudio(_audio).catch(() => {});
  }
}

export function initMusic(player) {
  _enabled = player?.settings?.music_enabled !== false;
  ['pointerdown', 'touchstart', 'touchend', 'click'].forEach(evt =>
    document.addEventListener(evt, unlockAudio, { passive: true, capture: true })
  );
}

export function playFactionTheme(faction) {
  const path = themePath(faction);
  if (!path) return;
  if (_faction === faction) {
    if (_enabled && _audio?.paused) playAssetAudio(_audio).catch(() => {});
    return;
  }
  if (_audio) { pauseAssetAudio(_audio); _audio.src = ''; _audio = null; }
  _faction = faction;
  if (!_enabled || !_unlocked) return;
  _audio = createAudio(path);
  playAssetAudio(_audio).catch(() => {});
}

export function stopTheme() {
  if (_audio) { pauseAssetAudio(_audio); _audio.src = ''; _audio = null; }
  _faction = null;
}

export function setMusicEnabled(enabled) {
  _enabled = enabled;
  if (!enabled) {
    if (_audio) pauseAssetAudio(_audio);
  } else {
    if (_faction && !_audio && _unlocked) {
      _audio = createAudio(themePath(_faction));
      playAssetAudio(_audio).catch(() => {});
    } else if (_audio?.paused) {
      playAssetAudio(_audio).catch(() => {});
    }
  }
}