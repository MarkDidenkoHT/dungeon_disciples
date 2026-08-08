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
//   Empire (Knight / Holy / Engineer / Construct / Archer) — militant, stoic,
//     understated. Duty and discipline; never triumphant.
//   Grail of Sorrow (Vampire / Zombie / Spirit / Skeleton / Ghost) — mourning,
//     melancholic. Grief carried rather than performed.
//   Choir of the Cursed (Demon / Court / Choir / Beast) — greedy, self-serving.
//     Everything is a price, a debt, a share owed to them.
//
// Filters and specificity match combat_barks.js: `name` (+100) beats any tag
// rule, `tag`/`tags` score +2 each, `not` is a gate worth nothing. Ties pool
// together and one line is picked at random. `lines` and `lines_ru` must stay
// the same length and order — the client shows the viewer's language with no
// English fallback.

// `prefers` is the preference that was VIOLATED. A unit that wants the back
// column but was placed in front draws from the `prefers: 'back'` rules.
const POSITION_BARKS = [
  // ===========================================================================
  // WANTS THE BACK COLUMN — shoved into the front line
  // ===========================================================================
  {
    prefers: 'back', actor: { tag: 'Caster' },
    lines: [
      'Not sure about this. I have no armour to speak of.',
      'Put steel in front of me, or this will be a short battle.',
      'I need distance to work. Here I only bleed.',
    ],
    lines_ru: [
      'Сомневаюсь. Брони на мне почти нет.',
      'Поставьте кого-нибудь со сталью впереди, иначе бой выйдет коротким.',
      'Мне нужно расстояние для работы. Здесь я только истеку кровью.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Archer' },
    lines: [
      'A bow is no good at arm\'s length. Send me back.',
      'I cannot draw with a blade at my throat.',
      'Give me the rear rank and I will clear the field.',
    ],
    lines_ru: [
      'Лук бесполезен на расстоянии вытянутой руки. Верните меня назад.',
      'Я не натяну тетиву с клинком у горла.',
      'Дайте мне задний ряд, и я расчищу поле.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Engineer' },
    lines: [
      'I mend the line. I am not meant to be the line.',
      'My hands are for repairs, not for holding ground.',
      'Set me behind the armour and I will keep it standing.',
    ],
    lines_ru: [
      'Я чиню строй. Я не должен быть строем.',
      'Мои руки для починки, а не для удержания позиции.',
      'Поставьте меня за бронёй — и я не дам ей рухнуть.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Holy' },
    lines: [
      'I can shield the line or stand in it. Not both.',
      'Faith does not stop a spear. Put someone here who can.',
      'Let me tend them from behind. That is the work I was given.',
    ],
    lines_ru: [
      'Я могу защищать строй или стоять в нём. Но не одновременно.',
      'Вера не остановит копьё. Поставьте сюда того, кто остановит.',
      'Позвольте мне помогать им сзади. Это и есть моя работа.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Vampire' },
    lines: [
      'I have survived centuries by not standing here.',
      'Age has taught me patience, not recklessness. Move me back.',
      'I would rather not spend this body tonight.',
    ],
    lines_ru: [
      'Я пережил столетия именно потому, что не стоял здесь.',
      'Годы научили меня терпению, а не безрассудству. Отведите меня назад.',
      'Мне бы не хотелось тратить это тело сегодня.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Spirit' },
    lines: [
      'I am barely here as it is. Do not spend me first.',
      'Put something solid ahead of me. I am not.',
      'I have died once in a front rank. It was enough.',
    ],
    lines_ru: [
      'Меня и так едва хватает. Не тратьте меня первым.',
      'Поставьте впереди что-нибудь плотное. Я — нет.',
      'Я уже умирал в первом ряду. Мне хватило.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Ghost' },
    lines: [
      'I am barely here as it is. Do not spend me first.',
      'The front rank is for the solid. I have not been solid in years.',
    ],
    lines_ru: [
      'Меня и так едва хватает. Не тратьте меня первым.',
      'Первый ряд — для плотных. Я не был плотным уже много лет.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Court' },
    lines: [
      'I did not buy this rank to die in the first exchange.',
      'You are wasting an expensive asset. That is your coin, not mine.',
      'Others were made for this row. I was made for the one behind it.',
    ],
    lines_ru: [
      'Я покупал не тот чин, чтобы погибнуть при первом же размене.',
      'Вы транжирите дорогое имущество. Это ваши деньги, не мои.',
      'Другие созданы для этого ряда. Я — для того, что за ним.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Choir' },
    lines: [
      'My voice carries from anywhere. My throat does not.',
      'Spend the cheap ones here. I am owed better.',
    ],
    lines_ru: [
      'Мой голос доносится откуда угодно. Моё горло — нет.',
      'Тратьте здесь дешёвых. Мне причитается лучшее.',
    ],
  },
  {
    prefers: 'back', actor: { tag: 'Demon' },
    lines: [
      'I deal in prices, not in wounds. Move me back.',
      'You will owe me twice if I stand here.',
    ],
    lines_ru: [
      'Я торгую ценами, а не ранами. Отодвиньте меня назад.',
      'Если я встану здесь, вы задолжаете мне вдвойне.',
    ],
  },
  {
    // Generic catch-all so a ranged unit with no matching tag still speaks.
    prefers: 'back',
    lines: [
      'Not sure about this. I fight better from the back.',
      'I need room between me and them.',
    ],
    lines_ru: [
      'Сомневаюсь. Мне лучше сражаться сзади.',
      'Мне нужно расстояние между мной и ними.',
    ],
  },

  // ===========================================================================
  // WANTS THE FRONT COLUMN — parked in the back, out of reach
  // ===========================================================================
  {
    prefers: 'front', actor: { tag: 'Knight' },
    lines: [
      'Put me in the front line. I cannot reach a thing from here.',
      'The oath was to stand between them and you. Let me stand.',
      'This is not my place. Forward.',
    ],
    lines_ru: [
      'Поставьте меня в первый ряд. Отсюда я ни до кого не дотянусь.',
      'Я клялся встать между ними и вами. Дайте мне встать.',
      'Это не моё место. Вперёд.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Warrior' },
    lines: [
      'Put me in the front line. My blade does not carry this far.',
      'I did not come here to watch.',
      'Move me up. I am no use behind armour.',
    ],
    lines_ru: [
      'Поставьте меня в первый ряд. Мой клинок так далеко не достаёт.',
      'Я пришёл сюда не смотреть.',
      'Двиньте меня вперёд. За бронёй от меня нет толку.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Construct' },
    lines: [
      'I was built to be struck. Put me where the blows land.',
      'Plating this heavy is wasted in the second rank.',
      'Forward. That is the whole of my purpose.',
    ],
    lines_ru: [
      'Меня построили, чтобы принимать удары. Поставьте туда, куда они приходятся.',
      'Такая броня во втором ряду пропадает впустую.',
      'Вперёд. В этом всё моё назначение.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Holy' },
    lines: [
      'Let me take the first blow. I can bear it.',
      'Put me in the front line. Shield them with me.',
    ],
    lines_ru: [
      'Позвольте мне принять первый удар. Я выдержу.',
      'Поставьте меня в первый ряд. Прикройте их мной.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Beast' },
    lines: [
      'Let me at them. I cannot bite from back here.',
      'Chain me in front or do not bring me at all.',
    ],
    lines_ru: [
      'Пустите меня к ним. Отсюда я не укушу.',
      'Приковывайте меня впереди — или не берите вовсе.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Demon' },
    lines: [
      'I am paid in blood and there is none back here.',
      'Put me in front. I collect at close range.',
    ],
    lines_ru: [
      'Мне платят кровью, а здесь её нет.',
      'Поставьте меня вперёд. Я взыскиваю вблизи.',
    ],
  },
  {
    prefers: 'front', actor: { tag: 'Zombie' },
    lines: [
      'Forward. I do not mind what lands on me.',
      'Put me in the front line. I have little left to lose.',
    ],
    lines_ru: [
      'Вперёд. Мне всё равно, что в меня попадёт.',
      'Поставьте меня в первый ряд. Мне уже почти нечего терять.',
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
  },
  {
    // Generic catch-all for a range-1 unit with no matching tag.
    prefers: 'front',
    lines: [
      'Put me in the front line. I cannot reach from here.',
      'Move me forward. I am wasted back here.',
    ],
    lines_ru: [
      'Поставьте меня в первый ряд. Отсюда мне не дотянуться.',
      'Двиньте меня вперёд. Здесь я пропадаю зря.',
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

// Returns { text, text_ru } or null when the unit has nothing to say.
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
  return { text: rule.lines[i], text_ru: rule.lines_ru?.[i] ?? '' };
}

export {
  POSITION_BARKS,
  derivePrefPosition,
  isPositionSatisfied,
  pickPositionBark,
  FRONT_COL,
  BACK_COL,
};