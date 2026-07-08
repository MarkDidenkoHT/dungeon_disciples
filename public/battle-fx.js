// Lightweight PixiJS layer for battle ability/action animations.
//
// Scope on purpose: this is a proof-of-concept foundation, not a full VFX
// system. One PIXI.Application overlays the battle screen in a single shared
// canvas, positioned absolutely and non-interactive (pointer-events: none) so
// it never blocks clicks on the real DOM cells underneath. Effects are plain
// functions that take a target cell DOM element and animate something at that
// position - see playHealEffect below for the pattern. Add new effect
// functions here, then trigger them from battle.js's log-diffing code (see
// animateAfterRender).
//
// IMPORTANT: battle.js's render() fully replaces its container's innerHTML on
// every action (a fresh DOM tree each time). The PIXI Application is created
// ONCE per battle screen mount and reused - it is NEVER destroyed/recreated on
// every render, only re-parented (a cheap DOM move) into the fresh container
// and resized to match. Recreating a WebGL-backed PIXI.Application repeatedly
// (once per action) exhausts the browser's WebGL context budget within a
// handful of actions, which shows up as visual corruption ("golden glitches")
// and then silent failure once contexts stop being grantable. Call
// initBattleFx(root) once when the battle screen mounts, then call
// reattachBattleFx(root) at the end of every render() after the innerHTML
// swap - it's a no-op if nothing changed.
//
// Requires the PIXI global (loaded via CDN script tag in index.html). If PIXI
// isn't available for any reason, every function here becomes a safe no-op -
// animations are pure enhancement, never required for the battle to work.

let app = null;
let rootEl = null;

function destroyBattleFx() {
  if (app) {
    try { app.destroy(true, { children: true, texture: true, baseTexture: true }); } catch {}
    app = null;
  }
  rootEl = null;
}

// Call ONCE when the battle screen mounts (not on every render). Safe to call
// again later (e.g. re-entering the battle screen) - it tears down any
// previous instance first, so there is never more than one WebGL context
// alive for the battle screen at a time.
function initBattleFx(root) {
  destroyBattleFx();
  if (typeof window === 'undefined' || !window.PIXI || !root) return;

  rootEl = root;

  try {
    app = new PIXI.Application({
      resizeTo: root,
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

  if (getComputedStyle(root).position === 'static') {
    root.style.position = 'relative';
  }
  root.appendChild(view);
}

// Call at the end of every render() after the innerHTML swap. render()
// replaces the container's children wholesale, which silently detaches the
// canvas from the DOM (it still exists in memory, just not visible). This
// re-appends it - a cheap DOM move, not a recreation - and lets PIXI's
// resizeTo pick up any size change on its own.
function reattachBattleFx(root) {
  if (!app || !root) return;
  rootEl = root;
  if (app.view.parentElement !== root) {
    if (getComputedStyle(root).position === 'static') {
      root.style.position = 'relative';
    }
    root.appendChild(app.view);
  }
}

function cellCenter(cellEl) {
  if (!app || !rootEl || !cellEl) return null;
  const cellRect = cellEl.getBoundingClientRect();
  const baseRect = rootEl.getBoundingClientRect();
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

export { initBattleFx, reattachBattleFx, destroyBattleFx, playHealEffect };