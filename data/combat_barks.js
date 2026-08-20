// Cosmetic combat barks - zero mechanical effect, purely flavor text shown as a
// toast next to the unit that speaks. Nothing here is ever read by game logic.
//
// A bark is a RULE: a trigger, an optional actor filter, an optional target
// filter, and the lines to pick from. The engine collects every rule that
// matches, keeps only the most specific ones, and picks one line at random.
// See BattleEngine.checkBark() in utils/battle-engine.js.
//
// Filters:
//   name: 'Paladin'        matches unit_name exactly (all tiers share a name)
//   tag:  'Demon'          matches if the unit carries that tag
//   tags: ['Holy','Court'] matches if the unit carries ALL of them
//   not:  'Skeleton' | []  excludes units carrying any of these tags
//   omit the filter entirely to match anything
//
// Specificity (higher wins, ties are pooled together):
//   +100 name, +2 per tag, +0 per `not` (a gate only), on each of actor and
//   target. A named rule therefore always beats any tag rule.
//
// The ONLY tags any unit in data/units.js carries are:
//   Archer, Caster, Construct, Court, Demon, Engineer, Holy, Knight, Skeleton,
//   Spirit, Vampire, Warrior, Zombie
// A filter naming anything else silently never matches - check units.js before
// inventing one. There is no Choir, Beast or Ghost tag.
//
// TWO LINES PER RULE. Not three, not five. A bark is a shout across a battle
// line, and a rule with five lines is four of them padding out the two that
// were any good. Write the two, delete the rest.
//
// VOICE - three factions, three registers. Keep new lines inside them:
//   Empire (Knight / Holy / Engineer / Construct / Archer / Caster / Spirit) -
//     militant and stoic, persevering. Duty, discipline, the line holding.
//     Understatement; never triumphant. Their god is MITHRAIL.
//   Grail of Sorrow (Vampire / Zombie / Spirit / Skeleton / Holy / Knight /
//     Caster) - mourning and melancholic. Grief carried rather than performed.
//     Vampires are formal and tired, never flippant or arch. Their god is
//     ASTALOTH, the Mother: she watches, keeps and mourns - she never takes.
//     THEIR HISTORY: always their own faction, always Astaloth's, never the
//     Empire's and never abandoned by anyone. They mistranslated a time spell
//     they were building for the war, and it moved them through time - bodies
//     rotted and collapsed on the way, and very little of them arrived. The
//     grief is for what the spell cost them, THEIR OWN mistake. Never write
//     them as forgotten, cast out, or waiting on the Empire's god.
//   Choir of the Cursed (Demon / Court / Warrior / Knight / Caster /
//     Construct) - born out of song and hungry with it. Voices, verses, the
//     First Song, appetite. Their god is AGGRAIL, and they lapse into a tongue
//     nobody else speaks, transliterated the same way in both languages.
//
// NO COMMERCE. Nothing in this file is a price, a debt, a share, a contract, a
// loan or a payment - not for the Choir, not for anyone. The Choir is greedy
// the way a mouth is greedy, not the way a bank is.
// No quips, no exclamation-mark comedy, no modern idiom.
//
// Localization: each rule carries `lines` (English) and a parallel `lines_ru`
// of the SAME length and order. The engine picks one index and logs both the
// English and Russian line; the client shows the one for the viewer's language
// (no English fallback). Keep lines and lines_ru index-aligned when editing.
//
// Triggers:
//   attack       actor lands a damaging hit that does NOT kill
//   kill         actor's hit kills the target
//   death        the dying unit's own last words (target filter = the killer)
//   heal_low_hp  actor heals an ally who was below `threshold_pct` HP
//
// Speak chance decays per unit, per trigger, per battle - see BARK_CHANCES.
// Attack barks are the noisiest trigger, so they are tuned lower.

const BARK_CHANCES = {
  attack:      [0.30, 0.12], // 1st bark 30%, 2nd 12%, then silent for the battle
  kill:        [0.55, 0.30],
  death:       [0.60, 0.00], // you only die once, but revives exist
  heal_low_hp: [0.50, 0.25],
};

// Only considered for the heal_low_hp trigger: the ally must have been below
// this % of max HP *before* the heal landed.
const HEAL_BARK_THRESHOLD_PCT = 25;

const COMBAT_BARKS = [
  // ===========================================================================
  // GRAIL OF SORROW - VAMPIRES
  // NOT old blood. They are barely a decade dead - collateral of a time spell
  // that went wrong - and they remember being alive well enough for it to hurt.
  // They kill the way a physician works: precisely, and without appetite for it.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Vampire', faction: ['g', 'dm'] }, target: { tag: 'Demon' },
    lines: [
      'There is nothing in you to mourn.',
      'You chose to become this. We were not asked.',
    ],
    lines_ru: [
      'В тебе не о чем горевать.',
      'Ты сам таким стал. А нас не спрашивали.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire', faction: ['g', 'dm'] }, target: { tag: 'Knight' },
    lines: [
      'Iron does not answer for the man inside it.',
      'I have buried braver men. I remember each of them.',
    ],
    lines_ru: [
      'Железо не отвечает за того, кто внутри.',
      'Я хоронил и храбрее. Я помню каждого.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire', faction: ['g', 'dm'] }, target: { tag: 'Holy' },
    lines: [
      'Keep your god. We have our own.',
      'Astaloth mourns us. Yours would not bother.',
    ],
    lines_ru: [
      'Оставь себе своего бога. У нас есть своя.',
      'Асталот о нас скорбит. Твой бы и не стал.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire', faction: ['g', 'dm'] }, target: { tag: 'Zombie' },
    lines: [
      'Rest. You have carried this long enough.',
      'We were one house once. Astaloth remembers us both.',
    ],
    lines_ru: [
      'Отдохни. Ты нёс это достаточно долго.',
      'Когда-то мы были одним домом. Асталот помнит нас обоих.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire', faction: ['g', 'dm'] }, target: { tag: 'Construct' },
    lines: [
      'Nothing in you to grieve. It makes the work quicker.',
      'No blood, no name, no rest to give you.',
    ],
    lines_ru: [
      'В тебе не о чем горевать. Так даже быстрее.',
      'Ни крови, ни имени. И покоя тебе не нужно.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire', faction: ['g', 'dm'] }, target: { tag: 'Holy' },
    lines: [
      'I will steal your life!',
      'Say the rites yourselves. I no longer remember them.',
    ],
    lines_ru: [
      'Я украду твою жизнь!',
      'Прочтите обряд сами. Я его больше не помню.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire', faction: ['g', 'dm'] }, target: { tag: 'Demon' },
    lines: [
      'No burial for you!',
      'Whatever made you is next!',
    ],
    lines_ru: [
      'Даже хоронить нечего!',
      'Кто бы тебя ни призвал — следующий!',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire', faction: ['g', 'dm'] },
    lines: [
      'Forgive me Astaloth, i must.',
      'He is quiet now.',
    ],
    lines_ru: [
      'Просмти меня Асталот, я должен.',
      'Теперь он стих.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Vampire', faction: ['g', 'dm'] },
    lines: [
      'At last. Carry me home.',
      'Bury me properly this time. Please.',
    ],
    lines_ru: [
      'Наконец-то. Отнесите меня домой.',
      'В этот раз похороните как надо. Прошу.',
    ],
  },

  // ===========================================================================
  // GRAIL OF SORROW - THE RISEN (Zombie)
  // Slow, patient, sorry. They remember being people, and it does not help.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Zombie', faction: ['g', 'dm'] }, target: { tag: 'Holy' },
    lines: [
      'Buried... us... here...',
      'Prayers... did not... hold...',
    ],
    lines_ru: [
      'Зарыли... нас... тут...',
      'Молитвы... не... держат...',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Zombie', faction: ['g', 'dm'] },
    lines: [
      'Never... tired...',
      'Move... aside...',
    ],
    lines_ru: [
      'Не... устаём...',
      'Уйди... с дороги...',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Zombie', faction: ['g', 'dm'] },
    lines: [
      'Down... stay... down...',
      'Ground... takes... him...',
    ],
    lines_ru: [
      'Лежи... лежи...',
      'Земля... заберёт...',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Zombie', faction: ['g', 'dm'] },
    lines: [
      'Let... me... rest...',
      'Mother... no... more...',
    ],
    lines_ru: [
      'Дайте... от...дохнуть...',
      'Мать... больше... не надо...',
    ],
  },

  // ===========================================================================
  // GRAIL OF SORROW - THE BONE ORDER (Skeleton)
  // What is left once the grief has worn even the flesh off. Dry and formal.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Skeleton', faction: ['g', 'dm'] },
    lines: [
      'The oath is all that is left.',
      'Nothing left in me to break.',
    ],
    lines_ru: [
      'От меня осталась одна клятва.',
      'Ломать во мне уже нечего.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Skeleton', faction: ['g', 'dm'] },
    lines: [
      'Now he waits with us.',
      'He will learn patience.',
    ],
    lines_ru: [
      'Теперь он ждёт вместе с нами.',
      'Научится терпению.',
    ],
  },

  // ===========================================================================
  // GRAIL OF SORROW - THE MOURNING DEAD (Spirit without Holy)
  // Empire spirits are Spirit+Holy and speak in the Empire section below; these
  // are the Grail's ghosts - unfinished, quiet, sorry to be here at all.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Spirit', faction: ['g', 'dm'], not: ['Holy'] },
    lines: [
      'I do not want this. I cannot stop either.',
      'I barely remember my name. I will not learn yours.',
    ],
    lines_ru: [
      'Я этого не хочу. И остановиться не могу.',
      'Я едва помню своё имя. Твоего и не запомню.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Spirit', faction: ['g', 'dm'], not: ['Holy'] }, target: { tag: 'Holy' },
    lines: [
      'Your light passes through me. Everything does.',
      'I was consecrated too. Look at me now.',
    ],
    lines_ru: [
      'Твой свет проходит сквозь меня. Как и всё остальное.',
      'Меня тоже освящали. Погляди на меня теперь.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Spirit', faction: ['g', 'dm'], not: ['Holy'] },
    lines: [
      'Oh. It was this simple all along.',
      'Let me go quiet this time.',
    ],
    lines_ru: [
      'Надо же. А всё было так просто.',
      'Дайте мне уйти тихо на этот раз.',
    ],
  },
  {
    trigger: 'attack', actor: { tags: ['Knight', 'Zombie'] },
    lines: [
      'The oath outlived the man. Only the oath is still standing.',
      'My lord released me. I did not go.',
    ],
    lines_ru: [
      'Человек умер, клятва — нет. Она и держит строй.',
      'Господин освободил меня. Я не ушёл.',
    ],
  },

  // ===========================================================================
  // EMPIRE - THE FAITHFUL (Holy)
  // Militant, stoic, unhurried. Nothing here is triumphant; it is work.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Holy', faction: ['e'] }, target: { tag: 'Demon' },
    lines: [
      'Burn in holy fire!',
      'Back where you came from!',
    ],
    lines_ru: [
      'Гори праведным огнем!',
      'Убирайся откуда пришёл!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy', faction: ['e', 'opb'] }, target: { tag: 'Vampire' },
    lines: [
      'Your grief is not our concern, your teeth are!',
      'Sorrow is no defence. Step back or fall!',
    ],
    lines_ru: [
      'Наша забота не твоя скорбь, а твои клыки!',
      'Скорбь — не оправдание. Отступи или пади!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy', faction: ['e', 'opb'] }, target: { tag: 'Skeleton' },
    lines: [
      'Oathbreaker!',
      'Rest. That is an order.',
    ],
    lines_ru: [
      'Клятвопреступник!',
      'Покойся. Это приказ.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy', faction: ['e', 'opb'] }, target: { tag: 'Zombie' },
    lines: [
      'Mockery of life!',
      'Burn it. Burn all of it!',
    ],
    lines_ru: [
      'Жалкое подобие жизни!',
      'Сжечь. Сжечь до тла!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy', faction: ['e', 'opb'] }, target: { tag: 'Spirit' },
    lines: [
      'Whatever holds you here I will burn!',
      'The war is over for you.',
    ],
    lines_ru: [
      'Что бы тебя тут ни держало я испепелю!',
      'Для тебя война окончена.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Holy', faction: ['e', 'opb'] }, target: { tag: 'Demon' },
    lines: [
      'One more sent back!',
      'It ends as it began - uninvited.',
    ],
    lines_ru: [
      'Еще один отправлен назад!',
      'Пришёл незваным — таким и уйдешь!',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Holy', faction: ['e', 'opb'] }, target: { tag: 'Skeleton' },
    lines: [
      'Rest, your watch is relieved.',
      'Buried.',
    ],
    lines_ru: [
      'Покойся, твой караул снят.',
      'Погребён.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Holy', faction: ['e', 'opb'] },
    lines: [
      'Hold the line!',
      'Tell them the line held...',
    ],
    lines_ru: [
      'Держите строй!',
      'Скажите им: строй устоял...',
    ],
  },

  // Empire-only, so MITHRAIL is never put in the mouth of the Aggrail cult that
  // shares the Holy tag ('opb'). Same score as the shared rules above, so for an
  // Empire unit these simply pool together and the god turns up some of the time
  // rather than every line.
  {
    trigger: 'attack', actor: { tag: 'Holy', faction: 'e' },
    lines: [
      'Mithrail guide me hand!',
      'By his light, and by my hand.',
    ],
    lines_ru: [
      'Митраил направь мою руку!',
      'Его светом и моей рукой.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Holy', faction: 'e' },
    lines: [
      'My light fades...',
      'Avenge me...',
    ],
    lines_ru: [
      'Мой свет угас...',
      'Отомстите...',
    ],
  },

  // ===========================================================================
  // GRAIL OF SORROW - THE FAITHFUL (Holy)
  // The same office as the Empire's priesthood and none of its certainty. They
  // tend Astaloth's children knowing they ARE her children. The Mother grieves
  // for what was done TO them, so she watches and keeps - never takes.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Holy', faction: 'g' }, target: { tag: 'Holy' },
    lines: [
      'A spell did this to us, not your god.',
      'Astaloth grieves for us. Who grieves for you?',
    ],
    lines_ru: [
      'Это сделало заклинание, а не ваш бог.',
      'Асталот о нас скорбит. Кто скорбит по тебе?',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy', faction: 'g' },
    lines: [
      'Mother sees this. She does not look away.',
      'Forgive me. I was taught to mend, not to do this.',
    ],
    lines_ru: [
      'Мать это видит. Она не отводит глаз.',
      'Простите меня. Меня учили исцелять, а не этому.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Holy', faction: 'g' },
    lines: [
      'Rest. That is more than we were given.',
      'Astaloth keeps him now. She keeps everyone.',
    ],
    lines_ru: [
      'Покойся. Нам и того не досталось.',
      'Теперь его хранит Асталот. Она хранит всех.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Holy', faction: 'g' },
    lines: [
      'Mother... I am coming...',
      'Do not mourn...',
    ],
    lines_ru: [
      'Мать... я возвращаюсь...',
      'Не скорбите...',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Holy', faction: 'g' },
    lines: [
      'Stay. I have lost enough of us.',
      'Astaloth is not finished with you.',
    ],
    lines_ru: [
      'Останься. Я потерял слишком многих.',
      'Асталот с тобой ещё не закончила.',
    ],
  },

  // ===========================================================================
  // EMPIRE - THE ORDERS (Knight)
  // The `not` gate keeps Grail and Choir knights out of the Empire's voice.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Knight', faction: 'e', not: ['Skeleton', 'Zombie', 'Demon', 'Vampire'] },
    lines: [
      'Burn!',
      'The line is where I am standing.',
    ],
    lines_ru: [
      'Гори!',
      'Строй — там, где стою я.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Knight', faction: 'e', not: ['Skeleton', 'Zombie', 'Demon', 'Vampire'] }, target: { tag: 'Demon' },
    lines: [
      'Shields up!',
      'You are not the first thing to come out of that hole.',
    ],
    lines_ru: [
      'Щиты выше!',
      'Ты не первое, что вылезло из той дыры.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Knight', faction: 'e', not: ['Skeleton', 'Zombie'] },
    lines: [
      'Do not carry me. Carry the line.',
      'Finish it. I will wait here.',
    ],
    lines_ru: [
      'Не несите меня. Несите строй.',
      'Заканчивайте. Я подожду здесь.',
    ],
  },

  // ===========================================================================
  // EMPIRE - THE HALLOWED DEAD (Spirit + Holy: Mithrails, Blessed Soul)
  // Empire soldiers who kept serving after death. Same discipline, less voice.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tags: ['Spirit', 'Holy'] },
    lines: [
      'I was relieved of my body, not of my oath.',
      'Aurex stands!',
    ],
    lines_ru: [
      'Меня освободили от тела а не от клятвы.',
      'Аурекс выстоит!',
    ],
  },
  {
    trigger: 'death', actor: { tags: ['Spirit', 'Holy'] },
    lines: [
      'Second time. Still facing the right way.',
      'Strike my name properly this time.',
    ],
    lines_ru: [
      'Второй раз. И снова лицом к врагу.',
      'На этот раз вычеркните имя как следует.',
    ],
  },

  // ===========================================================================
  // EMPIRE - THE WORKSHOPS (Engineer)
  // Tradesmen at war. Dry, procedural, quietly proud of the equipment.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Engineer', faction: 'e' },
    lines: [
      'Ranged, sighted, done. Next.',
      'It is not brave. It is accurate.',
    ],
    lines_ru: [
      'Дистанция, прицел, готово. Следующий.',
      'Это не храбро. Это точно.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Engineer', faction: 'e' }, target: { tag: 'Construct' },
    lines: [
      'Poor work. Whoever built you cut the joints.',
      'Every machine has a seam. There it is.',
    ],
    lines_ru: [
      'Скверная работа. На сочленениях сэкономили.',
      'У всякой машины есть шов. Вот он.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Engineer', faction: 'e' }, target: { tag: 'Demon' },
    lines: [
      'You are not unnatural. You are poorly contained.',
      'Fire I understand. Stand still.',
    ],
    lines_ru: [
      'Ты не исчадие. Ты просто плохо изолирован.',
      'Огонь я понимаю. Стой смирно.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Engineer', faction: 'e' },
    lines: [
      'Down. Log it.',
      'The instrument performed as intended.',
    ],
    lines_ru: [
      'Готов. Занесите в журнал.',
      'Изделие сработало как задумано.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Engineer', faction: 'e' },
    lines: [
      'Do not let them take the gun.',
      'Tell the shop it was not the mechanism.',
    ],
    lines_ru: [
      'Не отдавайте им орудие.',
      'Передайте в мастерскую: дело было не в механизме.',
    ],
  },

  // ===========================================================================
  // EMPIRE - THE ENGINES (Construct without Demon)
  // Imperial machines. Flat and procedural; they claim no personality.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Construct', faction: ['e', 'mv'], not: ['Demon'] },
    lines: [
      'Target acknowledged. Proceeding.',
      'No fatigue. No fear. Continue.',
    ],
    lines_ru: [
      'Цель принята. Выполняю.',
      'Усталости нет. Страха нет. Продолжаю.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Construct', faction: ['e', 'mv'], not: ['Demon'] },
    lines: [
      'Target ended. Awaiting next.',
      'One removed from the count.',
    ],
    lines_ru: [
      'Цель уничтожена. Жду следующую.',
      'Одним в списке меньше.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Construct', faction: ['e', 'mv'], not: ['Demon'] },
    lines: [
      'Frame failing. Salvage the core.',
      'This unit is spent. Others remain.',
    ],
    lines_ru: [
      'Каркас отказывает. Снимите сердечник.',
      'Механизм выработан. Остальные — на ходу.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Archer', faction: 'e' },
    lines: [
      'Ranged and marked.',
      'The wind is steady. So am I.',
    ],
    lines_ru: [
      'Дистанция взята, цель отмечена.',
      'Ветер ровный. Я тоже.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Archer', faction: 'e' },
    lines: [
      'Down at range. Next mark.',
      'One shaft, one man. As trained.',
    ],
    lines_ru: [
      'Снят на дистанции. Следующая цель.',
      'Одна стрела, один человек. Как учили.',
    ],
  },

  // ===========================================================================
  // CHOIR OF THE CURSED - DEMONS
  // Sung into being and hungry ever since. Voices, verses, appetite - AGGRAIL.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Demon', faction: 'd' }, target: { tag: 'Holy' },
    lines: [
      'Your god has no voice. Aggrail answers every time.',
      'Pray louder. It only sweetens the note.',
    ],
    lines_ru: [
      'У твоего бога нет голоса. Агграил отвечает всегда.',
      'Молись громче. От этого нота только слаще.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon', faction: 'd' }, target: { tag: 'Knight' },
    lines: [
      'All that iron, and I can still hear you breathing.',
      'Kneel. The First Song carries better from down there.',
    ],
    lines_ru: [
      'Столько железа, а дыхание всё равно слышно.',
      'На колени. Оттуда Первая Песнь слышнее.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon', faction: 'd' }, target: { tag: 'Vampire' },
    lines: [
      'All that grief and not one note in it.',
      'Your mourning is a dull sound. I will end it.',
    ],
    lines_ru: [
      'Столько горя — и ни одной ноты в нём.',
      'Твоя скорбь звучит глухо. Я её оборву.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon', faction: 'd' }, target: { tag: 'Caster' },
    lines: [
      'You learned your words. Mine were sung into me.',
      'Say it again. I want to hear the voice break.',
    ],
    lines_ru: [
      'Ты свои слова выучил. Мои — в меня впеты.',
      'Повтори. Хочу услышать, как сорвётся голос.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon', faction: 'd' }, target: { tag: 'Construct' },
    lines: [
      'No voice in it. Nothing worth swallowing.',
      'Iron does not scream properly. Disappointing.',
    ],
    lines_ru: [
      'Голоса нет. И глотать нечего.',
      'Железо кричит скверно. Досадно.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Demon', faction: 'd' }, target: { tag: 'Holy' },
    lines: [
      'His god never answered. Mine is still singing.',
      'Silenced. Aggrail heard that one.',
    ],
    lines_ru: [
      'Его бог так и не ответил. Мой всё ещё поёт.',
      'Умолк. Этого Агграил услышал.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Demon', faction: 'd' },
    lines: [
      'Aggraa am neee. One more voice in the chord.',
      'He went quiet beautifully.',
    ],
    lines_ru: [
      'Агграа ам нэээ. Ещё один голос в аккорде.',
      'Он умолк красиво.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Demon', faction: 'd' },
    lines: [
      'Aggrail... sing me back... sing me back!',
      'This is not how the verse went!',
    ],
    lines_ru: [
      'Агграил... верни меня в песнь... верни!',
      'В песне было не так!',
    ],
  },

  // ===========================================================================
  // CHOIR OF THE CURSED - THE COURT
  // The ones who hold the old verses, and expect to be sung to properly.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Court', faction: 'd' },
    lines: [
      'You are standing where the Court sings. Move, or be sung over.',
      'Address me properly. The First Song remembers manners.',
    ],
    lines_ru: [
      'Ты стоишь там, где поёт Двор. Уйди, или тебя впишут в песнь.',
      'Обращайся ко мне как должно. Первая Песнь помнит учтивость.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Court', faction: 'd' }, target: { tag: 'Holy' },
    lines: [
      'Your choir chants. Ours devours.',
      'I have heard your hymns. Thin things.',
    ],
    lines_ru: [
      'Ваш хор поёт. Наш — пожирает.',
      'Я слышал ваши гимны. Пустые.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Court', faction: 'd' },
    lines: [
      'Added to the chord. He sings for Aggrail now.',
      'A voice taken. The Court is louder for it.',
    ],
    lines_ru: [
      'Добавлен в аккорд. Теперь он поёт Агграилу.',
      'Голосом больше. Двор звучит громче.',
    ],
  },
  {
    trigger: 'attack', actor: { tags: ['Construct', 'Demon'] },
    lines: [
      'I was carved to guard this threshold. You are not part of it.',
      'Off the stone. It is not yours to stand on.',
    ],
    lines_ru: [
      'Меня высекли стеречь этот порог. Тебя здесь быть не должно.',
      'Прочь с камня. Не тебе на нём стоять.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Warrior', faction: 'd' },
    lines: [
      'I hunt. You simply happened to be here.',
      'Do not run. It is worse when they run.',
    ],
    lines_ru: [
      'Я охочусь. Ты просто подвернулся.',
      'Не беги. Тем, кто бежит, хуже.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Warrior', faction: 'd' },
    lines: [
      'Still warm. Good.',
      'Aggraa am neee. That one was mine.',
    ],
    lines_ru: [
      'Ещё тёплый. Хорошо.',
      'Агграа ам нэээ. Этот был мой.',
    ],
  },

  // ===========================================================================
  // NAMED UNITS - always outrank any tag rule above.
  // ===========================================================================
  {
    trigger: 'attack', actor: { name: 'Paladin' }, target: { tag: 'Demon' },
    lines: [
      'I have held this ground before. I will hold it again.',
      'You will not pass the shield.',
    ],
    lines_ru: [
      'Я держал эту землю прежде. Удержу и теперь.',
      'Через щит ты не пройдёшь.',
    ],
  },
  {
    trigger: 'kill', actor: { name: 'Paladin' }, target: { tag: 'Demon' },
    lines: [
      'Closed. Reform on me.',
      'It is done. Do not stand and look at it.',
    ],
    lines_ru: [
      'Закрыто. Строиться на меня.',
      'Кончено. Не стойте и не смотрите.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Inquisitor' },
    lines: [
      'I asked once. That was the courtesy.',
      'I take no pleasure in this. I take responsibility for it.',
    ],
    lines_ru: [
      'Я спросил один раз. Это и была любезность.',
      'Мне это не в радость. Но отвечаю за это я.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Blood Knight' }, target: { tag: 'Holy' },
    lines: [
      'I wore that colour once. It kept no one alive.',
      'Do not preach. I know the words better than you do.',
    ],
    lines_ru: [
      'Я тоже носил этот цвет. Он никого не уберёг.',
      'Не проповедуй. Я знаю эти слова лучше тебя.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Necromancer' },
    lines: [
      'I did not raise them for war. War is simply what was left.',
      'The spell left them like this. I keep them.',
    ],
    lines_ru: [
      'Я поднял их не для войны. Просто ничего другого не осталось.',
      'Такими их оставило заклинание. Я их храню.',
    ],
  },
  {
    trigger: 'kill', actor: { name: 'Necromancer' },
    lines: [
      'Do not bury him. He will be needed by morning.',
      'Another name for the roll. I keep all of them.',
    ],
    lines_ru: [
      'Не хороните его. К утру он понадобится.',
      'Ещё одно имя в перекличку. Я храню их все.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Malgrath the Undying' },
    lines: [
      'I have outlasted your gods, your kings, and their heirs.',
      'Continue. I am curious how you imagine this ends.',
    ],
    lines_ru: [
      'Я пережил ваших богов, ваших королей и их наследников.',
      'Продолжай. Любопытно, чем ты думаешь это кончить.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Imp' },
    lines: [
      'Small teeth. Many bites.',
      'Do not look up. I am not up there.',
    ],
    lines_ru: [
      'Зубы мелкие. Укусов много.',
      'Не смотри вверх. Меня там нет.',
    ],
  },
  {
    trigger: 'death', actor: { name: 'Imp' },
    lines: [
      'Aggrail... I was so close...',
      'That is not how it goes! Not like this!',
    ],
    lines_ru: [
      'Агграил... я был так близко...',
      'Нечестно! Так нечестно!',
    ],
  },

  // ===========================================================================
  // HEALING - spoken over an ally who was nearly gone.
  // ===========================================================================
  {
    trigger: 'heal_low_hp', actor: { name: 'Acolyte' },
    lines: [
      'Stay. I have you.',
      'Breathe. Slowly. Again.',
    ],
    lines_ru: [
      'Держись. Я рядом.',
      'Дыши. Медленно. Ещё раз.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { name: 'Priest' },
    lines: [
      'You are not finished. Stand.',
      'The wound is closed. The duty is not.',
    ],
    lines_ru: [
      'Ты ещё не закончил. Встань.',
      'Рана закрыта. Долг — нет.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Holy', faction: ['e', 'opb'] },
    lines: [
      'Hold on. That is an order.',
      'We do not leave men on the ground.',
    ],
    lines_ru: [
      'Держись. Это приказ.',
      'Мы не оставляем своих на земле.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Vampire', faction: ['g', 'dm'] },
    lines: [
      'Not you. Not while I can prevent it.',
      'Stay a while longer. Please.',
    ],
    lines_ru: [
      'Только не ты. Не при мне.',
      'Побудь ещё немного. Прошу.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Demon', faction: 'd' },
    lines: [
      'Get up. Your part in the song is not finished.',
      'Aggrail is not done with you. Stand.',
    ],
    lines_ru: [
      'Вставай. Твоя партия ещё не допета.',
      'Агграил с тобой ещё не закончил. Встань.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Engineer', faction: 'e' },
    lines: [
      'Patched. It will hold if you do not run.',
      'Good enough for the field. See a surgeon after.',
    ],
    lines_ru: [
      'Заштопано. Продержится, если не побежишь.',
      'Для поля сойдёт. Потом — к лекарю.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Zombie', faction: ['g', 'dm'] },
    lines: [
      'Not... yet... stay...',
      'Road... can... wait...',
    ],
    lines_ru: [
      'Ещё... не... время...',
      'Дорога... подождёт...',
    ],
  },
];

export { COMBAT_BARKS, BARK_CHANCES, HEAL_BARK_THRESHOLD_PCT };