// The day's nudges. Build-time constants read from BOTH sides —
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
  // `min_hero_tier`: the task is part of the day only once the player's hero has
  // reached that tier. Below it the task is neither shown nor needed to claim.
  {
    id:     'colossus',
    target: 1,
    min_hero_tier: 2,
    title:  { en: 'Fight the Colossus',         ru: 'Сразитесь с Колоссом' },
    desc:   { en: 'One attempt on your faction’s weekly boss. Any damage counts.',
              ru: 'Одна попытка против еженедельного босса вашей фракции. Засчитывается любой урон.' },
  },
  {
    id:     'pvp',
    target: 1,
    min_hero_tier: 3,
    title:  { en: 'Fight a quick match',        ru: 'Проведите быстрый бой' },
    desc:   { en: 'Any unranked duel, against a player or a bot. Win or lose.',
              ru: 'Любая нерейтинговая дуэль — с игроком или ботом. Победа или поражение.' },
  },
];

// The tasks that make up the day for a hero of `heroTier`.
function dailyTasksForTier(heroTier = 1) {
  return DAILY_TASKS.filter(t => (t.min_hero_tier ?? 1) <= heroTier);
}

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
    // Drawn as art when the screen can (see rewardIconHtml in public/daily.js);
    // `icon` stays as the fallback.
    art:   'assets/icons/ui/tome_of_experience.png',
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
  {
    id:    'valor',
    icon:  '⚔',
    label: { en: '25 Valor', ru: '25 Доблести' },
    // The engraving currency, otherwise earned only from the Colossus.
    resources: { Valor: 25 },
    // Gold and crystals are seeded at registration, so a missing row means a
    // broken account and the claim skips it. Valor is not seeded: a player who
    // has never fought the Colossus has no row, and skipping would pay nothing.
    upsert: true,
  },
  {
    id:    'supplies',
    icon:  '\u{1F9FA}',
    label: { en: '5 Supplies', ru: '5 припасов' },
    // The embark gate's currency. The row is named per faction (SUPPLY_ITEMS in
    // data/buildings.js) and carries its own item_type, so only the amount is
    // stated here and /daily/claim resolves the rest. Deliberately uncapped: 5
    // on top of 13/15 leaves 18/15, and the refill cron only ever adds while a
    // pool is under its ceiling, so the overflow sits there until it is spent.
    supplies: 5,
  },
];

const DAILY_TASKS_BY_ID   = Object.fromEntries(DAILY_TASKS.map(t => [t.id, t]));
const DAILY_REWARDS_BY_ID = Object.fromEntries(DAILY_REWARDS.map(r => [r.id, r]));

export { DAILY_TASKS, DAILY_REWARDS, DAILY_TASKS_BY_ID, DAILY_REWARDS_BY_ID, dailyTasksForTier };
if (typeof module !== 'undefined') {
  module.exports = { DAILY_TASKS, DAILY_REWARDS, DAILY_TASKS_BY_ID, DAILY_REWARDS_BY_ID, dailyTasksForTier };
}
