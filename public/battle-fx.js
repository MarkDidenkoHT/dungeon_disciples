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
    texture = await PIXI.Assets.load('/assets/vfx/sword.png');
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
    texture = await PIXI.Assets.load('/assets/vfx/impale.png');
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

    const scale  = t < 0.2 ? t / 0.2 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const alpha  = t < 0.15 ? t / 0.15 : t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;

    shield.clear();
    shield.lineStyle(6, 0x88ccff, 0.25 * alpha);
    shield.arc(cx, cy, r * scale * 1.15, Math.PI, 0);
    shield.lineStyle(3, 0xaaddff, 0.9 * alpha);
    shield.arc(cx, cy, r * scale, Math.PI, 0);
    shield.moveTo(cx - r * scale, cy);
    shield.lineTo(cx + r * scale, cy);
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] protector END', dataId);
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

// ── light_of_dawn ──────────────────────────────────────────────────────────────
export async function light_of_dawn(cellEl) {
  console.log('[battle-fx] light_of_dawn START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const rand = (a, b) => a + Math.random() * (b - a);

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

    const W  = app.screen.width;
    const y  = b.y;
    const h  = b.height * 0.85;
    const alpha = t < 0.25 ? t / 0.25 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);

    band.clear();
    band.beginFill(0xffe6a0, 0.30 * alpha); band.drawRect(0, y - h * 0.25, W, h * 1.5); band.endFill();
    band.beginFill(0xfff2c8, 0.45 * alpha); band.drawRect(0, y, W, h); band.endFill();

    rayG.clear();
    const sweep = t * 0.15;
    for (const r of rays) {
      const cx = ((r.frac + sweep + r.phase) % 1) * W;
      const rw = r.w * W;
      const flick = 0.5 + 0.5 * Math.sin(t * 6 + r.phase * 6);
      rayG.beginFill(0xfff0c0, 0.16 * alpha * flick);
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

// ═══════════════════════════════════════════════════════════════════════════════
// ── NEW EFFECTS ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── repair_gear — spinning gear descends, tightens onto the target, vibrates ───
// The gear sprite from /assets/vfx/repair_gear.png orbits down from above and
// "locks" onto the cell. During the tightening phase the cell vibrates. Then a
// metallic orange shimmer pulses outward and the gear lifts away repaired.
// Phases: descend (0–.30) → lock+vibrate (.30–.62) → shimmer (.58–.82) → lift (.78–1).
export async function repair_gear(cellEl) {
  console.log('[battle-fx] repair_gear START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ADD = PIXI.BLEND_MODES.ADD;

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(8)];
  const gearG   = new PIXI.Graphics();          // procedural gear, no texture needed as fallback
  const shimG   = new PIXI.Graphics(); shimG.blendMode = ADD;
  const sparkG  = new PIXI.Graphics(); sparkG.blendMode = ADD;
  glowLayer.addChild(shimG);
  layer.addChild(glowLayer, sparkG, gearG);
  app.stage.addChild(layer);

  // Try to load the sprite; fall back to procedural gear if missing.
  let gearSprite = null;
  try {
    const tex = await PIXI.Assets.load('/assets/vfx/repair_gear.png');
    gearSprite = new PIXI.Sprite(tex);
    gearSprite.anchor.set(0.5, 0.5);
    layer.addChild(gearSprite);
  } catch { /* use procedural */ }

  // Random sparks ejected at lock-in.
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const sparks = Array.from({ length: 12 }, () => ({
    ang: rand(0, TAU), speed: rand(0.6, 1.2), size: rand(1.5, 3.5),
  }));

  await animate(1050, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width  / 2;
    const cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height) * 0.42;

    // Phases
    const descend  = clamp01(t / 0.30);
    const lock     = clamp01((t - 0.30) / 0.32);
    const shimmer  = clamp01((t - 0.58) / 0.24);
    const lift     = clamp01((t - 0.78) / 0.22);

    // Gear rotation: fast spin on descend, decelerates to a halt at lock, then
    // reverses slightly as if torqued, lifts spinning again.
    const spinFast  = t * TAU * 6;
    const spinSlow  = descend * TAU * 4 + lock * TAU * 0.5;
    const spinLift  = lift * TAU * 3;
    const gearRot   = lock < 1 ? spinSlow : spinSlow + spinLift;

    // Gear Y: starts above cell, drops to center, then lifts back up.
    const dropY  = b.y - R * 2.5 + descend * (R * 2.5 + b.height * 0.15);
    const liftY  = cy - lift * (R * 2.5 + b.height * 0.15 + b.y - b.y);
    const gearY  = lock < 1 ? (descend < 1 ? dropY : cy) : cy - lift * R * 3;
    const gearX  = cx;

    // Vibration of the target during lock phase: small random jitter.
    const vibrate = lock * (1 - shimmer) * 3.5;
    const vx = (Math.random() - 0.5) * vibrate;
    const vy = (Math.random() - 0.5) * vibrate;

    // Gear alpha: fade in on descend, fade out on lift.
    const gAlpha = lock < 0.05
      ? descend
      : lift > 0.8 ? (1 - (lift - 0.8) / 0.2) : 1;

    // Draw procedural gear (always; sprite sits on top if loaded).
    gearG.clear();
    // Tightening glow ring under the gear during lock.
    if (lock > 0 && lock < 1) {
      gearG.lineStyle(3, 0xffa040, lock * (1 - lock) * 4 * 0.6);
      gearG.drawCircle(cx + vx, cy + vy, R * (0.9 + (1 - lock) * 0.3));
    }
    drawGear(gearG, gearX, gearY, R * 0.72, R * 0.52, 8, gearRot, 0xd4832a, gAlpha, 2.5);

    // Sprite overlay (if loaded).
    if (gearSprite) {
      const scale = (R * 1.44) / Math.max(gearSprite.texture.width, gearSprite.texture.height);
      gearSprite.position.set(gearX, gearY);
      gearSprite.rotation = gearRot;
      gearSprite.scale.set(scale, scale);
      gearSprite.alpha = gAlpha;
    }

    // Metallic shimmer pulse expanding outward at lock-in.
    shimG.clear();
    if (shimmer > 0) {
      const sAlpha = shimmer < 0.5 ? shimmer / 0.5 : (1 - shimmer) / 0.5;
      softGlow(shimG, cx, cy, R * (0.5 + shimmer * 1.4), 0xffb84d, 0.55 * sAlpha);
      softGlow(shimG, cx, cy, R * (0.2 + shimmer * 0.8), 0xfff0c0, 0.35 * sAlpha);
    }

    // Metal sparks ejected when the gear locks.
    sparkG.clear();
    const sparkPhase = clamp01((t - 0.30) / 0.20); // short burst after lock
    if (sparkPhase > 0 && sparkPhase < 1) {
      for (const sp of sparks) {
        const dist = R * sparkPhase * sp.speed;
        const sx2 = cx + Math.cos(sp.ang) * dist;
        const sy2 = cy + Math.sin(sp.ang) * dist;
        softGlow(sparkG, sx2, sy2, sp.size * (1.2 - sparkPhase), 0xffe080, (1 - sparkPhase) * 0.9);
      }
    }
  });

  if (gearSprite) gearSprite.destroy();
  layer.destroy({ children: true });
  console.log('[battle-fx] repair_gear END', dataId);
}

// ── cleanse — a purifying white-violet wash that expels dark impurity motes ────
// Phases: rise (.0–.45) a luminous curtain of white-violet light sweeps upward
// through the cell; eject (.25–.60) dark motes burst outward and dissolve;
// seal (.55–1) a clean iridescent ring contracts inward and vanishes.
export async function cleanse(cellEl) {
  console.log('[battle-fx] cleanse START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId = cellEl.dataset.id;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ADD = PIXI.BLEND_MODES.ADD;

  // Stable impurity mote constants — they fly outward in fixed directions.
  const motes = Array.from({ length: 14 }, () => ({
    ang: rand(0, TAU), speed: rand(0.7, 1.3), size: rand(3, 7), delay: rand(0, 0.3),
  }));
  // Sparkle cross/star specks that appear in the clean wake.
  const sparkles = Array.from({ length: 10 }, () => ({
    fx: rand(0.1, 0.9), fy: rand(0.1, 0.85), phase: rand(0, 1), size: rand(2, 4),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(7)];
  const washG  = new PIXI.Graphics(); washG.blendMode  = ADD;
  const moteG  = new PIXI.Graphics();                          // dark motes, normal blend
  const sparkG = new PIXI.Graphics(); sparkG.blendMode = ADD;
  const ringG  = new PIXI.Graphics();
  glowLayer.addChild(washG, sparkG);
  layer.addChild(glowLayer, moteG, ringG);
  app.stage.addChild(layer);

  await animate(950, t => {
    const b = cellBoundsFor(dataId);
    if (!b) { layer.visible = false; return; }
    layer.visible = true;

    const cx = b.x + b.width  / 2;
    const cy = b.y + b.height / 2;
    const R  = Math.min(b.width, b.height);

    // ── Rising purification wash ──────────────────────────────────────────────
    // A tall rectangle of violet-white light that rises from the bottom, like a
    // wave of holy water washing the filth upward and off the top of the cell.
    const rise   = clamp01(t / 0.45);
    const washA  = rise < 0.8 ? rise / 0.8 : (1 - rise) / 0.2;
    const washTop  = b.y + b.height * (1 - rise * 1.35); // sweeps past the top
    const washBot  = b.y + b.height;
    const washH    = Math.max(0, washBot - washTop);
    washG.clear();
    if (washH > 0) {
      washG.beginFill(0xd4aaff, 0.38 * washA);
      washG.drawRect(b.x, washTop, b.width, washH);
      washG.endFill();
      // Brighter leading edge — the crest of the wave.
      washG.beginFill(0xffffff, 0.50 * washA);
      washG.drawRect(b.x, washTop, b.width, Math.min(washH * 0.18, 8));
      washG.endFill();
    }

    // ── Dark impurity motes ejected outward ───────────────────────────────────
    moteG.clear();
    for (const m of motes) {
      const phase = clamp01((t - 0.25 - m.delay * 0.3) / 0.35);
      if (phase <= 0) continue;
      const dist = R * 0.85 * phase * m.speed;
      const mx = cx + Math.cos(m.ang) * dist;
      const my = cy + Math.sin(m.ang) * dist;
      const mAlpha = (1 - phase) * 0.8;
      moteG.beginFill(0x330044, mAlpha);
      moteG.drawCircle(mx, my, m.size * (1 - phase * 0.5));
      moteG.endFill();
    }

    // ── Clean sparkles that fill in after the wash passes ─────────────────────
    sparkG.clear();
    const sparkWindow = clamp01((t - 0.30) / 0.55);
    if (sparkWindow > 0) {
      for (const sp of sparkles) {
        const twinkle = Math.abs(Math.sin(t * 8 + sp.phase * TAU));
        const spAlpha = sparkWindow * (1 - clamp01((t - 0.72) / 0.28)) * twinkle;
        const sx2 = b.x + sp.fx * b.width;
        const sy2 = b.y + sp.fy * b.height;
        softGlow(sparkG, sx2, sy2, sp.size, 0xe8d0ff, spAlpha * 0.9);
        // Little cross flare
        const arm = sp.size * 1.6;
        sparkG.lineStyle(1, 0xffffff, spAlpha * 0.6);
        sparkG.moveTo(sx2 - arm, sy2); sparkG.lineTo(sx2 + arm, sy2);
        sparkG.moveTo(sx2, sy2 - arm); sparkG.lineTo(sx2, sy2 + arm);
      }
    }

    // ── Sealing ring contracts inward ─────────────────────────────────────────
    const seal = clamp01((t - 0.55) / 0.45);
    ringG.clear();
    if (seal > 0) {
      const ringR = R * (1.1 - seal * 0.9); // starts large, contracts to 0.2R
      const rAlpha = seal < 0.7 ? seal / 0.7 : (1 - seal) / 0.3;
      ringG.lineStyle(3, 0xcc88ff, rAlpha * 0.85);
      ringG.drawCircle(cx, cy, ringR);
      ringG.lineStyle(1.5, 0xffffff, rAlpha * 0.5);
      ringG.drawCircle(cx, cy, ringR * 0.88);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] cleanse END', dataId);
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

// ── poison_dart — a thin green dart streaks from caster to target, splatters ───
// A tiny poisonous projectile with a trailing venom wake. On arrival it
// splashes a toxic bloom and leaves a seeping green puddle that pulses.
// Good for rogues, assassins, and poisoner units.
export async function poison_dart(cellEl, opts = {}) {
  console.log('[battle-fx] poison_dart START', cellEl?.dataset?.id);
  if (!cellEl || !app || !window.PIXI) return;
  const dataId   = cellEl.dataset.id;
  const targetId = opts.targetCell?.dataset?.id || null;
  const clamp01  = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp     = (a, b, t) => a + (b - a) * t;
  const ADD = PIXI.BLEND_MODES.ADD;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  const splatter = Array.from({ length: 10 }, () => ({
    ang: rand(0, TAU), speed: rand(0.4, 1.0), size: rand(3, 8), delay: rand(0, 0.15),
  }));

  const layer     = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  glowLayer.filters = [new PIXI.BlurFilter(5)];
  const dartG    = new PIXI.Graphics();                          // crisp dart — normal blend
  const venomG   = new PIXI.Graphics(); venomG.blendMode   = ADD;
  const splatterG= new PIXI.Graphics(); splatterG.blendMode = ADD;
  const puddleG  = new PIXI.Graphics(); puddleG.blendMode  = ADD;
  glowLayer.addChild(venomG, splatterG, puddleG);
  layer.addChild(glowLayer, dartG);
  app.stage.addChild(layer);

  const DURATION = 700;
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

    const travel   = clamp01(t / 0.50);
    const detonate = clamp01((t - 0.48) / 0.24);
    const puddle   = clamp01((t - 0.62) / 0.38);

    const ang  = Math.atan2(dy - sy, dx - sx);
    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    const perpX = Math.cos(ang + Math.PI / 2), perpY = Math.sin(ang + Math.PI / 2);
    const dartLen = R * 0.28;

    // Dart body: thin needle.
    dartG.clear();
    if (travel < 1 || detonate < 0.15) {
      const tx2 = lerp(sx, dx, travel), ty2 = lerp(sy, dy, travel);
      const dartA = detonate < 0.15 ? 1 - detonate / 0.15 : 0;
      dartG.lineStyle(2.5, 0x22dd44, dartA);
      dartG.moveTo(tx2 - dirX * dartLen, ty2 - dirY * dartLen);
      dartG.lineTo(tx2 + dirX * dartLen * 0.4, ty2 + dirY * dartLen * 0.4);
      // Tip glow
      venomG.clear();
      softGlow(venomG, tx2 + dirX * dartLen * 0.4, ty2 + dirY * dartLen * 0.4, dartLen * 0.3, 0x55ff66, dartA * 0.7);
      // Venom trail behind.
      const trailSegs = 6;
      for (let i = 1; i <= trailSegs; i++) {
        const frac = 1 - (i / trailSegs) * 0.35;
        const trailT = Math.max(0, travel - i * 0.05);
        const trailX = lerp(sx, dx, trailT);
        const trailY = lerp(sy, dy, trailT);
        softGlow(venomG, trailX, trailY, dartLen * 0.2 * (1 - i / trailSegs), 0x33cc44, dartA * 0.4 * frac);
      }
    } else {
      venomG.clear();
    }

    // Splatter on arrival.
    splatterG.clear();
    if (detonate > 0) {
      const flash = detonate < 0.5 ? detonate / 0.5 : (1 - detonate) / 0.5;
      softGlow(splatterG, dx, dy, R * 0.4 * detonate, 0x44ff55, flash * 0.65);
      for (const sp of splatter) {
        const phase = clamp01((detonate - sp.delay) / 0.85);
        if (phase <= 0) continue;
        const dist = R * 0.65 * phase * sp.speed;
        const spx = dx + Math.cos(sp.ang) * dist;
        const spy = dy + Math.sin(sp.ang) * dist;
        softGlow(splatterG, spx, spy, sp.size * (1.1 - phase * 0.6), 0x33cc44, (1 - phase) * 0.8);
      }
    }

    // Seeping puddle that lingers and pulses.
    puddleG.clear();
    if (puddle > 0) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 1.8);
      const pAlpha = puddle < 0.4 ? puddle / 0.4 : (1 - clamp01((t - 0.88) / 0.12));
      softGlow(puddleG, dx, dy + R * 0.25, R * 0.38 * puddle * pulse, 0x22aa33, pAlpha * 0.5);
    }
  });

  layer.destroy({ children: true });
  console.log('[battle-fx] poison_dart END', dataId);
}

// ─────────────────────────────────────────────────────────────────────────────

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
  // ── new ──
  repair_gear,
  cleanse,
  raise_dead,
  shield_bash,
  arcane_bolt,
  poison_dart,
};