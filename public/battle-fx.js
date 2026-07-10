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
  } catch (err) {
    console.error('[battle-fx] Failed to create PIXI.Application', err);
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
  console.log('[battle-fx] PIXI app initialized', { w: host.clientWidth, h: host.clientHeight });
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

// ── Mithrail's Light ──────────────────────────────────────────────────────────
export async function mithrails_light(cellEl) {
  console.log('[battle-fx] mithrails_light START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const layer = new PIXI.Container();
  app.stage.addChild(layer);
  const rect = new PIXI.Graphics();
  rect.filters = [new PIXI.BlurFilter(6)];
  layer.addChild(rect);
  await animate(800, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;
    const flashH = b.height * 0.6;
    const riseY  = b.y + b.height - flashH * t;
    rect.clear();
    const alpha = t < 0.2 ? t / 0.2 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
    rect.beginFill(0xffe08a, 0.55 * alpha);
    rect.drawRect(b.x, riseY, b.width, flashH);
    rect.endFill();
  });
  layer.destroy({ children: true });
  console.log('[battle-fx] mithrails_light END', dataId);
}

// ── Communion — single particle + fading line ─────────────────────────────────
export async function communion(sourceCellEl, targetCellEl) {
  console.log('[battle-fx] communion START', sourceCellEl?.dataset?.id, '->', targetCellEl?.dataset?.id);
  if (!sourceCellEl || !targetCellEl || !app || !window.PIXI) return;
  const srcId = sourceCellEl.dataset.id;
  const dstId = targetCellEl.dataset.id;
  const layer = new PIXI.Container();
  app.stage.addChild(layer);
  const line = new PIXI.Graphics();
  const particle = new PIXI.Graphics();
  particle.beginFill(0xff1e1e);
  particle.drawCircle(0, 0, 6);
  particle.endFill();
  layer.addChild(line);
  layer.addChild(particle);
  await animate(700, t => {
    const s = cellBoundsFor(srcId), d = cellBoundsFor(dstId);
    if (!s || !d) { layer.visible = false; return; }
    const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
    const dx = d.x + d.width / 2, dy = d.y + d.height / 2;
    line.clear();
    line.lineStyle(4, 0x8a0303, 0.9 * (1 - t));
    line.moveTo(sx, sy);
    line.lineTo(dx, dy);
    particle.position.set(sx + (dx - sx) * t, sy + (dy - sy) * t);
    particle.alpha = 1 - Math.abs(0.5 - t) * 2;
  });
  layer.destroy({ children: true });
  console.log('[battle-fx] communion END', srcId, '->', dstId);
}

// ── Attack — melee border flash, ranged orb travel ────────────────────────────
// Color per damage source
const SOURCE_COLOR = {
  physical: 0xdddddd,
  death:    0x9b30ff,
  fire:     0xff6600,
  life:     0xffd966,
  cold:     0x88ccff,
  nature:   0x66cc44,
};

function sourceColor(dmgSource) {
  return SOURCE_COLOR[dmgSource] || SOURCE_COLOR.physical;
}

// Melee: sharp border flash on the target cell
async function attackMelee(targetDataId, color) {
  const layer = new PIXI.Container();
  app.stage.addChild(layer);
  const border = new PIXI.Graphics();
  layer.addChild(border);
  await animate(400, t => {
    const b = cellBoundsFor(targetDataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;
    const alpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
    border.clear();
    border.lineStyle(4, color, alpha);
    border.drawRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4);
  });
  layer.destroy({ children: true });
}

// Ranged: small orb travels from source to target, impact flash on arrival
async function attackRanged(srcDataId, dstDataId, color) {
  const layer = new PIXI.Container();
  app.stage.addChild(layer);
  const orb = new PIXI.Graphics();
  orb.beginFill(color);
  orb.drawCircle(0, 0, 5);
  orb.endFill();
  orb.filters = [new PIXI.BlurFilter(2)];
  const impact = new PIXI.Graphics();
  layer.addChild(orb);
  layer.addChild(impact);
  await animate(500, t => {
    const s = cellBoundsFor(srcDataId), d = cellBoundsFor(dstDataId);
    if (!s || !d) { layer.visible = false; return; }
    layer.visible = true;
    const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
    const dx = d.x + d.width / 2, dy = d.y + d.height / 2;
    // Orb travels first 70% of duration
    const travelT = Math.min(1, t / 0.7);
    orb.position.set(sx + (dx - sx) * travelT, sy + (dy - sy) * travelT);
    orb.alpha = t < 0.65 ? 1 : Math.max(0, 1 - (t - 0.65) / 0.05);
    // Impact flash after orb arrives
    impact.clear();
    if (t > 0.65) {
      const it = (t - 0.65) / 0.35;
      impact.lineStyle(3, color, Math.max(0, 1 - it));
      impact.drawCircle(dx, dy, d.width * 0.35 * it);
    }
  });
  layer.destroy({ children: true });
}

// Public attack effect — called with (targetCell, { sourceId, dmgSource, range })
export async function attack(targetCellEl, opts = {}) {
  console.log('[battle-fx] attack START', targetCellEl?.dataset?.id, opts);
  if (!targetCellEl || !app || !window.PIXI) return;
  const color   = sourceColor(opts.dmgSource);
  const isRanged = (opts.range ?? 1) > 1;
  if (isRanged && opts.sourceId) {
    await attackRanged(opts.sourceId, targetCellEl.dataset.id, color);
  } else {
    await attackMelee(targetCellEl.dataset.id, color);
  }
  console.log('[battle-fx] attack END', targetCellEl?.dataset?.id);
}

export const EFFECTS = {
  mithrails_light,
  communion,
  attack,
};