// The three champions each faction can be led by.
//
// A hero is a permanent choice made at registration and the only unit that
// banks power for spells, so it is the one card a new player reads hardest.
// Both the cards and the paragraphs under them are the game's — buildUnitCard
// draws the card, and the flavour is lifted verbatim from the hero step of
// public/screens/register.js so the front door and the first screen agree.
import { UNITS } from '../vendor/data/units.js';
import { assetUrl } from '../vendor/public/asset_base.js';
import {
  buildUnitCard, handleUnitInspect, openSheet, unitName, enableTrackSwipe, escapeHtml,
} from '../vendor/public/utils.js';
import { player, faction, L, mountFactionTabs } from './demo-boot.js';

const HEROES = {
  empire:              ['h_e_1', 'h_e_2', 'h_e_3'],
  choir_of_the_cursed: ['h_d_1', 'h_d_2', 'h_d_3'],
  grail_of_sorrow:     ['h_g_1', 'h_g_2', 'h_g_3'],
};

// One short paragraph per hero: what they DO, and which two pieces of their kit
// combo. No numbers — the stats are on the card right above this text.
const FLAVOR = {
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
    ru: 'Голос Матери. Бьёт на расстоянии и ходит раньше почти всех на поле, потому что Скорбь вытягивает скорость из каждого врага. Её ход наступает первым — тратьте их на заклинания, которые решают бой.',
  },
};

const defsById = Object.values(UNITS[faction] || {}).reduce((m, u) => (u?.id ? (m[u.id] = u, m) : m), {});
const heroes = (HEROES[faction] || HEROES.empire).map(id => defsById[id]).filter(Boolean);

const cardEl   = document.getElementById('hero-card');
const flavorEl = document.getElementById('hero-flavor');
const trackEl  = document.getElementById('hero-track');

let openIndex = 0;

function render() {
  const hero = heroes[openIndex];
  cardEl.innerHTML   = hero ? buildUnitCard(hero) : '';
  flavorEl.textContent = FLAVOR[hero?.id]?.[L] || '';

  trackEl.innerHTML = heroes.map((h, i) => `
    <div class="portrait-card portrait-card--branch${i === openIndex ? ' portrait-card--selected' : ''}"
         data-i="${i}" title="${escapeHtml(unitName(h, player))}">
      <img class="portrait-art-img" src="${assetUrl(`/assets/character_portraits/p_${h.id}.png`)}"
           alt="${escapeHtml(unitName(h, player))}" onerror="this.style.display='none'">
      <div class="portrait-name">${escapeHtml(unitName(h, player))}</div>
    </div>`).join('');
}

trackEl.addEventListener('click', e => {
  const card = e.target.closest('.portrait-card[data-i]');
  if (!card) return;
  openIndex = Number(card.dataset.i);
  render();
});

// Stats and ability icons explain themselves, the same way they do in the
// roster and on the registration screen.
cardEl.addEventListener('click', e => handleUnitInspect(e, openSheet));

mountFactionTabs(document.getElementById('factions'));
render();
enableTrackSwipe(document.querySelector('.branch-track-wrap'));
