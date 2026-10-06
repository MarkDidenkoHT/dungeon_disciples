// Every string on the landing page, in the two languages the game speaks.
//
// The game localizes inline — `uiText(en, ru)` and `name` / `name_ru` on the
// data — so there is no catalog to reuse here; this is the page's own copy, in
// the same two languages and the same voice. The faction and region text IS the
// game's, lifted from public/screens/register.js and screens/embark.js so the
// shop window and the front door agree word for word.
//
// index.html carries the English in the markup, with a data-i18n key on each
// element. That way the page is complete before this module runs, and a visitor
// whose browser speaks Russian gets the swap on first paint.

export const STRINGS = {
  en: {
    'nav.factions': 'Factions',
    'nav.loop': 'How it plays',
    'nav.mechanics': 'Mechanics',
    'nav.play': 'Play',
    'nav.music': 'Music',
    'nav.faction': 'Faction',

    'hero.tagline': 'One crown, broken into pieces. Three powers that will not share them.',
    'hero.sub': 'A turn-based tactics game you play inside Telegram. Build a castle, recruit units, equip them, and send six of them into a dungeon. Where a unit stands decides the fight, and the roster you raise stays yours.',
    'hero.cta': 'Play on Telegram',
    'hero.cta2': 'See the mechanics',
    'hero.meta': 'Free to play · no install · opens in Telegram',

    'lore.label': 'The realm',
    'lore.p1': 'The old order has fallen. Where a single crown once held dominion, three powers now claw for what remains.',
    'lore.p2': 'At the heart of the conflict lies a fractured relic — a vessel said to grant dominion over life, death, and the space between. Empire, Choir, and Grail each stake a rightful claim to its power, and none will yield.',
    'lore.p3': 'You are a Disciple, bound to serve one banner in the dungeons and battlefields ahead. Choose wisely — your faction shapes not only your allies, but the fate of the realm.',

    'factions.label': 'Choose a banner',
    'factions.lede': 'Your faction is picked once and never again. It decides which units you can recruit, which items you can forge, what your castle looks like, and which Colossus you spend your week killing.',

    'f.empire.name': 'Empire of Aurex',
    'f.empire.desc': 'The Empire of Aurex keeps to Mithrail, the Golden Lion, who rewards those who hold the line. Its knights, priests and engineers fight as one wall — armored, sanctified, and certain that every shard belongs to Aurex.',

    'f.choir.name': 'Choir of the Cursed',
    'f.choir.desc': 'The court of Cinderhold was losing the war for the crown. Rites, oaths, older and darker magic — none of it worked. Then a troupe nobody had invited played in the great hall, in a language nobody knew, and the court learned the First Song. Aggrail answered. Its lords are demons now, and the court has been singing ever since.',

    'f.grail.name': 'Grail of Sorrow',
    'f.grail.desc': 'In the war for Ilmenar its scholars cast a spell to carry their people into the future. The spell came out wrong: their bodies never moved, but a century passed through them in an instant. Two answers divide them now: accept the rot, or hold it back with the blood and living essence of others.',

    'loop.label': 'The loop',
    'loop.lede': 'A session takes a few minutes. The castle grows over weeks, and nothing you build is ever taken away.',

    'loop.s1.h': 'Build the castle',
    'loop.s1.p': 'Twenty-four plots across two pages. Each barracks recruits one line of units; each hall unlocks something — the forge, the infirmary, spell research. You cannot afford all of them at once, so you choose.',
    'loop.s2.h': 'Recruit and upgrade',
    'loop.s2.p': 'You recruit a unit from the building that unlocks it, then upgrade it step by step. Every upgrade is a choice between two or three units, and the one you pick is the one you keep.',
    'loop.s3.h': 'Forge and equip',
    'loop.s3.p': 'Eighty-four items in five rarities, crafted from what you bring back out of the dungeons. An item changes a unit’s stats, gives it a passive, and can add or remove its tags.',
    'loop.s4.h': 'Go on a run',
    'loop.s4.p': 'Three regions, ten levels each. You take six units in a two-by-three formation, and the cell a unit stands in decides who can reach it.',
    'loop.s5.h': 'Fight for position',
    'loop.s5.p': 'Initiative sets the turn order. Damage comes in six elements and is reduced by armor. Most abilities depend on where units are standing, on both sides.',
    'loop.s6.h': 'Daily and weekly',
    'loop.s6.p': 'A faction boss with ten thousand health, daily errands, a nightly tournament, PvP, and engravings you pay for with what you win.',
    'loop.s7.h': 'And that is not all',
    'loop.s7.p': 'Plenty already in the game did not fit on this page: unit size, loyalty, callings, combat barks, litanies, the Chronicle, mercenaries, errands, the Crown Tourney. Come and see for yourself.',
    'loop.s8.h': 'In active development',
    'loop.s8.p': 'The game is in active development: mechanics, content and events arrive and are updated all the time.',
    'video.label': 'Gameplay',
    'video.p1': 'The game in motion, recorded in the real client. More clips on the channel.',
    'video.cta': 'Shattered Crown on YouTube',

    'd.castle.label': 'Castle',
    'd.castle.p1': 'The castle — page one has 12 slots for your army: the hero, 8 for the faction’s units and 3 for mercenaries. You are free to build several identical tier-1 units and set each on a different development path. Build two Acolytes — upgrade one to Templar and the second to Ardent Priest — and the same with any unit.',
    'd.castle.p2': 'Page two — the halls: forge, infirmary, mage guild, temple and others. The buildings have varied, extensive functionality, from passive HP regeneration for your units to unlocking new development branches and mechanics!',
    'd.castle.p3': 'The factions really differ on page one: they share no units — each side leans towards its own mechanics. Page two is the same for all three factions, only the look of the buildings changes to match the faction’s theme.',
    'd.castle.li1': 'Over 300 units in the game — over 80 for each faction',
    'd.castle.li2': 'Units have their own progression and development branches',
    'd.castle.li3': 'Buildings with different mechanics that directly affect gameplay',

    'd.embark.label': 'Embark',
    'd.embark.p1': 'Three regions, ten levels each. A level always has the same enemies, in the same cells, with the same equipment — so a level you lose is a level you can prepare for.',
    'd.embark.p2': 'Every region is guaranteed to drop two kinds of crystal. That is how you decide where to go when you are short of one for a recipe.',
    'd.embark.li1': 'Tap a level to see who is waiting on it, and where they stand.',
    'd.embark.li2': 'Six cells, two per row. Melee only reaches the front row; ranged reaches anyone.',
    'd.embark.li3': 'Levels 3, 6, 9 and 10 end in a boss fight.',

    'd.evolve.label': 'Unit evolution',
    'd.evolve.p1': 'Every unit has development branches. A conscript can become infantry, cavalry or a standard bearer, and from there each of them has branches of its own.',
    'd.evolve.p2': 'The branch is chosen per unit — two players in the same faction can end up with squads that share no units at all. There is a way to switch a branch for in-game currency, and a unit you are not happy with can be demolished along with its building and replaced with another.',
    'd.evolve.li1': 'Pick a line along the bottom to see its tree.',
    'd.evolve.li2': 'Tap a branch — a card opens. Stats are shown as the difference from the previous unit.',
    'd.evolve.li3': 'Tap a stat or an ability on the card to see its description.',

    'd.heroes.label': 'Heroes',
    'd.heroes.p1': 'Each faction has three heroes — you choose one of them. A hero is stronger than a rank-and-file soldier, and has the ability to cast spells.',
    'd.heroes.p2': 'During a battle the hero accumulates spell power, and can cast any researched spell instead of a regular action.',
    'd.heroes.li1': 'Heroes — unique, powerful warriors with their own development branches',
    'd.heroes.li2': 'Build the Mage Guild — research new spells.',
    'd.heroes.li3': 'The hero — and certain special warriors and items — accumulate spell power in battle',
    'd.heroes.li4': 'Seven spells for each faction!',

    'd.items.label': 'Items',
    'd.items.p1': 'Over a hundred items in five rarities. Some are available only to certain factions; some are unique, and you can never own more than one.',
    'd.items.p2': 'Items are not only stats. Many grant passive abilities, and many interact with a unit’s tags — requiring certain tags before the item can be worn, or even taking them away.',
    'd.items.li1': 'Every item is crafted at the forge for in-game currency.',
    'd.items.li2': 'Each unit can wear 1 item.',
    'd.items.li3': 'Items can completely change your formation and the strategies you play.',

    'd.transmute.label': 'Transmutation',
    'd.transmute.p1': 'There are six kinds of crystal in the game. They are the core resources — used to develop your units, craft items, raise buildings and so on. Crystals drop as rewards from everything: runs, errands, the Colossus. You end up with a surplus of some and short of the ones you need, and transmutation is what solves that. You pick the kind you want, and the two kinds you are willing to trade away.',
    'd.transmute.li1': 'Build the laboratory to unlock transmutation.',
    'd.transmute.li2': 'Pick the crystals, then tap or hold − or + to change the amount.',
    'd.transmute.li3': 'After a set time the transmutation finishes — you get a notification.',

    'd.engrave.label': 'Engraving',
    'd.engrave.p1': 'Engraving is an expensive way to modify your units. It permanently changes one unit’s stats or abilities. You pick a set of stats or abilities, and choose what you are willing to sacrifice in exchange for the bonus — lowering armor, say, to raise power in return.',
    'd.engrave.p2': 'The higher the tier, the more you can change through engraving, and the more it costs. You pay in Valor from the Colossus, in gold, and in tokens that only drop in the Crown Tourney.',
    'd.engrave.li1': 'Pick a unit and an engraving, then spend the points with − and +.',
    'd.engrave.li2': 'Every number shown is that unit’s real stat.',
    'd.engrave.li3': 'The eighth set trades passive ranks instead of stats.',

    'd.colossus.label': 'Colossus',
    'd.colossus.p1': 'One boss per faction per week, ten thousand health, and the whole faction attacking it together. The damage you deal counts towards your own rewards, and all three factions can see how far the others have got.',
    'd.colossus.p2': 'It is not just a large health bar. It has four phases and casts a different set of spells in each: stone and grasping hands at full health, rot and roots below three quarters, bells and a death sentence below half, and fire at the end. Units that fight it come back exhausted, and you pay to bring them back.',
    'd.colossus.li1': 'Attack a few times and watch the phase change.',
    'd.colossus.li2': 'Tap another faction to see how far along it is.',
    'd.colossus.li3': 'In the game, Attack starts a real battle.',


    'join.label': 'Join',
    'join.lede': 'No install, no account to create, no store page. Open the bot, pick a faction, and you have your first castle a couple of minutes later.',
    'join.cta': 'Open @shattered_crown_bot',

    'footer.note': 'Shattered Crown — a turn-based tactics game in Telegram.',
    'footer.demos': 'Every demo on this page runs the game’s own code against its own data.',
    'footer.youtube': 'YouTube',
  },

  ru: {
    'nav.factions': 'Фракции',
    'nav.loop': 'Как играть',
    'nav.mechanics': 'Механики',
    'nav.play': 'Играть',
    'nav.music': 'Музыка',
    'nav.faction': 'Фракция',

    'hero.tagline': 'Одна корона, расколотая на части. Три силы, что не станут делиться.',
    'hero.sub': 'Пошаговая тактика прямо в Telegram. Стройте замок, набирайте юнитов, снаряжайте их и отправляйте шестерых в подземелье. Исход боя решает то, кто где стоит, а собранный отряд остаётся с вами.',
    'hero.cta': 'Играть в Telegram',
    'hero.cta2': 'Посмотреть механики',
    'hero.meta': 'Бесплатно · без установки · открывается в Telegram',

    'lore.label': 'Королевство',
    'lore.p1': 'Старый порядок пал. Там, где раньше властвовала единая корона, теперь три силы борются за то, что осталось.',
    'lore.p2': 'В сердце конфликта лежит расколотая реликвия — сосуд, дающий власть над жизнью, смертью и пространством между ними. Империя, Хор и Грааль — каждый заявляет законное право на её силу, и никто не намерен уступать.',
    'lore.p3': 'Вы — Адепт, связанный служением одному знамени в грядущих подземельях и битвах. Выбирайте мудро — ваша фракция определяет не только союзников, но и судьбу королевства.',

    'factions.label': 'Выберите знамя',
    'factions.lede': 'Фракция выбирается один раз и навсегда. От неё зависит, каких юнитов вы набираете, какие предметы куёте, как выглядит замок и какого Колосса вы бьёте всю неделю.',

    'f.empire.name': 'Империя Аурекс',
    'f.empire.desc': 'Империя Аурекс поклоняется Митраилу, Золотому Льву, который награждает тех, кто держит строй. Её рыцари, жрецы и инженеры бьются как одна стена: в броне, освящённые и уверенные, что все осколки короны принадлежат Аурексу.',

    'f.choir.name': 'Хор Проклятых',
    'f.choir.desc': 'Двор Пепельного Чертога проигрывал войну за корону. Обряды, клятвы, древняя и тёмная магия — не помогало ничего. А потом в большом зале сыграла труппа, которую никто не звал, на языке, которого никто не знал, и двор выучил Первую Песнь. Агграил откликнулся. Его владыки теперь демоны, а двор поёт до сих пор.',

    'f.grail.name': 'Грааль Скорби',
    'f.grail.desc': 'В войне за Ильменар его учёные сотворили заклинание, чтобы перенести свой народ в будущее. Заклинание вышло неверным: тела остались на месте, а век прошёл по ним за мгновение. Теперь их разделяют два ответа: принять тлен или сдерживать его чужой кровью.',

    'loop.label': 'Цикл',
    'loop.lede': 'Сессия занимает несколько минут. Замок растёт неделями, и построенное у вас никогда не отнимут.',

    'loop.s1.h': 'Построить замок',
    'loop.s1.p': 'Двадцать четыре площадки на двух страницах. Каждая казарма набирает свою линию юнитов, каждый зал что-то открывает: кузницу, лазарет, изучение заклинаний. На всё сразу денег не хватит, поэтому приходится выбирать.',
    'loop.s2.h': 'Набирать и улучшать',
    'loop.s2.p': 'Юнита набирают в том строении, которое его открывает, а потом улучшают шаг за шагом. Каждое улучшение — выбор из двух-трёх юнитов, и выбранный остаётся с вами.',
    'loop.s3.h': 'Ковать и снаряжать',
    'loop.s3.p': 'Восемьдесят четыре предмета пяти редкостей, которые куются из добычи в подземельях. Предмет меняет статы юнита, даёт пассивку и может добавлять или снимать метки.',
    'loop.s4.h': 'Ходить в походы',
    'loop.s4.p': 'Три региона, по десять уровней. В поход идут шесть юнитов в строю два на три, и клетка, в которой стоит юнит, решает, кто сможет до него дотянуться.',
    'loop.s5.h': 'Бороться за позицию',
    'loop.s5.p': 'Порядок хода задаёт инициатива. Урон бывает шести видов, и его снижает броня. Большинство способностей зависит от того, кто где стоит — с обеих сторон.',
    'loop.s6.h': 'Ежедневное и еженедельное',
    'loop.s6.p': 'Босс фракции с десятью тысячами здоровья, ежедневные поручения, вечерний турнир, PvP и гравировки, которые покупаются за награды со всего этого.',
    'loop.s7.h': 'И это не всё',
    'loop.s7.p': 'Многое из того, что уже есть, не поместилось на этой странице: размер юнитов, верность, призвания, боевые реплики, литании, Хроника, наёмники, поручения, Турнир Короны. Приходите и посмотрите сами.',
    'loop.s8.h': 'В активной разработке',
    'loop.s8.p': 'Игра в активной разработке: механики, контент и события появляются и обновляются постоянно.',
    'video.label': 'Геймплей',
    'video.p1': 'Игра в движении, записано в настоящем клиенте. Больше роликов — на канале.',
    'video.cta': 'Shattered Crown на YouTube',

    'd.castle.label': 'Замок',
    'd.castle.p1': 'Замок — на первой странице 12 слотов для ваших войск - герой, 8 для войск фракции и 3 для наемников. Вы свободно можете строить несколько одинаковых юнитов первого уровня и задать им разные пути развития. Постройте двух Послушников - одного улучшите до Тамплиера, а второго до Ревностный Жреца - и так с любым юнитом.',
    'd.castle.p2': 'На второй — залы: кузница, лазарет, гильдия магов, храм и прочие. Здания имеют разный обширный функционал, от пассивной регенерации HP войск до открытия новых веток развития и механик!',
    'd.castle.p3': 'По-настоящему фракции различаются на первой странице: общих юнитов у фракций нет - у каждой стороны уклон в свои собственные механики. Вторая страница у всех трёх фракций одинаковая, меняется только внешний вид зданий в соответствии с темой фракции.',
    'd.castle.li1': 'Более 300 юнитов в игре - более 80 за каждую фракцию',
    'd.castle.li2': 'Юниты имеют свой собственный прогресс и ветви развития',
    'd.castle.li3': 'Здания с разными механиками, напрямую влияющими на игровой процесс',

    'd.embark.label': 'Поход',
    'd.embark.p1': 'Три региона, по десять уровней. На уровне всегда одни и те же враги, в тех же клетках и с тем же снаряжением — поэтому к проигранному уровню можно подготовиться.',
    'd.embark.p2': 'Каждый регион гарантированно даёт два вида кристаллов. По ним и выбирают, куда идти, когда для крафта не хватает конкретного кристалла.',
    'd.embark.li1': 'Нажмите на уровень, чтобы увидеть, кто там стоит и в каких клетках.',
    'd.embark.li2': 'Шесть клеток, по две в ряду. Ближний бой достаёт только передний ряд, дальний — любого.',
    'd.embark.li3': 'Уровни 3, 6, 9 и 10 заканчиваются боссом.',

    'd.evolve.label': 'Эволюция юнитов',
    'd.evolve.p1': 'Каждый юнит имеет ветви развития. Ополченец может стать пехотинцем, кавалеристом или знаменосцем, а дальше каждый из них имеет свои ветви развития.',
    'd.evolve.p2': 'Ветка выбирается для каждого юнита отдельно — у двух игроков одной фракции могут получиться отряды без единого общего юнита. Существует механизм смены ветви за внутриигровую валюту, а так же непонравившегося юнита вместе со зданием можно снести и выбрать на его месте другого.',
    'd.evolve.li1': 'Выберите линию внизу, чтобы увидеть её дерево.',
    'd.evolve.li2': 'Нажмите на ветвь — откроется карточка. Статы показаны как разница с предыдущим юнитом.',
    'd.evolve.li3': 'Нажмите на стат или способность в карточке чтобы увидеть их описание.',

    'd.heroes.label': 'Герои',
    'd.heroes.p1': 'У каждой фракции три героя - вы выбираете одного из них. Герой более сильный, чем рядовой воин, и обладает возможностью применять заклинания.',
    'd.heroes.p2': 'Во время боя, герой копит силу заклинаний, и может применить любое изученное заклинание вместо обычного действия.',
    'd.heroes.li1': 'Герои - уникальные сильные воины со своими ветками развития',
    'd.heroes.li2': 'Стройте Гильдию Магов - изучайте новые заклинания.',
    'd.heroes.li3': 'Герой - и некоторые особые воины и предметы - накапливают силу заклинаний в бою',
    'd.heroes.li4': 'Семь заклинаний для каждой фракции!',

    'd.items.label': 'Предметы',
    'd.items.p1': 'Более ста предметов пяти редкостей, некоторые доступны определенным фракциям, некоторые уникальны и их нельзя иметь более одного.',
    'd.items.p2': 'Предметы — это не только статы. Многие дают пассивные способности, многие взаимодействуют с тэгами воинов, требуют некоторые чтобы предмет можно было одеть, или даже отнимают их.',
    'd.items.li1': 'Все предметы создаются в кузнице за внутриигровую валюту.',
    'd.items.li2': 'Каждый воин может одеть 1 предмет.',
    'd.items.li3': 'Предметы могут полностью менять боевое построение и влиять на стратегии.',

    'd.transmute.label': 'Трансмутация',
    'd.transmute.p1': 'В игре шесть видов кристаллов - это основные ресурсы, используются для развития войск и создания предметов, постройки зданий и т.д. Кристаллы выпадают в качестве награды отовсюду: из походов, за поручения, с Колосса. В итоге одних накапливается с избытком, а нужных может не хватать - эту проблему решает трансмутация. Вы выбираете нужный вам вид кристаллов, и два других - которые вы готовы обменять.',
    'd.transmute.li1': 'Постройте лабораторию чтобы открыть трансмутацию.',
    'd.transmute.li2': 'Выберите кристаллы, нажмите или удерживайте − или + чтобы менять количество.',
    'd.transmute.li3': 'Спустя определенное время трансмутация будет завершена - вы получите уведомление.',

    'd.engrave.label': 'Гравировка',
    'd.engrave.p1': 'Гравировка это дорогостоящий способ модификации воинов. Гравировка навсегда меняет статы или способности одного юнита. Вы выбираете набор из статов или способностей - и выбираете чем вы готовы пожертвовать в обмен на бонус. Например понизить броню, но в обмен увиличить силу.',
    'd.engrave.p2': 'Чем выше ранг, тем больше вы можете изменить через гравировку, и тем дороже она обойдется. Платить нужно доблестью с Колосса, золотом и жетонами, которые выпадают только в Турнире Короны.',
    'd.engrave.li1': 'Выберите юнита и гравировку, затем распределите очки через − и +.',
    'd.engrave.li2': 'Все показанные числа — настоящие статы этого юнита.',
    'd.engrave.li3': 'Восьмой набор меняет ранги пассивок вместо статов.',

    'd.colossus.label': 'Колосс',
    'd.colossus.p1': 'Один босс на фракцию в неделю, десять тысяч здоровья, и бьёт его вся фракция вместе. Нанесённый вами урон идёт в ваши личные награды, а все три фракции видят, насколько продвинулись остальные.',
    'd.colossus.p2': 'Это не просто большая полоска здоровья. У босса четыре фазы, и в каждой он читает свой набор заклинаний: на полном здоровье — камень и хватающие руки, ниже трёх четвертей — гниль и корни, ниже половины — колокола и смертный приговор, под конец — огонь. Бойцы возвращаются от него истощёнными, и за их восстановление нужно платить.',
    'd.colossus.li1': 'Атакуйте несколько раз и посмотрите, как меняется фаза.',
    'd.colossus.li2': 'Нажмите на другую фракцию, чтобы увидеть её прогресс.',
    'd.colossus.li3': 'В игре «Атаковать» начинает настоящий бой.',


    'join.label': 'Присоединиться',
    'join.lede': 'Без установки, без регистрации, без страницы в магазине. Откройте бота, выберите фракцию — и через пару минут у вас первый замок.',
    'join.cta': 'Открыть @shattered_crown_bot',

    'footer.note': 'Shattered Crown — пошаговая тактика в Telegram.',
    'footer.demos': 'Каждое демо на этой странице работает на коде и данных самой игры.',
    'footer.youtube': 'YouTube',
  },
};

const STORAGE_KEY = 'sc_lang';

// What the visitor most likely reads. The stored choice wins, then the browser's
// own list in order — `navigator.languages` is ranked, so the first entry that
// is a language this page speaks is the right answer, not merely a matching one.
export function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && STRINGS[saved]) return saved;
  } catch { /* private mode; fall through to the browser's own preference */ }

  const list = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const tag of list) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (STRINGS[base]) return base;
  }
  return 'en';
}

export function rememberLang(lang) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* nothing to do */ }
}
