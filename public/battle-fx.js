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

function forceResize(root) {
  if (!app || !root) return;
  const w = root.clientWidth  || root.offsetWidth  || 1;
  const h = root.clientHeight || root.offsetHeight || 1;
  try { app.renderer.resize(w, h); } catch {}
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
  forceResize(root);
}

// Call at the end of every render() after the innerHTML swap. render()
// replaces the container's children wholesale, which silently detaches the
// canvas from the DOM (it still exists in memory, just not visible). This
// re-appends it - a cheap DOM move, not a recreation - and forces a
// synchronous resize rather than relying solely on PIXI's resizeTo, which
// resizes via a ResizeObserver that fires asynchronously (next frame). Since
// effects are triggered synchronously right after render() in the same tick,
// waiting on the async observer means the canvas can still be the OLD size
// whenever the screen's layout size changed between renders (log panel
// growing, init-queue card count changing, etc.) - causing effects to be
// computed at the right on-screen position but drawn onto a canvas that
// hasn't caught up yet, landing off-position or clipped. Forcing the resize
// here makes it deterministic instead of a coin flip.
function reattachBattleFx(root) {
  if (!app || !root) return;
  rootEl = root;
  if (app.view.parentElement !== root) {
    if (getComputedStyle(root).position === 'static') {
      root.style.position = 'relative';
    }
    root.appendChild(app.view);
  }
  forceResize(root);
}

function cellBoundsFor(dataId) {
  if (!app || !rootEl || !dataId) return null;
  const cellEl = rootEl.querySelector(`.battle-cell[data-id="${dataId}"]`);
  if (!cellEl) return null;
  const cellRect = cellEl.getBoundingClientRect();
  const baseRect = rootEl.getBoundingClientRect();
  return {
    x: cellRect.left - baseRect.left,
    y: cellRect.top - baseRect.top,
    width: cellRect.width,
    height: cellRect.height,
  };
}

// Gentle, soothing bloom around the cell's border. Used for heal-type log
// entries (Mithrail's Light, the generic heal action, etc). A soft blurred
// outer glow plus a thin crisp inner line, both tracing the cell's rounded
// border, fading in, breathing very slightly, then fading back out.
//
// battle.js's render() replaces the whole battle screen's DOM on every
// action, and a follow-up render (e.g. advanceEnemyTurns firing right after
// this one) can land while this effect is still mid-animation - well within
// its ~1.3s duration. Rather than freezing the target's position/DOM node
// once at the start (which would go stale the moment a re-render swaps in a
// new element with the same data-id), position is re-resolved by data-id on
// every tick. If the cell can't be found for a frame (e.g. a render is
// mid-flight), that frame is simply skipped rather than snapping to (0,0).
function playHealEffect(cellEl) {
  if (!app || !cellEl) return;
  const dataId = cellEl.dataset.id;
  if (!dataId) return;

  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  const pad    = 3;
  const radius = 10;

  const glowBorder = new PIXI.Graphics();
  glowBorder.filters = [new PIXI.BlurFilter(7)];
  layer.addChild(glowBorder);

  const crispBorder = new PIXI.Graphics();
  layer.addChild(crispBorder);

  const duration = 1300;
  const start = performance.now();

  const redraw = (w, h) => {
    glowBorder.clear();
    glowBorder.lineStyle(7, 0xfff3c4, 0.55);
    glowBorder.drawRoundedRect(pad, pad, w, h, radius);

    crispBorder.clear();
    crispBorder.lineStyle(1.5, 0xfffaf0, 0.9);
    crispBorder.drawRoundedRect(pad, pad, w, h, radius);
  };

  let lastW = -1, lastH = -1;

  const tick = () => {
    if (!app) return; // destroyed mid-animation
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / duration);

    const b = cellBoundsFor(dataId);
    if (b) {
      const w = b.width  - pad * 2;
      const h = b.height - pad * 2;
      if (w !== lastW || h !== lastH) { redraw(w, h); lastW = w; lastH = h; }

      layer.visible = true;
      layer.pivot.set(b.width / 2, b.height / 2);
      layer.position.set(b.x + b.width / 2, b.y + b.height / 2);

      // Fade in quickly, hold softly, fade out slowly - a breath, not a burst.
      let alpha;
      if (t < 0.15)      alpha = t / 0.15;
      else if (t < 0.55) alpha = 1;
      else               alpha = Math.max(0, 1 - (t - 0.55) / 0.45);

      const breathe = 1 + Math.sin(t * Math.PI) * 0.03;
      layer.scale.set(breathe);

      glowBorder.alpha  = alpha * 0.65;
      crispBorder.alpha = alpha * 0.85;
    } else {
      // Cell temporarily unresolvable (mid-render) - hold last frame rather
      // than snapping anywhere, and keep ticking so it can recover.
      layer.visible = false;
    }

    if (t >= 1) {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    }
  };

  app.ticker.add(tick);
}

export { initBattleFx, reattachBattleFx, destroyBattleFx, playHealEffect };