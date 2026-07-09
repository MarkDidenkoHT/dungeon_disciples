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

function getBattleFxHost(root) {
  if (!root) return null;
  return root.querySelector?.('.screen-battle') || root;
}

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
  const host = getBattleFxHost(root);
  destroyBattleFx();
  if (typeof window === 'undefined' || !window.PIXI || !host) return;

  rootEl = host;

  try {
    if (!window.PIXI) {
      console.warn('battle-fx: PIXI not found on window');
    }
    app = new PIXI.Application({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
    });
    console.debug('battle-fx: PIXI app created', app && app.view && host);
  } catch (err) {
    console.error('battle-fx: failed to create PIXI.Application', err);
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

  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }
  host.appendChild(view);
  forceResize(host);
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
  const host = getBattleFxHost(root);
  if (!app || !host) return;
  rootEl = host;
  if (app.view.parentElement !== host) {
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
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
  return {
    x: cellRect.left - baseRect.left,
    y: cellRect.top - baseRect.top,
    width: cellRect.width,
    height: cellRect.height,
  };
}

const HEAL_TINTS = {
  default: { glow: 0xfff3c4, glowAlpha: 0.55, crisp: 0xfffaf0 },
  holy:    { glow: 0xcfe8ff, glowAlpha: 0.55, crisp: 0xeaf5ff },
};

function playHealEffect(cellEl, variant = 'default') {
  if (!cellEl || !app || typeof window === 'undefined' || !window.PIXI) return;

  const dataId = cellEl.dataset.id;
  if (!dataId) return;
  const tint = HEAL_TINTS[variant] || HEAL_TINTS.default;

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
    glowBorder.lineStyle(7, tint.glow, tint.glowAlpha);
    glowBorder.drawRoundedRect(pad, pad, w, h, radius);

    crispBorder.clear();
    crispBorder.lineStyle(1.5, tint.crisp, 0.9);
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
      layer.visible = false;
    }

    if (t >= 1) {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    }
  };

  app.ticker.add(tick);
}

function playHitEffect(cellEl) {
  if (!cellEl || !app || typeof window === 'undefined' || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  if (!dataId) return;

  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  const border = new PIXI.Graphics();
  layer.addChild(border);

  const duration = 700;
  const start = performance.now();

  const tick = () => {
    if (!app) return;
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / duration);
    const b = cellBoundsFor(dataId);
    if (b) {
      border.clear();
      border.lineStyle(4, 0xff4f4f, 0.9 * (1 - t));
      border.drawRoundedRect(2, 2, b.width - 4, b.height - 4, 8);
      layer.pivot.set(b.width / 2, b.height / 2);
      layer.position.set(b.x + b.width / 2, b.y + b.height / 2);
      layer.scale.set(1 + t * 0.08);
    }
    if (t >= 1) {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    }
  };

  app.ticker.add(tick);
}

function playShieldEffect(cellEl) {
  if (!cellEl || !app || typeof window === 'undefined' || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  if (!dataId) return;

  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  const circle = new PIXI.Graphics();
  layer.addChild(circle);

  const duration = 900;
  const start = performance.now();

  const tick = () => {
    if (!app) return;
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / duration);
    const b = cellBoundsFor(dataId);
    if (b) {
      circle.clear();
      const alpha = Math.max(0, 0.8 - t);
      circle.lineStyle(6, 0x70c0ff, alpha);
      const radius = Math.min(b.width, b.height) / 2 + t * 10;
      circle.drawCircle(0, 0, radius);
      layer.position.set(b.x + b.width / 2, b.y + b.height / 2);
    }
    if (t >= 1) {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    }
  };

  app.ticker.add(tick);
}

// Dedicated effect entry points. Each effect gets its own function so art/behavior
// can be changed independently later. Functions are registered on `window` by
// their effect string name so `entry.effect` can call them directly.
function holy_heal(cellEl) { playHealEffect(cellEl, 'holy'); }
function renew(cellEl) { /* reserved for Renew-specific VFX */ playHealEffect(cellEl, 'default'); }
function sacrifice(cellEl) { /* reserved for Sacrifice VFX */ playHitEffect(cellEl); }
function mothers_kiss(cellEl) { /* reserved for Mother's Kiss VFX */ playHealEffect(cellEl, 'default'); }
function heal(cellEl) { playHealEffect(cellEl, 'default'); }
function hit(cellEl) { playHitEffect(cellEl); }
function shield(cellEl) { playShieldEffect(cellEl); }

function playBattleEffect(effect, ...args) {
  if (!effect) return;
  // Log when an effect is triggered; if DOM elements are passed, log their data-id.
  try {
    const ids = args.map(a => (a && a.dataset && a.dataset.id) ? a.dataset.id : (typeof a === 'string' ? a : null)).filter(Boolean);
    console.debug('battle-fx: trigger effect', effect, ids.length ? ids : args.length ? args : null);
  } catch (e) { /* ignore logging errors */ }

  const host = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : null);
  const fn = host && host[effect];
  if (typeof fn === 'function') {
    try {
      fn(...args);
    } catch (err) {
      console.error('battle-fx: effect', effect, 'failed', err);
    }
  }
}

export { initBattleFx, reattachBattleFx, destroyBattleFx, playHealEffect, playBattleEffect };

// DEV HELPERS: expose a manual trigger to the console for quick debugging.
if (typeof window !== 'undefined') {
  try {
    window.__playHeal = playHealEffect;
    window.__playBattleEffect = playBattleEffect;
    // Register effect-named functions so engine-provided `entry.effect` strings
    // call the corresponding animation directly.
    window.heal = heal;
    window.holy_heal = holy_heal;
    window.renew = renew;
    window.sacrifice = sacrifice;
    window.mothers_kiss = mothers_kiss;
    window.hit = hit;
    window.shield = shield;
  } catch {}
}

// Register communion if available (defined later in file).
if (typeof window !== 'undefined') {
  try {
    if (typeof communion === 'function') window.communion = communion;
  } catch {}
}

function communion(sourceCellEl, targetCellEl) {
  if (!sourceCellEl || !targetCellEl || !app || typeof window === 'undefined' || !window.PIXI) return;
  const srcId = sourceCellEl.dataset.id;
  const dstId = targetCellEl.dataset.id;
  if (!srcId || !dstId) return;

  try { console.debug('battle-fx: communion start', srcId, '->', dstId); } catch (e) {}

  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  const line = new PIXI.Graphics();
  layer.addChild(line);

  const particle = new PIXI.Graphics();
  particle.beginFill(0xff1e1e);
  particle.drawCircle(0, 0, 6);
  particle.endFill();
  layer.addChild(particle);

  const start = performance.now();
  const duration = 700;

  let lastSrc = null, lastDst = null;

  const tick = () => {
    if (!app) return;
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / duration);

    const s = cellBoundsFor(srcId);
    const d = cellBoundsFor(dstId);
    if (s && d) {
      const sx = s.x + s.width / 2;
      const sy = s.y + s.height / 2;
      const dx = d.x + d.width / 2;
      const dy = d.y + d.height / 2;

      line.clear();
      const alpha = 1 - t;
      line.lineStyle(4, 0x8a0303, 0.9 * alpha);
      line.moveTo(sx, sy);
      line.lineTo(dx, dy);

      // particle travels from source -> target
      const px = sx + (dx - sx) * t;
      const py = sy + (dy - sy) * t;
      particle.position.set(px, py);
      particle.alpha = 1 - Math.abs(0.5 - t) * 2;
    }

    if (t >= 1) {
      app.ticker.remove(tick);
      // small heal + hit pulses
      try { playHitEffect(sourceCellEl); } catch {}
      try { playHealEffect(targetCellEl); } catch {}
      layer.destroy({ children: true });
      try { console.debug('battle-fx: communion end', srcId, '->', dstId); } catch (e) {}
    }
  };

  app.ticker.add(tick);
}