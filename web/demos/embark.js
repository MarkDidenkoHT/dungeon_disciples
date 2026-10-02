// The departure board: three regions, ten floors each.
//
// Read-only on purpose — this one is a picture of where you go, not a thing to
// poke at. The cards are the game's: same classes, same art, same blurbs, and
// the floor count comes from the real encounter tables rather than a number
// typed here, so a region that grows a floor grows one here too.
import { REGION_ENCOUNTERS } from '../vendor/data/embark.js';
import { assetUrl } from '../vendor/public/asset_base.js';
import { escapeHtml } from '../vendor/public/utils.js';
import { L, t } from './demo-boot.js';

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

// Floors that end in a boss fight — highlighted red on the level row, as in the
// game.
const BOSS_LEVELS = [3, 6, 10];

const floorsIn = regionId => Object.keys(REGION_ENCOUNTERS[regionId] || {}).length || 1;

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
      ${Array.from({ length: floorsIn(r.id) }, (_, i) => i + 1).map(lv => `
        <span class="embark-level-pip${BOSS_LEVELS.includes(lv) ? ' embark-level-pip--boss' : ''}">${lv}</span>`).join('')}
    </div>
  </div>`).join('');
