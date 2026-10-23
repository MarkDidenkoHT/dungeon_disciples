#!/usr/bin/env node
// Regenerates web/vendor/ — the landing page's verbatim copies of the game's
// own CSS, data modules and widgets. Run it before every deploy:
//
//   node scripts/build-web.js
//
// web/ is the deploy root on Cloudflare Pages — build command empty, output
// directory `web` — so the copies have to be committed rather than produced at
// deploy time. They keep the repo's directory layout (vendor/public/…,
// vendor/data/…) so the modules' own relative imports resolve without edits.
// The art is on the asset CDN, so web/ carries no images at all; any static
// server over it is a working local preview.
const fs   = require('fs');
const path = require('path');

const ROOT   = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'web', 'vendor');

// Verbatim copies: source path → path under web/vendor/.
const COPIES = [
  ['public/style.css',        'public/style.css'],
  ['public/utils.js',         'public/utils.js'],
  ['public/asset_base.js',    'public/asset_base.js'],
  ['public/transmute.js',     'public/transmute.js'],
  ['public/engrave.js',       'public/engrave.js'],
  ['public/colossus-page.js', 'public/colossus-page.js'],
  ['public/unit_tree.js',     'public/unit_tree.js'],

  ['data/units.js',          'data/units.js'],
  ['data/unit_abilities.js', 'data/unit_abilities.js'],
  ['data/items.js',          'data/items.js'],
  ['data/engravings.js',     'data/engravings.js'],
  ['data/embark.js',         'data/embark.js'],
  ['data/colossus.js',       'data/colossus.js'],

  // Not public/api.js: the demos have no server. The stub answers the endpoints
  // the widgets call and keeps the result in memory for the life of the tab.
  ['web/demos/api-stub.js', 'public/api.js'],
];

// data/buildings.js is CommonJS and cannot be imported by a browser module, so
// the tables the demos read are dumped as JSON. BUILDING_POOLS carries the slot
// layout and the building names; UNIT_UPGRADE_PATHS is what the evolution tree
// walks.
const BUILDINGS_KEYS = [
  'BUILDING_POOLS', 'SLOT_CATEGORIES', 'SLOT_IDS', 'SLOT_LAYERS',
  'SLOT_FIXED_BUILDING', 'BUILDING_MAX_LEVELS', 'UNIT_UPGRADE_PATHS',
];

function write(dest, body) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const before = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
  const after  = Buffer.isBuffer(body) ? body : Buffer.from(body);
  fs.writeFileSync(dest, after);
  return !before || !before.equals(after);
}

let changed = 0;
for (const [from, to] of COPIES) {
  const src = path.join(ROOT, from);
  if (!fs.existsSync(src)) {
    console.error(`missing source: ${from}`);
    process.exitCode = 1;
    continue;
  }
  if (write(path.join(VENDOR, to), fs.readFileSync(src))) {
    changed++;
    console.log(`updated vendor/${to}`);
  }
}

const buildings = require(path.join(ROOT, 'data', 'buildings.js'));
const dump = {};
for (const key of BUILDINGS_KEYS) {
  if (!(key in buildings)) {
    console.error(`data/buildings.js no longer exports ${key}`);
    process.exitCode = 1;
    continue;
  }
  dump[key] = buildings[key];
}
if (write(path.join(VENDOR, 'data', 'buildings.json'), JSON.stringify(dump, null, 2) + '\n')) {
  changed++;
  console.log('updated vendor/data/buildings.json');
}

console.log(changed ? `web/vendor: ${changed} file(s) refreshed` : 'web/vendor: already up to date');
