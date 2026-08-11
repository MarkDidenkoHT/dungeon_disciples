import { api }      from '../api.js';
import { navigate } from '../api.js';
import { UNITS }    from '../../data/units.js';
import { preloadAssets, buildUnitCard, handleUnitInspect, openSheet, closeSheet } from '../utils.js';
import { playFactionTheme } from '../music.js';
import { assetUrl } from '../asset_base.js';

function lang(player) {
  return player?.settings?.language === 'ru' ? 'ru' : 'en';
}

// Five example units per faction, chosen for the registration slides.
const UNIT_ART = new Set([
  'e421', 'e21', 'e31', 'e111', 'e61',
  'd11', 'd41', 'd61', 'd311', 'd71',
  'gs12', 'gs311', 'gs61', 'gs411', 'gs21',
]);

// One short paragraph per hero: what they DO, and which two pieces of their kit
// combo. Deliberately no numbers — stats are on the card right above this text,
// and repeating them there wastes the only lines a new player actually reads.
// Every ability named here is verified against data/unit_abilities.js.
const HERO_FLAVOR = {
  h_e_1: {
    en: 'Holds the line, and cleans it. Mithrail’s Light keeps him standing where the fighting is worst, and Cleanse strips bleed, burn and poison off an ally.',
    ru: 'Держит строй — и очищает его. Свет Митраила удерживает его там, где бой всего тяжелее, а Очищение снимает с союзника кровотечение, горение и яд.',
  },
  h_e_2: {
    en: 'Judgement, on everyone at once. His attack falls across the whole enemy formation. Vitality strengthens every ally; Purge tears the blessings off an enemy. Keep him behind the wall.',
    ru: 'Приговор — всем сразу. Его атака обрушивается на весь вражеский строй. Живучесть укрепляет каждого союзника, а Изгнание срывает с врага все благословения. Держите его за стеной.',
  },
  h_e_3: {
    en: 'Keeps the wall standing. Repairs allies from range, and Fortify armors the whole party. He has no active ability — his turn is upkeep, and the line lives or dies on it.',
    ru: 'Держит стену целой. Чинит союзников на расстоянии, а Укрепление даёт броню всему отряду. Активной способности у него нет — его ход это работа, и на ней держится весь строй.',
  },
  h_d_1: {
    en: 'Wants to be hit. Taunt drags the enemy in front onto him; Rage turns every wound into fury. The taunt is how you feed the passive.',
    ru: 'Хочет, чтобы били его. Провокация тянет врага напротив на него, а Ярость обращает каждую рану в силу. Провокация — это то, чем вы кормите пассивку.',
  },
  h_d_2: {
    en: 'Rules from the back. Inspiration lifts the allies beside him, and Rite of Reclamation calls a fallen demon back to the field. He commands; he does not brawl.',
    ru: 'Правит из тыла. Вдохновение усиливает союзников рядом, а Обряд возвращения поднимает павшего демона обратно в бой. Он командует, а не дерётся.',
  },
  h_d_3: {
    en: 'Sets the field alight. Mark of Ash makes a burn permanent, and Fellfire splashes every burning enemy each time he strikes. Burn one — after that, everything he does hits everyone.',
    ru: 'Поджигает поле. Печать пепла делает горение постоянным, а Злое пламя задевает каждого горящего врага при каждом его ударе. Подожгите одного — дальше всё, что он делает, бьёт по всем.',
  },
  h_g_1: {
    en: 'Invites the blow, answers first. Taunt goads the enemy in front into striking at him, and Duelist lands his blow first — a kill cancels their attack outright.',
    ru: 'Зовёт удар и отвечает первым. Провокация вынуждает врага напротив бить именно его, а Дуэлянт наносит удар раньше — и если враг падёт, его атака отменяется.',
  },
  h_g_2: {
    en: 'Stronger the more dead you bring. Horde hardens him for every Zombie at his side, and Shared Suffering spreads what he takes across the party.',
    ru: 'Тем сильнее, чем больше мертвецов вы привели. Орда закаляет его за каждого зомби рядом, а Разделённое страдание распределяет полученный урон по всему отряду.',
  },
  h_g_3: {
    en: 'Moves before anyone else. Sorrow drags the speed out of every enemy on the field, and Mother’s Blessing spends her own life each turn to keep the party standing.',
    ru: 'Ходит раньше всех. Скорбь вытягивает скорость из каждого врага на поле, а Благословение Матери каждый ход тратит её собственную жизнь, чтобы отряд устоял.',
  },
};

// The faction slide shows these as real unit cards, so keep the whole
// definition rather than just id + name.
function getHighlights(factionKey) {
  return Object.values(UNITS[factionKey] ?? {})
    .filter(u => UNIT_ART.has(u.id))
    .slice(0, 5);
}

// The three factions all want the same thing — the shards of the Shattered
// Crown, broken in the war for Ilmenar. Each description names a god, a place
// and a reason, because "what do they want and why can't they share it" is what
// makes the choice mean anything. Faction IDS are unchanged: these are display
// labels only, and the ids are written into save data.
const FACTIONS = [
  {
    id: 'empire',
    label: { en: 'Aurex', ru: 'Аурекс' },
    tagline: {
      en: 'The lion does not tire.',
      ru: 'Лев не знает усталости.',
    },
    description: {
      en: 'Aurex kept its faith when the crown broke: Mithrail, the golden lion, rewards those who hold the line. Its knights, priests and engineers fight as one wall — armored, sanctified, and certain that every shard belongs in Aurexian hands.',
      ru: 'Аурекс сохранил веру, когда корона раскололась: Митраил, золотой лев, вознаграждает тех, кто держит строй. Его рыцари, жрецы и инженеры бьются как одна стена — в броне, освящённые и уверенные, что каждый осколок принадлежит Аурексу.',
    },
    bg: assetUrl('/assets/screens/empire.jpg'),
    crest: assetUrl('/assets/crests/empire.jpg'),
    highlights: getHighlights('empire'),
  },
  {
    id: 'choir_of_the_cursed',
    label: { en: 'The Choir', ru: 'Хор' },
    tagline: {
      en: 'They asked, and something beneath answered.',
      ru: 'Они воззвали — и нечто снизу ответило.',
    },
    description: {
      en: 'When the court of Cinderhold wanted more than its borders could give, it called downward, and Aggrail replied. The bargain made lords into demons and a court into a choir. They do not seek the crown’s shards. They are collecting what was promised.',
      ru: 'Когда двору Пепельного Чертога стало мало собственных границ, он воззвал вниз — и Агграил ответил. Сделка обратила владык в демонов, а двор — в хор. Они не ищут осколки короны. Они забирают обещанное.',
    },
    bg: assetUrl('/assets/screens/choir.jpg'),
    crest: assetUrl('/assets/crests/choir.jpg'),
    highlights: getHighlights('choir_of_the_cursed'),
  },
  {
    id: 'grail_of_sorrow',
    label: { en: 'The Grail', ru: 'Грааль' },
    tagline: {
      en: 'One second. That was all it took.',
      ru: 'Одна секунда. Этого хватило.',
    },
    description: {
      en: 'In the war for Ilmenar, its scholars cast a spell to carry their people forward — an error in the translation carried them too far. In a single second the city and everyone in it aged into rot. Now two answers divide them: accept the rot, or hold it back with the blood and living essence of others.',
      ru: 'В войне за Ильменар его учёные сотворили заклинание, чтобы продвинуть свой народ вперёд, — ошибка в переводе унесла их слишком далеко. За одну секунду город и все в нём истлели. Теперь их разделяют два ответа: принять тлен или сдерживать его кровью и живой сутью других.',
    },
    bg: assetUrl('/assets/screens/grail.jpg'),
    crest: assetUrl('/assets/crests/grail.jpg'),
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
      <div class="screen screen-intro" style="background-image: linear-gradient(180deg, rgba(10,10,14,0.35) 0%, rgba(10,10,14,0.75) 60%, rgba(10,10,14,0.96) 100%), url('${assetUrl(`/assets/screens/embark.jpg`)}')">
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
                        <img class="portrait-art-img" src="${assetUrl(`/assets/character_portraits/p_${h.id}.png`)}"
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
        `${assetUrl(`/assets/character_art/${h.id}.png`)}`,
        `${assetUrl(`/assets/character_portraits/p_${h.id}.png`)}`,
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
                  <img class="portrait-art-img" src="${assetUrl(`/assets/character_portraits/p_${h.id}.png`)}"
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