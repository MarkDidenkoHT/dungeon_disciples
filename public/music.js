const FACTION_THEME = {
  empire:              '/assets/sfx/themes/empire.mp3',
  choir_of_the_cursed: '/assets/sfx/themes/choir.mp3',
  grail_of_sorrow:     '/assets/sfx/themes/grail.mp3',
};

let _audio   = null;
let _faction = null;
let _enabled = true;

export function initMusic(player) {
  _enabled = player?.settings?.music_enabled !== false;
}

function createAudio(src) {
  const a  = new Audio(src);
  a.loop   = true;
  a.volume = 0.3;
  return a;
}

export function playFactionTheme(faction) {
  const src = FACTION_THEME[faction];
  if (!src) return;
  if (_faction === faction) {
    if (_enabled && _audio?.paused) _audio.play().catch(() => {});
    return;
  }
  if (_audio) { _audio.pause(); _audio.src = ''; _audio = null; }
  _faction = faction;
  if (!_enabled) return;
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
    if (_faction && !_audio) {
      _audio = createAudio(FACTION_THEME[_faction]);
      _audio.play().catch(() => {});
    } else if (_audio?.paused) {
      _audio.play().catch(() => {});
    }
  }
}