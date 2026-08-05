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
    const tex = await PIXI.Assets.load('/assets/vfx/repair_gear.png');
    gearSprite = new PIXI.Sprite(tex);
    gearSprite.anchor.set(0.5, 0.5);
    layer.addChild(gearSprite);
  } catch { /* procedural gear carries it */ }

  const DURATION = 3150;
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
    texture = await PIXI.Assets.load('/assets/vfx/arrow.png');
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
  cleanse,
  raise_dead,
  shield_bash,
  arcane_bolt,
  poison_dart,
  claw_strike,
  mend_flesh,
  haunt,
  blood_bolt,
  arrow_shot,
  repair,
};