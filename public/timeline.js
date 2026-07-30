// Roadmap / "coming soon" timeline, opened from the leftmost resource-bar slot.
// Entries are intentionally simple placeholders for the dev to edit by hand.
// An entry may carry `date` (any string) and one or more `sprites` — 5×5 (25
// frame) 256px idle spritesheets under /assets/character_sprites, animated here.

const SPRITE_COLS   = 5;      // 5×5 grid
const SPRITE_FRAMES = 25;
const FRAME_MS      = 90;     // ~11 fps idle loop

// ── Edit these freely ────────────────────────────────────────────────────────
const TIMELINE = [
  {
    date: 'Coming soon',
    title: 'Character animations!',
    desc: 'Fully-animated units join the roster.',
    sprites: [
      { src: '/assets/character_sprites/e21.png',   alt: 'Templar' },
      { src: '/assets/character_sprites/gs312.png', alt: 'Crimson Mage' },
    ],
  },
  { date: '', title: 'Placeholder update', desc: 'Coming later — edit me in public/timeline.js.' },
  { date: '', title: 'Placeholder update', desc: 'Coming later — edit me in public/timeline.js.' },
  { date: '', title: 'Placeholder update', desc: 'Coming later — edit me in public/timeline.js.' },
];
// ─────────────────────────────────────────────────────────────────────────────

let activeCleanup = null;

// Steps an element's background through the 5×5 sheet. Returns a stop function.
function animateSprite(el) {
  let i = 0;
  const tick = () => {
    const col = i % SPRITE_COLS;
    const row = Math.floor(i / SPRITE_COLS);
    // Percentage positioning over a 500%-sized background: frame c sits at c/4*100%.
    el.style.backgroundPosition = `${col * 25}% ${row * 25}%`;
    i = (i + 1) % SPRITE_FRAMES;
  };
  tick();
  const id = setInterval(tick, FRAME_MS);
  return () => clearInterval(id);
}

function entryHtml(e) {
  const spriteRow = (e.sprites && e.sprites.length)
    ? `<div class="timeline-sprites">${e.sprites.map(s => `
         <figure class="timeline-sprite-fig">
           <div class="timeline-sprite" data-src="${s.src}" role="img" aria-label="${s.alt}"
                style="background-image:url('${s.src}')"></div>
           <figcaption>${s.alt}</figcaption>
         </figure>`).join('')}</div>`
    : '';
  return `
    <div class="timeline-entry">
      <div class="timeline-dot"></div>
      <div class="timeline-body">
        ${e.date ? `<span class="timeline-date">${e.date}</span>` : ''}
        <div class="timeline-title">${e.title}</div>
        ${e.desc ? `<div class="timeline-desc">${e.desc}</div>` : ''}
        ${spriteRow}
      </div>
    </div>`;
}

export function openTimeline() {
  closeTimeline(); // never stack two

  const overlay = document.createElement('div');
  overlay.className = 'timeline-overlay';
  overlay.innerHTML = `
    <div class="timeline-modal" role="dialog" aria-label="Roadmap">
      <div class="timeline-header">
        <span class="timeline-header-title">What's Next</span>
        <button class="timeline-close" aria-label="Close">✕</button>
      </div>
      <div class="timeline-list">
        ${TIMELINE.map(entryHtml).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Start every sprite's loop and collect their stoppers.
  const stops = [...overlay.querySelectorAll('.timeline-sprite')].map(animateSprite);

  const close = () => closeTimeline();
  overlay.querySelector('.timeline-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  activeCleanup = () => {
    stops.forEach(stop => stop());
    overlay.remove();
    activeCleanup = null;
  };
}

export function closeTimeline() {
  if (activeCleanup) activeCleanup();
}