// PixiJS battle animation layer.
// Each exported effect function is async and resolves when the animation completes,
// allowing battle.js to await them sequentially for a proper turn playback flow.
// The engine knows nothing about visuals - effect names come from unit_abilities.js
// (effect_name field) or from action type strings in battle.js.

let app = null;
let rootEl = null;

function getBattleFxHost(root) {
  if (!root) return null;
  return root.querySelector?.('.screen-battle') || root;
}

export function destroyBattleFx() {
  if (app) {
    try { app.destroy(true, { children: true, texture: true, baseTexture: true }); } catch {}
    app = null;
  }
  rootEl = null;
}

function forceResize(root) {
  if (!app || !root) return;
  const w = root.clientWidth  || root.offsetWidth  || 1;
  const h = root.clientHeight || root.offsetHeight || 1;
  try { app.renderer.resize(w, h); } catch {}
}

export function initBattleFx(root) {
  const host = getBattleFxHost(root);
  destroyBattleFx();
  if (typeof window === 'undefined' || !window.PIXI || !host) return;
  rootEl = host;
  try {
    app = new PIXI.Application({ resizeTo: host, backgroundAlpha: 0, antialias: true });
  } catch {
    app = null;
    return;
  }
  const view = app.view;
  view.style.position = 'absolute';
  view.style.top = '0';
  view.style.left = '0';
  view.style.width = '100%';
  view.style.height = '100%';
  view.style.pointerEvents = 'none';
  view.style.zIndex = '20';
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(view);
  forceResize(host);
}

export function reattachBattleFx(root) {
  const host = getBattleFxHost(root);
  if (!app || !host) return;
  rootEl = host;
  if (app.view.parentElement !== host) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(app.view);
  }
  forceResize(host);
}

function cellBoundsFor(dataId) {
  if (!app || !rootEl || !dataId) return null;
  const cellEl = rootEl.querySelector(`.battle-cell[data-id="${dataId}"]`);
  if (!cellEl) return null;
  const cellRect = cellEl.getBoundingClientRect();
  const baseRect = rootEl.getBoundingClientRect();
  return { x: cellRect.left - baseRect.left, y: cellRect.top - baseRect.top, width: cellRect.width, height: cellRect.height };
}

function animate(duration, onTick) {
  return new Promise(resolve => {
    if (!app) { resolve(); return; }
    const start = performance.now();
    const tick = () => {
      if (!app) { resolve(); return; }
      const t = Math.min(1, (performance.now() - start) / duration);
      onTick(t);
      if (t >= 1) { app.ticker.remove(tick); resolve(); }
    };
    app.ticker.add(tick);
  });
}

// ── Internal primitives ────────────────────────────────────────────────────

function _healBorder(dataId, color, duration = 1000) {
  if (!app) return Promise.resolve();
  const layer = new PIXI.Container();
  app.stage.addChild(layer);
  const pad = 3, radius = 10;
  const glow = new PIXI.Graphics();
  glow.filters = [new PIXI.BlurFilter(7)];
  const crisp = new PIXI.Graphics();
  layer.addChild(glow); layer.addChild(crisp);
  let lastW = -1, lastH = -1;
  return animate(duration, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;
    const w = b.width - pad * 2, h = b.height - pad * 2;
    if (w !== lastW || h !== lastH) {
      glow.clear(); glow.lineStyle(7, color, 0.55); glow.drawRoundedRect(pad, pad, w, h, radius);
      crisp.clear(); crisp.lineStyle(1.5, color, 0.9); crisp.drawRoundedRect(pad, pad, w, h, radius);
      lastW = w; lastH = h;
    }
    layer.pivot.set(b.width / 2, b.height / 2);
    layer.position.set(b.x + b.width / 2, b.y + b.height / 2);
    const breathe = 1 + Math.sin(t * Math.PI) * 0.03;
    layer.scale.set(breathe);
    let alpha = t < 0.15 ? t / 0.15 : t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
    glow.alpha = alpha * 0.65; crisp.alpha = alpha * 0.85;
  }).then(() => layer.destroy({ children: true }));
}

function _redBorder(dataId, duration = 600) {
  if (!app) return Promise.resolve();
  const layer = new PIXI.Container();
  app.stage.addChild(layer);
  const border = new PIXI.Graphics();
  layer.addChild(border);
  return animate(duration, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    border.clear();
    border.lineStyle(4, 0xff4f4f, 0.9 * (1 - t));
    border.drawRoundedRect(2, 2, b.width - 4, b.height - 4, 8);
    layer.pivot.set(b.width / 2, b.height / 2);
    layer.position.set(b.x + b.width / 2, b.y + b.height / 2);
    layer.scale.set(1 + t * 0.08);
  }).then(() => layer.destroy({ children: true }));
}

// ── Exported effect functions ──────────────────────────────────────────────
// Each takes a cell element (or two for transfer effects) and returns a Promise.

export async function heal(cellEl) {
  if (!cellEl || !app) return;
  return _healBorder(cellEl.dataset.id, 0xfff3c4, 1000);
}

export async function mithrails_light(cellEl) {
  if (!cellEl || !app) return;
  return _healBorder(cellEl.dataset.id, 0xcfe8ff, 1000);
}

export async function renew(cellEl) {
  if (!cellEl || !app) return;
  return _healBorder(cellEl.dataset.id, 0xb8ffcc, 800);
}

export async function mothers_kiss(cellEl) {
  if (!cellEl || !app) return;
  return _healBorder(cellEl.dataset.id, 0xffd9f0, 800);
}

export async function attack(cellEl) {
  if (!cellEl || !app) return;
  return _redBorder(cellEl.dataset.id, 600);
}

export async function mend_flesh(cellEl) {
  if (!cellEl || !app) return;
  return _healBorder(cellEl.dataset.id, 0xd4f7a0, 900);
}

export async function repair(cellEl) {
  if (!cellEl || !app) return;
  // Cool steel-blue for mechanical repair
  return _healBorder(cellEl.dataset.id, 0xa0c8ff, 900);
}

export async function defend(cellEl) {
  if (!cellEl || !app) return;
  if (!window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const layer = new PIXI.Container();
  app.stage.addChild(layer);
  const circle = new PIXI.Graphics();
  layer.addChild(circle);
  return animate(800, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    circle.clear();
    circle.lineStyle(5, 0x70c0ff, Math.max(0, 0.8 - t));
    circle.drawCircle(0, 0, Math.min(b.width, b.height) / 2 + t * 10);
    layer.position.set(b.x + b.width / 2, b.y + b.height / 2);
  }).then(() => layer.destroy({ children: true }));
}

export async function chain(cellEl) {
  if (!cellEl || !app) return;
  return _redBorder(cellEl.dataset.id, 500);
}

export async function thorns(cellEl) {
  if (!cellEl || !app) return;
  return _redBorder(cellEl.dataset.id, 500);
}

// Transfer effect: draws a particle travelling from sourceCellEl to targetCellEl.
export async function communion(sourceCellEl, targetCellEl) {
  if (!sourceCellEl || !targetCellEl || !app || !window.PIXI) return;
  const srcId = sourceCellEl.dataset.id;
  const dstId = targetCellEl.dataset.id;
  const layer = new PIXI.Container();
  app.stage.addChild(layer);
  const line = new PIXI.Graphics();
  const particle = new PIXI.Graphics();
  particle.beginFill(0xff1e1e); particle.drawCircle(0, 0, 6); particle.endFill();
  layer.addChild(line); layer.addChild(particle);
  return animate(700, t => {
    const s = cellBoundsFor(srcId), d = cellBoundsFor(dstId);
    if (!s || !d) { layer.visible = false; return; }
    const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
    const dx = d.x + d.width / 2, dy = d.y + d.height / 2;
    line.clear(); line.lineStyle(4, 0x8a0303, 0.9 * (1 - t));
    line.moveTo(sx, sy); line.lineTo(dx, dy);
    particle.position.set(sx + (dx - sx) * t, sy + (dy - sy) * t);
    particle.alpha = 1 - Math.abs(0.5 - t) * 2;
  }).then(() => layer.destroy({ children: true }));
}

// ── Effect name → function map (used by battle.js) ───────────────────────
export const EFFECTS = {
  heal, mithrails_light, renew, mothers_kiss,
  attack, mend_flesh, repair, defend,
  chain, thorns, communion,
};