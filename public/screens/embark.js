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

export function renderEmbark(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-embark">
      <main class="embark-main">
        <!-- REGIONS GRID AT TOP -->
        <div class="embark-header">
          <h2>Select Region</h2>
        </div>
        <div class="embark-regions-grid" id="embark-regions"></div>

        <!-- TABS FOR CONTROLS -->
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

          <!-- TAB CONTENT: ASSIGN UNITS -->
          <div class="embark-tab-content active" id="tab-units">
            <div class="embark-roster" id="embark-roster">
              <p class="placeholder">Loading roster...</p>
            </div>
          </div>

          <!-- TAB CONTENT: USE SPELLS -->
          <div class="embark-tab-content" id="tab-spells">
            <div class="embark-spells-header">
              <div class="resource-display">
                <span class="resource-item">
                  <span class="resource-icon">🔮</span>
                  <span class="resource-amount" id="mana-amount">0</span>
                </span>
                <span class="resource-item">
                  <span class="resource-icon">💎</span>
                  <span class="resource-amount" id="crystals-amount">0</span>
                </span>
              </div>
            </div>
            <div class="embark-spells-grid" id="embark-spells">
              <p class="placeholder">Loading spells...</p>
            </div>
          </div>

          <!-- TAB CONTENT: USE POTIONS (PLACEHOLDER) -->
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
  let playerCrystals = 0;
  let learnedSpells = [];

  // Load resources
  async function loadResources() {
    try {
      const response = await api(`/inventory?chat_id=${player.chat_id}&type=resource`);
      
      if (!Array.isArray(response)) {
        console.error('Invalid inventory response:', response);
        return;
      }
      
      const mana = response.find(r => r.item === 'Mana') || { amount: 0 };
      const crystals = response.find(r => r.item === 'Crystals') || { amount: 0 };
      
      playerMana = mana.amount;
      playerCrystals = crystals.amount;
      
      root.querySelector('#mana-amount').textContent = playerMana;
      root.querySelector('#crystals-amount').textContent = playerCrystals;
    } catch (err) {
      console.error('Failed to load resources:', err);
      playerMana = 0;
      playerCrystals = 0;
    }
  }

  // Load learned spells
  async function loadLearnedSpells() {
    try {
      const response = await api(`/spells/research?chat_id=${player.chat_id}`);
      
      if (!response || typeof response !== 'object') {
        console.error('Invalid researched spells response:', response);
        return;
      }
      
      if (Array.isArray(response)) {
        learnedSpells = response;
      } else {
        learnedSpells = response.researched_spells || [];
      }
    } catch (err) {
      console.error('Failed to load learned spells:', err);
      learnedSpells = [];
    }
  }

  // Load units for assignment
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

      // Attach event listeners
      root.querySelectorAll('.embark-unit-item').forEach(item => {
        item.addEventListener('click', (e) => {
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

  // Load learned spells for embark
  async function loadEmbarkSpells() {
    const factionSpells = SPELLS[player.faction] || [];
    
    let html = '<div class="embark-spells-list">';
    
    for (const spell of factionSpells) {
      const isLearned = learnedSpells.includes(spell.id);
      const canAfford = playerMana >= spell.cost.mana && playerCrystals >= spell.cost.crystals;
      
      if (!isLearned) continue; // Only show learned spells
      
      html += `
        <div class="embark-spell-card ${canAfford ? '' : 'embark-spell-card--disabled'}" data-spell-id="${spell.id}">
          <div class="embark-spell-icon">${spell.icon}</div>
          <div class="embark-spell-info">
            <div class="embark-spell-name">${spell.name}</div>
            <div class="embark-spell-desc">${spell.description}</div>
            <div class="embark-spell-cost">
              <span class="cost-item">🔮 ${spell.cost.mana}</span>
              <span class="cost-item">💎 ${spell.cost.crystals}</span>
            </div>
          </div>
          <button class="embark-spell-btn ${!canAfford ? 'disabled' : ''}" ${!canAfford ? 'disabled' : ''}>
            Use
          </button>
        </div>
      `;
    }
    
    html += '</div>';
    root.querySelector('#embark-spells').innerHTML = html;

    // Attach spell usage listeners
    root.querySelectorAll('.embark-spell-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const spellId = btn.closest('.embark-spell-card').dataset.spellId;
        const spell = factionSpells.find(s => s.id === spellId);
        
        if (spell && playerMana >= spell.cost.mana && playerCrystals >= spell.cost.crystals) {
          await useSpell(spell);
        }
      });
    });

    if (factionSpells.filter(s => learnedSpells.includes(s.id)).length === 0) {
      root.querySelector('#embark-spells').innerHTML = '<p class="placeholder">No learned spells. Visit the Spell Tome to research spells.</p>';
    }
  }

  // Use spell (consume mana)
  async function useSpell(spell) {
    try {
      const result = await api('/spells/consume', {
        chat_id: player.chat_id,
        spell_id: spell.id,
        mana_cost: spell.cost.mana,
        crystals_cost: spell.cost.crystals
      });
      
      if (result.success) {
        playerMana -= spell.cost.mana;
        playerCrystals -= spell.cost.crystals;
        
        root.querySelector('#mana-amount').textContent = playerMana;
        root.querySelector('#crystals-amount').textContent = playerCrystals;
        
        alert(`✨ ${spell.name} activated!`);
        await loadEmbarkSpells();
      } else {
        alert(result.message || 'Failed to use spell');
      }
    } catch (err) {
      console.error('Failed to use spell:', err);
      alert(err.message || 'Failed to use spell');
    }
  }

  // Load regions
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
          
          // Highlight selected region
          root.querySelectorAll('.embark-card[data-id]').forEach(c => {
            c.classList.remove('embark-card--selected');
          });
          card.classList.add('embark-card--selected');
        });
      });
    } catch (err) {
      console.error('Failed to load regions:', err);
    }
  }

  // Tab switching
  root.querySelectorAll('.embark-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      
      const tabName = btn.dataset.tab;
      
      // Update active tab button
      root.querySelectorAll('.embark-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update active tab content
      root.querySelectorAll('.embark-tab-content').forEach(content => content.classList.remove('active'));
      root.querySelector(`#tab-${tabName}`).classList.add('active');
    });
  });

  // Initial load
  async function init() {
    await Promise.all([
      loadResources(),
      loadLearnedSpells(),
      loadRegions(),
      loadUnits()
    ]);
    
    await loadEmbarkSpells();
  }

  init();

  // Bottom nav
  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const screen = btn.dataset.screen;
      if (screen === 'embark') return;
      navigate(screen, { player });
    });
  });
}