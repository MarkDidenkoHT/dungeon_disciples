import { api }      from '../main.js';
import { navigate } from '../main.js';

const FACTIONS = [
  { id: 'empire',  label: 'The Empire',  description: 'Defenders of the realm, forged in honor.' },
  { id: 'choir_of_the_cursed', label: 'Choir of the Cursed', description: 'Creatures of darkness, bound by ambition.' },
];

export function renderRegister(root, { player } = {}) {
  if (!player) {
    root.innerHTML = `
      <div class="screen screen-faction">
        <h1>Dungeon Disciples</h1>
        <p class="subtitle">Open this app inside Telegram.</p>
      </div>
    `;
    return;
  }

  let selectedFaction = null;
  let heroes          = [];

  showFactionStep();

  function showFactionStep() {
    root.innerHTML = `
      <div class="screen screen-faction">
        <h2>Choose your faction</h2>
        <div class="card-grid">
          ${FACTIONS.map(f => `
            <div class="card" data-id="${f.id}">
              <h3>${f.label}</h3>
              <p>${f.description}</p>
            </div>
          `).join('')}
        </div>
        <p id="reg-error" class="error hidden"></p>
      </div>
    `;

    root.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', async () => {
        selectedFaction = FACTIONS.find(f => f.id === card.dataset.id);
        await loadAndShowHeroStep();
      });
    });
  }

  async function loadAndShowHeroStep() {
    root.innerHTML = `
      <div class="screen screen-faction">
        <p class="subtitle">Loading heroes…</p>
      </div>
    `;

    try {
      const all = await api('/heroes');
      const factionPrefix = selectedFaction.id === 'empire' ? 'h_e_' : 'h_d_';
      heroes = all.filter(h => h.id.startsWith(factionPrefix) && h.t === 1);
      showHeroStep();
    } catch (err) {
      root.innerHTML = `
        <div class="screen screen-faction">
          <button id="back-btn">← Back</button>
          <p class="error">${err.message}</p>
        </div>
      `;
      root.querySelector('#back-btn').addEventListener('click', showFactionStep);
    }
  }

  function showHeroStep() {
    root.innerHTML = `
      <div class="screen screen-faction">
        <button id="back-btn">← Back</button>
        <h2>${selectedFaction.label}</h2>
        <p class="subtitle">Choose your hero</p>
        <div class="card-grid">
          ${heroes.map(h => `
            <div class="card" data-id="${h.id}">
              <h3>${h.name ?? h.id}</h3>
              <p>${h.type} · HP ${h.hp} · Init ${h.initiative}</p>
              ${h.passive ? `<p class="card-passive">Passive: ${h.passive}</p>` : ''}
            </div>
          `).join('')}
        </div>
        <p id="reg-error" class="error hidden"></p>
      </div>
    `;

    root.querySelector('#back-btn').addEventListener('click', showFactionStep);

    root.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => {
        const hero = heroes.find(h => h.id === card.dataset.id);
        confirmSelection(hero);
      });
    });
  }

  async function confirmSelection(hero) {
    const error = root.querySelector('#reg-error');

    try {
      const { player: updated } = await api('/player/faction', {
        player_id: player.id,
        chat_id:   player.chat_id,
        faction:   selectedFaction.id,
        hero_id:   hero.id,
      });

      navigate('castle', { player: updated });
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  }
}