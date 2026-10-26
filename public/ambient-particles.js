// Subtle ambient motes that carry the player's faction palette across screens.
// The canvas is decorative only: it never receives pointer input or focus.
const PALETTES = {
  empire: ['#ffe7a0', '#d79a35', '#fff5d4'],
  grail_of_sorrow: ['#c52f3a', '#65a34b', '#8f1827', '#a7c96c'],
  choir_of_the_cursed: ['#ff6a24', '#f1a33b', '#512b62', '#78627f'],
};

const canvas = document.createElement('canvas');
canvas.id = 'ambient-particles';
canvas.setAttribute('aria-hidden', 'true');
canvas.setAttribute('role', 'presentation');
document.body.prepend(canvas);

const context = canvas.getContext('2d', { alpha: true });
if (!context) {
  canvas.remove();
} else {
  let width = 0;
  let height = 0;
  let frame = 0;
  let particles = [];
  let palette = PALETTES[document.body.dataset.faction] || PALETTES.empire;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.max(32, Math.min(76, Math.round((width * height) / 12500)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.16,
      vy: (Math.random() - 0.5) * 0.16,
      alpha: Math.random() * 0.3 + 0.12,
      pulse: (Math.random() - 0.5) * 0.003,
      color: palette[Math.floor(Math.random() * palette.length)],
    }));
  }

  function syncFaction() {
    const next = PALETTES[document.body.dataset.faction] || PALETTES.empire;
    if (next === palette) return;
    palette = next;
    for (const particle of particles) {
      particle.color = palette[Math.floor(Math.random() * palette.length)];
    }
  }

  function draw() {
    frame = 0;
    if (document.hidden) return;
    syncFaction();
    context.clearRect(0, 0, width, height);

    for (const particle of particles) {
      if (!reducedMotion.matches) {
        particle.x = (particle.x + particle.vx + width) % width;
        particle.y = (particle.y + particle.vy + height) % height;
        particle.alpha += particle.pulse;
        if (particle.alpha < 0.12 || particle.alpha > 0.42) particle.pulse *= -1;
      }
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fillStyle = particle.color;
      context.globalAlpha = particle.alpha;
      context.fill();
    }
    context.globalAlpha = 1;
    if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
  }

  function start() {
    if (!frame && !document.hidden) draw();
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  resize();
  start();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  reducedMotion.addEventListener?.('change', () => reducedMotion.matches ? stop() : start());
  new MutationObserver(syncFaction).observe(document.body, { attributes: true, attributeFilter: ['data-faction'] });
}
