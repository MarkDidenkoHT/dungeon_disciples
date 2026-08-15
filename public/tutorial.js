import { api } from './api.js';

// Label for the bubble's dismiss button on informational steps (opts.showContinue).
const CONTINUE_LABEL = { en: 'Got it', ru: 'Понятно' };

// Faction-specific advice appended to the `second_building` step — the moment
// the player is actually about to pick their first recruit. It used to sit on
// the hero-selection screen, several steps too early to act on.
const FIRST_RECRUIT_HINT = {
  empire: {
    en: 'New to the Empire? Your first recruit should be a Conscript — sturdy enough to hold the front line while you learn the ropes. Casters and scouts hit hard, but they won’t survive long without a shield ahead of them.',
    ru: 'Впервые за Империю? Первым бойцом лучше взять Новобранца — он достаточно крепок, чтобы держать фронт, пока вы осваиваетесь. Заклинатели и разведчики бьют больно, но долго не проживут без щита впереди.',
  },
  choir_of_the_cursed: {
    en: 'New to the Choir? Your first recruit should be a Clay Gargoyle — its armor forgives early mistakes while you find your footing. The Choir’s squishier servants are powerful, but easy to lose before they matter.',
    ru: 'Впервые за Хор? Первым бойцом лучше взять Глиняную Горгулью — её броня прощает ранние ошибки, пока вы учитесь. Более хрупкие слуги Хора сильны, но их легко потерять раньше времени.',
  },
  grail_of_sorrow: {
    en: 'New to the Grail? Your first recruit should be a Risen — simple, resilient, and undemanding to field. Save the fragile spirits and casters for once you’ve got a frontline to protect them.',
    ru: 'Впервые за Грааль? Первым бойцом лучше взять Восставшего — простой, выносливый и неприхотливый боец. Хрупких духов и заклинателей приберегите до тех пор, пока не появится фронт для их защиты.',
  },
};

export function firstRecruitHint(player) {
  const L = player?.settings?.language === 'ru' ? 'ru' : 'en';
  return FIRST_RECRUIT_HINT[player?.faction]?.[L] ?? '';
}

const TUTORIAL_STEPS = {
  throne_upgrade: {
    en: {
      title: 'Welcome, Ruler',
      text: 'Your throne stands empty. Tap it to begin your reign and unlock your kingdom.',
    },
    ru: {
      title: 'Добро пожаловать, Правитель',
      text: 'Ваш трон пуст. Коснитесь его, чтобы начать правление и открыть королевство.',
    },
  },
  second_building: {
    en: {
      title: 'Grow Your Army',
      text: 'A hero alone cannot win every battle. Build another structure here to recruit a second unit.',
    },
    ru: {
      title: 'Растите армию',
      text: 'Один герой не выиграет каждую битву. Постройте здание здесь, чтобы набрать второго бойца.',
    },
  },
  // Kept under the roster_* keys so players mid-onboarding do not repeat steps
  // they have already completed — the copy moved to the castle, the flags did
  // not. Every one of these now plays out on a castle slot.
  roster_intro: {
    en: {
      title: 'Your Troops',
      text: 'Every building houses one unit. Tap this one to inspect its unit — check its stats and abilities, upgrade it, and equip it with items.',
    },
    ru: {
      title: 'Ваши войска',
      text: 'В каждом здании живёт один боец. Коснитесь этого здания, чтобы осмотреть его бойца: характеристики и способности, улучшение и снаряжение.',
    },
  },
  roster_equip_slot: {
    en: {
      title: 'Equipment Slot',
      text: 'Every unit carries one item, and it sits in this slot. Your hero came with a set of Padded Armor — tap the empty slot to open your items.',
    },
    ru: {
      title: 'Слот снаряжения',
      text: 'Каждый боец носит один предмет — он занимает этот слот. У вашего героя есть стёганый доспех: коснитесь пустого слота, чтобы открыть предметы.',
    },
  },
  roster_equip: {
    en: {
      title: 'Arm Your Hero',
      text: 'Everything this unit can wear is on the strip below — tap an icon to look at it. Padded Armor grants +5 HP; tap Equip to put it on.',
    },
    ru: {
      title: 'Снарядите героя',
      text: 'Всё, что может носить этот боец, — на полосе внизу: коснитесь значка, чтобы рассмотреть предмет. Стёганый доспех даёт +5 к здоровью — нажмите «Надеть».',
    },
  },
  roster_equipped: {
    en: {
      title: 'Armor Equipped',
      text: 'The armor now fills your hero\'s slot and its stats are already counted. Tap the slot any time to swap gear — new gear is made in the Items tab below.',
    },
    ru: {
      title: 'Доспех надет',
      text: 'Доспех занял слот вашего героя, а его характеристики уже учтены. Коснитесь слота в любой момент, чтобы сменить снаряжение, — новое создаётся во вкладке «Предметы» внизу.',
    },
  },
  roster_passive_stack: {
    en: {
      title: 'Passives Stack',
      text: 'Units and items both carry passives. When a unit and its gear share the same passive, the ranks add together — two sources of Regenerate 1 become Regenerate 2. Rank 3 is the ceiling, so pair gear with a unit that already has the passive you want to push.',
    },
    ru: {
      title: 'Пассивки складываются',
      text: 'Пассивные умения есть и у бойцов, и у предметов. Если умение совпадает, ранги складываются: два источника «Регенерации 1» дают «Регенерацию 2». Потолок — 3 ранг, поэтому подбирайте снаряжение к бойцу, у которого нужная пассивка уже есть.',
    },
  },
  battle_prep_lines: {
    en: {
      title: 'Front and Back',
      text: 'Your grid has two columns. The column facing the enemy is your front line and takes every melee attack; the back column stays out of reach until the whole front line falls. Put armor in front and your casters and archers behind it.',
    },
    ru: {
      title: 'Передняя и задняя линия',
      text: 'В вашем построении две колонки. Колонка, обращённая к врагу, — передняя линия, она принимает все ближние атаки; задняя колонка недосягаема, пока не падёт вся передняя. Ставьте броню вперёд, а магов и стрелков — за неё.',
    },
  },
  battle_prep_loyalty: {
    en: {
      title: 'Loyalty',
      text: 'Owning a unit is not the same as fielding one. Your hero always fights, but every follower costs loyalty, and this counter is your limit — large units take two. Build widely, then choose who marches; raise your hero\'s level to bring more of them at once.',
    },
    ru: {
      title: 'Верность',
      text: 'Иметь бойца и вести его в бой — не одно и то же. Герой сражается всегда, но каждый спутник стоит верности, и этот счётчик — ваш предел: крупные бойцы стоят двух. Стройте широко, но выбирайте, кто выступит; повышайте уровень героя, чтобы брать с собой больше воинов.',
    },
  },
  spell_revive: {
    en: {
      title: 'A Fallen Ally',
      text: 'One of your recruits lies fallen. Your Revival spell can bring them back — tap Resurrect to raise them.',
    },
    ru: {
      title: 'Павший союзник',
      text: 'Один из ваших бойцов пал. Заклинание воскрешения вернёт его — нажмите «Воскресить», чтобы поднять его.',
    },
  },
  spell_heal: {
    en: {
      title: 'Mend the Wounded',
      text: 'They return with barely any health. Your Mending spell restores HP outside of battle — tap Heal to patch them up.',
    },
    ru: {
      title: 'Исцелите раненого',
      text: 'Он вернулся почти без здоровья. Заклинание исцеления восстанавливает HP вне боя — нажмите «Лечить», чтобы подлечить его.',
    },
  },
  // Replaces the old `spell_buff` step, which told the player to cast a buff on
  // a unit before the fight. Spells are no longer charged or cast out of battle
  // — combat spells are researched here once and then cast during the fight —
  // so that step taught a screen that no longer does what it described. New key
  // rather than reused, because everyone needs to see the corrected lesson.
  spell_research: {
    en: {
      title: 'Your Spellbook',
      text: 'Spells are learned here, once, with crystals — a spell you research is yours for good. Battle spells are not cast from this screen: you cast them during the fight itself, from the Spell button.',
    },
    ru: {
      title: 'Книга заклинаний',
      text: 'Заклинания изучаются здесь один раз за кристаллы — изученное остаётся с вами навсегда. Боевые заклинания не читаются с этого экрана: их вы применяете прямо в бою, кнопкой «Заклинание».',
    },
  },
  // Two things a player cannot infer from the strip: where power comes from, and
  // that spending more of it on one cast makes that cast stronger.
  battle_power: {
    en: {
      title: 'Power',
      text: 'This is your power. It starts at zero and rises by one every time your hero acts, up to five. Casting spends it, and a spell cast with more power hits harder — so you choose between a small spell now and a bigger one later. Power does not carry over to the next battle, and it stops building if your hero falls.',
    },
    ru: {
      title: 'Сила',
      text: 'Это ваша сила. Она начинается с нуля и растёт на единицу каждый раз, когда герой действует, максимум до пяти. Заклинание тратит её, и чем больше силы вложено, тем сильнее эффект — так что выбирайте между слабым заклинанием сейчас и мощным позже. Сила не переносится в следующий бой и перестаёт расти, если герой пал.',
    },
  },
  embark_region: {
    en: {
      title: 'Choose Your Battle',
      text: 'Your army is ready. Tap this region to begin your first expedition.',
    },
    ru: {
      title: 'Выберите битву',
      text: 'Ваша армия готова. Коснитесь этого региона, чтобы начать первый поход.',
    },
  },
  battle_prep_start: {
    en: {
      title: 'Prepare for Battle',
      text: 'Tap your hero, then place them on your formation grid. Once placed, tap Enter Battle to begin.',
    },
    ru: {
      title: 'Подготовка к бою',
      text: 'Коснитесь героя, затем разместите его на сетке построения. После этого нажмите «В бой», чтобы начать.',
    },
  },
  battle_first_action: {
    en: {
      title: 'Your Turn',
      text: 'Tap Attack, then tap an enemy to strike. You can also use an Ability, Defend to cut incoming damage, or Spell to cast one of the spells you have researched.',
    },
    ru: {
      title: 'Ваш ход',
      text: 'Нажмите «Атака», затем коснитесь врага, чтобы атаковать. Можно также применить способность, встать в защиту, чтобы снизить получаемый урон, или выбрать «Заклинание» и прочесть одно из изученных.',
    },
  },
  // Shown once, the first time the player opens the app after finishing a
  // battle — the errand button stays hidden until then (see errandsUnlocked in
  // errands.js), so this step is also the moment it appears. The warning is the
  // important half: an errand takes a unit off the board, and a player who sends
  // their only frontliner out for six hours and then cannot embark has been
  // ambushed by a feature, not taught one.
  errands_intro: {
    en: {
      title: 'Errands',
      text: 'Word comes in from beyond the walls: work that needs one soldier, not an army. Send a unit out and it returns with XP, gold or crystals — no fighting, no risk of losing anyone. Each errand asks for two unit tags and pays a reward for each; a unit carrying both brings both halves home.',
    },
    ru: {
      title: 'Поручения',
      text: 'Из-за стен приходят вести: есть дела, для которых нужен один боец, а не армия. Отправьте бойца — он вернётся с опытом, золотом или кристаллами. Ни боя, ни риска кого-то потерять. Каждое поручение требует два тега бойца и платит за каждый; тот, кто носит оба, принесёт обе половины.',
    },
  },
  errands_away: {
    en: {
      title: 'They Will Be Gone',
      text: 'Careful: a unit on an errand leaves your roster for the whole duration — 2, 4 or 6 hours — and cannot embark until it comes back. The longer the trip, the better the pay. Never send the unit you need for your next battle.',
    },
    ru: {
      title: 'Его не будет на месте',
      text: 'Внимание: боец на поручении покидает отряд на весь срок — 2, 4 или 6 часов — и до возвращения не сможет пойти в поход. Чем дольше поручение, тем выше плата. Не отправляйте того, кто нужен вам в следующем бою.',
    },
  },
};

let activeCleanup = null;
let activeResizeHandler = null;

function lang(player) {
  return player?.settings?.language === 'ru' ? 'ru' : 'en';
}

export function isTutorialDone(player, stepId) {
  return !!player?.tutorials?.[stepId];
}

export async function markTutorialDone(player, stepId) {
  if (player.tutorials?.[stepId]) return;
  player.tutorials = { ...(player.tutorials || {}), [stepId]: true };
  try {
    const updated = await api('/player/tutorials', {
      player_id: player.id,
      chat_id:   player.chat_id,
      tutorials: { [stepId]: true },
    });
    player.tutorials = updated.tutorials;
  } catch {}
}

export function hideTutorial() {
  if (activeResizeHandler) {
    window.removeEventListener('resize', activeResizeHandler);
    activeResizeHandler = null;
  }
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
}

/**
 * Spotlights `targetEl` and shows the copy for `stepId`.
 *
 * opts.padding      px of breathing room around the target (default 8)
 * opts.showContinue render a dismiss button in the bubble, for steps that only
 *                   explain something instead of asking for a specific tap
 * opts.extraText    a second paragraph under the step copy, for advice that
 *                   varies by player (e.g. the faction's first-recruit hint)
 * opts.onAdvance    called once, when the player taps the target (or the
 *                   continue button). Use it to chain the next step.
 */
export function showTutorialSpotlight(player, stepId, targetEl, opts = {}) {
  hideTutorial();
  // Both of these used to fail silently, which is indistinguishable from the
  // tutorial simply not running. Say so instead.
  if (!targetEl) {
    console.warn(`[tutorial] step "${stepId}" has no target element — skipping`);
    return;
  }
  const step = TUTORIAL_STEPS[stepId];
  if (!step) {
    console.warn(`[tutorial] unknown step "${stepId}" — is tutorial.js up to date?`);
    return;
  }
  const L = lang(player);
  const copy = step[L];
  const padding = opts.padding ?? 8;

  const container = document.createElement('div');
  container.className = 'tutorial-overlay';

  const top    = document.createElement('div');
  const bottom = document.createElement('div');
  const left   = document.createElement('div');
  const right  = document.createElement('div');
  [top, bottom, left, right].forEach(el => el.className = 'tutorial-blocker');

  const ring = document.createElement('div');
  ring.className = 'tutorial-ring';
  // Informational steps (showContinue) point at their target without letting it
  // be tapped; action steps must let the tap through to the real control.
  const ringHits = opts.showContinue ? 'auto' : 'none';

  const bubble = document.createElement('div');
  bubble.className = `tutorial-bubble${opts.showContinue ? ' tutorial-bubble--dismissible' : ''}`;
  bubble.innerHTML = `
    <div class="tutorial-bubble-title">${copy.title}</div>
    <div class="tutorial-bubble-text">${copy.text}</div>
    ${opts.extraText ? `<div class="tutorial-bubble-hint">${opts.extraText}</div>` : ''}
    ${opts.showContinue ? `<button class="tutorial-bubble-btn">${CONTINUE_LABEL[L]}</button>` : ''}
  `;

  container.appendChild(top);
  container.appendChild(bottom);
  container.appendChild(left);
  container.appendChild(right);
  container.appendChild(ring);
  container.appendChild(bubble);
  document.body.appendChild(container);

  function layout() {
    const rect = targetEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hole = {
      top:    rect.top - padding,
      left:   rect.left - padding,
      right:  rect.right + padding,
      bottom: rect.bottom + padding,
    };

    top.style.cssText    = `top:0; left:0; width:${vw}px; height:${Math.max(0, hole.top)}px;`;
    bottom.style.cssText = `top:${hole.bottom}px; left:0; width:${vw}px; height:${Math.max(0, vh - hole.bottom)}px;`;
    left.style.cssText   = `top:${hole.top}px; left:0; width:${Math.max(0, hole.left)}px; height:${hole.bottom - hole.top}px;`;
    right.style.cssText  = `top:${hole.top}px; left:${hole.right}px; width:${Math.max(0, vw - hole.right)}px; height:${hole.bottom - hole.top}px;`;
    // layout() rewrites cssText wholesale, so the ring's hit-testing has to be
    // set here rather than as a one-off inline style.
    ring.style.cssText   = `top:${hole.top}px; left:${hole.left}px; width:${hole.right - hole.left}px; height:${hole.bottom - hole.top}px; pointer-events:${ringHits};`;

    // Which side the bubble goes on is decided by whether it actually FITS
    // there, measured against its own height — not by a fixed 140px guess. A
    // target low on the screen (the item slot on a sheet) left ~140px below it,
    // enough to pass the old test but not enough for the bubble, so it was
    // placed below and its "Got it" button ran off the bottom edge unreachable.
    const GAP = 16;
    const EDGE = 12;
    const bubbleRect = bubble.getBoundingClientRect();
    const spaceBelow = vh - hole.bottom - GAP - EDGE;
    const spaceAbove = hole.top - GAP - EDGE;

    let placeBelow;
    if (bubbleRect.height <= spaceBelow)      placeBelow = true;
    else if (bubbleRect.height <= spaceAbove) placeBelow = false;
    else placeBelow = spaceBelow >= spaceAbove;   // fits neither: take the roomier side

    bubble.classList.remove('tutorial-bubble--below', 'tutorial-bubble--above');
    bubble.classList.add(placeBelow ? 'tutorial-bubble--below' : 'tutorial-bubble--above');

    let bubbleLeft = hole.left + (hole.right - hole.left) / 2 - bubbleRect.width / 2;
    bubbleLeft = Math.max(EDGE, Math.min(bubbleLeft, vw - bubbleRect.width - EDGE));

    // Clamped against BOTH edges. The dismiss button sits at the bubble's
    // bottom, so overflowing the bottom of the viewport strands the player with
    // no way onward — the clamp pulls the bubble back over its target rather
    // than letting that happen.
    let bubbleTop = placeBelow ? hole.bottom + GAP : hole.top - bubbleRect.height - GAP;
    bubbleTop = Math.min(bubbleTop, vh - bubbleRect.height - EDGE);
    bubbleTop = Math.max(EDGE, bubbleTop);

    bubble.style.left = `${bubbleLeft}px`;
    bubble.style.top  = `${bubbleTop}px`;
  }

  layout();
  requestAnimationFrame(layout);
  // Insurance: if the target is still settling (a sheet sliding up, a late
  // reflow), the first measurements put the hole in the wrong place and the
  // blockers cover everything. Re-measure once more so that self-corrects.
  const settleTimer = setTimeout(layout, 300);

  activeResizeHandler = layout;
  window.addEventListener('resize', activeResizeHandler);

  // Either source advances the step, and only the first one counts: hideTutorial()
  // tears down the listeners, so onAdvance can safely show the next step.
  let advanced = false;
  const advance = () => {
    if (advanced) return;
    advanced = true;
    hideTutorial();
    opts.onAdvance?.();
  };

  const continueBtn = bubble.querySelector('.tutorial-bubble-btn');
  continueBtn?.addEventListener('click', advance);

  // An informational step only highlights its target to point at it — the ring
  // swallows taps so the player can't trigger the underlying control (and open a
  // sheet over the next spotlight). Its button is the only way onward.
  let onTargetTap = null;
  if (!opts.showContinue) {
    onTargetTap = () => advance();
    targetEl.addEventListener('click', onTargetTap, { once: true });
  }

  activeCleanup = () => {
    clearTimeout(settleTimer);
    container.remove();
    if (onTargetTap) targetEl.removeEventListener('click', onTargetTap);
  };
}