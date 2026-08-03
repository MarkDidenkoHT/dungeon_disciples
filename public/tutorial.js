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
  roster_intro: {
    en: {
      title: 'Your Troops',
      text: 'This is your roster. Inspect any unit here, level them up once they have earned enough experience, and equip them with items.',
    },
    ru: {
      title: 'Ваш отряд',
      text: 'Это ваш отряд. Здесь можно осмотреть любого бойца, повысить его уровень, когда он накопит достаточно опыта, и снарядить предметами.',
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
      text: 'Here is everything this unit can wear. Padded Armor grants +5 HP — tap Equip to put it on.',
    },
    ru: {
      title: 'Снарядите героя',
      text: 'Здесь всё, что может носить этот боец. Стёганый доспех даёт +5 к здоровью — нажмите Equip, чтобы надеть его.',
    },
  },
  roster_equipped: {
    en: {
      title: 'Armor Equipped',
      text: 'The armor now fills your hero\'s slot and its +5 HP is already counted in their health. Tap the slot any time to swap gear. Your hero is ready — on to your first battle.',
    },
    ru: {
      title: 'Доспех надет',
      text: 'Доспех занял слот вашего героя, а его +5 к здоровью уже учтены. Коснитесь слота в любой момент, чтобы сменить снаряжение. Герой готов — вперёд, в первый бой.',
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
  spell_buff: {
    en: {
      title: 'Prepare a Blessing',
      text: 'Before the fight, you can empower an ally. Open your spellbook and cast your buff on a unit to strengthen it for this battle.',
    },
    ru: {
      title: 'Подготовьте благословение',
      text: 'Перед боем можно усилить союзника. Откройте книгу заклинаний и наложите усиление на бойца, чтобы укрепить его в этом бою.',
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
      text: 'Tap Attack, then tap an enemy to strike. You can also use an Ability or Defend instead.',
    },
    ru: {
      title: 'Ваш ход',
      text: 'Нажмите «Атака», затем коснитесь врага, чтобы атаковать. Также можно использовать способность или защиту.',
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
  bubble.className = 'tutorial-bubble';
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

    const spaceBelow = vh - hole.bottom;
    const placeBelow = spaceBelow > 140;
    bubble.classList.remove('tutorial-bubble--below', 'tutorial-bubble--above');
    bubble.classList.add(placeBelow ? 'tutorial-bubble--below' : 'tutorial-bubble--above');

    const bubbleRect = bubble.getBoundingClientRect();
    let bubbleLeft = hole.left + (hole.right - hole.left) / 2 - bubbleRect.width / 2;
    bubbleLeft = Math.max(12, Math.min(bubbleLeft, vw - bubbleRect.width - 12));
    const bubbleTop = placeBelow ? hole.bottom + 16 : hole.top - bubbleRect.height - 16;
    bubble.style.left = `${bubbleLeft}px`;
    bubble.style.top  = `${Math.max(12, bubbleTop)}px`;
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