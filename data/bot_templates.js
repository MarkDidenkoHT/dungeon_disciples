import { UNITS } from './units.js';
import { ITEM_DEFS, ITEM_DOWNGRADES, applyItemModifiers } from './items.js';
import { SPELLS } from './spells.js';
import { TOURNEY_RULES_BY_ID, RARITY_ORDER } from './tourney.js';
import { getEquipBlock } from './item_rules.js';
import { UNIT_ABILITIES } from './unit_abilities.js';

// Hand-made PvP bot armies: one faction's build, with a version per power band.
// Slots follow embark encounters. Cells:
//   0 1
//   2 3
//   4 5
// Column 0 (cells 0/2/4) is the front line, column 1 (cells 1/3/5) the back.
// A row unit anchors on 0/2/4, a column unit on its top cell.
// `hero: true` marks the hero; `spells` are cast by the boss spell AI.

// Inclusive on both ends. Players below 200 meet band_200 (see botBandFor).
const BOT_BANDS = [
  { id: 'band_200', min: 200, max: 300 },
  { id: 'band_300', min: 301, max: 500 },
  { id: 'band_500', min: 501, max: Infinity },
];

const BOT_FACTIONS = ['empire', 'choir_of_the_cursed', 'grail_of_sorrow'];

const BOT_TEMPLATES = [
  {
    id: 'grail_zombie_vamp',
    faction: 'grail_of_sorrow',
    name: 'Zombie-Vamp Hybrid',
    bands: {
      band_500: [
        { unit: 'gs2111',     cell: 0,  item_id: 'dark_determination' },          
        { unit: 'gs831',     cell: 3,  item_id: 'mothers_gift' },                 
        { unit: 'h_g_2_a41', cell: 4,  item_id: 'gift_of_eternity', hero: true,
          spells: [{ spell_id: 'g_spell_7', power: 3 }, { spell_id: 'g_spell_9', power: 5 }] },
        { unit: 'gs5211',    cell: 1,  item_id: 'shroud_of_the_fallen' },         
        { unit: 'gs3311',     cell: 5, item_id: 'staff_of_thaumaturgy' },                            
      ],
      band_300: [
        { unit: 'gs211',    cell: 0, item_id: 'dark_determination' },
        { unit: 'gs83',    cell: 3, item_id: 'mothers_gift' },
        { unit: 'h_g_2_a3', cell: 4, item_id: 'gift_of_eternity', hero: true,
          spells: [{ spell_id: 'g_spell_7', power: 2 }, { spell_id: 'g_spell_9', power: 4 }] },
        { unit: 'gs5211',   cell: 1, item_id: 'shroud_of_the_fallen' },
      ],
      band_200: [
        { unit: 'gs21',    cell: 0, item_id: 'dark_determination' },
        { unit: 'gs83',    cell: 3, item_id: 'mothers_gift' },
        { unit: 'h_g_2_a2', cell: 4, item_id: 'gift_of_eternity', hero: true,
          spells: [{ spell_id: 'g_spell_7', power: 2 }, { spell_id: 'g_spell_3', power: 3 }] },
      ],
    },
    variants: {
      // Gearless. The authored squad is a hybrid only because its items GRANT
      // the other half's tag: `dark_determination` makes Vampires Zombies and
      // `gift_of_eternity` makes the Zombie hero a Vampire, which is what
      // `horde` and `banquet` count. Stripped, it is a Vampire squad with one
      // Zombie and a `banquet` that sees almost nobody — 5 Zombies down to 2.
      //
      // So this lineup buys both tags NATIVELY, off the Mother's line
      // (Zombie/Vampire on one body) with the Chalice kept for `blood_bond`.
      // The Chalice shares a ROW with a Vampire in every band, because that is
      // what the bond's `front` relation asks for.
      bare_steel: {
        band_500: [
          { unit: 'gs2111', cell: 0 },
          { unit: 'gs8111', cell: 1 },
          { unit: 'gs8311', cell: 3 },
          { unit: 'h_g_2_a41', cell: 4, hero: true,
            spells: [{ spell_id: 'g_spell_7', power: 3 }, { spell_id: 'g_spell_9', power: 5 }] },
          { unit: 'gs8',    cell: 5 },
        ],
        band_300: [
          { unit: 'gs211', cell: 0 },
          { unit: 'gs811', cell: 1 },
          { unit: 'gs83',  cell: 3 },
          { unit: 'h_g_2_a3', cell: 4, hero: true,
            spells: [{ spell_id: 'g_spell_7', power: 2 }, { spell_id: 'g_spell_9', power: 4 }] },
        ],
        // The Communicant's column costs 2 Loyalty; spent on tiles instead it
        // buys a native Vampire/Zombie body AND the Chalice, so the smallest
        // band is still a hybrid rather than a lone hero.
        band_200: [
          { unit: 'gs121', cell: 0 },
          { unit: 'gs83',  cell: 1 },
          { unit: 'gs8',   cell: 3 },
          { unit: 'h_g_2_a2', cell: 4, hero: true,
            spells: [{ spell_id: 'g_spell_7', power: 2 }, { spell_id: 'g_spell_3', power: 3 }] },
        ],
      },
      // Loyalty 3. The Chosen's column costs 2 of the 3, and subtraction dropped
      // it for being the dearest — leaving the Chalice and the Warden, the two
      // cheapest bodies, at 75% of what the cap allows. The column IS the build,
      // so it stays and the Chalice is what goes.
      lean_squad: {
        band_300: [
          { unit: 'gs211',  cell: 0, item_id: 'dark_determination' },
          { unit: 'gs5211', cell: 1, item_id: 'shroud_of_the_fallen' },
          { unit: 'h_g_2_a3', cell: 4, item_id: 'gift_of_eternity', hero: true,
            spells: [{ spell_id: 'g_spell_7', power: 2 }, { spell_id: 'g_spell_9', power: 4 }] },
        ],
      },
      // Gearless AND Loyalty 3. The gearless lineup spends 4 Loyalty, and the
      // cap then trims a tile off it at random among equals — 77% of what the
      // cap allows. Spending the 3 deliberately keeps the Chosen's column and
      // the one body that is natively BOTH Zombie and Vampire.
      'bare_steel+lean_squad': {
        band_300: [
          { unit: 'gs211', cell: 0 },
          { unit: 'gs811', cell: 1 },
          { unit: 'h_g_2_a3', cell: 4, hero: true,
            spells: [{ spell_id: 'g_spell_7', power: 2 }, { spell_id: 'g_spell_9', power: 4 }] },
        ],
      },
    },
  },
  {
    id: 'grail_plague',
    faction: 'grail_of_sorrow',
    name: 'Plague',
    bands: {
      band_500: [
        { unit: 'gs611',     cell: 5, item_id: 'shroud_of_the_fallen' },
        { unit: 'gs1111',     cell: 4, item_id: 'iron_armor' },
        { unit: 'gs831',     cell: 3, item_id: 'dark_determination' },
        { unit: 'h_g_2_a41', cell: 2, item_id: 'gift_of_eternity', hero: true,
          spells: [{ spell_id: 'g_spell_7', power: 3 }, { spell_id: 'g_spell_9', power: 5 }] },
        { unit: 'gs321',     cell: 1, item_id: 'veil_of_discord' },
        { unit: 'gs1111',     cell: 0, item_id: 'might_of_the_pure' },
      ],
    },
    variants: {
      // Gearless. Two of the authored items grant Zombie to bodies that are not
      // one (a Spirit Wraith, a Vampire Vessel), so stripping them takes the
      // Zombie count 6 to 4 and weakens `horde` and `aura_of_decay` on four
      // separate units at once. This lineup is Zombie down to the last slot,
      // which also keeps the Death Lord's `mend flesh` — Zombie-only — spoilt
      // for choice.
      bare_steel: {
        band_500: [
          { unit: 'gs1111', cell: 0 },
          { unit: 'gs321',  cell: 1 },
          { unit: 'h_g_2_a41', cell: 2, hero: true,
            spells: [{ spell_id: 'g_spell_7', power: 3 }, { spell_id: 'g_spell_9', power: 5 }] },
          { unit: 'gs8211', cell: 3 },
          { unit: 'gs1111', cell: 4 },
          { unit: 'gs3311', cell: 5 },
        ],
      },
    },
  },
  {
    id: 'choir_demon_archers',
    faction: 'choir_of_the_cursed',
    name: 'Demon Archers',
    bands: {
      band_500: [
        { unit: 'opb_e41',   cell: 1, item_id: 'ranger_boots' },
        { unit: 'd521',      cell: 5, item_id: 'veil_of_discord' },
        { unit: 'opb_e411',  cell: 3, item_id: 'aldras_patience' },
        { unit: 'h_d_1_a41', cell: 4, item_id: 'burning_fury', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 3 }, { spell_id: 'd_spell_10', power: 5 }] },
        { unit: 'd111',      cell: 0, item_id: 'crystal_shield' },
      ],
      band_300: [
        { unit: 'opb_e41',  cell: 1, item_id: 'ranger_boots' },
        { unit: 'opb_e41',  cell: 3, item_id: 'aldras_patience' },
        { unit: 'h_d_2_a3', cell: 5, item_id: 'veil_of_discord', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 2 }, { spell_id: 'd_spell_10', power: 4 }] },
        { unit: 'd11',      cell: 0, item_id: 'crystal_shield' },
      ],
      band_200: [
        { unit: 'opb_e41',  cell: 1, item_id: 'ranger_boots' },
        { unit: 'h_d_2_a2', cell: 3, item_id: 'veil_of_discord', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 2 }, { spell_id: 'd_spell_7', power: 3 }] },
        { unit: 'd11',      cell: 0, item_id: 'crystal_shield' },
      ],
    },
    variants: {
      // Loyalty 3. The Tormentor's column costs 2, so subtraction dropped it as
      // the dearest body and left two archers and the hero standing in the back
      // column with NOTHING in front of them — archers with nobody to hide
      // behind, at 69% of what the cap allows. One archer goes instead.
      lean_squad: {
        band_300: [
          { unit: 'd11',     cell: 0, item_id: 'crystal_shield' },
          { unit: 'opb_e41', cell: 3, item_id: 'aldras_patience' },
          { unit: 'h_d_2_a3', cell: 5, item_id: 'veil_of_discord', hero: true,
            spells: [{ spell_id: 'd_spell_3', power: 2 }, { spell_id: 'd_spell_10', power: 4 }] },
        ],
      },
    },
  },
  {
    id: 'choir_dual_gargoyles',
    faction: 'choir_of_the_cursed',
    name: 'Dual Gargoyles',
    bands: {
      band_500: [
        { unit: 'd3211',     cell: 0 },
        { unit: 'h_d_2_a41', cell: 3, hero: true,
          spells: [{ spell_id: 'd_spell_5', power: 3 }, { spell_id: 'd_spell_9', power: 5 }] },
        { unit: 'd711',      cell: 2 },
        { unit: 'd3111',     cell: 4 },
      ],
      band_300: [
        { unit: 'd3211',    cell: 0 },
        { unit: 'h_d_2_a3', cell: 3, hero: true,
          spells: [{ spell_id: 'd_spell_5', power: 2 }, { spell_id: 'd_spell_9', power: 4 }] },
        { unit: 'd3111',    cell: 4 },
      ],
    },
    variants: {
      // Loyalty 3. Two gargoyles at 2 Loyalty each is 4, and dropping either
      // leaves a squad of TWO — the cap cannot field this build as written. One
      // gargoyle plus a tile spends the same 3 and puts a third body on the
      // grid, which is both legal and stronger than the half-squad was.
      lean_squad: {
        band_300: [
          { unit: 'd3211', cell: 0 },
          { unit: 'h_d_2_a3', cell: 3, hero: true,
            spells: [{ spell_id: 'd_spell_5', power: 2 }, { spell_id: 'd_spell_9', power: 4 }] },
          { unit: 'd711',  cell: 4 },
        ],
      },
    },
  },
  {
    id: 'empire_holy_construct',
    faction: 'empire',
    name: 'Holy Construct',
    bands: {
      band_500: [
        { unit: 'e621',      cell: 1, item_id: 'crystal_exoskeleton' },
        { unit: 'e3111',     cell: 0, item_id: 'sanctified_bulwark' },
        { unit: 'e71',       cell: 3, item_id: 'codex_aeternum' },
        { unit: 'h_e_3_a41', cell: 5, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 3 }, { spell_id: 'e_spell_9', power: 5 }] },
        { unit: 'e6112',     cell: 4, item_id: 'everliving_stalk' },
      ],
      band_300: [
        { unit: 'e621',     cell: 1, item_id: 'crystal_exoskeleton' },
        { unit: 'e311',     cell: 0, item_id: 'sanctified_bulwark' },
        { unit: 'e71',      cell: 3, item_id: 'codex_aeternum' },
        { unit: 'h_e_3_a3', cell: 5, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 4 }] },
      ],
      band_200: [
        { unit: 'e62',      cell: 1, item_id: 'everliving_stalk' },
        { unit: 'e31',      cell: 0, item_id: 'sanctified_bulwark' },
        { unit: 'h_e_3_a2', cell: 3, item_id: 'lion_signet', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 3 }] },
      ],
    },
    variants: {
      // Gearless. `sanctified_bulwark` is the ONLY Holy in the authored squad,
      // and Holy is what the Engineers' `sanctified_ordnance` counts — in
      // band_200 stripping it left the Rifleman's passive dead outright, the one
      // genuinely broken army the audit found.
      //
      // So Holy comes off the Mithrails line, which is natively Spirit/Holy, and
      // a Construct stays on the field for the Artificer hero to `repair`
      // (Construct-only). band_300 and band_200 spend the big Automaton's 2
      // Loyalty on two tiles instead, which is what makes room for the Holy.
      bare_steel: {
        band_500: [
          { unit: 'e3111', cell: 0 },
          { unit: 'e621',  cell: 1 },
          { unit: 'e7111', cell: 3 },
          { unit: 'e212',  cell: 4 },
          { unit: 'h_e_3_a41', cell: 5, hero: true,
            spells: [{ spell_id: 'e_spell_3', power: 3 }, { spell_id: 'e_spell_9', power: 5 }] },
        ],
        band_300: [
          { unit: 'e6112', cell: 0 },
          { unit: 'e621',  cell: 1 },
          { unit: 'e212',  cell: 2 },
          { unit: 'e711',  cell: 3 },
          { unit: 'h_e_3_a3', cell: 5, hero: true,
            spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 4 }] },
        ],
        band_200: [
          { unit: 'e6112', cell: 0 },
          { unit: 'e62',   cell: 1 },
          { unit: 'e71',   cell: 3 },
          { unit: 'h_e_3_a2', cell: 5, hero: true,
            spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 3 }] },
        ],
      },
      // Loyalty 3. The Automaton's column costs 2 and subtraction dropped it as
      // the dearest body, which left the whole squad in the back column with no
      // front line — and took away the only Construct the Artificer hero can
      // `repair`. It stays; the Devastator is what goes.
      lean_squad: {
        band_300: [
          { unit: 'e311', cell: 0, item_id: 'sanctified_bulwark' },
          { unit: 'e71',  cell: 3, item_id: 'codex_aeternum' },
          { unit: 'h_e_3_a3', cell: 5, item_id: 'might_of_the_pure', hero: true,
            spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 4 }] },
        ],
      },
      // Gearless AND Loyalty 3 — the day both rules land. Neither single lineup
      // survives the other's cut: the gearless one leans on the Golden Lion's
      // column, which the cap then drops, and with it the last Construct the
      // hero could `repair`. So the Construct here is a TILE, cheap enough to
      // keep, and the Holy that `sanctified_ordnance` counts comes off the
      // Mithrails line rather than an item.
      'bare_steel+lean_squad': {
        band_500: [
          { unit: 'e6112', cell: 0 },
          { unit: 'e621',  cell: 1 },
          { unit: 'e7111', cell: 3 },
          { unit: 'h_e_3_a41', cell: 5, hero: true,
            spells: [{ spell_id: 'e_spell_3', power: 3 }, { spell_id: 'e_spell_9', power: 5 }] },
        ],
        band_300: [
          { unit: 'e6112', cell: 0 },
          { unit: 'e621',  cell: 1 },
          { unit: 'e711',  cell: 3 },
          { unit: 'h_e_3_a3', cell: 5, hero: true,
            spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 4 }] },
        ],
      },
      // Nothing above Rare. The downgrade ladder saves every other band, but no
      // Rare in the game grants Holy — and in this band `sanctified_bulwark` on
      // the Automaton is the ONLY Holy, so the Rifleman's `sanctified_ordnance`
      // dies with the swap however cheap the stand-in.
      //
      // The Holy therefore has to be a BODY: Mithrails Light is natively
      // Spirit/Holy. Its slot is paid for by trading the Automaton's column for
      // the Armsmaster, who is Construct enough for the hero to `repair`.
      plain_gear: {
        band_200: [
          { unit: 'e6112', cell: 0, item_id: 'iron_shield' },
          { unit: 'e62',   cell: 1, item_id: 'lion_signet' },
          { unit: 'e71',   cell: 3, item_id: 'codex_aeternum' },
          { unit: 'h_e_3_a2', cell: 5, item_id: 'lion_signet', hero: true,
            spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 3 }] },
        ],
      },
    },
  },
  {
    id: 'empire_mage_college',
    faction: 'empire',
    name: 'Mage College',
    bands: {
      band_500: [
        { unit: 'dm_e111',   cell: 0, item_id: 'forbidden_vow' },
        { unit: 'e4121',     cell: 2, item_id: 'lightbringer' },
        { unit: 'e4111',     cell: 3, item_id: 'dragon_skin' },
        { unit: 'e4111',     cell: 1, item_id: 'fire_staff' },
        { unit: 'e4321',     cell: 4, item_id: 'sanctified_bulwark' },
        { unit: 'h_e_2_a41', cell: 5, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_10', power: 3 }, { spell_id: 'e_spell_9', power: 5 }] },
      ],
      band_300: [
        { unit: 'dm_e111',  cell: 0, item_id: 'forbidden_vow' },
        { unit: 'e412',     cell: 2, item_id: 'lightbringer' },
        { unit: 'e411',     cell: 1, item_id: 'fire_staff' },
        { unit: 'e432',     cell: 4, item_id: 'crystal_shield' },
        { unit: 'h_e_2_a3', cell: 5, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_10', power: 2 }, { spell_id: 'e_spell_9', power: 4 }] },
      ],
      band_200: [
        { unit: 'dm_e11',   cell: 0, item_id: 'iron_sword' },
        { unit: 'e41',      cell: 1, item_id: 'orb_of_fire' },
        { unit: 'e43',      cell: 3, item_id: 'caster_hat' },
        { unit: 'h_e_2_a2', cell: 5, item_id: 'codex_militarum', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 3 }] },
      ],
    },
  },
  {
    id: 'empire_templars',
    faction: 'empire',
    name: 'Templars',
    bands: {
      band_500: [
        { unit: 'e2111',   cell: 0, item_id: 'lightbringer' },
        { unit: 'e2121',   cell: 2, item_id: 'aegis_of_the_first_ward' },
        { unit: 'h_e_1211', cell: 4, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 3 }, { spell_id: 'e_spell_8', power: 5 }] },
        { unit: 'e2211',   cell: 1, item_id: 'travelers_bedroll' },
        { unit: 'e2221',   cell: 3, item_id: 'codex_aeternum' },
        { unit: 'e1311',   cell: 5, item_id: 'knights_oath' },
      ],
      band_300: [
        { unit: 'e211',    cell: 0, item_id: 'lightbringer' },
        { unit: 'e212',    cell: 2, item_id: 'knights_oath' },
        { unit: 'h_e_121', cell: 4, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_8', power: 4 }] },
        { unit: 'e221',    cell: 1, item_id: 'travelers_bedroll' },
        { unit: 'e131',    cell: 3, item_id: 'codex_aeternum' },
      ],
      band_200: [
        { unit: 'e21',     cell: 0, item_id: 'lightbringer' },
        { unit: 'h_e_11',  cell: 2, item_id: 'lion_signet', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_7', power: 3 }] },
        { unit: 'e22',     cell: 1, item_id: 'travelers_bedroll' },
      ],
    },
  },
  {
    id: 'choir_demon_warriors',
    faction: 'choir_of_the_cursed',
    name: 'Demon Warriors',
    bands: {
      band_500: [
        { unit: 'd1111',     cell: 0, item_id: 'crystal_shield' },
        { unit: 'h_d_1_a41', cell: 4, item_id: 'burning_fury', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 3 }, { spell_id: 'd_spell_9', power: 5 }] },
        { unit: 'd1211',     cell: 1, item_id: 'ember_mantle' },
        { unit: 'd2111',     cell: 5, item_id: 'caster_hat' },
      ],
      band_300: [
        { unit: 'd111',     cell: 0, item_id: 'crystal_shield' },
        { unit: 'h_d_1_a3', cell: 4, item_id: 'burning_fury', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 2 }, { spell_id: 'd_spell_9', power: 4 }] },
        { unit: 'd121',     cell: 1, item_id: 'ember_mantle' },
        { unit: 'd211',     cell: 5, item_id: 'caster_hat' },
      ],
      band_200: [
        { unit: 'd11',      cell: 0, item_id: 'iron_armor' },
        { unit: 'h_d_1_a2', cell: 4, item_id: 'burning_fury', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 2 }, { spell_id: 'd_spell_5', power: 3 }] },
        { unit: 'd21',      cell: 1, item_id: 'caster_hat' },
      ],
    },
  },
  {
    id: 'choir_infernal_court',
    faction: 'choir_of_the_cursed',
    name: 'Infernal Court',
    bands: {
      band_500: [
        { unit: 'd7111',     cell: 0, item_id: 'burning_fury' },
        { unit: 'd7111',     cell: 2, item_id: 'dragon_skin' },
        { unit: 'd4111',     cell: 4, item_id: 'crystal_shield' },
        { unit: 'd6111',     cell: 1, item_id: 'court_regalia' },
        { unit: 'h_d_3_a41', cell: 3, item_id: 'burning_tyrant', hero: true,
          spells: [{ spell_id: 'd_spell_7', power: 3 }, { spell_id: 'd_spell_10', power: 5 }] },
        { unit: 'd5211',     cell: 5, item_id: 'ember_mantle' },
      ],
      band_300: [
        { unit: 'd711',     cell: 0, item_id: 'burning_fury' },
        { unit: 'd411',     cell: 2, item_id: 'crystal_shield' },
        { unit: 'd611',     cell: 1, item_id: 'court_regalia' },
        { unit: 'h_d_3_a3', cell: 3, item_id: 'orb_of_fire', hero: true,
          spells: [{ spell_id: 'd_spell_7', power: 2 }, { spell_id: 'd_spell_10', power: 4 }] },
        { unit: 'd521',     cell: 5, item_id: 'ember_mantle' },
      ],
      band_200: [
        { unit: 'd71',      cell: 0, item_id: 'burning_fury' },
        { unit: 'd61',      cell: 1, item_id: 'court_regalia' },
        { unit: 'h_d_3_a2', cell: 3, item_id: 'orb_of_fire', hero: true,
          spells: [{ spell_id: 'd_spell_7', power: 2 }, { spell_id: 'd_spell_3', power: 3 }] },
      ],
    },
  },
  {
    id: 'grail_ghost',
    faction: 'grail_of_sorrow',
    name: 'Grail Ghosts',
    bands: {
      band_500: [
        { unit: 'h_g_3_b41',     cell: 3,  item_id: 'knights_oath', hero: true,
          spells: [{ spell_id: 'g_spell_3', power: 3 }, { spell_id: 'g_spell_10', power: 5 }] },
        { unit: 'gs7111',        cell: 2,  item_id: 'crystal_shield' },                 
        { unit: 'gs7311',        cell: 4,  item_id: 'iron_greaves' }, 
        { unit: 'gs7211',        cell: 0,  item_id: 'caster_hat' },
        { unit: 'gs6211',        cell: 1,  item_id: 'veil_of_discord' },          
        { unit: 'dm_e311',       cell: 5,  item_id: 'ember_mantle' },                            
      ],
      band_300: [
        { unit: 'h_g_3_b3',    cell: 3, item_id: 'knights_oath', hero: true,
          spells: [{ spell_id: 'g_spell_3', power: 2 }, { spell_id: 'g_spell_10', power: 4 }] },
        { unit: 'gs711',       cell: 0, item_id: 'crystal_shield' },
        { unit: 'gs711',       cell: 4, item_id: 'iron_greaves' },
        { unit: 'gs721',       cell: 1, item_id: 'caster_hat' },   
        { unit: 'dm_e311',     cell: 5, item_id: 'ember_mantle' },
      ],
      band_200: [
        { unit: 'h_g_3_b2',    cell: 3, item_id: 'knights_oath', hero: true,
          spells: [{ spell_id: 'g_spell_3', power: 2 }, { spell_id: 'g_spell_5', power: 3 }] },
        { unit: 'gs711',       cell: 2, item_id: 'iron_shield' },
        { unit: 'gs72',        cell: 1, item_id: 'caster_hat' },
        { unit: 'dm_e31',      cell: 5, item_id: 'ember_mantle' },
      ],
    },
  },
];

let _unitIndex = null;
function findBotUnit(id) {
  if (!_unitIndex) {
    _unitIndex = new Map();
    for (const [key, pool] of Object.entries(UNITS)) {
      if (!pool || typeof pool !== 'object' || Array.isArray(pool)) continue;
      const pools = key === 'enemies' ? Object.values(pool) : [pool];
      for (const p of pools) {
        for (const u of Object.values(p || {})) if (u?.id) _unitIndex.set(u.id, u);
      }
    }
  }
  return _unitIndex.get(id) ?? null;
}

function findBotSpell(id) {
  return Object.values(SPELLS).flat().find(s => s.id === id) ?? null;
}

function botBandFor(power) {
  return (BOT_BANDS.find(b => power <= b.max) ?? BOT_BANDS[BOT_BANDS.length - 1]).id;
}

// Any 5 bot battles in a row hold every faction at least once.
const BOT_ROTATION_WINDOW = 5;

// How many of the templates just fought are kept out of the next pick. Two, not
// one: excluding only the last still allowed A, B, A, B all evening, which over a
// five-battle tourney is two opponents, not five.
const BOT_REPEAT_AVOID = 2;

// The template for the next bot battle.
// `recent` is this player's last bot template ids, newest first.
//
// Band: the player's own, else the nearest band that has templates (lower first on a tie).
// Faction: a faction whose last appearance is about to fall out of the window is forced;
// otherwise random. Only factions with a template in the band take part.
// Never the same template twice in a row, unless it is the only one.
// `allow(template, bandId)` narrows the pool before anything else is decided —
// the tourney passes one so a bot cannot field what the player was forbidden to
// bring. A band with nothing allowed is skipped like an empty one.
function pickBotTemplate({ power, recent = [], templates = BOT_TEMPLATES, rng = Math.random, allow = null }) {
  const home = BOT_BANDS.findIndex(b => b.id === botBandFor(power));
  const byDistance = BOT_BANDS
    .map((b, i) => ({ id: b.id, d: Math.abs(i - home), i }))
    .sort((a, b) => a.d - b.d || a.i - b.i);

  let bandId = null;
  let pool = [];
  for (const { id } of byDistance) {
    pool = templates.filter(t => Array.isArray(t.bands?.[id]) && t.bands[id].length);
    if (allow) pool = pool.filter(t => allow(t, id));
    if (pool.length) { bandId = id; break; }
  }
  if (!bandId) return null;

  // Relaxed a step at a time rather than applied once: excluding the last two
  // must never empty the pool, because an empty pool is a player left without an
  // opponent. Two if two can be spared, else one, else whatever there is —
  // and a pool of one template still repeats, which is a content problem
  // (checkBotTemplates) and not something to solve by handing back nothing.
  for (let avoid = BOT_REPEAT_AVOID; avoid >= 1; avoid--) {
    const recently = recent.slice(0, avoid);
    const rest = pool.filter(t => !recently.includes(t.id));
    if (rest.length) { pool = rest; break; }
  }

  // Picks left (this one included) before each faction must appear. Seen at recent[i]
  // leaves 5 - i; a faction missing from the last 5 is overdue and must go now.
  const factionOf = id => templates.find(t => t.id === id)?.faction;
  const history = recent.slice(0, BOT_ROTATION_WINDOW).map(factionOf);
  const factions = [...new Set(pool.map(t => t.faction))];
  const deadline = f => {
    const i = history.indexOf(f);
    return BOT_ROTATION_WINDOW - (i >= 0 ? i : Math.min(recent.length, BOT_ROTATION_WINDOW));
  };
  // Earliest deadline first: if k factions all fall due within k picks, one of them goes now.
  for (let k = 1; k <= factions.length; k++) {
    const due = factions.filter(f => deadline(f) <= k);
    if (due.length >= k) { pool = pool.filter(t => due.includes(t.faction)); break; }
  }

  const template = pool[Math.floor(rng() * pool.length)];
  return { template, bandId };
}

// A template's slots, bent to obey a tourney's squad rules rather than being
// turned away by them.
//
// Filtering whole templates out was the first attempt and it collapsed the pool.
// Every slot in every template carries gear, and most of that gear is Epic or
// better, so `plain_gear` left exactly ONE legal template in each band — the same
// bot every battle of the evening — while `lean_squad` and `bare_steel` left
// bands with NONE, and a player waited out their tourney against an opponent that
// was never going to be offered.
//
// So the two rule kinds that are about what a squad brings are applied to the bot
// instead: gear it may not wear comes off, and units are dropped until it is
// inside the Loyalty cap. That is the same thing the rule does to the player, and
// it keeps every template eligible, which is what lets the rotation below work.
//
// The rules that are about WHICH units may fight at all — a banned tag, a size
// limit — are deliberately not adapted: dropping every Demon from a Choir army
// leaves something that is no longer that army's build. Those still reject a
// template, and there are enough legal ones in each band for them to.
// The item a slot wears once a rarity cap applies, or null if nothing fits.
//
// `item_by_rarity` on the slot wins, read as "wear this when the cap is <key>".
// Otherwise the item's own ladder is walked and the first rung that is both
// under the cap and legal on this unit is taken — an item the unit could never
// equip (data/item_rules.js: a blocked tag, a wrong action) is no substitute,
// it is a bug the player would see as a bot wearing the impossible.
function downgradeFor(slot, rarity) {
  const cap = RARITY_ORDER.indexOf(rarity);
  const legal = id => {
    const def = ITEM_DEFS[id];
    if (!def) return false;
    if (RARITY_ORDER.indexOf(def.rarity ?? 'common') > cap) return false;
    const unit = findBotUnit(slot.unit);
    return unit ? !getEquipBlock(def, unit, UNIT_ABILITIES) : true;
  };

  const named = slot.item_by_rarity?.[rarity];
  if (named) return legal(named) ? named : null;

  for (const id of ITEM_DOWNGRADES[slot.item_id] ?? []) if (legal(id)) return id;
  return null;
}

// A prepared lineup, for the rules that subtraction cannot survive.
//
// Stripping gear is not a stat cut. Items carry `adds_tag` (data/items.js), and
// almost every template leans on one: grail_zombie_vamp is a Zombie-Vamp build
// only because `dark_determination` and `mothers_gift` GRANT Zombie, which is
// what `horde` and `banquet` count. Take the items off and it is no longer that
// build — and a mender whose clause reads Zombie may have nobody left to mend
// (utils/tag-rules.js).
//
// So a template may publish `variants: { <rule id>: { <band id>: [ slots ] } }`:
// a squad hand-built to be legal under that rule with NATIVE tags, rather than
// the authored squad with pieces taken away. The variant replaces the band's
// slots, and the rules are then applied on top of it as usual — a day that rolls
// two of them still gets both enforced.
//
// A key may name ONE rule ('bare_steel') or several joined by '+'
// ('bare_steel+lean_squad'), for the days where answering one rule at a time is
// not enough: a gearless lineup trimmed to Loyalty 3 by plain subtraction can
// lose the very unit the gearless build was rebuilt around, which is how the
// Holy Construct's hero ended up with nothing it could `repair`.
//
// The most specific key whose rules are ALL in force wins, so a combined lineup
// beats either of its halves. VARIANT_PRECEDENCE breaks a tie between keys of
// equal specificity: the stricter rule's lineup must hold, or the looser one
// would only be stripped back down.
const VARIANT_PRECEDENCE = ['bare_steel', 'plain_gear', 'lean_squad', 'tiles_only'];

const variantRules = key => String(key).split('+');

function variantSlotsFor(template, bandId, rules) {
  const ids = new Set((rules || []).map(r => (typeof r === 'string' ? r : r?.id)).filter(Boolean));
  const rank = key => Math.min(...variantRules(key).map(r => {
    const i = VARIANT_PRECEDENCE.indexOf(r);
    return i < 0 ? VARIANT_PRECEDENCE.length : i;
  }));

  const candidates = Object.keys(template?.variants || {})
    .filter(key => variantRules(key).every(r => ids.has(r)))
    .filter(key => {
      const slots = template.variants[key]?.[bandId];
      return Array.isArray(slots) && slots.length;
    })
    .sort((a, b) => variantRules(b).length - variantRules(a).length || rank(a) - rank(b));

  const key = candidates[0];
  return key ? { rule: key, slots: template.variants[key][bandId] } : null;
}

function adaptSlotsToRules(slots, rules) {
  const list = (rules || []).map(r => (typeof r === 'string' ? TOURNEY_RULES_BY_ID[r] : r)).filter(Boolean);
  if (!list.length) return slots;

  let out = slots;
  for (const rule of list) {
    // Gear the rule forbids is simply not worn. It must come off HERE, at the
    // slot, rather than after the army is built: buildBotArmy folds an item's
    // modifiers into the unit's stats, so a unit built with the item and stripped
    // afterwards would keep the stats and lose only the label.
    if (rule.kind === 'no_items') {
      out = out.map(slot => (slot.item_id ? { ...slot, item_id: null } : slot));
    }

    // Gear over the cap is SWAPPED DOWN, not taken off. Nulling it was the
    // bot paying `bare_steel` on a `plain_gear` night — a harsher rule than the
    // one rolled, and harsher than the player pays, since the player simply
    // wears a legal Rare.
    //
    // A slot may name its own ladder in `item_by_rarity` when the global map's
    // pick is wrong for that build; otherwise ITEM_DOWNGRADES decides
    // (data/items.js). Only when nothing legal is left does the item come off.
    if (rule.kind === 'item_rarity_max') {
      const cap = RARITY_ORDER.indexOf(rule.rarity);
      if (cap >= 0) out = out.map(slot => {
        if (!slot.item_id) return slot;
        const rank = RARITY_ORDER.indexOf(ITEM_DEFS[slot.item_id]?.rarity ?? 'common');
        if (rank <= cap) return slot;
        const swap = downgradeFor(slot, rule.rarity);
        return { ...slot, item_id: swap };
      });
    }

    // The hero is free and always stays — an army without one is not a build the
    // AI knows how to play. Everything else is dropped dearest first (a row or
    // column unit frees 2, a tile 1, exactly as loyaltyOf counts them), and the
    // last slot listed first among equals, so the front of the build survives.
    if (rule.kind === 'loyalty_max') {
      const cost = slot => {
        const size = findBotUnit(slot.unit)?.size ?? 'tile';
        return (size === 'row' || size === 'column') ? 2 : 1;
      };
      const paying = out.filter(slot => !slot.hero);
      let used = paying.reduce((n, slot) => n + cost(slot), 0);
      if (used > rule.max) {
        const order = [...paying].reverse().sort((a, b) => cost(b) - cost(a));
        const dropped = new Set();
        for (const slot of order) {
          if (used <= rule.max) break;
          dropped.add(slot);
          used -= cost(slot);
        }
        out = out.filter(slot => !dropped.has(slot));
      }
    }
  }
  return out;
}

// Flat units, the same shape getEncounter returns. `rules` is a tourney's rule
// list when the battle is one of its own, so the bot is built under the same
// restrictions the player queued under.
function buildBotArmy(template, bandId, rules = null) {
  let slots = template?.bands?.[bandId];
  if (!Array.isArray(slots)) return [];
  if (rules?.length) {
    // A prepared lineup first, then the rules on top of it. The adaptation still
    // runs: a variant answers ONE of the day's rules, and the other must still
    // be enforced against it.
    const variant = variantSlotsFor(template, bandId, rules);
    if (variant) slots = variant.slots;
    slots = adaptSlotsToRules(slots, rules);
  }
  return slots
    .map(slot => {
      let unit = findBotUnit(slot.unit);
      if (!unit) return null;
      const itemDef = slot.item_id ? ITEM_DEFS[slot.item_id] : null;
      if (itemDef) unit = applyItemModifiers(unit, itemDef);
      return { ...unit, cell: slot.cell, item_id: slot.item_id || null, is_hero: !!slot.hero, spells: slot.spells || [] };
    })
    .filter(Boolean);
}

// A bot army in the shape the squad checks expect: unit_data per unit, the hero
// flagged, and the worn items keyed the way a roster's are. Lets the tourney run
// its own rule check over a template before offering it as an opponent.
function botArmyAsSquad(template, bandId, rules = null) {
  const army = buildBotArmy(template, bandId, rules);
  const units = army.map((u, i) => ({ id: String(i), _rosterId: String(i), is_hero: !!u.is_hero, unit_data: u }));
  const itemsByRosterId = {};
  army.forEach((u, i) => {
    if (u.item_id) itemsByRosterId[String(i)] = { item_name: u.item_id, item_stats: { key: u.item_id } };
  });
  return { units, itemsByRosterId };
}

function footprint(cell, size) {
  if (size === 'row')    return [cell, cell + 1];
  if (size === 'column') return [cell, cell + 2];
  return [cell];
}

// Everything wrong with one template, as readable lines. Empty means clean.
function checkBotTemplate(template) {
  const problems = [];
  if (!template?.id) problems.push('Template has no id');
  if (!BOT_FACTIONS.includes(template?.faction)) problems.push(`Unknown faction "${template?.faction}"`);
  const bands = Object.entries(template?.bands || {});
  if (!bands.length) problems.push('No bands');

  // A variant is a squad like any other and is held to the same rules — a bad
  // cell or a missing hero in one is invisible until the night it is fielded.
  const variants = [];
  for (const [ruleId, byBand] of Object.entries(template?.variants || {})) {
    for (const r of variantRules(ruleId)) {
      if (!VARIANT_PRECEDENCE.includes(r)) problems.push(`Variant "${ruleId}" names unknown rule "${r}"`);
    }
    for (const [bandId, slots] of Object.entries(byBand || {})) {
      if (!template?.bands?.[bandId]) problems.push(`${ruleId}/${bandId}: variant for a band the template does not field`);
      variants.push([`${ruleId}/${bandId}`, slots]);
    }
  }

  for (const [bandId, slots] of [...bands, ...variants]) {
    const at = msg => problems.push(`${bandId}: ${msg}`);
    if (!BOT_BANDS.some(b => b.id === bandId) && !bandId.includes('/')) { at('unknown band'); continue; }
    if (!Array.isArray(slots) || !slots.length) { at('no slots'); continue; }

    const taken = new Map();
    const heroes = slots.filter(s => s.hero);
    if (heroes.length !== 1) at(`needs exactly one hero, has ${heroes.length}`);
    if (slots.length > 6) at(`${slots.length} slots, the grid holds 6`);

    for (const slot of slots) {
      const def = findBotUnit(slot.unit);
      const label = slot.unit ?? '(no unit)';
      if (!def) { at(`unknown unit "${label}"`); continue; }
      if (slot.item_id && !ITEM_DEFS[slot.item_id]) at(`${label}: unknown item "${slot.item_id}"`);

      const cell = slot.cell;
      const size = def.size ?? 'tile';
      if (!Number.isInteger(cell) || cell < 0 || cell > 5) { at(`${label}: cell ${cell} is off the grid`); continue; }
      if (size === 'row' && cell % 2 !== 0) at(`${label}: row unit must anchor on 0, 2 or 4`);
      if (size === 'column' && cell > 3) at(`${label}: column unit must anchor on 0-3`);
      for (const c of footprint(cell, size)) {
        if (taken.has(c)) at(`${label}: cell ${c} already holds ${taken.get(c)}`);
        else taken.set(c, label);
      }
      // Front line is column 0 (cells 0/2/4). A row unit spans both lines, so it has no wrong one.
      if (size !== 'row') {
        const col = cell % 2;
        if (def.pref_position === 'front' && col === 1) at(`${label}: front-line unit stands in the back line (cell ${cell})`);
        if (def.pref_position === 'back'  && col === 0) at(`${label}: back-line unit stands in the front line (cell ${cell})`);
      }

      const spells = slot.spells || [];
      if (spells.length && !slot.hero) at(`${label}: has spells but is not the hero`);
      if (slot.hero && !spells.length) at(`${label}: hero has no spells yet`);
      if (spells.length > 2) at(`${label}: ${spells.length} spells, aim for 1-2`);
      for (const s of spells) {
        if (!findBotSpell(s.spell_id)) at(`${label}: unknown spell "${s.spell_id}"`);
      }
    }
  }
  return problems;
}

function checkBotTemplates(templates = BOT_TEMPLATES) {
  const seen = new Set();
  const out = {};
  for (const t of templates) {
    const problems = checkBotTemplate(t);
    if (seen.has(t.id)) problems.unshift(`Duplicate template id "${t.id}"`);
    seen.add(t.id);
    out[t.id] = problems;
  }
  return out;
}

export { BOT_BANDS, BOT_FACTIONS, BOT_TEMPLATES, VARIANT_PRECEDENCE, variantSlotsFor, findBotUnit, findBotSpell, botBandFor, pickBotTemplate, buildBotArmy, botArmyAsSquad, checkBotTemplate, checkBotTemplates };
if (typeof module !== 'undefined') module.exports = { BOT_BANDS, BOT_FACTIONS, BOT_TEMPLATES, VARIANT_PRECEDENCE, variantSlotsFor, findBotUnit, findBotSpell, botBandFor, pickBotTemplate, buildBotArmy, botArmyAsSquad, checkBotTemplate, checkBotTemplates };
