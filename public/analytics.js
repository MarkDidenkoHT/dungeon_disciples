// Consent signalling for Microsoft Clarity.
//
// The TAG lives in index.html, in the head, exactly as Microsoft documents it.
// This file does not load it and never did anything you could see from the page,
// which is why an unset id or an unpushed file looked identical to "Clarity is
// broken". Now the tag either appears in view-source or it does not.
//
// What is gated is TRACKING, not loading — which is the right place for the gate
// anyway. Clarity's own "Cookie consent" project setting must be ON: with it,
// the tag sits idle, stores nothing on the device and records nothing until
// clarity("consent") is called. That call happens here, after the player has
// actually agreed on the welcome screen.
//
// Masking is a separate control and still worth setting in the dashboard: it
// governs what CONTENT ends up in a recording, not whether we may record.

// Bump this when the privacy notice changes in a way players should see again.
// A player whose stored consent_version differs is re-asked; that is the whole
// mechanism, so the string only has to be stable and comparable.
export const CONSENT_VERSION = '2026-08-16';

/** Tell Clarity it may track. Queued safely if the tag is still loading. */
export function startAnalytics() {
  try {
    window.clarity?.('consent');
  } catch (err) {
    console.warn('[analytics] consent signal failed', err?.message || err);
  }
}

/**
 * Withdraw consent. Clarity stops tracking, and anything a previously-accepted
 * session left behind is cleared — so "off" means off now, not next launch.
 */
export function stopAnalytics() {
  try { window.clarity?.('consent', false); } catch {}
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