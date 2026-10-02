// Stands in for public/api.js inside the landing page's demos.
//
// The demos import the game's REAL widgets (transmute.js, engrave.js,
// colossus-page.js), and those widgets talk to a server. There is no server
// here — the landing page is static files on Cloudflare Pages — so this module
// answers the few endpoints they call and keeps the result in memory. Reload
// the page and the demo is back to its starting state, which is what a
// shop-window demo should do.
//
// build-web.js copies this file to web/vendor/public/api.js, so the vendored
// widgets' own `import ... from './api.js'` picks it up with no edit.

import {
  ENGRAVING_CURRENCY, ENGRAVING_TOKEN,
  engravingCost, engravingGoldCost, engravingTokenCost,
} from '../data/engravings.js';

// Seeded by each demo page before it mounts a widget. Everything the stubbed
// endpoints read or write lives here.
export const demoState = {
  resources: [],      // [{ item, amount }]
  tokens:    [],
  roster:    [],      // [{ id, unit_data: { unit_id, max_hp, engraving } }]
  items:     [],
  transmute: null,    // the running job, or null
  colossus:  null,
  // Demos subscribe to redraw their own resource read-outs after a widget
  // charges the player.
  onChange:  null,
};

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const notify = () => { try { demoState.onChange?.(); } catch {} };

function resourceRow(item) {
  let row = demoState.resources.find(r => r.item === item);
  if (!row) { row = { item, amount: 0 }; demoState.resources.push(row); }
  return row;
}

function spend(item, amount) {
  const row = resourceRow(item);
  if (row.amount < amount) {
    const err = new Error('Not enough resources');
    err.code = 'insufficient';
    throw err;
  }
  row.amount -= amount;
}

// A real transmutation takes an hour. Nobody is going to stand on a landing
// page for an hour, so the demo's job finishes in TRANSMUTE_DEMO_MS — the
// widget reads `ends_at` and does not care how far away it is. The "Takes 1h"
// estimate it prints before you start is the real one, and the caption under
// the frame says the wait is shortened here.
const TRANSMUTE_DEMO_MS = 12000;

const ROUTES = [
  [/^\/transmute(\?|$)/, 'GET', () => ({ job: clone(demoState.transmute) })],

  [/^\/transmute\/start$/, 'POST', body => {
    const { target, a, b, amount } = body;
    spend(a, amount);
    spend(b, amount);
    const now = Date.now();
    demoState.transmute = {
      target, a, b, amount,
      started_at: now,
      ends_at:    now + TRANSMUTE_DEMO_MS,
    };
    notify();
    return { job: clone(demoState.transmute) };
  }],

  [/^\/transmute\/claim$/, 'POST', () => {
    const job = demoState.transmute;
    if (job) resourceRow(job.target).amount += job.amount;
    demoState.transmute = null;
    notify();
    return { ok: true };
  }],

  [/^\/roster\/engrave$/, 'POST', body => {
    const row = demoState.roster.find(u => String(u.id) === String(body.roster_id));
    if (row) {
      // The widget reads the carried engraving off the row itself, not off
      // unit_data, so that is where the demo has to put it.
      row.engraving = body.up
        ? { combo: body.combo, tier: body.tier, up: body.up, down: body.down }
        : { combo: body.combo, tier: body.tier, plus: body.plus, minus: body.minus };
    }
    // Billed with the game's own numbers, so the purse in the demo moves by
    // exactly what an engraving costs in the game.
    spend(ENGRAVING_CURRENCY, engravingCost(body.tier));
    spend('Gold',             engravingGoldCost(body.tier));
    spend(ENGRAVING_TOKEN,    engravingTokenCost(body.tier));
    notify();
    return { ok: true };
  }],

  [/^\/colossus(\?|$)/, 'GET', () => clone(demoState.colossus)],

  [/^\/colossus\/rest\/refresh$/, 'POST', body => {
    const ids = (body.roster_ids || []).map(String);
    const st  = demoState.colossus;
    if (st) st.resting_roster_ids = (st.resting_roster_ids || []).filter(id => !ids.includes(String(id)));
    notify();
    return { ok: true };
  }],
];

export async function api(path, body) {
  const method = body === undefined ? 'GET' : 'POST';
  for (const [pattern, verb, handler] of ROUTES) {
    if (verb === method && pattern.test(path)) return handler(body || {});
  }
  // Anything the demos do not simulate. Failing loudly here is better than a
  // widget quietly drawing an empty state: it shows up in the console while
  // the page is being built, and the widgets all have catch blocks.
  const err = new Error(`[demo] no stub for ${method} ${path}`);
  err.code = 'demo_unstubbed';
  throw err;
}

// The game's resource bar lives outside the demo frame, so there is nothing to
// refresh — but the widgets await it on every charge.
export async function refreshResourceBar() { notify(); }

export const bootstrapCache = {
  async get() {
    return {
      roster:    clone(demoState.roster),
      resources: clone(demoState.resources),
      tokens:    clone(demoState.tokens),
      items:     clone(demoState.items),
    };
  },
  invalidate() {},
};

// The widgets offer "go build the Transmutation Lab" buttons when a mechanic is
// locked. Every demo hands them an unlocked player, so this is only ever
// reached if that changes — a no-op beats navigating a framed page nowhere.
export function navigate() {}

export function setSessionToken() {}
export function getSessionToken() { return null; }
