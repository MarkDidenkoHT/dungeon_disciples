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
  const dots  = root.querySelector('#roster-dots');

  function buildCard(u) {
    const d      = u.unit_data || {};
    const gender = u.char_gender || 'f';
    const unitId = d.id || '';

    const portraitSrc = unitId ? `/assets/character_art/${unitId}.${gender}.png` : null;

    const passive = d.passive || 'None';
    const active  = d.ability || 'None';
    const res     = d.resistances || {};

    const xpRequired = d.xp ?? null;
    const currentXp  = u.experience ?? 0;
    const isHero     = (d.t == null);
    const isMaxTier  = (d.t >= 2);
    const canLevelUp = !isHero && !isMaxTier && xpRequired !== null && currentXp >= xpRequired;
    const hasPath    = !isHero && !isMaxTier && xpRequired !== null;

    let levelUpHtml = '';
    if (hasPath) {
      const xpLabel = canLevelUp
        ? `${currentXp} / ${xpRequired} XP`
        : `${currentXp} / ${xpRequired} XP`;
      levelUpHtml = `
        <div class="levelup-row">
          <div class="levelup-xp-bar">
            <div class="levelup-xp-fill" style="width: ${Math.min(100, Math.floor((currentXp / xpRequired) * 100))}%"></div>
          </div>
          <span class="levelup-xp-label">${xpLabel}</span>
          <button
            class="levelup-btn ${canLevelUp ? 'levelup-btn--ready' : 'levelup-btn--locked'}"
            data-roster-id="${u.id}"
            ${canLevelUp ? '' : 'disabled'}
          >Level Up</button>
        </div>
      `;
    }

    return `
      <div class="roster-slide">
        <div class="unit-card">
          ${portraitSrc ? `
          <div class="unit-portrait">
            <img src="${portraitSrc}" alt="${u.unit_name}" onerror="this.parentElement.style.display='none';">
          </div>` : ''}

          <div class="unit-info">
            <div class="unit-header">
              <span class="unit-name">${u.unit_name}${d.t ? ` <span class="tier-badge">★${d.t}</span>` : ''}</span>
              <span class="unit-xp">XP ${currentXp}</span>
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

            ${levelUpHtml}
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
    dots.innerHTML  = units.map((_, i) => `<span class="roster-dot" data-i="${i}"></span>`).join('');

    dots.querySelectorAll('.roster-dot').forEach(dot => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.i)));
    });

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

  track.addEventListener('click', async (e) => {
    const btn = e.target.closest('.levelup-btn--ready');
    if (!btn) return;

    const rosterId = btn.dataset.rosterId;
    btn.disabled = true;
    btn.textContent = '...';

    try {
      await api('/roster/levelup', {
        chat_id:   player.chat_id,
        roster_id: rosterId,
      });

      units = await api(`/roster?chat_id=${player.chat_id}`);
      const savedIdx = current;
      initSlider();
      goTo(savedIdx);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Level Up';
      alert(err.message || 'Level up failed');
    }
  });

  async function load() {
    units = await api(`/roster?chat_id=${player.chat_id}`);

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