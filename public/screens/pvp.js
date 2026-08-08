import { applyBackground } from '../utils.js';
import { lang } from './settings.js';

// Placeholder until live PvP exists. Kept in step with the roadmap entry in
// timeline.js: duels are real-time, matched on party strength, and every win
// counts toward the FACTION's season rather than only a personal rank — when a
// season closes the leading faction claims a shard of the Shattered Crown.
const PT = {
  title: { en: 'Crown Shards', ru: 'Осколки короны' },
  lead: {
    en: 'The crown broke in the war for Ilmenar, and its shards fell across the world.',
    ru: 'Корона раскололась в войне за Ильменар, и её осколки разлетелись по миру.',
  },
  body: {
    en: 'Duel other players in real time, matched by the strength of your party. Every victory adds to your faction’s standing for the season — and when it closes, the leading faction claims a shard and keeps it.',
    ru: 'Дуэли с другими игроками в реальном времени, подбор по силе вашего отряда. Каждая победа идёт в счёт вашей фракции за сезон — а когда он завершается, ведущая фракция забирает осколок себе.',
  },
  soon: { en: 'Coming soon', ru: 'Скоро' },
};

export function renderPvp(root, { player }) {
  const L = lang(player);
  applyBackground(root, player.faction, 'embark');

  root.innerHTML = `
    <div class="screen screen-pvp">
      <main class="pvp-main">
        <div class="pvp-placeholder">
          <div class="pvp-placeholder-icon">⚔</div>
          <div class="pvp-placeholder-title">${PT.title[L]}</div>
          <div class="pvp-placeholder-lead">${PT.lead[L]}</div>
          <div class="pvp-placeholder-desc">${PT.body[L]}</div>
          <div class="pvp-placeholder-soon">${PT.soon[L]}</div>
        </div>
      </main>
    </div>
  `;
}