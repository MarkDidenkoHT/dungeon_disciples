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
    // Dev-only global speed override used by fx-preview.html. Undefined in
    // production, so this is a no-op there (divisor stays 1).
    const speed = (typeof window !== 'undefined' && Number(window.__FX_SPEED__)) || 1;
    duration = duration / speed;
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

// Fakes a radial-gradient glow (PIXI Graphics has no gradients) with concentric
// fills, brightest in the middle. Draw onto an ADD-blended, blurred layer.
function softGlow(g, x, y, radius, color, alpha) {
  if (alpha <= 0 || radius <= 0) return;
  const steps = 4;
  for (let i = steps; i >= 1; i--) {
    g.beginFill(color, alpha * (1 - (i - 1) / steps) * 0.5);
    g.drawCircle(x, y, radius * (i / steps));
    g.endFill();
  }
}

// Shared elemental burst on a single cell — used by noxious_death (plague/green)
// and last_verse (lava/flame). Same shape, palette swapped: a central bloom, an
// outward spray of motes, and an expanding shockwave ring.
async function elementalBurst(cellEl, pal) {
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const ADD = PIXI.BLEND_MODES.ADD;

  // Stable per-mote constants so the spray doesn't jitter frame to frame.
  const motes = Array.from({ length: 16 }, () => ({
    ang: rand(0, TAU), speed: rand(0.55, 1.15), size: rand(2, 5), drift: rand(-0.25, 0.25),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(6)];
  const bloom = new PIXI.Graphics(); bloom.blendMode = ADD;
  const moteG = new PIXI.Graphics(); moteG.blendMode = ADD;
  const ring  = new PIXI.Graphics();
  glowLayer.addChild(bloom, moteG);
  layer.addChild(glowLayer, ring);
  app.stage.addChild(layer);

  await animate(560, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);

    // Central bloom: snaps in, then fades over the rest of the burst.
    bloom.clear();
    const bloomA = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    softGlow(bloom, cx, cy, R * (0.5 + t * 0.5), pal.core, 0.7 * bloomA);
    softGlow(bloom, cx, cy, R * (0.3 + t * 0.4), pal.mid,  0.6 * bloomA);

    // Motes sprayed outward, fading as they travel.
    moteG.clear();
    for (const m of motes) {
      const dist = R * 0.95 * t * m.speed;
      const mx = cx + Math.cos(m.ang) * dist;
      const my = cy + Math.sin(m.ang) * dist + m.drift * dist;
      softGlow(moteG, mx, my, m.size * (1.4 - t * 0.6), pal.mid, 0.8 * (1 - t));
    }

    // Shockwave ring.
    ring.clear();
    ring.lineStyle(3 * (1 - t) + 1, pal.core, (1 - t) * 0.85);
    ring.drawCircle(cx, cy, R * 0.2 + t * R);
  });

  layer.destroy({ children: true });
}

// ── noxious_death — green plague nova on a dying unit's enemies ────────────────
export async function noxious_death(cellEl) {
  console.log('[battle-fx] noxious_death', cellEl?.dataset?.id);
  return elementalBurst(cellEl, { core: 0xeaffb0, mid: 0x63dd2b });
}

// ── last_verse — lava/flame nova, same shape as noxious_death ──────────────────
export async function last_verse(cellEl) {
  console.log('[battle-fx] last_verse', cellEl?.dataset?.id);
  return elementalBurst(cellEl, { core: 0xffe27a, mid: 0xff6a1a });
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
    // Portrait occupies ~top 80% of cell; start flash there not below the HP bar
    const portraitBottom = b.y + b.height * 0.80;
    const flashH = b.height * 0.75;
    const riseY  = portraitBottom - flashH * t;
    rect.clear();
    const alpha = t < 0.2 ? t / 0.2 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
    rect.beginFill(0xffe08a, 0.55 * alpha);
    rect.drawRect(b.x, riseY, b.width, flashH);
    rect.endFill();
  });
  layer.destroy({ children: true });
  console.log('[battle-fx] mithrails_light END', dataId);
}

// ── Communion — blood-drain ritual from a damaged enemy to a wounded ally ──────
// Ported from the standalone prototype: a phased windup → drain → transfer →
// bloom sequence, re-anchored to the source (drained) and target (healed) cells.
export async function communion(sourceCellEl, targetCellEl) {
  console.log('[battle-fx] communion START', sourceCellEl?.dataset?.id, '->', targetCellEl?.dataset?.id);
  if (!sourceCellEl?.dataset || !targetCellEl?.dataset || !app || !window.PIXI) return;
  const srcId = sourceCellEl.dataset.id;
  const dstId = targetCellEl.dataset.id;
  const TAU = Math.PI * 2;
  const rand   = (a, b) => a + Math.random() * (b - a);
  const lerp   = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ADD = PIXI.BLEND_MODES.ADD;

  // Fakes a radial-gradient glow (PIXI Graphics has no gradients) with a few
  // concentric fills — brightest in the middle. Meant to sit on an ADD-blended,
  // blurred layer so the steps read as a soft bloom.
  const softGlow = (g, x, y, radius, color, alpha) => {
    if (alpha <= 0 || radius <= 0) return;
    const steps = 4;
    for (let i = steps; i >= 1; i--) {
      g.beginFill(color, alpha * (1 - (i - 1) / steps) * 0.5);
      g.drawCircle(x, y, radius * (i / steps));
      g.endFill();
    }
  };

  // Stable per-particle constants so motion doesn't jitter frame to frame.
  const sparks = Array.from({ length: 16 }, () => ({
    ang: rand(0, TAU), rad: rand(26, 68), speed: rand(0.9, 1.5), delay: rand(0, 1), size: rand(2, 4),
  }));
  const mist = Array.from({ length: 18 }, () => ({
    delay: rand(0, 0.55), perp: rand(-1, 1), wob: rand(0, TAU), size: rand(10, 26), speed: rand(0.85, 1.15),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(5)];
  const sourceAura = new PIXI.Graphics(); sourceAura.blendMode = ADD;
  const sparkG     = new PIXI.Graphics(); sparkG.blendMode     = ADD;
  const mistG      = new PIXI.Graphics(); mistG.blendMode      = ADD;
  const targetGlow = new PIXI.Graphics(); targetGlow.blendMode = ADD;
  const beam       = new PIXI.Graphics(); beam.blendMode       = ADD;
  const ring       = new PIXI.Graphics();
  glowLayer.addChild(sourceAura, sparkG, mistG, targetGlow);
  layer.addChild(glowLayer, beam, ring);
  app.stage.addChild(layer);

  const DURATION = 1400;
  await animate(DURATION, t => {
    const s = cellBoundsFor(srcId), d = cellBoundsFor(dstId);
    if (!s || !d) { layer.visible = false; return; }
    layer.visible = true;

    const sx0 = s.x + s.width / 2, sy0 = s.y + s.height / 2;
    const dx  = d.x + d.width / 2, dy  = d.y + d.height / 2;
    const cellR = Math.min(s.width, s.height);

    // Phases: windup (0–.28) draws life to the enemy, drain (.28–.72) the beam
    // + mist crossing, bloom (.72–1) the ally lighting up.
    const windup = clamp01(t / 0.28);
    const drain  = clamp01((t - 0.28) / 0.44);
    const bloom  = clamp01((t - 0.72) / 0.28);

    // Source flinches while its life is torn out, calm again by the bloom.
    const shakeAmt = drain * (1 - bloom) * 4;
    const sx = sx0 + (Math.random() - 0.5) * shakeAmt;
    const sy = sy0 + (Math.random() - 0.5) * shakeAmt;

    const ang   = Math.atan2(dy - sy, dx - sx);
    const perpX = Math.cos(ang + Math.PI / 2);
    const perpY = Math.sin(ang + Math.PI / 2);
    const time  = t * DURATION * 0.06; // frame-ish clock for wobble

    // Gathering aura at the source.
    sourceAura.clear();
    softGlow(sourceAura, sx, sy, cellR * 0.75, 0x8b0000, Math.max(windup * 0.5, drain * 0.55) * (1 - bloom));

    // Sparks raining inward into the source during windup and early drain.
    sparkG.clear();
    const sparkGate = Math.min(1, windup * 1.5) * (1 - clamp01((t - 0.6) / 0.2));
    if (sparkGate > 0) {
      for (const p of sparks) {
        const phase = (t * p.speed + p.delay) % 1;
        const r = p.rad * (1 - phase);
        const a = p.ang + phase * 2;
        const px = sx + Math.cos(a) * r;
        const py = sy + Math.sin(a) * r * 0.8;
        const fade = phase < 0.85 ? 1 : (1 - phase) / 0.15;
        softGlow(sparkG, px, py, p.size * 2.2, 0xff1e1e, 0.9 * fade * sparkGate);
      }
    }

    // The jagged three-layer beam, straight from the prototype's drawBeam.
    beam.clear();
    const beamA = drain * (1 - bloom) * 0.7;
    if (beamA > 0) {
      const segs = 18;
      const layers = [[6, 0xff2020, 0.4], [4, 0xcc0000, 0.27], [2.5, 0x880000, 0.14]];
      layers.forEach(([width, color, la], li) => {
        beam.lineStyle(width, color, la * beamA);
        beam.moveTo(sx, sy);
        for (let i = 1; i <= segs; i++) {
          const tt = i / segs;
          const mx = lerp(sx, dx, tt), my = lerp(sy, dy, tt);
          const off = Math.sin(time * 0.15 + i * 0.7 + li) * (12 - li * 3) * Math.sin(tt * Math.PI);
          beam.lineTo(mx + perpX * off, my + perpY * off);
        }
      });
    }

    // Mist blobs carrying the stolen life across to the ally.
    mistG.clear();
    for (const m of mist) {
      const lp = clamp01(((t - 0.28) * m.speed - m.delay * 0.4) / 0.5);
      if (lp <= 0) continue;
      const bx = lerp(sx, dx, lp), by = lerp(sy, dy, lp);
      const wob = Math.sin(time * 0.5 + m.wob) * 8 * (1 - lp * 0.5);
      const off = m.perp * 14 + wob;
      softGlow(mistG, bx + perpX * off, by + perpY * off, m.size, 0xc8001e, Math.sin(lp * Math.PI) * 0.55);
    }

    // Ally bloom + expanding ring as the life takes hold.
    targetGlow.clear();
    if (bloom > 0) {
      const pop = bloom < 0.6 ? bloom / 0.6 : 1 - (bloom - 0.6) / 0.4;
      softGlow(targetGlow, dx, dy, cellR * (0.5 + bloom * 0.5), 0xb4002a, 0.5 * pop);
    }
    ring.clear();
    if (bloom > 0) {
      ring.lineStyle(2, 0xcc0033, (1 - bloom) * 0.7);
      ring.drawCircle(dx, dy, 6 + bloom * cellR * 1.2);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] communion END', srcId, '->', dstId);
}

// ── Attack — melee border flash, ranged orb travel ────────────────────────────
// Color per damage source

// ── sword_swing — assign action_animation: 'sword_swing' on any unit def ──────
export async function sword_swing(cellEl, opts = {}) {
  console.log('[battle-fx] sword_swing START', cellEl?.dataset?.id, opts);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId  = cellEl.dataset.id;
  const isEnemy = opts.isEnemy ?? false;

  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  let texture;
  try {
    texture = await PIXI.Assets.load('/assets/vfx/sword.png');
  } catch {
    layer.destroy({ children: true });
    return;
  }

  const sprites = [0.18, 0.35, 1].map(alpha => {
    const s = new PIXI.Sprite(texture);
    s.anchor.set(0.5, 0.8);
    const scale = 50 / Math.max(texture.width, texture.height);
    // Mirror X for enemies so sword points toward player grid
    s.scale.set(isEnemy ? -scale : scale, scale);
    s.alpha = alpha;
    layer.addChild(s);
    return s;
  });
  const [ghost1, ghost2, main] = sprites;

  // Player swings toward enemy grid (right side), enemy swings toward player grid (left side)
  // Blade points up = 0 rad. Swing center toward the opposing grid.
  const CENTER    = isEnemy
    ? -Math.PI * 0.25 - Math.PI * 2 / 3   // enemy: mirror of player
    :  -Math.PI * 0.25 + Math.PI * 2 / 3;  // player
  const SWING     = 1.0;
  const START_ROT = CENTER - SWING / 2;
  const END_ROT   = CENTER + SWING / 2;

  await animate(1000, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx    = b.x + b.width  / 2;
    const cy    = b.y + b.height / 2;
    const ease  = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const rot   = START_ROT + (END_ROT - START_ROT) * ease;
    const alpha = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;

    main.position.set(cx, cy);   main.rotation = rot;           main.alpha = alpha;
    ghost2.position.set(cx, cy); ghost2.rotation = rot - 0.15; ghost2.alpha = alpha * 0.35;
    ghost1.position.set(cx, cy); ghost1.rotation = rot - 0.28; ghost1.alpha = alpha * 0.18;
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] sword_swing END', dataId);
}

// ── impale — a spear thrust from the actor toward the target, then a recoil ────
// Assign action_animation: 'impale' on any melee unit. The sprite points up; we
// aim it along the actor→target line and jab it forward, then pull it back.
export async function impale(cellEl, opts = {}) {
  console.log('[battle-fx] impale START', cellEl?.dataset?.id, '->', opts.targetCell?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const actorId  = cellEl.dataset.id;
  const targetId = opts.targetCell?.dataset?.id || null;
  const isEnemy  = opts.isEnemy ?? false;

  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  let texture;
  try {
    texture = await PIXI.Assets.load('/assets/vfx/impale.png');
  } catch {
    layer.destroy({ children: true });
    return;
  }

  // Main spear + two trailing ghosts for a motion-blur streak.
  const sprites = [0.16, 0.32, 1].map(alpha => {
    const s = new PIXI.Sprite(texture);
    s.anchor.set(0.5, 1.0); // pivot at the butt of the shaft; the tip leads
    const scale = 62 / Math.max(texture.width, texture.height);
    s.scale.set(scale, scale);
    s.alpha = alpha;
    layer.addChild(s);
    return s;
  });
  const [ghost1, ghost2, main] = sprites;

  await animate(650, t => {
    const a = cellBoundsFor(actorId);
    if (!a) { layer.visible = false; return; }
    const d = targetId ? cellBoundsFor(targetId) : null;
    layer.visible = true;

    const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
    // Aim at the target if we have one; otherwise jab toward the opposing grid.
    const tx = d ? d.x + d.width / 2 : ax + (isEnemy ? -1 : 1) * a.width;
    const ty = d ? d.y + d.height / 2 : ay;

    const ang  = Math.atan2(ty - ay, tx - ax);
    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    const dist = Math.hypot(tx - ax, ty - ay);
    const reach = d ? Math.max(a.width * 0.6, dist - Math.min(d.width, d.height) * 0.35) : a.width;

    // Thrust profile: small wind-back, fast lunge, brief hold, then recoil home.
    let travel;
    if (t < 0.15)      travel = -0.18 * (t / 0.15);                    // wind back
    else if (t < 0.42) { const u = (t - 0.15) / 0.27; travel = -0.18 + (1.18) * (u * u); } // lunge (ease-in)
    else if (t < 0.55) travel = 1;                                     // hold at full extension
    else               travel = 1 - (t - 0.55) / 0.45;                 // recoil back

    const ox = ax + dirX * reach * travel;
    const oy = ay + dirY * reach * travel;
    const rot = ang + Math.PI / 2; // sprite tip (up) points along the aim
    const alpha = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;

    main.position.set(ox, oy);   main.rotation = rot; main.alpha = alpha;
    // Ghosts trail slightly behind along the thrust line.
    ghost2.position.set(ox - dirX * reach * 0.10, oy - dirY * reach * 0.10); ghost2.rotation = rot; ghost2.alpha = alpha * 0.32;
    ghost1.position.set(ox - dirX * reach * 0.20, oy - dirY * reach * 0.20); ghost1.rotation = rot; ghost1.alpha = alpha * 0.16;
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] impale END', actorId);
}

// ── holy_heal — golden light bloom rising from bottom of cell ─────────────────
export async function holy_heal(cellEl) {
  console.log('[battle-fx] holy_heal START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const layer  = new PIXI.Container();
  app.stage.addChild(layer);

  const glow = new PIXI.Graphics();
  glow.filters = [new PIXI.BlurFilter(10)];
  const crisp = new PIXI.Graphics();
  layer.addChild(glow);
  layer.addChild(crisp);

  await animate(900, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const alpha = t < 0.15 ? t / 0.15 : t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
    const rise  = 1 - t; // starts at bottom, rises toward top
    const fillH = b.height * (0.3 + t * 0.5);
    const fillY = b.y + b.height - fillH * (0.5 + t * 0.5);

    glow.clear();
    glow.beginFill(0xffd966, 0.5 * alpha);
    glow.drawRoundedRect(b.x - 4, fillY, b.width + 8, fillH, 8);
    glow.endFill();

    crisp.clear();
    crisp.lineStyle(2, 0xfff3c4, 0.8 * alpha);
    crisp.drawRoundedRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4, 6);
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] holy_heal END', dataId);
}

// ── protector — half-dome shield that deflects an incoming hit ─────────────────
export async function protector(cellEl) {
  console.log('[battle-fx] protector START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const layer  = new PIXI.Container();
  app.stage.addChild(layer);

  const shield = new PIXI.Graphics();
  layer.addChild(shield);

  await animate(700, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width  / 2;
    const cy = b.y + b.height / 2;
    const r  = Math.min(b.width, b.height) * 0.55;

    // Expand in, hold, shrink out
    const scale  = t < 0.2 ? t / 0.2 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const alpha  = t < 0.15 ? t / 0.15 : t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;

    shield.clear();
    // Outer glow ring
    shield.lineStyle(6, 0x88ccff, 0.25 * alpha);
    shield.arc(cx, cy, r * scale * 1.15, Math.PI, 0);
    // Main dome — semicircle opening toward enemy side (top half)
    shield.lineStyle(3, 0xaaddff, 0.9 * alpha);
    shield.arc(cx, cy, r * scale, Math.PI, 0);
    // Base line closing the dome
    shield.moveTo(cx - r * scale, cy);
    shield.lineTo(cx + r * scale, cy);
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] protector END', dataId);
}

// ── sacrifice — the actor tears its own blood and hurls it into the target ─────
// Source→target signature like communion: (actorCell, targetCell). Reuses the
// blood look — gathering aura, jagged three-layer beam, and drifting red mist
// blobs — pointed actor→target: the actor bleeds itself to feed the target,
// which blooms and rings. With no target it just wells blood in place.
export async function sacrifice(sourceCellEl, targetCellEl) {
  console.log('[battle-fx] sacrifice START', sourceCellEl?.dataset?.id, '->', targetCellEl?.dataset?.id);
  if (!sourceCellEl?.dataset || !app || !window.PIXI) return;
  const actorId  = sourceCellEl.dataset.id;
  const targetId = targetCellEl?.dataset?.id || null;
  const TAU = Math.PI * 2;
  const rand  = (a, b) => a + Math.random() * (b - a);
  const lerp  = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ADD = PIXI.BLEND_MODES.ADD;

  // Blood mist blobs that drift from the actor to the target — the communion look.
  const mist = Array.from({ length: 18 }, () => ({
    delay: rand(0, 0.5), perp: rand(-1, 1), wob: rand(0, TAU), size: rand(10, 26), speed: rand(0.85, 1.15),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(5)];
  const actorAura = new PIXI.Graphics(); actorAura.blendMode = ADD;
  const mistG     = new PIXI.Graphics(); mistG.blendMode     = ADD;
  const targetGlow= new PIXI.Graphics(); targetGlow.blendMode= ADD;
  const beam      = new PIXI.Graphics(); beam.blendMode      = ADD;
  const ring      = new PIXI.Graphics();
  glowLayer.addChild(actorAura, mistG, targetGlow);
  layer.addChild(glowLayer, beam, ring);
  app.stage.addChild(layer);

  const DURATION = 1200;
  await animate(DURATION, t => {
    const a = cellBoundsFor(actorId);
    const d = targetId ? cellBoundsFor(targetId) : null;
    if (!a) { layer.visible = false; return; }
    layer.visible = true;

    const cellR = Math.min(a.width, a.height);
    // Phases: welling (0–.3) blood gathers on the actor who flinches, drain
    // (.25–.75) beam + mist cross, bloom (.72–1) the target lights up.
    const well  = clamp01(t / 0.30);
    const drain = clamp01((t - 0.25) / 0.50);
    const bloom = clamp01((t - 0.72) / 0.28);

    const shake = drain * (1 - bloom) * 4;
    const ax = a.x + a.width / 2 + (Math.random() - 0.5) * shake;
    const ay = a.y + a.height / 2 + (Math.random() - 0.5) * shake;
    const dx = d ? d.x + d.width / 2 : ax;
    const dy = d ? d.y + d.height / 2 : ay;
    const ang   = Math.atan2(dy - ay, dx - ax);
    const perpX = Math.cos(ang + Math.PI / 2), perpY = Math.sin(ang + Math.PI / 2);
    const time  = t * DURATION * 0.06;

    // Blood welling up on the actor as it cuts itself.
    actorAura.clear();
    softGlow(actorAura, ax, ay, cellR * 0.7, 0x8b0000, Math.max(well * 0.55, drain * 0.5) * (1 - bloom));

    // Jagged three-layer beam actor→target.
    beam.clear();
    const beamA = d ? drain * (1 - bloom) * 0.7 : 0;
    if (beamA > 0) {
      const segs = 18;
      [[6, 0xff2020, 0.4], [4, 0xcc0000, 0.27], [2.5, 0x880000, 0.14]].forEach(([w, color, la], li) => {
        beam.lineStyle(w, color, la * beamA);
        beam.moveTo(ax, ay);
        for (let i = 1; i <= segs; i++) {
          const tt = i / segs;
          const mx = lerp(ax, dx, tt), my = lerp(ay, dy, tt);
          const off = Math.sin(time * 0.15 + i * 0.7 + li) * (12 - li * 3) * Math.sin(tt * Math.PI);
          beam.lineTo(mx + perpX * off, my + perpY * off);
        }
      });
    }

    // Red mist carrying the actor's blood across to the target.
    mistG.clear();
    if (d) {
      for (const m of mist) {
        const lp = clamp01(((t - 0.25) * m.speed - m.delay * 0.4) / 0.5);
        if (lp <= 0) continue;
        const bx = lerp(ax, dx, lp), by = lerp(ay, dy, lp);
        const wob = Math.sin(time * 0.5 + m.wob) * 8 * (1 - lp * 0.5);
        const off = m.perp * 14 + wob;
        softGlow(mistG, bx + perpX * off, by + perpY * off, m.size, 0xc8001e, Math.sin(lp * Math.PI) * 0.55);
      }
    }

    // Target bloom + ring as the offered blood strikes home.
    targetGlow.clear();
    ring.clear();
    if (d && bloom > 0) {
      const pop = bloom < 0.6 ? bloom / 0.6 : 1 - (bloom - 0.6) / 0.4;
      softGlow(targetGlow, dx, dy, cellR * (0.5 + bloom * 0.5), 0xd0001e, 0.5 * pop);
      ring.lineStyle(2, 0xff2038, (1 - bloom) * 0.7);
      ring.drawCircle(dx, dy, 6 + bloom * cellR * 1.2);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] sacrifice END', actorId);
}

// ── shared_suffering — the caster satiates by drawing life from an ally ─────────
// Same source→target shape as communion, but read the other way: life is pulled
// from the ally (targetCell) INTO the caster (sourceCell). Distinct violet
// palette so it never reads as the enemy blood-drain.
// A green clone of communion: same windup → drain → transfer → bloom, but life
// (not blood) is pulled from the ally INTO the caster. Called (casterCell,
// allyCell); internally the ALLY is the drained source and the CASTER is the
// bloomed destination, so the flow reads ally → caster.
export async function shared_suffering(casterCellEl, allyCellEl) {
  console.log('[battle-fx] shared_suffering START', casterCellEl?.dataset?.id, '<-', allyCellEl?.dataset?.id);
  if (!casterCellEl?.dataset || !allyCellEl?.dataset || !app || !window.PIXI) return;
  const srcId = allyCellEl.dataset.id;    // drained
  const dstId = casterCellEl.dataset.id;  // satiated
  const TAU = Math.PI * 2;
  const rand   = (a, b) => a + Math.random() * (b - a);
  const lerp   = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ADD = PIXI.BLEND_MODES.ADD;

  const sparks = Array.from({ length: 16 }, () => ({
    ang: rand(0, TAU), rad: rand(26, 68), speed: rand(0.9, 1.5), delay: rand(0, 1), size: rand(2, 4),
  }));
  const mist = Array.from({ length: 18 }, () => ({
    delay: rand(0, 0.55), perp: rand(-1, 1), wob: rand(0, TAU), size: rand(10, 26), speed: rand(0.85, 1.15),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(5)];
  const sourceAura = new PIXI.Graphics(); sourceAura.blendMode = ADD;
  const sparkG     = new PIXI.Graphics(); sparkG.blendMode     = ADD;
  const mistG      = new PIXI.Graphics(); mistG.blendMode      = ADD;
  const targetGlow = new PIXI.Graphics(); targetGlow.blendMode = ADD;
  const beam       = new PIXI.Graphics(); beam.blendMode       = ADD;
  const ring       = new PIXI.Graphics();
  glowLayer.addChild(sourceAura, sparkG, mistG, targetGlow);
  layer.addChild(glowLayer, beam, ring);
  app.stage.addChild(layer);

  const DURATION = 1400;
  await animate(DURATION, t => {
    const s = cellBoundsFor(srcId), d = cellBoundsFor(dstId);
    if (!s || !d) { layer.visible = false; return; }
    layer.visible = true;

    const sx0 = s.x + s.width / 2, sy0 = s.y + s.height / 2;
    const dx  = d.x + d.width / 2, dy  = d.y + d.height / 2;
    const cellR = Math.min(s.width, s.height);

    const windup = clamp01(t / 0.28);
    const drain  = clamp01((t - 0.28) / 0.44);
    const bloom  = clamp01((t - 0.72) / 0.28);

    const shakeAmt = drain * (1 - bloom) * 4;
    const sx = sx0 + (Math.random() - 0.5) * shakeAmt;
    const sy = sy0 + (Math.random() - 0.5) * shakeAmt;

    const ang   = Math.atan2(dy - sy, dx - sx);
    const perpX = Math.cos(ang + Math.PI / 2);
    const perpY = Math.sin(ang + Math.PI / 2);
    const time  = t * DURATION * 0.06;

    // Gathering aura at the drained ally.
    sourceAura.clear();
    softGlow(sourceAura, sx, sy, cellR * 0.75, 0x1f7a1f, Math.max(windup * 0.5, drain * 0.55) * (1 - bloom));

    // Sparks raining inward as the ally's life is pulled loose.
    sparkG.clear();
    const sparkGate = Math.min(1, windup * 1.5) * (1 - clamp01((t - 0.6) / 0.2));
    if (sparkGate > 0) {
      for (const p of sparks) {
        const phase = (t * p.speed + p.delay) % 1;
        const r = p.rad * (1 - phase);
        const a = p.ang + phase * 2;
        const px = sx + Math.cos(a) * r;
        const py = sy + Math.sin(a) * r * 0.8;
        const fade = phase < 0.85 ? 1 : (1 - phase) / 0.15;
        softGlow(sparkG, px, py, p.size * 2.2, 0x9dff5a, 0.9 * fade * sparkGate);
      }
    }

    // Jagged three-layer beam, ally → caster.
    beam.clear();
    const beamA = drain * (1 - bloom) * 0.7;
    if (beamA > 0) {
      const segs = 18;
      const layers = [[6, 0x9dff5a, 0.4], [4, 0x3fbf3f, 0.27], [2.5, 0x1f7a1f, 0.14]];
      layers.forEach(([width, color, la], li) => {
        beam.lineStyle(width, color, la * beamA);
        beam.moveTo(sx, sy);
        for (let i = 1; i <= segs; i++) {
          const tt = i / segs;
          const mx = lerp(sx, dx, tt), my = lerp(sy, dy, tt);
          const off = Math.sin(time * 0.15 + i * 0.7 + li) * (12 - li * 3) * Math.sin(tt * Math.PI);
          beam.lineTo(mx + perpX * off, my + perpY * off);
        }
      });
    }

    // Mist blobs carrying the stolen life across to the caster.
    mistG.clear();
    for (const m of mist) {
      const lp = clamp01(((t - 0.28) * m.speed - m.delay * 0.4) / 0.5);
      if (lp <= 0) continue;
      const bx = lerp(sx, dx, lp), by = lerp(sy, dy, lp);
      const wob = Math.sin(time * 0.5 + m.wob) * 8 * (1 - lp * 0.5);
      const off = m.perp * 14 + wob;
      softGlow(mistG, bx + perpX * off, by + perpY * off, m.size, 0x5fd83f, Math.sin(lp * Math.PI) * 0.55);
    }

    // Caster bloom + expanding ring as the life takes hold.
    targetGlow.clear();
    if (bloom > 0) {
      const pop = bloom < 0.6 ? bloom / 0.6 : 1 - (bloom - 0.6) / 0.4;
      softGlow(targetGlow, dx, dy, cellR * (0.5 + bloom * 0.5), 0x3fcf3f, 0.5 * pop);
    }
    ring.clear();
    if (bloom > 0) {
      ring.lineStyle(2, 0x9dff5a, (1 - bloom) * 0.7);
      ring.drawCircle(dx, dy, 6 + bloom * cellR * 1.2);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] shared_suffering END', dstId);
}

// ── light_of_dawn — a warm sunbeam pours across the actor's whole row ───────────
// Single-cell trigger, but the light spans the full arena width at the actor's
// row: a brightening band plus a few soft god-rays that sweep and fade.
export async function light_of_dawn(cellEl) {
  console.log('[battle-fx] light_of_dawn START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const rand = (a, b) => a + Math.random() * (b - a);

  // Stable god-ray slots across the band.
  const rays = Array.from({ length: 6 }, (_, i) => ({ frac: (i + 0.5) / 6 + rand(-0.05, 0.05), w: rand(0.05, 0.11), phase: rand(0, 1) }));

  const layer = new PIXI.Container();
  const band  = new PIXI.Graphics(); band.blendMode = PIXI.BLEND_MODES.ADD;
  const rayG  = new PIXI.Graphics(); rayG.blendMode = PIXI.BLEND_MODES.ADD;
  band.filters = [new PIXI.BlurFilter(4)];
  layer.addChild(band, rayG);
  app.stage.addChild(layer);

  await animate(1100, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const W  = app.screen.width;                 // full arena width
    const y  = b.y;                               // top of the actor's row
    const h  = b.height * 0.85;                   // band covers the portrait band
    // Rise in, hold, fade out.
    const alpha = t < 0.25 ? t / 0.25 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);

    band.clear();
    // Warm core with a softer halo above and below.
    band.beginFill(0xffe6a0, 0.30 * alpha); band.drawRect(0, y - h * 0.25, W, h * 1.5); band.endFill();
    band.beginFill(0xfff2c8, 0.45 * alpha); band.drawRect(0, y, W, h); band.endFill();

    // Diagonal god-rays sweeping slowly along the band.
    rayG.clear();
    const sweep = t * 0.15;
    for (const r of rays) {
      const cx = ((r.frac + sweep + r.phase) % 1) * W;
      const rw = r.w * W;
      const flick = 0.5 + 0.5 * Math.sin(t * 6 + r.phase * 6);
      rayG.beginFill(0xfff0c0, 0.16 * alpha * flick);
      // A thin parallelogram slanted downward.
      rayG.moveTo(cx, y - h * 0.2);
      rayG.lineTo(cx + rw, y - h * 0.2);
      rayG.lineTo(cx + rw - h * 0.4, y + h * 1.1);
      rayG.lineTo(cx - h * 0.4, y + h * 1.1);
      rayG.closePath();
      rayG.endFill();
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] light_of_dawn END', dataId);
}

export const EFFECTS = {
  mithrails_light,
  communion,
  sword_swing,
  impale,
  holy_heal,
  protector,
  noxious_death,
  last_verse,
  sacrifice,
  shared_suffering,
  light_of_dawn,
};