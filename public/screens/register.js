import { api }      from '../api.js';
import { navigate } from '../api.js';
import { UNITS }    from '../../data/units.js';
import { preloadAssets, buildUnitCard, handleUnitInspect, openSheet, closeSheet } from '../utils.js';
import { playFactionTheme } from '../music.js';

function lang(player) {
  return player?.settings?.language === 'ru' ? 'ru' : 'en';
}

// Five example units per faction, chosen for the registration slides.
const UNIT_ART = new Set([
  'e421', 'e21', 'e31', 'e111', 'e61',
  'd11', 'd41', 'd61', 'd311', 'd71',
  'gs12', 'gs311', 'gs61', 'gs411', 'gs21',
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

// The faction slide shows these as real unit cards, so keep the whole
// definition rather than just id + name.
function getHighlights(factionKey) {
  return Object.values(UNITS[factionKey] ?? {})
    .filter(u => UNIT_ART.has(u.id))
    .slice(0, 5);
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
    crest: '/assets/crests/empire.jpg',
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
    crest: '/assets/crests/choir.jpg',
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
    crest: '/assets/crests/grail.jpg',
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
                <!-- Example units get the same treatment as the roster: one
                     unit card at a time, a portrait track to move between them,
                     and the same tap-to-inspect on stats/abilities. -->
                <div class="faction-example-card" data-faction="${f.id}"></div>
                <div class="prep-track-wrap branch-track-wrap">
                  <div class="portrait-track faction-example-track" data-faction="${f.id}">
                    ${f.highlights.map((h, i) => `
                      <div class="portrait-card portrait-card--branch"
                           data-i="${i}" title="${h.name}">
                        <img class="portrait-art-img" src="/assets/character_portraits/p_${h.id}.png"
                             alt="${h.name}" onerror="this.style.display='none'">
                        <div class="portrait-name">${h.name}</div>
                      </div>`).join('')}
                  </div>
                </div>
                <button class="faction-choose-btn" data-id="${f.id}">${UI_TEXT.chooseBtn[L]} ${f.label[L]}</button>
              </div>
            </div>
          `).join('')}
        </div>
        <!-- Same bottom track as the roster / formation / initiative queue, but
             carrying faction crests instead of portraits. Replaces the dots,
             which said "there are three" without saying which. -->
        <div class="prep-track-wrap register-track-wrap">
          <div class="portrait-track" id="faction-crest-track">
            ${FACTIONS.map((f, i) => `
              <div class="portrait-card portrait-card--crest ${i === 0 ? 'portrait-card--selected' : ''}"
                   data-index="${i}" title="${f.label[L]}">
                <img class="portrait-art-img" src="${f.crest}" alt="${f.label[L]}"
                     onerror="this.style.display='none'">
                <div class="portrait-name">${f.label[L]}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `;

    const slider = root.querySelector('#faction-slider');
    const crests = [...root.querySelectorAll('#faction-crest-track .portrait-card')];

    slider.addEventListener('scroll', () => {
      const idx = Math.round(slider.scrollLeft / slider.clientWidth);
      if (idx === activeIndex) return;
      activeIndex = idx;
      crests.forEach((c, i) => c.classList.toggle('portrait-card--selected', i === idx));
    }, { passive: true });

    crests.forEach(card => {
      card.addEventListener('click', () => {
        const idx = Number(card.dataset.index);
        slider.scrollTo({ left: idx * slider.clientWidth, behavior: 'smooth' });
      });
    });

    // Example-unit tracks: pick a portrait, its card replaces the one on show
    // and the track scrolls it to centre. Inspection works on the card itself.
    root.querySelectorAll('.faction-example-track').forEach(track => {
      const factionId = track.dataset.faction;
      const faction   = FACTIONS.find(f => f.id === factionId);
      const cardEl    = root.querySelector(`.faction-example-card[data-faction="${factionId}"]`);
      let openIndex   = null;   // null = no card on show

      function closeCard() {
        openIndex = null;
        if (cardEl) { cardEl.innerHTML = ''; cardEl.classList.remove('faction-example-card--open'); }
        track.querySelectorAll('.portrait-card').forEach(c => c.classList.remove('portrait-card--selected'));
      }

      track.querySelectorAll('.portrait-card').forEach(chip => {
        chip.addEventListener('click', () => {
          const i = Number(chip.dataset.i);
          // Tapping the portrait that is already open closes it again — the
          // slide is short and the card should not squat there permanently.
          if (openIndex === i) { closeCard(); return; }
          openIndex = i;
          track.querySelectorAll('.portrait-card').forEach((c, ci) =>
            c.classList.toggle('portrait-card--selected', ci === i));
          chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
          if (cardEl && faction?.highlights[i]) {
            cardEl.innerHTML = buildUnitCard(faction.highlights[i]);
            cardEl.classList.add('faction-example-card--open');
            cardEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        });
      });

      // Inspection inside the card; a tap on the card's empty margin closes it.
      cardEl?.addEventListener('click', e => {
        if (handleUnitInspect(e, openSheet)) return;
        if (e.target === cardEl) closeCard();
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
      await preloadAssets(heroes.flatMap(h => [
        `/assets/character_art/${h.id}.png`,
        `/assets/character_portraits/p_${h.id}.png`,
      ]));
      showHeroStep();
    } catch (err) {
      root.innerHTML = `
        <div class="screen screen-faction">
          <button class="text-back-btn" id="back-btn">${UI_TEXT.backBtn[L]}</button>
          <p class="error">${err.message}</p>
        </div>
      `;
      root.querySelector('#back-btn').addEventListener('click', showFactionStep);
    }
  }

  function showHeroStep() {
    let heroIndex = 0;

    // The hero is shown on the SAME card the roster uses, so what a player sees
    // when choosing is exactly what they will see afterwards. The portrait track
    // switches between them; Back sits left of it, Choose right of it.
    function heroCardHtml(h) {
      return `
        ${buildUnitCard(h)}
        <p class="hero-select-flavor">${HERO_FLAVOR[h.id]?.[L] ?? ''}</p>`;
    }

    root.innerHTML = `
      <div class="screen screen-faction screen-hero-select">
        <div class="hero-select-header">
          <h2>${selectedFaction.label[L]}</h2>
          <p class="subtitle">${UI_TEXT.chooseHero[L]}</p>
        </div>

        <div class="hero-card-wrap" id="hero-card-wrap">
          ${heroes.length ? heroCardHtml(heroes[0]) : ''}
        </div>

        <p id="reg-error" class="error hidden"></p>

        <div class="track-action-row hero-action-row track-action-row--framed">
          <button class="frame-action" id="back-btn"
                  title="${UI_TEXT.backBtn[L]}" aria-label="${UI_TEXT.backBtn[L]}">‹</button>
          <div class="prep-track-wrap branch-track-wrap">
            <div class="portrait-track" id="hero-portrait-track">
              ${heroes.map((h, i) => `
                <div class="portrait-card portrait-card--branch ${i === 0 ? 'portrait-card--selected' : ''}"
                     data-i="${i}" title="${h.name ?? h.id}">
                  <img class="portrait-art-img" src="/assets/character_portraits/p_${h.id}.png"
                       alt="${h.name ?? h.id}" onerror="this.style.display='none'">
                  <div class="portrait-name">${h.name ?? h.id}</div>
                </div>`).join('')}
            </div>
          </div>
          <button class="frame-action" id="choose-hero-btn"
                  title="${UI_TEXT.chooseBtn[L]}" aria-label="${UI_TEXT.chooseBtn[L]}">✓</button>
        </div>
      </div>
    `;

    const cardWrap = root.querySelector('#hero-card-wrap');

    function selectHero(i) {
      heroIndex = i;
      cardWrap.innerHTML = heroCardHtml(heroes[i]);
      root.querySelectorAll('#hero-portrait-track .portrait-card').forEach((c, ci) => {
        c.classList.toggle('portrait-card--selected', ci === i);
        // Same behaviour as the roster strip: the picked portrait slides to the
        // middle rather than staying cut off at an edge.
        if (ci === i) c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      });
    }

    root.querySelectorAll('#hero-portrait-track .portrait-card').forEach(card => {
      card.addEventListener('click', () => selectHero(Number(card.dataset.i)));
    });

    // Stats, resistances, abilities and passives are all inspectable here, the
    // same way they are in the roster — a player choosing a hero should be able
    // to read what the numbers and icons mean before committing.
    cardWrap.addEventListener('click', e => { handleUnitInspect(e, openSheet); });

    root.querySelector('#back-btn').addEventListener('click', showFactionStep);
    root.querySelector('#choose-hero-btn').addEventListener('click', () => {
      if (heroes[heroIndex]) confirmSelection(heroes[heroIndex]);
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