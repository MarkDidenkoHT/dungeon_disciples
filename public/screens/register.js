import { api }      from '../api.js';
import { navigate } from '../api.js';
import { UNITS }    from '../../data/units.js';
import { preloadAssets } from '../utils.js';

const UNIT_ART = new Set([
  'e1', 'e21', 'e3', 'e4', 'e6',  
  'd11', 'd41', 'd6', 'd31', 'd7',
  'gs12', 'gs311', 'gs6',
]);

function tierOneHighlights(factionKey) {
  return Object.values(UNITS[factionKey] ?? {})
    .filter(u => u.t === 1 && UNIT_ART.has(u.id))
    .map(u => ({ id: u.id, name: u.name }));
}

const FACTIONS = [
  {
    id: 'empire',
    label: 'The Empire',
    tagline: 'Defenders of the realm, forged in honor.',
    description: 'Disciplined knights, holy casters, and battlefield engineers stand together behind shield and oath. The Empire rewards a steady front line and righteous retribution.',
    bg: '/assets/screens/empire.jpg',
    highlights: tierOneHighlights('empire'),
  },
  {
    id: 'choir_of_the_cursed',
    label: 'Choir of the Cursed',
    tagline: 'Creatures of darkness, bound by ambition.',
    description: 'Demons, puppets, and courtly schemers serve a hierarchy built on hunger and dread. The Choir thrives on frenzy, sacrifice, and turning enemy strength against itself.',
    bg: '/assets/screens/choir.jpg',
    highlights: tierOneHighlights('choir_of_the_cursed'),
  },
  {
    id: 'grail_of_sorrow',
    label: 'Grail of Sorrow',
    tagline: 'The undying faithful, bound to the sacred grail.',
    description: 'The risen dead, siege constructs, and grieving spirits march for a relic that promises resurrection without end. The Grail wears down its foes through attrition and undeath.',
    bg: '/assets/screens/grail.jpg',
    highlights: tierOneHighlights('grail_of_sorrow'),
  },
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
  let activeIndex      = 0;

  showFactionStep();

  function showFactionStep() {
    root.innerHTML = `
      <div class="screen screen-faction-slider">
        <div class="faction-slider" id="faction-slider">
          ${FACTIONS.map(f => `
            <div class="faction-slide" data-id="${f.id}" style="background-image: linear-gradient(180deg, rgba(10,10,14,0.15) 0%, rgba(10,10,14,0.55) 55%, rgba(10,10,14,0.95) 100%), url('${f.bg}')">
              <div class="faction-slide-content">
                <div class="faction-slide-title">${f.label}</div>
                <div class="faction-slide-tagline">${f.tagline}</div>
                <div class="faction-slide-desc">${f.description}</div>
                <div class="faction-slide-roster">
                  ${f.highlights.map(h => `
                    <div class="faction-roster-chip">
                      <img src="/assets/character_art/${h.id}.png" alt="${h.name}" onerror="this.style.display='none'">
                      <span>${h.name}</span>
                    </div>
                  `).join('')}
                </div>
                <button class="faction-choose-btn" data-id="${f.id}">Choose ${f.label}</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="faction-slider-dots" id="faction-slider-dots">
          ${FACTIONS.map((f, i) => `<span class="faction-dot ${i === 0 ? 'faction-dot--active' : ''}" data-index="${i}"></span>`).join('')}
        </div>
      </div>
    `;

    const slider = root.querySelector('#faction-slider');
    const dots   = [...root.querySelectorAll('.faction-dot')];

    slider.addEventListener('scroll', () => {
      const idx = Math.round(slider.scrollLeft / slider.clientWidth);
      if (idx === activeIndex) return;
      activeIndex = idx;
      dots.forEach((d, i) => d.classList.toggle('faction-dot--active', i === idx));
    }, { passive: true });

    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const idx = Number(dot.dataset.index);
        slider.scrollTo({ left: idx * slider.clientWidth, behavior: 'smooth' });
      });
    });

    root.querySelectorAll('.faction-choose-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        selectedFaction = FACTIONS.find(f => f.id === btn.dataset.id);
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
      const prefixMap = { empire: 'h_e_', choir_of_the_cursed: 'h_d_', grail_of_sorrow: 'h_g_' };
      const factionPrefix = prefixMap[selectedFaction.id] ?? 'h_e_';
      heroes = all.filter(h => h.id.startsWith(factionPrefix) && h.t === 1);
      await preloadAssets(heroes.map(h => `/assets/character_art/${h.id}.png`));
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
            <div class="card card--hero" data-id="${h.id}">
              <img class="card-hero-art" src="/assets/character_art/${h.id}.png" alt="${h.name ?? h.id}" onerror="this.style.display='none'">
              <div class="card-hero-body">
                <h3>${h.name ?? h.id}</h3>
                <p>HP ${h.hp} · Armor ${h.armor} · Init ${h.initiative}</p>
                ${h.passive ? `<p class="card-passive">Passive: ${(Array.isArray(h.passive) ? h.passive : [h.passive]).join(', ')}</p>` : ''}
              </div>
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