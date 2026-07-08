// Lightweight PixiJS layer for battle ability/action animations.
//
// Scope on purpose: this is a proof-of-concept foundation, not a full VFX
// system. One PIXI.Application overlays the whole battle arena (both grids)
// in a single shared canvas, positioned absolutely and non-interactive
// (pointer-events: none) so it never blocks clicks on the real DOM cells
// underneath. Effects are plain functions that take a target cell DOM element
// and animate something at that position - see playHealEffect below for the
// pattern. Add new effect functions here, then trigger them from
// battle.js's log-diffing code (see registerLogAnimation calls in
// animateAfterRender).
//
// Requires the PIXI global (loaded via CDN script tag in index.html). If PIXI
// isn't available for any reason, every function here becomes a safe no-op -
// animations are pure enhancement, never required for the battle to work.

let app = null;
let containerEl = null;

function destroyBattleFx() {
  if (app) {
    try { app.destroy(true, { children: true, texture: true, baseTexture: true }); } catch {}
    app = null;
  }
  containerEl = null;
}

// Call once, right after the battle arena DOM exists (see battle.js). Safe to
// call again later (e.g. re-entering the battle screen) - it tears down any
// previous instance first.
function initBattleFx(container) {
  destroyBattleFx();
  if (typeof window === 'undefined' || !window.PIXI || !container) return;

  containerEl = container;

  try {
    app = new PIXI.Application({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
    });
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
  view.style.zIndex = '15';

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  container.appendChild(view);
}

function cellCenter(cellEl) {
  if (!app || !containerEl || !cellEl) return null;
  const cellRect = cellEl.getBoundingClientRect();
  const baseRect = containerEl.getBoundingClientRect();
  return {
    x: cellRect.left - baseRect.left + cellRect.width / 2,
    y: cellRect.top - baseRect.top + cellRect.height / 2,
  };
}

// Warm golden glow + a handful of rising light motes. Used for heal-type log
// entries (Mithrail's Light, the generic heal action, etc).
function playHealEffect(cellEl) {
  if (!app || !cellEl) return;
  const pos = cellCenter(cellEl);
  if (!pos) return;

  const layer = new PIXI.Container();
  layer.x = pos.x;
  layer.y = pos.y;
  app.stage.addChild(layer);

  const glow = new PIXI.Graphics();
  glow.beginFill(0xffd97a, 0.55);
  glow.drawCircle(0, 0, 6);
  glow.endFill();
  glow.filters = [new PIXI.BlurFilter(8)];
  layer.addChild(glow);

  const ring = new PIXI.Graphics();
  ring.lineStyle(3, 0xfff3c4, 0.9);
  ring.drawCircle(0, 0, 4);
  layer.addChild(ring);

  const moteCount = 7;
  const motes = [];
  for (let i = 0; i < moteCount; i++) {
    const mote = new PIXI.Graphics();
    mote.beginFill(0xfff6da, 0.9);
    mote.drawCircle(0, 0, 1.6 + Math.random() * 1.4);
    mote.endFill();
    const angle  = (Math.PI * 2 * i) / moteCount + Math.random() * 0.4;
    const radius = 10 + Math.random() * 6;
    mote.x = Math.cos(angle) * radius;
    mote.y = Math.sin(angle) * radius * 0.6;
    mote._vy    = -(0.4 + Math.random() * 0.5);
    mote._delay = Math.random() * 120;
    layer.addChild(mote);
    motes.push(mote);
  }

  const duration = 900;
  const start = performance.now();

  const tick = () => {
    if (!app) return; // destroyed mid-animation
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / duration);

    glow.scale.set(0.6 + t * 2.2);
    glow.alpha = 0.55 * (1 - t);

    ring.scale.set(0.4 + t * 2.6);
    ring.alpha = 0.9 * (1 - t);

    motes.forEach(mote => {
      const mt = Math.max(0, Math.min(1, (elapsed - mote._delay) / (duration - mote._delay)));
      mote.y += mote._vy;
      mote.alpha = mt < 0.15 ? mt / 0.15 : 1 - (mt - 0.15) / 0.85;
    });

    if (t >= 1) {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    }
  };

  app.ticker.add(tick);
}

export { initBattleFx, destroyBattleFx, playHealEffect };