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
        <div class="embark-regions-grid" id="embark-regions"></div>

        <div class="embark-controls">
          <div class="embark-march-row">
            <button class="embark-march-btn" id="embark-march-btn" disabled>
              Select a region to march
            </button>
          </div>

          <div class="embark-tab-content active" id="tab-units">
            <div class="embark-roster" id="embark-roster">
              <p class="placeholder">Loading roster...</p>
            </div>
          </div>
        </div>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn" data-screen="castle">Castle</button>
        <button class="nav-btn" data-screen="roster">Roster</button>
        <button class="nav-btn active" data-screen="embark">Embark</button>
        <button class="nav-btn" data-screen="spells">Spells</button>
      </nav>
    </div>
  `;

  let selectedRegion = null;
  let selectedUnits  = [];

  async function loadUnits() {
    try {
      const units = await api(`/roster?chat_id=${player.chat_id}`);

      if (!Array.isArray(units)) {
        root.querySelector('#embark-roster').innerHTML = '<p class="placeholder">No units available</p>';
        return;
      }

      let html = '<div class="embark-unit-list">';

      for (const unit of units) {
        const isSelected = selectedUnits.includes(unit.id);
        html += `
          <div class="embark-unit-item ${isSelected ? 'selected' : ''}" data-unit-id="${unit.id}">
            <div class="embark-unit-checkbox">
              <input type="checkbox" ${isSelected ? 'checked' : ''}>
            </div>
            <div class="embark-unit-info">
              <div class="embark-unit-name">${unit.unit_name}</div>
              <div class="embark-unit-level">XP ${unit.experience || 0}</div>
            </div>
          </div>
        `;
      }

      html += '</div>';
      root.querySelector('#embark-roster').innerHTML = html;

      root.querySelectorAll('.embark-unit-item').forEach(item => {
        item.addEventListener('click', () => {
          const unitId = item.dataset.unitId;
          const checkbox = item.querySelector('input[type="checkbox"]');

          if (selectedUnits.includes(unitId)) {
            selectedUnits = selectedUnits.filter(id => id !== unitId);
            checkbox.checked = false;
            item.classList.remove('selected');
          } else {
            selectedUnits.push(unitId);
            checkbox.checked = true;
            item.classList.add('selected');
          }
        });
      });
    } catch (err) {
      console.error('Failed to load units:', err);
      root.querySelector('#embark-roster').innerHTML = '<p class="placeholder">Error loading units</p>';
    }
  }

  async function loadRegions() {
    try {
      const progress = await api(`/progress?chat_id=${player.chat_id}`);

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

  async function init() {
    await Promise.all([
      loadRegions(),
      loadUnits(),
    ]);
  }

  init();

  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const screen = btn.dataset.screen;
      if (screen === 'embark') return;
      navigate(screen, { player });
    });
  });
}