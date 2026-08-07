import { RESOURCE_BAR_SLOTS } from './utils.js';

let _sessionToken = null;

export function setSessionToken(token) {
  _sessionToken = token;
}

export async function api(path, body = null) {
  const options = {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (_sessionToken) options.headers['X-Session-Token'] = _sessionToken;
  if (body) options.body = JSON.stringify(body);
  console.log('[API] request', { path: `/api${path}`, options });
  const res = await fetch(`/api${path}`, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('[API] invalid JSON response', { path: `/api${path}`, status: res.status, text });
    throw new Error(text.trim() || `HTTP ${res.status}`);
  }
  console.log('[API] response', { path: `/api${path}`, status: res.status, data });
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function makeCache(fetcher) {
  return {
    data: null,
    dirty: true,
    _inflight: null,
    // Bumped whenever a caller declares the cached data dead. A response issued
    // under an older epoch is answered to whoever asked for it but is NOT
    // allowed to become the cached value — it predates a write we know about.
    _epoch: 0,
    _tickOpen: false,
    async get(...args) {
      if (!this.dirty && this.data) return this.data;
      if (this._inflight) return this._inflight;
      const epoch = this._epoch;
      const p = fetcher(...args)
        .then(result => {
          if (this._inflight === p) this._inflight = null;
          if (epoch === this._epoch) {
            this.data  = result;
            this.dirty = false;
          }
          return result;
        })
        .catch(err => {
          if (this._inflight === p) this._inflight = null;
          throw err;
        });
      this._inflight = p;
      return p;
    },
    invalidate() {
      this.dirty = true;
      this._epoch++;
    },
    // "Something changed — read it back." A request already in flight was issued
    // BEFORE that change, so adopting it hands back pre-write state: craft an
    // item and the response that arrives is the inventory without it, cached as
    // if it were fresh. So a refresh abandons the in-flight request and starts
    // its own.
    //
    // Callers in the SAME tick still share one request, which is what keeps a
    // single navigation (refreshResourceBar + refreshNavLock, main.js:152) to
    // one /bootstrap rather than two.
    refresh(...args) {
      if (!this._tickOpen) {
        this._tickOpen = true;
        Promise.resolve().then(() => { this._tickOpen = false; });
        this._epoch++;
        this._inflight = null;
      }
      this.dirty = true;
      return this.get(...args);
    },
  };
}

export const bootstrapCache = makeCache(chat_id => api(`/bootstrap?chat_id=${chat_id}`));

// resourceCache / structuresCache are kept as separate exports for call sites that
// only need one slice, but they're both backed by the same bootstrapCache fetch so
// concurrent calls (e.g. refreshResourceBar + refreshNavLock + a screen's own load())
// collapse into a single /api/bootstrap request instead of one request each.
export const resourceCache = {
  get(chat_id)  { return bootstrapCache.get(chat_id).then(b => b.resources); },
  invalidate()  { bootstrapCache.invalidate(); },
};
export const structuresCache = {
  get(chat_id)  { return bootstrapCache.get(chat_id).then(b => b.structures); },
  invalidate()  { bootstrapCache.invalidate(); },
};
// Same backing fetch again — /bootstrap now carries the player's items, so a
// screen that needs roster + items + resources costs ONE request, not three.
export const itemsCache = {
  get(chat_id)  { return bootstrapCache.get(chat_id).then(b => b.items || []); },
  invalidate()  { bootstrapCache.invalidate(); },
};

export function setActiveNav(screen) {
  document.querySelectorAll('#bottom-nav .nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === screen);
  });
}

const LOCKED_UNTIL_THRONE_1 = ['roster', 'embark', 'spells'];

export async function refreshNavLock(player) {
  const nav = document.getElementById('bottom-nav');
  if (!nav || !player?.chat_id) return;
  let throneLevel = 0;
  try {
    const boot = await bootstrapCache.refresh(player.chat_id);
    throneLevel = boot.structures?.buildings_data?.slot_0?.level ?? 0;
  } catch {
    throneLevel = 0;
  }
  const locked = throneLevel < 1;
  LOCKED_UNTIL_THRONE_1.forEach(screen => {
    const btn = nav.querySelector(`.nav-btn[data-screen="${screen}"]`);
    if (!btn) return;
    btn.classList.toggle('disabled', locked);
    btn.classList.toggle('nav-btn--locked', locked);
  });
}

export async function refreshResourceBar(player) {
  const bar = document.getElementById('resource-bar');
  if (!bar) return;
  const boot = await bootstrapCache.refresh(player.chat_id);
  const inventory = boot.resources || [];
  const find = name => inventory.find(r => r.item === name) || { amount: 0 };
  // Resources only — 7 slots: gold + 6 crystals, drawn from RESOURCE_BAR_SLOTS so
  // the build-cost bar that sits under this strip lines up column for column.
  // The timeline and errands buttons live OUTSIDE this element (see the
  // resource-bar-row in main.js), so rebuilding the strip never touches them.
  bar.innerHTML = RESOURCE_BAR_SLOTS.map(slot => `
    <div class="res-bar-item">
      <span class="res-bar-icon">${slot.icon}</span>
      <span class="res-bar-val">${find(slot.key).amount}</span>
    </div>`).join('');
}

let _navigate = null;
export function setNavigate(fn) { _navigate = fn; }
export function navigate(screen, params = {}) {
  if (_navigate) _navigate(screen, params);
}