import { api }      from '../main.js';
import { navigate } from '../main.js';

const RESIST_LABELS = {
  resist_fire:      '🔥',
  resist_ice:       '❄️',
  resist_lightning: '⚡',
  resist_dark:      '🌑',
  resist_holy:      '✨',
};

const TARGET_LABELS = {
  single: 'Single',
  row:    'Row',
  column: 'Column',
  all:    'All',
};

function buildCard(u) {
  const d = u.unit_data || {};

  const passive = d.passive || d.passive_ability || 'None';
  const active = d.ability || d.active_ability || 'None';

  return `
    <div class="roster-slide">
      <div class="unit-card">
        <div class="unit-header">
          <span class="unit-name">${u.unit_name}</span>
          <span class="unit-xp">XP ${u.experience ?? 0}</span>
        </div>

        <div class="unit-core-stats">
          <span class="unit-stat"><em>HP</em> ${d.hp ?? '—'}</span>
          <span class="unit-stat"><em>Armor</em> ${d.armor ?? '—'}</span>
          <span class="unit-stat"><em>Initiative</em> ${d.initiative ?? '—'}</span>
        </div>

        <div class="unit-abilities">
          <div class="unit-ability">
            <span class="unit-ability-label">Passive</span>
            <span class="unit-ability-value">${passive}</span>
          </div>
          <div class="unit-ability">
            <span class="unit-ability-label">Active</span>
            <span class="unit-ability-value">${active}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderRoster(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-castle">
      <div class="res-bar roster-topbar">
        <span class="roster-faction">${player.faction}</span>
        <span class="roster-hero">${player.hero}</span>
        <span class="roster-counter" id="roster-counter"></span>
      </div>

      <main class="castle-main roster-main">
        <div class="roster-slider-wrap">
          <div class="roster-track" id="roster-track">
            <p class="placeholder">Loading…</p>
          </div>
          <div class="roster-dots" id="roster-dots"></div>
        </div>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn" data-screen="castle">Castle</button>
        <button class="nav-btn active" data-screen="roster">Roster</button>
        <button class="nav-btn" data-screen="embark">Embark</button>   <!-- removed disabled -->
        <button class="nav-btn disabled" data-screen="pvp">PvP</button>
      </nav>
    </div>
  `;

  let current = 0;
  let units   = [];

  const track = root.querySelector('#roster-track');
  const dots  = root.querySelector('#roster-dots');
  const counter = root.querySelector('#roster-counter');

  function goTo(idx) {
    current = Math.max(0, Math.min(idx, units.length - 1));
    track.style.transform = `translateX(-${current * 100}%)`;
    counter.textContent = `${current + 1} / ${units.length}`;
    dots.querySelectorAll('.roster-dot').forEach((d, i) => {
      d.classList.toggle('roster-dot--active', i === current);
    });
  }

  function initSlider() {
    track.innerHTML = units.map(u => buildCard(u)).join('');
    dots.innerHTML  = units.map((_, i) => `<span class="roster-dot" data-i="${i}"></span>`).join('');

    dots.querySelectorAll('.roster-dot').forEach(dot => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.i)));
    });

    let touchStartX = 0;
    let touchStartY = 0;
    let dragging = false;

    track.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      dragging = true;
    }, { passive: true });

    track.addEventListener('touchend', e => {
      if (!dragging) return;
      dragging = false;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < Math.abs(dy) || Math.abs(dx) < 40) return;
      if (dx < 0) goTo(current + 1);
      else        goTo(current - 1);
    }, { passive: true });

    goTo(0);
  }

  async function load() {
    units = await api(`/roster?chat_id=${player.chat_id}`);

    if (!units.length) {
      track.innerHTML = `<div class="roster-slide"><p class="placeholder">No units yet.</p></div>`;
      counter.textContent = '0 / 0';
      return;
    }

    initSlider();
  }

  load();

  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const screen = btn.dataset.screen;
      if (screen === 'roster') return;
      navigate(screen, { player });
    });
  });
}