// ── Errands ─────────────────────────────────────────────────────────────────
// A daily solo task for ONE non-hero unit. The unit leaves the roster for the
// errand's duration and comes back with the reward; there is no failure roll and
// no outcome to survive. The whole cost is the absence — a unit on an errand
// cannot embark, so the player trades a day of that unit for what it brings.
//
// WHY THE REQUIREMENTS ARE GROUPS
// An errand asks for a KIND of soldier ("someone who can hold a line"), not one
// exact passive. Written per-passive this file would need ~172 entries — 61 base
// passives across three factions — most of them near-duplicate flavour. Grouping
// gets every passive covered at least twice by ~12 errands a faction, each of
// which can actually be written properly. See scripts checking coverage.
//
// COMPLETABILITY
// Nothing here guarantees an errand is offerable. That is enforced at SELECTION
// time (see pickErrandFor): the server filters to errands some free unit really
// satisfies, so a player is never shown a task their roster cannot do. That also
// means the numbers below can be tuned freely — a threshold that is too high
// simply stops being offered instead of becoming a dead end.
//
// THRONE SCALES DIFFICULTY
//   throne 1 -> rank 1, throne 2 -> rank 2, throne 3+ -> rank 3
// A required passive rank is clamped to the highest rank that passive actually
// HAS (only 41 of 61 have more than one), or a throne-3 player would be asked
// for "Renew 3", which does not exist and never would be offered.
const THRONE_TIER = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 3 };

// Stat thresholds and rewards both grow with the tier. Requirements are checked
// against the real roster before an errand is offered, so growth can never
// produce something unachievable — it just narrows who qualifies.
const TIER_STAT_MULT   = { 1: 1,   2: 1.35, 3: 1.7 };
const TIER_REWARD_MULT = { 1: 1,   2: 1.6,  3: 2.4 };

// ── Definition shape ────────────────────────────────────────────────────────
//   id            unique key, referenced by roster.errand.errand_id
//   faction       which faction may be offered it
//   hours         how long the unit is away
//   requires      passive_any  one of these base passives (rank scales by throne)
//                 action_any   the unit's action must be one of these
//                 stat         minimum stats, scaled by TIER_STAT_MULT
//   reward        xp_self      XP to the unit that went
//                 xp_roster    a POOL of XP split between everyone left at home,
//                              exactly as a battle splits its XP between the
//                              units that fought (see /battle/reward). Paying it
//                              per-unit instead made a five-unit roster earn
//                              more from one errand than from a whole battle.
//                 heal_pct     % of max HP the unit returns healed by
//                 resources    flat resource grant, scaled by TIER_REWARD_MULT
//
// SCALE — what these numbers are measured against:
//   one unit's share of a battle   10 XP (level 1) to 26 XP (level 6)
//   a level-6 battle               40 gold
//   a tier-1 dwelling              40 gold + 20 faction crystal
//   XP to advance a tier-1 unit    50-75      a tier-2 unit  300-360
// An errand is a no-risk daily costing one unit's day, so it pays about one
// battle share — not four, which is what the first pass at these numbers did.
const ERRANDS = [
  // ── EMPIRE ────────────────────────────────────────────────────────────────
  {
    id: 'emp_gate_watch', faction: 'empire', hours: 8,
    title: { en: 'Watch on the Low Gate',        ru: 'Стража у Нижних врат' },
    desc:  { en: 'The low gate has stood unmanned since the levy marched. Stand it for a day and the quarter sleeps.',
             ru: 'Нижние врата пусты с тех пор, как ополчение ушло. Постойте там день — и квартал будет спать спокойно.' },
    requires: { passive_any: ['protector', 'fortify', 'unbreakable', 'aegis', 'iron_will'], stat: { armor: 18 } },
    reward: { xp_self: 10, resources: { Gold: 30 } },
  },
  {
    id: 'emp_shield_wall', faction: 'empire', hours: 12,
    title: { en: 'Drill the Levy',               ru: 'Учения ополчения' },
    desc:  { en: 'Farmhands with spears. Teach them where to put the shield and they may live through the season.',
             ru: 'Крестьяне с копьями. Научите их держать щит — и они переживут этот сезон.' },
    requires: { passive_any: ['protector', 'fortify', 'unbreakable', 'aegis', 'iron_will'] },
    reward: { xp_self: 6, xp_roster: 18 },
  },
  {
    id: 'emp_apothecary', faction: 'empire', hours: 8,
    title: { en: 'The Apothecary\'s Hands',      ru: 'Руки аптекаря' },
    desc:  { en: 'The apothecary has more wounded than hands. Yours will do.',
             ru: 'У аптекаря раненых больше, чем рук. Ваши подойдут.' },
    requires: { passive_any: ['field_medic', 'renew', 'mithrails_light', 'beacon_of_hope', 'light_of_dawn', 'radiance'],
                action_any: ['heal', 'holy_shock'], stat: { action_power: 10 } },
    reward: { xp_self: 10, heal_pct: 40, resources: { Crystals_Life: 8 } },
  },
  {
    id: 'emp_vigil', faction: 'empire', hours: 10,
    title: { en: 'Vigil for the Dying',          ru: 'Бдение над умирающими' },
    desc:  { en: 'Sit the night with those who will not see morning. It is not healing. It is not nothing.',
             ru: 'Просидите ночь с теми, кто не увидит утра. Это не исцеление. Но и не пустое.' },
    requires: { passive_any: ['field_medic', 'renew', 'mithrails_light', 'beacon_of_hope', 'light_of_dawn', 'radiance'] },
    reward: { xp_self: 10, xp_roster: 8, heal_pct: 25 },
  },
  {
    id: 'emp_traitor_hunt', faction: 'empire', hours: 10,
    title: { en: 'Hunt a Traitor',               ru: 'Охота на предателя' },
    desc:  { en: 'A quartermaster sold the road schedules. He runs fast, and he knows the alleys.',
             ru: 'Интендант продал расписание обозов. Бегает он быстро и знает все переулки.' },
    requires: { passive_any: ['pierce', 'impale', 'shatter', 'execute', 'chain'], stat: { initiative: 45 } },
    reward: { xp_self: 14, resources: { Gold: 35 } },
  },
  {
    id: 'emp_proving', faction: 'empire', hours: 6,
    title: { en: 'The Proving Yard',             ru: 'Двор испытаний' },
    desc:  { en: 'Recruits need something to fail against. Be that thing, gently.',
             ru: 'Новобранцам нужно, обо что обломаться. Станьте этим — но помягче.' },
    requires: { passive_any: ['pierce', 'impale', 'shatter', 'execute', 'chain'] },
    reward: { xp_self: 6, xp_roster: 14 },
  },
  {
    id: 'emp_ward_stones', faction: 'empire', hours: 12,
    title: { en: 'Re-cut the Ward Stones',       ru: 'Перерезать камни-обереги' },
    desc:  { en: 'The stones along the north road have weathered blank. Whatever they were keeping out has noticed.',
             ru: 'Камни вдоль северной дороги стёрлись до гладкости. То, что они удерживали, это заметило.' },
    requires: { passive_any: ['resist_aura_air', 'resist_aura_cold', 'resist_aura_death', 'volcanic_skin', 'chill', 'burn'] },
    reward: { xp_self: 14, resources: { Crystals_Air: 7, Crystals_Frost: 7 } },
  },
  {
    id: 'emp_cold_survey', faction: 'empire', hours: 8,
    title: { en: 'Survey the Frost Line',        ru: 'Обход границы мороза' },
    desc:  { en: 'Walk the boundary where the frost stops and mark where it has moved. Someone must, and it cannot be a soft one.',
             ru: 'Пройдите по границе, где кончается иней, и отметьте, куда она сместилась. Кто-то должен — и не из мягких.' },
    requires: { passive_any: ['resist_aura_air', 'resist_aura_cold', 'resist_aura_death', 'volcanic_skin', 'chill', 'burn'] },
    reward: { xp_self: 10, resources: { Crystals_Frost: 9 } },
  },
  {
    id: 'emp_forage', faction: 'empire', hours: 6,
    title: { en: 'Strip the Battlefield',        ru: 'Обобрать поле боя' },
    desc:  { en: 'Two weeks of rain on the old field. Whatever is left is worth more than it looks.',
             ru: 'Две недели дождя над старым полем. То, что уцелело, стоит больше, чем кажется.' },
    requires: { passive_any: ['scavenger', 'vitality', 'regenerate', 'dissipate'] },
    reward: { xp_self: 6, resources: { Gold: 45 } },
  },
  {
    id: 'emp_long_march', faction: 'empire', hours: 14,
    title: { en: 'Carry the Long Dispatch',      ru: 'Донести дальнюю депешу' },
    desc:  { en: 'Four days of road, no escort, no stopping. Send someone who does not tire and does not talk.',
             ru: 'Четыре дня пути, без охраны и остановок. Отправьте того, кто не устаёт и не болтает.' },
    requires: { passive_any: ['scavenger', 'vitality', 'regenerate', 'dissipate'] },
    reward: { xp_self: 16, resources: { Gold: 28, Crystals_Life: 6 } },
  },
  {
    id: 'emp_muster_call', faction: 'empire', hours: 10,
    title: { en: 'Call the Muster',              ru: 'Созыв ополчения' },
    desc:  { en: 'Ride the villages and put steel in their spines. They answer to a voice they know.',
             ru: 'Объехать деревни и вернуть людям твёрдость. Они отзовутся на знакомый голос.' },
    requires: { passive_any: ['command', 'inspiration_damage', 'inspiration_initiative', 'unity', 'beacon_of_hope'] },
    reward: { xp_self: 6, xp_roster: 20 },
  },
  {
    id: 'emp_court_witness', faction: 'empire', hours: 8,
    title: { en: 'Stand Witness at Court',       ru: 'Свидетельство при дворе' },
    desc:  { en: 'A land dispute the crown would rather settle quietly. Your word carries; go and spend it.',
             ru: 'Земельный спор, который корона предпочла бы уладить тихо. Ваше слово весомо — потратьте его.' },
    requires: { passive_any: ['command', 'inspiration_damage', 'inspiration_initiative', 'unity', 'beacon_of_hope'] },
    reward: { xp_self: 10, resources: { Gold: 40 } },
  },

  // ── CHOIR OF THE CURSED ───────────────────────────────────────────────────
  {
    id: 'cho_kindle_pyres', faction: 'choir_of_the_cursed', hours: 8,
    title: { en: 'Kindle the Night Pyres',       ru: 'Разжечь ночные костры' },
    desc:  { en: 'The pyres must burn from dusk to dawn, and something must stand in the heat to feed them.',
             ru: 'Костры должны гореть от заката до рассвета, и кто-то должен стоять в жаре и питать их.' },
    requires: { passive_any: ['fellfire', 'burn', 'volcanic_skin', 'last_verse', 'resist_aura_fire'] },
    reward: { xp_self: 10, resources: { Crystals_Fire: 10 } },
  },
  {
    id: 'cho_forge_vigil', faction: 'choir_of_the_cursed', hours: 12,
    title: { en: 'Vigil at the Forge Mouth',     ru: 'Бдение у зева горна' },
    desc:  { en: 'The great forge cannot be banked and cannot be left. Stand where no one else can stand.',
             ru: 'Великий горн нельзя ни притушить, ни оставить. Встаньте там, где не выстоит никто другой.' },
    requires: { passive_any: ['fellfire', 'burn', 'volcanic_skin', 'last_verse', 'resist_aura_fire'], stat: { hp: 45 } },
    reward: { xp_self: 14, resources: { Crystals_Fire: 7, Gold: 25 } },
  },
  {
    id: 'cho_pit_fights', faction: 'choir_of_the_cursed', hours: 6,
    title: { en: 'Take the Pit Purse',           ru: 'Забрать кошель ямы' },
    desc:  { en: 'The pits pay well and ask nothing but that you keep getting up. A day of it, then.',
             ru: 'Ямы платят щедро и просят лишь одного — вставать снова. Значит, день в яме.' },
    requires: { passive_any: ['rage', 'blood_frenzy', 'vengeance', 'execute', 'find_weakness'] },
    reward: { xp_self: 8, resources: { Gold: 45 } },
  },
  {
    id: 'cho_debt_collection', faction: 'choir_of_the_cursed', hours: 8,
    title: { en: 'Collect What Is Owed',         ru: 'Взыскать долг' },
    desc:  { en: 'Three names on the list have stopped paying. Only one of them needs to be made an example of.',
             ru: 'Трое в списке перестали платить. Показательным нужно сделать лишь одного.' },
    requires: { passive_any: ['rage', 'blood_frenzy', 'vengeance', 'execute', 'find_weakness'], stat: { action_power: 12 } },
    reward: { xp_self: 12, resources: { Gold: 35 } },
  },
  {
    id: 'cho_read_the_choir', faction: 'choir_of_the_cursed', hours: 10,
    title: { en: 'Read to the Choir',            ru: 'Читать Хору' },
    desc:  { en: 'The younger voices learn faster when something that has burned reads it aloud.',
             ru: 'Молодые голоса учатся быстрее, когда читает тот, кто уже горел.' },
    requires: { passive_any: ['magic_attunement', 'inspiration_damage', 'inspiration_max_hp', 'command'] },
    reward: { xp_self: 6, xp_roster: 20 },
  },
  {
    id: 'cho_copy_the_liturgy', faction: 'choir_of_the_cursed', hours: 12,
    title: { en: 'Copy the Burnt Liturgy',       ru: 'Переписать сожжённую литургию' },
    desc:  { en: 'Half the verses survive. The other half must be remembered correctly, and the cost of error is loud.',
             ru: 'Уцелела половина стихов. Вторую надо вспомнить верно — цена ошибки громкая.' },
    requires: { passive_any: ['magic_attunement', 'inspiration_damage', 'inspiration_max_hp', 'command'] },
    reward: { xp_self: 14, resources: { Crystals_Fire: 8, Gold: 22 } },
  },
  {
    id: 'cho_hold_the_stair', faction: 'choir_of_the_cursed', hours: 10,
    title: { en: 'Hold the Undercroft Stair',    ru: 'Держать лестницу подземелья' },
    desc:  { en: 'Something in the undercroft has learned the stair. It only has to be denied until dawn.',
             ru: 'Нечто в подземелье выучило лестницу. Его нужно лишь не пустить до рассвета.' },
    requires: { passive_any: ['unbreakable', 'fortify', 'aegis', 'undying', 'recuperate', 'regenerate', 'vitality'],
                stat: { hp: 50 } },
    reward: { xp_self: 12, heal_pct: 30, resources: { Gold: 28 } },
  },
  {
    id: 'cho_bear_the_reliquary', faction: 'choir_of_the_cursed', hours: 14,
    title: { en: 'Bear the Reliquary',           ru: 'Нести реликварий' },
    desc:  { en: 'It is heavier than it looks and it does not want to be carried. Do not put it down.',
             ru: 'Он тяжелее, чем кажется, и не желает, чтобы его несли. Не ставьте его на землю.' },
    requires: { passive_any: ['unbreakable', 'fortify', 'aegis', 'undying', 'recuperate', 'regenerate', 'vitality'] },
    reward: { xp_self: 16, resources: { Crystals_Fire: 9 } },
  },
  {
    id: 'cho_count_the_watchfires', faction: 'choir_of_the_cursed', hours: 6,
    title: { en: 'Count the Watchfires',         ru: 'Сосчитать сторожевые огни' },
    desc:  { en: 'Lie on the ridge and count what burns on the far side. Come back with a number, not a story.',
             ru: 'Залягте на гребне и сосчитайте огни на той стороне. Вернитесь с числом, а не с рассказом.' },
    requires: { passive_any: ['clear_shot', 'dissipate', 'resist_aura_cold', 'resist_aura_fire', 'find_weakness'],
                stat: { initiative: 40 } },
    reward: { xp_self: 8, resources: { Gold: 32 } },
  },
  {
    id: 'cho_salt_the_ford', faction: 'choir_of_the_cursed', hours: 8,
    title: { en: 'Salt the Ford',                ru: 'Засолить брод' },
    desc:  { en: 'Make the crossing hate whoever tries it next. Quietly, and without being seen doing it.',
             ru: 'Сделайте переправу ненавистной для следующего. Тихо и незаметно.' },
    requires: { passive_any: ['clear_shot', 'dissipate', 'resist_aura_cold', 'resist_aura_fire', 'find_weakness'] },
    reward: { xp_self: 8, xp_roster: 8, resources: { Crystals_Fire: 5 } },
  },
  {
    id: 'cho_break_the_siege_camp', faction: 'choir_of_the_cursed', hours: 12,
    title: { en: 'Foul the Siege Camp',          ru: 'Испортить осадный лагерь' },
    desc:  { en: 'Their engines are timber and rope and confidence. Ruin whichever burns best.',
             ru: 'Их машины — дерево, верёвки и уверенность. Испортите то, что горит лучше.' },
    requires: { passive_any: ['fellfire', 'burn', 'rage', 'execute', 'vengeance'], stat: { action_power: 14 } },
    reward: { xp_self: 16, resources: { Gold: 32, Crystals_Fire: 6 } },
  },
  {
    id: 'cho_walk_the_ash', faction: 'choir_of_the_cursed', hours: 10,
    title: { en: 'Walk the Ash Fields',          ru: 'Пройти пепельные поля' },
    desc:  { en: 'Nothing grows there and nothing should be alive in it. Bring back what you find in the ash.',
             ru: 'Там ничего не растёт и ничто не должно быть живым. Принесите то, что найдёте в пепле.' },
    requires: { passive_any: ['volcanic_skin', 'resist_aura_fire', 'undying', 'vitality', 'regenerate'] },
    reward: { xp_self: 12, resources: { Crystals_Fire: 8, Gold: 22 } },
  },

  // ── GRAIL OF SORROW ───────────────────────────────────────────────────────
  {
    id: 'gra_dig_the_trench', faction: 'grail_of_sorrow', hours: 8,
    title: { en: 'Dig the Long Trench',          ru: 'Копать длинный ров' },
    desc:  { en: 'The dead do not tire and do not ask why the trench must be that long.',
             ru: 'Мёртвые не устают и не спрашивают, зачем ров такой длинный.' },
    requires: { passive_any: ['horde', 'reanimate', 'unending_servitude', 'undying', 'sorrow'] },
    reward: { xp_self: 8, resources: { Gold: 42 } },
  },
  {
    id: 'gra_walk_the_procession', faction: 'grail_of_sorrow', hours: 12,
    title: { en: 'Walk the Mourning Procession', ru: 'Пройти в траурной процессии' },
    desc:  { en: 'A day of slow walking and slower singing. The living take heart from seeing it done properly.',
             ru: 'День медленного шага и ещё более медленного пения. Живые крепнут, видя, что всё сделано как должно.' },
    requires: { passive_any: ['horde', 'reanimate', 'unending_servitude', 'undying', 'sorrow'] },
    reward: { xp_self: 6, xp_roster: 20 },
  },
  {
    id: 'gra_foul_the_wells', faction: 'grail_of_sorrow', hours: 10,
    title: { en: 'Foul the Border Wells',        ru: 'Отравить пограничные колодцы' },
    desc:  { en: 'Not enough to kill. Enough that the garrison drinks and then cannot hold a spear steady.',
             ru: 'Не насмерть. Ровно настолько, чтобы гарнизон напился и не удержал копьё.' },
    requires: { passive_any: ['infect', 'poison', 'bleed', 'aura_of_decay', 'death_mark'] },
    reward: { xp_self: 12, resources: { Crystals_Nature: 8, Gold: 22 } },
  },
  {
    id: 'gra_tend_the_rot', faction: 'grail_of_sorrow', hours: 8,
    title: { en: 'Tend the Rot Garden',          ru: 'Ухаживать за садом гнили' },
    desc:  { en: 'It has to be turned, fed and kept from spreading past its wall. It resents all three.',
             ru: 'Его нужно вскапывать, кормить и не пускать за стену. Он противится всему троему.' },
    requires: { passive_any: ['infect', 'poison', 'bleed', 'aura_of_decay', 'death_mark'] },
    reward: { xp_self: 10, resources: { Crystals_Death: 8, Crystals_Nature: 5 } },
  },
  {
    id: 'gra_bleed_the_chalice', faction: 'grail_of_sorrow', hours: 10,
    title: { en: 'Fill the Lesser Chalice',      ru: 'Наполнить малую чашу' },
    desc:  { en: 'The rite needs a full chalice by dawn and a donor who can spare it and keep standing.',
             ru: 'К рассвету обряду нужна полная чаша и тот, кто может её наполнить и устоять.' },
    requires: { passive_any: ['lifesteal', 'leech', 'communion', 'sacrament', 'duelist'] },
    reward: { xp_self: 12, resources: { Crystals_Death: 9 } },
  },
  {
    id: 'gra_settle_the_debt', faction: 'grail_of_sorrow', hours: 8,
    title: { en: 'Settle a Blood Debt',          ru: 'Уладить кровный долг' },
    desc:  { en: 'Two houses, one grievance, and a rite that ends it. Someone has to hold the knife.',
             ru: 'Два дома, одна обида и обряд, что кладёт ей конец. Кто-то должен держать нож.' },
    requires: { passive_any: ['lifesteal', 'leech', 'communion', 'sacrament', 'duelist'], stat: { action_power: 12 } },
    reward: { xp_self: 12, resources: { Gold: 35 } },
  },
  {
    id: 'gra_haunt_the_road', faction: 'grail_of_sorrow', hours: 6,
    title: { en: 'Haunt the Toll Road',          ru: 'Пугать на платной дороге' },
    desc:  { en: 'Stand where the road bends and be seen once. The tolls collect themselves after that.',
             ru: 'Встаньте на повороте дороги и покажитесь один раз. Дальше пошлина соберётся сама.' },
    requires: { passive_any: ['fear', 'dodge', 'slow', 'dissipate', 'eternal_grief'] },
    reward: { xp_self: 8, resources: { Gold: 45 } },
  },
  {
    id: 'gra_follow_the_envoy', faction: 'grail_of_sorrow', hours: 10,
    title: { en: 'Follow the Envoy',             ru: 'Проследить за посланником' },
    desc:  { en: 'Four days behind him, never closer than a field, and not once seen.',
             ru: 'Четыре дня позади него, не ближе поля — и ни разу не попасться на глаза.' },
    requires: { passive_any: ['fear', 'dodge', 'slow', 'dissipate', 'eternal_grief'], stat: { initiative: 45 } },
    reward: { xp_self: 14, resources: { Gold: 26, Crystals_Air: 5 } },
  },
  {
    id: 'gra_stand_the_barrow', faction: 'grail_of_sorrow', hours: 12,
    title: { en: 'Stand the Barrow Door',        ru: 'Стоять у двери кургана' },
    desc:  { en: 'Grave-robbers work in threes and give up quickly when the door is not empty.',
             ru: 'Расхитители могил ходят по трое и быстро отступают, если дверь не пуста.' },
    requires: { passive_any: ['protector', 'thorns', 'recuperate', 'regenerate', 'vitality',
                              'resist_aura_air', 'resist_aura_cold', 'resist_aura_fire'], stat: { armor: 15 } },
    reward: { xp_self: 12, heal_pct: 30, resources: { Gold: 28 } },
  },
  {
    id: 'gra_carry_the_reliquary', faction: 'grail_of_sorrow', hours: 14,
    title: { en: 'Carry the Sorrow Vessel',      ru: 'Нести сосуд скорби' },
    desc:  { en: 'It weeps the whole way and it must not be set down on unconsecrated ground.',
             ru: 'Он плачет всю дорогу, и его нельзя ставить на неосвящённую землю.' },
    requires: { passive_any: ['protector', 'thorns', 'recuperate', 'regenerate', 'vitality',
                              'resist_aura_air', 'resist_aura_cold', 'resist_aura_fire'] },
    reward: { xp_self: 16, resources: { Crystals_Death: 8, Gold: 20 } },
  },
  {
    id: 'gra_run_down_the_deserter', faction: 'grail_of_sorrow', hours: 8,
    title: { en: 'Run Down the Deserter',        ru: 'Догнать дезертира' },
    desc:  { en: 'He took a relic with him. The relic comes back; he is not required to.',
             ru: 'Он унёс реликвию. Реликвия вернётся — он не обязан.' },
    requires: { passive_any: ['impale', 'rage', 'inspiration_damage', 'inspiration_initiative', 'duelist'],
                stat: { initiative: 40 } },
    reward: { xp_self: 12, resources: { Gold: 32 } },
  },
  {
    id: 'gra_teach_the_choirlings', faction: 'grail_of_sorrow', hours: 10,
    title: { en: 'Drill the Novices',            ru: 'Учения послушников' },
    desc:  { en: 'They have the faith and none of the footwork. One of those can be taught in a day.',
             ru: 'Веры у них хватает, а вот выучки нет. За день можно поправить одно из двух.' },
    requires: { passive_any: ['impale', 'rage', 'inspiration_damage', 'inspiration_initiative', 'duelist'] },
    reward: { xp_self: 6, xp_roster: 18 },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const baseKey = key => String(key).replace(/\s+\d+$/, '');
const keyRank = key => { const m = String(key).match(/\s+(\d+)$/); return m ? Number(m[1]) : 1; };

function throneTier(throneLevel) {
  return THRONE_TIER[Math.max(0, Math.min(4, Number(throneLevel) || 0))] ?? 1;
}

// The highest rank a passive actually has, so a throne-3 errand never asks for
// "Renew 3" — 20 of the 61 base passives are rank 1 only.
function maxRankOf(basePassive, UNIT_ABILITIES) {
  let max = 1;
  for (const key of Object.keys(UNIT_ABILITIES || {})) {
    if (baseKey(key) !== basePassive) continue;
    max = Math.max(max, UNIT_ABILITIES[key]?.rank ?? 1);
  }
  return max;
}

// Everything a roster row brings to a requirement check. `resolveDef` is passed
// in so this file needs no import of units.js (the client already has one).
function unitProfile(row, resolveDef) {
  const stored = row?.unit_data || {};
  const def    = resolveDef ? resolveDef(row) : null;
  const raw    = stored.passive ?? def?.passive ?? [];
  const list   = Array.isArray(raw) ? raw : (raw ? [raw] : []);

  const passives = {};
  for (const key of list) {
    const b = baseKey(key);
    passives[b] = Math.max(passives[b] ?? 0, keyRank(key));
  }

  const action = stored.action ?? def?.action;
  return {
    passives,
    action: typeof action === 'string' ? action.toLowerCase() : String(action?.id ?? '').toLowerCase(),
    stats: {
      hp:           stored.max_hp     ?? def?.hp        ?? 0,
      armor:        stored.armor      ?? def?.armor     ?? 0,
      initiative:   stored.initiative ?? def?.initiative ?? 0,
      action_power: stored.action_power ?? def?.action_power ?? 0,
    },
  };
}

// What this errand demands of a unit at this throne level, with every number
// already resolved — the same object is snapshotted onto the roster row when the
// errand starts, so the UI can explain the requirement after the fact.
// `tierOverride` lets the selector step the difficulty DOWN. Throne level is
// what the errand should ask for, but it is not a promise the roster can answer:
// a throne-2 player fielding tier-1 units has nothing but rank-1 passives, and
// asking rank 2 of them left whole factions with no offerable errand at all.
// The selector tries the throne's tier first and walks down until something
// fits, so the difficulty tracks the throne where it can and the player always
// has something to do where it cannot.
function resolveRequirement(errand, throneLevel, UNIT_ABILITIES, tierOverride = null) {
  const tier = tierOverride ?? throneTier(throneLevel);
  const req  = errand.requires || {};
  const mult = TIER_STAT_MULT[tier] ?? 1;

  const passives = (req.passive_any || []).map(b => ({
    passive: b,
    rank: Math.min(tier, maxRankOf(b, UNIT_ABILITIES)),
  }));

  const stats = {};
  for (const [k, v] of Object.entries(req.stat || {})) stats[k] = Math.round(v * mult);

  return { tier, passive_any: passives, action_any: req.action_any || null, stat: stats };
}

function unitMeets(profile, resolved) {
  if (resolved.passive_any?.length) {
    const ok = resolved.passive_any.some(p => (profile.passives[p.passive] ?? 0) >= p.rank);
    if (!ok) return false;
  }
  if (resolved.action_any?.length) {
    if (!resolved.action_any.map(a => a.toLowerCase()).includes(profile.action)) return false;
  }
  for (const [k, v] of Object.entries(resolved.stat || {})) {
    if ((profile.stats[k] ?? 0) < v) return false;
  }
  return true;
}

// Reward follows the tier the errand was actually SET at, not the throne — an
// errand that stepped down to tier 1 because the roster is young pays tier-1
// rates. Otherwise stepping down would be free difficulty relief.
function scaleReward(errand, throneLevel, tierOverride = null) {
  const tier = tierOverride ?? throneTier(throneLevel);
  const m    = TIER_REWARD_MULT[tier] ?? 1;
  const r    = errand.reward || {};
  const out  = {};
  if (r.xp_self)   out.xp_self   = Math.round(r.xp_self * m);
  if (r.xp_roster) out.xp_roster = Math.round(r.xp_roster * m);
  if (r.heal_pct)  out.heal_pct  = r.heal_pct;              // a percentage does not scale
  if (r.resources) {
    out.resources = {};
    for (const [k, v] of Object.entries(r.resources)) out.resources[k] = Math.round(v * m);
  }
  return out;
}

const ERRANDS_BY_ID = Object.fromEntries(ERRANDS.map(e => [e.id, e]));

// Dual export, same as data/units.js: the browser imports this file as an ES
// module and routes/index.js `require`s it. One of the two forms is always the
// wrong one, so both are provided — without the `export` the client throws
// "does not provide an export named ERRANDS_BY_ID" at load.
export {
  ERRANDS,
  ERRANDS_BY_ID,
  THRONE_TIER,
  TIER_STAT_MULT,
  TIER_REWARD_MULT,
  throneTier,
  maxRankOf,
  unitProfile,
  resolveRequirement,
  unitMeets,
  scaleReward,
  baseKey,
};

if (typeof module !== 'undefined') module.exports = {
  ERRANDS,
  ERRANDS_BY_ID,
  THRONE_TIER,
  TIER_STAT_MULT,
  TIER_REWARD_MULT,
  throneTier,
  maxRankOf,
  unitProfile,
  resolveRequirement,
  unitMeets,
  scaleReward,
  baseKey,
};