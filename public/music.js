let _audio       = null;
let _faction     = null;
let _enabled     = true;
let _pendingPlay = false;  // ← new

document.addEventListener('pointerdown', () => {
  if (_pendingPlay && _audio?.paused) {
    _audio.play().catch(() => {});
  }
  _pendingPlay = false;
}, { once: true });

export function initMusic(player) {
  _enabled = player?.settings?.music_enabled !== false;
}

function createAudio(src) {
  const a  = new Audio(src);
  a.loop   = true;
  a.volume = 0.3;
  return a;
}

function attemptPlay() {
  if (!_audio || !_enabled) return;
  const p = _audio.play();
  if (p instanceof Promise) {
    p.catch(() => {
      _pendingPlay = true;
    });
  }
}

export function playFactionTheme(faction) {
  const src = FACTION_THEME[faction];
  if (!src) return;
  if (_faction === faction) {
    if (_enabled && _audio?.paused) attemptPlay();
    return;
  }
  if (_audio) { _audio.pause(); _audio.src = ''; _audio = null; }
  _faction = faction;
  if (!_enabled) return;
  _audio = createAudio(src);
  attemptPlay();
}

export function stopTheme() {
  if (_audio) { _audio.pause(); _audio.src = ''; _audio = null; }
  _faction     = null;
  _pendingPlay = false;
}

export function setMusicEnabled(enabled) {
  _enabled = enabled;
  if (!enabled) {
    if (_audio) _audio.pause();
  } else {
    if (_faction && !_audio) {
      _audio = createAudio(FACTION_THEME[_faction]);
      attemptPlay();
    } else if (_audio?.paused) {
      attemptPlay();
    }
  }
}