import { UNITS }          from '../data/units.js';
import { UNIT_ABILITIES } from '../data/unit_abilities.js';

export const RESIST_ICONS = {
  air:    { icon: '🌬️', label: 'Air'    },
  fire:   { icon: '🔥', label: 'Fire'   },
  nature: { icon: '🌿', label: 'Nature' },
  cold:   { icon: '❄️', label: 'Cold'   },
  life:   { icon: '✨', label: 'Life'   },
  death:  { icon: '🌑', label: 'Death'  },
};

export const RESIST_ORDER = ['air', 'fire', 'nature', 'cold', 'life', 'death'];

export const CRYSTAL_ICONS = {
  Crystals_Life:   '<img src="/assets/icons/recources/life.png"   class="res-icon-img" alt="Life">',
  Crystals_Fire:   '<img src="/assets/icons/recources/fire.png"   class="res-icon-img" alt="Fire">',
  Crystals_Death:  '<img src="/assets/icons/recources/death.png"  class="res-icon-img" alt="Death">',
  Crystals_Frost:  '<img src="/assets/icons/recources/cold.png"   class="res-icon-img" alt="Frost">',
  Crystals_Nature: '<img src="/assets/icons/recources/nature.png" class="res-icon-img" alt="Nature">',
  Crystals_Air:    '<span class="res-icon-emoji" title="Air">🌬️</span>',
};

export const GOLD_ICON = '<img src="/assets/icons/recources/gold.png" class="res-icon-img" alt="Gold">';

export const SCREEN_BACKGROUNDS = {
  roster: {
    empire:              '/assets/screens/empire.jpg',
    choir_of_the_cursed: '/assets/screens/choir.jpg',
    grail_of_sorrow:     '/assets/screens/grail.jpg',
  },
  embark: {
    empire:              '/assets/screens/empire.jpg',
    choir_of_the_cursed: '/assets/screens/choir.jpg',
    grail_of_sorrow:     '/assets/screens/grail.jpg',
  },
  spells: {
    empire:              '/assets/screens/empire.jpg',
    choir_of_the_cursed: '/assets/screens/choir.jpg',
    grail_of_sorrow:     '/assets/screens/grail.jpg',
  },
};

export function applyBackground(root, faction, screen) {
  const url = SCREEN_BACKGROUNDS[screen]?.[faction];
  if (!url) return;
  root.style.backgroundImage    = `url('${url}')`;
  root.style.backgroundSize     = 'cover';
  root.style.backgroundPosition = 'center';
  root.style.backgroundRepeat   = 'no-repeat';
}

export function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

export function dmgReduction(val) {
  return Math.abs(val);
}

export function resolveUnitDef(unit) {
  const uid = unit.unit_data?.unit_id ?? unit.unit_data?.id;
  if (!uid) return null;
  for (const factionPool of Object.values(UNITS)) {
    if (typeof factionPool !== 'object' || Array.isArray(factionPool)) continue;
    for (const entry of Object.values(factionPool)) {
      if (entry?.id === uid) return entry;
      if (typeof entry === 'object' && !entry.id) {
        const nested = Object.values(entry).find(u => u?.id === uid);
        if (nested) return nested;
      }
    }
  }
  return null;
}

export function resolveAbility(key) {
  if (!key || key === 'None') return null;
  return UNIT_ABILITIES[key]
    || UNIT_ABILITIES[key.replace(/\s+/g, '_')]
    || UNIT_ABILITIES[key.replace(/_/g, ' ')]
    || null;
}

export function buildStatDescription(def, type) {
  const parts = [];
  if (def.description) parts.push(def.description);
  if (type === 'passive' && def.stats) {
    const statLines = Object.entries(def.stats).map(([stat, val]) => {
      const sign = val >= 0 ? '+' : '';
      if (stat === 'hp')              return `${sign}${val} HP`;
      if (stat === 'hp_regen')        return `${sign}${val} HP regen/turn`;
      if (stat === 'initiative')      return `${sign}${val} Initiative`;
      if (stat === 'armor')           return `${sign}${val} Armor`;
      if (stat === 'armor_reduction') return `${val} Armor reduction`;
      if (stat.includes('resist')) {
        const resistType = stat.replace('_resist', '');
        return `${sign}${val} ${cap(resistType)} resist`;
      }
      return `${sign}${val} ${cap(stat)}`;
    });
    if (statLines.length) parts.push(statLines.join(', '));
  }
  return parts.join('\n\n');
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

export function renderModalContent(text) {
  return `<div style="white-space:pre-wrap;line-height:1.5;">${escapeHtml(text)}</div>`;
}

export function mountModal(root) {
  const overlay    = root.querySelector('.modal-overlay');
  const modalBody  = root.querySelector('#modal-body');
  const modalTitle = root.querySelector('#modal-title');
  if (!overlay) return null;

  function open(title, bodyHtml) {
    modalTitle.textContent = title;
    modalBody.innerHTML    = bodyHtml;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  root.querySelector('#modal-close')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  return { open, close };
}