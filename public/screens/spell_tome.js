import { api } from '../main.js';
import { navigate } from '../main.js';
import { SPELLS } from '../../data/spells.js';

export function renderSpellTome(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-spelltome">
      <main class="spelltome-main">
        <div class="spelltome-header">
          <div class="res-mana-top" id="res-mana"></div>
          <h1 class="spelltome-title">📖 Spell Tome</h1>
          <div class="spelltome-faction">${player.faction.toUpperCase()} Spells</div>
        </div>
        
        <div class="spelltome-content">
          <div class="spells-container" id="spells-container"></div>
        </div>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn" data-screen="castle">Castle</button>
        <button class="nav-btn" data-screen="roster">Roster</button>
        <button class="nav-btn" data-screen="embark">Embark</button>
        <button class="nav-btn active" data-screen="spells">Spells</button>
      </nav>
    </div>

    <div id="modal-overlay" class="modal-overlay hidden">
      <div class="modal modal-spell">
        <div class="modal-header">
          <span id="modal-title"></span>
          <button id="modal-close">✕</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
      </div>
    </div>
  `;

  let playerMana = 0;

  function openModal(title, bodyHtml) {
    root.querySelector('#modal-title').textContent = title;
    root.querySelector('#modal-body').innerHTML = bodyHtml;
    root.querySelector('#modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    root.querySelector('#modal-overlay').classList.add('hidden');
  }

  root.querySelector('#modal-close').addEventListener('click', closeModal);
  root.querySelector('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === root.querySelector('#modal-overlay')) closeModal();
  });

  async function loadResources() {
    try {
      const response = await api(`/inventory?chat_id=${player.chat_id}&type=resource`);
      
      // Validate response is an array (JSON, not HTML)
      if (!Array.isArray(response)) {
        console.error('Invalid inventory response:', response);
        playerMana = 0;
        return;
      }
      
      const mana = response.find(r => r.item === 'Mana') || { amount: 0 };
      playerMana = mana.amount;
      
      root.querySelector('#res-mana').innerHTML = `
        <div class="res-item">
          <span class="res-icon">🔮</span>
          <span class="res-amount">${playerMana}</span>
        </div>
      `;
    } catch (err) {
      console.error('Failed to load resources:', err);
      playerMana = 0;
    }
  }

  async function getResearchedSpells() {
    try {
      const response = await api(`/spells/research?chat_id=${player.chat_id}`);
      
      // Validate response is an object with researched_spells array
      if (!response || typeof response !== 'object') {
        console.error('Invalid researched spells response:', response);
        return [];
      }
      
      // Handle different response formats
      if (Array.isArray(response)) {
        return response;
      }
      
      return response.researched_spells || [];
    } catch (err) {
      console.error('Failed to load researched spells:', err);
      return [];
    }
  }

  async function researchSpell(spell) {
    try {
      const result = await api('/spells/research', {
        chat_id: player.chat_id,
        spell_id: spell.id,
        faction: player.faction
      });
      
      // Validate response is an object
      if (!result || typeof result !== 'object') {
        alert('Invalid server response. Please try again.');
        return;
      }
      
      if (result.success) {
        playerMana -= spell.cost.mana;
        await loadResources();
        await loadSpells();
        
        openModal('Spell Researched!', `
          <div class="spell-research-success">
            <div class="success-icon">✨</div>
            <h3>${spell.name} has been added to your spellbook!</h3>
            <div class="spell-learned-desc">${spell.description}</div>
            <button class="close-success-btn">Close</button>
          </div>
        `);
        
        root.querySelector('.close-success-btn')?.addEventListener('click', closeModal);
      } else {
        alert(result.message || 'Failed to research spell');
      }
    } catch (err) {
      console.error('Research failed:', err);
      alert(err.message || 'Failed to research spell');
    }
  }

  function showSpellDetails(spell, isResearched) {
    let bodyHtml = `
      <div class="spell-detail-modal">
        <div class="spell-detail-icon">${spell.icon}</div>
        <div class="spell-detail-name">${spell.name}</div>
        <div class="spell-detail-rank">Rank ${spell.rank} Spell</div>
        <div class="spell-detail-desc">${spell.description}</div>
        <div class="spell-detail-cost">
          <strong>Cost:</strong> 
          <span class="cost-item">🔮 ${spell.cost.mana} Mana</span>
          <span class="cost-item">💎 ${spell.cost.crystals} Crystals</span>
        </div>
    `;
    
    if (spell.params) {
      bodyHtml += `<div class="spell-detail-params"><strong>Effects:</strong><br>`;
      if (spell.params.damage) bodyHtml += `• Damage: ${spell.params.damage} ${spell.params.damage_type || ''}<br>`;
      if (spell.params.heal) bodyHtml += `• Healing: ${spell.params.heal}<br>`;
      if (spell.params.absorb) bodyHtml += `• Shield: ${spell.params.absorb} damage for ${spell.params.duration || 1} turns<br>`;
      if (spell.params.splash) bodyHtml += `• Hits all enemies<br>`;
      if (spell.params.status) bodyHtml += `• Applies: ${spell.params.status}<br>`;
      bodyHtml += `</div>`;
    }
    
    bodyHtml += `
        <div class="spell-detail-status">
          <strong>Status:</strong> ${isResearched ? '<span class="status-researched">✓ Researched</span>' : '<span class="status-locked">🔒 Not Researched</span>'}
        </div>
        <button class="spell-detail-close">Close</button>
      </div>
    `;
    
    openModal(spell.name, bodyHtml);
    
    root.querySelector('.spell-detail-close')?.addEventListener('click', closeModal);
  }

  async function loadSpells() {
    const factionSpells = SPELLS[player.faction] || [];
    const researchedSpells = await getResearchedSpells();
    
    let html = `
      <div class="spells-header">
        <p class="spells-subtitle">Powerful abilities unlocked through research</p>
      </div>
      <div class="spells-grid">
    `;
    
    for (const spell of factionSpells) {
      const isResearched = researchedSpells.includes(spell.id);
      const canAfford = playerMana >= spell.cost.mana;
      
      html += `
        <div class="spell-card ${isResearched ? 'spell-card--researched' : 'spell-card--locked'}" data-spell-id="${spell.id}">
          <div class="spell-icon">${spell.icon}</div>
          <div class="spell-info">
            <div class="spell-name">
              ${spell.name} 
              <span class="spell-rank">R${spell.rank}</span>
              ${isResearched ? '<span class="spell-badge">✓ Researched</span>' : ''}
            </div>
            <div class="spell-desc">${spell.description}</div>
            <div class="spell-cost">
              <span class="mana-icon">🔮</span> ${spell.cost.mana} Mana
              <span class="crystals-icon">💎</span> ${spell.cost.crystals} Crystals
              ${!isResearched ? `<button class="research-btn ${!canAfford ? 'research-btn--disabled' : ''}" data-spell-id="${spell.id}" ${!canAfford ? 'disabled' : ''}>Research</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }
    
    html += `
      </div>
      ${factionSpells.length === 0 ? `
        <div class="empty-spells">
          <p>No spells available yet for this faction.</p>
        </div>
      ` : ''}
    `;
    
    root.querySelector('#spells-container').innerHTML = html;
    
    root.querySelectorAll('.research-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const spellId = btn.dataset.spellId;
        const spell = factionSpells.find(s => s.id === spellId);
        if (spell && playerMana >= spell.cost.mana) {
          researchSpell(spell);
        } else {
          alert('Not enough mana to research this spell!');
        }
      });
    });
    
    root.querySelectorAll('.spell-card').forEach(card => {
      card.addEventListener('click', () => {
        const spellId = card.dataset.spellId;
        const spell = factionSpells.find(s => s.id === spellId);
        if (spell) {
          showSpellDetails(spell, researchedSpells.includes(spell.id));
        }
      });
    });
  }

  async function init() {
    await loadResources();
    await loadSpells();
  }

  init();

  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      
      const screen = btn.dataset.screen;
      
      if (screen === 'spells') {
        return;
      } else {
        navigate(screen, { player });
      }
    });
  });
}