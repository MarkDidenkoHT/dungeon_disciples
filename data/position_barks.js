// Formation hints, delivered as barks in battle prep.
//
// A new player who skipped the tutorial has no way of knowing that a caster
// dies in the front column or that a range-1 unit in the back column never
// swings. Rather than a rules panel nobody reads, the unit itself objects when
// you put it somewhere it does not belong. Zero mechanical effect — placement
// is still allowed, this only speaks up.
//
// PREFERRED POSITION
//   A unit's preference is derived from its reach, which is the thing that
//   actually matters on the grid:
//     range >= 2  -> 'back'   (shoots or casts; the front column is where it dies)
//     range == 1  -> 'front'  (must be in the front column to reach anything)
//   A unit definition may override this with an explicit `pref_position` of
//   'front' or 'back'. Anything without a usable range has no preference and
//   never barks.
//
// LARGE UNITS
//   Preference is checked against the unit's whole FOOTPRINT, not its anchor.
//   A 'row' unit (2 wide) stands in both columns at once, so it satisfies
//   either preference and never complains. A 'column' unit (2 tall) sits in one
//   column, so it is judged on that column like a normal tile. See
//   isPositionSatisfied() below — the caller passes the footprint columns.
//
// VOICE — the same three registers as data/combat_barks.js:
//   Empire (Knight / Holy / Engineer / Construct / Archer / Warrior) — militant
//     and zealous to the edge of xenophobia. Duty, oath and the line held.
//     Everything outside the Empire is unclean by default. Stoic, never
//     triumphant: they do not boast, they report. Their god is MITHRAIL, and
//     faith is not a comfort to them — it is a weapon that works. An Empire
//     unit never concedes that faith is insufficient; that is heresy in its
//     own mouth. It says faith is needed ELSEWHERE, or needed whole.
//   Grail of Sorrow (Vampire / Zombie / Spirit / Skeleton ) — NOT ancient.
//     They are barely a decade dead, the collateral of a time spell that went
//     wrong, and ASTALOTH mourns what became of his worshippers. So the register
//     is recent grief and confusion, not centuries of practised menace: they
//     remember being alive, and the memory is fresh enough to hurt. Never
//     cunning, never gloating — a vampire here is a frightened person who has
//     only just learned what they are now.
//     ASTALOTH IS FEMALE — the Mother, and "Mother" is used interchangeably with
//     her name. She is a grieving parent, not a captor: what happened to them
//     was done TO her children, not BY her. So she watches, keeps, shelters and
//     mourns. She never takes, spends, leaves short or withholds — a line like
//     "Astaloth left me so little" makes her the author of their state, which is
//     the opposite of the faction's whole premise.
//   Choir of the Cursed (Demon / Court / Choir / Beast) — born out of song, and
//     it shows: everything is music, terms, debt and appetite. Greedy, evil and
//     genuinely CUNNING — they bargain, they read the contract back to you, they
//     let someone cheaper bleed first. Their scripture is THE FIRST SONG, and
//     they lapse into a tongue nobody else speaks mid-sentence — the words are
//     deliberately untranslated, and are transliterated the same way in both
//     languages so the strangeness survives the translation.
//
// Filters and specificity match combat_barks.js: `name` (+100) beats any tag
// rule, `tag`/`tags` score +2 each, `not` is a gate worth nothing. Ties pool
// together and one line is picked at random. `lines` and `lines_ru` must stay
// the same length and order — the client shows the viewer's language with no
// English fallback.
//
// FACTION (`actor.faction`) — matches the unit definition's `f` field:
//   'e' Empire, 'g' Grail of Sorrow, 'd' Choir of the Cursed. Accepts a single
//   code or an array. Worth +3, so a faction rule always outranks the plain tag
//   rule it sits beside.
//
//   This is NOT decoration: three tags span more than one faction, and the
//   voices are incompatible.
//     Knight     — e, g and d. An Empire knight is a zealot; a Grail knight is
//                  a dead man keeping a promise he made while breathing; a
//                  Choir knight is a contractor. The Empire lines were being
//                  put in all three mouths.
//     Holy       — e and g. Empire holy burns the unclean. Grail holy IS the
//                  unclean, and mourns it.
//     Spirit     — e and g.
//     Construct  — e and d, but "I was built to be struck" fits both, so it
//                  stays a single tag rule.
//   Every faction-split tag keeps a plain tag-only rule as a fallback, written
//   neutrally, because a handful of unit defs carry no `f` at all.
//
// FOLLOW-UP (`ok` / `ok_ru`)
//   What the unit says once the player MOVES IT to where it wanted to be. Same
//   length and order as `lines`, and index-matched to it on purpose: ok[i]
//   answers lines[i], so the archer who could not draw with a blade at their
//   throat says they can draw now — not a generic "thank you". pickPositionBark
//   returns both halves in one object, so the caller holds the matching reply
//   without having to track which line index was rolled.
//
//   These are deliberately SHORTER than the complaint. A complaint is an
//   argument; an acknowledgement is a grunt. Anything longer reads as the unit
//   making a speech about being stood in the right place.
//
//   The caller decides WHEN to use it. Only a unit that actually complained has
//   anything to acknowledge — a unit dropped straight into the right cell should
//   stay silent rather than congratulate the player for doing nothing.

// `prefers` is the preference that was VIOLATED. A unit that wants the back
// column but was placed in front draws from the `prefers: 'back'` rules.
const POSITION_BARKS = [
  // ===========================================================================
  // WANTS THE BACK COLUMN — shoved into the front line
  // ===========================================================================
  {
    prefers: 'back', actor: { tag: 'Caster' },
    lines: [
      'Cant concentrate here.',
      'This is not the best place for me.',
    ],
    lines_ru: [
      'Тут я не сконцентрируюсь.',
      'Это не лучшее место для меня.',
    ],
    ok: [
      'Better. I can think now.',
      'This will do.',
    ],
    ok_ru: [
      'Так лучше. Теперь я могу думать.',
      'Вот это подойдёт.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Archer' },
    lines: [
      'A bow is no good at arm\'s length.',
      'I cannot draw with a blade at my throat.',
    ],
    lines_ru: [
      'Лук бесполезен на расстоянии вытянутой руки.',
      'Я не натяну тетиву с клинком у горла.',
    ],
    ok: [
      'Now I have the length for it.',
      'Now I can draw.',
    ],
    ok_ru: [
      'Теперь есть где размахнуться.',
      'Теперь я натяну тетиву.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Engineer' },
    lines: [
      'I work with tools better from the back.',
      'Set me behind a construct and I will keep it standing.',
    ],
    lines_ru: [
      'Я лучше управляюсь с инструментам с заднего ряда.',
      'Поставьте меня за конструктом, и я не дам ему рухнуть.',
    ],
    ok: [
      'Good. My hands are free.',
      'It will not fall while I am here.',
    ],
    ok_ru: [
      'Хорошо. Руки свободны.',
      'Пока я здесь, он не рухнет.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Holy', faction: 'e' },
    lines: [
      'The blessing dies with me. Put steel where the blows land.',
      'Mithrail speaks through me, not through my corpse.',
    ],
    lines_ru: [
      'Благословение умрёт вместе со мной. Поставьте под удар другого.',
      'Митраил говорит через меня, а не через мой труп.',
    ],
    ok: [
      'Now it reaches all of them.',
      'Good. Let the faithful hear it.',
    ],
    ok_ru: [
      'Теперь оно дойдёт до всех.',
      'Хорошо. Пусть верные услышат.',
    ],
  },
  {
    // Grail holy: the same office, the wrong side of it. They bless the dead
    // because they ARE the dead — no zeal, only duty carried out of habit.
    prefers: 'back', actor: { tag: 'Holy', faction: 'g' },
    lines: [
      'I tend the fallen. I cannot tend them while falling.',
      'Let me do this from behind. It is all I am still good for.',
    ],
    lines_ru: [
      'Я забочусь о павших. Я не смогу этого, падая сам.',
      'Позвольте делать это сзади. Больше я ни на что не гожусь.',
    ],
    ok: [
      'Mother sees it done.',
      'Here I can still work.',
    ],
    ok_ru: [
      'Мать видит, что дело сделано.',
      'Здесь я ещё пригожусь.',
    ],
  },
  {
    // Neutral fallback for a Holy unit whose def carries no faction.
    //
    // The second line used to be "Faith does not stop a spear" — which is a
    // holy unit conceding that its god is insufficient, i.e. heresy in its own
    // mouth. The complaint is now about REACH, not about faith failing: from
    // the back the blessing covers the whole line, from the front it covers one
    // corpse.
    prefers: 'back', actor: { tag: 'Holy' },
    lines: [
      'I can shield the line or stand in it. Not both.',
      'From behind, my faith covers all of them. Here it covers one.',
    ],
    lines_ru: [
      'Я могу защищать строй или стоять в нём. Но не одновременно.',
      'Сзади моя вера укроет всех. Здесь — только одного.',
    ],
    ok: [
      'Then I shield it. Go.',
      'Now it covers them all.',
    ],
    ok_ru: [
      'Тогда я укрою его. Идите.',
      'Теперь она укрывает всех.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Vampire' },
    lines: [
      'Astaloth wont see my pain from here.',
      'Ten years dead, and I still reach for a pulse.',
    ],
    lines_ru: [
      'Отсюда Асталот не увидит мою боль.',
      'Десять лет мёртв, а всё ищу свой пульс.',
    ],
    ok: [
      'Mother watches over me.',
      'Here I can be what I am now.',
    ],
    ok_ru: [
      'Мать смотрит за мной.',
      'Здесь я могу быть тем, кто я теперь.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Spirit', faction: 'g' },
    lines: [
      'Ten years ago I had a body for this.',
      'Hold me back. Mother would not want me spent here.',
    ],
    lines_ru: [
      'Десять лет назад у меня было для этого тело.',
      'Придержите меня. Мать не хотела бы, чтобы меня тратили здесь.',
    ],
    ok: [
      'Here I can last.',
      'Thank you. I will not fade yet.',
    ],
    ok_ru: [
      'Здесь я продержусь.',
      'Спасибо. Я ещё не растаю.',
    ],
  },
  {
    // Empire spirit: a soldier who kept reporting for duty after dying. Still
    // the Empire register — dutiful and flat, not mournful.
    prefers: 'back', actor: { tag: 'Spirit', faction: 'e' },
    lines: [
      'I stood in the line once. I cannot hold it now.',
      'What is left of me serves better behind.',
    ],
    lines_ru: [
      'Когда-то я стоял в строю. Теперь мне его не удержать.',
      'То, что от меня осталось, полезнее сзади.',
    ],
    ok: [
      'Mithrail keeps the line. I keep watch.',
      'This will serve.',
    ],
    ok_ru: [
      'Митраил держит строй. Я несу дозор.',
      'Так сгодится.',
    ],
  },
  {
    // Neutral fallback for a Spirit with no faction on its def.
    prefers: 'back', actor: { tag: 'Spirit' },
    lines: [
      'I am barely here as it is. Do not spend me first.',
      'What remains of me is not enough to hold the line.',
    ],
    lines_ru: [
      'Меня и так едва хватает. Не тратьте меня первым.',
      'Того, что от меня осталось, не хватит, чтобы держать строй.',
    ],
    ok: [
      'I will last longer here.',
      'What is left of me is enough for this.',
    ],
    ok_ru: [
      'Здесь меня хватит надольше.',
      'На это того, что осталось, хватит.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Court' },
    lines: [
      'Read the contract. My name is not in the front rank.',
      'Rhaa sollan ti — my part was bought, and it is not this one.',
    ],
    lines_ru: [
      'Перечитайте договор. Моего имени в первом ряду нет.',
      'Рхаа соллан ти — мою партию купили, и она не эта.',
    ],
    ok: [
      'Now the terms are honoured.',
      'Now I sing the part I was paid for.',
    ],
    ok_ru: [
      'Вот теперь условия соблюдены.',
      'Теперь я пою ту партию, за которую заплачено.',
    ],
  },
  {
    // The Choir proper — the singers, not the buyers. Where the Court quotes
    // contracts, these quote scripture, and half of it is in a tongue the
    // player is not meant to understand.
    prefers: 'back', actor: { tag: 'Choir' },
    lines: [
      'Vaa moreth an-suul... not from this corner.',
      'The First Song needs room to swell. Give it room.',
    ],
    lines_ru: [
      'Ваа морет ан-суул... только не из этого угла.',
      'Первой Песни нужно место, чтобы разрастись. Дайте его.',
    ],
    ok: [
      'Vaa moreth an-suul. Yes.',
      'Now it swells.',
    ],
    ok_ru: [
      'Ваа морет ан-суул. Да.',
      'Теперь она разрастается.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Demon' },
    lines: [
      'They will not hear my song from here.',
      'NOT HERE!',
    ],
    lines_ru: [
      'Отсюда они не услышат мою песню.',
      'НЕ СЮДА!',
    ],
    ok: [
      'Now they will hear every word.',
      'Да.',
    ],
    ok_ru: [
      'Теперь они услышат каждое слово.',
      'Да.',
    ],
  },
  {
    // Generic catch-all so a ranged unit with no matching tag still speaks.
    prefers: 'back',
    lines: [
      'Not sure about this.',
      'I need room between me and them.',
    ],
    lines_ru: [
      'Сомневаюсь в этом.',
      'Мне нужно расстояние между мной и ними.',
    ],
    ok: [
      'Yes. This is better.',
      'Now I have room.',
    ],
    ok_ru: [
      'Да. Так лучше.',
      'Теперь есть простор.',
    ],
  },

  // ===========================================================================
  // WANTS THE FRONT COLUMN — parked in the back, out of reach
  // ===========================================================================
  {
    prefers: 'front', actor: { tag: 'Knight', faction: 'e' },
    lines: [
      'The oath was to protect at all cost.',
      'Their kind should not exist. Let me begin.',
    ],
    lines_ru: [
      'Я клялся защищать любой ценой.',
      'Их род не должен существовать. Дайте начать.',
    ],
    ok: [
      'Now I can keep it.',
      'Mithrail wills it. I begin here.',
    ],
    ok_ru: [
      'Теперь я смогу её сдержать.',
      'На то воля Митраила. Начну отсюда.',
    ],
  },
  {
    // Grail knight — skeleton knights and the like. Same oath, sworn while they
    // still had a pulse, and kept out of habit rather than zeal.
    prefers: 'front', actor: { tag: 'Knight', faction: 'g' },
    lines: [
      'I swore this while I was still breathing. It still holds.',
      'Put me in front. I have already died once.',
    ],
    lines_ru: [
      'Я клялся, когда ещё дышал. Клятва в силе.',
      'Поставьте меня вперёд. Я уже умирал однажды.',
    ],
    ok: [
      'Mother heard it. It holds.',
      'Let it be quicker this time.',
    ],
    ok_ru: [
      'Мать её слышала. Она в силе.',
      'Пусть в этот раз будет быстрее.',
    ],
  },
  {
    // Choir knight — the Black Castellan and company. A knight by contract, not
    // by vow: he is here because the terms say front rank pays better.
    prefers: 'front', actor: { tag: 'Knight', faction: 'd' },
    lines: [
      'My terms say front rank. Honour them.',
      'I am owed a place where the blood is.',
    ],
    lines_ru: [
      'По моим условиям — первый ряд. Соблюдайте их.',
      'Мне причитается место, где есть кровь.',
    ],
    ok: [
      'The terms are met.',
      'The Song is paid. Now I collect.',
    ],
    ok_ru: [
      'Условия соблюдены.',
      'Песнь оплачена. Теперь я взыщу.',
    ],
  },
  {
    // Neutral fallback for a Knight with no faction on its def.
    prefers: 'front', actor: { tag: 'Knight' },
    lines: [
      'Put me in the front line.',
      'I cannot reach a thing from here.',
    ],
    lines_ru: [
      'Поставьте меня в первый ряд.',
      'Отсюда я ни до кого не дотянусь.',
    ],
    ok: [
      'Now I can reach them.',
      'Better.',
    ],
    ok_ru: [
      'Теперь я до них дотянусь.',
      'Так лучше.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Warrior' },
    lines: [
      'I did not come here to watch.',
      'Forward. I want them ended!',
    ],
    lines_ru: [
      'Я пришёл сюда не смотреть.',
      'Вперёд. Я хочу покончить с ними!',
    ],
    ok: [
      'Now I fight!',
      'They end today!',
    ],
    ok_ru: [
      'Теперь сразимся!',
      'Сегодня им конец!',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Construct' },
    lines: [
      'I was built to be struck.',
      'Forward. That is the whole of my purpose.',
    ],
    lines_ru: [
      'Меня построили, чтобы принимать удары.',
      'Вперёд. В этом всё моё назначение.',
    ],
    ok: [
      'Let them strike.',
      'Purpose served.',
    ],
    ok_ru: [
      'Пусть бьют.',
      'Назначение исполнено.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Holy', faction: 'g' },
    lines: [
      'Let me stand where they fall. I know that place.',
      'I have been dead. It holds nothing for me now.',
    ],
    lines_ru: [
      'Дайте встать там, где они падают. Мне это место знакомо.',
      'Я уже был мёртв. Теперь в этом нет ничего страшного.',
    ],
    ok: [
      'Then let them come.',
      'Mother is watching. I am ready.',
    ],
    ok_ru: [
      'Пусть теперь приходят.',
      'Мать смотрит. Я готов.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Holy', faction: 'e' },
    lines: [
      'Let me see what passes for fury among their kind!',
      'Let my faith be our shield!',
    ],
    lines_ru: [
      'Дай взглянуть что они зовут яростью!',
      'Позволь моей вере быть нашим щитом!',
    ],
    ok: [
      'Witness Mithrails light!',
      'The shield stands here!',
    ],
    ok_ru: [
      'Узрите свет Митраила!',
      'Щит стоит здесь!',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Demon' },
    lines: [
      'I want to paint next song in their blood.',
      'Aggra mo naaa.. what? WHAT? NOT HERE!',
    ],
    lines_ru: [
      'Я хочу нарисовать следущую песнь их кровью!',
      'Аггра мо нааа... что? ЧТО? НЕ СЮДА!',
    ],
    ok: [
      'Close enough...',
      'Qeraa an moreee... yes. HERE.',
    ],
    ok_ru: [
      'Достаточно близко...',
      'Кераа ан морэээ... да. ЗДЕСЬ.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Choir' },
    lines: [
      'The First Song is sung at the throat, not from the back of the room.',
      'Sollaa ver miin — closer. CLOSER.',
    ],
    lines_ru: [
      'Первую Песнь поют у горла, а не из глубины зала.',
      'Соллаа вер миин — ближе. БЛИЖЕ.',
    ],
    ok: [
      'Now it is sung properly.',
      'Sollaa ver miin. Yes.',
    ],
    ok_ru: [
      'Вот теперь она спета как надо.',
      'Соллаа вер миин. Да.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Zombie' },
    lines: [
      'Forward... not... here...',
      'Not... here...'
    ],
    lines_ru: [
      'Вперёд... не... сюда...',
      'Не... сюда...'
    ],
    ok: [
      'Forward... yes... here...',
      'Here... good...',
    ],
    ok_ru: [
      'Да... сюда...',
      'Хорошо...',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Skeleton' },
    lines: [
      'Forward. There is nothing left in me to break.',
      'Put me in the front line. Let them dull their blades.',
    ],
    lines_ru: [
      'Вперёд. Во мне уже нечему ломаться.',
      'Поставьте меня в первый ряд. Пусть тупят клинки.',
    ],
    ok: [
      'Mother keeps the rest of me safe.',
      'Their blades will dull on me.',
    ],
    ok_ru: [
      'Остальное Мать хранит.',
      'Их клинки затупятся об меня.',
    ],
  },
  {
    // Generic catch-all for a range-1 unit with no matching tag.
    prefers: 'front',
    lines: [
      'Put me in the front line.',
      'Move me forward.',
    ],
    lines_ru: [
      'Поставьте меня в первый ряд.',
      'Двиньте меня вперёд.',
    ],
    ok: [
      'Now I can reach them.',
      'Better.',
    ],
    ok_ru: [
      'Теперь я до них дотянусь.',
      'Так лучше.',
    ],
  },
];

// range >= 2 shoots or casts and wants the back column; range 1 must be in the
// front column to reach anything. An explicit `pref_position` on the unit
// definition always wins.
function derivePrefPosition(def) {
  if (!def) return null;
  if (def.pref_position === 'front' || def.pref_position === 'back') return def.pref_position;
  const range = Number(def.range);
  if (!Number.isFinite(range) || range <= 0) return null;
  return range >= 2 ? 'back' : 'front';
}

// `cols` is every column the unit's footprint covers. A 2-wide unit covers both
// and is therefore always content; everything else is judged on the column(s)
// it actually occupies. FRONT_COL is the player's front column — see
// BattleEngine.reachableCol (frontCol = side === 'enemy' ? 0 : 1).
const FRONT_COL = 1;
const BACK_COL  = 0;

function isPositionSatisfied(prefers, cols) {
  if (!prefers || !Array.isArray(cols) || cols.length === 0) return true;
  if (prefers === 'front') return cols.includes(FRONT_COL);
  if (prefers === 'back')  return cols.includes(BACK_COL);
  return true;
}

function unitTags(def) {
  return (def?.tags ?? []).filter(Boolean);
}

// Same scoring as combat_barks: an exact name match outranks every tag rule.
function ruleScore(rule, def) {
  const f = rule.actor;
  if (!f) return 0;
  const tags = unitTags(def);
  if (f.not != null) {
    const excluded = Array.isArray(f.not) ? f.not : [f.not];
    if (excluded.some(t => tags.includes(t))) return -1;
  }
  let score = 0;
  if (f.name != null) {
    if (def?.name !== f.name) return -1;
    score += 100;
  }
  if (f.faction != null) {
    // A unit def with no `f` can never satisfy a faction rule — it falls through
    // to the neutral tag rule instead of being handed someone else's voice.
    const wanted = Array.isArray(f.faction) ? f.faction : [f.faction];
    if (!def?.f || !wanted.includes(def.f)) return -1;
    score += 3;
  }
  if (f.tag != null) {
    if (!tags.includes(f.tag)) return -1;
    score += 2;
  }
  if (Array.isArray(f.tags)) {
    if (!f.tags.every(t => tags.includes(t))) return -1;
    score += 2 * f.tags.length;
  }
  return score;
}

// Returns { text, text_ru, ok, ok_ru } or null when the unit has nothing to say.
//
// `ok`/`ok_ru` are the reply to THIS line, not a random one from the rule — the
// caller shows `text` on the bad placement and keeps the object, then shows `ok`
// if and when the player fixes it. Falls back to '' where a rule has no
// follow-up defined, same as the language fallback below.
function pickPositionBark(def, prefers) {
  if (!def || !prefers) return null;
  const scored = [];
  let best = -1;
  for (const rule of POSITION_BARKS) {
    if (rule.prefers !== prefers) continue;
    const score = ruleScore(rule, def);
    if (score < 0) continue;
    scored.push({ rule, score });
    if (score > best) best = score;
  }
  const pool = scored.filter(s => s.score === best).map(s => s.rule);
  if (!pool.length) return null;
  const rule = pool[Math.floor(Math.random() * pool.length)];
  const i    = Math.floor(Math.random() * rule.lines.length);
  return {
    text:    rule.lines[i],
    text_ru: rule.lines_ru?.[i] ?? '',
    ok:      rule.ok?.[i] ?? '',
    ok_ru:   rule.ok_ru?.[i] ?? '',
  };
}

export {
  POSITION_BARKS,
  derivePrefPosition,
  isPositionSatisfied,
  pickPositionBark,
  FRONT_COL,
  BACK_COL,
};