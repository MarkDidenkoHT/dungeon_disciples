import { assetUrl } from './asset_base.js';
// One-shot battle and UI sound effects, mirroring music.js. An ability def in
// data/unit_abilities.js may carry an `animation_sound` base name, and battle
// playback plays its matching file from /assets/sfx/abilities/<name>.mp3.
// UI actions use playUiSound for files under /assets/sfx/ui/.
//
// By the time battle playback runs the user has already tapped through the UI,
// so the browser's audio gesture-unlock has happened — no unlock dance needed
// like music.js has for autoplay-on-load.

// Resolved per play, not at import: the base can still flip to the origin
// while this module loads (see asset_base.js), and audio has no retry hook.
const abilitySfxUrl = name => assetUrl(`/assets/sfx/abilities/${name}.mp3`);
const uiSfxUrl = name => assetUrl(`/assets/sfx/ui/${name}.mp3`);

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
    const a  = new Audio(abilitySfxUrl(name));
    a.volume = 0.7;
    a.play().catch(() => {}); // missing file / autoplay block — stay silent
  } catch {}
}

export function playUiSound(name) {
  if (!_enabled || !name) return;
  try {
    const a  = new Audio(uiSfxUrl(name));
    a.volume = 0.7;
    a.play().catch(() => {}); // missing file / autoplay block — stay silent
  } catch {}
}