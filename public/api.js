import { GOLD_ICON } from './utils.js';

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
    async get(...args) {
      if (!this.dirty && this.data) return this.data;
      if (this._inflight) return this._inflight;
      this._inflight = fetcher(...args)
        .then(result => {
          this.data     = result;
          this.dirty    = false;
          this._inflight = null;
          return result;
        })
        .catch(err => {
          this._inflight = null;
          throw err;
        });
      return this._inflight;
    },
    invalidate() {
      this.dirty = true;
    },
  };
}

export const resourceCache  = makeCache(chat_id => api(`/inventory?chat_id=${chat_id}&type=resource`));
export const structuresCache = makeCache(chat_id => api(`/structures?chat_id=${chat_id}`));

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
    structuresCache.invalidate();
    const structures = await structuresCache.get(player.chat_id);
    throneLevel = structures?.buildings_data?.slot_0?.level ?? 0;
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
  resourceCache.invalidate();
  const inventory = await resourceCache.get(player.chat_id);
  const find = name => inventory.find(r => r.item === name) || { amount: 0 };
  bar.innerHTML = `
    <div class="res-bar-item"><span class="res-bar-icon">${GOLD_ICON}</span><span class="res-bar-val">${find('Gold').amount}</span></div>
    <div class="res-bar-item"><span class="res-bar-icon"><img src="/assets/icons/recources/life.png"   class="res-icon-img" alt="Life"></span><span class="res-bar-val">${find('Crystals_Life').amount}</span></div>
    <div class="res-bar-item"><span class="res-bar-icon"><img src="/assets/icons/recources/fire.png"   class="res-icon-img" alt="Fire"></span><span class="res-bar-val">${find('Crystals_Fire').amount}</span></div>
    <div class="res-bar-item"><span class="res-bar-icon"><img src="/assets/icons/recources/death.png"  class="res-icon-img" alt="Death"></span><span class="res-bar-val">${find('Crystals_Death').amount}</span></div>
    <div class="res-bar-item"><span class="res-bar-icon"><img src="/assets/icons/recources/nature.png" class="res-icon-img" alt="Nature"></span><span class="res-bar-val">${find('Crystals_Nature').amount}</span></div>
    <div class="res-bar-item"><span class="res-bar-icon"><img src="/assets/icons/recources/cold.png"   class="res-icon-img" alt="Frost"></span><span class="res-bar-val">${find('Crystals_Frost').amount}</span></div>
  `;
}

let _navigate = null;
export function setNavigate(fn) { _navigate = fn; }
export function navigate(screen, params = {}) {
  if (_navigate) _navigate(screen, params);
}