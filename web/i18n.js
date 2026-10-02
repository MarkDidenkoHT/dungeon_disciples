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
    'hero.sub': 'A turn-based tactics game played inside Telegram. Raise a castle, recruit a line, equip it, and take it down into the dark — six-unit formations, positional combat, and a roster that is permanently yours.',
    'hero.cta': 'Play on Telegram',
    'hero.cta2': 'See the mechanics',
    'hero.meta': 'Free to play · no install · opens in Telegram',

    'lore.label': 'The realm',
    'lore.h2': 'A Realm Divided',
    'lore.p1': 'The old order has fallen. Where a single crown once held dominion, three powers now claw for what remains.',
    'lore.p2': 'At the heart of the conflict lies a fractured relic — a vessel said to grant dominion over life, death, and the space between. Empire, Choir, and Grail each stake a rightful claim to its power, and none will yield.',
    'lore.p3': 'You are a Disciple, bound to serve one banner in the dungeons and battlefields ahead. Choose wisely — your faction shapes not only your allies, but the fate of the realm.',

    'factions.label': 'Choose a banner',
    'factions.h2': 'Three answers to the same war',
    'factions.lede': 'Your faction is picked once and never again. It decides which units you can recruit, which items you can forge, what your castle looks like, and which Colossus you spend your week killing.',

    'f.empire.name': 'Aurex',
    'f.empire.desc': 'The Empire of Aurex keeps to Mithrail, the Golden Lion, who rewards those who hold the line. Its knights, priests and engineers fight as one wall — armored, sanctified, and certain that every shard belongs to Aurex.',

    'f.choir.name': 'The Choir',
    'f.choir.desc': 'The court of Cinderhold was losing the war for the crown, and tried everything: rites, oaths, older rites. Nothing held. Then a troupe nobody had invited played in the hall, in a tongue nobody knew, and the court learned the First Song. Aggrail answered it. The lords are demons now and the court is a choir, and it is still singing.',

    'f.grail.name': 'The Grail',
    'f.grail.desc': 'In the war for Ilmenar its scholars cast a spell to carry their people forward. The working was wrong: their bodies were never moved into the future — they lived a century through in an instant. Two answers divide them now: accept the rot, or hold it back with the blood and living essence of others.',

    'loop.label': 'The loop',
    'loop.h2': 'What you actually do',
    'loop.lede': 'A session is a few minutes. The castle grows over weeks, and nothing you build is taken away from you.',

    'loop.s1.h': 'Raise the castle',
    'loop.s1.p': 'Every building is a decision: a barracks recruits one line of units, a hall opens a mechanic. Two pages, twenty-four plots, and prices that make you choose.',
    'loop.s2.h': 'Recruit and branch',
    'loop.s2.p': 'Units are not bought from a shop — they are recruited from the building that houses them, then upgraded along a branching tree. The branch you take is the unit you keep.',
    'loop.s3.h': 'Forge and equip',
    'loop.s3.p': 'Eighty-four items across five rarities, crafted from what you drag out of the dungeons. An item changes stats, grants a passive, and can add or strip a unit’s tags outright.',
    'loop.s4.h': 'Embark',
    'loop.s4.p': 'Three regions, ten floors each, bosses on three of them. Six units in a two-by-three formation where the cell a unit stands in decides what can reach it.',
    'loop.s5.h': 'Fight for position',
    'loop.s5.p': 'Turn order comes from initiative, damage from six elements and armor, and most abilities care where everyone is standing. A formation is a plan, not a seating chart.',
    'loop.s6.h': 'Weekly and daily',
    'loop.s6.p': 'A faction Colossus with ten thousand health and four phases, errands, a nightly Crown Tourney, PvP, and engravings paid for with what you win.',

    'd.castle.label': 'Mechanic',
    'd.castle.h2': 'The castle',
    'd.castle.p1': 'Your castle is two pages of plots. The first holds the throne and the barracks that recruit your units; the second holds the halls — forge, infirmary, mage guild, temple — each with its own ladder of levels.',
    'd.castle.p2': 'The three factions do not share a single building. Switch banner below and the whole grid changes: different units behind the same plots, different art, different prices.',
    'd.castle.li1': 'Tap any square to see what stands there and what it cost.',
    'd.castle.li2': 'Empty plots show the one building they will take, greyed out.',
    'd.castle.li3': 'Arrows move between the two pages.',
    'd.castle.caption': 'The real castle screen, with a castle built out for you.',

    'd.embark.label': 'Mechanic',
    'd.embark.h2': 'Embark',
    'd.embark.p1': 'Three regions, ten floors each. Every floor is a fixed encounter — the same enemies, in the same cells, with the same equipment — so a floor you lose is a floor you can plan against.',
    'd.embark.p2': 'The guaranteed crystal on each card tells you what the region pays. Which is how you decide where to go when the forge wants two of something you have none of.',
    'd.embark.li1': 'Tap a floor number to see exactly who is waiting on it.',
    'd.embark.li2': 'Tap a stat or an ability icon on an enemy card to have it explained.',
    'd.embark.li3': 'Floors 3, 6 and 10 end in a boss.',
    'd.embark.caption': 'Live encounter tables — the same ones the game fights.',

    'd.evolve.label': 'Mechanic',
    'd.evolve.h2': 'Unit evolution',
    'd.evolve.p1': 'A recruit is a starting point, not a purchase. Every unit sits at the root of a branching line, and each tier you pay for is a fork — the same conscript becomes infantry, cavalry or a banner, and the three go different places from there.',
    'd.evolve.p2': 'The branch is permanent, and it is per unit rather than per account: two players running the same faction can field rosters with nothing in common. This is the longest decision in the game, which is why the tree shows you the whole line before you commit to one step of it.',
    'd.evolve.li1': 'Pick a line along the bottom to see its whole tree.',
    'd.evolve.li2': 'Tap a node for its card — stats shown as the change from its parent.',
    'd.evolve.li3': 'Tap a stat or ability on the card to have it explained.',
    'd.evolve.caption': 'The castle’s own evolution tree, over the real upgrade paths.',

    'd.heroes.label': 'Mechanic',
    'd.heroes.h2': 'Heroes',
    'd.heroes.p1': 'Three champions answer each banner, and the one you take is permanent. Every hero casts the spells you research — what separates them is the blow they strike and the passive they carry.',
    'd.heroes.p2': 'A hero is also the only unit that banks power, which is what pays for spells mid-battle. Build the formation around what theirs rewards: Holy allies beside the Paladin, a stacked column behind the Regent, Vampires at the Prophet’s side.',
    'd.heroes.li1': 'Switch banner to meet its three.',
    'd.heroes.li2': 'Tap a portrait to bring up that hero’s card.',
    'd.heroes.li3': 'Tap any stat or ability icon for the detail.',
    'd.heroes.caption': 'The real unit card, and the text new players read at registration.',

    'd.items.label': 'Mechanic',
    'd.items.h2': 'Items',
    'd.items.p1': 'Eighty-four items, five rarities. Commons and rares stack; every epic and mythic is unique, so you will only ever own one. SHATTERED is not on that power ladder at all — epic in scale, epic in price, and its own rarity purely so tournament rules can budget it separately.',
    'd.items.p2': 'An item is more than numbers. It carries a passive, it can require a tag before a unit may wear it, and it can grant or strip tags outright: Bloodless turns a Zombie into a Skeleton, and everything that cared about Zombies stops caring.',
    'd.items.li1': 'Filter by rarity, tap a card for its passive and its full price.',
    'd.items.li2': 'Every card is the game’s own item card.',
    'd.items.li3': 'Prices are the live crafting costs.',
    'd.items.caption': 'The whole catalog, straight out of the game data.',

    'd.transmute.label': 'Mechanic',
    'd.transmute.h2': 'Transmutation',
    'd.transmute.p1': 'Six kinds of crystal, and a recipe always wants the one you are short of. Transmutation turns the surplus into it: two different crystals go in — one of each per crystal made — and a third kind of your choosing comes out.',
    'd.transmute.p2': 'It costs time rather than gold: one hour, plus a minute for every crystal produced. You start it and come back. The lab has to be built before any of this is available.',
    'd.transmute.li1': 'Tap a corner to choose a crystal, then − and + to size the batch.',
    'd.transmute.li2': 'Hold − or + to run by five.',
    'd.transmute.li3': 'The wait is shortened here so you can watch it finish.',
    'd.transmute.caption': 'The real widget. Shortened timer, live crystal maths.',

    'd.engrave.label': 'Mechanic',
    'd.engrave.h2': 'Engraving',
    'd.engrave.p1': 'Permanent, per-unit stat surgery. A combo is three stats; you mark one of them negative and the other two positive. The magnitudes are not yours to pick — the negative is worth about twice its positive, so the sacrifice pays for the pair.',
    'd.engrave.p2': 'The tier multiplies the whole triangle, and the price is Valor from the Colossus, gold, and tokens that can only be won in the Crown Tourney. An engraving can be replaced. It can never be removed.',
    'd.engrave.li1': 'Pick a unit, pick a combo, then spend the points with − and +.',
    'd.engrave.li2': 'Every number shown is that unit’s real stat.',
    'd.engrave.li3': 'The eighth combo trades passive ranks instead of stats.',
    'd.engrave.caption': 'The real engraving page over a three-unit roster.',

    'd.colossus.label': 'Mechanic',
    'd.colossus.h2': 'The Colossus',
    'd.colossus.p1': 'One boss per faction per week, ten thousand health, and your whole faction hitting it together. Every point of damage is banked against your own milestones, and the three factions can see each other’s progress.',
    'd.colossus.p2': 'It is not a health bar with a hat on. Four phases, and it changes what it does at each one: a line sweep at full health becomes armor-piercing roots, then a death knell, then whatever is left at the bottom. Units that fight it come back exhausted and have to be paid for.',
    'd.colossus.li1': 'Attack repeatedly and watch the phase change under it.',
    'd.colossus.li2': 'Tap a rival faction to see how far along they are.',
    'd.colossus.li3': 'In the game, Attack opens a real battle.',
    'd.colossus.caption': 'The real Colossus page. Attack resolves a round here.',

    'join.label': 'Join',
    'join.h2': 'It runs inside Telegram',
    'join.lede': 'No install, no account to make, no store page. Open the bot, choose a banner, and the first castle is yours in a couple of minutes.',
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
    'hero.sub': 'Пошаговая тактика прямо в Telegram. Поднимите замок, наберите строй, снарядите его и спуститесь во тьму — отряды из шести юнитов, позиционный бой и ростер, который остаётся вашим навсегда.',
    'hero.cta': 'Играть в Telegram',
    'hero.cta2': 'Посмотреть механики',
    'hero.meta': 'Бесплатно · без установки · открывается в Telegram',

    'lore.label': 'Королевство',
    'lore.h2': 'Расколотое Королевство',
    'lore.p1': 'Старый порядок пал. Там, где раньше властвовала единая корона, теперь три силы борются за то, что осталось.',
    'lore.p2': 'В сердце конфликта лежит расколотая реликвия — сосуд, дающий власть над жизнью, смертью и пространством между ними. Империя, Хор и Грааль — каждый заявляет законное право на её силу, и никто не намерен уступать.',
    'lore.p3': 'Вы — Адепт, связанный служением одному знамени в грядущих подземельях и битвах. Выбирайте мудро — ваша фракция определяет не только союзников, но и судьбу королевства.',

    'factions.label': 'Выберите знамя',
    'factions.h2': 'Три ответа на одну войну',
    'factions.lede': 'Фракция выбирается один раз и навсегда. Она решает, каких юнитов вы набираете, какие предметы куёте, как выглядит ваш замок и какого Колосса вы убиваете всю неделю.',

    'f.empire.name': 'Аурекс',
    'f.empire.desc': 'Империя Аурекс поклоняется Митраилу, Золотому Льву. Его рыцари, жрецы и инженеры бьются как одна стена — в броне, освящённые и уверенные, что каждый осколок принадлежит Аурексу.',

    'f.choir.name': 'Хор',
    'f.choir.desc': 'Двор Пепельного Чертога проигрывал войну за корону и хватался за что угодно: обряды, клятвы, обряды постарше. Ничто не держалось. Пока в зале не заиграла труппа, которую никто не звал, на языке, которого никто не знал, — и двор выучил Первую Песнь. Агграил ответил. Владыки стали демонами, а двор — хором, и он поёт до сих пор.',

    'f.grail.name': 'Грааль',
    'f.grail.desc': 'В войне за Ильменар его учёные сотворили заклинание, чтобы продвинуть свой народ вперёд. Ошибка в сотворении: не их тела перенесло в будущее — они состарились на век за мгновение. Теперь их разделяют два ответа: принять тлен или сдерживать его чужой кровью.',

    'loop.label': 'Цикл',
    'loop.h2': 'Чем вы на самом деле занимаетесь',
    'loop.lede': 'Сессия — несколько минут. Замок растёт неделями, и ничто построенное у вас не отнимут.',

    'loop.s1.h': 'Поднять замок',
    'loop.s1.p': 'Каждое строение — решение: казарма набирает одну линию юнитов, зал открывает механику. Две страницы, двадцать четыре площадки и цены, которые заставляют выбирать.',
    'loop.s2.h': 'Набирать и ветвиться',
    'loop.s2.p': 'Юнитов не покупают в лавке — их набирают в строении, которое их держит, а затем улучшают по ветвящемуся дереву. Выбранная ветка и есть юнит, который у вас останется.',
    'loop.s3.h': 'Ковать и снаряжать',
    'loop.s3.p': 'Восемьдесят четыре предмета пяти редкостей, создаваемых из того, что вы вытащили из подземелий. Предмет меняет статы, даёт пассивку и может добавить или снять метки юнита целиком.',
    'loop.s4.h': 'Отправляться в поход',
    'loop.s4.p': 'Три региона, по десять этажей, боссы на трёх из них. Шесть юнитов в строю два на три, где клетка решает, кто до кого достанет.',
    'loop.s5.h': 'Бороться за позицию',
    'loop.s5.p': 'Порядок хода задаёт инициатива, урон — шесть элементов и броня, а большинству способностей важно, кто где стоит. Строй — это план, а не рассадка.',
    'loop.s6.h': 'Еженедельное и ежедневное',
    'loop.s6.p': 'Колосс фракции с десятью тысячами здоровья и четырьмя фазами, поручения, вечерний Турнир Короны, PvP и гравировки за то, что вы выиграли.',

    'd.castle.label': 'Механика',
    'd.castle.h2': 'Замок',
    'd.castle.p1': 'Ваш замок — две страницы площадок. На первой трон и казармы, где набираются юниты; на второй залы — кузница, лазарет, гильдия магов, храм — у каждого своя лестница уровней.',
    'd.castle.p2': 'У трёх фракций нет ни одного общего строения. Переключите знамя ниже — и вся сетка изменится: другие юниты за теми же площадками, другая графика, другие цены.',
    'd.castle.li1': 'Нажмите на любую клетку, чтобы увидеть, что там стоит и чего это стоило.',
    'd.castle.li2': 'Пустые площадки показывают единственное строение, которое примут, — приглушённым.',
    'd.castle.li3': 'Стрелки переключают две страницы.',
    'd.castle.caption': 'Настоящий экран замка, уже отстроенный за вас.',

    'd.embark.label': 'Механика',
    'd.embark.h2': 'Поход',
    'd.embark.p1': 'Три региона, по десять этажей. Каждый этаж — фиксированная встреча: те же враги, в тех же клетках, с тем же снаряжением. Проигранный этаж — этаж, к которому можно подготовиться.',
    'd.embark.p2': 'Гарантированный кристалл на карточке говорит, чем платит регион. Так и решают, куда идти, когда кузнице нужно два чего-то, чего у вас нет вовсе.',
    'd.embark.li1': 'Нажмите номер этажа, чтобы увидеть, кто именно там ждёт.',
    'd.embark.li2': 'Нажмите на стат или иконку способности врага — и это объяснят.',
    'd.embark.li3': 'Этажи 3, 6 и 10 заканчиваются боссом.',
    'd.embark.caption': 'Живые таблицы встреч — те же, с которыми вы сражаетесь в игре.',

    'd.evolve.label': 'Механика',
    'd.evolve.h2': 'Эволюция юнитов',
    'd.evolve.p1': 'Рекрут — это начало, а не покупка. Каждый юнит стоит в корне ветвящейся линии, и каждый оплаченный тир — это развилка: один и тот же ополченец становится пехотой, кавалерией или знаменосцем, а дальше эти трое расходятся ещё сильнее.',
    'd.evolve.p2': 'Ветка выбирается навсегда и для каждого юнита отдельно: двое игроков одной фракции могут собрать отряды, в которых нет ничего общего. Это самое долгое решение в игре — потому дерево и показывает всю линию до того, как вы сделаете первый шаг.',
    'd.evolve.li1': 'Выберите линию внизу, чтобы увидеть всё её дерево.',
    'd.evolve.li2': 'Нажмите узел — откроется карточка, статы показаны как разница с предком.',
    'd.evolve.li3': 'Нажмите на стат или способность в карточке — и это объяснят.',
    'd.evolve.caption': 'Дерево эволюции из замка, на настоящих путях улучшения.',

    'd.heroes.label': 'Механика',
    'd.heroes.h2': 'Герои',
    'd.heroes.p1': 'На каждое знамя откликаются трое, и выбранный — навсегда. Заклинания читают все герои; различаются они ударом и пассивкой.',
    'd.heroes.p2': 'Герой — ещё и единственный юнит, который копит силу, а ею и оплачиваются заклинания посреди боя. Стройте отряд вокруг того, что его пассивка вознаграждает: Святые рядом с Паладином, плотная колонна за Регентом, вампиры подле Пророка.',
    'd.heroes.li1': 'Переключите знамя, чтобы встретить его троих.',
    'd.heroes.li2': 'Нажмите портрет, чтобы открыть карточку героя.',
    'd.heroes.li3': 'Нажмите на любой стат или иконку способности для подробностей.',
    'd.heroes.caption': 'Настоящая карточка юнита и текст, который новички читают при регистрации.',

    'd.items.label': 'Механика',
    'd.items.h2': 'Предметы',
    'd.items.p1': 'Восемьдесят четыре предмета, пять редкостей. Обычные и редкие складываются; каждый эпический и мифический уникален — у вас будет только один. РАСКОЛОТЫЕ вообще не на этой лестнице силы: эпические по масштабу, эпические по цене и отдельная редкость лишь затем, чтобы турнирные правила считали их отдельно.',
    'd.items.p2': 'Предмет — это не только цифры. Он несёт пассивку, может требовать метку, прежде чем юнит его надет, и может давать или снимать метки целиком: «Обескровленный» превращает зомби в скелета — и всё, что зависело от зомби, перестаёт зависеть.',
    'd.items.li1': 'Фильтруйте по редкости, нажмите карточку — увидите пассивку и полную цену.',
    'd.items.li2': 'Каждая карточка — настоящая игровая карточка предмета.',
    'd.items.li3': 'Цены — это живые затраты на создание.',
    'd.items.caption': 'Весь каталог, прямо из игровых данных.',

    'd.transmute.label': 'Механика',
    'd.transmute.h2': 'Трансмутация',
    'd.transmute.p1': 'Шесть видов кристаллов, и рецепту всегда нужен тот, которого не хватает. Трансмутация превращает излишки в него: внутрь идут два разных кристалла — по одному каждого за выходной, — а наружу выходит третий вид, на ваш выбор.',
    'd.transmute.p2': 'Платите не золотом, а временем: час плюс минута за каждый произведённый кристалл. Запустили и вернулись позже. Сначала нужно построить лабораторию.',
    'd.transmute.li1': 'Нажмите на угол, чтобы выбрать кристалл, затем − и +, чтобы задать партию.',
    'd.transmute.li2': 'Удерживайте − или +, чтобы менять по пять.',
    'd.transmute.li3': 'Здесь ожидание сокращено, чтобы вы увидели результат.',
    'd.transmute.caption': 'Настоящий виджет. Сокращённый таймер, живая арифметика кристаллов.',

    'd.engrave.label': 'Механика',
    'd.engrave.h2': 'Гравировка',
    'd.engrave.p1': 'Постоянная операция над статами одного юнита. Комбо — это три стата; один вы помечаете минусом, два других плюсом. Величины выбираете не вы: минус стоит примерно вдвое больше своего плюса, так что жертва оплачивает пару.',
    'd.engrave.p2': 'Ранг множит весь треугольник, а цена — Доблесть от Колосса, золото и жетоны, которые добываются только в Турнире Короны. Гравировку можно заменить. Убрать — никогда.',
    'd.engrave.li1': 'Выберите юнита и комбо, затем тратьте очки через − и +.',
    'd.engrave.li2': 'Каждое показанное число — настоящий стат этого юнита.',
    'd.engrave.li3': 'Восьмое комбо торгует рангами пассивок, а не статами.',
    'd.engrave.caption': 'Настоящая страница гравировки на ростере из трёх юнитов.',

    'd.colossus.label': 'Механика',
    'd.colossus.h2': 'Колосс',
    'd.colossus.p1': 'По одному боссу на фракцию в неделю, десять тысяч здоровья, и вся фракция бьёт его вместе. Каждая единица урона идёт в ваши личные вехи, а три фракции видят прогресс друг друга.',
    'd.colossus.p2': 'Это не полоска здоровья в шляпе. Четыре фазы, и на каждой он делает другое: удар по всему строю на полном здоровье становится корнями, пробивающими броню, затем смертным звоном, затем тем, что осталось на дне. Бойцы возвращаются от него истощёнными, и их нужно выкупать.',
    'd.colossus.li1': 'Атакуйте несколько раз и посмотрите, как под ним меняется фаза.',
    'd.colossus.li2': 'Нажмите на чужую фракцию, чтобы увидеть, как далеко они зашли.',
    'd.colossus.li3': 'В игре «Атаковать» открывает настоящий бой.',
    'd.colossus.caption': 'Настоящая страница Колосса. Здесь атака разрешает один раунд.',

    'join.label': 'Присоединиться',
    'join.h2': 'Игра работает внутри Telegram',
    'join.lede': 'Без установки, без регистрации, без страницы в магазине. Откройте бота, выберите знамя — и через пару минут первый замок ваш.',
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
