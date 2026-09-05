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
  hero_intro: {
    en: {
      title: 'Welcome, Ruler',
      text: 'The throne at the centre is yours, and the figure on it is your hero — the one unit that fights in every battle and can never be lost. Tap the throne to look them over.',
    },
    ru: {
      title: 'Добро пожаловать, Правитель',
      text: 'Трон в центре — ваш, а на нём ваш герой: единственный боец, который участвует в каждом бою и которого нельзя потерять. Коснитесь трона, чтобы рассмотреть его.',
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
      text: 'Every unit carries one item, and it sits in this slot. The armor you just forged is waiting — tap the empty slot to open your items.',
    },
    ru: {
      title: 'Слот снаряжения',
      text: 'Каждый боец носит один предмет — он занимает этот слот. Выкованный вами доспех ждёт: коснитесь пустого слота, чтобы открыть предметы.',
    },
  },
  roster_equip: {
    en: {
      title: 'Arm Your Hero',
      text: 'Everything this unit can wear is on the strip below — tap an icon to look at it. Padded Armor grants +2 HP and +2 Armor tap Equip to put it on.',
    },
    ru: {
      title: 'Снарядите героя',
      text: 'Всё, что может носить этот боец, — на полосе внизу: коснитесь значка, чтобы рассмотреть предмет. Стёганый доспех даёт +2 к здоровью и +2 к броне — нажмите «Надеть».',
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
      text: 'Units and items both carry passives, and when they share one the ranks add together — two sources of Regenerate 1 become Regenerate 2. Rank 3 is the ceiling, so pair gear with a unit that already has the passive you want to push.',
    },
    ru: {
      title: 'Пассивки складываются',
      text: 'Пассивки есть и у бойцов, и у предметов: если умение совпадает, ранги складываются — два источника «Регенерации 1» дают «Регенерацию 2». Потолок — 3 ранг, поэтому подбирайте снаряжение к бойцу, у которого нужная пассивка уже есть.',
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
  unit_fallen: {
    en: {
      title: 'A Follower Has Fallen',
      text: 'One of your own did not survive your absence. A fallen unit stays fallen — it cannot march, and it cannot be healed. Tap them to see what can be done.',
    },
    ru: {
      title: 'Павший спутник',
      text: 'Один из ваших не пережил вашего отсутствия. Павший боец так и останется лежать: он не пойдёт в поход и его нельзя исцелить. Коснитесь его, чтобы увидеть, что можно сделать.',
    },
  },
  spell_revive: {
    en: {
      title: 'A Fallen Ally',
      text: 'Death is not the end while you can pay for it. Your Revival spell raises them for crystals — tap Resurrect. They come back alive, but barely.',
    },
    ru: {
      title: 'Павший союзник',
      text: 'Смерть не конец, пока есть чем платить. Заклинание воскрешения поднимет его за кристаллы — нажмите «Воскресить». Он вернётся живым, но еле-еле.',
    },
  },
  // The regen line is the important half. A player who never learns that wounds
  // close on their own reads a half-empty HP bar as permanent damage, and either
  // hoards crystals to undo it or stops embarking. Taught here because this is
  // the one moment they are about to pay for something time gives away free.
  // The rate is authored in Supabase, not in this repo — if it changes there,
  // this string has to change with it.
  spell_heal: {
    en: {
      title: 'Mend the Wounded',
      text: 'They return with barely any health. A living unit recovers on its own — 10% of its max HP every 5 minutes — so time will mend them for free. Your Mending spell is for when you cannot wait: tap Heal to patch them up now.',
    },
    ru: {
      title: 'Исцелите раненого',
      text: 'Он вернулся почти без здоровья. Живой боец восстанавливается сам — 10% от максимума здоровья каждые 5 минут, — так что время вылечит его бесплатно. Заклинание исцеления нужно, когда ждать некогда: нажмите «Лечить», чтобы подлечить его сейчас.',
    },
  },
  // Replaces the old `spell_buff` step, which told the player to cast a buff on
  // a unit before the fight. Spells are no longer charged or cast out of battle
  // — combat spells are researched here once and then cast during the fight —
  // so that step taught a screen that no longer does what it described. New key
  // rather than reused, because everyone needs to see the corrected lesson.
  go_embark: {
    en: {
      title: 'March Out',
      text: 'Your army is fed, armed and on its feet. Tap Embark to choose where they fight — everything else in the castle is paid for out there.',
    },
    ru: {
      title: 'В поход',
      text: 'Ваша армия снаряжена и готова. Нажмите «Поход», чтобы выбрать, где они будут сражаться, — всё остальное в замке оплачивается там.',
    },
  },
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
      text: 'This is your power. You gain one every time your hero acts, up to five, and every cast spends it. More power behind a spell hits harder — so it is a small spell now or a bigger one later. Nothing carries over to the next battle.',
    },
    ru: {
      title: 'Сила',
      text: 'Это ваша сила. Она прибавляется каждый раз, когда герой действует, максимум до пяти, и каждое заклинание её тратит. Чем больше вложено, тем сильнее эффект — слабое заклинание сейчас или мощное позже. В следующий бой сила не переносится.',
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
      text: 'Tap Attack, then tap an enemy to strike, or Defend to cut the damage coming your way. The middle button belongs to whoever is acting: an ordinary soldier uses its Ability there, while your hero casts one of the spells you have researched.',
    },
    ru: {
      title: 'Ваш ход',
      text: 'Нажмите «Атака», затем коснитесь врага, чтобы атаковать, или встаньте в защиту, чтобы снизить получаемый урон. Средняя кнопка зависит от того, чей ход: обычный боец применяет там свою способность, а герой читает одно из изученных заклинаний.',
    },
  },
  // ── After the first battle ────────────────────────────────────────────────
  // The chain is: come back to the castle -> find the second page -> build the
  // Messenger's Post -> errands. Errands cannot be explained before the
  // building that runs them exists, which is why these two steps sit in front
  // of errands_intro rather than beside it.
  daily_intro: {
    en: {
      title: 'Your Daily Tasks',
      text: 'Three small jobs a day, one reward of your choosing — and that battle already counted. One of them wants a unit sent on an errand, which needs a building you have not raised yet. Let us go and build it.',
    },
    ru: {
      title: 'Ежедневные задания',
      text: 'Три небольших дела в день и награда на выбор — бой уже засчитан. Одно из них требует отправить бойца на поручение, а для этого нужно здание, которого у вас пока нет. Пойдём и построим его.',
    },
  },
  upgrades_page: {
    en: {
      title: 'A Second Page',
      text: 'Your castle has more than one page. Tap the arrow to see the halls — the buildings that improve your whole kingdom rather than housing a single soldier.',
    },
    ru: {
      title: 'Вторая страница',
      text: 'У вашего замка больше одной страницы. Нажмите стрелку, чтобы увидеть залы — здания, которые улучшают всё королевство, а не дают одного бойца.',
    },
  },
  build_messenger_post: {
    en: {
      title: "The Messenger's Post",
      text: "Start with the Messenger's Post — this is the building your daily task is waiting on. It opens errands: work for a single soldier that pays while you play, and it costs almost nothing to raise.",
    },
    ru: {
      title: 'Почтовый двор',
      text: 'Начните с Почтового двора — именно его ждёт ваше ежедневное задание. Он открывает поручения: работу для одного бойца, которая приносит доход, пока вы играете, и стоит сущие гроши.',
    },
  },
  // The second build on the same page: it proves the layer holds more than the
  // one building the tutorial asked for, and it turns on between-battle healing,
  // which a player who skips it will miss without ever knowing it existed.
  // Level 1 is free, so this step cannot wall a player who spent their gold.
  build_blacksmith: {
    en: {
      title: 'The Blacksmith',
      text: 'One more hall, and the most useful one yet. Nothing in this game drops finished equipment — every item your army will ever carry is made at the forge, and the forge does not open until this stands. Raise it.',
    },
    ru: {
      title: 'Кузница',
      text: 'Ещё один зал, и самый полезный. В этой игре не выпадает готовое снаряжение: каждый предмет, который понесёт ваша армия, куётся здесь, а кузня не откроется, пока её не построить. Постройте её.',
    },
  },
  go_craft: {
    en: {
      title: 'To the Forge',
      text: 'The forge is open. Your embarks bring back materials, never finished gear — turning one into the other happens in the Items tab. Tap it.',
    },
    ru: {
      title: 'В кузню',
      text: 'Кузня открыта. Походы приносят материалы, а не готовое снаряжение: превращать одно в другое нужно во вкладке «Предметы». Коснитесь её.',
    },
  },
  craft_item: {
    en: {
      title: 'Forge Your First Item',
      text: 'This is everything you can make. Padded Armor is the cheapest of it — 50 gold, no materials needed — and it grants +2 HP and +2 Armor. Tap Craft to forge it.',
    },
    ru: {
      title: 'Выкуйте первый предмет',
      text: 'Здесь всё, что вы можете создать. Стёганый доспех — самый дешёвый: 50 золота и никаких материалов, а даёт +2 к здоровью и +2 к броне. Нажмите «Создать», чтобы выковать его.',
    },
  },
  build_infirmary: {
    en: {
      title: 'The Infirmary',
      text: 'One more here, and this one is free. The Infirmary heals your wounded between battles — without it, the damage a soldier takes stays with them. Raise it now, then come back for the rest of these halls as your treasury grows.',
    },
    ru: {
      title: 'Лазарет',
      text: 'Ещё одно здание, и оно бесплатное. Лазарет лечит раненых между боями — без него полученные раны остаются с бойцом. Постройте его сейчас, а к остальным залам вернётесь, когда пополнится казна.',
    },
  },

  // Shown once, after the Messenger's Post is raised — the errand button stays
  // dead until then (see errandsUnlocked in errands.js), so this step is also
  // the moment it becomes usable.
  //
  // The warning used to be a second step (`errands_away`) with its own "Got it".
  // Two taps on the same button taught nothing the one bubble could not, so it
  // is the last sentence here instead. Both flags are still marked when this is
  // dismissed, so a player who already saw the old pair never sees either again.
  // It is the important half: an errand takes a unit off the board, and a player
  // who sends their only frontliner out for six hours and then cannot embark has
  // been ambushed by a feature, not taught one.
  errands_intro: {
    en: {
      title: 'Errands',
      text: 'Work that needs one soldier, not an army. Send a unit out and it returns with XP, gold or crystals — no fighting, nobody lost. But it is away for the whole trip, 2 to 6 hours, and cannot embark until it is back, so never send the unit you need for your next battle.',
    },
    ru: {
      title: 'Поручения',
      text: 'Работа, для которой нужен один боец, а не армия. Отправьте его — он вернётся с опытом, золотом или кристаллами, без боя и без потерь. Но всё это время, от 2 до 6 часов, его не будет в отряде и он не сможет пойти в поход — не отправляйте того, кто нужен вам в следующем бою.',
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

// Flags are set LOCALLY and immediately; the write is queued. Callers never
// await it — nothing in the UI should wait on a bookkeeping PATCH.
//
// Queued rather than sent per step because onboarding marks several in quick
// succession, and each was its own round trip. They now coalesce into one.
//
// The response is MERGED, never assigned: it reflects the request that started,
// so assigning it wiped any flag marked while it was in flight — the step came
// back, was answered again, and wrote again. That is the repeated
// /player/tutorials traffic.
let _pendingFlags = null;
let _flushTimer   = null;
let _flushPlayer  = null;

function flushTutorialFlags(player) {
  const batch = _pendingFlags;
  _pendingFlags = null;
  _flushTimer   = null;
  if (!batch) return;
  api('/player/tutorials', {
    player_id: player.id,
    chat_id:   player.chat_id,
    tutorials: batch,
  })
    .then(updated => {
      player.tutorials = { ...(updated?.tutorials || {}), ...(player.tutorials || {}) };
    })
    .catch(() => {});
}

// A queued write must not be lost to a backgrounded tab or a closed Mini App.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (_flushPlayer) flushTutorialFlags(_flushPlayer); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _flushPlayer) flushTutorialFlags(_flushPlayer);
  });
}

export function markTutorialDone(player, stepId) {
  if (!player || player.tutorials?.[stepId]) return;
  player.tutorials = { ...(player.tutorials || {}), [stepId]: true };
  _pendingFlags = { ...(_pendingFlags || {}), [stepId]: true };
  _flushPlayer  = player;
  // NOT restarted per mark. Restarting turned a run of quick marks into a
  // sliding window that only closed once the player paused, and each mark that
  // arrived after it closed became its own request. A fixed window from the
  // first mark collects the whole burst into one write.
  if (!_flushTimer) _flushTimer = setTimeout(() => flushTutorialFlags(player), 2500);
}

// Throw away a queued flag write. A reset clears the column server-side, and a
// batch still sitting in the debounce window would land a moment later and put
// the flags straight back — leaving the player mid-onboarding with steps marked
// done that they have never seen.
export function discardTutorialFlags() {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer   = null;
  _pendingFlags = null;
  _flushPlayer  = null;
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

  // The target is re-resolved rather than held: a sheet re-render replaces the
  // button this step points at, and the captured node is then detached forever.
  let liveTarget  = targetEl;
  let onTargetTap = null;

  function reacquire() {
    if (liveTarget.isConnected) return;
    const next = opts.resolveTarget?.();
    if (!next || next === liveTarget) return;
    if (onTargetTap) {
      liveTarget.removeEventListener('click', onTargetTap, true);
      next.addEventListener('click', onTargetTap, { once: true, capture: true });
    }
    liveTarget = next;
  }

  function layout() {
    reacquire();
    const targetEl = liveTarget;
    const rect = targetEl.getBoundingClientRect();
    // A target with no box yet (sheet still animating, element detached, or
    // display:none) reports an all-zero rect. Laying out against that puts the
    // ring at the origin and the whole overlay off-screen, so stay hidden and
    // wait for it to gain layout instead.
    if (!targetEl.isConnected || (rect.width <= 0 && rect.height <= 0)) {
      container.style.visibility = 'hidden';
      return false;
    }
    container.style.visibility = '';
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

    // The arrow follows the TARGET, not the bubble's middle. Once either clamp
    // above has pushed the bubble away from its target, a centred arrow points
    // at empty screen — and because it sits outside the bubble box it can hang
    // off the viewport edge as a stray sliver.
    const targetCx = hole.left + (hole.right - hole.left) / 2;
    const arrowX   = Math.max(16, Math.min(bubbleRect.width - 16, targetCx - bubbleLeft));
    bubble.style.setProperty('--arrow-x', `${arrowX}px`);

    const wantedTop = placeBelow ? hole.bottom + GAP : hole.top - bubbleRect.height - GAP;
    const detached  = Math.abs(bubbleTop - wantedTop) > 1
                   || targetCx < bubbleLeft || targetCx > bubbleLeft + bubbleRect.width;
    bubble.classList.toggle('tutorial-bubble--noarrow', detached);
    return true;
  }

  // Keep re-measuring until the target actually has a box. A sheet sliding up
  // can take several frames, and giving up after one leaves the overlay pinned
  // to the origin.
  // Runs for as long as the spotlight is up, not just until it first measures:
  // the target can be swapped out at any time by a re-render.
  let rafId = null;
  let lastKey = '';
  const watch = () => {
    const r = liveTarget.isConnected ? liveTarget.getBoundingClientRect() : null;
    const key = r ? `${r.left},${r.top},${r.width},${r.height}` : 'gone';
    if (key !== lastKey) { lastKey = key; layout(); }
    rafId = requestAnimationFrame(watch);
  };
  layout();
  rafId = requestAnimationFrame(watch);
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
  // CAPTURE, not bubble. The control being pointed at bound its own click
  // handler when it rendered, which is BEFORE this one — so on the bubble phase
  // the app acted first: the sheet opened, and anything in that path that
  // re-entered the onboarding driver found this step still unmarked and re-drew
  // the ring the player had just answered, over the sheet that had just opened.
  // Capture always runs before any bubble handler regardless of who bound
  // first, so the step is torn down and marked before the app can react.
  if (!opts.showContinue) {
    onTargetTap = () => advance();
    liveTarget.addEventListener('click', onTargetTap, { once: true, capture: true });
  }

  activeCleanup = () => {
    clearTimeout(settleTimer);
    if (rafId) cancelAnimationFrame(rafId);
    container.remove();
    if (onTargetTap) liveTarget.removeEventListener('click', onTargetTap, true);
  };
}