// Timed events: extra drops and a reward bonus, for a window.
//
// WHAT AN EVENT IS
// A row in `events` whose `event_data` names a trophy that drops only while the
// window is open, plus percentage bonuses. The DROP expires; nothing else does.
// A trophy already banked stays in the inventory and the building it unlocks
// stays buildable forever — otherwise a player who collected most of a set is
// left holding dead currency, which is a support ticket, not a mechanic.
//
// ONE AT A TIME. If several rows qualify, the newest wins. Overlapping events
// are not a supported configuration; this just refuses to be ambiguous.
//
// event_data:
//   {
//     "trophy": "bloodied_brooch",
//     "drops":  { "<region_id>": { "<level>": { "<trophy_id>": <amount> } } },
//     "bonus":  { "xp_pct": 10, "gold_pct": 0, "crystal_pct": 0,
//                 "regions": { "<region_id>": { "xp_pct": 10 } } }
//   }
//
// Bonuses are ADDITIVE with everything else (expedition passives, throne perks)
// and the region entry stacks on top of the global one — a 10% global and a 10%
// regional event is 20% in that region.

// The active event changes at most twice per event, so re-reading it on every
// battle end would be a Supabase round trip for an answer that is almost always
// the same. 60s is short enough that opening or killing an event is felt
// immediately in human terms.
const TTL_MS = 60 * 1000;
let _cache = { at: 0, event: null };

/**
 * The single active event, or null.
 *
 * `active` is a manual kill-switch AND-ed with the window, never the sole gate:
 * flipping it false stops a running event without editing dates, and a row can
 * be configured ahead of time without going live early.
 */
async function getActiveEvent(supabase) {
  const now = Date.now();
  if (now - _cache.at < TTL_MS) return _cache.event;

  let event = null;
  try {
    const iso  = new Date().toISOString();
    const rows = await supabase(
      `/events?active=eq.true&time_from=lte.${iso}&time_to=gte.${iso}&order=time_from.desc&limit=1`);
    event = rows[0] || null;
  } catch (err) {
    // Never fatal. An unreachable events table must not fail a battle payout —
    // the player simply gets the ordinary rewards.
    console.error('[events] lookup failed:', err.message);
    event = _cache.event;
  }

  _cache = { at: now, event };
  return event;
}

/** Drops this event adds for one region/level, as { trophy_id: amount }. */
function eventDropsFor(event, region_id, level) {
  const drops = event?.event_data?.drops?.[region_id];
  if (!drops) return {};
  const forLevel = drops[String(level)];
  return forLevel && typeof forLevel === 'object' ? forLevel : {};
}

/**
 * Percentage bonuses for one region: the global block plus that region's own,
 * added together. Returns zeroes when there is no event, so callers can add
 * unconditionally.
 */
function eventBonusFor(event, region_id) {
  const out = { xp_pct: 0, gold_pct: 0, crystal_pct: 0 };
  const bonus = event?.event_data?.bonus;
  if (!bonus) return out;
  const add = src => {
    if (!src) return;
    out.xp_pct      += Number(src.xp_pct)      || 0;
    out.gold_pct    += Number(src.gold_pct)    || 0;
    out.crystal_pct += Number(src.crystal_pct) || 0;
  };
  add(bonus);
  add(bonus.regions?.[region_id]);
  return out;
}

/**
 * What the client needs to draw the banner and the event sheet. Deliberately
 * only the presentational slice — the payout maths stays server-side.
 */
function eventPayload(event) {
  if (!event) return null;
  const data = event.event_data || {};
  return {
    id:        event.id,
    name:      event.name,
    // The events table's own column, not something in event_data. Written per
    // event so the sheet can say what the event IS; without it the sheet opened
    // straight into a drop table with no idea what was going on.
    description: event.description ?? null,
    time_from: event.time_from,
    time_to:   event.time_to,
    trophy:    data.trophy ?? null,
    drops:     data.drops  ?? {},
    bonus:     data.bonus  ?? {},
    // Which regions to badge on the map: anywhere that drops something or
    // carries its own bonus.
    regions: [...new Set([
      ...Object.keys(data.drops || {}),
      ...Object.keys(data.bonus?.regions || {}),
    ])],
  };
}

/** Drops the cache so a just-inserted event is visible without waiting out TTL. */
function clearEventCache() { _cache = { at: 0, event: null }; }

module.exports = { getActiveEvent, eventDropsFor, eventBonusFor, eventPayload, clearEventCache };