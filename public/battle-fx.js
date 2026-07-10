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
  if (!cellEl) {
    console.warn('[battle-fx] cellBoundsFor: cell not found for id', dataId);
    return null;
  }
  const cellRect = cellEl.getBoundingClientRect();
  const baseRect = rootEl.getBoundingClientRect();
  return { x: cellRect.left - baseRect.left, y: cellRect.top - baseRect.top, width: cellRect.width, height: cellRect.height };
}

function animate(duration, onTick) {
  return new Promise(resolve => {
    if (!app) { console.warn('[battle-fx] animate: no app'); resolve(); return; }
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

// Warm golden flash rising from bottom to top of the cell.
export async function mithrails_light(cellEl) {
  console.log('[battle-fx] mithrails_light START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) {
    console.warn('[battle-fx] mithrails_light SKIP - missing cellEl or app or PIXI', { cellEl: !!cellEl, app: !!app, PIXI: !!window.PIXI });
    return;
  }
  const dataId = cellEl.dataset.id;
  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  const rect = new PIXI.Graphics();
  rect.filters = [new PIXI.BlurFilter(6)];
  layer.addChild(rect);

  const duration = 800;

  await animate(duration, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    // Flash rises from bottom: y position moves from bottom to top as t increases
    const flashH = b.height * 0.6;
    const riseY  = b.y + b.height - flashH * t;

    rect.clear();
    // Fade in fast, hold briefly, fade out
    const alpha = t < 0.2 ? t / 0.2 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
    rect.beginFill(0xffe08a, 0.55 * alpha);
    rect.drawRect(b.x, riseY, b.width, flashH);
    rect.endFill();
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] mithrails_light END', dataId);
}

// Particle travelling from source cell to target cell along a line.
export async function communion(sourceCellEl, targetCellEl) {
  console.log('[battle-fx] communion START', sourceCellEl?.dataset?.id, '->', targetCellEl?.dataset?.id);
  if (!sourceCellEl || !targetCellEl || !app || !window.PIXI) {
    console.warn('[battle-fx] communion SKIP - missing args', { src: !!sourceCellEl, dst: !!targetCellEl, app: !!app });
    return;
  }
  const srcId = sourceCellEl.dataset.id;
  const dstId = targetCellEl.dataset.id;

  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  const COLOR    = 0xff2a2a;
  const COLOR_LT = 0xff8888;
  const DURATION = 900;
  const N_PARTICLES = 5;

  // One fading line connecting source to target
  const line = new PIXI.Graphics();
  layer.addChild(line);

  // Source pulse ring
  const srcRing = new PIXI.Graphics();
  layer.addChild(srcRing);

  // Target impact ring (starts invisible, pulses at arrival)
  const dstRing = new PIXI.Graphics();
  layer.addChild(dstRing);

  // Particles staggered across the path
  const particles = Array.from({ length: N_PARTICLES }, (_, i) => {
    const g = new PIXI.Graphics();
    const size = 3 + Math.random() * 3;
    g.beginFill(i % 2 === 0 ? COLOR : COLOR_LT, 1);
    g.drawCircle(0, 0, size);
    g.endFill();
    // Small trail circles
    for (let j = 1; j <= 3; j++) {
      const trail = new PIXI.Graphics();
      trail.beginFill(COLOR, 0.3 / j);
      trail.drawCircle(0, 0, size * 0.6 / j);
      trail.endFill();
      g._trail = g._trail || [];
      g._trail.push(trail);
      layer.addChild(trail);
    }
    layer.addChild(g);
    return { g, delay: i / N_PARTICLES * 0.45, size };
  });

  await animate(DURATION, t => {
    const s = cellBoundsFor(srcId), d = cellBoundsFor(dstId);
    if (!s || !d) { layer.visible = false; return; }
    layer.visible = true;

    const sx = s.x + s.width / 2,  sy = s.y + s.height / 2;
    const dx = d.x + d.width / 2,  dy = d.y + d.height / 2;

    // Fading line
    line.clear();
    line.lineStyle(2, COLOR, 0.35 * (1 - t));
    line.moveTo(sx, sy);
    line.lineTo(dx, dy);

    // Source pulse - expands and fades out over first half
    srcRing.clear();
    if (t < 0.5) {
      const r = (s.width * 0.3) * (t * 2);
      srcRing.lineStyle(3, COLOR, 0.7 * (1 - t * 2));
      srcRing.drawCircle(sx, sy, r);
    }

    // Target impact ring - appears in second half
    dstRing.clear();
    if (t > 0.6) {
      const it = (t - 0.6) / 0.4;
      dstRing.lineStyle(3, COLOR_LT, 0.8 * (1 - it));
      dstRing.drawCircle(dx, dy, (d.width * 0.35) * it);
    }

    // Particles travel along the path with stagger
    for (const { g, delay, size } of particles) {
      const pt = Math.max(0, Math.min(1, (t - delay) / (1 - delay)));
      if (pt <= 0) { g.alpha = 0; if (g._trail) g._trail.forEach(tr => { tr.alpha = 0; }); continue; }

      // Slight arc via perpendicular offset
      const midX = (sx + dx) / 2 + (dy - sy) * 0.08;
      const midY = (sy + dy) / 2 - (dx - sx) * 0.08;
      const bx = (1 - pt) * (1 - pt) * sx + 2 * (1 - pt) * pt * midX + pt * pt * dx;
      const by = (1 - pt) * (1 - pt) * sy + 2 * (1 - pt) * pt * midY + pt * pt * dy;

      g.position.set(bx, by);
      g.alpha = pt < 0.1 ? pt / 0.1 : pt > 0.85 ? (1 - pt) / 0.15 : 1;

      // Trail circles behind
      if (g._trail) {
        g._trail.forEach((tr, j) => {
          const trailPt = Math.max(0, pt - 0.04 * (j + 1));
          const tbx = (1 - trailPt) * (1 - trailPt) * sx + 2 * (1 - trailPt) * trailPt * midX + trailPt * trailPt * dx;
          const tby = (1 - trailPt) * (1 - trailPt) * sy + 2 * (1 - trailPt) * trailPt * midY + trailPt * trailPt * dy;
          tr.position.set(tbx, tby);
          tr.alpha = g.alpha * (0.4 / (j + 1));
        });
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] communion END', srcId, '->', dstId);
}

export const EFFECTS = {
  mithrails_light,
  communion,
};