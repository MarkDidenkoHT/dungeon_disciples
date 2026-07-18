// One-shot sound effects, mirroring music.js. Currently the foundation for
// ability sounds: an ability def in data/unit_abilities.js may carry an
// `animation_sound` base name, and the battle playback plays the matching file
// from /assets/sfx/abilities/<name>.mp3 when that ability's log entry is shown.
//
// By the time battle playback runs the user has already tapped through the UI,
// so the browser's audio gesture-unlock has happened — no unlock dance needed
// like music.js has for autoplay-on-load.

const ABILITY_SFX_BASE = '/assets/sfx/abilities/';

let _enabled = true;

// Collapse a burst of identical sounds (e.g. an AoE that logs one entry per
// enemy) into a single play, so the ability fires one sound, not an echo.
let _lastName = '';
let _lastAt   = 0;
const DEDUPE_MS = 200;

export function initSfx(player) {
  _enabled = player?.settings?.sfx_enabled !== false;
}

export function setSfxEnabled(enabled) {
  _enabled = enabled;
}

// Plays /assets/sfx/abilities/<name>.mp3. `name` is the def's animation_sound
// base (no path, no extension). No-op if sfx are disabled or name is empty.
export function playAbilitySound(name) {
  if (!_enabled || !name) return;
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (name === _lastName && now - _lastAt < DEDUPE_MS) return;
  _lastName = name;
  _lastAt   = now;
  try {
    const a  = new Audio(`${ABILITY_SFX_BASE}${name}.mp3`);
    a.volume = 0.7;
    a.play().catch(() => {}); // missing file / autoplay block — stay silent
  } catch {}
}
