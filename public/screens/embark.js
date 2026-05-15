import { api }      from '../main.js';
import { navigate } from '../main.js';
import { SPELLS }   from '../../data/spells.js';

const REGIONS = [
  { id: 'life_grove',   label: 'Life Grove',   icon: '🟢', description: 'Ancient forests teeming with wardens and sacred beasts.',      type: 'pve' },
  { id: 'fire_wastes',  label: 'Fire Wastes',  icon: '🔴', description: 'Scorched badlands ruled by fire cults and molten elementals.', type: 'pve' },
  { id: 'death_crypts', label: 'Death Crypts', icon: '🟣', description: 'Sunken tombs crawling with undead and cursed wraiths.',        type: 'pve' },
  { id: 'frost_peaks',  label: 'Frost Peaks',  icon: '🔵', description: 'Frozen summits haunted by ice spirits and glacial beasts.',    type: 'pve' },
  { id: 'nature_wilds', label: 'Nature Wilds', icon: '🟡', description: 'Untamed wilderness thick with feral hunters and earth titans.', type: 'pve' },
  { id: 'pvp_arena',    label: 'PvP Arena',    icon: '🏆', description: 'Face other players. Win trophies, gold, and glory.',           type: 'pvp' },
];

const CRYSTAL_ICONS = {
  Crystals_Life:   '🟢',
  Crystals_Fire:   '🔴',
  Crystals_Death:  '🟣',
  Crystals_Frost:  '🔵',
  Crystals_Nature: '🟡',
};

export function renderEmbark(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-embark">
      <main class="embark-main">
        <div class="embark-header">
          <h2>Select Region</h2>
        </div>
        <div class="embark-regions-grid" id="embark-regions"></div>

        <div class="embark-controls">
          <div class="embark-tabs">
            <button class="embark-tab-btn active" data-tab="units">
              👥 Assign Units
            </button>
            <button class="embark-tab-btn" data-tab="spells">
              📖 Use Spells
            </button>
            <button class="embark-tab-btn disabled" data-tab="potions">
              🧪 Use Potions
            </button>
          </div>

          <div class="embark-tab-content active" id="tab-units">
            <div class="embark-roster" id="embark-roster">
              <p class="placeholder">Loading roster...</p>
            </div>
          </div>

          <div class="embark-tab-content" id="tab-spells">
            <div class="embark-spells-header">
              <div class="resource-display" id="resource-display">
                <span class="resource-item">
                  <span class="resource-icon">🔮</span>
                  <span class="resource-amount" id="mana-amount">0</span>
                </span>
              </div>
            </div>
            <div class="embark-spells-grid" id="embark-spells">
              <p class="placeholder">Loading spells...</p>
            </div>
          </div>

          <div class="embark-tab-content" id="tab-potions">
            <div class="potions-placeholder">
              <p>🧪 Potions feature coming soon...</p>
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
  let selectedUnits = [];
  let playerMana = 0;
  let playerCrystals = {};
  let learnedSpells = [];

  async function loadResources() {
    try {
      const playerData = await api(`/player?chat_id=${player.chat_id}`);
      playerMana = playerData.mana || 0;

      const inventory = await api(`/inventory?chat_id=${player.chat_id}&type=resource`);
      if (Array.isArray(inventory)) {
        for (const row of inventory) {
          if (row.item in CRYSTAL_ICONS) {
            playerCrystals[row.item] = row.amount;
          }
        }
      }

      const displayEl = root.querySelector('#resource-display');
      let html = `
        <span class="resource-item">
          <span class="resource-icon">🔮</span>
          <span class="resource-amount" id="mana-amount">${playerMana}</span>
        </span>
      `;
      for (const [type, icon] of Object.entries(CRYSTAL_ICONS)) {
        const amt = playerCrystals[type] || 0;
        html += `
          <span class="resource-item">
            <span class="resource-icon">${icon}</span>
            <span class="resource-amount">${amt}</span>
          </span>
        `;
      }
      displayEl.innerHTML = html;
    } catch (err) {
      console.error('Failed to load resources:', err);
      playerMana = 0;
      playerCrystals = {};
    }
  }

  async function loadLearnedSpells() {
    try {
      const response = await api(`/spells/research?chat_id=${player.chat_id}`);
      if (!response || typeof response !== 'object') return;
      learnedSpells = Array.isArray(response) ? response : (response.researched_spells || []);
    } catch (err) {
      console.error('Failed to load learned spells:', err);
      learnedSpells = [];
    }
  }

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

  function canAffordSpell(spell) {
    if (playerMana < spell.cost.mana) return false;
    const crystalMap = spell.cost.crystals || {};
    for (const [type, needed] of Object.entries(crystalMap)) {
      if ((playerCrystals[type] || 0) < needed) return false;
    }
    return true;
  }

  function renderCrystalCosts(crystalMap) {
    return Object.entries(crystalMap || {})
      .filter(([, amt]) => amt > 0)
      .map(([type, amt]) => `<span class="cost-item">${CRYSTAL_ICONS[type] || '💎'} ${amt}</span>`)
      .join('');
  }

  async function loadEmbarkSpells() {
    const factionSpells = SPELLS[player.faction] || [];
    const learned = factionSpells.filter(s => learnedSpells.includes(s.id));

    if (learned.length === 0) {
      root.querySelector('#embark-spells').innerHTML = '<p class="placeholder">No learned spells. Visit the Spell Tome to research spells.</p>';
      return;
    }

    let html = '<div class="embark-spells-list">';

    for (const spell of learned) {
      const affordable = canAffordSpell(spell);

      html += `
        <div class="embark-spell-card ${affordable ? '' : 'embark-spell-card--disabled'}" data-spell-id="${spell.id}">
          <div class="embark-spell-icon">${spell.icon}</div>
          <div class="embark-spell-info">
            <div class="embark-spell-name">${spell.name}</div>
            <div class="embark-spell-desc">${spell.description}</div>
            <div class="embark-spell-cost">
              <span class="cost-item">🔮 ${spell.cost.mana}</span>
              ${renderCrystalCosts(spell.cost.crystals)}
            </div>
          </div>
          <button class="embark-spell-btn ${!affordable ? 'disabled' : ''}" ${!affordable ? 'disabled' : ''}>
            Use
          </button>
        </div>
      `;
    }

    html += '</div>';
    root.querySelector('#embark-spells').innerHTML = html;

    root.querySelectorAll('.embark-spell-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const spellId = btn.closest('.embark-spell-card').dataset.spellId;
        const spell = factionSpells.find(s => s.id === spellId);
        if (spell && canAffordSpell(spell)) {
          await useSpell(spell);
        }
      });
    });
  }

  async function useSpell(spell) {
    try {
      const result = await api('/spells/consume', {
        chat_id: player.chat_id,
        spell_id: spell.id,
        mana_cost: spell.cost.mana,
        crystals_cost: spell.cost.crystals || {},
      });

      if (result.success) {
        playerMana -= spell.cost.mana;
        for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
          playerCrystals[type] = (playerCrystals[type] || 0) - amt;
        }

        root.querySelector('#mana-amount').textContent = playerMana;

        alert(`✨ ${spell.name} activated!`);
        await loadResources();
        await loadEmbarkSpells();
      } else {
        alert(result.message || 'Failed to use spell');
      }
    } catch (err) {
      console.error('Failed to use spell:', err);
      alert(err.message || 'Failed to use spell');
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
          root.querySelectorAll('.embark-card[data-id]').forEach(c => c.classList.remove('embark-card--selected'));
          card.classList.add('embark-card--selected');
        });
      });
    } catch (err) {
      console.error('Failed to load regions:', err);
    }
  }

  root.querySelectorAll('.embark-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;

      const tabName = btn.dataset.tab;

      root.querySelectorAll('.embark-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      root.querySelectorAll('.embark-tab-content').forEach(content => content.classList.remove('active'));
      root.querySelector(`#tab-${tabName}`).classList.add('active');
    });
  });

  async function init() {
    await Promise.all([
      loadResources(),
      loadLearnedSpells(),
      loadRegions(),
      loadUnits(),
    ]);

    await loadEmbarkSpells();
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