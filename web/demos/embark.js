// The departure board: three regions, ten levels each.
//
// The cards are the game's: same classes, same art, same blurbs, and the level
// count comes from the real encounter tables rather than a number typed here,
// so a region that grows a level grows one here too.
//
// Tapping a level opens who stands on it. That is the one thing the board could
// not say on its own — "ten levels, four of them bosses" is a fact about the
// region, not about the fight — and the encounter tables already hold it.
import { REGION_ENCOUNTERS } from '../vendor/data/embark.js';
import { UNITS } from '../vendor/data/units.js';
import { assetUrl } from '../vendor/public/asset_base.js';
import { escapeHtml, unitName, openSheet } from '../vendor/public/utils.js';
import { L, t, player } from './demo-boot.js';

// Copied from the embark screen, where this table is presentation only — the
// labels, the art and the blurb.
const REGIONS = [
  {
    id: 'crimson_basilica',
    label: 'Crimson Basilica',
    label_ru: 'Багровая базилика',
    description: 'A blood-soaked cathedral of the Aggrail faithful — zealous heralds, the devoted, and Sister Aldra, who bleeds for her god.',
    description_ru: 'Залитый кровью собор верных Аграилу — рьяные глашатаи, преданные и Сестра Алдра, что кровоточит во славу своего бога.',
    crystal: 'Life & Fire',
    crystal_ru: 'Жизни и Огня',
  },
  {
    id: 'glittering_abyss',
    label: 'Glittering Abyss',
    label_ru: 'Мерцающая бездна',
    description: 'A frozen vault of living crystal — mending geodes, frost-shard casters, and the Prismatic Colossus that slumbers in the dark.',
    description_ru: 'Ледяная сокровищница живого кристалла — исцеляющие жеоды, заклинатели морозных осколков и Призматический колосс, дремлющий во тьме.',
    crystal: 'Frost & Air',
    crystal_ru: 'Мороза и Воздуха',
  },
  {
    id: 'chamber_of_unrest',
    label: 'Chamber Of Unrest',
    label_ru: 'Чертог беспокойства',
    description: 'Sunken crypts of the restless dead — cursed knights, shambling horrors, and Malgrath the Undying, who has already died once.',
    description_ru: 'Затопленные склепы неупокоенных мёртвых — проклятые рыцари, бредущие ужасы и Малграт Неумирающий, что уже умирал однажды.',
    crystal: 'Death & Nature',
    crystal_ru: 'Смерти и Природы',
  },
];

// Levels that end in a boss fight — highlighted red on the level row, as in the
// game. Levels 3, 6 and 10 end on a fresh tier of the region's boss; level 9
// fields the tier-2 boss a second time.
const BOSS_LEVELS = [3, 6, 9, 10];

const levelsIn = regionId => Object.keys(REGION_ENCOUNTERS[regionId] || {}).length || 1;

const rLabel = r => (L === 'ru' ? r.label_ru : r.label);
const rDesc  = r => (L === 'ru' ? r.description_ru : r.description);
const rCry   = r => (L === 'ru' ? r.crystal_ru : r.crystal);

document.getElementById('regions').innerHTML = REGIONS.map(r => `
  <div class="embark-region-block">
    <div class="embark-card" style="background-image: url('${assetUrl(`/assets/embark/${r.id}.jpg`)}');">
      <div class="embark-card-info">
        <span class="embark-card-label">${escapeHtml(rLabel(r))}</span>
        <span class="embark-card-desc">${escapeHtml(rDesc(r))}</span>
        <span class="embark-card-crystal">${t('Guaranteed', 'Гарантировано')}: ${escapeHtml(rCry(r))}</span>
      </div>
    </div>
    <div class="embark-level-row">
      ${Array.from({ length: levelsIn(r.id) }, (_, i) => i + 1).map(lv => `
        <span class="embark-level-pip${BOSS_LEVELS.includes(lv) ? ' embark-level-pip--boss' : ''}"
              role="button" tabindex="0"
              data-region="${r.id}" data-level="${lv}">${lv}</span>`).join('')}
    </div>
  </div>`).join('');

// ── Who is on a level ───────────────────────────────────────────────────────
// A deliberately partial view. The real battle screen carries initiative order,
// resistances, items, spells and a live health bar on every cell; none of that
// is decidable from a standing formation, and all of it would bury the one
// thing this demo is for — that an encounter is a SHAPE. So the sheet shows the
// shape and nothing else: who, how much health, and which of the six cells they
// are standing in.
//
// The cells are the game's own numbering, front row first:
//
//     0 1
//     2 3
//     4 5
//
// which is why the grid is filled by index rather than by iterating the enemy
// list — the list is in whatever order the table was written, and the gaps are
// as much a part of the encounter as the units. A level that fields two is read
// at a glance against one that fields six.
const CELLS = 6;

// `enemy.key` is "region.unit_key"; the units themselves live under
// UNITS.enemies, filed by the same region id.
function enemyUnit(key) {
  const [region, unitKey] = String(key).split('.');
  return UNITS.enemies?.[region]?.[unitKey] || null;
}

// Filed under the unit's id, the same portraits the castle grid uses.
const portraitUrl = id => assetUrl(`/assets/character_portraits/p_${id}.png`);

// Not every unit is one cell. The Glittering Abyss alone fields thirteen that
// are not: Chillrock and Rimewarden take a whole ROW, Cryodrox a whole COLUMN.
// Drawing them as a single square was a lie about the board — a row unit holds
// the entire front line on its own, and that is the whole shape of the fight.
//
// Same rule the battle engine uses (litanyCellFootprint in utils/battle-engine):
//
//   tile    one cell.
//   row     both columns of that row.
//   column  the cell and the one BELOW it, so the anchor is the TOP of the two.
//
const CELL_COLS = 2;
function footprint(cell, size) {
  if (size === 'row') {
    const top = Math.floor(cell / CELL_COLS) * CELL_COLS;
    return [top, top + 1];
  }
  if (size === 'column') return [cell, cell + CELL_COLS];
  return [cell];
}

// Explicit placement rather than auto-flow: once one unit spans two columns and
// another spans two rows, the grid's own packing starts shuffling the tiles
// around them and the formation stops matching the cell numbers.
function placement(cell, size) {
  const row = Math.floor(cell / CELL_COLS) + 1;
  const col = (cell % CELL_COLS) + 1;
  if (size === 'row')    return `grid-column:1/span 2;grid-row:${row};`;
  if (size === 'column') return `grid-column:${col};grid-row:${row}/span 2;`;
  return `grid-column:${col};grid-row:${row};`;
}

function cellHtml(enemy, cell) {
  if (!enemy) return `<div class="enc-cell enc-cell--empty" style="${placement(cell, 'tile')}"></div>`;

  const unit = enemyUnit(enemy.key);
  if (!unit) return `<div class="enc-cell enc-cell--empty" style="${placement(cell, 'tile')}"></div>`;

  // The encounter entry, not the unit, is what marks a boss: a boss is the one
  // carrying `spells` into the fight, which is also what makes level 9 a boss
  // level; the unit itself is an ordinary row in the table.
  const boss = Boolean(enemy.spells);
  const size = unit.size || 'tile';
  const name = escapeHtml(unitName(unit, player));
  const span = size === 'tile' ? '' : ` enc-cell--${size}`;

  return `
    <div class="enc-cell${span}${boss ? ' enc-cell--boss' : ''}" style="${placement(cell, size)}">
      <img class="enc-portrait" src="${portraitUrl(unit.id)}" alt=""
           loading="lazy" onerror="this.remove()">
      <span class="enc-hp">${unit.hp}&#9829;</span>
      <span class="enc-name">${name}</span>
    </div>`;
}

function openLevel(regionId, level) {
  const region  = REGIONS.find(r => r.id === regionId);
  const encounter = REGION_ENCOUNTERS[regionId]?.[`level_${level}`];
  if (!region || !encounter) return;

  // One pass over the enemy list into a six-slot array, so an unoccupied cell
  // stays unoccupied instead of the units closing up behind it. A two-cell unit
  // is drawn once, at its anchor; the cell its body covers is marked taken so
  // nothing is drawn under it and no empty box is drawn over it.
  const grid  = Array(CELLS).fill(null);
  const taken = new Set();
  for (const e of encounter.enemies || []) {
    if (!(e.cell >= 0 && e.cell < CELLS)) continue;
    const unit = enemyUnit(e.key);
    grid[e.cell] = e;
    for (const c of footprint(e.cell, unit?.size || 'tile')) {
      if (c !== e.cell && c < CELLS) taken.add(c);
    }
  }
  const cells = grid
    .map((e, i) => (taken.has(i) ? '' : cellHtml(e, i)))
    .join('');
  const occupied = grid.filter(Boolean).length + taken.size;

  const title = `${rLabel(region)} — ${t('Level', 'Уровень')} ${level}`;
  // Its own class rather than the level pip's: a pip is a fixed 28px square
  // sized for a one- or two-digit number, and a word does not fit in one.
  const badge = BOSS_LEVELS.includes(level)
    ? `<span class="enc-boss-badge">${t('Boss', 'Босс')}</span>`
    : '';

  openSheet(title, `
    <div class="enc-legend">
      <span>${t('Front row', 'Передний ряд')}</span>
      <span>${occupied} / ${CELLS}</span>
    </div>
    <div class="enc-grid">${cells}</div>
    <div class="enc-legend"><span>${t('Back row', 'Задний ряд')}</span></div>
    <div class="demo-note">${t(
      'Melee units only reach the front row. Ranged units reach anyone. The same enemies stand in the same cells every time you come back to this level.',
      'Ближний бой достаёт только передний ряд, дальний — любого. Эти же враги стоят в этих же клетках каждый раз, когда вы приходите на этот уровень.')}</div>`,
    badge);
}

document.getElementById('regions').addEventListener('click', e => {
  const pip = e.target.closest('.embark-level-pip');
  if (pip) openLevel(pip.dataset.region, Number(pip.dataset.level));
});

// The pips are spans acting as buttons, so they need the keyboard behaviour a
// button would have given them for free.
document.getElementById('regions').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const pip = e.target.closest('.embark-level-pip');
  if (!pip) return;
  e.preventDefault();
  openLevel(pip.dataset.region, Number(pip.dataset.level));
});
