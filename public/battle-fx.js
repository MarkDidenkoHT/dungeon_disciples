import { assetUrl } from './asset_base.js';
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

// Draws a gear (cog) shape using polygon math.
// cx/cy = center, outerR/innerR = tooth tips/valleys, teeth = tooth count, rot = rotation angle.
function drawGear(g, cx, cy, outerR, innerR, teeth, rot, color, alpha, lineWidth) {
  if (alpha <= 0) return;
  g.lineStyle(lineWidth ?? 2, color, alpha);
  g.beginFill(color, alpha * 0.18);
  const TAU = Math.PI * 2;
  const step = TAU / (teeth * 2);
  g.moveTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
  for (let i = 0; i < teeth * 2; i++) {
    const a = rot + i * step;
    const r = i % 2 === 0 ? outerR : innerR;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.endFill();
  // Inner hub circle
  g.lineStyle(lineWidth ?? 2, color, alpha * 0.7);
  g.beginFill(color, alpha * 0.08);
  g.drawCircle(cx, cy, outerR * 0.28);
  g.endFill();
}

// Shared elemental burst on a single cell — used by noxious_death (plague/green)
// and last_verse (lava/flame).
async function elementalBurst(cellEl, pal) {
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const ADD = PIXI.BLEND_MODES.ADD;

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

    bloom.clear();
    const bloomA = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    softGlow(bloom, cx, cy, R * (0.5 + t * 0.5), pal.core, 0.7 * bloomA);
    softGlow(bloom, cx, cy, R * (0.3 + t * 0.4), pal.mid,  0.6 * bloomA);

    moteG.clear();
    for (const m of motes) {
      const dist = R * 0.95 * t * m.speed;
      const mx = cx + Math.cos(m.ang) * dist;
      const my = cy + Math.sin(m.ang) * dist + m.drift * dist;
      softGlow(moteG, mx, my, m.size * (1.4 - t * 0.6), pal.mid, 0.8 * (1 - t));
    }

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

  const softGlow = (g, x, y, radius, color, alpha) => {
    if (alpha <= 0 || radius <= 0) return;
    const steps = 4;
    for (let i = steps; i >= 1; i--) {
      g.beginFill(color, alpha * (1 - (i - 1) / steps) * 0.5);
      g.drawCircle(x, y, radius * (i / steps));
      g.endFill();
    }
  };

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

    sourceAura.clear();
    softGlow(sourceAura, sx, sy, cellR * 0.75, 0x8b0000, Math.max(windup * 0.5, drain * 0.55) * (1 - bloom));

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

    mistG.clear();
    for (const m of mist) {
      const lp = clamp01(((t - 0.28) * m.speed - m.delay * 0.4) / 0.5);
      if (lp <= 0) continue;
      const bx = lerp(sx, dx, lp), by = lerp(sy, dy, lp);
      const wob = Math.sin(time * 0.5 + m.wob) * 8 * (1 - lp * 0.5);
      const off = m.perp * 14 + wob;
      softGlow(mistG, bx + perpX * off, by + perpY * off, m.size, 0xc8001e, Math.sin(lp * Math.PI) * 0.55);
    }

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

// ── sword_swing ────────────────────────────────────────────────────────────────
export async function sword_swing(cellEl, opts = {}) {
  console.log('[battle-fx] sword_swing START', cellEl?.dataset?.id, opts);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId  = cellEl.dataset.id;
  const isEnemy = opts.isEnemy ?? false;

  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  let texture;
  try {
    texture = await PIXI.Assets.load(assetUrl('/assets/vfx/sword.png'));
  } catch {
    layer.destroy({ children: true });
    return;
  }

  const sprites = [0.18, 0.35, 1].map(alpha => {
    const s = new PIXI.Sprite(texture);
    s.anchor.set(0.5, 0.8);
    const scale = 50 / Math.max(texture.width, texture.height);
    s.scale.set(isEnemy ? -scale : scale, scale);
    s.alpha = alpha;
    layer.addChild(s);
    return s;
  });
  const [ghost1, ghost2, main] = sprites;

  const CENTER    = isEnemy
    ? -Math.PI * 0.25 - Math.PI * 2 / 3
    :  -Math.PI * 0.25 + Math.PI * 2 / 3;
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

// ── impale ─────────────────────────────────────────────────────────────────────
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
    texture = await PIXI.Assets.load(assetUrl('/assets/vfx/impale.png'));
  } catch {
    layer.destroy({ children: true });
    return;
  }

  const sprites = [0.16, 0.32, 1].map(alpha => {
    const s = new PIXI.Sprite(texture);
    s.anchor.set(0.5, 1.0);
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
    const tx = d ? d.x + d.width / 2 : ax + (isEnemy ? -1 : 1) * a.width;
    const ty = d ? d.y + d.height / 2 : ay;

    const ang  = Math.atan2(ty - ay, tx - ax);
    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    const dist = Math.hypot(tx - ax, ty - ay);
    const reach = d ? Math.max(a.width * 0.6, dist - Math.min(d.width, d.height) * 0.35) : a.width;

    let travel;
    if (t < 0.15)      travel = -0.18 * (t / 0.15);
    else if (t < 0.42) { const u = (t - 0.15) / 0.27; travel = -0.18 + (1.18) * (u * u); }
    else if (t < 0.55) travel = 1;
    else               travel = 1 - (t - 0.55) / 0.45;

    const ox = ax + dirX * reach * travel;
    const oy = ay + dirY * reach * travel;
    const rot = ang + Math.PI / 2;
    const alpha = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;

    main.position.set(ox, oy);   main.rotation = rot; main.alpha = alpha;
    ghost2.position.set(ox - dirX * reach * 0.10, oy - dirY * reach * 0.10); ghost2.rotation = rot; ghost2.alpha = alpha * 0.32;
    ghost1.position.set(ox - dirX * reach * 0.20, oy - dirY * reach * 0.20); ghost1.rotation = rot; ghost1.alpha = alpha * 0.16;
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] impale END', actorId);
}

// ── holy_heal ──────────────────────────────────────────────────────────────────
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

// ── protector ──────────────────────────────────────────────────────────────────
export async function protector(cellEl, opts = {}) {
  console.log('[battle-fx] protector START', cellEl?.dataset?.id, 'from:', opts.fromCell?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId  = cellEl.dataset.id;
  const fromId  = opts.fromCell?.dataset?.id || null;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rand    = (a, b) => a + Math.random() * (b - a);
  const ADD     = PIXI.BLEND_MODES.ADD;

  const PALE = 0xdff0ff;
  const BLUE = 0x8ac0ff;
  const DEEP = 0x3a7fd0;

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(5)];
  const glowG  = new PIXI.Graphics(); glowG.blendMode  = ADD;
  const domeG  = new PIXI.Graphics();
  const sparkG = new PIXI.Graphics(); sparkG.blendMode = ADD;
  layer.addChild(glowLayer, domeG);
  glowLayer.addChild(glowG, sparkG);
  app.stage.addChild(layer);

  // Sparks fly back along the incoming line, as if the blow skidded off.
  const sparks = Array.from({ length: 12 }, () => ({
    spread: rand(-0.7, 0.7), dist: rand(0.4, 1.1), size: rand(1.5, 3.4), delay: rand(0, 0.18),
  }));

  await animate(620, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);

    // Facing: toward the attacker if we know where it stood, else straight up.
    // A symmetrical dome reads as an aura; a shield ANGLED at the blow reads as
    // an interception, which is what this passive actually did.
    let ax = 0, ay = -1;
    const ab = fromId ? cellBoundsFor(fromId) : null;
    if (ab) {
      const dx = (ab.x + ab.width / 2) - cx;
      const dy = (ab.y + ab.height / 2) - cy;
      const len = Math.hypot(dx, dy) || 1;
      ax = dx / len; ay = dy / len;
    }
    const facing = Math.atan2(ay, ax);

    const rise  = clamp01(t / 0.18);            // shield snaps up
    const decay = clamp01((t - 0.42) / 0.58);
    const a     = 1 - decay;
    const r     = R * 0.62 * (0.85 + rise * 0.15);

    glowG.clear(); domeG.clear(); sparkG.clear();

    // The dome: an arc centred on the facing direction, not a full circle.
    const HALF = Math.PI * 0.55;
    const impact = Math.sin(clamp01(t / 0.3) * Math.PI);   // flares as it takes the hit

    glowG.lineStyle(R * 0.13, DEEP, 0.45 * a * rise);
    glowG.arc(cx, cy, r * 1.06, facing - HALF, facing + HALF);
    domeG.lineStyle(R * 0.055, BLUE, 0.95 * a * rise);
    domeG.arc(cx, cy, r, facing - HALF, facing + HALF);
    domeG.lineStyle(R * 0.02, PALE, a * rise);
    domeG.arc(cx, cy, r * 0.94, facing - HALF, facing + HALF);
    domeG.lineStyle(0);

    // Ribs fanning out from the unit to the rim — reads as a braced shield
    // rather than a bubble.
    const RIBS = 5;
    for (let i = 0; i < RIBS; i++) {
      const f  = (i / (RIBS - 1)) * 2 - 1;         // -1..1 across the arc
      const an = facing + f * HALF * 0.92;
      domeG.lineStyle(R * 0.016, PALE, 0.5 * a * rise);
      domeG.moveTo(cx + Math.cos(an) * r * 0.34, cy + Math.sin(an) * r * 0.34);
      domeG.lineTo(cx + Math.cos(an) * r * 0.99, cy + Math.sin(an) * r * 0.99);
      domeG.lineStyle(0);
    }

    // Bright bloom at the point of contact, dead centre of the facing.
    const px = cx + ax * r, py = cy + ay * r;
    softGlow(glowG, px, py, R * 0.30 * impact, PALE, 0.9 * a);
    softGlow(glowG, cx, cy, R * 0.22 * rise,   BLUE, 0.35 * a);

    // Deflected sparks, thrown BACK the way the blow came from.
    const spray = clamp01((t - 0.06) / 0.5);
    if (spray > 0) {
      for (const sp of sparks) {
        const s2 = clamp01((spray - sp.delay) / (1 - sp.delay));
        if (s2 <= 0) continue;
        const an = facing + sp.spread;
        const d  = r + R * sp.dist * s2;
        softGlow(sparkG, cx + Math.cos(an) * d, cy + Math.sin(an) * d,
                 sp.size * (1 - s2 * 0.5), PALE, (1 - s2) * 0.85);
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] protector END', dataId);
}

// ── aegis ──────────────────────────────────────────────────
// The IMPACT half of Aegis: a hard-edged rectangular ward snaps out along the
// cell's own border the moment the passive procs. The persistent part - the
// ward growing brighter as stacks build - is CSS on the cell itself
// (.battle-cell--aegis in style.css), because it has to survive re-renders and
// outlive any one animation. This is the flash; that is the state.
export async function aegis(cellEl) {
  console.log('[battle-fx] aegis START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId  = cellEl.dataset.id;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ADD     = PIXI.BLEND_MODES.ADD;

  const EDGE = 0x9ac4ff;
  const PALE = 0xd0e8ff;

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(4)];
  const glowG = new PIXI.Graphics(); glowG.blendMode = ADD;
  const ringG = new PIXI.Graphics();
  layer.addChild(glowLayer, ringG);
  glowLayer.addChild(glowG);
  app.stage.addChild(layer);

  await animate(460, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);
    const a  = 1 - t;

    glowG.clear(); ringG.clear();

    // Expands OUTWARD from the unit's own outline, so it reads as the unit's
    // armour hardening rather than something arriving from elsewhere.
    const grow = 1 + t * 0.30;
    const w = b.width * grow, h = b.height * grow;
    const rad = Math.min(w, h) * 0.14;

    ringG.lineStyle(Math.max(1, R * 0.045 * (1 - t * 0.6)), EDGE, 0.9 * a);
    ringG.drawRoundedRect(cx - w / 2, cy - h / 2, w, h, rad);
    ringG.lineStyle(Math.max(1, R * 0.015), PALE, 0.7 * a);
    ringG.drawRoundedRect(cx - w / 2, cy - h / 2, w, h, rad);
    ringG.lineStyle(0);

    glowG.lineStyle(R * 0.10, EDGE, 0.4 * a);
    glowG.drawRoundedRect(cx - w / 2, cy - h / 2, w, h, rad);
    glowG.lineStyle(0);
    // A short inward flash on the unit at the moment it hardens.
    if (t < 0.35) softGlow(glowG, cx, cy, R * 0.4 * (1 - t / 0.35), PALE, 0.35 * (1 - t / 0.35));
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] aegis END', dataId);
}

// ── sacrifice ──────────────────────────────────────────────────────────────────
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

    actorAura.clear();
    softGlow(actorAura, ax, ay, cellR * 0.7, 0x8b0000, Math.max(well * 0.55, drain * 0.5) * (1 - bloom));

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

// ── shared_suffering ───────────────────────────────────────────────────────────
export async function shared_suffering(casterCellEl, allyCellEl) {
  console.log('[battle-fx] shared_suffering START', casterCellEl?.dataset?.id, '<-', allyCellEl?.dataset?.id);
  if (!casterCellEl?.dataset || !allyCellEl?.dataset || !app || !window.PIXI) return;
  const srcId = allyCellEl.dataset.id;
  const dstId = casterCellEl.dataset.id;
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

    sourceAura.clear();
    softGlow(sourceAura, sx, sy, cellR * 0.75, 0x1f7a1f, Math.max(windup * 0.5, drain * 0.55) * (1 - bloom));

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

    mistG.clear();
    for (const m of mist) {
      const lp = clamp01(((t - 0.28) * m.speed - m.delay * 0.4) / 0.5);
      if (lp <= 0) continue;
      const bx = lerp(sx, dx, lp), by = lerp(sy, dy, lp);
      const wob = Math.sin(time * 0.5 + m.wob) * 8 * (1 - lp * 0.5);
      const off = m.perp * 14 + wob;
      softGlow(mistG, bx + perpX * off, by + perpY * off, m.size, 0x5fd83f, Math.sin(lp * Math.PI) * 0.55);
    }

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

// ── light_of_dawn — holy light down the whole row, out from the caster ─────
// The passive fires at the unit's turn start and reaches along its ROW: it
// mends the ally in front and burns the enemy in front, across both grids. So
// the light is drawn as a band down that row — dawn breaking along the rank,
// racing outward from the caster in both directions — rather than as a bloom
// sitting on one tile.
//
// The engine logs one entry per unit touched, which would otherwise play this
// once per entry, so the effect is listed in FAN_OUT_FX (screens/battle.js) to
// collapse the run into ONE play. The collapsed targets arrive as
// opts.targetCells and are used to pulse each unit as the wave passes over it.
export async function light_of_dawn(cellEl, opts = {}) {
  console.log('[battle-fx] light_of_dawn START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId  = cellEl.dataset.id;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rand    = (a, b) => a + Math.random() * (b - a);
  const ADD     = PIXI.BLEND_MODES.ADD;

  const GOLD  = 0xffe08a;
  const WHITE = 0xfffdf2;

  const targetIds = (opts.targetCells || [])
    .map(c => c?.dataset?.id).filter(id => id && id !== dataId);

  // Motes drifting UP off the band, seeded across its whole width so the light
  // reads as a volume rather than a painted rectangle.
  const motes = Array.from({ length: 26 }, () => ({
    ax: rand(-1, 1), ay: rand(-0.35, 0.35), delay: rand(0, 0.45),
    size: rand(1.2, 3.2), speed: rand(0.5, 1.1),
  }));
  // Bright lances standing in the beam, at fixed fractions of its width.
  const lances = Array.from({ length: 9 }, () => ({
    at: rand(-1, 1), w: rand(0.5, 1.4), delay: rand(0, 0.3),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(7)];
  const glowG = new PIXI.Graphics(); glowG.blendMode = ADD;
  const rayG  = new PIXI.Graphics(); rayG.blendMode  = ADD;
  layer.addChild(glowLayer, rayG);
  glowLayer.addChild(glowG);
  app.stage.addChild(layer);

  await animate(1125, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);
    // The row runs the full width of the battlefield — both grids — so the band
    // is measured off the stage, not off the cell.
    const W  = app.screen?.width || (b.x + b.width) * 2;

    glowG.clear(); rayG.clear();

    // Out from the caster: the leading edge races to the ends of the row, then
    // the whole band holds lit for a beat before it goes.
    const reach = clamp01(t / 0.34);
    const ease  = 1 - Math.pow(1 - reach, 3);     // fast out of the caster, easing at the ends
    const fade  = 1 - clamp01((t - 0.55) / 0.45);
    const maxHalf = Math.max(cx, W - cx);         // far enough to cover the longer side
    const half    = maxHalf * ease;
    const left    = Math.max(0, cx - half);
    const right   = Math.min(W, cx + half);

    // The band itself: a wide soft body with a hard bright core along its axis.
    // Deliberately taller than the row it travels down — the light spills over
    // the neighbouring ranks rather than sitting inside one lane of tiles.
    const bodyH = R * 1.76;
    glowG.beginFill(GOLD, 0.20 * fade);
    glowG.drawRect(left, cy - bodyH / 2, right - left, bodyH);
    glowG.endFill();
    glowG.beginFill(WHITE, 0.16 * fade);
    glowG.drawRect(left, cy - bodyH * 0.22, right - left, bodyH * 0.44);
    glowG.endFill();

    // Core and rails scale with the body, so widening the band thickens the
    // whole beam instead of leaving a hairline down a broad glow.
    rayG.lineStyle(Math.max(1.5, R * 0.113), WHITE, 0.85 * fade);
    rayG.moveTo(left, cy); rayG.lineTo(right, cy);
    rayG.lineStyle(Math.max(1, R * 0.032), GOLD, 0.55 * fade);
    rayG.moveTo(left, cy - bodyH / 2); rayG.lineTo(right, cy - bodyH / 2);
    rayG.moveTo(left, cy + bodyH / 2); rayG.lineTo(right, cy + bodyH / 2);
    rayG.lineStyle(0);

    // The two leading edges, bright while they travel and gone once they land.
    if (reach < 1) {
      const edge = (1 - reach) * 0.9 * fade;
      softGlow(glowG, left,  cy, bodyH * 0.5, WHITE, edge);
      softGlow(glowG, right, cy, bodyH * 0.5, WHITE, edge);
    }

    // Lances of light standing in the band, each lighting up only once the wave
    // has reached where it stands.
    for (const l of lances) {
      // Anchored to the row, not to the wavefront: each one stands where it
      // stands and only lights up once the light has swept past it.
      const x = cx + l.at * maxHalf;
      if (x < left || x > right) continue;
      const s = clamp01((t - l.delay) / 0.5);
      rayG.lineStyle(Math.max(1, R * 0.03 * l.w), WHITE, s * (1 - s) * 2.2 * fade);
      rayG.moveTo(x, cy - bodyH * 0.62);
      rayG.lineTo(x, cy + bodyH * 0.62);
    }
    rayG.lineStyle(0);

    // The source: the light is born on the caster, so it stays the brightest
    // point on the row.
    softGlow(glowG, cx, cy, bodyH * 0.55, GOLD,  0.6 * fade);
    softGlow(glowG, cx, cy, R * 0.34,     WHITE, 0.9 * fade);

    // Each unit the passive actually touched gets its own bloom, timed to when
    // the wave arrives — that is what ties the band to who was healed or burnt.
    for (const id of targetIds) {
      const tb = cellBoundsFor(id);
      if (!tb) continue;
      const tx = tb.x + tb.width / 2;
      const ty = tb.y + tb.height / 2;
      const arrive = Math.abs(tx - cx) / Math.max(1, Math.max(cx, W - cx));
      const s = clamp01((t - arrive * 0.34) / 0.4);
      if (s <= 0) continue;
      softGlow(glowG, tx, ty, R * (0.25 + 0.3 * s), WHITE, (1 - s) * 0.9 * fade);
    }

    // Motes lifting off the band.
    for (const m of motes) {
      const s = clamp01((t - m.delay) / 0.65);
      if (s <= 0) continue;
      const mx = cx + m.ax * maxHalf;
      if (mx < left || mx > right) continue;
      softGlow(glowG, mx, cy + m.ay * bodyH - s * R * 0.7 * m.speed,
               m.size * (1 - s * 0.4), WHITE, (1 - s) * 0.8 * fade);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] light_of_dawn END', dataId);
}

// ── terror — dread rolled onto one enemy ──────────────────────────────────
// Terror does not wound: it takes 30% of what the target can hit for, for two
// rounds. So nothing here reads as an impact. A pall gathers on the caster, a
// low wave of darkness rolls out across the field, and where it lands the enemy
// is wrapped and CLENCHED — tendrils drawing inward, pale wisps fleeing upward
// off it (whatever nerve it had, leaving).
//
// Drawn dark rather than bright: the shroud is a plain (non-additive) fill, and
// only the rim and the wisps are additive, so the target genuinely dims instead
// of lighting up the way every damaging effect does.
export async function terror(sourceCellEl, targetCellEl) {
  console.log('[battle-fx] terror START', sourceCellEl?.dataset?.id, '->', targetCellEl?.dataset?.id);
  if (!sourceCellEl || !targetCellEl || !app || !window.PIXI) return;

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rand    = (a, b) => a + Math.random() * (b - a);
  const ADD     = PIXI.BLEND_MODES.ADD;

  const DREAD = 0x1b1226;   // near-black violet, the pall itself
  const BRUISE= 0x5b3a7a;   // the rim of the wave
  const PALE  = 0xc9b6e0;   // sickly lavender — the wisps fleeing

  const srcId = sourceCellEl.dataset.id;
  const dstId = targetCellEl.dataset.id;

  // Tendrils clawing inward on the target, each with its own reach and kink.
  const tendrils = Array.from({ length: 11 }, (_, i) => ({
    ang:  (i / 11) * Math.PI * 2 + rand(-0.15, 0.15),
    len:  rand(0.8, 1.25),
    kink: rand(-0.3, 0.3),
    d:    rand(0, 0.18),
  }));
  // What little courage it had, going up.
  const wisps = Array.from({ length: 9 }, () => ({
    ax: rand(-0.5, 0.5), size: rand(1.2, 3), speed: rand(0.6, 1.2), d: rand(0, 0.35),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(6)];
  const glowG = new PIXI.Graphics(); glowG.blendMode = ADD;   // rim + wisps
  const darkG = new PIXI.Graphics();                          // the pall, NOT additive
  const lineG = new PIXI.Graphics(); lineG.blendMode = ADD;
  layer.addChild(darkG, glowLayer, lineG);
  glowLayer.addChild(glowG);
  app.stage.addChild(layer);

  await animate(880, t => {
    const sb = cellBoundsFor(srcId);
    const tb = cellBoundsFor(dstId);
    if (!sb || !tb) { layer.visible = false; return; }
    layer.visible = true;

    const sx = sb.x + sb.width / 2;
    const sy = sb.y + sb.height / 2;
    const tx = tb.x + tb.width / 2;
    const ty = tb.y + tb.height / 2;
    const R  = Math.min(tb.width, tb.height);

    glowG.clear(); darkG.clear(); lineG.clear();

    const ang  = Math.atan2(ty - sy, tx - sx);
    const dist = Math.hypot(tx - sx, ty - sy);

    // 1. The caster gathers it — darkness swells and is held.
    const gather = clamp01(t / 0.2);
    const holding = 1 - clamp01((t - 0.2) / 0.3);
    darkG.beginFill(DREAD, 0.55 * gather * holding);
    darkG.drawCircle(sx, sy, R * 0.42 * gather);
    darkG.endFill();
    lineG.lineStyle(Math.max(1, R * 0.02), BRUISE, gather * (1 - gather) * 2.2);
    lineG.drawCircle(sx, sy, R * (0.5 - 0.2 * gather));
    lineG.lineStyle(0);

    // 2. A low wave rolls across — an ARC facing the target, not a projectile.
    const travel = clamp01((t - 0.16) / 0.34);
    if (travel > 0 && travel < 1) {
      const waveR  = dist * (1 - Math.pow(1 - travel, 2));   // fast out, easing in
      const spread = 0.55 + 0.25 * travel;                   // widens as it goes
      const thick  = R * 0.20;
      const a0 = ang - spread, a1 = ang + spread;
      const fade = 1 - travel * 0.35;

      darkG.beginFill(DREAD, 0.5 * fade);
      darkG.moveTo(sx + Math.cos(a0) * (waveR + thick), sy + Math.sin(a0) * (waveR + thick));
      darkG.arc(sx, sy, waveR + thick, a0, a1);
      darkG.arc(sx, sy, Math.max(0, waveR - thick), a1, a0, true);
      darkG.closePath();
      darkG.endFill();

      lineG.lineStyle(Math.max(1, R * 0.03), BRUISE, 0.75 * fade);
      lineG.moveTo(sx + Math.cos(a0) * waveR, sy + Math.sin(a0) * waveR);
      lineG.arc(sx, sy, waveR, a0, a1);
      lineG.lineStyle(0);
    }

    // 3. It lands, and closes on the target.
    const hit = clamp01((t - 0.44) / 0.56);
    if (hit <= 0) return;
    const grip = 1 - hit;                       // the shroud tightens as it fades

    darkG.beginFill(DREAD, 0.72 * grip);
    darkG.drawCircle(tx, ty, R * (0.62 - 0.22 * hit));
    darkG.endFill();

    for (const td of tendrils) {
      const s = clamp01((hit - td.d) / 0.6);
      if (s <= 0) continue;
      const outer = R * (0.95 - 0.35 * s) * td.len;
      const inner = R * 0.22;
      const mx = tx + Math.cos(td.ang + td.kink) * (outer + inner) / 2;
      const my = ty + Math.sin(td.ang + td.kink) * (outer + inner) / 2;
      lineG.lineStyle(Math.max(1, R * 0.028 * (1 - s * 0.5)), BRUISE, (1 - s) * 0.8);
      lineG.moveTo(tx + Math.cos(td.ang) * outer, ty + Math.sin(td.ang) * outer);
      lineG.quadraticCurveTo(mx, my, tx + Math.cos(td.ang) * inner, ty + Math.sin(td.ang) * inner);
    }
    lineG.lineStyle(0);

    // A rim, so the shroud has an edge against a dark portrait.
    lineG.lineStyle(Math.max(1, R * 0.022), BRUISE, grip * 0.6);
    lineG.drawCircle(tx, ty, R * (0.62 - 0.22 * hit));
    lineG.lineStyle(0);

    for (const w of wisps) {
      const s = clamp01((hit - w.d) / 0.65);
      if (s <= 0) continue;
      softGlow(glowG, tx + w.ax * R, ty - s * R * 0.8 * w.speed,
               w.size * (1 - s * 0.4), PALE, (1 - s) * 0.75);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] terror END', dstId);
}

// ── mothers_blessing — her own life, given away as souls ──────────────────
// The caster spends a slice of her own maximum HP every turn and every other
// ally is mended for it. So this is not a heal that arrives from nowhere: a pale
// grey soul is drawn OUT of her (she dims as it leaves) and drifts to each ally,
// where it settles and sinks in. Grey rather than gold on purpose — the Grail
// mends with the dead, and the cost should read as a cost.
//
// Listed in FAN_OUT_FX: the engine logs one entry per ally mended, and they are
// one gift, not a queue.
export async function mothers_blessing(originCellEl, opts = {}) {
  const targetCells = (opts.targetCells || []).filter(Boolean);
  console.log('[battle-fx] mothers_blessing START', originCellEl?.dataset?.id, '-> targets:', targetCells.length);
  if (!originCellEl || !app || !window.PIXI) return;

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rand    = (a, b) => a + Math.random() * (b - a);
  const ADD     = PIXI.BLEND_MODES.ADD;

  const SOUL = 0xc3c9d6;   // pale grey, faintly blue
  const WISP = 0xeef1f6;   // near-white core
  const originId = originCellEl.dataset.id;

  const souls = targetCells.map(c => ({
    id:    c.dataset?.id,
    delay: rand(0, 0.14),
    // Each soul takes its own lazy arc — they drift, they do not fly.
    bow:   rand(0.12, 0.34) * (Math.random() < 0.5 ? -1 : 1),
    wob:   rand(1.4, 2.6),
    motes: Array.from({ length: 7 }, () => ({
      ang: rand(0, Math.PI * 2), dist: rand(0.2, 0.6), size: rand(1.2, 2.8), d: rand(0, 0.25),
    })),
  })).filter(s => s.id && s.id !== originId);

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(7)];
  const glowG = new PIXI.Graphics(); glowG.blendMode = ADD;
  const lineG = new PIXI.Graphics(); lineG.blendMode = ADD;
  layer.addChild(glowLayer, lineG);
  glowLayer.addChild(glowG);
  app.stage.addChild(layer);

  const bez = (p0, p1, p2, f) => {
    const m = 1 - f;
    return [m * m * p0[0] + 2 * m * f * p1[0] + f * f * p2[0],
            m * m * p0[1] + 2 * m * f * p1[1] + f * f * p2[1]];
  };

  await animate(1000, t => {
    const ob = cellBoundsFor(originId);
    if (!ob) { layer.visible = false; return; }
    layer.visible = true;

    const ox = ob.x + ob.width / 2;
    const oy = ob.y + ob.height / 2;
    const R  = Math.min(ob.width, ob.height);

    glowG.clear(); lineG.clear();

    // The cost, first: the light is pulled INWARD and the caster dims as it
    // goes, rather than blooming the way a healer does.
    const draw  = clamp01(t / 0.22);
    const spend = 1 - clamp01((t - 0.18) / 0.3);
    softGlow(glowG, ox, oy, R * (0.5 - 0.22 * draw), SOUL, 0.5 * spend);
    softGlow(glowG, ox, oy, R * (0.24 - 0.1 * draw), WISP, 0.7 * spend);
    // A thin ring closing on her as the life is taken.
    lineG.lineStyle(Math.max(1, R * 0.02), SOUL, (1 - draw) * 0.5);
    lineG.drawCircle(ox, oy, R * (0.62 - 0.3 * draw));
    lineG.lineStyle(0);

    for (const soul of souls) {
      const tb = cellBoundsFor(soul.id);
      if (!tb) continue;
      const tx = tb.x + tb.width / 2;
      const ty = tb.y + tb.height / 2;

      const travel = clamp01((t - 0.2 - soul.delay) / 0.42);
      if (travel <= 0) continue;

      // Bowed path with a slow wobble across it, so it drifts like something
      // carried rather than fired.
      const mx = (ox + tx) / 2 + (ty - oy) * soul.bow;
      const my = (oy + ty) / 2 - (tx - ox) * soul.bow;
      const [px, py] = bez([ox, oy], [mx, my], [tx, ty], travel);
      const sway = Math.sin(travel * Math.PI * soul.wob) * R * 0.07;

      // The soul itself, and the faint trail it leaves behind.
      const alive = 1 - clamp01((travel - 0.8) / 0.2);
      softGlow(glowG, px + sway, py, R * 0.17, WISP, 0.85 * alive);
      softGlow(glowG, px + sway, py, R * 0.30, SOUL, 0.45 * alive);

      const [qx, qy] = bez([ox, oy], [mx, my], [tx, ty], Math.max(0, travel - 0.16));
      lineG.lineStyle(Math.max(1, R * 0.03), SOUL, 0.35 * alive);
      lineG.moveTo(qx, qy); lineG.lineTo(px + sway, py);
      lineG.lineStyle(0);

      // Arrival: it settles over the ally and sinks in, with a few motes lifting
      // off as it does.
      const land = clamp01((t - 0.56 - soul.delay) / 0.42);
      if (land <= 0) continue;
      const settle = 1 - land;
      softGlow(glowG, tx, ty, R * (0.2 + 0.28 * land), SOUL, settle * 0.7);
      softGlow(glowG, tx, ty, R * (0.1 + 0.14 * land), WISP, settle * 0.9);
      lineG.lineStyle(Math.max(1, R * 0.018), WISP, settle * 0.45);
      lineG.drawCircle(tx, ty, R * (0.18 + 0.42 * land));
      lineG.lineStyle(0);
      for (const m of soul.motes) {
        const s = clamp01((land - m.d) / 0.7);
        if (s <= 0) continue;
        softGlow(glowG,
          tx + Math.cos(m.ang) * R * m.dist * s,
          ty + Math.sin(m.ang) * R * m.dist * s - s * R * 0.25,
          m.size * (1 - s * 0.5), WISP, (1 - s) * 0.7);
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] mothers_blessing END', originId);
}

// ── radiance — holy backlash, caster → each adjacent enemy ────────────────
// Fires when the unit is HEALED: the light it soaks up spills back out and
// scorches the enemies beside it. So it reads as a lance thrown from the caster
// to each victim, not as something happening on the victim alone — the caster
// blooms first, the lances travel, and each target takes a burst on arrival.
//
// Listed in FAN_OUT_FX: the engine logs one entry per adjacent enemy, and they
// are all one simultaneous flash of light, not a queue.
export async function radiance(originCellEl, opts = {}) {
  const targetCells = (opts.targetCells || []).filter(Boolean);
  console.log('[battle-fx] radiance START', originCellEl?.dataset?.id, '-> targets:', targetCells.length);
  if (!originCellEl || !app || !window.PIXI) return;

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rand    = (a, b) => a + Math.random() * (b - a);
  const ADD     = PIXI.BLEND_MODES.ADD;

  const GOLD  = 0xffd873;
  const WHITE = 0xfffdf2;

  const originId = originCellEl.dataset.id;
  // Seeded per target: each lance gets its own sparks and a hair of stagger, so
  // they read as one burst rather than as a drilled volley.
  const beams = targetCells.map(c => ({
    id: c.dataset?.id,
    delay: rand(0, 0.08),
    sparks: Array.from({ length: 8 }, () => ({
      ang: rand(0, Math.PI * 2), dist: rand(0.25, 0.8), size: rand(1.4, 3.2), d: rand(0, 0.18),
    })),
  })).filter(b => b.id && b.id !== originId);

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(6)];
  const glowG = new PIXI.Graphics(); glowG.blendMode = ADD;
  const rayG  = new PIXI.Graphics(); rayG.blendMode  = ADD;
  layer.addChild(glowLayer, rayG);
  glowLayer.addChild(glowG);
  app.stage.addChild(layer);

  await animate(720, t => {
    const ob = cellBoundsFor(originId);
    if (!ob) { layer.visible = false; return; }
    layer.visible = true;

    const ox = ob.x + ob.width / 2;
    const oy = ob.y + ob.height / 2;
    const R  = Math.min(ob.width, ob.height);

    glowG.clear(); rayG.clear();

    const fade = 1 - clamp01((t - 0.6) / 0.4);

    // The caster gathers the light before any of it leaves — a halo that swells
    // early and thins as the lances take it away.
    const gather = clamp01(t / 0.22);
    softGlow(glowG, ox, oy, R * 0.5 * gather, GOLD,  0.65 * fade);
    softGlow(glowG, ox, oy, R * 0.24 * gather, WHITE, 0.95 * fade);
    rayG.lineStyle(Math.max(1, R * 0.03), WHITE, gather * (1 - gather) * 2.4);
    rayG.drawCircle(ox, oy, R * (0.3 + 0.45 * gather));
    rayG.lineStyle(0);

    for (const beam of beams) {
      const tb = cellBoundsFor(beam.id);
      if (!tb) continue;
      const tx = tb.x + tb.width / 2;
      const ty = tb.y + tb.height / 2;

      // Straight lance: holy light does not arc. It leaves once the caster has
      // gathered, and its tail is drawn in behind the head.
      const travel = clamp01((t - 0.18 - beam.delay) / 0.3);
      if (travel <= 0) continue;
      const headX = ox + (tx - ox) * travel;
      const headY = oy + (ty - oy) * travel;
      const tail  = Math.max(0, travel - 0.35);
      const tailX = ox + (tx - ox) * tail;
      const tailY = oy + (ty - oy) * tail;

      rayG.lineStyle(Math.max(1.5, R * 0.055), WHITE, 0.9 * fade);
      rayG.moveTo(tailX, tailY); rayG.lineTo(headX, headY);
      rayG.lineStyle(Math.max(1, R * 0.11), GOLD, 0.35 * fade);
      rayG.moveTo(tailX, tailY); rayG.lineTo(headX, headY);
      rayG.lineStyle(0);
      softGlow(glowG, headX, headY, R * 0.2, WHITE, 0.8 * fade);

      // Landing: the burst on the enemy, and the sparks thrown off it.
      const hit = clamp01((t - 0.48 - beam.delay) / 0.42);
      if (hit <= 0) continue;
      softGlow(glowG, tx, ty, R * (0.28 + 0.34 * hit), GOLD,  (1 - hit) * 0.85);
      softGlow(glowG, tx, ty, R * (0.14 + 0.2 * hit),  WHITE, (1 - hit) * 0.95);
      rayG.lineStyle(Math.max(1, R * 0.022), WHITE, (1 - hit) * 0.7);
      rayG.drawCircle(tx, ty, R * (0.2 + 0.5 * hit));
      rayG.lineStyle(0);
      for (const s of beam.sparks) {
        const sp = clamp01((hit - s.d) / 0.6);
        if (sp <= 0) continue;
        softGlow(glowG,
          tx + Math.cos(s.ang) * R * s.dist * sp,
          ty + Math.sin(s.ang) * R * s.dist * sp,
          s.size * (1 - sp * 0.5), WHITE, (1 - sp) * 0.9);
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] radiance END', originId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── NEW EFFECTS ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── repair — a gear turns on the unit while it shudders back together ────────
// Deliberately plain: the gear fades in ON the cell, turns, and fades out. The
// glow ring, the shimmer pulse and the spark burst are gone — they read as
// "circles happening" rather than as a repair. Vibration stays, because that is
// what sells the work being done to the unit.
export async function repair(cellEl) {
  console.log('[battle-fx] repair START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId  = cellEl.dataset.id;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const TAU     = Math.PI * 2;

  const layer = new PIXI.Container();
  const gearG = new PIXI.Graphics();   // fallback shape if the sprite is missing
  layer.addChild(gearG);
  app.stage.addChild(layer);

  let gearSprite = null;
  try {
    const tex = await PIXI.Assets.load(assetUrl('/assets/vfx/repair_gear.png'));
    gearSprite = new PIXI.Sprite(tex);
    gearSprite.anchor.set(0.5, 0.5);
    layer.addChild(gearSprite);
  } catch { /* procedural gear carries it */ }

  const DURATION = 788;
  await animate(DURATION, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width  / 2;
    const cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height) * 0.42;

    const formIn  = clamp01(t / 0.20);
    const fadeOut = clamp01((t - 0.82) / 0.18);

    // One continuous turn, 50% quicker than before (1.65 turns over the effect).
    const gearRot = t * TAU * 1.65;

    // The unit shudders while the gear works, easing off as it finishes.
    const shake = (1 - fadeOut) * formIn * 3;
    const vx = (Math.random() - 0.5) * shake;
    const vy = (Math.random() - 0.5) * shake;

    const alpha = formIn * (1 - fadeOut);
    const scale = 0.85 + formIn * 0.15;

    gearG.clear();
    if (!gearSprite) {
      drawGear(gearG, cx + vx, cy + vy, R * 0.72 * scale, R * 0.52 * scale, 8, gearRot, 0xd4832a, alpha, 2.5);
    }

    if (gearSprite) {
      const sc = (R * 1.44 * scale) / Math.max(gearSprite.texture.width, gearSprite.texture.height);
      gearSprite.position.set(cx + vx, cy + vy);
      gearSprite.rotation = gearRot;
      gearSprite.scale.set(sc, sc);
      gearSprite.alpha = alpha;
    }
  });

  if (gearSprite) gearSprite.destroy();
  layer.destroy({ children: true });
  console.log('[battle-fx] repair END', dataId);
}



// ── raise_dead — necrotic resurrection: ground-crack miasma, bone lightning ────
// A dramatic three-phase resurrection sequence:
//   crack (.0–.35)   dark fissures open in the ground beneath the cell, sickly
//                    green-purple miasma seeps upward;
//   surge (.30–.68)  bone-white crackling lightning threads converge from the
//                    four corners into the cell, building to a blinding flash;
//   bloom (.65–1.0)  a corrupted life-bloom erupts—violet-green rings expand,
//                    necrotic motes rain down, and the cell settles into an
//                    ominous pulsing aura.
export async function raise_dead(cellEl) {
  console.log('[battle-fx] raise_dead START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ADD = PIXI.BLEND_MODES.ADD;

  // Stable lightning branches — each is a polyline from a corner toward center.
  // We'll jitter them each frame to look electric.
  const branches = [
    { ox: -1, oy: -1 }, // top-left
    { ox:  1, oy: -1 }, // top-right
    { ox: -1, oy:  1 }, // bottom-left
    { ox:  1, oy:  1 }, // bottom-right
  ];
  // Miasma wisps rising from below.
  const wisps = Array.from({ length: 10 }, () => ({
    fx: rand(0.1, 0.9), speed: rand(0.6, 1.1), size: rand(8, 20), delay: rand(0, 0.4),
  }));
  // Necrotic motes raining down in the bloom phase.
  const motes = Array.from({ length: 16 }, () => ({
    fx: rand(0.05, 0.95), speed: rand(0.7, 1.3), size: rand(3, 6), delay: rand(0, 0.35),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(7)];
  const crackG  = new PIXI.Graphics();                         // ground cracks — normal blend
  const miasmaG = new PIXI.Graphics(); miasmaG.blendMode = ADD;
  const boltG   = new PIXI.Graphics(); boltG.blendMode   = ADD;
  const bloomG  = new PIXI.Graphics(); bloomG.blendMode  = ADD;
  const moteG   = new PIXI.Graphics(); moteG.blendMode   = ADD;
  const ringG   = new PIXI.Graphics();
  glowLayer.addChild(miasmaG, boltG, bloomG, moteG);
  layer.addChild(glowLayer, crackG, ringG);
  app.stage.addChild(layer);

  const DURATION = 1350;
  await animate(DURATION, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width  / 2;
    const cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);
    const time = t * DURATION * 0.06;

    const crack = clamp01(t / 0.35);
    const surge = clamp01((t - 0.30) / 0.38);
    const bloom = clamp01((t - 0.65) / 0.35);

    // ── Ground cracks spreading from the center ────────────────────────────────
    crackG.clear();
    if (crack > 0) {
      const numCracks = 5;
      for (let i = 0; i < numCracks; i++) {
        const ang = (i / numCracks) * TAU + 0.3;
        const len = R * 0.6 * crack;
        const cAlpha = crack * (1 - bloom * 0.7);
        crackG.lineStyle(1.5, 0x1a0033, cAlpha * 0.9);
        let px = cx, py = cy;
        const segs = 5;
        for (let s = 1; s <= segs; s++) {
          const frac = s / segs;
          const jitter = (s < segs ? rand(-6, 6) : 0) * crack;
          const nx = cx + Math.cos(ang) * len * frac + jitter;
          const ny = cy + Math.sin(ang) * len * frac + jitter * 0.5;
          crackG.moveTo(px, py); crackG.lineTo(nx, ny);
          px = nx; py = ny;
        }
        // Glow along each crack
        miasmaG.lineStyle(3, 0x6600aa, cAlpha * 0.25);
        miasmaG.moveTo(cx, cy);
        miasmaG.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      }
    }

    // ── Miasma wisps rising from the bottom ───────────────────────────────────
    miasmaG.clear();
    const miasmaDuration = clamp01((t) / 0.70);
    for (const w of wisps) {
      const phase = clamp01((t - w.delay * 0.5) * w.speed / 0.65);
      if (phase <= 0) continue;
      const wx = b.x + w.fx * b.width;
      const wy = b.y + b.height - phase * b.height * 1.1;
      const wAlpha = Math.sin(phase * Math.PI) * 0.45 * miasmaDuration;
      softGlow(miasmaG, wx, wy, w.size, 0x44cc44, wAlpha * 0.5);
      softGlow(miasmaG, wx, wy, w.size * 0.6, 0x9933cc, wAlpha * 0.65);
    }

    // ── Lightning branches converging from corners ─────────────────────────────
    boltG.clear();
    const boltA = surge * (1 - bloom * 0.85);
    if (boltA > 0) {
      for (const br of branches) {
        const startX = cx + br.ox * b.width  * 0.9;
        const startY = cy + br.oy * b.height * 0.9;
        const segs = 8;
        const progress = Math.min(surge * 1.3, 1); // slightly lead the surge
        const endX = lerp(startX, cx, progress);
        const endY = lerp(startY, cy, progress);
        [[3, 0xaaffaa, 0.5], [1.5, 0xffffff, 0.35]].forEach(([w, col, la]) => {
          boltG.lineStyle(w, col, la * boltA);
          boltG.moveTo(startX, startY);
          for (let s = 1; s <= segs; s++) {
            const frac = s / segs;
            const mx = lerp(startX, endX, frac);
            const my = lerp(startY, endY, frac);
            const wobble = Math.sin(time * 0.8 + s * 1.3 + br.ox) * 10 * (1 - frac) * surge;
            boltG.lineTo(mx + wobble, my + wobble * 0.5);
          }
        });
      }
      // Central flash at peak surge
      if (surge > 0.75) {
        const flashA = (surge - 0.75) / 0.25 * boltA;
        softGlow(boltG, cx, cy, R * 0.6 * flashA, 0xccffcc, flashA * 0.7);
        softGlow(boltG, cx, cy, R * 0.3 * flashA, 0xffffff, flashA * 0.5);
      }
    }

    // ── Necrotic bloom eruption ────────────────────────────────────────────────
    bloomG.clear();
    if (bloom > 0) {
      const pop = bloom < 0.5 ? bloom / 0.5 : 1 - (bloom - 0.5) / 0.5;
      softGlow(bloomG, cx, cy, R * (0.6 + bloom * 0.6), 0x33aa33, 0.5 * pop);
      softGlow(bloomG, cx, cy, R * (0.3 + bloom * 0.4), 0x9933cc, 0.4 * pop);
      // Persistent ominous pulse after the flash
      if (bloom > 0.5) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 1.2);
        softGlow(bloomG, cx, cy, R * 0.55, 0x226622, 0.25 * pulse * bloom);
      }
    }

    // ── Necrotic motes raining down in bloom ──────────────────────────────────
    moteG.clear();
    for (const m of motes) {
      const phase = clamp01((t - 0.65 - m.delay * 0.3) / 0.35 * m.speed);
      if (phase <= 0) continue;
      const mx2 = b.x + m.fx * b.width;
      const my2 = b.y + phase * b.height * 1.1;
      softGlow(moteG, mx2, my2, m.size * (1 - phase * 0.4), 0x55dd55, (1 - phase) * 0.75);
    }

    // ── Expanding necrotic rings on bloom ─────────────────────────────────────
    ringG.clear();
    if (bloom > 0) {
      // Two offset rings for a more eerie feel.
      [[0, 0x44cc44], [0.15, 0x9922bb]].forEach(([offset, col]) => {
        const rb = clamp01((bloom - offset) / (1 - offset));
        if (rb <= 0) return;
        ringG.lineStyle(2.5, col, (1 - rb) * 0.8);
        ringG.drawCircle(cx, cy, R * 0.15 + rb * R * 1.1);
      });
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] raise_dead END', dataId);
}

// ── shield_bash — a heavy metallic impact ring and recoil flash ───────────────
// The attacker telegraphs a bash (brief windup flash), then a heavy silver
// collision ring slams into the target and radiates concussive ripples outward.
// Assign action_animation: 'shield_bash' on any defensive/tank unit.
export async function shield_bash(cellEl, opts = {}) {
  console.log('[battle-fx] shield_bash START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ADD = PIXI.BLEND_MODES.ADD;

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(6)];
  const impactG = new PIXI.Graphics(); impactG.blendMode = ADD;
  const rimG    = new PIXI.Graphics();
  const rippleG = new PIXI.Graphics();
  glowLayer.addChild(impactG);
  layer.addChild(glowLayer, rimG, rippleG);
  app.stage.addChild(layer);

  await animate(750, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width  / 2;
    const cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height) * 0.5;

    const windup = clamp01(t / 0.22);
    const impact = clamp01((t - 0.18) / 0.18);
    const decay  = clamp01((t - 0.36) / 0.64);

    // Windup: brief silver glow building on the caster.
    impactG.clear();
    if (windup < 1) {
      softGlow(impactG, cx, cy, R * windup, 0xddeeff, windup * 0.45);
    }

    // Impact flash — sharp white-silver disk that pops in fast.
    if (impact > 0) {
      const flashA = impact < 0.35 ? impact / 0.35 : (1 - impact) / 0.65;
      softGlow(impactG, cx, cy, R * (0.2 + impact * 0.9), 0xffffff, flashA * 0.6);
      softGlow(impactG, cx, cy, R * (0.1 + impact * 0.5), 0xaaccff, flashA * 0.45);
    }

    // Rimshot ring — a thick silver arc that expands and fades.
    rimG.clear();
    if (impact > 0) {
      const rimA = (1 - decay) * 0.9;
      rimG.lineStyle(4 * (1 - decay) + 1, 0xffffff, rimA * 0.8);
      rimG.drawCircle(cx, cy, R * (0.1 + impact * 1.1));
      rimG.lineStyle(2, 0x88bbdd, rimA * 0.5);
      rimG.drawCircle(cx, cy, R * (0.1 + impact * 1.1) * 0.85);
    }

    // Concussive ripples radiating outward after impact.
    rippleG.clear();
    const numRipples = 3;
    for (let i = 0; i < numRipples; i++) {
      const rOff = i * 0.18;
      const rp   = clamp01((decay - rOff) / (1 - rOff));
      if (rp <= 0) continue;
      rippleG.lineStyle(1.5, 0x99ccee, (1 - rp) * 0.5);
      rippleG.drawCircle(cx, cy, R * (0.8 + rp * 1.0));
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] shield_bash END', dataId);
}

// ── arcane_bolt — a charged violet-white orb that fires toward the target ──────
// A compressed orb builds on the caster, then launches as a traveling projectile
// that spirals slightly in flight and detonates on arrival with arcane sparks.
// Works as a single-cell caster effect; pass opts.targetCell for a two-cell arc.
export async function arcane_bolt(cellEl, opts = {}) {
  console.log('[battle-fx] arcane_bolt START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId   = cellEl.dataset.id;
  const targetId = opts.targetCell?.dataset?.id || null;
  const clamp01  = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp     = (a, b, t) => a + (b - a) * t;
  const ADD = PIXI.BLEND_MODES.ADD;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  // Stable tail sparks.
  const tail = Array.from({ length: 8 }, () => ({
    perp: rand(-1, 1), lag: rand(0.03, 0.10),
  }));
  const detonation = Array.from({ length: 14 }, () => ({
    ang: rand(0, TAU), speed: rand(0.5, 1.2), size: rand(2, 5),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(8)];
  const chargeG = new PIXI.Graphics(); chargeG.blendMode = ADD;
  const orbG    = new PIXI.Graphics(); orbG.blendMode    = ADD;
  const detonG  = new PIXI.Graphics(); detonG.blendMode  = ADD;
  const ringG   = new PIXI.Graphics();
  glowLayer.addChild(chargeG, orbG, detonG);
  layer.addChild(glowLayer, ringG);
  app.stage.addChild(layer);

  const DURATION = 900;
  await animate(DURATION, t => {
    const s = cellBoundsFor(dataId);
    if (!s) { layer.visible = false; return; }
    const d = targetId ? cellBoundsFor(targetId) : null;
    layer.visible = true;

    const sx = s.x + s.width  / 2, sy = s.y + s.height / 2;
    const dx = d ? d.x + d.width  / 2 : sx + (opts.isEnemy ? -1 : 1) * s.width * 1.5;
    const dy = d ? d.y + d.height / 2 : sy;
    const R  = Math.min(s.width, s.height);
    const time = t * DURATION * 0.07;

    const charge = clamp01(t / 0.30);
    const travel = clamp01((t - 0.28) / 0.42);
    const detonate = clamp01((t - 0.68) / 0.32);

    const ang   = Math.atan2(dy - sy, dx - sx);
    const perpX = Math.cos(ang + Math.PI / 2);
    const perpY = Math.sin(ang + Math.PI / 2);

    // Charge: gathering orb on the caster, corona of energy.
    chargeG.clear();
    if (charge < 1 || travel === 0) {
      const cA = charge < 0.5 ? charge * 2 : 1;
      softGlow(chargeG, sx, sy, R * 0.35 * charge, 0xcc88ff, cA * 0.7);
      softGlow(chargeG, sx, sy, R * 0.55 * charge, 0x8844cc, cA * 0.35);
    }

    // Traveling orb — spirals perpendicular to flight direction.
    orbG.clear();
    if (travel > 0 && detonate < 0.6) {
      const ox = lerp(sx, dx, travel);
      const oy = lerp(sy, dy, travel);
      const spiral = Math.sin(time * 1.5) * R * 0.08 * (1 - travel);
      const fx = ox + perpX * spiral, fy = oy + perpY * spiral;
      const orbA = detonate < 0.3 ? 1 : (1 - (detonate - 0.3) / 0.3);
      softGlow(orbG, fx, fy, R * 0.25, 0xdd99ff, orbA * 0.9);
      softGlow(orbG, fx, fy, R * 0.13, 0xffffff, orbA * 0.75);
      // Tail sparks fading behind the orb.
      for (const tl of tail) {
        const tlProgress = Math.max(0, travel - tl.lag);
        const tx2 = lerp(sx, dx, tlProgress) + perpX * tl.perp * R * 0.05;
        const ty2 = lerp(sy, dy, tlProgress) + perpY * tl.perp * R * 0.05;
        softGlow(orbG, tx2, ty2, R * 0.07, 0xaa66dd, orbA * 0.35);
      }
    }

    // Detonation burst at the target.
    detonG.clear();
    if (detonate > 0) {
      const flash = detonate < 0.4 ? detonate / 0.4 : (1 - detonate) / 0.6;
      softGlow(detonG, dx, dy, R * (0.3 + detonate * 0.8), 0xcc44ff, flash * 0.65);
      softGlow(detonG, dx, dy, R * (0.15 + detonate * 0.4), 0xffffff, flash * 0.5);
      for (const sp of detonation) {
        const phase = clamp01((detonate - 0) / 1);
        const dist = R * 0.9 * phase * sp.speed;
        const spx = dx + Math.cos(sp.ang) * dist;
        const spy = dy + Math.sin(sp.ang) * dist;
        softGlow(detonG, spx, spy, sp.size * (1.3 - phase), 0xee88ff, (1 - phase) * 0.8);
      }
    }

    // Expanding ring on detonation.
    ringG.clear();
    if (detonate > 0) {
      ringG.lineStyle(2.5, 0xcc44ff, (1 - detonate) * 0.8);
      ringG.drawCircle(dx, dy, R * 0.1 + detonate * R * 1.05);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] arcane_bolt END', dataId);
}



// ─────────────────────────────────────────────────────────────────────────────

// ── mend_flesh — the Grail's green counterpart to holy_heal ───────────────────
// Sickly-green motes rise into the target and a seam of light knits shut, rather
// than holy_heal's golden bloom: the Grail mends flesh, it does not bless it.
export async function mend_flesh(cellEl) {
  console.log('[battle-fx] mend_flesh START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const rand = (a, b) => a + Math.random() * (b - a);
  const ADD  = PIXI.BLEND_MODES.ADD;

  const motes = Array.from({ length: 14 }, () => ({
    x: rand(-0.45, 0.45), rise: rand(0.55, 1.05), size: rand(2, 5),
    wob: rand(-1, 1), delay: rand(0, 0.35),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(6)];
  const bloom = new PIXI.Graphics(); bloom.blendMode = ADD;
  const moteG = new PIXI.Graphics(); moteG.blendMode = ADD;
  const seamG = new PIXI.Graphics(); seamG.blendMode = ADD;
  glowLayer.addChild(bloom, moteG, seamG);
  layer.addChild(glowLayer);
  app.stage.addChild(layer);

  const DURATION = 820;
  await animate(DURATION, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);
    const fade = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;

    bloom.clear();
    softGlow(bloom, cx, cy, R * 0.62, 0x9bff7a, 0.30 * fade);
    softGlow(bloom, cx, cy, R * 0.38, 0xdcffc4, 0.42 * fade);

    // Motes drift UP into the body and wink out as they arrive.
    moteG.clear();
    for (const m of motes) {
      const mt = Math.max(0, (t - m.delay) / (1 - m.delay));
      if (mt <= 0) continue;
      const mx = cx + m.x * R + Math.sin(mt * 6 + m.wob) * R * 0.05;
      const my = cy + R * 0.45 - mt * R * m.rise;
      softGlow(moteG, mx, my, m.size * (1 - mt * 0.5), 0x7ee06a, 0.85 * (1 - mt) * fade);
    }

    // A closing seam of light across the middle — the wound knitting shut.
    seamG.clear();
    const seam = Math.max(0, Math.min(1, (t - 0.25) / 0.5));
    if (seam > 0) {
      const halfW = R * 0.42 * (1 - seam);
      seamG.lineStyle(3, 0xdcffc4, (1 - seam) * 0.9 * fade);
      seamG.moveTo(cx - halfW, cy);
      seamG.lineTo(cx + halfW, cy);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] mend_flesh END', dataId);
}

// ── haunt — a pale soul rises off the target and passes through it ────────────
// Grey-blue, slow, weightless: no impact, no burst. Wisps form low in the cell,
// drift up through it, and the target is briefly washed cold.
export async function haunt(cellEl, opts = {}) {
  console.log('[battle-fx] haunt START', cellEl?.dataset?.id);
  const target = opts.targetCell || cellEl;
  if (!target || !app || !window.PIXI) return;
  const dataId = target.dataset.id;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU  = Math.PI * 2;
  const ADD  = PIXI.BLEND_MODES.ADD;

  const wisps = Array.from({ length: 3 }, (_, i) => ({
    phase: rand(0, TAU), sway: rand(0.10, 0.22), delay: i * 0.12, scale: rand(0.7, 1.1),
  }));
  const embers = Array.from({ length: 10 }, () => ({
    ang: rand(0, TAU), dist: rand(0.2, 0.6), rise: rand(0.4, 0.9), size: rand(1.5, 3.5),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(7)];
  const auraG  = new PIXI.Graphics(); auraG.blendMode  = ADD;
  const wispG  = new PIXI.Graphics(); wispG.blendMode  = ADD;
  const emberG = new PIXI.Graphics(); emberG.blendMode = ADD;
  glowLayer.addChild(auraG, wispG, emberG);
  layer.addChild(glowLayer);
  app.stage.addChild(layer);

  const DURATION = 1000;
  await animate(DURATION, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);
    const fade = t < 0.18 ? t / 0.18 : t > 0.68 ? (1 - t) / 0.32 : 1;

    // Cold wash over the whole cell.
    auraG.clear();
    softGlow(auraG, cx, cy, R * 0.70, 0x8fb6cc, 0.26 * fade);
    softGlow(auraG, cx, cy, R * 0.42, 0xd8e8f2, 0.20 * fade);

    // Wisps: rising teardrops that sway as they climb.
    wispG.clear();
    for (const w of wisps) {
      const wt = Math.max(0, Math.min(1, (t - w.delay) / (0.85 - w.delay)));
      if (wt <= 0) continue;
      const wy = cy + R * 0.5 - wt * R * 1.05;
      const wx = cx + Math.sin(wt * 5 + w.phase) * R * w.sway;
      const a  = (1 - wt) * 0.85 * fade;
      const rr = R * 0.16 * w.scale * (1 - wt * 0.35);
      softGlow(wispG, wx, wy, rr * 1.6, 0x9fc4d8, a * 0.55);
      softGlow(wispG, wx, wy, rr,       0xe8f4fb, a);
      softGlow(wispG, wx, wy + rr * 1.5, rr * 0.55, 0x9fc4d8, a * 0.35);
    }

    // Ash-pale embers pulled off the body.
    emberG.clear();
    for (const e of embers) {
      const ex = cx + Math.cos(e.ang) * R * e.dist;
      const ey = cy + Math.sin(e.ang) * R * e.dist * 0.6 - t * R * e.rise;
      softGlow(emberG, ex, ey, e.size * (1 - t * 0.4), 0xcfe4ef, 0.6 * (1 - t) * fade);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] haunt END', dataId);
}

// ── blood_bolt — a thrown clot of blood, arterial and wet ─────────────────────
// Travels actor -> target like arcane_bolt, but heavy: it sags under its own
// weight, drags a ribbon of droplets, and bursts into a falling spatter rather
// than a clean nova.
export async function blood_bolt(cellEl, opts = {}) {
  console.log('[battle-fx] blood_bolt START', cellEl?.dataset?.id, '->', opts.targetCell?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId   = cellEl.dataset.id;
  const targetId = opts.targetCell?.dataset?.id || null;
  const clamp01  = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp     = (a, b, t) => a + (b - a) * t;
  const rand     = (a, b) => a + Math.random() * (b - a);
  const TAU      = Math.PI * 2;
  const ADD      = PIXI.BLEND_MODES.ADD;

  const trail   = Array.from({ length: 9 },  () => ({ lag: rand(0.04, 0.16), perp: rand(-1, 1), size: rand(1.5, 4) }));
  const spatter = Array.from({ length: 16 }, () => ({ ang: rand(0, TAU), speed: rand(0.4, 1.15), size: rand(2, 5.5), drop: rand(0.2, 0.9) }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(5)];
  const chargeG = new PIXI.Graphics(); chargeG.blendMode = ADD;
  const boltG   = new PIXI.Graphics();
  const spatG   = new PIXI.Graphics();
  glowLayer.addChild(chargeG);
  layer.addChild(glowLayer, boltG, spatG);
  app.stage.addChild(layer);

  const DURATION = 880;
  await animate(DURATION, t => {
    const s = cellBoundsFor(dataId);
    if (!s) { layer.visible = false; return; }
    const d = targetId ? cellBoundsFor(targetId) : null;
    layer.visible = true;

    const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
    const dx = d ? d.x + d.width / 2 : sx + (opts.isEnemy ? -1 : 1) * s.width * 1.5;
    const dy = d ? d.y + d.height / 2 : sy;
    const R  = Math.min(s.width, s.height);

    const charge = clamp01(t / 0.26);
    const travel = clamp01((t - 0.24) / 0.44);
    const burst  = clamp01((t - 0.66) / 0.34);

    const ang   = Math.atan2(dy - sy, dx - sx);
    const perpX = Math.cos(ang + Math.PI / 2), perpY = Math.sin(ang + Math.PI / 2);

    // Gathering: blood pools at the caster before it is thrown.
    chargeG.clear();
    if (travel === 0) {
      softGlow(chargeG, sx, sy, R * 0.30 * charge, 0xff4a4a, 0.55 * charge);
      softGlow(chargeG, sx, sy, R * 0.16 * charge, 0xffb0b0, 0.75 * charge);
    }

    // Flight: sags along the way, trailing droplets behind it.
    boltG.clear();
    if (travel > 0 && burst < 0.5) {
      const sag = Math.sin(travel * Math.PI) * R * 0.22;
      const bx  = lerp(sx, dx, travel);
      const by  = lerp(sy, dy, travel) + sag;
      const a   = 1 - burst * 2;

      for (const p of trail) {
        const pt = Math.max(0, travel - p.lag);
        const px = lerp(sx, dx, pt) + perpX * p.perp * R * 0.05;
        const py = lerp(sy, dy, pt) + Math.sin(pt * Math.PI) * R * 0.22 + perpY * p.perp * R * 0.05;
        boltG.beginFill(0x8b0f14, 0.5 * a * (1 - p.lag * 4));
        boltG.drawCircle(px, py, p.size * (1 - p.lag));
        boltG.endFill();
      }
      boltG.beginFill(0xb01218, 0.95 * a);
      boltG.drawCircle(bx, by, R * 0.11);
      boltG.endFill();
      boltG.beginFill(0xff6b6b, 0.85 * a);
      boltG.drawCircle(bx - Math.cos(ang) * R * 0.02, by - Math.sin(ang) * R * 0.02, R * 0.05);
      boltG.endFill();
    }

    // Impact: spatter that falls rather than expanding evenly.
    spatG.clear();
    if (burst > 0) {
      const a = 1 - burst;
      for (const sp of spatter) {
        const dist = R * 0.9 * burst * sp.speed;
        const px = dx + Math.cos(sp.ang) * dist;
        const py = dy + Math.sin(sp.ang) * dist + burst * burst * R * sp.drop;
        spatG.beginFill(0x9c1015, 0.85 * a);
        spatG.drawCircle(px, py, sp.size * (1 - burst * 0.5));
        spatG.endFill();
      }
      spatG.lineStyle(2.5 * a + 1, 0xd11d24, a * 0.8);
      spatG.drawCircle(dx, dy, R * 0.18 + burst * R * 0.7);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] blood_bolt END', dataId);
}

// ── arrow_shot — a loosed arrow flies from the actor to the target ────────────
// Uses /assets/vfx/arrow.png, rotated to its flight path, with a shallow arc, a
// short motion-blur trail, and a puff of dust where it lands.
//
// The art is drawn POINTING UP (tip at the top of the image), so every rotation
// is offset by +90 degrees: an unrotated sprite faces -Y, while atan2 gives the
// angle from +X. Without the offset the arrow flies sideways.
export async function arrow_shot(cellEl, opts = {}) {
  console.log('[battle-fx] arrow_shot START', cellEl?.dataset?.id, '->', opts.targetCell?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId   = cellEl.dataset.id;
  const targetId = opts.targetCell?.dataset?.id || null;
  const clamp01  = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp     = (a, b, t) => a + (b - a) * t;
  const rand     = (a, b) => a + Math.random() * (b - a);
  const TAU      = Math.PI * 2;

  const layer = new PIXI.Container();
  app.stage.addChild(layer);

  let texture;
  try {
    texture = await PIXI.Assets.load(assetUrl('/assets/vfx/arrow.png'));
  } catch {
    // No art present — draw nothing rather than throwing mid-battle.
    layer.destroy({ children: true });
    return;
  }

  // The arrow plus two fading ghosts behind it, for motion blur.
  const sprites = [0.18, 0.38, 1].map(alpha => {
    const sp = new PIXI.Sprite(texture);
    // Pivot nearer the tip (0.35 down the shaft) so the head leads through the
    // arc instead of the whole arrow rotating about its middle.
    sp.anchor.set(0.5, 0.35);
    const scale = 52 / Math.max(texture.width, texture.height);
    sp.scale.set(scale);
    sp.alpha = alpha;
    layer.addChild(sp);
    return sp;
  });
  const [ghost1, ghost2, arrow] = sprites;

  const dust  = Array.from({ length: 10 }, () => ({ ang: rand(0, TAU), speed: rand(0.3, 0.9), size: rand(1.5, 3.5) }));
  const dustG = new PIXI.Graphics();
  layer.addChild(dustG);

  const DURATION = 620;
  await animate(DURATION, t => {
    const s = cellBoundsFor(dataId);
    if (!s) { layer.visible = false; return; }
    const d = targetId ? cellBoundsFor(targetId) : null;
    layer.visible = true;

    const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
    const dx = d ? d.x + d.width / 2 : sx + (opts.isEnemy ? -1 : 1) * s.width * 1.8;
    const dy = d ? d.y + d.height / 2 : sy;
    const R  = Math.min(s.width, s.height);

    // Draw (0–.22) holds the arrow at the shooter, then it flies.
    const flight = clamp01((t - 0.22) / 0.58);
    const land   = clamp01((t - 0.78) / 0.22);

    const posAt = f => {
      const arc = Math.sin(f * Math.PI) * R * 0.18;
      return [lerp(sx, dx, f), lerp(sy, dy, f) - arc];
    };
    const [ax, ay] = posAt(flight);
    // Face the direction of travel, sampled slightly ahead, so the nose dips on
    // the way down instead of staying level.
    const [nx, ny] = posAt(Math.min(1, flight + 0.05));
    const rot = Math.atan2(ny - ay, nx - ax) + Math.PI / 2;   // art points up

    const a = (t < 0.22 ? t / 0.22 : 1) * (1 - land);
    arrow.position.set(ax, ay);
    arrow.rotation = rot;
    arrow.alpha    = a;

    const [g2x, g2y] = posAt(Math.max(0, flight - 0.06));
    const [g1x, g1y] = posAt(Math.max(0, flight - 0.12));
    ghost2.position.set(g2x, g2y); ghost2.rotation = rot; ghost2.alpha = a * 0.35;
    ghost1.position.set(g1x, g1y); ghost1.rotation = rot; ghost1.alpha = a * 0.16;

    // Impact dust.
    dustG.clear();
    if (land > 0) {
      for (const p of dust) {
        const dist = R * 0.5 * land * p.speed;
        dustG.beginFill(0xd8cfbc, 0.5 * (1 - land));
        dustG.drawCircle(dx + Math.cos(p.ang) * dist, dy + Math.sin(p.ang) * dist, p.size * (1 - land * 0.5));
        dustG.endFill();
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] arrow_shot END', dataId);
}

// ── cleanse — a POSITIVE dispel: the ally is unburdened ──────────────────────
// Reads as relief, not as damage. Warm gold-white light pours down over the
// unit, the debuffs crack and lift off as dark shards that rise and burn away,
// and a clean halo settles. Nothing bursts outward and nothing is thrown AT the
// target — the motion is downward light, then upward release.
export async function cleanse(cellEl) {
  console.log('[battle-fx] cleanse START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId  = cellEl.dataset.id;
  const rand    = (a, b) => a + Math.random() * (b - a);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const TAU     = Math.PI * 2;
  const ADD     = PIXI.BLEND_MODES.ADD;

  // The lifted afflictions: dark shards that peel off and rise, fading as they
  // leave. They start ON the unit rather than flying at it.
  const shards = Array.from({ length: 11 }, () => ({
    x: rand(-0.42, 0.42), y: rand(-0.25, 0.35),
    drift: rand(-0.18, 0.18), rise: rand(0.75, 1.35),
    size: rand(2.5, 6), spin: rand(-3, 3), delay: rand(0, 0.30),
  }));
  // Motes of clean light falling INTO the unit, the counter-motion.
  const blessings = Array.from({ length: 9 }, () => ({
    x: rand(-0.40, 0.40), fall: rand(0.6, 1.1), size: rand(1.5, 3.5), delay: rand(0, 0.4),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(7)];
  const beamG  = new PIXI.Graphics(); beamG.blendMode  = ADD;
  const blessG = new PIXI.Graphics(); blessG.blendMode = ADD;
  const haloG  = new PIXI.Graphics(); haloG.blendMode  = ADD;
  const shardG = new PIXI.Graphics();                    // dark, normal blend
  glowLayer.addChild(beamG, blessG, haloG);
  layer.addChild(glowLayer, shardG);
  app.stage.addChild(layer);

  const DURATION = 1000;
  await animate(DURATION, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);

    const pour    = clamp01(t / 0.40);          // light descends
    const release = clamp01((t - 0.25) / 0.55); // afflictions lift
    const settle  = clamp01((t - 0.70) / 0.30); // halo closes
    const fade    = t < 0.12 ? t / 0.12 : (t > 0.80 ? (1 - t) / 0.20 : 1);

    // A shaft of warm light coming DOWN over the unit — the blessing arriving.
    beamG.clear();
    const beamW = R * 0.52 * pour;
    const beamH = b.height * pour;
    beamG.beginFill(0xfff3cd, 0.16 * fade);
    beamG.drawRoundedRect(cx - beamW / 2, b.y, beamW, beamH, beamW * 0.4);
    beamG.endFill();
    softGlow(beamG, cx, cy - R * 0.1, R * 0.44 * pour, 0xffe9a8, 0.34 * fade);

    // Clean motes settling into the unit.
    blessG.clear();
    for (const m of blessings) {
      const mt = clamp01((t - m.delay) / (0.75 - m.delay));
      if (mt <= 0) continue;
      const mx = cx + m.x * R;
      const my = b.y + (cy - b.y) * mt * m.fall;
      softGlow(blessG, mx, my, m.size, 0xfff8e0, 0.75 * (1 - mt) * fade);
    }

    // Afflictions peeling off and rising away — they never travel toward the
    // unit, so the effect cannot be mistaken for something being cast AT it.
    shardG.clear();
    for (const sh of shards) {
      const st = clamp01((release - sh.delay) / (1 - sh.delay));
      if (st <= 0) continue;
      const sx = cx + sh.x * R + Math.sin(st * 5 + sh.spin) * R * 0.06 + sh.drift * R * st;
      const sy = cy + sh.y * R - st * R * sh.rise;
      const a  = (1 - st) * 0.85 * fade;
      const sz = sh.size * (1 - st * 0.55);
      shardG.beginFill(0x2a2233, a);
      shardG.drawCircle(sx, sy, sz);
      shardG.endFill();
      // a thin bright edge, as if the light is burning them off
      shardG.lineStyle(1, 0xffe9a8, a * 0.55);
      shardG.drawCircle(sx, sy, sz * 1.5);
      shardG.lineStyle(0);
    }

    // The halo that closes over a cleansed unit.
    haloG.clear();
    if (settle > 0) {
      const hA = Math.sin(settle * Math.PI) * 0.9 * fade;
      haloG.lineStyle(2.5, 0xfff3cd, hA);
      haloG.drawEllipse(cx, cy - R * 0.30, R * 0.34 * (0.7 + settle * 0.3), R * 0.12);
      softGlow(haloG, cx, cy - R * 0.30, R * 0.22, 0xffe9a8, hA * 0.5);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] cleanse END', dataId);
}

// ── poison_dart — a heavy glob of venom, not a needle ────────────────────────
// Rewritten for weight: it winds up, travels slowly on a sagging arc with a fat
// trailing tail, lands with a thud (impact ring + shockwave), throws a wide
// splatter, and leaves a bubbling pool that drips.
export async function poison_dart(cellEl, opts = {}) {
  console.log('[battle-fx] poison_dart START', cellEl?.dataset?.id, '->', opts.targetCell?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId   = cellEl.dataset.id;
  const targetId = opts.targetCell?.dataset?.id || null;
  const clamp01  = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp     = (a, b, t) => a + (b - a) * t;
  const rand     = (a, b) => a + Math.random() * (b - a);
  const TAU      = Math.PI * 2;
  const ADD      = PIXI.BLEND_MODES.ADD;

  const tail     = Array.from({ length: 10 }, (_, i) => ({ lag: 0.03 + i * 0.022, size: rand(2.5, 6) }));
  const splatter = Array.from({ length: 18 }, () => ({
    ang: rand(0, TAU), speed: rand(0.35, 1.15), size: rand(2.5, 7), drop: rand(0.3, 1.0),
  }));
  const bubbles  = Array.from({ length: 7 }, () => ({
    x: rand(-0.30, 0.30), size: rand(2, 5), phase: rand(0, TAU), rate: rand(1.5, 3),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(6)];
  const auraG   = new PIXI.Graphics(); auraG.blendMode = ADD;
  const globG   = new PIXI.Graphics();                     // the mass itself
  const splatG  = new PIXI.Graphics();
  const poolG   = new PIXI.Graphics();
  const waveG   = new PIXI.Graphics();
  glowLayer.addChild(auraG);
  layer.addChild(glowLayer, poolG, globG, splatG, waveG);
  app.stage.addChild(layer);

  const DURATION = 1000;
  await animate(DURATION, t => {
    const s = cellBoundsFor(dataId);
    if (!s) { layer.visible = false; return; }
    const d = targetId ? cellBoundsFor(targetId) : null;
    layer.visible = true;

    const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
    const dx = d ? d.x + d.width / 2 : sx + (opts.isEnemy ? -1 : 1) * s.width * 1.6;
    const dy = d ? d.y + d.height / 2 : sy;
    const R  = Math.min(s.width, s.height);

    const wind   = clamp01(t / 0.24);            // gathers and swells
    const travel = clamp01((t - 0.22) / 0.40);   // slow, heavy flight
    const impact = clamp01((t - 0.60) / 0.16);   // the thud
    const linger = clamp01((t - 0.66) / 0.34);   // pool + bubbling

    const ang   = Math.atan2(dy - sy, dx - sx);
    const time  = t * DURATION * 0.01;

    // Wind-up: the glob swells at the caster, dripping before release.
    auraG.clear();
    if (travel === 0) {
      softGlow(auraG, sx, sy, R * 0.34 * wind, 0x7bd83a, 0.55 * wind);
      softGlow(auraG, sx, sy, R * 0.18 * wind, 0xd9ff9e, 0.7 * wind);
    }

    // Flight: sags under its own mass, fat tail, wobbling as it goes.
    globG.clear();
    if (travel > 0 && impact < 0.6) {
      const sag = Math.sin(travel * Math.PI) * R * 0.30;
      const gx  = lerp(sx, dx, travel);
      const gy  = lerp(sy, dy, travel) + sag;
      const a   = 1 - impact * 1.6;

      for (const p of tail) {
        const pt = Math.max(0, travel - p.lag);
        const px = lerp(sx, dx, pt);
        const py = lerp(sy, dy, pt) + Math.sin(pt * Math.PI) * R * 0.30;
        globG.beginFill(0x3f7a16, 0.45 * a * (1 - p.lag * 3));
        globG.drawCircle(px, py, p.size * (1 - p.lag * 1.5));
        globG.endFill();
      }
      // The mass: a squashed blob, wobbling along its axis of travel.
      const wob = 1 + Math.sin(time * 1.4) * 0.14;
      globG.beginFill(0x4f9c1c, 0.95 * a);
      globG.drawEllipse(gx, gy, R * 0.15 * wob, R * 0.13 / wob);
      globG.endFill();
      globG.beginFill(0xa8e85a, 0.9 * a);
      globG.drawEllipse(gx - Math.cos(ang) * R * 0.02, gy - Math.sin(ang) * R * 0.02, R * 0.07, R * 0.06);
      globG.endFill();
    }

    // Impact: a hard shockwave ring, the "thud".
    waveG.clear();
    if (impact > 0 && impact < 1) {
      waveG.lineStyle(4 * (1 - impact) + 1, 0xd9ff9e, (1 - impact) * 0.9);
      waveG.drawCircle(dx, dy, R * 0.15 + impact * R * 0.85);
      waveG.lineStyle(2 * (1 - impact), 0x4f9c1c, (1 - impact) * 0.7);
      waveG.drawCircle(dx, dy, R * 0.05 + impact * R * 0.55);
    }

    // Splatter thrown wide, falling as it flies.
    splatG.clear();
    if (impact > 0) {
      const a = 1 - linger * 0.8;
      for (const sp of splatter) {
        const dist = R * 0.95 * impact * sp.speed;
        const px = dx + Math.cos(sp.ang) * dist;
        const py = dy + Math.sin(sp.ang) * dist * 0.75 + impact * impact * R * sp.drop * 0.5;
        splatG.beginFill(0x3f7a16, 0.8 * a);
        splatG.drawCircle(px, py, sp.size * (1 - impact * 0.35));
        splatG.endFill();
      }
    }

    // A pool that stays and bubbles under the target.
    poolG.clear();
    if (linger > 0) {
      const a = (1 - linger) * 0.85;
      poolG.beginFill(0x2f5c10, a);
      poolG.drawEllipse(dx, dy + R * 0.30, R * 0.34 * (0.6 + linger * 0.4), R * 0.10);
      poolG.endFill();
      for (const bub of bubbles) {
        const rise = (Math.sin(time * bub.rate + bub.phase) + 1) / 2;
        poolG.beginFill(0x7bd83a, a * 0.8 * (1 - rise));
        poolG.drawCircle(dx + bub.x * R, dy + R * 0.30 - rise * R * 0.16, bub.size * (1 - rise * 0.4));
        poolG.endFill();
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] poison_dart END', dataId);
}

// ── claw_strike — the classic three parallel slashes ────────────────────────
// Three strokes at ONE angle, evenly spaced along the perpendicular, each swept
// from start to end a beat apart. Every stroke is tapered — thin at both ends,
// thick in the middle — by drawing it as a filled quad rather than a line, which
// is what makes it read as a claw rather than three pen marks.
export async function claw_strike(cellEl, opts = {}) {
  console.log('[battle-fx] claw_strike START', cellEl?.dataset?.id, '->', opts.targetCell?.dataset?.id);
  const target = opts.targetCell || cellEl;
  if (!target || !app || !window.PIXI) return;
  const dataId  = target.dataset.id;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rand    = (a, b) => a + Math.random() * (b - a);
  const ADD     = PIXI.BLEND_MODES.ADD;

  // One rake direction for all three, so they stay parallel: down-right.
  const ANGLE   = Math.PI * 0.30;
  const COS = Math.cos(ANGLE), SIN = Math.sin(ANGLE);
  // Perpendicular, used to space the strokes apart.
  const PX = -SIN, PY = COS;

  // Middle stroke is the longest; the outer two trail it slightly.
  const GASHES = [
    { offset: -1, delay: 0.00, len: 0.86, width: 0.030 },
    { offset:  0, delay: 0.06, len: 1.00, width: 0.038 },
    { offset:  1, delay: 0.12, len: 0.88, width: 0.030 },
  ];

  const sparks = Array.from({ length: 12 }, () => ({
    along: rand(-0.5, 0.5), out: rand(0.25, 0.8), size: rand(1.5, 3.5), delay: rand(0, 0.25),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(5)];
  const glowG  = new PIXI.Graphics(); glowG.blendMode  = ADD;   // hot bloom under the cuts
  const sparkG = new PIXI.Graphics(); sparkG.blendMode = ADD;
  const cutG   = new PIXI.Graphics();                            // the cuts themselves
  layer.addChild(glowLayer, cutG);
  glowLayer.addChild(glowG, sparkG);
  app.stage.addChild(layer);

  // A tapered stroke: a quad that swells to `w` at the middle and closes to a
  // point at both ends, drawn from `t0` to `t1` along the stroke.
  function drawTaperedSlash(g, x0, y0, x1, y1, w, color, alpha, reveal) {
    if (alpha <= 0 || reveal <= 0) return;
    const STEPS = 12;
    const ex = x0 + (x1 - x0) * reveal;
    const ey = y0 + (y1 - y0) * reveal;
    const dx = ex - x0, dy = ey - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;      // unit normal

    g.beginFill(color, alpha);
    g.moveTo(x0, y0);
    // one side, widening then narrowing
    for (let i = 1; i <= STEPS; i++) {
      const f = i / STEPS;
      const half = Math.sin(f * Math.PI) * w;
      g.lineTo(x0 + dx * f + nx * half, y0 + dy * f + ny * half);
    }
    // back along the other side
    for (let i = STEPS; i >= 1; i--) {
      const f = i / STEPS;
      const half = Math.sin(f * Math.PI) * w;
      g.lineTo(x0 + dx * f - nx * half, y0 + dy * f - ny * half);
    }
    g.closePath();
    g.endFill();
  }

  const DURATION = 620;
  await animate(DURATION, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);
    const reach  = R * 0.52;      // half-length of the middle stroke
    const spread = R * 0.20;      // gap between strokes

    // A short jolt as the first stroke lands.
    const jolt = t < 0.30 ? (1 - t / 0.30) * 3.5 : 0;
    const jx = (Math.random() - 0.5) * jolt;
    const jy = (Math.random() - 0.5) * jolt;

    cutG.clear();
    glowG.clear();

    for (const g of GASHES) {
      const st = clamp01((t - g.delay) / 0.26);           // sweep of this stroke
      if (st <= 0) continue;
      const fade = clamp01((t - g.delay - 0.30) / 0.34);  // then it cools away
      const alpha = 1 - fade;

      const ox = cx + jx + PX * spread * g.offset;
      const oy = cy + jy + PY * spread * g.offset;
      const half = reach * g.len;
      const x0 = ox - COS * half, y0 = oy - SIN * half;
      const x1 = ox + COS * half, y1 = oy + SIN * half;

      // Bloom under the cut while it is fresh.
      drawTaperedSlash(glowG, x0, y0, x1, y1, R * g.width * 2.1, 0xff5a5a, 0.5 * alpha, st);
      // The cut: pale core over a red body.
      drawTaperedSlash(cutG, x0, y0, x1, y1, R * g.width,        0xb01218, 0.95 * alpha, st);
      drawTaperedSlash(cutG, x0, y0, x1, y1, R * g.width * 0.42, 0xffe3e3, 0.95 * alpha * (1 - fade * 0.5), st);

      // The leading tip glows while the stroke is still travelling.
      if (st < 1) {
        const tx = x0 + (x1 - x0) * st, ty = y0 + (y1 - y0) * st;
        softGlow(glowG, tx, ty, R * 0.10, 0xffd0d0, 0.85);
      }
    }

    // Flecks thrown off along the rake, falling as they go.
    sparkG.clear();
    const spray = clamp01((t - 0.10) / 0.55);
    if (spray > 0) {
      for (const sp of sparks) {
        const s2 = clamp01((spray - sp.delay) / (1 - sp.delay));
        if (s2 <= 0) continue;
        const bx = cx + jx + COS * reach * sp.along;
        const by = cy + jy + SIN * reach * sp.along;
        const px = bx + PX * R * sp.out * s2;
        const py = by + PY * R * sp.out * s2 + s2 * s2 * R * 0.25;
        softGlow(sparkG, px, py, sp.size * (1 - s2 * 0.5), 0xff8a8a, (1 - s2) * 0.8);
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] claw_strike END', dataId);
}


// ── frost_claw — the same three-stroke rake, but cold ───────────────────────
// Deliberately NOT a recolour of claw_strike. A fire claw is an impact: it
// flashes hottest on contact and cools away. A frost claw is the opposite —
// the cut lands pale and thin, then the cold KEEPS working after the strike:
// rime crawls out along each gash and crystals bloom at the ends while the
// wound itself dims. So the strokes fade early and the frost peaks late.
export async function frost_claw(cellEl, opts = {}) {
  console.log('[battle-fx] frost_claw START', cellEl?.dataset?.id, '->', opts.targetCell?.dataset?.id);
  const target = opts.targetCell || cellEl;
  if (!target || !app || !window.PIXI) return;
  const dataId  = target.dataset.id;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rand    = (a, b) => a + Math.random() * (b - a);
  const ADD     = PIXI.BLEND_MODES.ADD;

  // Raked the other way from claw_strike (down-LEFT) so the two read as
  // different attacks when a unit has both.
  const ANGLE = Math.PI * 0.70;
  const COS = Math.cos(ANGLE), SIN = Math.sin(ANGLE);
  const PX = -SIN, PY = COS;

  const GASHES = [
    { offset: -1, delay: 0.00, len: 0.88, width: 0.026 },
    { offset:  0, delay: 0.05, len: 1.00, width: 0.034 },
    { offset:  1, delay: 0.10, len: 0.90, width: 0.026 },
  ];

  // Shards fly out and DRIFT — barely any gravity, unlike the fire claw's
  // flecks, so they hang in the air and settle rather than fall.
  const shards = Array.from({ length: 14 }, () => ({
    along: rand(-0.6, 0.6), out: rand(0.3, 0.95), size: rand(2.0, 4.5),
    delay: rand(0, 0.3), spin: rand(-3, 3), tilt: rand(0, Math.PI),
  }));

  // Rime crystals that grow along the middle gash after the cut lands.
  const rime = Array.from({ length: 10 }, () => ({
    along: rand(-0.85, 0.85), side: Math.random() < 0.5 ? -1 : 1,
    len: rand(0.06, 0.15), delay: rand(0.18, 0.5), tilt: rand(-0.5, 0.5),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(6)];
  const glowG  = new PIXI.Graphics(); glowG.blendMode  = ADD;
  const shardG = new PIXI.Graphics(); shardG.blendMode = ADD;
  const cutG   = new PIXI.Graphics();
  const rimeG  = new PIXI.Graphics(); rimeG.blendMode  = ADD;
  layer.addChild(glowLayer, cutG, rimeG);
  glowLayer.addChild(glowG, shardG);
  app.stage.addChild(layer);

  // Same tapered quad as claw_strike — thin at both ends, swelling in the
  // middle — which is what makes a stroke read as a claw rather than a line.
  function drawTaperedSlash(g, x0, y0, x1, y1, w, color, alpha, reveal) {
    if (alpha <= 0 || reveal <= 0) return;
    const STEPS = 12;
    const ex = x0 + (x1 - x0) * reveal;
    const ey = y0 + (y1 - y0) * reveal;
    const dx = ex - x0, dy = ey - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;

    g.beginFill(color, alpha);
    g.moveTo(x0, y0);
    for (let i = 1; i <= STEPS; i++) {
      const f = i / STEPS;
      const half = Math.sin(f * Math.PI) * w;
      g.lineTo(x0 + dx * f + nx * half, y0 + dy * f + ny * half);
    }
    for (let i = STEPS; i >= 1; i--) {
      const f = i / STEPS;
      const half = Math.sin(f * Math.PI) * w;
      g.lineTo(x0 + dx * f - nx * half, y0 + dy * f - ny * half);
    }
    g.closePath();
    g.endFill();
  }

  // An angular splinter rather than a round spark — ice does not glow soft.
  function drawShard(g, x, y, size, tilt, color, alpha) {
    if (alpha <= 0 || size <= 0) return;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const pt = (ax, ay) => [x + ax * c - ay * s, y + ax * s + ay * c];
    const [ax, ay] = pt(size * 2.0, 0);
    const [bx, by] = pt(0, size * 0.55);
    const [dx2, dy2] = pt(-size * 2.0, 0);
    const [ex, ey] = pt(0, -size * 0.55);
    g.beginFill(color, alpha);
    g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(dx2, dy2); g.lineTo(ex, ey);
    g.closePath(); g.endFill();
  }

  const DURATION = 760;   // longer than the fire claw: the frost outlives the cut
  await animate(DURATION, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);
    const reach  = R * 0.52;
    const spread = R * 0.20;

    // A brief shiver, softer and shorter than the fire claw's jolt.
    const jolt = t < 0.22 ? (1 - t / 0.22) * 2.2 : 0;
    const jx = (Math.random() - 0.5) * jolt;
    const jy = (Math.random() - 0.5) * jolt;

    cutG.clear();
    glowG.clear();
    rimeG.clear();

    // Cold gathers just before the first stroke connects.
    if (t < 0.2) softGlow(glowG, cx, cy, R * 0.42 * (1 - t / 0.2), 0x9fe8ff, 0.28 * (1 - t / 0.2));

    let midGash = null;
    for (const g of GASHES) {
      const st = clamp01((t - g.delay) / 0.24);
      if (st <= 0) continue;
      // Fades sooner than the fire claw — the wound goes dull while the rime
      // keeps spreading over it.
      const fade  = clamp01((t - g.delay - 0.22) / 0.46);
      const alpha = 1 - fade;

      const ox = cx + jx + PX * spread * g.offset;
      const oy = cy + jy + PY * spread * g.offset;
      const half = reach * g.len;
      const x0 = ox - COS * half, y0 = oy - SIN * half;
      const x1 = ox + COS * half, y1 = oy + SIN * half;
      if (g.offset === 0) midGash = { x0, y0, x1, y1, st };

      // Cold bloom: deep glacial blue, dimmer than the fire claw's bloom.
      drawTaperedSlash(glowG, x0, y0, x1, y1, R * g.width * 2.3, 0x4db8ff, 0.42 * alpha, st);
      // The cut: icy blue body under a white-blue core.
      drawTaperedSlash(cutG, x0, y0, x1, y1, R * g.width,        0x1d6fa8, 0.95 * alpha, st);
      drawTaperedSlash(cutG, x0, y0, x1, y1, R * g.width * 0.40, 0xeafaff, 0.95 * alpha * (1 - fade * 0.4), st);

      if (st < 1) {
        const tx = x0 + (x1 - x0) * st, ty = y0 + (y1 - y0) * st;
        softGlow(glowG, tx, ty, R * 0.09, 0xd6f4ff, 0.9);
      }
    }

    // Rime creeping out of the middle gash — the part that says "frost".
    if (midGash) {
      const nx = -SIN, ny = COS;
      for (const rc of rime) {
        const rt = clamp01((t - rc.delay) / 0.3);
        if (rt <= 0) continue;
        const rFade = clamp01((t - 0.72) / 0.28);
        const a = (1 - rFade) * 0.85;
        if (a <= 0) continue;
        const bx = cx + jx + COS * reach * rc.along;
        const by = cy + jy + SIN * reach * rc.along;
        const gl = R * rc.len * rt;
        const dx3 = nx * rc.side + COS * rc.tilt;
        const dy3 = ny * rc.side + SIN * rc.tilt;
        const dl  = Math.hypot(dx3, dy3) || 1;
        rimeG.lineStyle(Math.max(1, R * 0.012), 0xcdefff, a);
        rimeG.moveTo(bx, by);
        rimeG.lineTo(bx + dx3 / dl * gl, by + dy3 / dl * gl);
        // little barb, so it reads as a crystal and not a hair
        const bl = gl * 0.45;
        rimeG.moveTo(bx + dx3 / dl * gl * 0.6, by + dy3 / dl * gl * 0.6);
        rimeG.lineTo(bx + dx3 / dl * gl * 0.6 + COS * bl, by + dy3 / dl * gl * 0.6 + SIN * bl);
        rimeG.lineStyle(0);
      }
    }

    // Shards: thrown out along the rake, drifting and slowing to a stop.
    shardG.clear();
    const spray = clamp01((t - 0.08) / 0.6);
    if (spray > 0) {
      for (const sp of shards) {
        const s2 = clamp01((spray - sp.delay) / (1 - sp.delay));
        if (s2 <= 0) continue;
        const ease = 1 - Math.pow(1 - s2, 2.2);       // decelerating drift
        const bx = cx + jx + COS * reach * sp.along;
        const by = cy + jy + SIN * reach * sp.along;
        const px = bx + PX * R * sp.out * ease;
        const py = by + PY * R * sp.out * ease + s2 * s2 * R * 0.06;   // barely falls
        drawShard(shardG, px, py, sp.size * (1 - s2 * 0.45),
                  sp.tilt + sp.spin * s2, 0xd8f4ff, (1 - s2) * 0.9);
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] frost_claw END', dataId);
}


// ── holy_shock — one action, two faces ─────────────────────────────────────
// The only action in the game that branches: pointed at an enemy it strikes,
// at an ally it mends (see the holy_shock branch in utils/battle-engine.js).
// Both halves share a palette and a halo ring so they read as the same power
// with opposite intent — judgement coming DOWN, mercy rising UP.
//
// opts.isHeal is passed by the dispatcher in screens/battle.js. Do not try to
// infer it from which cell was handed in: for a heal the caller anchors on the
// target, for a strike on the actor, and that is not a contract worth relying
// on silently.
export async function holy_shock(cellEl, opts = {}) {
  console.log('[battle-fx] holy_shock START', cellEl?.dataset?.id, 'heal:', opts.isHeal === true);
  if (!cellEl || !app || !window.PIXI) return;
  const heal    = opts.isHeal === true;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rand    = (a, b) => a + Math.random() * (b - a);
  const ADD     = PIXI.BLEND_MODES.ADD;

  const GOLD  = 0xffe08a;
  const WHITE = 0xfffdf2;
  const DEEP  = 0xffb03a;

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(6)];
  const glowG  = new PIXI.Graphics(); glowG.blendMode  = ADD;
  const boltG  = new PIXI.Graphics(); boltG.blendMode  = ADD;
  const ringG  = new PIXI.Graphics(); ringG.blendMode  = ADD;
  const flashG = new PIXI.Graphics(); flashG.blendMode = ADD;   // full-canvas white-out
  layer.addChild(glowLayer, boltG, ringG, flashG);
  glowLayer.addChild(glowG);
  app.stage.addChild(layer);

  // Motes: rising for a mend, falling embers of light for a strike.
  const motes = Array.from({ length: 14 }, () => ({
    ax: rand(-0.42, 0.42), delay: rand(0, 0.45), size: rand(1.5, 3.4), speed: rand(0.7, 1.3),
  }));

  // A forked bolt: a jagged path with a couple of dead-end branches. Seeded once
  // so the shape holds still across ticks instead of reshuffling every frame.
  const SEGMENTS = 9;
  const jitter   = Array.from({ length: SEGMENTS + 1 }, () => rand(-1, 1));
  const branches = [
    { at: 0.42, len: 0.30, dir: rand(-1, 1), j: Array.from({ length: 4 }, () => rand(-1, 1)) },
    { at: 0.68, len: 0.24, dir: rand(-1, 1), j: Array.from({ length: 4 }, () => rand(-1, 1)) },
  ];

  function drawBolt(g, x0, y0, x1, y1, width, color, alpha, reveal) {
    if (alpha <= 0 || reveal <= 0) return;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const spread = len * 0.06;

    const pointAt = f => {
      const idx = Math.min(SEGMENTS, Math.floor(f * SEGMENTS));
      // Pinned at both ends, loosest in the middle — a bolt that wanders away
      // from its own target reads as a mistake.
      const wobble = Math.sin(f * Math.PI) * jitter[idx] * spread;
      return [x0 + dx * f + nx * wobble, y0 + dy * f + ny * wobble];
    };

    g.lineStyle(width, color, alpha);
    let [px, py] = pointAt(0);
    g.moveTo(px, py);
    for (let i = 1; i <= SEGMENTS; i++) {
      const f = (i / SEGMENTS) * reveal;
      const [qx, qy] = pointAt(f);
      g.lineTo(qx, qy);
    }
    // Forks, drawn only once the trunk has passed their root.
    for (const b of branches) {
      if (reveal < b.at) continue;
      const [bx, by] = pointAt(b.at);
      g.moveTo(bx, by);
      for (let i = 1; i <= 4; i++) {
        const f = i / 4;
        g.lineTo(
          bx + dx * b.len * f + nx * (b.dir * spread * 2.2 * f) + nx * b.j[i - 1] * spread * 0.5,
          by + dy * b.len * f + ny * (b.dir * spread * 2.2 * f) + ny * b.j[i - 1] * spread * 0.5,
        );
      }
    }
    g.lineStyle(0);
  }

  const dataId   = cellEl.dataset.id;
  const targetId = opts.targetCell?.dataset?.id || dataId;
  const DURATION = heal ? 720 : 640;

  await animate(DURATION, t => {
    const tb = cellBoundsFor(heal ? dataId : targetId);
    const ab = cellBoundsFor(heal ? dataId : dataId);
    if (!tb || !ab) { layer.visible = false; return; }
    layer.visible = true;

    const tx = tb.x + tb.width / 2, ty = tb.y + tb.height / 2;
    const R  = Math.min(tb.width, tb.height);

    glowG.clear(); boltG.clear(); ringG.clear(); flashG.clear();

    if (!heal) {
      // ── STRIKE ──────────────────────────────────────────────────────────
      // Comes down from above the target rather than across from the actor:
      // this is life damage, judgement, not a thrown projectile.
      const sx = tx, sy = tb.y - R * 1.5;
      const strike = clamp01(t / 0.22);          // bolt lands fast
      const decay  = clamp01((t - 0.26) / 0.5);
      const a      = 1 - decay;

      drawBolt(glowG, sx, sy, tx, ty, R * 0.16, DEEP,  0.55 * a, strike);
      drawBolt(boltG, sx, sy, tx, ty, R * 0.055, GOLD, 0.95 * a, strike);
      drawBolt(boltG, sx, sy, tx, ty, R * 0.022, WHITE, a,       strike);

      // Full-canvas white-out on contact. The PIXI canvas is an overlay ABOVE
      // the DOM grid, so a stage filter would only tint the effects layer —
      // washing the whole battlefield takes an actual full-screen quad.
      const flash = t < 0.10 ? (t / 0.10) : clamp01(1 - (t - 0.10) / 0.20);
      if (strike >= 1 && flash > 0) {
        flashG.beginFill(WHITE, 0.42 * flash);
        flashG.drawRect(0, 0, app.screen.width, app.screen.height);
        flashG.endFill();
      }

      // Ring of light punching outward from the point of impact.
      if (strike >= 1) {
        const rt = clamp01((t - 0.14) / 0.6);
        const rr = R * (0.15 + rt * 0.85);
        ringG.lineStyle(Math.max(1, R * 0.05 * (1 - rt)), GOLD, (1 - rt) * 0.9);
        ringG.drawCircle(tx, ty, rr);
        ringG.lineStyle(0);
        softGlow(glowG, tx, ty, R * 0.34 * (1 - rt * 0.5), WHITE, (1 - rt) * 0.75);
      }

      for (const m of motes) {
        const s = clamp01((t - m.delay) / 0.55);
        if (s <= 0) continue;
        const px = tx + m.ax * R;
        const py = ty + s * s * R * 0.5 * m.speed;    // sparks fall away
        softGlow(glowG, px, py, m.size * (1 - s * 0.5), GOLD, (1 - s) * 0.8);
      }
    } else {
      // ── MEND ────────────────────────────────────────────────────────────
      // Same palette, inverted motion: a steady column settles onto the ally
      // and motes rise out of it. No white-out — a heal fires most turns and
      // should not seize the screen the way a judgement does.
      const fall = clamp01(t / 0.35);
      const hold = clamp01(1 - (t - 0.5) / 0.5);

      const colW = R * 0.34;
      const top  = tb.y - R * 1.2;
      const botY = ty + R * 0.1;
      const yNow = top + (botY - top) * fall;
      glowG.beginFill(GOLD, 0.20 * hold);
      glowG.drawRect(tx - colW / 2, top, colW, Math.max(0, yNow - top));
      glowG.endFill();
      glowG.beginFill(WHITE, 0.30 * hold);
      glowG.drawRect(tx - colW / 4, top, colW / 2, Math.max(0, yNow - top));
      glowG.endFill();

      softGlow(glowG, tx, ty, R * 0.38 * fall, WHITE, 0.7 * hold);

      // The shared halo — same ring as the strike, opening gently instead of
      // snapping out, so both halves read as one power.
      const rt = clamp01((t - 0.2) / 0.7);
      if (rt > 0) {
        ringG.lineStyle(Math.max(1, R * 0.035), GOLD, (1 - rt) * 0.85);
        ringG.drawCircle(tx, ty, R * (0.2 + rt * 0.55));
        ringG.lineStyle(0);
      }

      for (const m of motes) {
        const s = clamp01((t - m.delay) / 0.6);
        if (s <= 0) continue;
        const px = tx + m.ax * R;
        const py = ty - s * R * 0.75 * m.speed;       // motes rise
        softGlow(glowG, px, py, m.size * (1 - s * 0.4), WHITE, (1 - s) * 0.85);
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] holy_shock END', dataId);
}

// ── fellfire — one strike, every burning enemy ─────────────────────────────
// A fan-out effect: the passive splashes damage to EVERY already-burning enemy
// at once, so this fires once for the whole group rather than once per victim
// (see FAN_OUT_FX in screens/battle.js). opts.targetCells carries every cell.
//
// Ash-black cores with ember edges, deliberately unlike the clean orange of an
// ordinary burn — this is fire that answers to someone.
export async function fellfire(originCellEl, opts = {}) {
  const targetCells = (opts.targetCells || []).filter(Boolean);
  console.log('[battle-fx] fellfire START', originCellEl?.dataset?.id, '-> targets:', targetCells.length);
  if (!originCellEl || !targetCells.length || !app || !window.PIXI) return;

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rand    = (a, b) => a + Math.random() * (b - a);
  const ADD     = PIXI.BLEND_MODES.ADD;

  const EMBER = 0xff7a1e;
  const HOT   = 0xffd08a;
  const ASH   = 0x2a1408;

  const originId = originCellEl.dataset.id;
  // Seeded per target so each whip has its own arc and its own embers, but they
  // all run on the SAME clock — the point of the fan-out is simultaneity.
  const arcs = targetCells.map(c => ({
    id:    c.dataset.id,
    bow:   rand(0.18, 0.42) * (Math.random() < 0.5 ? -1 : 1),  // which way the arc bends
    delay: rand(0, 0.10),                                       // a hair of stagger, not a queue
    embers: Array.from({ length: 9 }, () => ({
      ang: rand(0, Math.PI * 2), dist: rand(0.2, 0.7), size: rand(1.6, 3.6), d: rand(0, 0.2),
    })),
  })).filter(a => a.id);

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(6)];
  const glowG = new PIXI.Graphics(); glowG.blendMode = ADD;
  const whipG = new PIXI.Graphics();                    // ash core, NOT additive
  const hotG  = new PIXI.Graphics(); hotG.blendMode  = ADD;
  layer.addChild(glowLayer, whipG, hotG);
  glowLayer.addChild(glowG);
  app.stage.addChild(layer);

  // Quadratic bezier, so the fire arcs across the field instead of ruling a
  // straight line between two cells.
  const bez = (p0, p1, p2, f) => {
    const m = 1 - f;
    return [m * m * p0[0] + 2 * m * f * p1[0] + f * f * p2[0],
            m * m * p0[1] + 2 * m * f * p1[1] + f * f * p2[1]];
  };

  function drawWhip(g, p0, p1, p2, reveal, width, color, alpha) {
    if (alpha <= 0 || reveal <= 0) return;
    const STEPS = 20;
    g.lineStyle(width, color, alpha);
    let [px, py] = bez(p0, p1, p2, 0);
    g.moveTo(px, py);
    for (let i = 1; i <= STEPS; i++) {
      const [qx, qy] = bez(p0, p1, p2, (i / STEPS) * reveal);
      g.lineTo(qx, qy);
    }
    g.lineStyle(0);
  }

  await animate(700, t => {
    const ob = cellBoundsFor(originId);
    if (!ob) { layer.visible = false; return; }
    layer.visible = true;

    const ox = ob.x + ob.width / 2, oy = ob.y + ob.height / 2;
    glowG.clear(); whipG.clear(); hotG.clear();

    for (const arc of arcs) {
      const tb = cellBoundsFor(arc.id);
      if (!tb) continue;
      const tx = tb.x + tb.width / 2, ty = tb.y + tb.height / 2;
      const R  = Math.min(tb.width, tb.height);

      const local  = clamp01((t - arc.delay) / (1 - arc.delay));
      const travel = clamp01(local / 0.34);            // whip reaches out
      const burn   = clamp01((local - 0.30) / 0.70);   // then the victim ignites
      const fade   = clamp01((local - 0.42) / 0.58);

      // Control point pushed off the midpoint's perpendicular.
      const mx = (ox + tx) / 2, my = (oy + ty) / 2;
      const dx = tx - ox, dy = ty - oy;
      const ctrl = [mx - dy * arc.bow, my + dx * arc.bow];
      const p0 = [ox, oy], p2 = [tx, ty];

      const a = 1 - fade;
      if (a > 0) {
        drawWhip(glowG, p0, ctrl, p2, travel, R * 0.20, EMBER, 0.45 * a);
        drawWhip(whipG, p0, ctrl, p2, travel, R * 0.085, ASH,  0.92 * a);
        drawWhip(hotG,  p0, ctrl, p2, travel, R * 0.034, EMBER, 0.95 * a);
        drawWhip(hotG,  p0, ctrl, p2, travel, R * 0.014, HOT,   a);
      }

      // The head of the whip while it is still travelling.
      if (travel < 1) {
        const [hx, hy] = bez(p0, ctrl, p2, travel);
        softGlow(glowG, hx, hy, R * 0.13, HOT, 0.9);
      }

      // Ignition: a flare on the victim, then embers thrown off it.
      if (burn > 0) {
        const flare = Math.sin(clamp01(burn / 0.35) * Math.PI);
        softGlow(glowG, tx, ty, R * 0.42 * flare, EMBER, 0.8 * flare);
        softGlow(glowG, tx, ty, R * 0.20 * flare, HOT,   0.9 * flare);

        for (const e of arc.embers) {
          const s = clamp01((burn - e.d) / (1 - e.d));
          if (s <= 0) continue;
          const px = tx + Math.cos(e.ang) * R * e.dist * s;
          const py = ty + Math.sin(e.ang) * R * e.dist * s - s * s * R * 0.22;  // embers lift
          softGlow(hotG, px, py, e.size * (1 - s * 0.55), EMBER, (1 - s) * 0.85);
        }
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] fellfire END');
}


// ── fire_bolt — the Choir's signature ranged attack ────────────────────────
// Deliberately NOT another clean projectile. arrow_shot and blood_bolt both
// travel as a tidy head with a tail; fire is heavier and dirtier — it GUTTERS on
// the way (the core flickers rather than holding steady), sheds dark smoke that
// lingers behind it instead of fading with the trail, and bursts rather than
// punching through. Smoke is drawn non-additively so it reads as an obstruction;
// only the flame itself is additive.
export async function fire_bolt(cellEl, opts = {}) {
  console.log('[battle-fx] fire_bolt START', cellEl?.dataset?.id, '->', opts.targetCell?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId   = cellEl.dataset.id;
  const targetId = opts.targetCell?.dataset?.id || null;
  if (!targetId) return;   // nothing to aim at; a bolt with no target is meaningless
  const clamp01  = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rand     = (a, b) => a + Math.random() * (b - a);
  const TAU      = Math.PI * 2;
  const ADD      = PIXI.BLEND_MODES.ADD;

  const CORE  = 0xfff0c0;
  const FLAME = 0xff8a1e;
  const DEEP  = 0xd63a08;
  const SMOKE = 0x2b2118;

  // Smoke puffs are seeded along the flight path and STAY where they were born,
  // so the bolt leaves a trail hanging in the air behind it.
  const puffs = Array.from({ length: 10 }, (_, i) => ({
    at:   (i + 0.5) / 10,
    perp: rand(-0.5, 0.5),
    size: rand(0.10, 0.22),
    rise: rand(0.15, 0.5),
  }));
  const embers = Array.from({ length: 16 }, () => ({
    ang: rand(0, TAU), speed: rand(0.35, 1.1), size: rand(1.6, 4), delay: rand(0, 0.18),
  }));
  // Per-frame guttering, seeded so the flicker is consistent frame to frame.
  const flickSeed = rand(0, TAU);

  const layer      = new PIXI.Container();
  const glowLayer  = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(6)];
  const smokeLayer = new PIXI.Container();
  smokeLayer.filters = [new PIXI.BlurFilter(4)];
  const smokeG = new PIXI.Graphics();                   // NOT additive: smoke occludes
  const glowG  = new PIXI.Graphics(); glowG.blendMode = ADD;
  const boltG  = new PIXI.Graphics(); boltG.blendMode = ADD;
  layer.addChild(smokeLayer, glowLayer, boltG);
  smokeLayer.addChild(smokeG);
  glowLayer.addChild(glowG);
  app.stage.addChild(layer);

  await animate(660, t => {
    const ab = cellBoundsFor(dataId);
    const tb = cellBoundsFor(targetId);
    if (!ab || !tb) { layer.visible = false; return; }
    layer.visible = true;

    const ax = ab.x + ab.width / 2, ay = ab.y + ab.height / 2;
    const tx = tb.x + tb.width / 2, ty = tb.y + tb.height / 2;
    const R  = Math.min(tb.width, tb.height);

    // A shallow arc, so it lobs rather than tracking a ruler line.
    const dx = tx - ax, dy = ty - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const arc = R * 0.30;
    const pointAt = f => [
      ax + dx * f + nx * Math.sin(f * Math.PI) * arc,
      ay + dy * f + ny * Math.sin(f * Math.PI) * arc,
    ];

    const CHARGE = 0.16, FLIGHT = 0.52;
    const charge = clamp01(t / CHARGE);
    const travel = clamp01((t - CHARGE) / (FLIGHT - CHARGE));
    const impact = clamp01((t - FLIGHT) / (1 - FLIGHT));

    smokeG.clear(); glowG.clear(); boltG.clear();

    // Gathering at the caster before release.
    if (t < CHARGE) {
      const g = Math.sin(charge * Math.PI * 0.5);
      softGlow(glowG, ax, ay, R * 0.20 * g, FLAME, 0.75 * g);
      softGlow(glowG, ax, ay, R * 0.09 * g, CORE,  0.9 * g);
    }

    // In flight.
    if (t >= CHARGE && travel < 1) {
      const [hx, hy] = pointAt(travel);
      // Guttering: the flame's size wavers as it flies instead of holding steady.
      const gutter = 0.78 + 0.22 * Math.sin(t * 34 + flickSeed);

      softGlow(glowG, hx, hy, R * 0.30 * gutter, DEEP,  0.55);
      softGlow(glowG, hx, hy, R * 0.19 * gutter, FLAME, 0.85);
      softGlow(boltG, hx, hy, R * 0.085 * gutter, CORE, 1.0);

      // A short lick of flame stretched back along the direction of travel.
      const back = 0.055;
      const [bx, by] = pointAt(Math.max(0, travel - back));
      boltG.lineStyle(R * 0.055 * gutter, FLAME, 0.75);
      boltG.moveTo(bx, by); boltG.lineTo(hx, hy);
      boltG.lineStyle(0);
    }

    // Smoke: every puff the bolt has already passed stays put and drifts upward.
    for (const p of puffs) {
      if (travel < p.at) continue;
      const age = clamp01((travel - p.at) / 0.75 + impact * 0.5);
      const [px, py] = pointAt(p.at);
      smokeG.beginFill(SMOKE, 0.34 * (1 - age));
      smokeG.drawCircle(
        px + nx * R * p.perp * 0.30,
        py + ny * R * p.perp * 0.30 - age * R * p.rise,
        R * p.size * (0.6 + age * 1.1),
      );
      smokeG.endFill();
    }

    // Impact: bloom, scorch ring, embers thrown outward.
    if (impact > 0) {
      const flare = Math.sin(clamp01(impact / 0.3) * Math.PI);
      softGlow(glowG, tx, ty, R * 0.62 * flare, DEEP,  0.7);
      softGlow(glowG, tx, ty, R * 0.36 * flare, FLAME, 0.9);
      softGlow(boltG, tx, ty, R * 0.16 * flare, CORE,  1.0);

      const rr = R * (0.2 + impact * 0.7);
      boltG.lineStyle(Math.max(1, R * 0.05 * (1 - impact)), FLAME, (1 - impact) * 0.8);
      boltG.drawCircle(tx, ty, rr);
      boltG.lineStyle(0);

      for (const e of embers) {
        const s = clamp01((impact - e.delay) / (1 - e.delay));
        if (s <= 0) continue;
        const d = R * e.speed * s;
        softGlow(boltG,
          tx + Math.cos(e.ang) * d,
          ty + Math.sin(e.ang) * d + s * s * R * 0.22,   // embers arc down as they die
          e.size * (1 - s * 0.6), FLAME, (1 - s) * 0.85);
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] fire_bolt END', dataId);
}


// Heavy ranged PHYSICAL shot — hurled stone, siege shell, rifle ball. Kept
// deliberately distinct from arrow_shot: no arc, no fletching, no drawn-bow
// hold. A muzzle flash, a dense slug crossing in a straight line, and a
// percussive hit, so a dreadnought does not read as a longbow.
//
// Ten units share it (action_animation in data/units.js) and FIVE of them are
// AoE x6 — the multi-target path fires one instance per victim through a single
// Promise.all, so this stays short and allocates a fixed, small number of
// particles rather than scaling with anything.
export async function cannon_shot(cellEl, opts = {}) {
  console.log('[battle-fx] cannon_shot START', cellEl?.dataset?.id, '->', opts.targetCell?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId   = cellEl.dataset.id;
  const targetId = opts.targetCell?.dataset?.id || null;
  const clamp01  = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp     = (a, b, t) => a + (b - a) * t;
  const rand     = (a, b) => a + Math.random() * (b - a);
  const TAU      = Math.PI * 2;
  const ADD      = PIXI.BLEND_MODES.ADD;

  const FLASH = 0xfff2d2;   // muzzle core
  const SPARK = 0xffc873;   // burning powder
  const SMOKE = 0x3a342d;   // propellant smoke, occludes
  const DUST  = 0xbfb3a0;   // masonry dust at the impact
  const IRON  = 0x6e6459;   // shrapnel / broken masonry

  const layer      = new PIXI.Container();
  const smokeLayer = new PIXI.Container(); smokeLayer.filters = [new PIXI.BlurFilter(5)];
  const glowLayer  = new PIXI.Container(); glowLayer.filters  = [new PIXI.BlurFilter(6)];
  const smokeG = new PIXI.Graphics();                       // NOT additive: smoke hides what is behind it
  const glowG  = new PIXI.Graphics(); glowG.blendMode = ADD;
  const shotG  = new PIXI.Graphics(); shotG.blendMode = ADD;
  const dustG  = new PIXI.Graphics();
  smokeLayer.addChild(smokeG); glowLayer.addChild(glowG);
  layer.addChild(smokeLayer, dustG, glowLayer, shotG);
  app.stage.addChild(layer);

  // Seeded once so the flight and the burst are stable frame to frame.
  const trail  = Array.from({ length: 8 }, (_, i) => ({
    at: (i + 0.5) / 8, perp: rand(-0.35, 0.35), size: rand(0.07, 0.16), rise: rand(0.05, 0.28),
  }));
  const debris = Array.from({ length: 12 }, () => ({
    ang: rand(0, TAU), speed: rand(0.35, 1.05), size: rand(1.6, 4.2), delay: rand(0, 0.16), spin: rand(-4, 4),
  }));
  const sparks = Array.from({ length: 10 }, () => ({
    ang: rand(0, TAU), speed: rand(0.5, 1.3), size: rand(1.2, 2.6), delay: rand(0, 0.1),
  }));

  const DURATION = 560;
  await animate(DURATION, t => {
    const s = cellBoundsFor(dataId);
    if (!s) { layer.visible = false; return; }
    const d = targetId ? cellBoundsFor(targetId) : null;
    layer.visible = true;

    const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
    // With no target cell (a log entry that lost its target) the shot still
    // leaves the barrel, aimed off the unit's facing, rather than not drawing.
    const dx = d ? d.x + d.width / 2 : sx + (opts.isEnemy ? -1 : 1) * s.width * 1.8;
    const dy = d ? d.y + d.height / 2 : sy;
    const R  = Math.min(s.width, s.height);

    const ux = dx - sx, uy = dy - sy;
    const len = Math.hypot(ux, uy) || 1;
    const nx = ux / len, ny = uy / len;          // along the barrel
    const px = -ny,      py = nx;                // across it

    const muzzle = clamp01(t / 0.14);            // flash blooms then dies
    const flight = clamp01((t - 0.10) / 0.52);
    const impact = clamp01((t - 0.62) / 0.38);

    smokeG.clear(); glowG.clear(); shotG.clear(); dustG.clear();

    // ── Muzzle: a hot cone off the barrel and a shove of smoke behind it.
    if (muzzle > 0 && muzzle < 1) {
      const f = Math.sin(muzzle * Math.PI);
      const mx = sx + nx * R * 0.30, my = sy + ny * R * 0.30;
      softGlow(glowG, mx, my, R * 0.30 * f, SPARK, 0.75);
      softGlow(shotG, mx, my, R * 0.13 * f, FLASH, 1.0);
      shotG.beginFill(FLASH, 0.55 * f);
      shotG.drawPolygon([
        sx + nx * R * 0.12, sy + ny * R * 0.12,
        mx + px * R * 0.20 * f, my + py * R * 0.20 * f,
        mx + nx * R * 0.34,     my + ny * R * 0.34,
        mx - px * R * 0.20 * f, my - py * R * 0.20 * f,
      ]);
      shotG.endFill();
    }
    if (muzzle > 0) {
      const age = clamp01(t / 0.5);
      smokeG.beginFill(SMOKE, 0.32 * (1 - age));
      smokeG.drawCircle(sx + nx * R * 0.34, sy + ny * R * 0.34 - age * R * 0.22, R * (0.14 + age * 0.30));
      smokeG.endFill();
    }

    // ── The slug: a short bright streak, not a dot, so the speed reads.
    if (flight > 0 && flight < 1) {
      const bx = lerp(sx, dx, flight), by = lerp(sy, dy, flight);
      const tail = R * 0.26;
      shotG.lineStyle(Math.max(2, R * 0.075), FLASH, 0.95);
      shotG.moveTo(bx - nx * tail, by - ny * tail);
      shotG.lineTo(bx, by);
      shotG.lineStyle(0);
      softGlow(glowG, bx, by, R * 0.15, SPARK, 0.85);

      // Trail puffs are born on the line and STAY there, so the shot leaves a
      // wake hanging in the air instead of dragging a tail along with it.
      for (const p of trail) {
        if (flight < p.at) continue;
        const age = clamp01((flight - p.at) / 0.6 + impact * 0.5);
        const ex = lerp(sx, dx, p.at) + px * R * p.perp * 0.22;
        const ey = lerp(sy, dy, p.at) + py * R * p.perp * 0.22 - age * R * p.rise;
        smokeG.beginFill(SMOKE, 0.26 * (1 - age));
        smokeG.drawCircle(ex, ey, R * p.size * (0.7 + age));
        smokeG.endFill();
      }
    }

    // ── Impact: white flash, expanding dust ring, chunks and sparks thrown out.
    if (impact > 0) {
      const flare = Math.sin(clamp01(impact / 0.28) * Math.PI);
      softGlow(glowG, dx, dy, R * 0.42 * flare, SPARK, 0.8);
      softGlow(shotG, dx, dy, R * 0.18 * flare, FLASH, 1.0);

      const ring = R * (0.18 + impact * 0.62);
      dustG.lineStyle(Math.max(1, R * 0.055 * (1 - impact)), DUST, (1 - impact) * 0.7);
      dustG.drawCircle(dx, dy, ring);
      dustG.lineStyle(0);

      for (const c of debris) {
        const s2 = clamp01((impact - c.delay) / (1 - c.delay));
        if (s2 <= 0) continue;
        const dist = R * 0.62 * s2 * c.speed;
        const cx = dx + Math.cos(c.ang) * dist;
        const cy = dy + Math.sin(c.ang) * dist + s2 * s2 * R * 0.26;   // chunks fall
        const sz = c.size * (1 - s2 * 0.45);
        const rot = c.spin * s2;
        dustG.beginFill(IRON, (1 - s2) * 0.85);
        dustG.drawPolygon([
          cx + Math.cos(rot) * sz,            cy + Math.sin(rot) * sz,
          cx + Math.cos(rot + 2.2) * sz,      cy + Math.sin(rot + 2.2) * sz,
          cx + Math.cos(rot + 4.2) * sz * 0.8, cy + Math.sin(rot + 4.2) * sz * 0.8,
        ]);
        dustG.endFill();
      }
      for (const k of sparks) {
        const s2 = clamp01((impact - k.delay) / (1 - k.delay));
        if (s2 <= 0) continue;
        const dist = R * 0.7 * s2 * k.speed;
        softGlow(shotG, dx + Math.cos(k.ang) * dist, dy + Math.sin(k.ang) * dist,
                 k.size * (1 - s2 * 0.7), SPARK, (1 - s2) * 0.9);
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] cannon_shot END', dataId);
}

// Cold PROJECTILE — the Glittering Abyss's casters and the cold-damage ghosts.
// frost_claw already covers cold at melee range; this is the thrown half of the
// school, so the two read as the same element without looking like each other:
// a shard forms, crosses, and shatters, where the claw rakes.
export async function frost_bolt(cellEl, opts = {}) {
  console.log('[battle-fx] frost_bolt START', cellEl?.dataset?.id, '->', opts.targetCell?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId   = cellEl.dataset.id;
  const targetId = opts.targetCell?.dataset?.id || null;
  const clamp01  = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp     = (a, b, t) => a + (b - a) * t;
  const rand     = (a, b) => a + Math.random() * (b - a);
  const TAU      = Math.PI * 2;
  const ADD      = PIXI.BLEND_MODES.ADD;

  const CORE = 0xf2fbff;   // the shard itself, almost white
  const ICE  = 0x9fe4ff;   // pale cyan body
  const DEEP = 0x3f8fd6;   // shadowed blue
  const RIME = 0xdff4ff;   // settling frost

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container(); glowLayer.filters = [new PIXI.BlurFilter(6)];
  const glowG = new PIXI.Graphics(); glowG.blendMode = ADD;
  const boltG = new PIXI.Graphics(); boltG.blendMode = ADD;
  const iceG  = new PIXI.Graphics();
  glowLayer.addChild(glowG);
  layer.addChild(glowLayer, iceG, boltG);
  app.stage.addChild(layer);

  // Motes drawn IN toward the caster while the shard forms, then left behind.
  const motes = Array.from({ length: 12 }, () => ({
    ang: rand(0, TAU), dist: rand(0.5, 1.1), size: rand(1.2, 2.8), delay: rand(0, 0.35),
  }));
  // Shards thrown by the shatter — they drift rather than fall, like frost_claw.
  const chips = Array.from({ length: 14 }, () => ({
    ang: rand(0, TAU), speed: rand(0.35, 1.0), size: rand(1.8, 4.4), delay: rand(0, 0.2), spin: rand(-3, 3),
  }));
  const trail = Array.from({ length: 9 }, (_, i) => ({
    at: (i + 0.5) / 9, perp: rand(-0.3, 0.3), size: rand(1.4, 3.2),
  }));

  const DURATION = 640;
  await animate(DURATION, t => {
    const s = cellBoundsFor(dataId);
    if (!s) { layer.visible = false; return; }
    const d = targetId ? cellBoundsFor(targetId) : null;
    layer.visible = true;

    const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
    const dx = d ? d.x + d.width / 2 : sx + (opts.isEnemy ? -1 : 1) * s.width * 1.8;
    const dy = d ? d.y + d.height / 2 : sy;
    const R  = Math.min(s.width, s.height);

    const ux = dx - sx, uy = dy - sy;
    const len = Math.hypot(ux, uy) || 1;
    const nx = ux / len, ny = uy / len;
    const px = -ny,      py = nx;

    const form    = clamp01(t / 0.20);
    const flight  = clamp01((t - 0.20) / 0.50);
    const shatter = clamp01((t - 0.70) / 0.30);

    glowG.clear(); boltG.clear(); iceG.clear();

    // ── Forming: motes converge on a point just off the caster.
    if (form < 1) {
      const ox = sx + nx * R * 0.28, oy = sy + ny * R * 0.28;
      for (const m of motes) {
        const s2 = clamp01((form - m.delay) / (1 - m.delay));
        if (s2 <= 0) continue;
        const dist = R * m.dist * (1 - s2);
        softGlow(boltG, ox + Math.cos(m.ang) * dist, oy + Math.sin(m.ang) * dist,
                 m.size * (0.5 + s2 * 0.5), ICE, s2 * 0.9);
      }
      softGlow(glowG, ox, oy, R * 0.22 * form, ICE, 0.7 * form);
    }

    // ── Flight: a six-point shard, tumbling, with a cold wake behind it.
    if (flight > 0 && flight < 1) {
      const bx = lerp(sx, dx, flight), by = lerp(sy, dy, flight);
      const spin = flight * 7;
      const rr   = R * 0.14;

      for (const p of trail) {
        if (flight < p.at) continue;
        const age = clamp01((flight - p.at) / 0.5);
        softGlow(glowG,
          lerp(sx, dx, p.at) + px * R * p.perp * 0.18,
          lerp(sy, dy, p.at) + py * R * p.perp * 0.18,
          p.size * (1 - age * 0.5), DEEP, (1 - age) * 0.5);
      }

      softGlow(glowG, bx, by, R * 0.26, ICE, 0.85);
      // Long axis along the direction of travel, so it flies point-first.
      const a1 = Math.atan2(ny, nx);
      boltG.beginFill(CORE, 0.95);
      boltG.drawPolygon([
        bx + Math.cos(a1) * rr * 1.9,        by + Math.sin(a1) * rr * 1.9,
        bx + Math.cos(a1 + 1.9) * rr * 0.8,  by + Math.sin(a1 + 1.9) * rr * 0.8,
        bx - Math.cos(a1) * rr * 1.2,        by - Math.sin(a1) * rr * 1.2,
        bx + Math.cos(a1 - 1.9) * rr * 0.8,  by + Math.sin(a1 - 1.9) * rr * 0.8,
      ]);
      boltG.endFill();
      // A second, thinner blade crossing it, spinning — reads as a crystal
      // rather than a flat lozenge.
      boltG.lineStyle(Math.max(1, R * 0.02), ICE, 0.8);
      boltG.moveTo(bx + Math.cos(spin) * rr * 1.1, by + Math.sin(spin) * rr * 1.1);
      boltG.lineTo(bx - Math.cos(spin) * rr * 1.1, by - Math.sin(spin) * rr * 1.1);
      boltG.lineStyle(0);
    }

    // ── Shatter: a hard bloom, an expanding rime ring, chips drifting outward.
    if (shatter > 0) {
      const flare = Math.sin(clamp01(shatter / 0.3) * Math.PI);
      softGlow(glowG, dx, dy, R * 0.46 * flare, ICE,  0.85);
      softGlow(boltG, dx, dy, R * 0.20 * flare, CORE, 1.0);

      const ring = R * (0.16 + shatter * 0.58);
      iceG.lineStyle(Math.max(1, R * 0.05 * (1 - shatter)), RIME, (1 - shatter) * 0.8);
      iceG.drawCircle(dx, dy, ring);
      iceG.lineStyle(0);
      // Six spikes of rime crawling out along the ring — the ground freezing.
      iceG.lineStyle(Math.max(1, R * 0.03 * (1 - shatter)), ICE, (1 - shatter) * 0.7);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        iceG.moveTo(dx + Math.cos(a) * ring * 0.45, dy + Math.sin(a) * ring * 0.45);
        iceG.lineTo(dx + Math.cos(a) * ring,        dy + Math.sin(a) * ring);
      }
      iceG.lineStyle(0);

      for (const c of chips) {
        const s2 = clamp01((shatter - c.delay) / (1 - c.delay));
        if (s2 <= 0) continue;
        const dist = R * 0.6 * s2 * c.speed;
        const cx = dx + Math.cos(c.ang) * dist;
        const cy = dy + Math.sin(c.ang) * dist + s2 * s2 * R * 0.06;   // barely any gravity
        const sz = c.size * (1 - s2 * 0.5);
        const rot = c.spin * s2;
        iceG.beginFill(CORE, (1 - s2) * 0.9);
        iceG.drawPolygon([
          cx + Math.cos(rot) * sz,             cy + Math.sin(rot) * sz,
          cx + Math.cos(rot + 2.1) * sz * 0.7, cy + Math.sin(rot + 2.1) * sz * 0.7,
          cx + Math.cos(rot + 4.2) * sz * 0.9, cy + Math.sin(rot + 4.2) * sz * 0.9,
        ]);
        iceG.endFill();
      }
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] frost_bolt END', dataId);
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
  radiance,
  terror,
  mothers_blessing,
  // Pale Embrace is the same picture by design: one pale soul sent to every
  // ally mended, from a caster who is spending herself. Aliased rather than
  // copied so the two can never drift apart.
  pale_embrace: mothers_blessing,
  cleanse,
  raise_dead,
  shield_bash,
  arcane_bolt,
  poison_dart,
  claw_strike,
  frost_claw,
  holy_shock,
  fellfire,
  aegis,
  mend_flesh,
  // Song of Ash is a mend, so it borrows the mend picture rather than shipping a
  // near-identical one. Aliased, not copied, so the two cannot drift apart —
  // same arrangement as pale_embrace above.
  song_of_ash: mend_flesh,
  haunt,
  blood_bolt,
  fire_bolt,
  arrow_shot,
  cannon_shot,
  frost_bolt,
  repair,
};