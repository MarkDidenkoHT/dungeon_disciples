import { api }      from '../main.js';
import { navigate } from '../main.js';

const REGIONS = [
  { id: 'life_grove',   label: 'Life Grove',   icon: '🟢', description: 'Ancient forests teeming with wardens and sacred beasts.',      type: 'pve' },
  { id: 'fire_wastes',  label: 'Fire Wastes',  icon: '🔴', description: 'Scorched badlands ruled by fire cults and molten elementals.', type: 'pve' },
  { id: 'death_crypts', label: 'Death Crypts', icon: '🟣', description: 'Sunken tombs crawling with undead and cursed wraiths.',        type: 'pve' },
  { id: 'frost_peaks',  label: 'Frost Peaks',  icon: '🔵', description: 'Frozen summits haunted by ice spirits and glacial beasts.',    type: 'pve' },
  { id: 'nature_wilds', label: 'Nature Wilds', icon: '🟡', description: 'Untamed wilderness thick with feral hunters and earth titans.', type: 'pve' },
  { id: 'pvp_arena',    label: 'PvP Arena',    icon: '🏆', description: 'Face other players. Win trophies, gold, and glory.',           type: 'pvp' },
];

export function renderEmbark(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-embark">
      <main class="embark-main">
        <div class="embark-header">
          <h2>Select Region</h2>
        </div>
        <div class="embark-regions-grid" id="embark-regions">
          <div style="color:var(--muted);text-align:center;padding:2rem">Checking active battles…</div>
        </div>
        <div class="embark-controls">
          <div class="embark-march-row">
            <button class="embark-march-btn" id="embark-march-btn" disabled>
              Select a region to march
            </button>
          </div>
        </div>
      </main>
    </div>
  `;

  let selectedRegion = null;

  function showReconnectBanner(battle_id, battle_data) {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:var(--card);border:1px solid var(--accent);border-radius:8px;padding:1rem;margin-bottom:1rem;text-align:center;';
    banner.innerHTML = `
      <div style="font-weight:bold;margin-bottom:.5rem">⚔ Active Battle Found</div>
      <div style="color:var(--muted);font-size:.85rem;margin-bottom:.75rem">You have an unfinished battle. Reconnect or abandon it.</div>
      <div style="display:flex;gap:.5rem;justify-content:center;">
        <button id="reconnect-btn" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:.5rem 1.2rem;cursor:pointer;font-size:.9rem">Reconnect</button>
        <button id="abandon-btn" style="background:transparent;color:var(--muted);border:1px solid var(--muted);border-radius:6px;padding:.5rem 1.2rem;cursor:pointer;font-size:.9rem">Abandon</button>
      </div>
    `;
    root.querySelector('#embark-regions').before(banner);

    banner.querySelector('#reconnect-btn').addEventListener('click', async () => {
      const region_id = battle_data.region_id;
      const level     = battle_data.level;
      if (!region_id) return;
      try {
        const { state } = await api(`/battle/state?battle_id=${encodeURIComponent(battle_id)}`);
        navigate('battle', { player, battle_id, reconnect: true, snapshot: state, region_id, level });
      } catch (err) {
        console.error('Failed to reconnect:', err);
      }
    });

    banner.querySelector('#abandon-btn').addEventListener('click', async () => {
      try {
        await api('/battle/end', { battle_id });
      } catch (_) {}
      banner.remove();
    });
  }

  async function loadRegions() {
    try {
      const [progress, activeCheck] = await Promise.all([
        api(`/progress?chat_id=${player.chat_id}`),
        api(`/battle/active?chat_id=${player.chat_id}`),
      ]);

      if (activeCheck.active) {
        showReconnectBanner(activeCheck.battle_id, activeCheck.battle_data);
      }

      root.querySelector('#embark-regions').innerHTML = REGIONS.map(r => {
        if (r.type === 'pvp') {
          return `
            <div class="embark-card embark-card--pvp">
              <span class="embark-card-icon">${r.icon}</span>
              <div class="embark-card-info">
                <span class="embark-card-label">${r.label}</span>
                <span class="embark-card-desc">${r.description}</span>
              </div>
              <span class="embark-card-badge embark-card-badge--soon">Soon</span>
            </div>
          `;
        }
        const level = progress[r.id] ?? 1;
        return `
          <div class="embark-card" data-id="${r.id}" data-level="${level}">
            <span class="embark-card-icon">${r.icon}</span>
            <div class="embark-card-info">
              <span class="embark-card-label">${r.label}</span>
              <span class="embark-card-desc">${r.description}</span>
            </div>
            <span class="embark-card-badge">Lv ${level}</span>
          </div>
        `;
      }).join('');

      root.querySelectorAll('.embark-card[data-id]').forEach(card => {
        card.addEventListener('click', () => {
          selectedRegion = card.dataset.id;
          const selectedLevel = parseInt(card.dataset.level) || 1;
          root.querySelectorAll('.embark-card[data-id]').forEach(c => c.classList.remove('embark-card--selected'));
          card.classList.add('embark-card--selected');
          const marchBtn = root.querySelector('#embark-march-btn');
          marchBtn.disabled = false;
          marchBtn.textContent = `March to ${card.querySelector('.embark-card-label').textContent} — Lv ${selectedLevel}`;
          marchBtn.onclick = () => navigate('battle-prep', { player, region_id: selectedRegion, level: selectedLevel });
        });
      });
    } catch (err) {
      console.error('Failed to load regions:', err);
    }
  }

  loadRegions();
}