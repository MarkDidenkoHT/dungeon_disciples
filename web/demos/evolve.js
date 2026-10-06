// Unit evolution: one recruit, and everything it can become.
//
// This is the same module the castle opens from a slot — buildUnitTree walks
// UNIT_UPGRADE_PATHS up to the root of a line and back down over every
// descendant, renderUnitTreeHtml lays the result on the 5x5 grid, and
// drawUnitTreeLinks measures the laid-out cells to draw the branch connectors.
//
// Tapping a node opens its card compared against its PARENT, because that is
// the question a tree is read with: what does this one step buy me.
import BUILDINGS from '../vendor/data/buildings.json' with { type: 'json' };
import { UNITS } from '../vendor/data/units.js';
import { buildUnitTree, renderUnitTreeHtml, drawUnitTreeLinks, lineageTo } from '../vendor/public/unit_tree.js';
import { assetUrl } from '../vendor/public/asset_base.js';
import {
  buildUnitCard, handleUnitInspect, openSheet, unitName, enableTrackSwipe, escapeHtml,
} from '../vendor/public/utils.js';
import { player, faction, t, mountFactionTabs } from './demo-boot.js';

const paths    = BUILDINGS.UNIT_UPGRADE_PATHS?.[faction] || {};
const defsById = Object.values(UNITS[faction] || {}).reduce((m, u) => (u?.id ? (m[u.id] = u, m) : m), {});
const getUnit  = id => defsById[id] || null;

// A hero's portrait is filed under the base id — h_e_1 covers every branch of
// h_e_1111 — so the id is trimmed back to it, as the castle does.
function portraitUrl(id) {
  const base = String(id).match(/^(h_[a-z]_\d)/)?.[1] ?? id;
  return assetUrl(`/assets/character_portraits/p_${base}.png`);
}

// The lines, derived rather than listed: a root is a unit that upgrades into
// something and is itself nobody's upgrade. Heroes have their own page, so the
// h_ lines are left out of the picker here.
const roots = (() => {
  const children = new Set();
  for (const list of Object.values(paths)) for (const p of list || []) children.add(p.unit_id);
  return Object.keys(paths)
    .filter(id => !children.has(id) && !id.startsWith('h_'))
    .map(getUnit)
    .filter(Boolean);
})();

const hostEl  = document.getElementById('tree-host');
const trackEl = document.getElementById('line-track');

let lineIndex = 0;
let openId    = null;
let observer  = null;

function renderTrack() {
  trackEl.innerHTML = roots.map((u, i) => `
    <div class="portrait-card portrait-card--branch${i === lineIndex ? ' portrait-card--selected' : ''}"
         data-i="${i}" title="${escapeHtml(unitName(u, player))}">
      <img class="portrait-art-img" src="${portraitUrl(u.id)}"
           alt="${escapeHtml(unitName(u, player))}" onerror="this.style.display='none'">
    </div>`).join('');
}

function renderTree() {
  observer?.disconnect();
  openId = null;

  const rootId = roots[lineIndex]?.id;
  const tree   = buildUnitTree(paths, rootId, getUnit);

  hostEl.innerHTML = renderUnitTreeHtml(tree, {
    currentId:   rootId,
    pathIds:     lineageTo(paths, rootId),
    portraitUrl: (id) => portraitUrl(id),
    nameOf:      def => unitName(def, player) || def?.id || '',
    emptyLabel:  t('This line has no upgrades yet.', 'У этой линии пока нет улучшений.'),
  });

  const treeRoot = hostEl.querySelector('.utree-root');
  const grid     = treeRoot?.querySelector('.utree');
  if (!treeRoot || !grid) return;

  // The connectors are measured from the laid-out grid, so they are drawn once
  // it exists and again whenever it changes shape — the detail state squashes
  // the cells into a strip, and portraits arrive after first paint.
  observer = new ResizeObserver(() => {
    if (!grid.isConnected) { observer.disconnect(); return; }
    drawUnitTreeLinks(treeRoot);
  });
  drawUnitTreeLinks(treeRoot);
  treeRoot.querySelectorAll('.utree-portrait').forEach(img => {
    if (!img.complete) img.addEventListener('load', () => drawUnitTreeLinks(treeRoot), { once: true });
  });
  observer.observe(grid);

  const byId = new Map(tree.nodes.map(n => [n.id, n]));

  const collapse = () => {
    openId = null;
    treeRoot.classList.remove('utree-root--detail');
    treeRoot.querySelectorAll('.utree-cell--selected').forEach(el => el.classList.remove('utree-cell--selected'));
    const detail = treeRoot.querySelector('#utree-detail');
    if (detail) detail.innerHTML = '';
  };

  const show = id => {
    const node = byId.get(id);
    if (!node?.def) return;
    openId = id;
    // Deltas are against the parent, so each card answers what one step buys.
    const parent = node.parentId ? byId.get(node.parentId)?.def : null;
    treeRoot.classList.add('utree-root--detail');
    treeRoot.querySelectorAll('.utree-cell--selected').forEach(el => el.classList.remove('utree-cell--selected'));
    treeRoot.querySelector(`.utree-cell[data-unit-id="${id}"]`)?.classList.add('utree-cell--selected');
    const detail = treeRoot.querySelector('#utree-detail');
    if (detail) detail.innerHTML = buildUnitCard(node.def, { compareUnit: parent });
  };

  treeRoot.addEventListener('click', e => {
    if (e.target.closest('.utree-detail') && handleUnitInspect(e, openSheet)) return;
    const cell = e.target.closest('.utree-cell[data-unit-id]');
    if (!cell) return;
    const id = cell.dataset.unitId;
    if (id === openId) collapse();
    else show(id);
  });
}

trackEl.addEventListener('click', e => {
  const card = e.target.closest('.portrait-card[data-i]');
  if (!card) return;
  lineIndex = Number(card.dataset.i);
  renderTrack();
  renderTree();
});

mountFactionTabs(document.getElementById('factions'));
renderTrack();
renderTree();
enableTrackSwipe(document.querySelector('.branch-track-wrap'));
