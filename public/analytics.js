// Microsoft Clarity, behind consent.
//
// WHY THIS IS A MODULE AND NOT A <script> IN index.html
// Clarity stores a persistent identifier on the device (the `_clarity` cookie
// plus local storage) so it can stitch a session together and recognise a
// returning visitor. That is storage on the user's device for a purpose that is
// not strictly necessary to run the game, which is exactly the thing consent
// exists for. A tag hardcoded into the page would load before the player has
// been asked anything. This loads it later, or never.
//
// Masking is NOT a substitute for this. Masking governs what CONTENT ends up in
// a recording; consent governs whether we may put an identifier on the device at
// all. Both are wanted, they solve different problems — set the project's
// masking mode in the Clarity dashboard as well.

// Paste the project id from the Clarity dashboard here. While it is empty every
// function below is a no-op, so the game runs untouched until you opt in — there
// is no half-configured state that quietly phones home.
const CLARITY_PROJECT_ID = '';

// Bump this when the privacy notice changes in a way players should see again.
// A player whose stored consent_version differs is re-asked; that is the whole
// mechanism, so the string only has to be stable and comparable.
export const CONSENT_VERSION = '2026-08-16';

let started = false;

/**
 * Boots Clarity. Safe to call more than once — the guard means a re-render or a
 * second login cannot inject the tag twice.
 */
export function startAnalytics() {
  if (started || !CLARITY_PROJECT_ID) return;
  if (typeof document === 'undefined') return;
  started = true;

  // Microsoft's standard snippet, written out rather than eval'd from a string
  // so it is readable and so the CSP does not need script-src 'unsafe-eval'.
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1;
    t.src = 'https://www.clarity.ms/tag/' + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);

  // Tell Clarity the user agreed. Without this its own cookie-consent setting
  // (if enabled on the project) holds tracking back.
  try { window.clarity?.('consent'); } catch {}
}

/**
 * Called when a player declines, or has declined before. Clarity is never
 * loaded, so there is nothing to tear down — but if a previous session in this
 * browser accepted, its cookie is still there, and leaving it would mean
 * "declined" only took effect next time.
 */
export function stopAnalytics() {
  try { window.clarity?.('consent', false); } catch {}
  // Best-effort removal of what a previous accepted session left behind. These
  // are first-party by design (Clarity writes them on our origin), so we can
  // clear them ourselves.
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('_clarity') || key.startsWith('clarity')) localStorage.removeItem(key);
    }
  } catch {}
  try {
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim();
      if (name.startsWith('_clarity')) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      }
    });
  } catch {}
}

/**
 * The single decision point, so no caller has to remember the rule: a player is
 * tracked only if they have accepted the CURRENT notice.
 */
export function applyAnalyticsConsent(player) {
  const agreed = player?.analytics_consent === true &&
                 player?.consent_version === CONSENT_VERSION;
  if (agreed) startAnalytics();
  else        stopAnalytics();
  return agreed;
}

/** True when this player has not answered the current version of the notice. */
export function needsConsent(player) {
  return !player || player.consent_version !== CONSENT_VERSION;
}