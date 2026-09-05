import { api, bootstrapCache, errandsCache } from '../api.js';
import { navigate } from '../api.js';
import { UNITS }    from '../../data/units.js';
import { preloadAssets, buildUnitCard, handleUnitInspect, openSheet, closeSheet, enableTrackSwipe, applyFactionTheme } from '../utils.js';
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
//
// VOICE — the three registers are defined at the top of data/combat_barks.js and
// data/position_barks.js; this screen is a player's first contact with them, so
// it has to agree with them. Empire is stoic and dutiful, the Grail carries
// recent grief (their OWN mistranslated spell, never anyone's punishment), and
// the Choir is song and appetite — NO commerce, no bargains, no debts.
const HERO_FLAVOR = {
  h_e_1: {
    en: 'Paladin. Melee, and the hardest thing on your line to kill. Mithrail’s Light turns his damage into healing for whichever ally is worst off — the more Holy allies you field beside him, the more each blow gives back.',
    ru: 'Паладин. Ближний бой и самое живучее, что есть в вашем строю. Свет Митраила обращает его урон в лечение для самого израненного союзника — и чем больше рядом Святых, тем больше возвращает каждый удар.',
  },
  h_e_2: {
    en: 'Inquisitor. His attack hits six targets at range — the entire enemy formation, every turn, for less damage each. Exorcism does the rest. Keep him behind a wall; he is built to reach, not to be reached.',
    ru: 'Инквизитор. Его атака бьёт по шести целям на расстоянии — по всему вражескому строю, каждый ход, но слабее по каждому. Остальное делает Экзорцизм. Держите его за стеной: он создан доставать, а не быть достанутым.',
  },
  h_e_3: {
    en: 'Artificer. He does not attack — his action is Repair, mending an ally from three tiles back, and Fortify armors the party for free. He is the reason the wall is still standing, so choose his spells for the damage he lacks.',
    ru: 'Артефактор. Он не атакует: его действие — Починка, которая лечит союзника с трёх клеток, а Укрепление даёт отряду броню даром. Он причина, по которой стена ещё стоит, — а урон подберите ему заклинаниями.',
  },
  h_d_1: {
    en: 'Black Castellan. Melee, and he wants to be hit: Rage turns every wound he takes into damage he gives back. Put him where the blows land, and let the enemy make him dangerous for you.',
    ru: 'Чёрный Кастелян. Ближний бой, и он хочет, чтобы били его: Ярость обращает каждую полученную рану в урон. Ставьте его туда, куда приходятся удары, — пусть враг сам сделает его опасным.',
  },
  h_d_2: {
    en: 'Choir Regent. He strikes at range and rules from the back, where Inspiration feeds extra damage to the allies stacked in his column. Build the column around him — the Court sings, it does not brawl.',
    ru: 'Регент Хора. Бьёт на расстоянии и правит из тыла, где Вдохновение добавляет урон союзникам в его колонне. Стройте колонну вокруг него: Двор поёт, а не дерётся.',
  },
  h_d_3: {
    en: 'Infernal Ascendant. Ranged, and everything he does spreads. Fellfire splashes every burning enemy each time he strikes, scaling with the Casters at his side. Set something on fire first and his attacks stop being single-target.',
    ru: 'Инфернальный Вознёсшийся. Дальний бой, и всё, что он делает, растекается. Злое пламя при каждом ударе задевает каждого горящего врага и растёт от числа Магов рядом. Подожгите кого-нибудь — и его атаки перестанут быть одиночными.',
  },
  h_g_1: {
    en: 'Mourning Prophet. Melee. Duelist answers the enemy in front before their blow lands — a kill cancels their attack outright — and Banquet makes him faster and stronger for every Vampire you bring. Reward for committing to the theme.',
    ru: 'Пророк Скорби. Ближний бой. Дуэлянт отвечает врагу напротив раньше, чем дойдёт его удар, — и если тот падёт, атаки не будет вовсе, — а Пир делает его быстрее и сильнее за каждого приведённого вампира. Награда за верность теме.',
  },
  h_g_2: {
    en: 'Grail Warden. Melee, and the more dead you bring the harder he is to put down: Horde hardens him for every Zombie standing at his side. Build the roster wide and cheap, not tall.',
    ru: 'Страж Грааля. Ближний бой, и чем больше мертвецов вы привели, тем труднее его свалить: Орда закаляет его за каждого зомби рядом. Стройте отряд вширь и дёшево, а не ввысь.',
  },
  h_g_3: {
    en: 'Mother’s Voice. She strikes at range and moves before almost anything else on the field, because Sorrow drags the speed out of every enemy. Her turns come first — spend them on the spells that decide the fight.',
    ru: 'Голос Матери. Бьёт на расстоянии и ходит раньше почти всех на поле, потому что Скорбь вытягивает скорость из каждого врага. Её ход наступает первым — тратьте его на заклинания, которые решают бой.',
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
      en: 'The Empire of Aurex keeps to Mithrail, the Golden Lion, who rewards those who hold the line. Its knights, priests and engineers fight as one wall — armored, sanctified, and certain that every shard belongs to Aurex.',
      ru: 'Империя Аурекс, поклоняются Митраилу, Золотому Льву. Его рыцари, жрецы и инженеры бьются как одна стена — в броне, освящённые и уверенные, что каждый осколок принадлежит Аурексу.',
    },
    bg: assetUrl('/assets/screens/empire.jpg'),
    crest: assetUrl('/assets/crests/empire.jpg'),
    highlights: getHighlights('empire'),
  },
  {
    id: 'choir_of_the_cursed',
    label: { en: 'The Choir', ru: 'Хор' },
    tagline: {
      en: 'They sang, and something beneath sang back.',
      ru: 'Они запели — и нечто снизу подпело.',
    },
    description: {
      en: 'The court of Cinderhold was losing the war for the crown, and tried everything: rites, oaths, older rites. Nothing held. Then a troupe nobody had invited played in the hall, in a tongue nobody knew, and the court learned the First Song. Aggrail answered it. The lords are demons now and the court is a choir, and it is still singing — every voice it takes makes the chord louder.',
      ru: 'Двор Пепельного Чертога проигрывал войну за корону и хватался за что угодно: обряды, клятвы, обряды постарше. Ничто не держалось. Пока в зале не заиграла труппа, которую никто не звал, на языке, которого никто не знал, — и двор выучил Первую Песнь. Агграил ответил. Владыки стали демонами, а двор — хором, и он поёт до сих пор: каждый забранный голос делает аккорд громче.',
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
      en: 'In the war for Ilmenar its scholars cast a spell to carry their people forward. The working was wrong: their bodies were never moved into the future — they lived a century through in an instant. In a single second the city and everyone in it aged into rot. Two answers divide them now: accept the rot, or hold it back with the blood and living essence of others.',
      ru: 'В войне за Ильменар его учёные сотворили заклинание, чтобы продвинуть свой народ вперёд, — ошибка в сотворении заклинания - не их тела перенесло в будущее, а они состарились на век за мгновение. За одну секунду город и все в нём истлели. Теперь их разделяют два ответа: принять тлен или сдерживать его чужой кровью.',
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
  chooseHero:     { en: 'Three have answered, and the choice is permanent. Every hero casts the spells you research — what separates them is the blow they strike and the passive they carry.',
                    ru: 'Откликнулись трое, и выбор этот навсегда. Заклинания читают все герои — различаются они ударом и пассивкой.' },
  chooseHeroTitle:{ en: f => `Champion of ${f}`, ru: f => `Защитник — ${f}` },
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
    enableTrackSwipe(root.querySelector('.register-track-wrap'));

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

      enableTrackSwipe(track.closest('.prep-track-wrap'));

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
        applyFactionTheme(selectedFaction.id);
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
          <h2>${UI_TEXT.chooseHeroTitle[L](selectedFaction.label[L])}</h2>
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

    enableTrackSwipe(root.querySelector('#hero-portrait-track')?.closest('.prep-track-wrap'));

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

      // /player/faction seeds the roster, structures and resources for the
      // faction just chosen, so anything cached from before this call describes
      // a different account — an earlier run of this screen after a reset, most
      // of all. Refreshed rather than merely invalidated: the castle reads the
      // roster to find the ruler, and going in dirty draws an empty throne for
      // a frame before the fetch lands.
      //
      // Guarded: the faction is already committed server-side by this point, so
      // a failed prefetch must not drop the player back on this screen with an
      // error. Invalidate and let the castle fetch it again.
      try { await bootstrapCache.refresh(updated.chat_id); }
      catch { bootstrapCache.invalidate(); }
      errandsCache.invalidate();
      navigate('castle', { player: updated });
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  }
}