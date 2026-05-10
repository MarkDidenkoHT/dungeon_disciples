import { api }        from '../utils/api.js';
import { setSession } from '../utils/session.js';
import { navigate }   from '../main.js';


const FACTIONS = [
  {
    id: 'dungeon',
    label: 'The Dungeon',
    description: 'Creatures of darkness, bound by ambition.',
  },
  {
    id: 'protectors',
    label: 'The Protectors',
    description: 'Defenders of the realm, forged in honor.',
  },
];

const HEROES = {
  dungeon: [
    { id: 'warlord',   label: 'Warlord',   description: 'Melee brute. High HP, high armor.' },
    { id: 'hexblade',  label: 'Hexblade',  description: 'Caster. Debuffs and dark magic.'   },
    { id: 'shadowbow', label: 'Shadowbow', description: 'Ranged. High initiative, evasion.'  },
  ],
  protectors: [
    { id: 'paladin',   label: 'Paladin',   description: 'Melee tank. Heals allies.'          },
    { id: 'inquisitor',label: 'Inquisitor',description: 'Caster. Purge and buffs.'           },
    { id: 'ranger',    label: 'Ranger',    description: 'Ranged. Fast, precise strikes.'      },
  ],
};

export function renderFaction(root, { player }) {
  let selectedFaction = null;
  let selectedHero    = null;

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

        <p id="faction-error" class="error hidden"></p>
      </div>
    `;

    root.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => {
        selectedFaction = FACTIONS.find(f => f.id === card.dataset.id);
        showHeroStep();
      });
    });
  }

  function showHeroStep() {
    const heroes = HEROES[selectedFaction.id];

    root.innerHTML = `
      <div class="screen screen-faction">
        <button id="back-btn">← Back</button>
        <h2>${selectedFaction.label}</h2>
        <p class="subtitle">Choose your hero</p>

        <div class="card-grid">
          ${heroes.map(h => `
            <div class="card" data-id="${h.id}">
              <h3>${h.label}</h3>
              <p>${h.description}</p>
            </div>
          `).join('')}
        </div>

        <p id="faction-error" class="error hidden"></p>
      </div>
    `;

    root.querySelector('#back-btn').addEventListener('click', showFactionStep);

    root.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => {
        selectedHero = heroes.find(h => h.id === card.dataset.id);
        confirmSelection();
      });
    });
  }

  async function confirmSelection() {
    const error = root.querySelector('#faction-error');

    try {
      const { player: updated } = await api('/player/faction', {
        player_id: player.id,
        faction:   selectedFaction.id,
        hero:      selectedHero.id,
      });

      setSession(updated);
      navigate('castle', { player: updated });
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  }
}