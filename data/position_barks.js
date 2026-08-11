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
      'Too close. Put me in the back.',
      'I cannot cast from the front line.',
    ],
    lines_ru: [
      'Слишком близко. Поставьте меня назад.',
      'Из первого ряда я не смогу колдовать.',
    ],
    ok: [
      'Better. Now I can cast.',
      'Good. Back line is mine.',
    ],
    ok_ru: [
      'Так лучше. Теперь смогу колдовать.',
      'Хорошо. Задний ряд — мой.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Archer' },
    lines: [
      'Too close to shoot. Move me back.',
      'A bow is useless in the front line.',
    ],
    lines_ru: [
      'Слишком близко для выстрела. Отодвиньте меня.',
      'В первом ряду лук бесполезен.',
    ],
    ok: [
      'Now I can shoot.',
      'Good. Clear line of fire.',
    ],
    ok_ru: [
      'Теперь смогу стрелять.',
      'Хорошо. Линия огня открыта.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Engineer' },
    lines: [
      'Wrong place. I work from the back line.',
      'I cannot work with blades in my face.',
    ],
    lines_ru: [
      'Не то место. Я работаю из заднего ряда.',
      'Я не смогу работать с клинками перед лицом.',
    ],
    ok: [
      'Good. My hands are free.',
      'Better. Now I can work.',
    ],
    ok_ru: [
      'Хорошо. Руки свободны.',
      'Так лучше. Теперь смогу работать.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Holy', faction: 'e' },
    lines: [
      'Not the front line. Put steel here, not prayer.',
      'I bless the line, I do not hold it. Move me back.',
    ],
    lines_ru: [
      'Не в первый ряд. Здесь нужна сталь, а не молитва.',
      'Я благословляю строй, а не держу его. Назад меня.',
    ],
    ok: [
      'Good. Mithrail is with you.',
      'Better. Now it reaches all of them.',
    ],
    ok_ru: [
      'Хорошо. Митраил с вами.',
      'Так лучше. Теперь оно дойдёт до всех.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Holy', faction: 'g' },
    lines: [
      'I tend the fallen. Not from the front line.',
      'I will not last a round here. Move me back.',
    ],
    lines_ru: [
      'Я забочусь о павших. Но не из первого ряда.',
      'Здесь я не продержусь и раунда. Назад меня.',
    ],
    ok: [
      'Better. Mother sees it.',
      'Good. Here I can still work.',
    ],
    ok_ru: [
      'Так лучше. Мать это видит.',
      'Хорошо. Здесь я ещё пригожусь.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Holy' },
    lines: [
      'Wrong place. My work is done from the back.',
      'Not the front line. Put someone with armour here.',
    ],
    lines_ru: [
      'Не то место. Моё дело — задний ряд.',
      'Не в первый ряд. Поставьте сюда кого-то в броне.',
    ],
    ok: [
      'Better. Now I can help them.',
      'Good. This is my place.',
    ],
    ok_ru: [
      'Так лучше. Теперь я им помогу.',
      'Хорошо. Это моё место.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Vampire' },
    lines: [
      'Astaloth wont see my pain from here.',
      'This is not the place for me.',
    ],
    lines_ru: [
      'Только не первый ряд. Я там сгорю.',
      'Слишком близко. Отодвиньте меня назад.',
    ],
    ok: [
      'Better. Mother watches.',
      'Good. Here I last.',
    ],
    ok_ru: [
      'Так лучше. Мать смотрит.',
      'Хорошо. Здесь я устою.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Spirit', faction: 'g' },
    lines: [
      'I hold nothing in the front line. Move me back.',
      'Not the front. Please.',
    ],
    lines_ru: [
      'В первом ряду мне не устоять. Отодвиньте назад.',
      'Только не первый ряд. Прошу.',
    ],
    ok: [
      'Better. Thank you.',
      'Yes. Here.',
    ],
    ok_ru: [
      'Так лучше. Спасибо.',
      'Да. Здесь.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Spirit', faction: 'e' },
    lines: [
      'Wrong post. I am no wall — put one here.',
      'Front line is not mine. Send me back.',
    ],
    lines_ru: [
      'Не мой пост. Я не стена — поставьте сюда стену.',
      'Первый ряд не мой. Отправьте меня назад.',
    ],
    ok: [
      'Post accepted.',
      'Better.',
    ],
    ok_ru: [
      'Пост принят.',
      'Так лучше.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Spirit' },
    lines: [
      'Too thin for the front line.',
      'Wrong place.',
    ],
    lines_ru: [
      'Я слишком слаб для первого ряда.',
      'Не то место.',
    ],
    ok: [
      'Better here.',
      'Good. Now I can help.',
    ],
    ok_ru: [
      'Здесь лучше.',
      'Хорошо. Теперь я пригожусь.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Court' },
    lines: [
      'Wrong rank.',
      'Rhaa sollan ti... the front line is not my place.',
    ],
    lines_ru: [
      'Не тот ряд.',
      'Рхаа соллан ти... первый ряд не моё место.',
    ],
    ok: [
      'Better. Now I can sing.',
      'They will hear the Choir!',
    ],
    ok_ru: [
      'Так лучше. Теперь я спою.',
      'Они услышат наш Хор!',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Demon' },
    lines: [
      'My song does not carry from the front line.',
      'NOT HERE! Back. Put me back!',
    ],
    lines_ru: [
      'Из первого ряда моя песнь не звучит.',
      'НЕ СЮДА! Назад. Поставь меня назад!',
    ],
    ok: [
      'Now they will hear every word.',
      'Yes. HERE.',
    ],
    ok_ru: [
      'Теперь они услышат каждое слово.',
      'Да. ЗДЕСЬ.',
    ],
  },
  {
    // Generic catch-all so a ranged unit with no matching tag still speaks.
    prefers: 'back',
    lines: [
      'Wrong place. Move me to the back line.',
      'Too close. I need distance.',
    ],
    lines_ru: [
      'Не то место. Отодвиньте меня в задний ряд.',
      'Слишком близко. Мне нужна дистанция.',
    ],
    ok: [
      'Better. This is my place.',
      'Good. Now I have room.',
    ],
    ok_ru: [
      'Так лучше. Это моё место.',
      'Хорошо. Теперь есть простор.',
    ],
  },

  // ===========================================================================
  // WANTS THE FRONT COLUMN — parked in the back, out of reach
  // ===========================================================================
  {
    prefers: 'front', actor: { tag: 'Knight', faction: 'e' },
    lines: [
      'I cannot hold the line from the back. Move me forward.',
      'I cannot slay them from here. Front line.',
    ],
    lines_ru: [
      'Из заднего ряда строй не удержать. Вперёд меня.',
      'Отсюда мне их не сразить. В первый ряд.',
    ],
    ok: [
      'Now I hold it.',
      'Good. Mithrail wills it.',
    ],
    ok_ru: [
      'Теперь удержу.',
      'Хорошо. На то воля Митраила.',
    ],
  },
  {
    // Grail knight — skeleton knights and the like. Same oath, sworn while they
    // still had a pulse, and kept out of habit rather than zeal.
    prefers: 'front', actor: { tag: 'Knight', faction: 'g' },
    lines: [
      'I swore to stand in front. Not here.',
      'I reach no one from the back. Move me forward.',
    ],
    lines_ru: [
      'Я клялся стоять впереди. Не здесь.',
      'Из заднего ряда я ни до кого не дотянусь. Вперёд.',
    ],
    ok: [
      'Now the oath holds.',
      'Better. Now I reach them.',
    ],
    ok_ru: [
      'Теперь клятва в силе.',
      'Так лучше. Теперь дотянусь.',
    ],
  },
  {
    // Choir knight — the Black Castellan and company. A knight by contract, not
    // by vow: he is here because the terms say front rank pays better.
    prefers: 'front', actor: { tag: 'Knight', faction: 'd' },
    lines: [
      'The verse said front rank. This is the back.',
      'I strike nothing from here... Closer...',
    ],
    lines_ru: [
      'В строках пелось про первый ряд. А это задний.',
      'Отсюда я никого не достану... Ближе...',
    ],
    ok: [
      'Aggraa am neee... front rank.',
      'Now I can strike. Lets proceed.',
    ],
    ok_ru: [
      'Агграа ам нэээ... первый ряд.',
      'Теперь достану. Приступим.',
    ],
  },
  {
    // Neutral fallback for a Knight with no faction on its def.
    prefers: 'front', actor: { tag: 'Knight' },
    lines: [
      'Put me in the front line.',
      'I cannot reach a thing from the back.',
    ],
    lines_ru: [
      'Поставьте меня в первый ряд.',
      'Из заднего ряда я ни до кого не дотянусь.',
    ],
    ok: [
      'Now I can reach them.',
      'Better. Front line.',
    ],
    ok_ru: [
      'Теперь дотянусь.',
      'Так лучше. Первый ряд.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Warrior' },
    lines: [
      'I swing at nothing from the back. Forward!',
      'Wrong place. My blade is short — front line!',
    ],
    lines_ru: [
      'Из заднего ряда я бью по воздуху. Вперёд!',
      'Не то место. Мой клинок короток — в первый ряд!',
    ],
    ok: [
      'Now I fight!',
      'Good. They end today!',
    ],
    ok_ru: [
      'Теперь сразимся!',
      'Хорошо. Сегодня им конец!',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Construct' },
    lines: [
      'I was built to be struck. Front line.',
      'Wrong position. Nothing reaches me back here.',
    ],
    lines_ru: [
      'Меня построили принимать удары. В первый ряд.',
      'Неверная позиция. Сюда удары не долетают.',
    ],
    ok: [
      'Now let them strike.',
      'Purpose served.',
    ],
    ok_ru: [
      'Теперь пусть бьют.',
      'Назначение исполнено.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Holy', faction: 'g' },
    lines: [
      'Can..not..re..ach...',
      'Wro..ng..pla..ce...',
    ],
    lines_ru: [
      'Не..до..ста..ю...',
      'Не..то..мес..то...',
    ],
    ok: [
      'Re..ach...',
      'Bet..te..r... ',
    ],
    ok_ru: [
      'До..тя..ну..сь...',
      'Лу..ч..ше...',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Holy', faction: 'e' },
    lines: [
      'Let me see what passes for fury among their kind! Closer!',
      'Let my faith be our shield! Put me in front!',
    ],
    lines_ru: [
      'Дай взглянуть что они зовут яростью! Ближе!',
      'Позволь моей вере быть нашим щитом! В первый ряд!',
    ],
    ok: [
      'Witness Mithrails light!',
      'Now none shall fall!',
    ],
    ok_ru: [
      'Узрите свет Митраила!',
      'Теперь никто не падёт!',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Demon' },
    lines: [
      'Their blood is out of reach from here! Forward!',
      'Aggra mo naaa... the back? NOT HERE!',
    ],
    lines_ru: [
      'Отсюда до их крови не достать! Вперёд!',
      'Аггра мо нааа... задний ряд? НЕ СЮДА!',
    ],
    ok: [
      'Close enough...',
      'Qeraa an moreee... yes, HERE.',
    ],
    ok_ru: [
      'Достаточно близко...',
      'Кераа ан морэээ... да, ЗДЕСЬ.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Zombie' },
    lines: [
      'Forward... not... here...',
      'Cannot... reach... front...',
    ],
    lines_ru: [
      'Вперёд... не... сюда...',
      'Не... достать... вперёд...',
    ],
    ok: [
      'Forward... yes... here...',
      'Now... reach... good...',
    ],
    ok_ru: [
      'Да... сюда...',
      'Теперь... достану... хорошо...',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Skeleton' },
    lines: [
      'Front line.',
      'I reach no one from the back. Move me forward.',
    ],
    lines_ru: [
      'В первый ряд.',
      'Из заднего ряда мне никого не достать. Вперёд.',
    ],
    ok: [
      'Now their blades dull on me.',
      'Better. Now I reach them.',
    ],
    ok_ru: [
      'Теперь их клинки затупятся об меня.',
      'Так лучше. Теперь достану.',
    ],
  },
  {
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