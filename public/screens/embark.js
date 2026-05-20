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
          <div class="embark-loading">Checking battle status…</div>
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

  function renderActiveBattle(battle) {
    const bd = battle.battle_data || {};
    const regionId = bd.region_id || '—';
    const level    = bd.level ?? '—';
    const regionMeta = REGIONS.find(r => r.id === regionId);
    const label  = regionMeta ? regionMeta.label : regionId;
    const icon   = regionMeta ? regionMeta.icon  : '⚔';

    root.querySelector('#embark-regions').innerHTML = `
      <div class="embark-active-battle">
        <div class="embark-active-battle-title">Active Battle</div>
        <div class="embark-active-battle-info">
          <span class="embark-active-battle-region">${icon} ${label} — Lv ${level}</span>
        </div>
        <button class="embark-resume-btn" id="embark-resume-btn">Resume Battle</button>
        <button class="embark-abandon-btn" id="embark-abandon-btn">Abandon &amp; Start New</button>
      </div>
    `;

    root.querySelector('#embark-march-btn').style.display = 'none';

    root.querySelector('#embark-resume-btn').addEventListener('click', () => {
      const playerUnits = Object.values(bd.characters || {})
        .filter(c => c.side === 'player')
        .map(c => ({
          id: c.id,
          unit_name: c.unit_name,
          unit_data: c.unit_data || {},
        }));

      const enemies = Object.values(bd.characters || {})
        .filter(c => c.side === 'enemy')
        .map(c => ({ ...c.unit_data, name: c.unit_name, cell: c.cell }));

      navigate('battle', {
        player,
        region_id: bd.region_id,
        level: bd.level,
        playerUnits,
        enemies,
        placement: bd.placement || {},
        selectedSpells: bd.selected_spells || [],
        resumeBattleId: battle.battle_id,
      });
    });

    root.querySelector('#embark-abandon-btn').addEventListener('click', async () => {
      try {
        await api('/battle/end', { chat_id: player.chat_id, battle_id: battle.battle_id });
      } catch {}
      loadRegions();
    });
  }

  async function loadRegions() {
    try {
      const [progress, activeBattle] = await Promise.all([
        api(`/progress?chat_id=${player.chat_id}`),
        api(`/battle/active?chat_id=${player.chat_id}`),
      ]);

      if (activeBattle) {
        renderActiveBattle(activeBattle);
        return;
      }

      root.querySelector('#embark-march-btn').style.display = '';

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