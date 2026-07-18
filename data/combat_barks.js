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
//   not:  'Undead' | []    excludes units carrying any of these tags
//   omit the filter entirely to match anything
//
// Specificity (higher wins, ties are pooled together):
//   +100 name, +2 per tag, +0 per `not` (a gate only), on each of actor and
//   target. A named rule therefore always beats any tag rule.
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
  // ---------------------------------------------------------------------------
  // VAMPIRES - blood is the lens they see everything through. Demon blood burns,
  // undead blood is worthless, holy blood is a delicacy and a dare.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Demon' },
    lines: [
      'Your blood burns going down!',
      'Ash and cinders — is that all you are?',
      'You bleed embers. How disappointing.',
      'Even your veins run hot with spite.',
      'Foul vintage. I will drink it anyway.',
    ],
    lines_ru: [
      'Твоя кровь обжигает горло!',
      'Пепел и угли — это всё, что в тебе есть?',
      'Ты истекаешь угольками. Какое разочарование.',
      'Даже твои вены полны злобы.',
      'Скверный урожай. Но я всё равно выпью.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Knight' },
    lines: [
      'All that iron, and still so much throat.',
      'Your vows taste of milk, little knight.',
      'Take off the helm. I want to see your face empty.',
      'Chivalry bleeds the same as cowardice.',
      'Such a polished shell. Let us see the meat.',
    ],
    lines_ru: [
      'Столько железа — а горло всё равно открыто.',
      'Твои клятвы отдают молоком, рыцарёк.',
      'Сними шлем. Хочу видеть, как гаснет твоё лицо.',
      'Благородство кровоточит так же, как трусость.',
      'Такой отполированный панцирь. Взглянем на мясо.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Holy' },
    lines: [
      'Sanctified blood — my favourite vintage.',
      'Pray louder. I want to hear your pulse quicken.',
      'Your god is not watching. I checked.',
      'Consecrated, and still warm. Exquisite.',
      'Light cannot fill a body once it is empty.',
    ],
    lines_ru: [
      'Освящённая кровь — мой любимый урожай.',
      'Молись громче. Хочу слышать, как частит твой пульс.',
      'Твой бог не смотрит. Я проверил.',
      'Освящённая и ещё тёплая. Изысканно.',
      'Свет не наполнит тело, когда оно опустеет.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Zombie' },
    lines: [
      'Curdled. Spoiled. Utterly beneath me.',
      'There is nothing in you worth the drinking.',
      'You are a corpse that forgot to lie down.',
      'Not even hunger would stoop to you.',
    ],
    lines_ru: [
      'Свернувшаяся. Прокисшая. Совершенно недостойна меня.',
      'В тебе нет ничего, что стоило бы пить.',
      'Ты труп, забывший лечь.',
      'Даже голод не опустится до тебя.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Construct' },
    lines: [
      'No blood. No sport. Just work.',
      'Whoever built you denied me my supper.',
      'A body with nothing to give. How rude.',
    ],
    lines_ru: [
      'Ни крови. Ни забавы. Только работа.',
      'Тот, кто собрал тебя, лишил меня ужина.',
      'Тело, которому нечего дать. Как грубо.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire' }, target: { tag: 'Holy' },
    lines: [
      'Your light is mine now. Every drop.',
      'Sanctity drains as easily as sin.',
      'Sleep. Your god will not miss one more.',
    ],
    lines_ru: [
      'Твой свет теперь мой. До капли.',
      'Святость иссякает так же легко, как грех.',
      'Спи. Твой бог не заметит пропажи ещё одного.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire' }, target: { tag: 'Demon' },
    lines: [
      'Back to the ash you crawled from.',
      'Burnt on the tongue — but swallowed all the same.',
    ],
    lines_ru: [
      'Назад в пепел, из которого ты выполз.',
      'Обжигает язык — но всё же проглочено.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire' },
    lines: [
      'Still warm. Just how I like it.',
      'You were never anything but a cup.',
      'Thank you. Truly.',
    ],
    lines_ru: [
      'Ещё тёплая. Как я люблю.',
      'Ты никогда не был ничем, кроме чаши.',
      'Спасибо. Искренне.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Vampire' },
    lines: [
      'I have died before. It never takes.',
      'The night… remembers…',
      'You have merely… postponed… my thirst…',
    ],
    lines_ru: [
      'Я уже умирал. Это никогда не приживается.',
      'Ночь… помнит…',
      'Ты лишь… отсрочил… мою жажду…',
    ],
  },

  // ---------------------------------------------------------------------------
  // DEMONS - contempt for the divine, delight in ruin, grudging respect for iron.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Holy' },
    lines: [
      'Scream for your god! I want him to hear!',
      'Your prayers are kindling. Nothing more.',
      'Every hymn ends in a wet sound.',
      'Heaven is not listening. I am.',
      'Burn, and call it a blessing.',
    ],
    lines_ru: [
      'Кричи своему богу! Пусть услышит!',
      'Твои молитвы — растопка. Не более.',
      'Каждый гимн кончается влажным звуком.',
      'Небеса не слушают. Слушаю я.',
      'Гори и зови это благословением.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Knight' },
    lines: [
      'Your oath will not hold the pieces together.',
      'Honour is such a heavy thing to carry. Let me help.',
      'Tin man. Tin heart. Tin end.',
      'I have broken better vows on worse days.',
    ],
    lines_ru: [
      'Твоя клятва не скрепит осколки.',
      'Честь так тяжело нести. Позволь помочь.',
      'Жестяной болван. Жестяное сердце. Жестяной конец.',
      'Я ломал клятвы получше в дни похуже.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Vampire' },
    lines: [
      'Bloodsucker. You are a parasite on a corpse.',
      'You stole your immortality. I was born to mine.',
      'All that hunger, and nothing to show for it.',
    ],
    lines_ru: [
      'Кровосос. Ты паразит на трупе.',
      'Ты украл своё бессмертие. Я рождён со своим.',
      'Столько голода — и ничего взамен.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Caster' },
    lines: [
      'Borrowed power. Watch me take it back.',
      'You read about fire. I *am* fire.',
      'Put the book down and burn properly.',
    ],
    lines_ru: [
      'Заёмная сила. Смотри, как я её отберу.',
      'Ты читал об огне. Я и *есть* огонь.',
      'Отложи книгу и гори как следует.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Construct' },
    lines: [
      'Someone made you. That is your first mistake.',
      'Let us see how the seams hold.',
    ],
    lines_ru: [
      'Тебя кто-то создал. Это твоя первая ошибка.',
      'Посмотрим, как держатся швы.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Demon' }, target: { tag: 'Holy' },
    lines: [
      'And the light goes out. As it always does.',
      'Tell your god who sent you.',
      'One less voice in the choir.',
    ],
    lines_ru: [
      'И свет гаснет. Как всегда.',
      'Скажи своему богу, кто тебя послал.',
      'Одним голосом в хоре меньше.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Demon' },
    lines: [
      'Ash. Ash and quiet.',
      'The abyss thanks you for your donation.',
      'Was that all?',
    ],
    lines_ru: [
      'Пепел. Пепел и тишина.',
      'Бездна благодарит за пожертвование.',
      'И это всё?',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Demon' },
    lines: [
      'I go back… and I will come again…',
      'The abyss… is patient…',
      'You have killed nothing. You have only sent me home.',
    ],
    lines_ru: [
      'Я возвращаюсь… и вернусь снова…',
      'Бездна… терпелива…',
      'Ты никого не убил. Ты лишь отправил меня домой.',
    ],
  },

  // ---------------------------------------------------------------------------
  // HOLY - righteous, and increasingly less patient the worse the target is.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Demon' },
    lines: [
      'Back to the pit, abomination!',
      'The light does not negotiate!',
      'You have no place beneath this sky!',
      'Every wound I give is a prayer answered.',
    ],
    lines_ru: [
      'Назад в яму, мерзость!',
      'Свет не ведёт переговоров!',
      'Тебе нет места под этим небом!',
      'Каждая моя рана — услышанная молитва.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Vampire' },
    lines: [
      'Your hunger ends here, leech!',
      'A stolen life is no life at all!',
      'How many nights until you are done? Answer me!',
    ],
    lines_ru: [
      'Твой голод кончается здесь, пиявка!',
      'Краденая жизнь — вовсе не жизнь!',
      'Сколько ночей, пока ты насытишься? Отвечай!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Undead' },
    lines: [
      'Rest! You have earned it and forgotten it!',
      'This is a mercy, though you cannot know it.',
      'Death was your gift. Stop refusing it!',
    ],
    lines_ru: [
      'Упокойся! Ты заслужил покой и забыл о нём!',
      'Это милость, хоть тебе и не понять.',
      'Смерть была твоим даром. Перестань отвергать его!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Zombie' },
    lines: [
      'Someone loved you once. I am sorry for this.',
      'Be still. Please, just be still.',
      'This body is not yours to walk in!',
    ],
    lines_ru: [
      'Кто-то когда-то любил тебя. Прости меня за это.',
      'Замри. Прошу, просто замри.',
      'Это тело не тебе носить!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Spirit' },
    lines: [
      'Let go! There is nothing left to hold!',
      'Your grief does not excuse this.',
      'The way onward is open. Take it!',
    ],
    lines_ru: [
      'Отпусти! Держаться больше не за что!',
      'Твоя скорбь этого не оправдывает.',
      'Путь дальше открыт. Ступай!',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Holy' }, target: { tag: 'Demon' },
    lines: [
      'Feel the might of the righteous!',
      'Back to the abyss with you!',
      'The light purges all!',
      'No mercy for the wicked!',
    ],
    lines_ru: [
      'Узри мощь праведных!',
      'Обратно в бездну!',
      'Свет очищает всё!',
      'Нет пощады нечестивым!',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Holy' }, target: { tag: 'Undead' },
    lines: [
      'Rest now. Truly, this time.',
      'Go where you were always meant to go.',
      'It is finished. Be at peace.',
    ],
    lines_ru: [
      'Упокойся. На этот раз по-настоящему.',
      'Ступай туда, куда тебе всегда было суждено.',
      'Кончено. Обрети покой.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Holy' },
    lines: [
      'Into the light… at last…',
      'I regret… nothing…',
      'Hold the line… without me…',
    ],
    lines_ru: [
      'В свет… наконец-то…',
      'Я ни о чём… не жалею…',
      'Держите строй… без меня…',
    ],
  },

  // ---------------------------------------------------------------------------
  // KNIGHTS - discipline and the line. Living knights only; the dead ones below.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Knight', not: ['Undead', 'Zombie', 'Demon', 'Vampire'] },
    lines: [
      'Hold the line!',
      'For the crown!',
      'Steel answers steel!',
      'Give ground and you give everything!',
    ],
    lines_ru: [
      'Держать строй!',
      'За корону!',
      'Сталь отвечает сталью!',
      'Уступишь пядь — уступишь всё!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Knight', not: ['Undead', 'Zombie', 'Demon', 'Vampire'] }, target: { tag: 'Demon' },
    lines: [
      'I have read your name in the old books. It dies today.',
      'You will not pass this shield!',
      'Come on then, hellspawn!',
    ],
    lines_ru: [
      'Я читал твоё имя в старых книгах. Сегодня оно умрёт.',
      'Ты не пройдёшь этот щит!',
      'Ну давай же, отродье ада!',
    ],
  },
  {
    trigger: 'attack', actor: { tags: ['Knight', 'Zombie'] },
    lines: [
      'The… oath… holds…',
      'Still… standing… post…',
      'Orders… were… never… rescinded…',
    ],
    lines_ru: [
      'Клятва… держит…',
      'Всё ещё… на… посту…',
      'Приказ… не был… отменён…',
    ],
  },
  {
    trigger: 'attack', actor: { tags: ['Knight', 'Undead'] },
    lines: [
      'Death did not release me from duty.',
      'I kept my oath. I keep it still.',
      'The grave was a poor barracks.',
    ],
    lines_ru: [
      'Смерть не освободила меня от долга.',
      'Я сдержал клятву. Держу и поныне.',
      'Могила была скверной казармой.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Knight', not: ['Undead', 'Zombie'] },
    lines: [
      'The line… holds…',
      'Tell them I did not… step back…',
      'Someone… take up the shield…',
    ],
    lines_ru: [
      'Строй… держится…',
      'Скажите им, что я не… отступил…',
      'Кто-нибудь… поднимите щит…',
    ],
  },

  // ---------------------------------------------------------------------------
  // UNDEAD / ZOMBIES - hollow, patient, faintly sad.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Zombie' }, target: { tag: 'Holy' },
    lines: [
      'Your… light… is… loud…',
      'Stop… singing…',
      'It… hurts… to… look… at… you…',
    ],
    lines_ru: [
      'Твой… свет… такой… громкий…',
      'Хватит… петь…',
      'Больно… на… тебя… смотреть…',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Zombie' },
    lines: [
      'Warm…',
      'Hungry… always… hungry…',
      'Down… come… down…',
    ],
    lines_ru: [
      'Тёплое…',
      'Голод… вечный… голод…',
      'Вниз… иди… вниз…',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Undead', not: ['Knight', 'Vampire', 'Zombie'] },
    lines: [
      'I remember hands. I remember using them for this.',
      'You will be quiet soon. Everyone is.',
      'The grave is patient. I am not.',
    ],
    lines_ru: [
      'Я помню руки. Помню, как делал ими это.',
      'Скоро ты затихнешь. Как все.',
      'Могила терпелива. Я — нет.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Undead' },
    lines: [
      'Welcome. It is crowded, but you will fit.',
      'Now you understand.',
      'One more for the long dark.',
    ],
    lines_ru: [
      'Добро пожаловать. Тесно, но ты поместишься.',
      'Теперь ты понимаешь.',
      'Ещё один для долгой тьмы.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Zombie' },
    lines: [
      'Oh… good…',
      'Rest…?',
      'Thank… you…',
    ],
    lines_ru: [
      'О… хорошо…',
      'Покой…?',
      'Спа… сибо…',
    ],
  },

  // ---------------------------------------------------------------------------
  // SPIRITS - grief given a shape.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Spirit' },
    lines: [
      'You are so heavy. So very heavy.',
      'I only want you to be as cold as I am.',
      'Do you hear it too? The weeping?',
      'Stay. Everyone leaves. Stay.',
    ],
    lines_ru: [
      'Ты такой тяжёлый. Такой тяжёлый.',
      'Я лишь хочу, чтобы ты стал таким же холодным, как я.',
      'Ты тоже это слышишь? Этот плач?',
      'Останься. Все уходят. Останься.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Spirit' }, target: { tag: 'Holy' },
    lines: [
      'You promised me rest. You promised!',
      'I prayed. I prayed and this is what I got.',
      'Where were you? WHERE WERE YOU?',
    ],
    lines_ru: [
      'Ты обещал мне покой. Обещал!',
      'Я молилась. Молилась — и вот что получила.',
      'Где ты был? ГДЕ ТЫ БЫЛ?',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Spirit' },
    lines: [
      'Finally…',
      'Is it… quiet… where you go…?',
      'I forget… my name… again…',
    ],
    lines_ru: [
      'Наконец-то…',
      'Там… тихо… куда ты уходишь…?',
      'Я снова… забываю… своё имя…',
    ],
  },

  // ---------------------------------------------------------------------------
  // ENGINEERS - shop-floor pragmatism in the middle of a massacre.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Engineer' },
    lines: [
      'Tolerances are within spec!',
      'Hold still, this is calibrated!',
      'Field test! Taking notes!',
      'That is going in the report.',
    ],
    lines_ru: [
      'Допуски в пределах нормы!',
      'Не дёргайся, всё откалибровано!',
      'Полевые испытания! Делаю пометки!',
      'Это пойдёт в отчёт.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Engineer' }, target: { tag: 'Construct' },
    lines: [
      'Bad welds. Whoever built you was in a hurry.',
      'I can see the seams from here!',
      'Amateur work. Let me show you.',
    ],
    lines_ru: [
      'Скверная сварка. Тебя собирали второпях.',
      'Отсюда видно все швы!',
      'Любительская работа. Дай покажу.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Engineer' }, target: { tag: 'Demon' },
    lines: [
      'Thermally interesting. Structurally not.',
      'Fire is just an engineering problem!',
    ],
    lines_ru: [
      'Термически любопытно. Конструктивно — нет.',
      'Огонь — это просто инженерная задача!',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Engineer' },
    lines: [
      'Performing as designed.',
      'Log it: one confirmed stop.',
      'The math was never in question.',
    ],
    lines_ru: [
      'Работает по проекту.',
      'Запиши: одна подтверждённая остановка.',
      'Расчёты никогда не подводили.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Engineer' },
    lines: [
      'Design flaw… mine…',
      'Check my notes… the third page…',
      'It should have… held…',
    ],
    lines_ru: [
      'Дефект конструкции… мой…',
      'Проверьте мои записи… третья страница…',
      'Оно должно было… выдержать…',
    ],
  },

  // ---------------------------------------------------------------------------
  // CONSTRUCTS - flat, literal, unsettling.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Construct' },
    lines: [
      'TARGET ACQUIRED.',
      'COMPLIANCE IS NOT REQUIRED.',
      'PROCEEDING.',
      'OBSTRUCTION NOTED. REMOVING.',
    ],
    lines_ru: [
      'ЦЕЛЬ ЗАХВАЧЕНА.',
      'СОГЛАСИЕ НЕ ТРЕБУЕТСЯ.',
      'ПРОДОЛЖАЮ.',
      'ПРЕПЯТСТВИЕ ОТМЕЧЕНО. УСТРАНЯЮ.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Construct' },
    lines: [
      'OBSTRUCTION REMOVED.',
      'TASK COMPLETE. NEXT.',
      'NO FURTHER INPUT DETECTED.',
    ],
    lines_ru: [
      'ПРЕПЯТСТВИЕ УСТРАНЕНО.',
      'ЗАДАЧА ВЫПОЛНЕНА. СЛЕДУЮЩАЯ.',
      'ДАЛЬНЕЙШИХ ДАННЫХ НЕ ОБНАРУЖЕНО.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Construct' },
    lines: [
      'INTEGRITY… FAIL…',
      'SHUTTING D—',
      'TASK… INCOMPLETE…',
    ],
    lines_ru: [
      'ЦЕЛОСТНОСТЬ… СБОЙ…',
      'ОТКЛЮЧЕ—',
      'ЗАДАЧА… НЕ ВЫПОЛНЕНА…',
    ],
  },

  // ---------------------------------------------------------------------------
  // COURT / CHOIR - the high and mighty on both sides of the divide.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Court' },
    lines: [
      'You are addressing your betters.',
      'Kneel, or be knelt.',
      'This is beneath me. I will do it anyway.',
      'Do you know what I am? You will.',
    ],
    lines_ru: [
      'Ты обращаешься к тем, кто выше тебя.',
      'Преклони колени — или их преклонят за тебя.',
      'Это ниже моего достоинства. Но я всё равно это сделаю.',
      'Знаешь, кто я? Скоро узнаешь.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Court' }, target: { tag: 'Holy' },
    lines: [
      'Your church built me a throne and forgot why.',
      'Titles outlast gods, priest.',
    ],
    lines_ru: [
      'Твоя церковь возвела мне трон и забыла зачем.',
      'Титулы переживают богов, жрец.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Choir' },
    lines: [
      'Sing with us. You have no choice.',
      'We are many voices and one throat.',
      'Harmony demands your silence.',
    ],
    lines_ru: [
      'Пой с нами. У тебя нет выбора.',
      'Мы — много голосов и одна глотка.',
      'Гармония требует твоего молчания.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Choir' },
    lines: [
      'And the note resolves.',
      'Your voice is ours now.',
    ],
    lines_ru: [
      'И нота разрешается.',
      'Твой голос теперь наш.',
    ],
  },

  // ---------------------------------------------------------------------------
  // ARCHERS / BEASTS - the small specific flavours.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Archer' },
    lines: [
      'Wind is fair. You are not.',
      'Nocked and gone.',
      'I had you three breaths ago.',
    ],
    lines_ru: [
      'Ветер благосклонен. Ты — нет.',
      'Наложил стрелу — и всё кончено.',
      'Ты был мой ещё три вдоха назад.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Archer' },
    lines: [
      'Clean.',
      'Next quiver, next name.',
    ],
    lines_ru: [
      'Чисто.',
      'Новый колчан — новое имя.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Beast' },
    lines: [
      '*a low, wet snarl*',
      '*teeth, and nothing behind the eyes*',
      '*it has stopped making sounds you know*',
    ],
    lines_ru: [
      '*низкий, влажный рык*',
      '*зубы и пустота за глазами*',
      '*оно перестало издавать звуки, которые ты знаешь*',
    ],
  },

  // ---------------------------------------------------------------------------
  // NAMED UNITS - these override the broad tag rules above (name = +4).
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { name: 'Paladin' }, target: { tag: 'Demon' },
    lines: [
      'I have hunted your kind since I could lift the blade!',
      'Name yourself, so I may carve it on your marker!',
      'The oath is older than you, and it is heavier!',
    ],
    lines_ru: [
      'Я охочусь на твоё племя с тех пор, как смог поднять клинок!',
      'Назовись, чтобы я вырезал имя на твоём надгробии!',
      'Клятва старше тебя — и тяжелее!',
    ],
  },
  {
    trigger: 'kill', actor: { name: 'Paladin' }, target: { tag: 'Demon' },
    lines: [
      'Feel the might of the righteous!',
      'Back to the abyss with you!',
    ],
    lines_ru: [
      'Узри мощь праведных!',
      'Обратно в бездну!',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Inquisitor' },
    lines: [
      'Confess. It changes nothing, but confess.',
      'I have a list. You are on it.',
      'Doubt is the wound. I am the cautery.',
    ],
    lines_ru: [
      'Признавайся. Это ничего не изменит, но признавайся.',
      'У меня есть список. Ты в нём.',
      'Сомнение — это рана. Я — прижигание.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Blood Knight' }, target: { tag: 'Holy' },
    lines: [
      'I wore your colours once. They stained.',
      'Your order cast me out. It made me thorough.',
    ],
    lines_ru: [
      'Я носил твои цвета когда-то. Они запятнались.',
      'Твой орден изгнал меня. Это сделало меня дотошным.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Necromancer' },
    lines: [
      'Do not think of it as dying. Think of it as hiring.',
      'You have such promising bones.',
      'Stand still — you are ruining the specimen.',
    ],
    lines_ru: [
      'Думай об этом не как о смерти. Думай как о найме.',
      'У тебя такие многообещающие кости.',
      'Стой смирно — ты портишь образец.',
    ],
  },
  {
    trigger: 'kill', actor: { name: 'Necromancer' },
    lines: [
      'Welcome to the staff.',
      'Do not get comfortable. You start immediately.',
    ],
    lines_ru: [
      'Добро пожаловать в штат.',
      'Не устраивайся поудобнее. Приступаешь немедленно.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Dungeon Rat' },
    lines: [
      '*skitter*',
      'Squeak!',
      '*it is genuinely trying its best*',
    ],
    lines_ru: [
      '*шмыг*',
      'Пи-и!',
      '*оно и правда очень старается*',
    ],
  },
  {
    trigger: 'death', actor: { name: 'Dungeon Rat' },
    lines: [
      '*squeak…*',
      '*the tiny paws stop*',
    ],
    lines_ru: [
      '*пи…*',
      '*крошечные лапки замирают*',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Malgrath the Undying' },
    lines: [
      'I have outlived your gods, your kings, and your grandmother.',
      'Undying is not a boast. It is an inconvenience I have made peace with.',
      'Do continue. I am curious how you think this ends.',
    ],
    lines_ru: [
      'Я пережил твоих богов, твоих королей и твою бабку.',
      'Бессмертие — не хвастовство. Это неудобство, с которым я смирился.',
      'Продолжай. Мне любопытно, чем, по-твоему, это кончится.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Imp' },
    lines: [
      'Ha! Missed! Oh — no, that one landed!',
      'I am SO much worse than I look!',
      'Pick on someone your own size! Wait — no!',
    ],
    lines_ru: [
      'Ха! Промах! О — нет, этот попал!',
      'Я НАМНОГО хуже, чем кажусь!',
      'Задирай кого-нибудь своего размера! Стой — нет!',
    ],
  },
  {
    trigger: 'death', actor: { name: 'Imp' },
    lines: [
      'Not fair! Not FAIR!',
      'Tell the Baron I fought REALLY hard!',
    ],
    lines_ru: [
      'Нечестно! НЕЧЕСТНО!',
      'Передайте Барону, что я дрался ИЗО ВСЕХ СИЛ!',
    ],
  },

  // ---------------------------------------------------------------------------
  // HEALING - kept from the original system, broadened to tags.
  // ---------------------------------------------------------------------------
  {
    trigger: 'heal_low_hp', actor: { name: 'Acolyte' },
    lines: [
      'You shall not fall!',
      'Stay with me!',
      'The light will not abandon you!',
    ],
    lines_ru: [
      'Ты не падёшь!',
      'Держись за меня!',
      'Свет тебя не оставит!',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { name: 'Priest' },
    lines: [
      'You shall not fall!',
      'Hold on, I have you!',
      'Rise, and fight on!',
    ],
    lines_ru: [
      'Ты не падёшь!',
      'Держись, я рядом!',
      'Встань и сражайся дальше!',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Holy' },
    lines: [
      'Not today. Not while I stand!',
      'The light is not finished with you!',
      'Breathe. Just breathe.',
      'I have you. I have you.',
    ],
    lines_ru: [
      'Не сегодня. Не пока я стою!',
      'Свет с тобой ещё не закончил!',
      'Дыши. Просто дыши.',
      'Я держу тебя. Держу.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Vampire' },
    lines: [
      'I am not saving you. I am protecting my investment.',
      'Take some of mine. You may keep it.',
      'Do not mistake this for kindness.',
    ],
    lines_ru: [
      'Я не спасаю тебя. Я берегу вложение.',
      'Возьми немного моей. Можешь оставить себе.',
      'Не прими это за доброту.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Demon' },
    lines: [
      'You are no use to me in pieces.',
      'Get up. The bargain is not done.',
      'I decide when you die.',
    ],
    lines_ru: [
      'В кусках ты мне бесполезен.',
      'Вставай. Сделка не завершена.',
      'Я решаю, когда ты умрёшь.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Engineer' },
    lines: [
      'Field repair! Hold still!',
      'Patching you up — do not test the seal!',
      'Structurally sound. Ish. Go.',
    ],
    lines_ru: [
      'Полевой ремонт! Не дёргайся!',
      'Латаю тебя — не проверяй шов на прочность!',
      'Конструктивно цел. Вроде. Иди.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Undead' },
    lines: [
      'Stay on this side a little longer.',
      'The dark can wait for you. I told it so.',
    ],
    lines_ru: [
      'Побудь на этой стороне ещё немного.',
      'Тьма может подождать. Я ей так и сказал.',
    ],
  },
];

export { COMBAT_BARKS, BARK_CHANCES, HEAL_BARK_THRESHOLD_PCT };
if (typeof module !== 'undefined') module.exports = { COMBAT_BARKS, BARK_CHANCES, HEAL_BARK_THRESHOLD_PCT };