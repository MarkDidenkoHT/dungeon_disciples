const SPRITE_COLS   = 5;
const SPRITE_FRAMES = 25;
const FRAME_MS      = 90;

function lang(player) {
  return player?.settings?.language === 'ru' ? 'ru' : 'en';
}

const TIMELINE = [
  {
    date: '',
    title: { en: 'Errands!',
             ru: 'Поручения!' },
    desc:  { en: 'A daily quest system with tasks and rewards tailored to your faction and roster!',
             ru: 'Система ежедневных заданий — персонализированные поручения и награды под вашу фракцию и армию!' },
  },
  {
    date: '',
    title: { en: 'Castle animation and building images',
             ru: 'Анимация замка и изображения строений' },
    desc:  { en: 'Castle animation and building images',
             ru: 'Анимация замка и изображения строений' },
  },
  {
    date: '',
    title: { en: 'New characters and upgrade branches',
             ru: 'Новые персонажи и пути развития' },
    desc:  { en: null,
             ru: null },
  },
  {
    date: '',
    title: { en: 'Crown Shards — live PvP',
             ru: 'Осколки короны — живой PvP' },
    desc:  { en: 'Duel other players in real time, matched by party strength. Every victory counts toward your faction, not just your own rank.',
             ru: 'Дуэли с другими игроками в реальном времени, подбор по силе отряда. Каждая победа идёт в зачёт вашей фракции, а не только вашего личного ранга.' },
  },
  {
    date: '',
    title: { en: 'Character animations!',
             ru: 'Анимации персонажей!' },
    desc:  { en: 'Fully-animated units and improved battle grid!',
             ru: 'Полностью анимированные юниты и обновлённая боевая сетка!' },
    sprites: [
      { src: '/assets/character_sprites/e21.png',   alt: 'Templar' },
      { src: '/assets/character_sprites/gs312.png', alt: 'Crimson Mage' },
    ],
  },
  {
    date: '',
    title: { en: 'The first season',
             ru: 'Первый сезон' },
    desc:  { en: 'The crown broke in the war for Ilmenar, and its shards fell across the world. Every duel you win adds to your faction’s standing — when the season closes, the leading faction claims a shard and keeps it. Seasonal rewards and new daily errands.',
             ru: 'Корона раскололась в войне за Ильменар, и её осколки разлетелись по миру. Каждая ваша победа в дуэли добавляется к счёту фракции — когда сезон завершается, ведущая фракция забирает осколок себе. Сезонные награды и новые ежедневные поручения.' },
  },
  {
    date: '',
    title: { en: 'New faction!',
             ru: 'Новая фракция!' },
    desc:  { en: 'Something watches the conflict...',
             ru: 'Что-то наблюдает за конфликтом...' },
  },
];

let activeCleanup = null;

function animateSprite(el) {
  let i = 0;
  const tick = () => {
    const col = i % SPRITE_COLS;
    const row = Math.floor(i / SPRITE_COLS);
    el.style.backgroundPosition = `${col * 25}% ${row * 25}%`;
    i = (i + 1) % SPRITE_FRAMES;
  };
  tick();
  const id = setInterval(tick, FRAME_MS);
  return () => clearInterval(id);
}

function entryHtml(e, L) {
  const title = typeof e.title === 'object' ? (e.title[L] ?? e.title.en) : e.title;
  const desc  = typeof e.desc  === 'object' ? (e.desc[L]  ?? e.desc.en)  : (e.desc ?? '');
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
        <div class="timeline-title">${title}</div>
        ${desc ? `<div class="timeline-desc">${desc}</div>` : ''}
        ${spriteRow}
      </div>
    </div>`;
}

export function openTimeline(player) {
  closeTimeline();

  const L = lang(player);

  const overlay = document.createElement('div');
  overlay.className = 'timeline-overlay';
  overlay.innerHTML = `
    <div class="timeline-modal" role="dialog" aria-label="Roadmap">
      <div class="timeline-header">
        <span class="timeline-header-title">${L === 'ru' ? 'Что дальше' : "What's Next"}</span>
        <button class="timeline-close" aria-label="Close">✕</button>
      </div>
      <div class="timeline-list">
        ${TIMELINE.map(e => entryHtml(e, L)).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);

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