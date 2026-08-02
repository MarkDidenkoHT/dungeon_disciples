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
//   Archer, Beast, Caster, Choir, Construct, Court, Demon, Engineer, Ghost,
//   Holy, Knight, Skeleton, Spirit, Vampire, Warrior, Zombie
// A filter naming anything else silently never matches - check units.js before
// inventing one.
//
// VOICE - three factions, three registers. Keep new lines inside them:
//   Empire (Knight / Holy / Engineer / Construct / Archer) - militant and
//     stoic, persevering. Duty, discipline, the line holding. Understatement;
//     never triumphant.
//   Grail of Sorrow (Vampire / Zombie / Spirit / Skeleton) - mourning and
//     melancholic. Grief carried rather than performed. Vampires are formal and
//     tired, never flippant or arch.
//   Choir of the Cursed (Demon / Court / Choir / Beast) - greedy and
//     self-serving. Everything is a price, a debt, a share owed to them.
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
  // Old blood, older grief. They kill the way a physician works: precisely, and
  // without appetite for it. Blood is a sacrament they are tired of taking.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Demon' },
    lines: [
      'Your blood is smoke. There is nothing in you to mourn.',
      'Burnt through. Even your veins were sold.',
      'I take no sacrament from a thing that made itself.',
      'You were owed a death long before I came.',
      'Ash, where the grief should be.',
    ],
    lines_ru: [
      'Твоя кровь — дым. В тебе не о чем горевать.',
      'Выжжен дотла. Даже вены твои проданы.',
      'Я не приму причастия от того, кто сделал себя сам.',
      'Смерть задолжали тебе задолго до меня.',
      'Пепел там, где должно быть горе.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Knight' },
    lines: [
      'Iron does not answer for the man inside it.',
      'You swore to a house that is already dust.',
      'I have buried braver men. I remember each of them.',
      'Your blood is warm. That is the whole of your advantage.',
      'Lower the shield. It changes nothing, but you will tire less.',
    ],
    lines_ru: [
      'Железо не отвечает за того, кто внутри.',
      'Ты присягнул дому, что давно обратился в прах.',
      'Я хоронил и храбрее. Я помню каждого.',
      'Твоя кровь тёплая. В этом всё твоё преимущество.',
      'Опусти щит. Это ничего не изменит, но ты меньше устанешь.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Holy' },
    lines: [
      'Your god is listening. He simply will not come.',
      'I prayed once, in your language. It changed nothing.',
      'Faith is only grief that refuses to sit down.',
      'You are certain. I envy that more than the blood.',
      'Bleed, then. Perhaps He answers to that.',
    ],
    lines_ru: [
      'Твой бог слышит. Он просто не придёт.',
      'Я тоже молился — на твоём языке. Это ничего не изменило.',
      'Вера — лишь горе, которое не желает присесть.',
      'Ты уверен. Этому я завидую больше, чем крови.',
      'Что ж, истекай. Быть может, на это Он и отзовётся.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Zombie' },
    lines: [
      'Rest. You have carried this long enough.',
      'We were one house once. I have not forgotten.',
      'No blood left in you, brother. Only the walking.',
      'I do this gently. It is all that remains to me.',
    ],
    lines_ru: [
      'Отдохни. Ты нёс это достаточно долго.',
      'Когда-то мы были одним домом. Я не забыл.',
      'В тебе не осталось крови, брат. Только ход.',
      'Я делаю это мягко. Больше мне ничего не осталось.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Construct' },
    lines: [
      'Nothing in you to grieve. It makes the work quicker.',
      'No blood, no name, no rest owed to you.',
      'Someone built you to spare himself the standing here.',
      'I break machines the way I break silence. Without pleasure.',
    ],
    lines_ru: [
      'В тебе не о чем горевать. Работа идёт быстрее.',
      'Ни крови, ни имени, ни причитающегося покоя.',
      'Тебя собрали, чтобы кому-то не стоять здесь самому.',
      'Я ломаю машины, как ломаю тишину. Без удовольствия.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire' }, target: { tag: 'Holy' },
    lines: [
      'He died certain. That is a mercy I was never given.',
      'Your god has him now. Ask what took so long.',
      'Say the rites yourselves. I no longer remember them.',
      'A clean death, and still no one comes for the body.',
    ],
    lines_ru: [
      'Он умер уверенным. Такой милости мне не досталось.',
      'Теперь он у вашего бога. Спросите, отчего так долго.',
      'Прочтите обряд сами. Я его больше не помню.',
      'Чистая смерть — и всё равно за телом никто не придёт.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire' }, target: { tag: 'Demon' },
    lines: [
      'A debt closed. Not mine, but closed.',
      'It ends as smoke. There is nothing to bury.',
      'Whatever bargain made you is settled now.',
    ],
    lines_ru: [
      'Долг закрыт. Не мой, но закрыт.',
      'Кончается дымом. Хоронить нечего.',
      'Какая бы сделка тебя ни создала — она исполнена.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire' },
    lines: [
      'Close his eyes. We are not animals.',
      'One more name I will keep, and no one will ask for.',
      'It is done. Do not make me say it twice.',
      'He is quiet now. I remember wanting that.',
    ],
    lines_ru: [
      'Закройте ему глаза. Мы не звери.',
      'Ещё одно имя, что я сохраню и о котором никто не спросит.',
      'Кончено. Не заставляй меня повторять.',
      'Теперь он тих. Я помню, как хотел того же.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Vampire' },
    lines: [
      'At last. I had begun to think it would not come.',
      'Do not carry me home. There is no home.',
      'Tell the house I lasted. That is all they ask.',
      'So this is the taste of it. Ordinary.',
    ],
    lines_ru: [
      'Наконец-то. Я уже думал, оно не придёт.',
      'Не несите меня домой. Дома нет.',
      'Скажите дому, что я выстоял. Большего они не просят.',
      'Так вот каков её вкус. Обыкновенный.',
    ],
  },

  // ===========================================================================
  // GRAIL OF SORROW - THE RISEN (Zombie)
  // Slow, patient, sorry. They remember being people, and it does not help.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Zombie' }, target: { tag: 'Holy' },
    lines: [
      'We were buried in your ground. We came back through it.',
      'You blessed this field once. It did not hold.',
      'Your prayers are heavy. We are heavier.',
    ],
    lines_ru: [
      'Нас похоронили в вашей земле. Мы вернулись сквозь неё.',
      'Ты освятил это поле однажды. Оно не удержало.',
      'Ваши молитвы тяжелы. Мы тяжелее.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Zombie' },
    lines: [
      'We do not tire. That is the whole of the sorrow.',
      'Stand aside. We would rather not.',
      'It hurts. We carry it anyway.',
      'We have been walking toward you for years.',
    ],
    lines_ru: [
      'Мы не устаём. В этом всё горе.',
      'Отойди. Нам не хочется этого делать.',
      'Больно. Мы всё равно это несём.',
      'Мы шли к тебе годами.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Zombie' },
    lines: [
      'Down. Now you know the weight.',
      'Leave him. The ground takes its own.',
      'One fewer to grieve for later.',
    ],
    lines_ru: [
      'Лежи. Теперь ты знаешь этот вес.',
      'Оставьте его. Земля берёт своё.',
      'Одним, о ком горевать после, меньше.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Zombie' },
    lines: [
      'Finally. Let me stay down.',
      'I remembered my name near the end. I would rather not have.',
      'Do not raise me again.',
    ],
    lines_ru: [
      'Наконец-то. Дайте остаться лежать.',
      'Под конец я вспомнил своё имя. Лучше бы не вспоминал.',
      'Не поднимайте меня снова.',
    ],
  },

  // ===========================================================================
  // GRAIL OF SORROW - THE BONE ORDER (Skeleton)
  // What is left once the grief has worn even the flesh off. Dry and formal.
  // (These rules were tagged `Undead`, which no unit carries - they never fired
  // once. Retagged to Skeleton, which is the real tag.)
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Skeleton' },
    lines: [
      'I kept the oath. I did not keep the rest of me.',
      'You will be this light one day. It is no worse.',
      'The war ended. No one came to tell the dead.',
      'Strike the bone. There is nothing behind it to spare.',
    ],
    lines_ru: [
      'Клятву я сохранил. Всё остальное — нет.',
      'Однажды и ты станешь таким же лёгким. Это не хуже.',
      'Война кончилась. Мёртвым сообщить забыли.',
      'Бей в кость. За ней нечего щадить.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Skeleton' },
    lines: [
      'Another kept waiting. He will learn patience.',
      'Marked. The roll of the dead is longer than yours.',
      'He goes where we go. He simply arrives rested.',
    ],
    lines_ru: [
      'Ещё одного заставили ждать. Научится терпению.',
      'Записан. Список мёртвых длиннее вашего.',
      'Он идёт туда же, куда и мы. Просто прибудет отдохнувшим.',
    ],
  },

  // ===========================================================================
  // GRAIL OF SORROW - THE MOURNING DEAD (Spirit without Holy)
  // Empire spirits are Spirit+Holy and speak in the Empire section below; these
  // are the Grail's ghosts - unfinished, quiet, sorry to be here at all.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Spirit', not: ['Holy'] },
    lines: [
      'I am only finishing what was interrupted.',
      'You cannot wound what is already the wound.',
      'I do not remember your face. I will not remember this either.',
      'Cold, is it not. I stopped noticing.',
    ],
    lines_ru: [
      'Я лишь заканчиваю прерванное.',
      'Нельзя ранить то, что само — рана.',
      'Я не помню твоего лица. И этого не запомню.',
      'Холодно, правда? Я перестал замечать.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Spirit', not: ['Holy'] }, target: { tag: 'Holy' },
    lines: [
      'Your light passes through. Everything does.',
      'I was consecrated too. Look what it bought.',
      'Pray louder. I want to hear whether it still works.',
    ],
    lines_ru: [
      'Твой свет проходит насквозь. Как и всё остальное.',
      'Меня тоже освящали. Погляди, что это дало.',
      'Молись громче. Хочу услышать, работает ли ещё.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Spirit', not: ['Holy'] },
    lines: [
      'Oh. It was this simple all along.',
      'Do not follow me. There is very little here.',
      'Let me go quiet this time.',
    ],
    lines_ru: [
      'Вот как. Оказывается, всё было так просто.',
      'Не иди за мной. Здесь почти ничего нет.',
      'Дайте мне уйти тихо на этот раз.',
    ],
  },
  {
    trigger: 'attack', actor: { tags: ['Knight', 'Zombie'] },
    lines: [
      'The oath outlived the man. Only the oath is still standing.',
      'I served this house alive. The terms did not change.',
      'My lord released me. I did not go.',
    ],
    lines_ru: [
      'Клятва пережила человека. Стоять осталась только она.',
      'Я служил этому дому живым. Условия не изменились.',
      'Господин освободил меня. Я не ушёл.',
    ],
  },

  // ===========================================================================
  // EMPIRE - THE FAITHFUL (Holy)
  // Militant, stoic, unhurried. Nothing here is triumphant; it is work.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Demon' },
    lines: [
      'You were let in. We are the ones who close the door.',
      'No bargain. No terms. Down.',
      'I have read your name in the ledgers. It is shorter than you think.',
      'Hold the line. It is only fire.',
      'Nothing you offer is worth the taking.',
    ],
    lines_ru: [
      'Тебя впустили. Мы — те, кто закрывает дверь.',
      'Ни сделки, ни условий. На землю.',
      'Я читал твоё имя в списках. Оно короче, чем ты думаешь.',
      'Держать строй. Это всего лишь огонь.',
      'Ничто из предложенного тобой не стоит того, чтобы брать.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Vampire' },
    lines: [
      'Your grief is not our concern. Your teeth are.',
      'You had centuries to stop. You did not.',
      'We do not hate you. We simply do not yield.',
      'Sorrow is no defence. Step back or fall.',
    ],
    lines_ru: [
      'Твоё горе — не наша забота. Твои клыки — наша.',
      'У тебя были века, чтобы остановиться. Ты не остановился.',
      'Мы не ненавидим тебя. Мы просто не уступаем.',
      'Скорбь — не защита. Отступи или пади.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Skeleton' },
    lines: [
      'You were a soldier once. Stand down and be buried properly.',
      'Rest is not a favour. It is an order.',
      'Whoever kept you here answers for it. Not you.',
    ],
    lines_ru: [
      'Когда-то ты был солдатом. Отступи и будь похоронен по-людски.',
      'Покой — не одолжение. Это приказ.',
      'Отвечает тот, кто удержал тебя здесь. Не ты.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Zombie' },
    lines: [
      'This is not cruelty. This is the burial they were denied.',
      'Steady. Aim for what holds it up.',
      'Someone loved this one. Do it cleanly.',
    ],
    lines_ru: [
      'Это не жестокость. Это погребение, в котором им отказали.',
      'Спокойно. Бей туда, где оно держится.',
      'Кто-то любил его. Сделай это чисто.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Spirit' },
    lines: [
      'Whatever holds you, I will cut it. Then go.',
      'You are late for your own funeral.',
      'The war is over for you. Accept it.',
    ],
    lines_ru: [
      'Что бы тебя ни держало — я это перережу. Потом иди.',
      'Ты опоздал на собственные похороны.',
      'Для тебя война окончена. Прими это.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Holy' }, target: { tag: 'Demon' },
    lines: [
      'Sent back. Note the hour.',
      'One door shut. There are others.',
      'It ends as it began - uninvited.',
    ],
    lines_ru: [
      'Отправлен назад. Отметьте час.',
      'Одна дверь закрыта. Есть и другие.',
      'Кончается тем же, чем началось, — незваным.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Holy' }, target: { tag: 'Skeleton' },
    lines: [
      'Buried. Late, but buried.',
      'Rest, soldier. Your watch is relieved.',
      'Mark the ground. Someone may still come looking.',
    ],
    lines_ru: [
      'Погребён. Поздно, но погребён.',
      'Покойся, солдат. Твой караул снят.',
      'Отметьте место. Кто-то ещё может прийти за ним.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Holy' },
    lines: [
      'Hold the line. Mine is finished.',
      'No last words. Close the gap.',
      'I was not owed more time than this.',
      'Tell them the line held.',
    ],
    lines_ru: [
      'Держите строй. Мой окончен.',
      'Без последних слов. Сомкнуть ряды.',
      'Мне не было обещано больше времени.',
      'Скажите им: строй устоял.',
    ],
  },

  // ===========================================================================
  // EMPIRE - THE ORDERS (Knight)
  // The `not` gate keeps Grail and Choir knights out of the Empire's voice.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Knight', not: ['Skeleton', 'Zombie', 'Demon', 'Vampire'] },
    lines: [
      'Hold. Step. Hold.',
      'Nothing clever. Just forward.',
      'The line is where I am standing.',
      'I have done this since I was fifteen.',
      'Take ground. Keep it.',
    ],
    lines_ru: [
      'Держать. Шаг. Держать.',
      'Никаких хитростей. Только вперёд.',
      'Строй — там, где стою я.',
      'Я делаю это с пятнадцати лет.',
      'Взять землю. Удержать.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Knight', not: ['Skeleton', 'Zombie', 'Demon', 'Vampire'] }, target: { tag: 'Demon' },
    lines: [
      'I have no interest in what you are offering.',
      'Shield up. It burns; it does not break through.',
      'You are not the first thing to come out of that hole.',
    ],
    lines_ru: [
      'Мне неинтересно то, что ты предлагаешь.',
      'Щит выше. Жжёт — но не пробивает.',
      'Ты не первое, что вылезло из той дыры.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Knight', not: ['Skeleton', 'Zombie'] },
    lines: [
      'Someone take the left. Now.',
      'Do not carry me. Carry the line.',
      'That is all I had. It was enough for today.',
      'Finish it. I will wait here.',
    ],
    lines_ru: [
      'Кто-нибудь — на левый фланг. Сейчас.',
      'Не несите меня. Несите строй.',
      'Это всё, что у меня было. На сегодня хватило.',
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
      'I was relieved of my body. Not of my post.',
      'The Empire keeps its dead on the roster.',
      'Death changed the duty roster. Nothing else.',
    ],
    lines_ru: [
      'Меня освободили от тела. Не от поста.',
      'Империя держит своих мёртвых в списках.',
      'Смерть изменила расписание караулов. И только.',
    ],
  },
  {
    trigger: 'death', actor: { tags: ['Spirit', 'Holy'] },
    lines: [
      'Second time. Still facing the right way.',
      'Strike my name properly this time.',
    ],
    lines_ru: [
      'Второй раз. И снова лицом куда надо.',
      'На этот раз вычеркните имя как следует.',
    ],
  },

  // ===========================================================================
  // EMPIRE - THE WORKSHOPS (Engineer)
  // Tradesmen at war. Dry, procedural, quietly proud of the equipment.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Engineer' },
    lines: [
      'Ranged, sighted, done. Next.',
      'Powder is cheaper than courage and works further out.',
      'It is not brave. It is accurate.',
      'Hold still. It shortens the paperwork.',
    ],
    lines_ru: [
      'Дистанция, прицел, готово. Следующий.',
      'Порох дешевле храбрости и бьёт дальше.',
      'Это не храбро. Это точно.',
      'Стой смирно. Меньше бумаг потом.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Engineer' }, target: { tag: 'Construct' },
    lines: [
      'Poor work. Whoever built you cut the joints.',
      'I have repaired better and scrapped worse.',
      'Every machine has a seam. There it is.',
    ],
    lines_ru: [
      'Скверная работа. Кто тебя собирал, сэкономил на сочленениях.',
      'Я чинил и получше, и списывал похуже.',
      'У всякой машины есть шов. Вот он.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Engineer' }, target: { tag: 'Demon' },
    lines: [
      'Sulphur and hot iron. I work with both daily.',
      'You are not unnatural. You are poorly contained.',
      'Fire I understand. Stand still.',
    ],
    lines_ru: [
      'Сера и раскалённое железо. Я с обоими работаю каждый день.',
      'Ты не противоестественен. Ты плохо изолирован.',
      'Огонь я понимаю. Стой смирно.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Engineer' },
    lines: [
      'Down. Log it.',
      'The instrument performed as intended.',
      'Barrel is fouling. Bring the rod.',
    ],
    lines_ru: [
      'Готов. Занесите в журнал.',
      'Изделие сработало как задумано.',
      'Ствол засоряется. Подайте шомпол.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Engineer' },
    lines: [
      'The plans are in the third case. Do not lose them.',
      'Do not let them take the gun.',
      'Tell the shop it was not the mechanism.',
    ],
    lines_ru: [
      'Чертежи в третьем ящике. Не потеряйте.',
      'Не отдавайте им орудие.',
      'Передайте в мастерскую: дело было не в механизме.',
    ],
  },

  // ===========================================================================
  // EMPIRE - THE ENGINES (Construct without Demon)
  // Imperial machines. Flat and procedural; they claim no personality.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Construct', not: ['Demon'] },
    lines: [
      'Target acknowledged. Proceeding.',
      'No fatigue. No fear. Continue.',
      'This unit does not withdraw.',
      'Force applied. Repeating.',
    ],
    lines_ru: [
      'Цель принята. Выполняю.',
      'Усталости нет. Страха нет. Продолжаю.',
      'Этот механизм не отступает.',
      'Усилие приложено. Повторяю.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Construct', not: ['Demon'] },
    lines: [
      'Target ended. Awaiting next.',
      'Efficient. Reloading.',
      'One removed from the count.',
    ],
    lines_ru: [
      'Цель уничтожена. Жду следующую.',
      'Эффективно. Перезарядка.',
      'Одним в списке меньше.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Construct', not: ['Demon'] },
    lines: [
      'Frame failing. Salvage the core.',
      'This unit is spent. Others remain.',
      'Recoverable. Send the wagons.',
    ],
    lines_ru: [
      'Каркас отказывает. Снимите сердечник.',
      'Механизм выработан. Остальные — на ходу.',
      'Подлежит восстановлению. Пришлите повозки.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Archer' },
    lines: [
      'Ranged and marked.',
      'The wind is steady. So am I.',
      'You had a hundred paces to reconsider.',
    ],
    lines_ru: [
      'Дистанция взята, цель отмечена.',
      'Ветер ровный. Я тоже.',
      'У тебя было сто шагов, чтобы передумать.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Archer' },
    lines: [
      'Down at range. Next mark.',
      'One shaft, one man. As trained.',
      'Recover the arrow if you can.',
    ],
    lines_ru: [
      'Снят на дистанции. Следующая цель.',
      'Одна стрела, один человек. Как учили.',
      'Стрелу подберите, если сможете.',
    ],
  },

  // ===========================================================================
  // CHOIR OF THE CURSED - DEMONS
  // Everything is a transaction, and they intend to collect. Greed, not glee.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Holy' },
    lines: [
      'Your god pays nothing. Mine pays in advance.',
      'Faith is the one currency no one will exchange for you.',
      'Everything you were given, someone else is still paying for.',
      'Name your price. I know you have one.',
      'You die poor. That is the insult, not the dying.',
    ],
    lines_ru: [
      'Твой бог не платит. Мой платит вперёд.',
      'Вера — единственная монета, которую за тебя никто не разменяет.',
      'За всё, что тебе дали, до сих пор платит кто-то другой.',
      'Назови цену. Я знаю, она у тебя есть.',
      'Ты умираешь нищим. Вот в чём оскорбление, а не в смерти.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Knight' },
    lines: [
      'That armour is worth more than the man wearing it.',
      'You serve for wages. I serve for shares.',
      'Someone bought your loyalty cheaply. I would have paid more.',
      'Set it down. I am taking it either way.',
    ],
    lines_ru: [
      'Эти доспехи стоят больше, чем тот, кто в них.',
      'Ты служишь за жалованье. Я — за долю.',
      'Кто-то дёшево купил твою верность. Я дал бы больше.',
      'Клади на землю. Я всё равно это заберу.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Vampire' },
    lines: [
      'All that grief, and not one thing to show for it.',
      'You inherited. I earned. That is the difference.',
      'Your house is bankrupt and still holding funerals.',
      'Mourn on your own coin.',
    ],
    lines_ru: [
      'Столько горя — и ни единого приобретения.',
      'Ты унаследовал. Я заработал. В этом разница.',
      'Твой дом разорён и всё ещё справляет похороны.',
      'Скорби за свой счёт.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Caster' },
    lines: [
      'Power on loan. I hold the note.',
      'You rent what I own outright.',
      'Every word you say costs you. I am counting.',
    ],
    lines_ru: [
      'Сила взаймы. Расписка у меня.',
      'Ты арендуешь то, чем я владею целиком.',
      'Каждое твоё слово тебе стоит. Я считаю.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Construct' },
    lines: [
      'No soul in it. Nothing worth collecting.',
      'Scrap value only. Disappointing.',
      'Someone spent good iron to avoid a good bargain.',
    ],
    lines_ru: [
      'Души нет. Взыскивать нечего.',
      'Только цена лома. Досадно.',
      'Кто-то потратил доброе железо, лишь бы не заключать сделку.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Demon' }, target: { tag: 'Holy' },
    lines: [
      'Collected. He argued the terms to the end.',
      'His god declined to match my offer.',
      'That one was owed to me twice over.',
    ],
    lines_ru: [
      'Взыскано. Он спорил об условиях до конца.',
      'Его бог отказался перебить мою цену.',
      'Этот был должен мне дважды.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Demon' },
    lines: [
      'Mine. Note it against my share.',
      'Paid in full, and early.',
      'One more than my brother has taken.',
      'Nothing left worth splitting.',
    ],
    lines_ru: [
      'Мой. Запишите в мою долю.',
      'Уплачено сполна и досрочно.',
      'На одного больше, чем взял мой брат.',
      'Делить больше нечего.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Demon' },
    lines: [
      'My share - someone see that it is held.',
      'This was not the agreement.',
      'I go back owed. I always come back owed.',
      'Take it from his portion. Not mine.',
    ],
    lines_ru: [
      'Моя доля — проследите, чтобы её сохранили.',
      'Уговор был не такой.',
      'Ухожу кредитором. Я всегда возвращаюсь кредитором.',
      'Вычтите из его части. Не из моей.',
    ],
  },

  // ===========================================================================
  // CHOIR OF THE CURSED - THE COURT & THE CHOIR
  // The ones who own the contracts rather than sign them.
  // ===========================================================================
  {
    trigger: 'attack', actor: { tag: 'Court' },
    lines: [
      'I do not fight. I foreclose.',
      'You are standing on something that belongs to me.',
      'I have owned better men for less.',
      'Address me properly. It affects the price.',
    ],
    lines_ru: [
      'Я не сражаюсь. Я взыскиваю.',
      'Ты стоишь на том, что принадлежит мне.',
      'Я владел людьми получше и дешевле.',
      'Обращайся ко мне как должно. Это влияет на цену.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Court' }, target: { tag: 'Holy' },
    lines: [
      'Your order took my money for three hundred years.',
      'Piety is the cheapest thing your church sells.',
      'I have bought bishops. You are not expensive.',
    ],
    lines_ru: [
      'Твой орден брал мои деньги триста лет.',
      'Благочестие — самое дешёвое, что продаёт твоя церковь.',
      'Я покупал епископов. Ты недорог.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Choir' },
    lines: [
      'Every voice in the Choir is paid. Yours is not.',
      'Sing or settle. I accept either.',
      'The chord is owed a note. You will provide it.',
    ],
    lines_ru: [
      'Каждому голосу в Хоре платят. Твоему — нет.',
      'Пой или расплачивайся. Я приму и то и другое.',
      'Аккорду недостаёт ноты. Ты её дашь.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Choir' },
    lines: [
      'Added to the chord. He sings for me now.',
      'A voice acquired. Cheaply.',
      'The Choir grows. My share grows with it.',
    ],
    lines_ru: [
      'Добавлен в аккорд. Теперь он поёт за меня.',
      'Голос приобретён. Задёшево.',
      'Хор растёт. Вместе с ним растёт и моя доля.',
    ],
  },
  {
    trigger: 'attack', actor: { tags: ['Construct', 'Demon'] },
    lines: [
      'I was carved to guard property. You are not it.',
      'The stone was paid for. The stone collects.',
      'Off the threshold. It is not yours.',
    ],
    lines_ru: [
      'Меня высекли охранять имущество. Ты в него не входишь.',
      'За камень заплачено. Камень взыскивает.',
      'Прочь с порога. Он не твой.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Beast' },
    lines: [
      'Whatever falls, I keep.',
      'A small share is still a share.',
      'I bite low. No one watches the ankles.',
    ],
    lines_ru: [
      'Что упадёт — моё.',
      'Малая доля — тоже доля.',
      'Я кусаю низко. За лодыжками никто не следит.',
    ],
  },

  // ===========================================================================
  // NAMED UNITS - always outrank any tag rule above.
  // ===========================================================================
  {
    trigger: 'attack', actor: { name: 'Paladin' }, target: { tag: 'Demon' },
    lines: [
      'I have held this ground before. I will hold it again.',
      'There is no bargain here. Only the wall.',
      'You will not pass the shield.',
    ],
    lines_ru: [
      'Я держал эту землю прежде. Удержу и теперь.',
      'Здесь не торгуются. Здесь стоят стеной.',
      'Через щит ты не пройдёшь.',
    ],
  },
  {
    trigger: 'kill', actor: { name: 'Paladin' }, target: { tag: 'Demon' },
    lines: [
      'Closed. Reform on me.',
      'One less debt for the world to carry.',
      'It is done. Do not stand and look at it.',
    ],
    lines_ru: [
      'Закрыто. Строиться на меня.',
      'Одним долгом мира меньше.',
      'Кончено. Не стойте и не смотрите.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Inquisitor' },
    lines: [
      'I asked once. That was the courtesy.',
      'Your answers are noted. They did not help you.',
      'I take no pleasure in this. I take responsibility for it.',
    ],
    lines_ru: [
      'Я спросил один раз. Это и была любезность.',
      'Твои ответы записаны. Они тебе не помогли.',
      'Я не нахожу в этом удовольствия. Я беру за это ответственность.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Blood Knight' }, target: { tag: 'Holy' },
    lines: [
      'I wore that colour once. It kept no one alive.',
      'We knelt in the same chapel. Only one of us got up.',
      'Do not preach. I know the words better than you do.',
    ],
    lines_ru: [
      'Я тоже носил этот цвет. Он никого не уберёг.',
      'Мы преклоняли колени в одной часовне. Поднялся только один.',
      'Не проповедуй. Я знаю эти слова лучше тебя.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Necromancer' },
    lines: [
      'I did not raise them for war. War is simply what was left.',
      'They were going to be forgotten. I refused.',
      'Someone has to keep the dead. No one else volunteered.',
    ],
    lines_ru: [
      'Я поднял их не для войны. Просто ничего другого не осталось.',
      'Их собирались забыть. Я отказался.',
      'Кто-то должен хранить мёртвых. Добровольцев больше не нашлось.',
    ],
  },
  {
    trigger: 'kill', actor: { name: 'Necromancer' },
    lines: [
      'Do not bury him. He will be needed by morning.',
      'Another name for the roll. I keep all of them.',
      'He is not gone. That is the trouble with my work.',
    ],
    lines_ru: [
      'Не хороните его. К утру он понадобится.',
      'Ещё одно имя в перекличку. Я храню их все.',
      'Он не ушёл. В этом и беда моего ремесла.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Malgrath the Undying' },
    lines: [
      'I have outlasted your gods, your kings, and their heirs.',
      'Undying is not a boast. It is a sentence I stopped appealing.',
      'Continue. I am curious how you imagine this ends.',
    ],
    lines_ru: [
      'Я пережил ваших богов, ваших королей и их наследников.',
      'Бессмертие — не похвальба. Это приговор, который я перестал обжаловать.',
      'Продолжай. Мне любопытно, чем, по-твоему, это кончится.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Imp' },
    lines: [
      'I only want what falls. Drop something.',
      'The Baron takes the soul. I take the purse.',
      'You will not miss the small things. You never do.',
    ],
    lines_ru: [
      'Мне нужно лишь то, что упадёт. Урони что-нибудь.',
      'Барон берёт душу. Я беру кошель.',
      'Мелочи ты не хватишься. Ты никогда не хватаешься.',
    ],
  },
  {
    trigger: 'death', actor: { name: 'Imp' },
    lines: [
      'My share. Someone hold my share.',
      'I had almost enough.',
    ],
    lines_ru: [
      'Моя доля. Пусть кто-нибудь сбережёт мою долю.',
      'Мне почти хватило.',
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
      'Not today. Get up.',
    ],
    lines_ru: [
      'Держись. Я рядом.',
      'Дыши. Медленно. Ещё раз.',
      'Не сегодня. Вставай.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { name: 'Priest' },
    lines: [
      'You are not finished. Stand.',
      'The wound is closed. The duty is not.',
      'Back to the line when you can walk.',
    ],
    lines_ru: [
      'Ты ещё не закончил. Встань.',
      'Рана закрыта. Долг — нет.',
      'В строй, как только сможешь идти.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Holy' },
    lines: [
      'Hold on. That is an order.',
      'Pressure here. Do not look at it.',
      'We do not leave men on the ground.',
      'You will keep. Move up.',
    ],
    lines_ru: [
      'Держись. Это приказ.',
      'Прижми здесь. Не смотри туда.',
      'Мы не оставляем своих на земле.',
      'Дотянешь. Вперёд.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Vampire' },
    lines: [
      'Not you. Not while I can prevent it.',
      'I have buried enough of this house.',
      'Stay a while longer. Please.',
    ],
    lines_ru: [
      'Только не ты. Не пока я могу это предотвратить.',
      'Я похоронил уже достаточно этого дома.',
      'Побудь ещё немного. Прошу.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Demon' },
    lines: [
      'You are worth more standing. Stand.',
      'I am not spending this for nothing. Earn it.',
      'Consider it a loan. I will name the terms later.',
    ],
    lines_ru: [
      'Стоя ты стоишь дороже. Встань.',
      'Я трачу это не даром. Отработай.',
      'Считай это займом. Условия назову позже.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Engineer' },
    lines: [
      'Bleeding stopped. Do not test the seal.',
      'Patched. It will hold if you do not run.',
      'Good enough for the field. See a surgeon after.',
    ],
    lines_ru: [
      'Кровь остановлена. Не проверяй шов на прочность.',
      'Заштопано. Продержится, если не побежишь.',
      'Для поля сойдёт. Потом — к лекарю.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Zombie' },
    lines: [
      'Stay on this side a while longer.',
      'I know the other road. Not yet.',
      'The ground can wait. I told it so.',
    ],
    lines_ru: [
      'Побудь на этой стороне ещё немного.',
      'Я знаю ту дорогу. Ещё рано.',
      'Земля подождёт. Я ей так и сказал.',
    ],
  },
];

export { COMBAT_BARKS, BARK_CHANCES, HEAL_BARK_THRESHOLD_PCT };