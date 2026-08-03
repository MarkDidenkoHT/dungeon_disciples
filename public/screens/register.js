import { api }      from '../api.js';
import { navigate } from '../api.js';
import { UNITS }    from '../../data/units.js';
import { preloadAssets } from '../utils.js';
import { playFactionTheme } from '../music.js';

function lang(player) {
  return player?.settings?.language === 'ru' ? 'ru' : 'en';
}

const UNIT_ART = new Set([
  'e1', 'e21', 'e3', 'e4', 'e6',
  'd11', 'd41', 'd6', 'd31', 'd7',
  'gs12', 'gs311', 'gs6',
]);

const HERO_FLAVOR = {
  h_e_1: {
    en: 'A sworn shield of the Empire, first to the front and last to fall back. Where the Paladin’s mace falls the light answers, mending a wounded ally even as it breaks the wicked.',
    ru: 'Верный щит Империи, первый в атаке и последний в отступлении. Там, где опускается булава Паладина, отвечает свет — исцеляя раненого союзника и сокрушая нечестивых.',
  },
  h_e_2: {
    en: 'An Inquisitor of the Holy Order, whose condemnation falls as searing light across the whole enemy line. Their unwavering presence steels the faithful, hardening every ally against the trials to come.',
    ru: 'Инквизитор Святого Ордена, чей приговор обрушивается жгучим светом на весь вражеский строй. Непоколебимое присутствие Инквизитора укрепляет верных, закаляя каждого союзника перед грядущими испытаниями.',
  },
  h_e_3: {
    en: 'A master Artificer of the Empire, tending the armored ranks from just behind the line. Every ally marches out better-plated for their craft, and in these hands broken things do not stay broken for long.',
    ru: 'Мастер-механик Империи, что чинит латников прямо из-за линии фронта. Благодаря такому ремеслу каждый союзник выходит в бой в лучшей броне, а в этих руках сломанное недолго остаётся сломанным.',
  },
  h_d_1: {
    en: 'A castellan bound to infernal service, commanding the Choir\u2019s knights with cold authority — an unmoving wall that dares the enemy to strike anywhere but here.',
    ru: 'Кастелян, связанный адской службой, холодно командующий рыцарями Хора, — недвижимая стена, что заставляет врага бить куда угодно, только не сюда.',
  },
  h_d_2: {
    en: 'A regent of the demon court, whose ambition burns hotter than the throne beneath them. Their command sharpens every ally’s strike, and the abyss yields its dead back at their word.',
    ru: 'Регент демонического двора, чьи амбиции горячее самого трона. Приказ Регента оттачивает удары каждого союзника, а бездна по его слову возвращает своих мертвецов.',
  },
  h_d_3: {
    en: 'An ascendant caster touched by the abyss, wielding fire it has not yet learned to fear. What it sets alight it keeps burning, and every ember left behind only feeds the next.',
    ru: 'Возносящийся заклинатель, тронутый бездной, владеющий огнём, которого ещё не научился бояться. Что он поджёг — то горит без конца, и каждый оставленный уголёк лишь питает следующий.',
  },
  h_g_1: {
    en: 'A prophet who mourns the living as though they were already lost. Draw close and the Mourning Prophet strikes first, drinking deep before a blade can ever fall.',
    ru: 'Пророк, оплакивающий живых так, будто они уже потеряны. Подойди ближе — и Скорбящий Пророк ударит первым, испив досыта прежде, чем опустится клинок.',
  },
  h_g_2: {
    en: 'A warden sworn to the Grail, standing watch over the undying faithful. The more of the dead that march at their side, the harder the Warden is to put down.',
    ru: 'Страж, присягнувший Граалю, охраняющий нестареющих верных. Чем больше мертвецов идёт рядом, тем труднее свалить Стража.',
  },
  h_g_3: {
    en: 'A spirit who speaks with a mother\u2019s voice, though she died before the Grail was ever found. Her sorrow mends the wounded and drags the enemy down into a slow, mournful crawl.',
    ru: 'Дух, говорящий голосом матери, хотя она умерла ещё до обретения Грааля. Её скорбь исцеляет раненых и тянет врагов в тоскливое оцепенение.',
  },
};

const FIRST_RECRUIT_HINT = {
  empire: {
    name: 'Conscript',
    en: 'New to the Empire? Your first recruit should be a Conscript — sturdy enough to hold the front line while you learn the ropes. Casters and scouts hit hard, but they won\u2019t survive long without a shield ahead of them.',
    ru: 'Впервые за Империю? Первым бойцом лучше взять Новобранца — он достаточно крепок, чтобы держать фронт, пока вы осваиваетесь. Заклинатели и разведчики бьют больно, но долго не проживут без щита впереди.',
  },
  choir_of_the_cursed: {
    name: 'Clay Gargoyle',
    en: 'New to the Choir? Your first recruit should be a Clay Gargoyle — its armor forgives early mistakes while you find your footing. The Choir\u2019s squishier servants are powerful, but easy to lose before they matter.',
    ru: 'Впервые за Хор? Первым бойцом лучше взять Глиняную Горгулью — её броня прощает ранние ошибки, пока вы учитесь. Более хрупкие слуги Хора сильны, но их легко потерять раньше времени.',
  },
  grail_of_sorrow: {
    name: 'Risen',
    en: 'New to the Grail? Your first recruit should be a Risen — simple, resilient, and undemanding to field. Save the fragile spirits and casters for once you\u2019ve got a frontline to protect them.',
    ru: 'Впервые за Грааль? Первым бойцом лучше взять Восставшего — простой, выносливый и неприхотливый боец. Хрупких духов и заклинателей приберегите до тех пор, пока не появится фронт для их защиты.',
  },
};

function getHighlights(factionKey) {
  return Object.values(UNITS[factionKey] ?? {})
    .filter(u => UNIT_ART.has(u.id))
    .map(u => ({ id: u.id, name: u.name }))
    .slice(0, 4);
}

const FACTIONS = [
  {
    id: 'empire',
    label: { en: 'The Empire', ru: 'Империя' },
    tagline: {
      en: 'Defenders of the realm, forged in honor.',
      ru: 'Защитники королевства, закалённые честью.',
    },
    description: {
      en: 'Disciplined knights, holy casters, and battlefield engineers stand together behind shield and oath. The Empire rewards a steady front line and righteous retribution.',
      ru: 'Дисциплинированные рыцари, святые заклинатели и полевые инженеры стоят плечом к плечу за щитом и клятвой. Империя вознаграждает крепкий фронт и праведное возмездие.',
    },
    bg: '/assets/screens/empire.jpg',
    highlights: getHighlights('empire'),
  },
  {
    id: 'choir_of_the_cursed',
    label: { en: 'Choir of the Cursed', ru: 'Хор Проклятых' },
    tagline: {
      en: 'Creatures of darkness, bound by ambition.',
      ru: 'Порождения тьмы, объединённые амбициями.',
    },
    description: {
      en: 'Demons, puppets, and courtly schemers serve a hierarchy built on hunger and dread. The Choir thrives on frenzy, sacrifice, and turning enemy strength against itself.',
      ru: 'Демоны, марионетки и придворные интриганы служат иерархии, построенной на голоде и страхе. Хор процветает на исступлении, жертве и обращении силы врага против него самого.',
    },
    bg: '/assets/screens/choir.jpg',
    highlights: getHighlights('choir_of_the_cursed'),
  },
  {
    id: 'grail_of_sorrow',
    label: { en: 'Grail of Sorrow', ru: 'Грааль Скорби' },
    tagline: {
      en: 'The undying faithful, bound to the sacred grail.',
      ru: 'Нестареющие верные, связанные со священным Граалем.',
    },
    description: {
      en: 'The risen dead, siege constructs, and grieving spirits march for a relic that promises resurrection without end. The Grail wears down its foes through attrition and undeath.',
      ru: 'Восставшие мертвецы, осадные машины и скорбящие духи идут за реликвией, обещающей бесконечное воскрешение. Грааль изматывает врагов измором и нежитью.',
    },
    bg: '/assets/screens/grail.jpg',
    highlights: getHighlights('grail_of_sorrow'),
  },
];

const UI_TEXT = {
  openInTelegram: { en: 'Open this app inside Telegram.', ru: 'Откройте это приложение внутри Telegram.' },
  introTitle:     { en: 'A Realm Divided', ru: 'Расколотое Королевство' },
  introP1: {
    en: 'The old order has fallen. Where a single crown once held dominion, three powers now claw for what remains.',
    ru: 'Старый порядок пал. Там, где раньше властвовала единая корона, теперь три силы борются за то, что осталось.',
  },
  introP2: {
    en: 'At the heart of the conflict lies a fractured relic — a vessel said to grant dominion over life, death, and the space between. Empire, Choir, and Grail each stake a rightful claim to its power, and none will yield.',
    ru: 'В сердце конфликта лежит расколотая реликвия — сосуд, дающий власть над жизнью, смертью и пространством между ними. Империя, Хор и Грааль — каждый заявляет законное право на её силу, и никто не намерен уступать.',
  },
  introP3: {
    en: 'You are a Disciple, bound to serve one banner in the dungeons and battlefields ahead. Choose wisely — your faction shapes not only your allies, but the fate of the realm.',
    ru: 'Вы — Адепт, связанный служением одному знамени в грядущих подземельях и битвах. Выбирайте мудро — ваша фракция определяет не только союзников, но и судьбу королевства.',
  },
  introContinue:  { en: 'Choose Your Path', ru: 'Выбрать Путь' },
  chooseBtn:      { en: 'Choose', ru: 'Выбрать' },
  backBtn:        { en: '← Back', ru: '← Назад' },
  chooseHero:     { en: 'Choose your hero', ru: 'Выберите героя' },
  loadingHeroes:  { en: 'Loading heroes…', ru: 'Загрузка героев…' },
  passive:        { en: 'Passive', ru: 'Пассивка' },
  firstRecruitTip:{ en: 'First Recruit Tip', ru: 'Совет по первому найму' },
};

export function renderRegister(root, { player } = {}) {
  const L = lang(player);

  if (!player) {
    root.innerHTML = `
      <div class="screen screen-faction">
        <h1>Shattered Crown</h1>
        <p class="subtitle">${UI_TEXT.openInTelegram[L]}</p>
      </div>
    `;
    return;
  }

  let selectedFaction = null;
  let heroes          = [];
  let activeIndex      = 0;

  showIntroStep();

  function showIntroStep() {
    root.innerHTML = `
      <div class="screen screen-intro" style="background-image: linear-gradient(180deg, rgba(10,10,14,0.35) 0%, rgba(10,10,14,0.75) 60%, rgba(10,10,14,0.96) 100%), url('/assets/screens/embark.jpg')">
        <div class="intro-content">
          <div class="intro-title">${UI_TEXT.introTitle[L]}</div>
          <p class="intro-text">${UI_TEXT.introP1[L]}</p>
          <p class="intro-text">${UI_TEXT.introP2[L]}</p>
          <p class="intro-text">${UI_TEXT.introP3[L]}</p>
          <button class="intro-continue-btn" id="intro-continue-btn">${UI_TEXT.introContinue[L]}</button>
        </div>
      </div>
    `;
    root.querySelector('#intro-continue-btn').addEventListener('click', showFactionStep);
  }

  function showFactionStep() {
    root.innerHTML = `
      <div class="screen screen-faction-slider">
        <div class="faction-slider" id="faction-slider">
          ${FACTIONS.map(f => `
            <div class="faction-slide" data-id="${f.id}" style="background-image: linear-gradient(180deg, rgba(10,10,14,0.15) 0%, rgba(10,10,14,0.55) 55%, rgba(10,10,14,0.95) 100%), url('${f.bg}')">
              <div class="faction-slide-content">
                <div class="faction-slide-title">${f.label[L]}</div>
                <div class="faction-slide-tagline">${f.tagline[L]}</div>
                <div class="faction-slide-desc">${f.description[L]}</div>
                <div class="faction-slide-roster">
                  ${f.highlights.map(h => `
                    <div class="faction-roster-chip">
                      <img src="/assets/character_art/${h.id}.png" alt="${h.name}" onerror="this.style.display='none'">
                      <span>${h.name}</span>
                    </div>
                  `).join('')}
                </div>
                <button class="faction-choose-btn" data-id="${f.id}">${UI_TEXT.chooseBtn[L]} ${f.label[L]}</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="faction-slider-dots" id="faction-slider-dots">
          ${FACTIONS.map((f, i) => `<span class="faction-dot ${i === 0 ? 'faction-dot--active' : ''}" data-index="${i}"></span>`).join('')}
        </div>
      </div>
    `;

    const slider = root.querySelector('#faction-slider');
    const dots   = [...root.querySelectorAll('.faction-dot')];

    slider.addEventListener('scroll', () => {
      const idx = Math.round(slider.scrollLeft / slider.clientWidth);
      if (idx === activeIndex) return;
      activeIndex = idx;
      dots.forEach((d, i) => d.classList.toggle('faction-dot--active', i === idx));
    }, { passive: true });

    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const idx = Number(dot.dataset.index);
        slider.scrollTo({ left: idx * slider.clientWidth, behavior: 'smooth' });
      });
    });

    root.querySelectorAll('.faction-choose-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        selectedFaction = FACTIONS.find(f => f.id === btn.dataset.id);
        playFactionTheme(selectedFaction.id);
        await loadAndShowHeroStep();
      });
    });
  }

  async function loadAndShowHeroStep() {
    root.innerHTML = `
      <div class="screen screen-faction">
        <p class="subtitle">${UI_TEXT.loadingHeroes[L]}</p>
      </div>
    `;

    try {
      const all = await api('/heroes');
      const prefixMap = { empire: 'h_e_', choir_of_the_cursed: 'h_d_', grail_of_sorrow: 'h_g_' };
      const factionPrefix = prefixMap[selectedFaction.id] ?? 'h_e_';
      heroes = all.filter(h => h.id.startsWith(factionPrefix) && h.t === 1);
      await preloadAssets(heroes.map(h => `/assets/character_art/${h.id}.png`));
      showHeroStep();
    } catch (err) {
      root.innerHTML = `
        <div class="screen screen-faction">
          <button id="back-btn">${UI_TEXT.backBtn[L]}</button>
          <p class="error">${err.message}</p>
        </div>
      `;
      root.querySelector('#back-btn').addEventListener('click', showFactionStep);
    }
  }

  function showHeroStep() {
    const hint = FIRST_RECRUIT_HINT[selectedFaction.id];

    root.innerHTML = `
      <div class="screen screen-faction">
        <button id="back-btn">${UI_TEXT.backBtn[L]}</button>
        <h2>${selectedFaction.label[L]}</h2>
        <p class="subtitle">${UI_TEXT.chooseHero[L]}</p>
        <div class="hero-select-list">
          ${heroes.map(h => `
            <div class="hero-select-card" data-id="${h.id}">
              <img class="hero-select-art" src="/assets/character_art/${h.id}.png" alt="${h.name ?? h.id}" onerror="this.style.display='none'">
              <div class="hero-select-body">
                <h3>${h.name ?? h.id}</h3>
                <p class="hero-select-flavor">${HERO_FLAVOR[h.id]?.[L] ?? ''}</p>
                <p class="hero-select-stats">HP ${h.hp} · Armor ${h.armor} · Init ${h.initiative}</p>
                ${h.passive ? `<p class="card-passive">${UI_TEXT.passive[L]}: ${(Array.isArray(h.passive) ? h.passive : [h.passive]).join(', ')}</p>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
        ${hint ? `
          <div class="first-recruit-hint">
            <div class="first-recruit-hint-title">${UI_TEXT.firstRecruitTip[L]}</div>
            <div class="first-recruit-hint-text">${hint[L]}</div>
          </div>
        ` : ''}
        <p id="reg-error" class="error hidden"></p>
      </div>
    `;

    root.querySelector('#back-btn').addEventListener('click', showFactionStep);

    root.querySelectorAll('.hero-select-card').forEach(card => {
      card.addEventListener('click', () => {
        const hero = heroes.find(h => h.id === card.dataset.id);
        confirmSelection(hero);
      });
    });
  }

  async function confirmSelection(hero) {
    const error = root.querySelector('#reg-error');

    try {
      const { player: updated } = await api('/player/faction', {
        player_id: player.id,
        chat_id:   player.chat_id,
        faction:   selectedFaction.id,
        hero_id:   hero.id,
      });

      navigate('castle', { player: updated });
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  }
}