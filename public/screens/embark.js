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
      <div class="embark-header">
        <button class="back-btn" id="back-btn">←</button>
        <span class="embark-title">Embark</span>
      </div>
      <div class="embark-regions" id="embark-regions">
        <p class="placeholder">Loading…</p>
      </div>
    </div>
  `;

  root.querySelector('#back-btn').addEventListener('click', () => navigate('castle', { player }));

  async function load() {
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
        navigate('battle-prep', {
          player,
          region_id: card.dataset.id,
          level:     Number(card.dataset.level),
        });
      });
    });
  }

  load();
}