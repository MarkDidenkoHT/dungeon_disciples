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
    'd.items.p1': 'Eighty-four items in five rarities. Common and rare items stack; every epic and mythic is unique, so you can only ever own one of each. Shattered is not a step above mythic — it is epic in power and price, and sits in its own rarity so tournament rules can count it separately.',
    'd.items.p2': 'An item is more than its stats. It carries a passive, it can require a tag before a unit is allowed to wear it, and it can add or remove tags: Bloodless turns a Zombie into a Skeleton, and every effect that works on Zombies stops working on that unit.',
    'd.items.li1': 'Filter by rarity along the top.',
    'd.items.li2': 'Every card is the game’s own item card.',
    'd.items.li3': 'The passive under the name is the main thing an item does.',

    'd.transmute.label': 'Transmutation',
    'd.transmute.p1': 'There are six kinds of crystal, and you earn them from everything you do — runs, errands, the Colossus. You end up with a pile of some and not enough of the ones you need.',
    'd.transmute.p2': 'Transmutation fixes that. You spend two kinds you have to spare and get back a third kind of your choosing. It costs time rather than gold — about an hour — and you have to build the lab first.',
    'd.transmute.li1': 'Tap a corner to pick a crystal, then set the amount with − and +.',
    'd.transmute.li2': 'Hold − or + to move in fives.',
    'd.transmute.li3': 'The timer is shortened here so you can watch it finish.',

    'd.engrave.label': 'Engraving',
    'd.engrave.p1': 'Engraving permanently changes one unit’s stats. You pick a set of three stats: one goes down, the other two go up. You do not choose the amounts — the stat you give up falls about twice as far as each of the other two rises.',
    'd.engrave.p2': 'A higher tier scales all three numbers up together. You pay in Valor from the Colossus, in gold, and in tokens that only drop in the Crown Tourney. An engraving can be replaced later, but never removed.',
    'd.engrave.li1': 'Pick a unit, pick a set of stats, then spend the points with − and +.',
    'd.engrave.li2': 'Every number shown is that unit’s real stat.',
    'd.engrave.li3': 'The eighth set trades passive ranks instead of stats.',

    'd.colossus.label': 'Colossus',
    'd.colossus.p1': 'One boss per faction per week, ten thousand health, and the whole faction attacking it together. The damage you deal counts towards your own rewards, and all three factions can see how far the others have got.',
    'd.colossus.p2': 'It is not just a large health bar. It has four phases and casts a different set of spells in each: stone and grasping hands at full health, rot and roots below three quarters, bells and a death sentence below half, and fire at the end. Units that fight it come back exhausted, and you pay to bring them back.',
    'd.colossus.li1': 'Attack a few times and watch the phase change.',
    'd.colossus.li2': 'Tap another faction to see how far along it is.',
    'd.colossus.li3': 'In the game, Attack starts a real battle.',

    'more.label': 'Other mechanics',
    'more.lede': 'There is more going on than has a screen of its own. A few of the things running underneath every battle.',
    'more.s1.h': 'Unit size',
    'more.s1.p': 'Most units stand in one cell. Some take a whole row, or a whole column of two — a big unit covers two cells at once, and what can reach it changes with it.',
    'more.s2.h': 'Loyalty',
    'more.s2.p': 'A squad is capped by loyalty, not by headcount. A one-cell unit costs 1, a two-cell unit costs 2, and your hero decides how much you have to spend.',
    'more.s3.h': 'Callings',
    'more.s3.p': 'Each faction has two. A unit is given one at random, and you can change it at the Temple for 100 gold. It decides what that unit’s Chronicle asks of it — and whether it may sing in a litany.',
    'more.s4.h': 'Combat barks',
    'more.s4.p': 'Units talk during a fight. The line is picked from who is speaking, who they are hitting and what just happened. Pure flavour — no game logic ever reads it.',
    'more.s5.h': 'Litanies',
    'more.s5.p': 'Eighteen scripted executions, two for every hero. When the right formation is standing on the board and the enemy champion is about to fall, the chorus performs and the lead lands the blow — and unlike a bark, it pays.',

    'join.label': 'Join',
    'join.lede': 'No install, no account to create, no store page. Open the bot, pick a faction, and you have your first castle a couple of minutes later.',
    'join.cta': 'Open @shattered_crown_bot',

    'footer.note': 'Shattered Crown — a turn-based tactics game in Telegram.',
    'footer.demos': 'Every demo on this page runs the game’s own code against its own data.',
  },

  ru: {
    'nav.factions': 'Фракции',
    'nav.loop': 'Как играть',
    'nav.mechanics': 'Механики',
    'nav.play': 'Играть',

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
    'd.items.p1': 'Восемьдесят четыре предмета пяти редкостей. Обычные и редкие складываются; каждый эпический и мифический уникален — больше одного не получить. Расколотые — не ступень выше мифических: по силе и цене они эпические, а вынесены в отдельную редкость, чтобы турнирные правила считали их отдельно.',
    'd.items.p2': 'Предмет — это не только статы. У него есть пассивка, он может требовать метку, без которой юнит его не наденет, и может сам добавлять или снимать метки: «Обескровленный» превращает Зомби в Скелета, и все эффекты для Зомби на него больше не действуют.',
    'd.items.li1': 'Фильтр по редкости — сверху.',
    'd.items.li2': 'Каждая карточка — настоящая игровая карточка предмета.',
    'd.items.li3': 'Пассивка под названием — главное, что делает предмет.',

    'd.transmute.label': 'Трансмутация',
    'd.transmute.p1': 'Кристаллов шесть видов, и выпадают они отовсюду: из походов, за поручения, с Колосса. В итоге одних накапливается с избытком, а нужных для крафта не хватает.',
    'd.transmute.p2': 'Это и решает трансмутация. Вы тратите два вида, которых у вас в избытке, и получаете третий — тот, который выберете. Платите не золотом, а временем, около часа. Сначала нужно построить лабораторию.',
    'd.transmute.li1': 'Нажмите на угол, чтобы выбрать кристалл, затем задайте количество через − и +.',
    'd.transmute.li2': 'Удерживайте − или +, чтобы менять по пять.',
    'd.transmute.li3': 'Здесь таймер сокращён, чтобы вы увидели результат.',

    'd.engrave.label': 'Гравировка',
    'd.engrave.p1': 'Гравировка навсегда меняет статы одного юнита. Вы выбираете набор из трёх статов: один уходит в минус, два других — в плюс. Величины вы не выбираете: стат в минусе падает примерно вдвое сильнее, чем растёт каждый из двух остальных.',
    'd.engrave.p2': 'Чем выше ранг, тем больше все три числа. Платить нужно Доблестью с Колосса, золотом и жетонами, которые выпадают только в Турнире Короны. Гравировку можно заменить, но нельзя убрать.',
    'd.engrave.li1': 'Выберите юнита и набор статов, затем распределите очки через − и +.',
    'd.engrave.li2': 'Все показанные числа — настоящие статы этого юнита.',
    'd.engrave.li3': 'Восьмой набор меняет ранги пассивок вместо статов.',

    'd.colossus.label': 'Колосс',
    'd.colossus.p1': 'Один босс на фракцию в неделю, десять тысяч здоровья, и бьёт его вся фракция вместе. Нанесённый вами урон идёт в ваши личные награды, а все три фракции видят, насколько продвинулись остальные.',
    'd.colossus.p2': 'Это не просто большая полоска здоровья. У босса четыре фазы, и в каждой он читает свой набор заклинаний: на полном здоровье — камень и хватающие руки, ниже трёх четвертей — гниль и корни, ниже половины — колокола и смертный приговор, под конец — огонь. Бойцы возвращаются от него истощёнными, и за их восстановление нужно платить.',
    'd.colossus.li1': 'Атакуйте несколько раз и посмотрите, как меняется фаза.',
    'd.colossus.li2': 'Нажмите на другую фракцию, чтобы увидеть её прогресс.',
    'd.colossus.li3': 'В игре «Атаковать» начинает настоящий бой.',

    'more.label': 'Другие механики',
    'more.lede': 'В игре есть и то, у чего нет своего экрана. Немного из того, что работает под каждым боем.',
    'more.s1.h': 'Размер юнита',
    'more.s1.p': 'Большинство юнитов занимает одну клетку. Некоторые занимают целый ряд или целую колонну из двух — крупный юнит закрывает сразу две клетки, и то, кто до него дотянется, меняется вместе с этим.',
    'more.s2.h': 'Верность',
    'more.s2.p': 'Отряд ограничен верностью, а не числом бойцов. Одноклеточный юнит стоит 1, двухклеточный — 2, а сколько верности у вас есть, решает герой.',
    'more.s3.h': 'Призвания',
    'more.s3.p': 'У каждой фракции их два. Юнит получает призвание случайно, а сменить его можно в Храме за 100 золота. От призвания зависит, чего от юнита потребует Хроника — и может ли он петь в литании.',
    'more.s4.h': 'Боевые реплики',
    'more.s4.p': 'Юниты разговаривают в бою. Реплика подбирается по тому, кто говорит, в кого бьёт и что только что произошло. Чистый флейвор — игровая логика это не читает.',
    'more.s5.h': 'Литании',
    'more.s5.p': 'Восемнадцать срежиссированных казней, по две на каждого героя. Когда на поле стоит нужный строй, а вражеский чемпион вот-вот падёт, сначала выступает хор, а удар наносит ведущий — и, в отличие от реплики, это даёт награду.',

    'join.label': 'Присоединиться',
    'join.lede': 'Без установки, без регистрации, без страницы в магазине. Откройте бота, выберите фракцию — и через пару минут у вас первый замок.',
    'join.cta': 'Открыть @shattered_crown_bot',

    'footer.note': 'Shattered Crown — пошаговая тактика в Telegram.',
    'footer.demos': 'Каждое демо на этой странице работает на коде и данных самой игры.',
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
