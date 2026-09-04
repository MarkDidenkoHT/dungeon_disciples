import { assetUrl } from './asset_base.js';
import { UNITS }          from '../data/units.js';
import { UNIT_ABILITIES } from '../data/unit_abilities.js';
import { applyItemModifiers, ITEM_DEFS } from '../data/items.js';

// Localized spell text. For a non-English language, returns ONLY that language's
// field (e.g. name_ru) — no English fallback, so a missing translation shows up
// as blank instead of silently reverting to English. English is the default.
function spellText(spell, field, player) {
  const lang = player?.settings?.language;
  if (lang && lang !== 'en') return spell?.[`${field}_${lang}`] ?? '';
  return spell?.[field] ?? '';
}
export const spellName = (spell, player) => spellText(spell, 'name', player);
export const spellDesc = (spell, player) => spellText(spell, 'description', player);

// Localized item name. Resolves the item's key (from a catalog def's `key` or an
// owned row's `item_stats.key`) and reads name_ru from ITEM_DEFS. Same rule as
// spells: for a non-English language it returns ONLY that language's name (no
// English fallback); English is the default.
export function itemName(item, player) {
  if (!item) return '';
  const key = item.key ?? item.item_stats?.key ?? item.item_stats?.icon;
  const def = key ? ITEM_DEFS[key] : null;
  const lang = player?.settings?.language;
  if (lang && lang !== 'en') return def?.name_ru ?? '';
  return def?.name ?? item.name ?? item.item_name ?? '';
}

// Localized unit name. Accepts a unit DEFINITION, a roster row, or a battle
// combatant — anything carrying `name`/`name_ru`, or a `unit_data` that does.
//
// DELIBERATELY UNLIKE spellName/itemName: this one falls back to English when a
// translation is missing. Those two return blank on purpose, so an untranslated
// spell is obvious rather than silently English — but a unit name is a label on
// a portrait, a grid cell, a battle log line and a bark header. Blanking it does
// not read as "missing translation", it reads as a broken card. Every unit in
// data/units.js currently carries name_ru, so the fallback should never fire;
// it exists so that adding a unit and forgetting its translation costs a stray
// English word rather than an anonymous portrait.
export function unitName(unit, player) {
  if (!unit) return '';
  const src  = unit.name || unit.name_ru ? unit : (unit.unit_data || unit);
  const lang = player?.settings?.language ?? (_uiLang === 'ru' ? 'ru' : 'en');
  if (lang === 'ru') return src?.name_ru || src?.name || unit.unit_name || '';
  return src?.name || unit.unit_name || '';
}

// Localized building label. Buildings use `label`/`label_ru` rather than
// `name`/`name_ru`, and they reach the client as JSON from /bootstrap, so this
// only has to pick a field. Falls back to English for the same reason unitName
// does: a nameless slot in the castle reads as a bug, not as a missing string.
export function buildingLabel(def, player) {
  if (!def) return '';
  const lang = player?.settings?.language ?? (_uiLang === 'ru' ? 'ru' : 'en');
  if (lang === 'ru') return def.label_ru || def.label || '';
  return def.label || '';
}

// Rarity slug for an item (common/rare/epic/mythic), resolved from ITEM_DEFS by
// key since owned rows don't store it. Drives the coloured card/slot border.
export function itemRarity(item) {
  if (!item) return 'common';
  const key = item.key ?? item.item_stats?.key ?? item.item_stats?.icon;
  return (key && ITEM_DEFS[key]?.rarity) || item.rarity || 'common';
}

export function withEquippedItem(liveUnit, item) {
  return item ? applyItemModifiers(liveUnit, item.item_stats) : liveUnit;
}

// utils.js renders shared chrome for every screen but is handed no player, so
// the current language is set once per navigation by main.js instead of being
// threaded through every call site.
let _uiLang = 'en';
export function setUiLanguage(language) {
  _uiLang = language === 'ru' ? 'ru' : 'en';
}
export function uiText(en, ru) { return _uiLang === 'ru' ? ru : en; }

// `removes_tag` (and anything else tag-shaped) may be authored as one tag or as
// a list. One label rule, so the item card, the castle equip sheet and the item
// screen all print the same thing.
export function tagListLabel(spec) {
  return (Array.isArray(spec) ? spec : [spec]).filter(Boolean).join(', ');
}

// The faction's accent palette is a set of CSS variables hung off the BODY (see
// the body[data-faction] blocks in style.css), so every screen, sheet and glow
// picks it up without being told. Set once at boot and again the moment a new
// player picks a faction, before their first screen is drawn.
export function applyFactionTheme(faction) {
  if (typeof document === 'undefined') return;
  if (faction) document.body.dataset.faction = faction;
  else delete document.body.dataset.faction;
}

// What each action actually does, in both languages. The Action stat used to
// open a modal saying only "The type of action this unit performs each turn",
// which told the player nothing about the difference between, say, Sacrifice and
// Mend Flesh. Keys are normalised (lowercased, underscores -> spaces).
export const ACTION_INFO = {
  'attack': {
    name: { en: 'Attack',  ru: 'Атака' },
    desc: {
      en: 'Strikes one enemy for the unit\'s Power. Melee units can only reach the enemy front line; ranged units reach anything.',
      ru: 'Бьёт одного врага на величину Силы. Ближний бой достаёт только переднюю линию врага, дальнобойные — любого.',
    },
  },
  'heal': {
    name: { en: 'Heal',    ru: 'Лечение' },
    desc: {
      en: 'Restores HP to one ally, equal to the unit\'s Power. Cannot exceed the ally\'s maximum HP, and is weakened by battle fatigue in long fights.',
      ru: 'Восстанавливает союзнику HP, равное Силе бойца. Не превышает максимум HP и слабеет от боевой усталости в долгих боях.',
    },
  },
  'mend flesh': {
    name: { en: 'Mend Flesh', ru: 'Врачевание плоти' },
    desc: {
      en: 'The Grail\'s form of healing: restores HP to one ally for the unit\'s Power. Construct and Zombie allies cannot be mended.',
      ru: 'Исцеление Грааля: восстанавливает союзнику HP на величину Силы. Конструктов и зомби вылечить нельзя.',
    },
  },
  'repair': {
    name: { en: 'Repair',  ru: 'Ремонт' },
    desc: {
      en: 'Restores HP to one allied construct or machine, equal to the unit\'s Power.',
      ru: 'Восстанавливает HP союзному конструкту или машине на величину Силы.',
    },
  },
  'pale_embrace': {
    name: { en: 'Pale Embrace', ru: 'Бледные объятия' },
    desc: {
      en: 'Gathers the dead to her: mends every Spirit ally at once for the unit\'s Power. Nothing that still has a body can be embraced.',
      ru: 'Собирает мёртвых к себе: разом исцеляет всех союзников-духов на величину Силы. Тех, у кого ещё есть тело, обнять нельзя.',
    },
  },
  'sacrifice': {
    name: { en: 'Sacrifice', ru: 'Жертва' },
    desc: {
      en: 'Spends an ally\'s life to fuel the strike: the chosen ally loses HP and the enemy suffers for it.',
      ru: 'Тратит жизнь союзника ради удара: выбранный союзник теряет HP, а враг расплачивается за это.',
    },
  },
  'holy shock': {
    name: { en: 'Holy Shock', ru: 'Священный разряд' },
    desc: {
      en: 'Reads its target: an ally is mended for the unit\'s Power, an enemy is struck for it. One action, either use.',
      ru: 'Смотрит по цели: союзника лечит на величину Силы, врага бьёт на неё же. Одно действие — два применения.',
    },
  },
  'shield': {
    name: { en: 'Shield', ru: 'Щит' },
    desc: {
      en: 'Wards an ally with a pool equal to the unit\'s Power. The pool absorbs damage point for point and is spent doing it, so it is worth most on a unit about to be hit. It stacks with itself up to half the warded unit\'s max HP.',
      ru: 'Даёт союзнику запас, равный Силе бойца. Запас поглощает урон один к одному и расходуется при этом, так что полезнее всего на том, кого вот-вот ударят. Складывается сам с собой до половины макс. HP цели.',
    },
  },
  'decay': {
    name: { en: 'Decay', ru: 'Тлен' },
    desc: {
      en: 'Saddles an enemy with a pool equal to the unit\'s Power. The pool eats the healing they receive, point for point, and is spent doing it — it deals no damage itself. It stacks up to half the target\'s max HP.',
      ru: 'Накладывает на врага запас, равный Силе бойца. Запас съедает получаемое им исцеление один к одному и расходуется при этом — сам по себе урона не наносит. Складывается до половины макс. HP цели.',
    },
  },
  'none': {
    name: { en: 'Passive',  ru: 'Пассивное' },
    desc: {
      en: 'This unit takes no action of its own. It contributes through its passives alone.',
      ru: 'Этот боец не совершает собственных действий. Он полезен только своими пассивными умениями.',
    },
  },
};

export const RESIST_LABELS = {
  air:    { en: 'Air',    ru: 'Воздух' },
  fire:   { en: 'Fire',   ru: 'Огонь'  },
  nature: { en: 'Nature', ru: 'Природа'},
  cold:   { en: 'Cold',   ru: 'Холод'  },
  life:   { en: 'Life',   ru: 'Жизнь'  },
  death:  { en: 'Death',  ru: 'Смерть' },
};

export const RESIST_ICONS = {
  air:    { icon: '🌬️', label: 'Air'    },
  fire:   { icon: '🔥', label: 'Fire'   },
  nature: { icon: '🌿', label: 'Nature' },
  cold:   { icon: '❄️', label: 'Cold'   },
  life:   { icon: '✨', label: 'Life'   },
  death:  { icon: '🌑', label: 'Death'  },
};

export const RESIST_ORDER = ['air', 'fire', 'nature', 'cold', 'life', 'death'];

const PAGE_TURN_SOUND_PATH = '/assets/mp3/ui/turn-page.mp3';

export function playPageTurnSound() {
  const audio = new Audio(assetUrl(PAGE_TURN_SOUND_PATH));
  audio.volume = 0.55;
  audio.play().catch(() => {});
}

export const CRYSTAL_ICONS = {
  Crystals_Life:   `<img src="${assetUrl('/assets/icons/recources/life.png')}"   class="res-icon-img" alt="Life">`,
  Crystals_Fire:   `<img src="${assetUrl('/assets/icons/recources/fire.png')}"   class="res-icon-img" alt="Fire">`,
  Crystals_Death:  `<img src="${assetUrl('/assets/icons/recources/death.png')}"  class="res-icon-img" alt="Death">`,
  Crystals_Frost:  `<img src="${assetUrl('/assets/icons/recources/cold.png')}"   class="res-icon-img" alt="Frost">`,
  Crystals_Nature: `<img src="${assetUrl('/assets/icons/recources/nature.png')}" class="res-icon-img" alt="Nature">`,
  Crystals_Air:    `<img src="${assetUrl('/assets/icons/recources/air.png')}" class="res-icon-img" alt="Air">`,
};

export const GOLD_ICON = `<img src="${assetUrl('/assets/icons/recources/gold.png')}" class="res-icon-img" alt="Gold">`;

// The resource strip's slots, in the order they are drawn. Anything that has to
// line up COLUMN-WISE with that strip — the build-cost bar under it — renders
// from this same list, so the two can never drift out of step.
export const RESOURCE_BAR_SLOTS = [
  { key: 'Gold',            label: 'Gold',   icon: GOLD_ICON },
  { key: 'Crystals_Life',   label: 'Life',   icon: CRYSTAL_ICONS.Crystals_Life },
  { key: 'Crystals_Fire',   label: 'Fire',   icon: CRYSTAL_ICONS.Crystals_Fire },
  { key: 'Crystals_Death',  label: 'Death',  icon: CRYSTAL_ICONS.Crystals_Death },
  { key: 'Crystals_Nature', label: 'Nature', icon: CRYSTAL_ICONS.Crystals_Nature },
  { key: 'Crystals_Frost',  label: 'Frost',  icon: CRYSTAL_ICONS.Crystals_Frost },
  { key: 'Crystals_Air',    label: 'Air',    icon: CRYSTAL_ICONS.Crystals_Air },
];

export const SCREEN_BACKGROUNDS = {
  roster: {
    empire:              assetUrl('/assets/screens/empire.jpg'),
    choir_of_the_cursed: assetUrl('/assets/screens/choir.jpg'),
    grail_of_sorrow:     assetUrl('/assets/screens/grail.jpg'),
  },
  embark: {
    empire:              assetUrl('/assets/screens/embark.jpg'),
    choir_of_the_cursed: assetUrl('/assets/screens/embark.jpg'),
    grail_of_sorrow:     assetUrl('/assets/screens/embark.jpg'),
  },
  spells: {
    empire:              assetUrl('/assets/screens/spell_book.jpg'),
    choir_of_the_cursed: assetUrl('/assets/screens/spell_book.jpg'),
    grail_of_sorrow:     assetUrl('/assets/screens/spell_book.jpg'),
  },
};

export const SCREEN_BACKGROUND_POSITIONS = {
  spells: 'left bottom',
  embark: 'left bottom',
};

export function applyBackground(root, faction, screen) {
  const url = SCREEN_BACKGROUNDS[screen]?.[faction];
  if (!url) return;
  root.style.backgroundImage    = `url('${url}')`;
  root.style.backgroundSize     = 'cover';
  root.style.backgroundPosition = SCREEN_BACKGROUND_POSITIONS[screen] || 'center';
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
  function searchObj(obj, depth) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    if (obj.id === uid) return obj;
    if (depth <= 0) return null;
    for (const val of Object.values(obj)) {
      const found = searchObj(val, depth - 1);
      if (found) return found;
    }
    return null;
  }
  return searchObj(UNITS, 4);
}

export function resolveAbility(key) {
  if (!key || key === 'None') return null;
  return UNIT_ABILITIES[key]
    || UNIT_ABILITIES[key.replace(/\s+/g, '_')]
    || UNIT_ABILITIES[key.replace(/_/g, ' ')]
    || null;
}

// Ability text in the viewer's language. The translations live beside the
// English on the definition itself (name_ru / description_ru in
// data/unit_abilities.js) rather than in a separate table, so a new ability
// carries its own translation and cannot drift out of sync with its key.
// Falls back to English rather than showing a blank, so an untranslated entry
// is merely untranslated instead of invisible.
export function abilityName(def) {
  if (!def) return '';
  return (_uiLang === 'ru' && def.name_ru) || def.name || '';
}
export function abilityDescription(def) {
  if (!def) return '';
  return (_uiLang === 'ru' && def.description_ru) || def.description || '';
}

// Stat names shown under a passive's description. Kept short: these sit in a
// comma-separated run, not full sentences.
const STAT_LABELS = {
  hp:              { en: 'HP',              ru: 'HP' },
  hp_regen:        { en: 'HP regen/turn',   ru: 'HP реген/ход' },
  initiative:      { en: 'Initiative',      ru: 'Инициатива' },
  armor:           { en: 'Armor',           ru: 'Броня' },
  armor_reduction: { en: 'Armor reduction', ru: 'Снижение брони' },
};

export function buildStatDescription(def, type) {
  const parts = [];
  const desc = abilityDescription(def);
  if (desc) parts.push(desc);
  if (type === 'passive' && def.stats) {
    const statLines = Object.entries(def.stats).map(([stat, val]) => {
      const sign = val >= 0 ? '+' : '';
      const known = STAT_LABELS[stat];
      // armor_reduction is already negative in the data — no sign prefix.
      if (known) return `${stat === 'armor_reduction' ? '' : sign}${val} ${known[_uiLang] || known.en}`;
      if (stat.includes('resist')) {
        const resistType = stat.replace('_resist', '');
        const label = RESIST_LABELS?.[resistType]?.[_uiLang] || cap(resistType);
        return `${sign}${val} ${label} ${uiText('resist', 'сопр.')}`;
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

export function getActionLabel(actionKey) {
  if (!actionKey) return '—';
  const k = typeof actionKey === 'string' ? actionKey : (actionKey.id || '');
  const map = {
    attack:       'Attack',
    heal:         'Heal',
    repair:       'Repair',
    'mend flesh': 'Mend Flesh',
    sacrifice:    'Sacrifice',
    holy_shock:   'Holy Shock',   // heals an ally OR strikes an enemy — see getValidTargets
    pale_embrace: 'Pale Embrace',
    shield:       'Shield',       // grants an ally a damage-absorbing pool
    decay:        'Decay',        // saddles an enemy with a healing-absorbing one
  };
  return map[k.toLowerCase()] || cap(k);
}

// The rank an ability key carries: 'aegis 2' -> 2, 'aegis' -> 1. Ranks are the
// trailing number on the key and nothing else, so this is the one place that
// has to know the convention.
export function abilityRank(key) {
  const m = /\s(\d+)$/.exec(String(key || ''));
  return m ? Number(m[1]) : (key ? 1 : 0);
}

// `rankUp` draws a +N flag over the icon. An upgrade that raises a passive a
// rank (aegis 1 -> aegis 2) otherwise looked identical to one that changed
// nothing — same art, same name, same slot — so the single most common reason
// to take a branch was invisible on the card comparing them.
export function renderUnitAbilityIcon(key, type, opts = {}) {
  const def     = resolveAbility(key);
  const isEmpty = !def;
  const fileKey = key ? key.replace(/\s+/g, '_').replace(/_\d+$/, '') : null;
  const imgSrc  = def ? assetUrl(`/assets/icons/abilities/${fileKey}.jpg`) : null;
  const rankUp  = Number(opts.rankUp) || 0;
  return `
    <button
      class="ability-icon ability-icon--${type}${isEmpty ? ' ability-icon--empty' : ''}"
      data-ability-key="${key || ''}"
      data-ability-type="${type}"
      ${isEmpty ? 'disabled' : ''}
    >
      ${imgSrc ? `<img class="ability-icon-img" src="${imgSrc}" alt="${abilityName(def)}" onerror="this.style.visibility='hidden'">` : ''}
      ${rankUp > 0 ? `<span class="ability-rank-up">+${rankUp}</span>` : ''}
    </button>`;
}

export function renderUnitPortrait(unit, opts = {}) {
  const { badge = '' } = opts;
  const tags     = (unit.tags || []).filter(Boolean);
  const tagsHtml = tags.map(t => `<span class="unit-tag">${t}</span>`).join('');
  const portraitId = unit.id.match(/^(h_[a-z]_\d)/)?.[1] ?? unit.id;
  const portrait = assetUrl(`/assets/character_art/${portraitId}.png`);

  return `
    <div class="unit-portrait">
      <img
        src="${portrait}"
        alt="${unitName(unit)}"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
      >
      <div class="unit-portrait-fallback" style="display:none;">
        <span>${unit.id}</span>
      </div>
      <div class="unit-identity-bar">
        <div class="unit-identity-main">
          <span class="unit-name">${unitName(unit)}</span>
          ${badge ? `<span class="detail-unit-badge">${badge}</span>` : ''}
        </div>
        <div class="unit-identity-tags">
          ${tagsHtml}
        </div>
      </div>
    </div>`;
}

// Which cells a unit of `size` actually stands on, anchored at `cell`.
//
// This MIRRORS BattleEngine.getFootprint() in utils/battle-engine.js and must
// keep mirroring it: the server decides what a large unit covers, and a grid
// that disagrees either paints a unit over a cell the engine considers free or
// emits a tile for a cell that is already taken — which overflows a fixed grid
// and shoves every later cell out of place.
//
// Both sizes are NORMALIZED rather than trusted:
//   row    — 2 wide, so it always starts in column 0 whatever column it was
//            anchored in. Reading `cell + 1` off an anchor in column 1 reaches
//            into the NEXT ROW, which is another unit's cell.
//   column — 2 tall, so an anchor on the bottom row hangs off the grid; it
//            starts one row higher instead.
// Returns the covered cells in grid order, so index 0 is where the tile is
// drawn and the rest are the cells it swallows.
export function cellFootprint(cell, size, rows = 3, cols = 2) {
  const r = Math.floor(cell / cols);
  const c = cell % cols;
  if (size === 'row')    return [r * cols, r * cols + 1];
  if (size === 'column') {
    const top = r <= rows - 2 ? r : r - 1;
    return [top * cols + c, (top + 1) * cols + c];
  }
  return [cell];
}

export function calcUnitPower(unit) {
  const res      = unit.resistances || {};
  const avgRes   = Object.values(res).reduce((s, v) => s + (v || 0), 0) / 6;
  const armor    = unit.armor ?? 0;
  const hp       = unit.max_hp ?? unit.hp ?? 0;
  const hp_num   = typeof hp === 'string' ? parseInt(hp.split('/')[1] || hp) : hp;
  const vitality = ((avgRes + armor) / 2) + hp_num;

  const power      = unit.action_power ?? unit.action?.value ?? 0;
  const targets    = unit.targets ?? 1;
  const initiative = unit.initiative ?? 0;
  const dps        = power * (targets / 2) * (1 + initiative / 100);

  return Math.round(vitality + dps);
}

export function renderUnitCoreStatsColumn(unit, opts = {}) {
  const actionLabel = getActionLabel(unit.action);
  const power       = unit.action_power ?? unit.action?.value ?? '—';
  const unitPower   = calcUnitPower(unit);
  const tier        = unit.t ?? unit.tier ?? '—';
  const { canLevelUp = false, rosterId = null, compareUnit = null } = opts;
  const diffs = unitStatDiffs(unit, compareUnit);
  const delta = key => statDeltaHtml(diffs[key], 'right');

  // Targets and Range have no stat cell of their own, and both qualify the
  // ACTION rather than the unit — so they hang off the Action cell exactly the
  // way HP's or Power's delta hangs off its own cell, instead of floating loose
  // under the card as facts about nothing.
  const actionDelta = renderUnitStatDiffs(unit, compareUnit);

  const lvCell = canLevelUp && rosterId
    ? `<button class="core-stat core-stat--levelup levelup-btn--ready" data-roster-id="${rosterId}"><span class="core-stat-label">Lv</span><span class="core-stat-val">${tier}</span></button>`
    : `<div class="core-stat"><span class="core-stat-label">Lv</span><span class="core-stat-val">${tier}</span></div>`;

  return `
    <div class="unit-core-stats unit-core-stats--side">
      ${lvCell}
      <div class="core-stat"><span class="core-stat-label">HP</span><span class="core-stat-val">${unit.hp ?? '—'}</span>${delta('hp')}</div>
      <div class="core-stat"><span class="core-stat-label">Init</span><span class="core-stat-val">${unit.initiative ?? '—'}</span>${delta('initiative')}</div>
      <div class="core-stat"><span class="core-stat-label">Power</span><span class="core-stat-val">${power}</span>${delta('action_power')}</div>
      <div class="core-stat" data-action-key="${unit.action ?? ''}" data-targets="${unit.targets ?? 1}" data-range="${unit.range ?? 1}" data-target-type="${unit.target_type ?? ''}"><span class="core-stat-label">Action</span><span class="core-stat-val core-stat-val--action">${actionLabel}</span>${actionDelta}</div>
      <div class="core-stat"><span class="core-stat-label">XP</span><span class="core-stat-val">${unit.xp ?? '—'}</span></div>
      <div class="core-stat"><span class="core-stat-label">Balance</span><span class="core-stat-val">${unitPower}</span></div>
    </div>`;
}

export function renderUnitResistColumn(unit, compareUnit = null) {
  const res      = unit.resistances || {};
  const armorVal = unit.armor ?? 0;
  const armorCls = armorVal > 0 ? 'resist-val--pos' : '';
  const diffs    = unitStatDiffs(unit, compareUnit);
  const armorCell = `
    <div class="resist-cell" title="${uiText('Armor', 'Броня')}" data-armor="${armorVal}">
      <span class="resist-icon">🛡</span>
      <span class="resist-val ${armorCls}">${armorVal}</span>
      ${statDeltaHtml(diffs.armor, 'left')}
    </div>`;

  // Resist buffs (Frost Armor, Aegis, Sanctuary) and shreds move these numbers
  // in place, so each cell carries its own delta against the comparison unit —
  // otherwise a warded unit reads exactly like an unwarded one.
  const baseRes = compareUnit?.resistances || {};
  const resistCells = RESIST_ORDER.map(r => {
    const info = RESIST_ICONS[r];
    const val  = res[r] ?? 0;
    const cls  = val > 0 ? 'resist-val--pos' : val < 0 ? 'resist-val--neg' : '';
    const rd   = compareUnit ? val - (baseRes[r] ?? 0) : 0;
    // Inline rather than the absolutely-positioned statDeltaHtml badge: six
    // resist cells sit shoulder to shoulder in one row, so a badge hung outside
    // a cell would land on top of its neighbour.
    const rDelta = rd
      ? `<span class="resist-delta stat-delta--${rd > 0 ? 'up' : 'down'}">${rd > 0 ? '+' : ''}${rd}</span>`
      : '';
    return `<div class="resist-cell" title="${RESIST_LABELS[r] ? uiText(RESIST_LABELS[r].en, RESIST_LABELS[r].ru) : info.label}">
      <span class="resist-icon">${info.icon}</span>
      <span class="resist-val ${cls}">${val}</span>
      ${rDelta}
    </div>`;
  }).join('');

  return `<div class="unit-resists-grid unit-resists-grid--side">${armorCell}${resistCells}</div>`;
}

// Enemies reference items by blueprint key (unit_data.item_id) rather than
// owning a row in the items table. This wraps a blueprint so renderItemSlotIcon
// and buildItemModalParts — both written against owned items — work unchanged.
export function itemFromDefKey(key) {
  const def = key ? ITEM_DEFS[key] : null;
  if (!def) return null;
  return { id: null, item_key: key, item_name: def.name, item_stats: def };
}

// The item a combatant is carrying, whichever side it is on: an owned row for
// the player's units, a blueprint for an enemy's.
export function combatantItem(unit, ownedLookup = null) {
  const stored = unit?.unit_data ?? unit ?? {};
  if (stored.item_id) return itemFromDefKey(stored.item_id);
  const rosterId = unit?._rosterId ?? stored.roster_id ?? null;
  return (rosterId != null && ownedLookup) ? ownedLookup(rosterId) : null;
}

export function renderItemSlotIcon(item, rosterId, opts = {}) {
  const { interactive = true, player = null } = opts;
  const triggerAttr = interactive ? 'data-item-slot' : 'data-item-inspect';

  if (item) {
    const stats  = item.item_stats || {};
    const iconId = stats.icon || stats.key || 'item';
    const label  = itemName(item, player) || item.item_name || 'Item';
    return `
      <button class="ability-icon ability-icon--item ability-icon--rarity-${itemRarity(item)}" ${triggerAttr} data-roster-id="${rosterId ?? ''}" data-item-id="${item.id ?? ''}" data-item-key="${item.item_key ?? ''}" title="${label}">
        <img class="ability-icon-img" src="${assetUrl(`/assets/icons/items/${iconId}.png`)}" alt="${label}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
        <span class="item-slot-fallback" style="display:none;">⚙</span>
      </button>`;
  }

  if (!interactive) {
    return `<button class="ability-icon ability-icon--item ability-icon--item-empty" disabled></button>`;
  }

  return `
    <button class="ability-icon ability-icon--item ability-icon--item-empty" data-item-slot data-roster-id="${rosterId}" title="${uiText('Equip Item', 'Надеть предмет')}">
      <span class="item-slot-plus">+</span>
    </button>`;
}

export function renderUnitAbilitiesRow(unit, opts = {}) {
  // native_passive is set by applyItemModifiers and holds what the unit had
  // BEFORE its item's passive was folded in. Rendering unit.passive here meant a
  // unit with three of its own plus an item's had four passives fighting over
  // three slots, and the item's showed up twice — once here, once on the item.
  const source = unit.native_passive ?? unit.passive;
  const passiveKeys = Array.isArray(source)
    ? source.filter(Boolean)
    : (source ? [source] : []);

  // How many ranks each ability gained over the unit being compared against.
  // Matched on the ability's BASE name, so 'aegis 1' and 'aegis 2' are the same
  // ability at two ranks rather than two unrelated keys.
  const base = k => String(k || '').replace(/\s+\d+$/, '');
  const cmp  = opts.compareUnit;
  const cmpKeys = cmp
    ? [cmp.ability, ...(Array.isArray(cmp.native_passive ?? cmp.passive)
        ? (cmp.native_passive ?? cmp.passive)
        : [cmp.native_passive ?? cmp.passive])].filter(Boolean)
    : [];
  const rankUpFor = key => {
    if (!cmp || !key) return 0;
    const was = cmpKeys.find(k => base(k) === base(key));
    if (!was) return 0;                       // brand new, not a rank-up
    return Math.max(0, abilityRank(key) - abilityRank(was));
  };

  const iconsHtml = [
    unit.ability   ? renderUnitAbilityIcon(unit.ability,   'active',  { rankUp: rankUpFor(unit.ability) })  : renderUnitAbilityIcon('', 'empty'),
    passiveKeys[0] ? renderUnitAbilityIcon(passiveKeys[0], 'passive', { rankUp: rankUpFor(passiveKeys[0]) }) : renderUnitAbilityIcon('', 'empty'),
    passiveKeys[1] ? renderUnitAbilityIcon(passiveKeys[1], 'passive', { rankUp: rankUpFor(passiveKeys[1]) }) : renderUnitAbilityIcon('', 'empty'),
    passiveKeys[2] ? renderUnitAbilityIcon(passiveKeys[2], 'passive', { rankUp: rankUpFor(passiveKeys[2]) }) : renderUnitAbilityIcon('', 'empty'),
  ].join('');

  const itemHtml = opts.itemSlotHtml || '';
  // Anything the screen wants to hang off the end of the row (the castle's
  // evolution-tree button). Optional, so cards that have no use for it — battle,
  // battle prep, registration — render exactly as before.
  const extraHtml = opts.extraSlotHtml || '';

  return `
    <div class="unit-abilities-row">
      <div class="unit-abilities-icons">
        ${iconsHtml}${itemHtml}${extraHtml}
      </div>
    </div>`;
}

const STAT_DIFF_MAP = [
  { label: 'HP',      key: 'hp'           },
  { label: 'Armor',   key: 'armor'        },
  { label: 'Init',    key: 'initiative'   },
  { label: 'Power',   key: 'action_power' },
  { label: 'Targets', key: 'targets'      },
  { label: 'Range',   key: 'range'        },
];

// Which diffs get pinned to a stat cell, and which cell renders them. Anything
// NOT listed here has no cell to sit beside and falls through to the chip row —
// see renderUnitStatDiffs.
const ANCHORED_DIFF_KEYS = new Set(['hp', 'initiative', 'action_power', 'armor']);

// Keyed by stat, so a renderer can ask "is there a delta for this cell?"
// instead of the diffs being pre-baked into one detached row.
export function unitStatDiffs(unit, compareUnit) {
  if (!unit || !compareUnit) return {};
  const out = {};
  for (const s of STAT_DIFF_MAP) {
    // HP arrives as "12/50" on a live combatant card, and a string subtraction
    // yields NaN — which is !== 0 and would render a "NaN" badge. Only compare
    // stats that are numbers on BOTH sides.
    const a = Number(unit[s.key] ?? 0), b = Number(compareUnit[s.key] ?? 0);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const diff = a - b;
    if (diff !== 0) out[s.key] = { label: s.label, diff };
  }
  return out;
}

// `side` is which way the badge hangs off its cell: the left stat column pushes
// its deltas right, the right column pushes them left, so both land over the
// portrait between the columns rather than widening the card.
function statDeltaHtml(entry, side) {
  if (!entry) return '';
  const dir = entry.diff > 0 ? 'up' : 'down';
  const sign = entry.diff > 0 ? '+' : '';
  return `<span class="stat-delta stat-delta--${side} stat-delta--${dir}">${sign}${entry.diff}</span>`;
}

// Only the diffs with no cell of their own (Targets, Range). The rest are drawn
// against their stat by the two column renderers; these hang off the Action cell
// the same way, as a side delta — see the caller in renderUnitCoreStatsColumn.
export function renderUnitStatDiffs(unit, compareUnit) {
  const diffs = unitStatDiffs(unit, compareUnit);
  const chips = STAT_DIFF_MAP
    .filter(s => !ANCHORED_DIFF_KEYS.has(s.key) && diffs[s.key])
    .map(s => {
      const d = diffs[s.key];
      const dir = d.diff > 0 ? 'up' : 'down';
      return `<span class="stat-delta-line stat-delta--${dir}">${d.label} ${d.diff > 0 ? '+' : ''}${d.diff}</span>`;
    });
  // Same anchor and backdrop as statDeltaHtml's single-number deltas, so it sits
  // beside the cell rather than in the card's flow. Two lines when both Targets
  // and Range moved, which is why the labels ride along.
  return chips.length
    ? `<span class="stat-delta stat-delta--right stat-delta--stack">${chips.join('')}</span>`
    : '';
}

// HP and XP as BARS, the way the roster showed them. A blueprint (a building
// being previewed, a branch being compared) has neither, so this renders only
// what it is given: pass `progress: { hp: { cur, max }, xp: { cur, req } }`.
//
// The XP bar is the one that answers "how close is this unit to levelling", a
// question the flat "XP 720" in the stat column never could — 720 of what?
// `reserve: true` keeps the HP and XP rows' HEIGHT when there is no progress to
// draw. The castle shows a unit with its bars and then an upgrade preview
// without them — the card lost two rows and everything under it jumped, which
// is a lot of layout shift on the screen a player reads most carefully. The
// placeholders are empty, not fake: no numbers, no fill, just the space the
// real rows occupy.
export function renderUnitProgressRow(progress, opts = {}) {
  if (!progress) {
    if (!opts.reserve) return '';
    const blank = `
      <div class="levelup-row unit-progress-row unit-progress-row--ghost" aria-hidden="true">
        <span class="unit-progress-key"></span>
        <div class="levelup-xp-bar"></div>
        <span class="levelup-xp-label"></span>
      </div>`;
    return blank + blank;
  }
  const rows = [];

  const hp = progress.hp;
  if (hp && hp.max > 0) {
    const pct     = Math.max(0, Math.min(100, (hp.cur / hp.max) * 100));
    // Same thresholds as the portrait strips: critical at a third or less.
    const state   = pct <= 33 ? 'critical' : (hp.cur < hp.max ? 'damaged' : 'ok');
    rows.push(`
      <div class="levelup-row unit-progress-row">
        <span class="unit-progress-key">HP</span>
        <div class="levelup-xp-bar">
          <div class="levelup-xp-fill unit-hp-fill--${state}" style="width:${pct}%"></div>
        </div>
        <span class="levelup-xp-label">${hp.cur}/${hp.max}</span>
      </div>`);
  }

  const xp = progress.xp;
  if (xp && xp.req > 0) {
    const pct = Math.max(0, Math.min(100, (xp.cur / xp.req) * 100));
    rows.push(`
      <div class="levelup-row unit-progress-row">
        <span class="unit-progress-key">XP</span>
        <div class="levelup-xp-bar">
          <div class="levelup-xp-fill" style="width:${pct}%"></div>
        </div>
        <span class="levelup-xp-label">${xp.cur}/${xp.req}</span>
      </div>`);
  } else if (xp && xp.cur != null) {
    // Top tier: there is nothing left to advance into, so a bar would be a lie.
    rows.push(`
      <div class="levelup-row unit-progress-row">
        <span class="unit-progress-key">XP</span>
        <span class="levelup-xp-label">${xp.cur}${xp.maxed ? ` · ${uiText('Max tier', 'Макс. уровень')}` : ''}</span>
      </div>`);
  }

  return rows.join('');
}

export function buildUnitCard(unit, opts = {}) {
  const { buildingLabel = '', compareUnit = null, badge = '', itemSlotHtml = '', extraSlotHtml = '', progress = null, reserveProgress = false } = opts;

  if (!unit) {
    return `
      <div class="unit-card unit-card--building">
        <div class="building-card-icon">⚔</div>
        <div class="building-card-label">${buildingLabel}</div>
      </div>`;
  }

  const descHtml = unit.description
    ? `<p class="unit-slide-desc">${unit.description}</p>`
    : '';

  return `
    <div class="unit-card">
      <div class="unit-main-row">
        ${renderUnitCoreStatsColumn(unit, { compareUnit })}
        ${renderUnitPortrait(unit, { badge })}
        ${renderUnitResistColumn(unit, compareUnit)}
      </div>
      <div class="unit-info">
        ${renderUnitProgressRow(progress, { reserve: reserveProgress })}
        ${descHtml}
        ${renderUnitAbilitiesRow(unit, { itemSlotHtml, extraSlotHtml, compareUnit })}
      </div>
    </div>`;
}

// Click-to-inspect for anything rendered by buildUnitCard: ability/passive icons,
// the armor cell, the core stat column and the resistance column. Lives here so
// every screen that shows a unit card (roster, registration, castle sheets)
// explains the same numbers the same way instead of re-implementing it.
// Returns true when the click was handled.
export function handleUnitInspect(e, open) {
  const abilityBtn = e.target.closest('.ability-icon:not([data-item-slot]):not([data-item-inspect])');
  if (abilityBtn) {
    const def = resolveAbility(abilityBtn.dataset.abilityKey);
    if (!def) return true;
    const parts = buildAbilityModalParts(def, abilityBtn.dataset.abilityType);
    open(parts.title, parts.body, parts.badges);
    return true;
  }

  const armorCell = e.target.closest('[data-armor]');
  if (armorCell) {
    const val = parseInt(armorCell.dataset.armor ?? '0', 10);
    open('Armor', renderModalContent(`Armor: ${val}
Reduces physical damage taken. Each point of armor reduces damage by 1%.`));
    return true;
  }

  const coreStat = e.target.closest('.core-stat');
  if (coreStat) {
    const label = coreStat.querySelector('.core-stat-label')?.textContent?.trim() || '';
    const val   = coreStat.querySelector('.core-stat-val')?.textContent?.trim() || '—';

    // Action gets its own entry: what the action is and what it actually does.
    if (label === 'Action') {
      const info = lookupActionInfo(coreStat.dataset.actionKey, val);
      const title = info ? uiText(info.name.en, info.name.ru) : val;
      const desc  = info
        ? uiText(info.desc.en, info.desc.ru)
        : uiText('The action this unit performs on its turn.',
                 'Действие, которое боец совершает в свой ход.');
      // Read off the CELL, not inferred from the action name: two units sharing
      // an action can carry different range and targets.
      const { targets, range, targetType } = coreStat.dataset;
      const lines = [desc, ''];
      lines.push(`${uiText('Target', 'Цель')}: ${actionTargetSide(coreStat.dataset.actionKey, targetType)}`);
      if (targets != null) lines.push(`${uiText('Targets', 'Целей')}: ${targets}`);
      if (range   != null) lines.push(`${uiText('Range', 'Дальность')}: ${range}`);
      open(title, renderModalContent(lines.join('\n')));
      return true;
    }
    const texts = {
      HP:      `HP: ${val}
Current hit points. Unit is defeated when HP reaches 0.`,
      Init:    `Initiative: ${val}
Determines turn order in combat. Higher acts first.`,
      Power:   `Power: ${val}
Base damage or healing output of the unit's action.`,
      Action:  `Action: ${val}
The type of action this unit performs each turn.`,
      XP:      `Experience: ${val}
Accumulated XP toward next level.`,
      Lv:      `Level: ${val}
The unit's tier. Higher tiers have stronger stats and abilities.`,
      Balance: `Balance: ${val}
Overall power rating, combining stats, resistances and abilities.`,
    };
    open(label, renderModalContent(texts[label] ?? `${label}: ${val}`));
    return true;
  }

  const resistCell = e.target.closest('.resist-cell');
  if (resistCell) {
    if (resistCell.dataset.armor !== undefined) return true;
    const label  = resistCell.getAttribute('title') || '';
    const numVal = parseInt(resistCell.querySelector('.resist-val')?.textContent ?? '0', 10);
    const text = numVal === 0
      ? `${label} Resistance: 0
No modifier to ${label.toLowerCase()} damage taken.`
      : numVal > 0
        ? `${label} Resistance: +${numVal}
Reduces ${label.toLowerCase()} damage taken.`
        : `${label} Resistance: ${numVal}
Increases ${label.toLowerCase()} damage taken.`;
    open(label, renderModalContent(text));
    return true;
  }

  return false;
}

export function renderModalPill(label, modifier) {
  return `<span class="modal-header-pill modal-header-pill--${modifier}">${label}</span>`;
}

export function buildAbilityModalParts(def, type) {
  const typeLabel = type === 'passive' ? uiText('Passive', 'Пассивная') : uiText('Active', 'Активная');
  const badges = `
    ${renderModalPill(typeLabel, type)}
    ${def.rank ? renderModalPill(uiText(`Rank ${def.rank}`, `Ранг ${def.rank}`), 'rank') : ''}
  `;
  const description = buildStatDescription(def, type) || uiText('No details available.', 'Описание отсутствует.');
  // The icon file is keyed off the English id, NOT the display name — the id is
  // the stable identifier and does not change with language.
  const fileKey = def.id ? def.id.replace(/\s+/g, '_').replace(/_\d+$/, '') : '';
  const imgSrc  = fileKey ? assetUrl(`/assets/icons/abilities/${fileKey}.jpg`) : null;
  const name    = abilityName(def);
  const body = `
    <div class="ability-modal-content">
      ${imgSrc ? `<div class="ability-modal-icon"><img src="${imgSrc}" alt="${name}" onerror="this.style.visibility='hidden'"></div>` : ''}
      <div class="ability-modal-desc">${description}</div>
    </div>`;
  return { title: name, badges, body };
}

// One item, rendered exactly the way the Items tab renders it: icon aside with
// rarity and unique flags, stat chips, the granted passive with its description,
// and the tag chips. Lives here so the inspect modal in battle and battle prep
// shows the same card the stash does instead of a plain list of lines.
const ITEM_STAT_CHIP_META = {
  hp:           { icon: '❤', en: 'HP',         ru: 'HP' },
  armor:        { icon: '🛡', en: 'Armor',      ru: 'Броня' },
  action_power: { icon: '⚔', en: 'Power',      ru: 'Сила' },
  initiative:   { icon: '⚡', en: 'Initiative', ru: 'Инициатива' },
};

const ITEM_RARITY_LABELS = {
  common: { en: 'Common', ru: 'Обычный' },
  rare:   { en: 'Rare',   ru: 'Редкий' },
  epic:   { en: 'Epic',   ru: 'Эпический' },
  mythic: { en: 'Mythic', ru: 'Мифический' },
};

function itemStatChip(key, val) {
  const sign = val >= 0 ? '+' : '';
  const cls  = val >= 0 ? 'stat-chip--pos' : 'stat-chip--neg';

  const resistMatch = key.match(/^(air|fire|nature|cold|life|death)_resist$/);
  if (resistMatch) {
    const r     = resistMatch[1];
    const rl    = RESIST_LABELS[r];
    const label = `${rl ? uiText(rl.en, rl.ru) : cap(r)} ${uiText('Resist', 'сопр.')}`;
    return `<span class="stat-chip ${cls}" title="${label} ${sign}${val}">
              <span class="stat-chip-icon">${RESIST_ICONS[r]?.icon ?? '◆'}</span>${sign}${val}
            </span>`;
  }

  const meta  = ITEM_STAT_CHIP_META[key];
  const label = meta ? uiText(meta.en, meta.ru) : cap(key);
  return `<span class="stat-chip ${cls}" title="${label} ${sign}${val}">
            <span class="stat-chip-icon">${meta?.icon ?? '◆'}</span>${sign}${val}
          </span>`;
}

export function buildItemCard(item, player) {
  const stats  = item.item_stats || item || {};
  const iconId = stats.icon || stats.key || 'item';
  const rarity = itemRarity(item);
  const name   = itemName(item, player) || item.item_name || 'Item';
  const chips  = Object.entries(stats.stat_mods || {}).map(([k, v]) => itemStatChip(k, v)).join('');
  const rl     = ITEM_RARITY_LABELS[rarity];

  const passiveDef  = stats.passive ? resolveAbility(stats.passive) : null;
  const passiveDesc = passiveDef ? buildStatDescription(passiveDef, 'passive') : '';
  const passiveHtml = passiveDef
    ? `<div class="item-passive item-passive--static">
         <span class="item-passive-icon">✦</span>${abilityName(passiveDef)}
       </div>
       ${passiveDesc ? `<div class="item-modal-passive-desc">${escapeHtml(passiveDesc)}</div>` : ''}`
    : '';

  const tagsHtml = [
    stats.tag_required ? `<span class="item-card-tag">${uiText('Requires', 'Требует')}: ${stats.tag_required}</span>` : '',
    stats.adds_tag     ? `<span class="item-card-tag item-card-tag--adds">${uiText('Grants tag', 'Даёт метку')}: ${stats.adds_tag}</span>` : '',
    stats.removes_tag  ? `<span class="item-card-tag item-card-tag--removes">${uiText('Strips tag', 'Снимает метку')}: ${tagListLabel(stats.removes_tag)}</span>` : '',
    stats.faction      ? `<span class="item-card-tag">${uiText('Faction', 'Фракция')}: ${cap(String(stats.faction).replace(/_/g, ' '))}</span>` : '',
  ].join('');

  return `
    <div class="item-card item-card--rarity-${rarity} item-card--modal">
      <div class="item-card-body">
        <div class="item-card-aside">
          <div class="item-card-icon">
            <img src="${assetUrl(`/assets/icons/items/${iconId}.png`)}" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
            <span class="item-card-icon-fallback" style="display:none;">⚙</span>
          </div>
          <div class="item-card-rarity item-card-rarity--${rarity}">${rl ? uiText(rl.en, rl.ru) : cap(rarity)}</div>
          ${stats.unique ? `<div class="item-card-unique">${uiText('Unique', 'Уникальный')}</div>` : ''}
        </div>
        <div class="item-card-main">
          <div class="item-card-name">${name}</div>
          <div class="item-card-stats">${chips}</div>
          ${passiveHtml}
          <div class="item-card-tags">${tagsHtml}</div>
        </div>
      </div>
    </div>`;
}

export function buildItemModalParts(item, player) {
  if (!item) return { title: uiText('Item', 'Предмет'), badges: '', body: renderModalContent(uiText('No item equipped.', 'Предмет не надет.')) };
  return {
    title:  itemName(item, player) || item.item_name || 'Item',
    badges: renderModalPill(uiText('Item', 'Предмет'), 'item'),
    body:   buildItemCard(item, player),
  };
}

// ACTION_INFO is keyed inconsistently -- 'holy shock' with a space, but
// 'pale_embrace' with an underscore -- while the old lookup always searched the
// space form built from the DISPLAY label. 'pale_embrace' and 'song_of_ash'
// therefore never matched and silently fell back to the generic description.
//
// Normalising both sides fixes those two and makes the table's key style stop
// mattering. Prefer the action ID from the cell over the display label: the
// label is translated and re-cased for reading, the id is the actual key.
const _ACTION_INFO_NORM = Object.fromEntries(
  Object.entries(ACTION_INFO).map(([k, v]) => [k.replace(/_/g, ' ').trim().toLowerCase(), v])
);
export function lookupActionInfo(...keys) {
  for (const k of keys) {
    if (!k) continue;
    const hit = _ACTION_INFO_NORM[String(k).replace(/_/g, ' ').trim().toLowerCase()];
    if (hit) return hit;
  }
  return null;
}

// Which side an action may pick. The data says 'enemy' or 'ally', but Holy
// Shock reaches BOTH -- getValidTargets in utils/battle-engine.js has its own
// branch for it -- so the action id decides, not target_type.
const DUAL_TARGET_ACTIONS = new Set(['holy_shock', 'holy shock']);
export function actionTargetSide(actionKey, targetType) {
  if (DUAL_TARGET_ACTIONS.has(String(actionKey ?? '').toLowerCase())) {
    return uiText('Any', 'Любая');
  }
  return targetType === 'ally'
    ? uiText('Ally', 'Союзник')
    : uiText('Enemy', 'Враг');
}

export function renderModalContent(text) {
  return `<div style="white-space:pre-wrap;line-height:1.5;">${escapeHtml(text)}</div>`;
}

let _sheetEl = null;

function ensureSheet() {
  if (_sheetEl) return _sheetEl;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay hidden';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title-text"></span>
        <div class="modal-header-badges"></div>
        <button class="modal-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="modal-body"></div>
    </div>
  `;

  overlay.querySelector('.modal-close-btn').addEventListener('click', closeSheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSheet(); });

  document.body.appendChild(overlay);
  _sheetEl = overlay;
  return overlay;
}

export function openSheet(title, bodyHtml, badgesHtml = '') {
  const overlay = ensureSheet();
  overlay.querySelector('.modal-title-text').textContent = title;
  overlay.querySelector('.modal-header-badges').innerHTML = badgesHtml;
  overlay.querySelector('.modal-body').innerHTML = bodyHtml;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// Retitle a sheet that is already open. Sheets are opened before their content
// has loaded, so a sheet whose title IS its content (the errand sheet is named
// after the errand) has to set it once it knows.
export function setSheetTitle(title) {
  const el = _sheetEl?.querySelector('.modal-title-text');
  if (el) el.textContent = title;
}

// Anything that decorates the screen while the sheet is open (the roster's
// trophy bar) registers here. The sheet is hidden by toggling a class rather
// than being removed, so watching the DOM for its removal never fires.
const _sheetCloseHandlers = new Set();
export function onSheetClose(fn) {
  _sheetCloseHandlers.add(fn);
  return () => _sheetCloseHandlers.delete(fn);
}

export function closeSheet() {
  if (!_sheetEl) return;
  _sheetEl.classList.add('hidden');
  document.body.style.overflow = '';
  for (const fn of [..._sheetCloseHandlers]) {
    _sheetCloseHandlers.delete(fn);
    try { fn(); } catch {}
  }
}

export function getSheetBody() {
  return ensureSheet().querySelector('.modal-body');
}

let _subSheetEl = null;

function ensureSubSheet() {
  if (_subSheetEl) return _subSheetEl;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay modal-overlay--sub hidden';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title-text"></span>
        <div class="modal-header-badges"></div>
        <button class="modal-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="modal-body"></div>
    </div>
  `;

  overlay.querySelector('.modal-close-btn').addEventListener('click', closeSubSheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSubSheet(); });

  document.body.appendChild(overlay);
  _subSheetEl = overlay;
  return overlay;
}

export function openSubSheet(title, bodyHtml, badgesHtml = '') {
  const overlay = ensureSubSheet();
  overlay.querySelector('.modal-title-text').textContent = title;
  overlay.querySelector('.modal-header-badges').innerHTML = badgesHtml;
  overlay.querySelector('.modal-body').innerHTML = bodyHtml;
  overlay.classList.remove('hidden');
}

export function closeSubSheet() {
  if (!_subSheetEl) return;
  _subSheetEl.classList.add('hidden');
}

export function getSubSheetBody() {
  return ensureSubSheet().querySelector('.modal-body');
}

export function mountModal(root) {
  return {
    open:  (title, bodyHtml) => openSheet(title, bodyHtml),
    close: () => closeSheet(),
  };
}

// Fetches through a fixed-size pool rather than starting every request at once.
// The old version was Promise.all over the whole list, which handed the browser
// ~486 images in one go: it can only open a handful of connections per host, so
// the rest queue anyway, but the progress bar jumps around and slow images can
// stall behind a burst. A pool keeps the pipe full without the pile-up.
const PRELOAD_CONCURRENCY = 8;

export function preloadAssets(urls, onProgress, concurrency = PRELOAD_CONCURRENCY) {
  const unique = [...new Set(urls)].filter(Boolean);
  const total  = unique.length;
  if (total === 0) { onProgress?.(1); return Promise.resolve(); }

  let loaded = 0;
  let next   = 0;

  const loadOne = url => new Promise(resolve => {
    const img = new Image();
    // Resolve on error too: a missing asset must not hold the loading screen
    // hostage — it shows as a gap in the UI, which is the honest outcome.
    const done = () => { loaded++; onProgress?.(loaded / total); resolve(); };
    img.onload = done;
    img.onerror = done;
    img.src = url;
  });

  const worker = async () => {
    while (next < total) {
      const i = next++;
      await loadOne(unique[i]);
    }
  };

  return Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, worker)
  );
}
// Swipe-to-scroll for the portrait tracks. .portrait-card holds touch-action:
// none (it must — pan-x makes iOS Safari fire pointercancel and kills
// drag-to-grid), so a finger starting on a card gives the browser no chance to
// pan the strip. touchmove still arrives, so the scroll is done by hand here.
//
// A swipe swallows the tap that ends it, otherwise letting go would also pick
// whichever portrait sits under the finger.
const SWIPE_THRESHOLD = 8;

export function enableTrackSwipe(wrap) {
  if (!wrap || wrap.dataset.swipeBound) return;
  wrap.dataset.swipeBound = '1';

  let startX = 0, startY = 0, startLeft = 0;
  let swiping = false, resolved = false;

  wrap.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    startX    = e.touches[0].clientX;
    startY    = e.touches[0].clientY;
    startLeft = wrap.scrollLeft;
    swiping   = false;
    // Nothing to scroll, and a vertical drag belongs to the page behind us.
    resolved  = wrap.scrollWidth - wrap.clientWidth <= 1;
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!swiping) {
      if (resolved) return;
      if (Math.abs(dy) >= SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) { resolved = true; return; }
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      swiping = true;
    }
    e.preventDefault();
    wrap.scrollLeft = startLeft - dx;
  }, { passive: false });

  // Time-boxed rather than a one-shot listener: a swipe does not always end in
  // a click, and an unspent guard would eat the player's next real tap.
  let suppressUntil = 0;

  wrap.addEventListener('touchend', () => {
    if (!swiping) return;
    swiping = false;
    suppressUntil = Date.now() + 400;
  });

  // Capture, so it lands before any card's own handler.
  wrap.addEventListener('click', e => {
    if (Date.now() > suppressUntil) return;
    suppressUntil = 0;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}
// ── Rewarded-ad overlay ─────────────────────────────────────────────────────
// Shared by every ad-gated feature: divine favor in the castle, and rerolling
// the errand offer. Lived in castle.js while there was one caller; a second one
// would have meant two copies of a countdown that has to agree with the server's
// own timer, and the day they drift is the day claims start getting rejected as
// "ad not finished".
//
// Resolves TRUE if the view ran to completion, FALSE if the player backed out.
// A cancelled view simply leaves the server's token unclaimed — nothing to undo.
//
// `labels` supplies the copy so this file stays language-agnostic:
//   { badge, placeholder, title, cancel }
export function playAdPlaceholder(seconds, labels = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'favor-overlay';
    overlay.innerHTML = `
      <div class="favor-modal">
        <div class="favor-modal-ad">
          <span class="favor-modal-adbadge">${labels.badge ?? 'Ad'}</span>
          <span class="favor-modal-adtext">${labels.placeholder ?? ''}</span>
        </div>
        <div class="favor-modal-title">${labels.title ?? ''}</div>
        <div class="favor-modal-bar"><div class="favor-modal-fill"></div></div>
        <div class="favor-modal-count">${seconds}</div>
        <button class="favor-modal-cancel">${labels.cancel ?? 'Cancel'}</button>
      </div>`;
    document.body.appendChild(overlay);

    const fill  = overlay.querySelector('.favor-modal-fill');
    const count = overlay.querySelector('.favor-modal-count');
    const endAt = Date.now() + seconds * 1000;

    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      clearInterval(timer);
      overlay.remove();
      resolve(ok);
    };

    // Driven off wall-clock rather than a tick count, so a backgrounded tab
    // (which throttles intervals) doesn't leave the bar stuck behind the
    // server's own timer.
    const timer = setInterval(() => {
      const leftMs = endAt - Date.now();
      const left   = Math.max(0, Math.ceil(leftMs / 1000));
      count.textContent = left;
      fill.style.width  = `${Math.min(100, 100 - (leftMs / (seconds * 1000)) * 100)}%`;
      if (leftMs <= 0) finish(true);
    }, 100);

    overlay.querySelector('.favor-modal-cancel').addEventListener('click', () => finish(false));
  });
}