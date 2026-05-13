import { api }      from '../main.js';
import { navigate } from '../main.js';

export function renderRoster(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-roster">
      <main class="roster-main">
        <div class="roster-slider-wrap">
          <div class="roster-track" id="roster-track"></div>
          <div class="roster-dots" id="roster-dots"></div>
        </div>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn" data-screen="castle">Castle</button>
        <button class="nav-btn active" data-screen="roster">Roster</button>
        <button class="nav-btn" data-screen="embark">Embark</button>
        <button class="nav-btn disabled" data-screen="pvp">PvP</button>
      </nav>
    </div>
  `;

  let current = 0;
  let units = [];

  const track = root.querySelector('#roster-track');
  const dots = root.querySelector('#roster-dots');

  function buildCard(u) {
    const d = u.unit_data || {};
    const gender = u.char_gender || 'f';
    const unitId = d.id || '';

    const portraitSrc = unitId ? `/assets/character_art/${unitId}.${gender}.png` : null;

    const passive = d.passive || d.passive_ability || 'None';
    const active = d.ability || d.active_ability || 'None';

    const res = d.resistances || {};

    return `
      <div class="roster-slide">
        <div class="unit-card">
          ${portraitSrc ? `
          <div class="unit-portrait">
            <img src="${portraitSrc}" alt="${u.unit_name}" onerror="this.parentElement.style.display='none';">
          </div>` : ''}
          
          <div class="unit-info">
            <div class="unit-header">
              <span class="unit-name">${u.unit_name}</span>
              <span class="unit-xp">XP ${u.experience ?? 0}</span>
            </div>

            <div class="unit-core-stats">
              <div><strong>HP</strong> ${d.hp ?? '—'}</div>
              <div><strong>Armor</strong> ${d.armor ?? '—'}</div>
              <div><strong>Initiative</strong> ${d.initiative ?? '—'}</div>
            </div>

            <div class="unit-resists">
              <span>🌬️ ${res.air ?? 0}</span>
              <span>🔥 ${res.fire ?? 0}</span>
              <span>🌿 ${res.nature ?? 0}</span>
              <span>❄️ ${res.cold ?? 0}</span>
              <span>✨ ${res.life ?? 0}</span>
              <span>🌑 ${res.death ?? 0}</span>
            </div>

            <div class="unit-abilities">
              <div class="ability-row">
                <span class="ability-label">PASSIVE</span>
                <span class="ability-value">${passive}</span>
              </div>
              <div class="ability-row">
                <span class="ability-label">ACTIVE</span>
                <span class="ability-value">${active}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function goTo(idx) {
    current = Math.max(0, Math.min(idx, units.length - 1));
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.querySelectorAll('.roster-dot').forEach((d, i) => {
      d.classList.toggle('roster-dot--active', i === current);
    });
  }

  function initSlider() {
    track.innerHTML = units.map(u => buildCard(u)).join('');
    dots.innerHTML = units.map((_, i) => `<span class="roster-dot" data-i="${i}"></span>`).join('');

    dots.querySelectorAll('.roster-dot').forEach(dot => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.i)));
    });

    // Touch swipe support
    let touchStartX = 0;
    track.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    track.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 40) return;
      if (dx < 0) goTo(current + 1);
      else goTo(current - 1);
    }, { passive: true });

    goTo(0);
  }

  async function load() {
    units = await api(`/roster?chat_id=${player.chat_id}`);

    if (!units.length) {
      track.innerHTML = `<div class="roster-slide"><p class="placeholder">No units yet.</p></div>`;
      return;
    }

    initSlider();
  }

  load();

  // Navigation
  root.querySelectorAll('.nav-btn').forEach(btn => {import { api, navigate } from '../main.js';

export function renderRoster(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-roster">
      <main class="roster-main">
        <div class="roster-slider-wrap">
          <div class="roster-track" id="roster-track"></div>
          <div class="roster-dots" id="roster-dots"></div>
        </div>
      </main>
      <nav class="bottom-nav">
        <button class="nav-btn" data-screen="castle">Castle</button>
        <button class="nav-btn active" data-screen="roster">Roster</button>
        <button class="nav-btn" data-screen="embark">Embark</button>
        <button class="nav-btn disabled" data-screen="pvp">PvP</button>
      </nav>
    </div>
  `;

  let current = 0;
  let units = [];
  let upgradePaths = {};

  const track = root.querySelector('#roster-track');
  const dots = root.querySelector('#roster-dots');

  function buildCard(u) {
    const d = u.unit_data || {};
    const gender = u.char_gender || 'f';
    const unitId = d.id || '';
    const portraitSrc = unitId ? `/assets/character_art/${unitId}.${gender}.png` : null;
    const currentTier = d.t || 1;
    let upgradeHtml = '';
    if (currentTier < 2 && !u.unit_name.toLowerCase().includes('hero')) {
      const faction = d.f === 'e' ? 'empire' : 'dungeon';
      const paths = upgradePaths[faction] || {};
      let options = [];
      for (const [base, targets] of Object.entries(paths)) {
        if (u.unit_name.toLowerCase().includes(base)) {
          options = Object.keys(targets);
          break;
        }
      }
      if (options.length) {
        upgradeHtml = `<div class="upgrade-section"><div class="upgrade-label">UPGRADE</div><div class="upgrade-options">${options.map(t => `<button class="upgrade-btn" data-unit-id="${u.id}" data-target="${t}">→ ${t.charAt(0).toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>`;
      }
    }
    return `
      <div class="roster-slide">
        <div class="unit-card">
          ${portraitSrc ? `<div class="unit-portrait"><img src="${portraitSrc}" alt="${u.unit_name}"></div>` : ''}
          <div class="unit-info">
            <div class="unit-header">
              <span class="unit-name">${u.unit_name} <span class="tier-badge">★${currentTier}</span></span>
              <span class="unit-xp">XP ${u.experience || 0}</span>
            </div>
            <div class="unit-core-stats">
              <div><strong>HP</strong> ${d.hp ?? '—'}</div>
              <div><strong>Armor</strong> ${d.armor ?? '—'}</div>
              <div><strong>Initiative</strong> ${d.initiative ?? '—'}</div>
            </div>
            <div class="unit-resists">
              <span>🌬️ ${d.resistances?.air ?? 0}</span>
              <span>🔥 ${d.resistances?.fire ?? 0}</span>
              <span>🌿 ${d.resistances?.nature ?? 0}</span>
              <span>❄️ ${d.resistances?.cold ?? 0}</span>
              <span>✨ ${d.resistances?.life ?? 0}</span>
              <span>🌑 ${d.resistances?.death ?? 0}</span>
            </div>
            ${upgradeHtml}
          </div>
        </div>
      </div>
    `;
  }

  function goTo(idx) {
    current = Math.max(0, Math.min(idx, units.length - 1));
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.querySelectorAll('.roster-dot').forEach((d, i) => d.classList.toggle('roster-dot--active', i === current));
  }

  function initSlider() {
    track.innerHTML = units.map(u => buildCard(u)).join('');
    dots.innerHTML = units.map((_, i) => `<span class="roster-dot" data-i="${i}"></span>`).join('');
    dots.querySelectorAll('.roster-dot').forEach(dot => dot.addEventListener('click', () => goTo(Number(dot.dataset.i))));
    goTo(0);
  }

  track.addEventListener('click', async (e) => {
    const btn = e.target.closest('.upgrade-btn');
    if (!btn) return;
    const unitId = btn.dataset.unitId;
    const targetTier = btn.dataset.target;
    if (!confirm(`Upgrade to ${targetTier}?`)) return;
    try {
      await api('/roster/upgrade', { chat_id: player.chat_id, unit_id: unitId, target_tier: targetTier });
      units = await api(`/roster?chat_id=${player.chat_id}`);
      initSlider();
    } catch (err) {
      alert(err.message || 'Upgrade failed');
    }
  });

  async function load() {
    const [rosterData, buildingsData] = await Promise.all([
      api(`/roster?chat_id=${player.chat_id}`),
      api('/buildings')
    ]);
    units = rosterData;
    upgradePaths = buildingsData.upgrade_paths || {};
    if (!units.length) {
      track.innerHTML = `<div class="roster-slide"><p class="placeholder">No units yet.</p></div>`;
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
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const screen = btn.dataset.screen;
      if (screen === 'roster') return;
      navigate(screen, { player });
    });
  });
}