// The evolution tree for ONE unit line, laid out on a 5x5 grid.
//
// The data already exists — UNIT_UPGRADE_PATHS in data/buildings.js, which the
// client receives as `upgrade_paths` on the buildings bootstrap. This module
// only reads it: walk UP from a unit to the root of its line, then walk DOWN
// again collecting every descendant, and place the result on the grid.
//
// ROW is free: a unit's tier (`t` on the unit def) is the row, 1..5.
// COLUMN is computed here for now. The intended end state is an authored column
// per node — the hand-placed layout reads better than any generic algorithm —
// so keep placement in this one function, `assignColumns`, and swap its body for
// a lookup when those numbers exist.
//
// Nothing here mutates game state or decides what is upgradable; it is a map.

export const TREE_COLS = 5;
export const TREE_ROWS = 5;

// Where n leaves sit across five columns. Symmetrical and gap-first: two leaves
// straddle the middle rather than crowding the left edge, which is what makes a
// small tree look deliberate instead of ragged.
const LEAF_SPREAD = {
  1: [3],
  2: [2, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
};

// paths: UNIT_UPGRADE_PATHS[faction] — { unitId: [{ unit_id, building_id, ... }] }
function childIdsOf(paths, unitId) {
  return (paths?.[unitId] || []).map(p => p.unit_id).filter(Boolean);
}

// The parent index is derived rather than stored: a unit appears exactly once as
// someone's child, so one pass over the map is enough.
function parentIndex(paths) {
  const parents = {};
  for (const [from, list] of Object.entries(paths || {})) {
    for (const p of list || []) {
      if (p?.unit_id) parents[p.unit_id] = from;
    }
  }
  return parents;
}

export function rootOf(paths, unitId) {
  const parents = parentIndex(paths);
  let id = unitId;
  const seen = new Set();
  while (parents[id] && !seen.has(id)) {
    seen.add(id);
    id = parents[id];
  }
  return id;
}

// Depth-first so a subtree stays contiguous left-to-right, which is what keeps
// the connector lines from crossing.
function collect(paths, rootId) {
  const nodes = [];
  const seen  = new Set();
  (function walk(id, parentId) {
    if (!id || seen.has(id)) return;      // guards against a cycle in the data
    seen.add(id);
    const children = childIdsOf(paths, id);
    nodes.push({ id, parentId, children });
    for (const c of children) walk(c, id);
  })(rootId, null);
  return nodes;
}

// Leaves get their columns from LEAF_SPREAD in DFS order; every parent then
// sits over the middle of its own children. Rounding pulls toward the centre
// column so an odd split leans inward rather than off the edge.
function assignColumns(nodes) {
  const byId   = new Map(nodes.map(n => [n.id, n]));
  const leaves = nodes.filter(n => n.children.length === 0);
  const spread = LEAF_SPREAD[leaves.length] || null;

  leaves.forEach((leaf, i) => {
    leaf.col = spread
      ? spread[i]
      // More leaves than columns: fall back to an even sweep and let two share
      // a column rather than dropping one off the grid.
      : Math.min(TREE_COLS, Math.max(1, Math.round(1 + (i * (TREE_COLS - 1)) / Math.max(1, leaves.length - 1))));
  });

  // Parents after children, so deepest-first.
  for (const n of [...nodes].reverse()) {
    if (n.col != null) continue;
    const cols = n.children.map(c => byId.get(c)?.col).filter(c => c != null);
    if (!cols.length) { n.col = 3; continue; }
    const avg = cols.reduce((a, b) => a + b, 0) / cols.length;
    n.col = Math.min(TREE_COLS, Math.max(1, Math.round(avg)));
  }
  return nodes;
}

/**
 * The whole line `unitId` belongs to, placed on the grid.
 *
 * paths      UNIT_UPGRADE_PATHS[faction]
 * unitId     any unit in the line (its def id, e.g. 'e111')
 * getUnit    id -> unit def, for the tier. Rows fall back to the id's digit
 *            depth when a def is missing, so a line still lays out while its
 *            later tiers are unwritten.
 *
 * Returns { rootId, nodes: [{ id, parentId, children, col, row, def }] }.
 */
export function buildUnitTree(paths, unitId, getUnit) {
  if (!unitId) return { rootId: null, nodes: [] };
  const rootId = rootOf(paths, unitId);
  const nodes  = assignColumns(collect(paths, rootId));

  // Depth from the root is the fallback row: the ids encode the path (e1 -> e11
  // -> e111), but only `t` is authoritative, so prefer it when present.
  const depth = new Map([[rootId, 1]]);
  for (const n of nodes) {
    if (!depth.has(n.id) && n.parentId != null) depth.set(n.id, (depth.get(n.parentId) ?? 1) + 1);
    for (const c of n.children) depth.set(c, (depth.get(n.id) ?? 1) + 1);
  }

  for (const n of nodes) {
    n.def = getUnit?.(n.id) || null;
    n.row = Math.min(TREE_ROWS, Math.max(1, Number(n.def?.t) || depth.get(n.id) || 1));
  }
  return { rootId, nodes };
}

/**
 * The tree as a 5x5 grid of portraits. Read-only for now: no upgrade actions,
 * no cost, no locks — this step is about proving the line is resolved correctly
 * and the art lands in the right cells.
 *
 * opts.currentId   the unit the sheet was opened from (marked)
 * opts.portraitUrl id -> image url
 * opts.nameOf      def -> display name
 * opts.emptyLabel  text for a row the content has not reached yet
 */
export function renderUnitTreeHtml(tree, opts = {}) {
  const { currentId = null, portraitUrl = () => '', nameOf = d => d?.id ?? '', emptyLabel = '' } = opts;
  if (!tree?.nodes?.length) return `<p class="modal-empty">${emptyLabel}</p>`;

  const onPath = new Set(opts.pathIds || []);
  const byCell = new Map(tree.nodes.map(n => [`${n.row}:${n.col}`, n]));
  // The deepest row that actually holds a unit. Rows past it are the tiers that
  // do not exist yet (units stop at 3 today), and drawing five empty rows for
  // every line would be noise rather than a promise.
  const lastRow = Math.max(...tree.nodes.map(n => n.row));

  const cells = [];
  for (let row = 1; row <= Math.min(TREE_ROWS, Math.max(lastRow, 1)); row++) {
    for (let col = 1; col <= TREE_COLS; col++) {
      const n = byCell.get(`${row}:${col}`);
      if (!n) { cells.push('<div class="utree-cell utree-cell--empty"></div>'); continue; }
      const state = n.id === currentId ? 'current' : (onPath.has(n.id) ? 'path' : 'other');
      const url   = portraitUrl(n.id, n.def);
      // The tier numeral is not decoration: every tier of a hero line shares one
      // name AND one portrait (art is keyed by the line, see the h_x_N collapse
      // in renderUnitPortrait), so without it a hero's tree is nine identical
      // cells and unreadable.
      cells.push(`
        <div class="utree-cell utree-cell--${state}" data-unit-id="${n.id}" data-row="${row}" data-col="${col}">
          ${url ? `<img class="utree-portrait" src="${url}" alt="${nameOf(n.def)}" onerror="this.style.display='none'">` : ''}
          <span class="utree-tier">${row}</span>
          <span class="utree-name">${n.def ? nameOf(n.def) : n.id}</span>
        </div>`);
    }
  }

  return `<div class="utree" style="--utree-cols:${TREE_COLS}">${cells.join('')}</div>`;
}

// Every id on the path from the root down to `unitId`, inclusive — the branch
// the player actually took.
export function lineageTo(paths, unitId) {
  const parents = parentIndex(paths);
  const chain   = [];
  let id = unitId;
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    chain.unshift(id);
    id = parents[id];
  }
  return chain;
}