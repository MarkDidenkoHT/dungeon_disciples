// The day's three nudges. Build-time constants read from BOTH sides —
// `require`d by routes/index.js and imported as an ES module by public/daily.js
// — so the server and the sheet can never disagree about what is being asked or
// what it pays.
//
// The day rolls over at the player's LOCAL midnight, the same boundary the ad
// allowance already uses (playerLocalDate in routes/index.js). Progress is kept
// in players.daily_tasks; see dailyRecordFor there for the record's shape.

const DAILY_TASKS = [
  {
    id:     'battles',
    target: 3,
    title:  { en: 'Fight 3 battles',            ru: 'Проведите 3 боя' },
    desc:   { en: 'Win or lose — every finished battle counts.',
              ru: 'Победа или поражение — засчитывается любой законченный бой.' },
  },
  {
    id:     'errands',
    target: 1,
    title:  { en: 'Send a unit on an errand',   ru: 'Отправьте бойца на поручение' },
    desc:   { en: 'Any errand from the Messenger\u2019s Post.',
              ru: '\u041B\u044E\u0431\u043E\u0435 \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u0435 \u0438\u0437 \u041F\u043E\u0447\u0442\u043E\u0432\u043E\u0433\u043E \u0434\u0432\u043E\u0440\u0430.' },
  },
  {
    id:     'spells',
    target: 1,
    title:  { en: 'Cast a spell at 3+ power',   ru: 'Прочтите заклинание силой 3+' },
    desc:   { en: 'In battle, spend at least 3 power on one cast.',
              ru: 'В бою потратьте на одно заклинание не менее 3 силы.' },
  },
];

// Pick ONE. Deliberately generous while the goal is habit, not balance.
//
// `icon` is the FALLBACK glyph. Gold and crystals have real art and are drawn
// with it (see rewardIconHtml in public/daily.js) — the crystal in the player's
// own faction element — so only the tome, which has no art anywhere in the game
// yet, actually renders the glyph below.
const DAILY_REWARDS = [
  {
    id:    'gold',
    icon:  '\u{1FA99}',
    label: { en: '100 Gold', ru: '100 золота' },
    // { resource item name: amount }, applied against the `resources` table.
    resources: { Gold: 100 },
  },
  {
    id:    'tome',
    icon:  '\u{1F4D6}',
    label: { en: 'Tome of Knowledge', ru: 'Том знаний' },
    // Tokens are their own item_type and may not exist as a row yet, so this is
    // granted with an upsert rather than a patch.
    tokens: { tome_of_knowledge: 1 },
  },
  {
    id:    'crystals',
    icon:  '\u{1F48E}',
    label: { en: '10 of every crystal', ru: 'По 10 кристаллов' },
    resources: {
      Crystals_Life: 10, Crystals_Fire:  10, Crystals_Death: 10,
      Crystals_Nature: 10, Crystals_Frost: 10, Crystals_Air:  10,
    },
  },
];

const DAILY_TASKS_BY_ID   = Object.fromEntries(DAILY_TASKS.map(t => [t.id, t]));
const DAILY_REWARDS_BY_ID = Object.fromEntries(DAILY_REWARDS.map(r => [r.id, r]));

export { DAILY_TASKS, DAILY_REWARDS, DAILY_TASKS_BY_ID, DAILY_REWARDS_BY_ID };
if (typeof module !== 'undefined') {
  module.exports = { DAILY_TASKS, DAILY_REWARDS, DAILY_TASKS_BY_ID, DAILY_REWARDS_BY_ID };
}
