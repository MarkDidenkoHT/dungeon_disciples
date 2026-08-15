import { RESOURCE_BAR_SLOTS, uiText } from './utils.js';

let _sessionToken = null;

export function setSessionToken(token) {
  _sessionToken = token;
}

// EventSource cannot set request headers, so the battle stream has to carry the
// token in its query string. This is the one place that hands it out.
export function getSessionToken() { return _sessionToken; }

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
  if (!res.ok) {
    // `error` is an English developer string. When the endpoint also sends a
    // stable `code`, it rides along so callers can show a translated message
    // instead of surfacing the raw English to the player.
    const err = new Error(data.error || `HTTP ${res.status}`);
    if (data.code) err.code = data.code;
    // An unexpected server failure now answers with a stable code instead of the
    // raw exception text (see serverError in routes/index.js). Several screens
    // put err.message straight in front of the player via alert(), so translate
    // this one here rather than in each of them — the real detail is in the
    // server log, and 'Server error' told a Russian player nothing anyway.
    if (data.code === 'internal') {
      err.message = uiText('Something went wrong. Please try again.',
                           'Что-то пошло не так. Попробуйте ещё раз.');
    }
    throw err;
  }
  return data;
}

// How long a clean cache entry is trusted without asking the server again.
// Not a correctness mechanism — every write already invalidates or patches, so
// the cache is exact for anything THIS client did. It exists for the state that
// changes without us: a build or errand finishing on a server timer, or the
// player acting from a second device. Short enough that a stale timer is never
// visible for long, long enough that castle → roster → castle is one request
// instead of three.
const CACHE_TTL_MS = 15000;

function makeCache(fetcher, ttlMs = CACHE_TTL_MS) {
  return {
    _ttl: ttlMs,
    data: null,
    dirty: true,
    _at: 0,
    _inflight: null,
    // Bumped whenever a caller declares the cached data dead. A response issued
    // under an older epoch is answered to whoever asked for it but is NOT
    // allowed to become the cached value — it predates a write we know about.
    _epoch: 0,
    _tickOpen: false,
    async get(...args) {
      const fresh = Date.now() - this._at < this._ttl;
      if (!this.dirty && this.data && fresh) return this.data;
      if (this._inflight) return this._inflight;
      const epoch = this._epoch;
      const p = fetcher(...args)
        .then(result => {
          if (this._inflight === p) this._inflight = null;
          if (epoch === this._epoch) {
            this.data  = result;
            this.dirty = false;
            this._at   = Date.now();
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
    // "I already have the new state — here it is." For a write whose response
    // carries the updated rows (craft, equip, unequip all return the full item
    // list), this is strictly better than refresh(): no second round-trip, and
    // no window in which that read can answer with pre-write data. The write
    // endpoint read the rows back itself, so this is the freshest view there is.
    //
    // Returns the merged bootstrap, or null when nothing is cached yet — the
    // caller should fall back to refresh() in that case, since there is no base
    // object to merge into.
    //
    // `partial` may be an object or a function of the current data.
    patch(partial) {
      if (!this.data) return null;
      const next = typeof partial === 'function' ? partial(this.data) : partial;
      if (!next || typeof next !== 'object') return this.data;
      this.data = { ...this.data, ...next };
      // Anything already in flight was issued BEFORE this write, so it must not
      // be allowed to land on top of what we just applied.
      this._epoch++;
      this._inflight = null;
      this.dirty = false;
      // A patch carries post-write state straight from the endpoint, so this is
      // the freshest the cache ever gets — restart the TTL from here.
      this._at = Date.now();
      return this.data;
    },
  };
}

export const bootstrapCache = makeCache(chat_id => api(`/bootstrap?chat_id=${chat_id}`));

// The errand strip button asks for this on EVERY navigation — see
// refreshErrandButton, called from navigate() in main.js — and the answer only
// decides whether the button glows and which roster ids are away. Uncached, that
// made a tab switch to Settings cost the most expensive read in the app:
// /errands runs ensureErrandOffer, which is three parallel queries plus an
// INSERT when no offer exists yet.
//
// Its own TTL, longer than the bootstrap's: nothing the player does changes
// errand state except starting one or acknowledging a finished one, and both of
// those refresh() this cache explicitly. What is left is a server timer ticking
// over, which no one is watching for to the second.
const ERRANDS_TTL_MS = 60000;
export const errandsCache = makeCache(chat_id => api(`/errands?chat_id=${chat_id}`), ERRANDS_TTL_MS);

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
    // get(), not refresh(): this runs on EVERY navigation, and forcing a round
    // trip here meant tab-switching cost a /bootstrap each time even though
    // nothing had changed. Writes invalidate the cache themselves, and the TTL
    // covers server-side changes, so the cached copy is trustworthy.
    const boot = await bootstrapCache.get(player.chat_id);
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
  const boot = await bootstrapCache.get(player.chat_id);
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