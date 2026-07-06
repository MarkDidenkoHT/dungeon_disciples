import { api } from './api.js';

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

export function showTutorialSpotlight(player, stepId, targetEl, opts = {}) {
  hideTutorial();
  if (!targetEl) return;
  const step = TUTORIAL_STEPS[stepId];
  if (!step) return;
  const copy = step[lang(player)];
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

  const bubble = document.createElement('div');
  bubble.className = 'tutorial-bubble';
  bubble.innerHTML = `
    <div class="tutorial-bubble-title">${copy.title}</div>
    <div class="tutorial-bubble-text">${copy.text}</div>
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
    ring.style.cssText   = `top:${hole.top}px; left:${hole.left}px; width:${hole.right - hole.left}px; height:${hole.bottom - hole.top}px;`;

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

  activeResizeHandler = layout;
  window.addEventListener('resize', activeResizeHandler);

  const onTargetTap = () => hideTutorial();
  targetEl.addEventListener('click', onTargetTap, { once: true });

  activeCleanup = () => {
    container.remove();
    targetEl.removeEventListener('click', onTargetTap);
  };
}