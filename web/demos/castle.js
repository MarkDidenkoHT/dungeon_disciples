// A finished castle for each of the three factions.
//
// data/buildings.js is CommonJS — the server owns it, and the game's own castle
// screen mirrors the parts it needs rather than importing it. The demo takes a
// third route: build-web.js requires the module and writes the tables out as
// JSON, so the slot layout, the building names and the prices here are the
// game's own rather than a copy that can drift.
//
// The grid itself is style.css doing the work. Every class below is the game's,
// including the [data-slot] rules that decide where each square sits.
import BUILDINGS from '../vendor/data/buildings.json' with { type: 'json' };
import { UNITS } from '../vendor/data/units.js';
import { assetUrl } from '../vendor/public/asset_base.js';
import {
  openSheet, openSubSheet, handleUnitInspect, buildUnitCard,
  CRYSTAL_ICONS, GOLD_ICON, unitName, escapeHtml,
} from '../vendor/public/utils.js';
import {
  player, faction, L, t, seedResources, renderResourceBar, mountFactionTabs,
} from './demo-boot.js';

const { BUILDING_POOLS, SLOT_CATEGORIES, SLOT_FIXED_BUILDING, BUILDING_MAX_LEVELS } = BUILDINGS;

// Layer-2 buildings recruit nobody, so they carry their own art — one image per
// faction, suffixed with the faction's initial. Same table as castle.js.
const ART_SUFFIX = { empire: 'e', choir_of_the_cursed: 'c', grail_of_sorrow: 'g' };

const pool = BUILDING_POOLS[faction];
const byId = new Map(Object.values(pool).flat().map(b => [b.id, b]));

function unitById(unitId) {
  for (const f of Object.keys(BUILDING_POOLS)) {
    const found = Object.values(UNITS[f] || {}).find(u => u?.id === unitId);
    if (found) return found;
  }
  return null;
}

// A hero's portrait is filed under the base id — h_e_1 covers every branch of
// h_e_1111 — so the id is trimmed back to it, exactly as the castle does.
function portraitUrl(unitId) {
  if (!unitId) return '';
  const id = String(unitId).match(/^(h_[a-z]_\d)/)?.[1] ?? unitId;
  return assetUrl(`/assets/character_portraits/p_${id}.png`);
}

function buildingArt(def) {
  if (!def?.art) return '';
  return assetUrl(`/assets/buildings/${def.art}_${ART_SUFFIX[faction]}.jpg`);
}

function label(def) {
  if (!def) return '';
  return (L === 'ru' ? def.label_ru : def.label) || def.label || def.id;
}

const slotNumber = slot => Number(slot.slice(5));
const SLOTS = Object.keys(SLOT_CATEGORIES);

// A castle a long way in, because an empty one demonstrates nothing. The throne
// is raised, the tier-1 barracks are standing, the leftover plots are bare so
// the empty state is on show too, and layer 2 is complete.
function buildCastle() {
  const data = {};
  const throne = pool.throne.find(b => b.tier === 1);
  data.slot_0 = { building_id: throne?.id ?? 'throne', level: 3 };

  const tier1 = pool.barracks.filter(b => b.tier === 1);
  SLOTS.filter(s => SLOT_CATEGORIES[s] === 'barracks' && slotNumber(s) < 12)
    .forEach((slot, i) => {
      if (tier1[i]) data[slot] = { building_id: tier1[i].id, level: 1 };
    });

  for (const [slot, buildingId] of Object.entries(SLOT_FIXED_BUILDING)) {
    data[slot] = { building_id: buildingId, level: BUILDING_MAX_LEVELS[buildingId] ?? 1 };
  }
  return data;
}

const data = buildCastle();

function nodeHtml(slot) {
  const state   = data[slot] || { level: 0, building_id: null };
  const def     = state.building_id ? byId.get(state.building_id) : null;
  const isEmpty = !state.building_id;
  // An empty slot that can only ever hold one building shows that building's
  // art greyed out — the player sees what goes here before paying for it.
  const preview = isEmpty && SLOT_FIXED_BUILDING[slot] ? byId.get(SLOT_FIXED_BUILDING[slot]) : null;
  const art     = portraitUrl((def || preview)?.unit_id) || buildingArt(def || preview);
  // Layer-2 squares with no building named for them hold content that does not
  // exist yet; they read as locked rather than as an invitation to build.
  const reserved = slotNumber(slot) >= 12 && !SLOT_FIXED_BUILDING[slot] && isEmpty;

  // The throne is the only node outside .outer-ring, so the rules that size a
  // ring node do not reach it — it carries its own modifier, as in the game.
  const classes = ['castle-node',
                   slot === 'slot_0' ? 'castle-node--throne castle-node--clickable' : '',
                   isEmpty ? 'castle-node--empty' : '',
                   art ? 'castle-node--portrait' : '',
                   reserved ? 'castle-node--locked' : '',
                   preview ? 'castle-node--preview' : ''].filter(Boolean).join(' ');
  const glyph = reserved ? '\u{1F512}' : (isEmpty ? '＋' : '⚔');
  const bg    = art ? ` style="background-image:url('${art}')"` : '';
  const title = def ? ` title="${escapeHtml(label(def))}"` : '';

  return `
    <div class="${classes}" data-slot="${slot}"${bg}${title}>
      ${art && !reserved && !preview ? '' : `<div class="castle-node-icon">${glyph}</div>`}
      ${state.level ? `<div class="castle-node-bars"><span class="castle-node-level">${state.level}</span></div>` : ''}
    </div>`;
}

function render() {
  document.getElementById('center-slot').innerHTML = nodeHtml('slot_0');
  document.getElementById('outer-ring').innerHTML =
    SLOTS.filter(s => s !== 'slot_0' && slotNumber(s) < 12).map(nodeHtml).join('');

  const col = (id, category) => {
    document.getElementById(id).innerHTML =
      SLOTS.filter(s => SLOT_CATEGORIES[s] === category).map(nodeHtml).join('');
  };
  col('hall-col', 'hall_up');
  col('merc-col', 'merc_up');
  col('barracks-col', 'barracks_up');
}

function costHtml(cost) {
  const parts = Object.entries(cost || {}).map(([item, amount]) => {
    if (item.toLowerCase() === 'gold') return `${GOLD_ICON}${amount}`;
    if (CRYSTAL_ICONS[item]) return `${CRYSTAL_ICONS[item]}${amount}`;
    return `${amount} × ${item.replace(/_/g, ' ')}`;
  });
  return parts.length ? parts.join(' · ') : t('No cost', 'Бесплатно');
}

function openSlot(slot) {
  const state = data[slot] || {};
  const def   = state.building_id ? byId.get(state.building_id) : null;

  if (!def) {
    const fixed = SLOT_FIXED_BUILDING[slot] ? byId.get(SLOT_FIXED_BUILDING[slot]) : null;
    openSheet(t('Empty plot', 'Пустая площадка'), `<div class="demo-note">${fixed
      ? `${t('This plot takes one building only', 'Эта площадка принимает лишь одно строение')}: <b>${escapeHtml(label(fixed))}</b> — ${costHtml(fixed.cost)}`
      : t('Nothing stands here yet. In the game you choose what goes up, from the buildings your faction knows.',
          'Здесь пока ничего не стоит. В игре вы сами выбираете, что здесь поднять, из доступных вашей фракции строений.')}</div>`);
    return;
  }

  const unit  = def.unit_id ? unitById(def.unit_id) : null;
  const maxLv = BUILDING_MAX_LEVELS[def.id] ?? 1;
  const rows  = [
    [t('Level', 'Уровень'), `${state.level} / ${maxLv}`],
    [t('Cost', 'Цена'),     costHtml(def.cost)],
  ];

  // A barracks IS its unit — what the plot is for is who comes out of it — so
  // the sheet leads with the game's own unit card rather than describing it.
  // Halls recruit nobody and keep the plain building sheet.
  const body = `
    <div class="demo-note">
      ${rows.map(([k, v]) => `<div><span style="color:var(--muted)">${k}:</span> ${v}</div>`).join('')}
    </div>
    ${unit ? buildUnitCard(unit) : ''}`;

  openSheet(label(def), body);
}

// The stat columns and ability icons on the card explain themselves, exactly as
// they do in the roster — a sub-sheet over the sheet already open.
document.addEventListener('click', e => {
  if (e.target.closest('.modal-body')) handleUnitInspect(e, openSubSheet);
});

document.querySelector('.castle-grounds').addEventListener('click', e => {
  const node = e.target.closest('.castle-node');
  if (node) openSlot(node.dataset.slot);
});

// ── The two pages ───────────────────────────────────────────────────────────
let layer = 1;
const track = document.getElementById('castle-layer-track');
const prev  = document.getElementById('layer-prev');
const next  = document.getElementById('layer-next');

function applyLayer() {
  track.style.transform = `translateX(-${(layer - 1) * 100}%)`;
  document.querySelectorAll('.castle-layer').forEach(el => {
    const on = Number(el.dataset.layer) === layer;
    el.classList.toggle('castle-layer--active', on);
    el.setAttribute('aria-hidden', String(!on));
  });
  prev.disabled = layer === 1;
  next.disabled = layer === 2;
  prev.classList.toggle('castle-layer-arrow--live', layer > 1);
  next.classList.toggle('castle-layer-arrow--live', layer < 2);
  document.getElementById('note').textContent = layer === 1
    ? t('Page 1 — the throne and the barracks that recruit your units. Tap a square.',
        'Страница 1 — трон и казармы, где набираются юниты. Нажмите на клетку.')
    : t('Page 2 — the halls: forge, infirmary, mage guild, temple. Each has its own ladder of levels.',
        'Страница 2 — залы: кузница, лазарет, гильдия магов, храм. У каждого своя лестница уровней.');
}

prev.addEventListener('click', () => { layer = 1; applyLayer(); });
next.addEventListener('click', () => { layer = 2; applyLayer(); });

seedResources({
  Gold:            760,
  Crystals_Life:   88,
  Crystals_Fire:   52,
  Crystals_Death:  47,
  Crystals_Frost:  39,
  Crystals_Nature: 64,
  Crystals_Air:    71,
});
renderResourceBar(document.getElementById('resource-bar'));
mountFactionTabs(document.getElementById('factions'));

render();
applyLayer();
