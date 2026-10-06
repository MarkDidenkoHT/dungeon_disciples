# web/ — the public landing page

A static site. `web/` is the deploy root; nothing here talks to the app server.

## Deploying

Cloudflare Pages, build command empty, output directory `web`. The art is
already on the asset CDN (`assets.markdidenkowork.workers.dev`), so this folder
carries no images at all.

## Before every deploy

```bash
node scripts/build-web.js
```

`web/vendor/` is generated and should be regenerated whenever the game's CSS,
data or widgets change. It holds verbatim copies of `public/style.css`, the
`data/` modules the demos read, and the game's own `transmute.js`, `engrave.js`,
`colossus-page.js`, `unit_tree.js` and `utils.js`. The copies keep the repo's directory layout
(`vendor/public/…`, `vendor/data/…`) so the modules' own relative imports resolve
without edits.

Two things are not straight copies:

- `vendor/public/api.js` is `demos/api-stub.js`, not `public/api.js`. The demos
  have no server; the stub answers the endpoints the widgets call and keeps the
  result in memory for the life of the tab.
- `vendor/data/buildings.json` is a JSON dump of `data/buildings.js`, which is
  CommonJS and cannot be imported by a browser module. It carries the castle
  slot tables and `UNIT_UPGRADE_PATHS`, which is what the evolution tree walks.

## How it is put together

- `index.html` carries the English copy inline, each element tagged
  `data-i18n`. `i18n.js` holds both languages and picks one from
  `localStorage`, then `navigator.languages`. `landing.js` swaps the text.
- Each demo is its own page under `demos/`, shown in an `<iframe>`. The frame is
  what lets the game's stylesheet be used verbatim: `style.css` styles `html`,
  `body` and `#shell` as a full-screen Telegram mini-app, which would fight the
  landing page in a shared document.
- A frame loads when it scrolls near the viewport, and reloads with
  `?lang=` when the visitor switches languages — the widgets read their language
  once, at mount. `?faction=` picks which banner a frame opens on, and the
  faction tabs inside a demo set it by reloading for the same reason.
- `demo-boot.js` renders the Valor row the engraving page needs, because in the
  game it belongs to the app shell rather than to any screen and a framed screen
  has no shell to inherit it from. The gold / crystal `.resource-bar` is
  deliberately not reproduced: it read as a HUD for a purse the visitor does not
  have. The purse itself still exists (`seedResources`) — the widgets price
  against it — it is simply never displayed, and nothing on the page quotes a
  building's cost.
- Every section's `.wrap` is a panel: the background and the coloured border sit
  on the wrap rather than the section, which is what leaves the loading-screen
  backdrop showing down both gutters instead of being covered edge to edge. The
  border colour comes from `--panel-accent` / `--panel-edge`, set per section in
  `site.css` so the page steps through the three banner colours as you scroll.
- The castle sheet names what a plot is FOR rather than its level: the twelve
  layer-2 halls carry a real `desc`/`desc_ru` in `data/buildings.js`, and the
  layer-1 plots, which carry none, get a line naming the unit they recruit (the
  unit card below the sheet is the rest of the answer).
- Tapping a level on the embark board opens the encounter: a 2×3 sheet laid out
  on the game's own cell numbering (`0 1 / 2 3 / 4 5`, front row first), filled
  by index so unoccupied cells stay visibly empty. A boss is the encounter entry
  carrying `spells`, not a property of the unit. The grid is capped at 260px so
  the whole formation is on screen at once.
- The item catalog is read-only. The game's own card already carries the name,
  rarity, stat chips, passive and tags, so tapping one opened a sheet holding the
  same card again.
- Two changes live in the game rather than here, and are mirrored verbatim into
  `vendor/public/utils.js` so the two files stay byte-identical:
  - `TAG_LABELS` / `tagLabel` and `FACTION_LABELS` / `factionLabel` in
    `public/utils.js`. Tags and faction ids are authored in English because they
    are also lookup keys; they used to print straight onto item and unit cards,
    so the Russian UI said “Требует: Vampire”. The key stays English, the label
    is translated, and the Russian words are the ones the ability text in
    `data/unit_abilities.js` already uses.
  - `BOSS_LEVELS` in `public/screens/embark.js` is `[3, 6, 9, 10]`. Level 9
    fields the tier-2 boss a second time in all three regions' encounter tables;
    the pip row was the only place that did not say so.
- `buildBackdrop` bails out when the page measures zero wide. A hidden or
  prerendered tab has an `innerWidth` of 0 until it is shown; that made `rows`
  infinite, which threw, and the throw took the rest of `landing.js` with it —
  `applyLang()` included, so a tab restored in the background rendered
  untranslated. `applyLang()` now also runs before the art, so it cannot be
  taken out by anything that draws.
- The castle copy says what is actually true: the twelve page-2 halls are the
  same buildings in all three factions (same ids, slots, effects and level
  ladders in `BUILDING_POOLS`); only the names, the art and the crystal in the
  price change. Page 1 shares nothing, because a barracks is its unit.
- The page has ONE faction, picked in the header and kept in `localStorage`.
  `landing.js` writes it onto `<body data-faction>`, which is what `site.css`
  hangs the whole palette off, and passes it to every demo as `?faction=`. The
  faction tabs still inside a few demos no longer reload their own frame: they
  `postMessage` the choice up to the page, so the header and the other seven
  frames move with them. The hero art follows the banner too.
- The faction themes (`sfx/themes/*.mp3`, the game's own) are OFF until the
  visitor presses the note in the header. The choice is deliberately not
  remembered — arriving to unexpected sound on a second visit is the same
  rudeness one navigation later — and the button press IS the gesture browsers
  require before audio may play.
- Factions are named in full — Empire of Aurex, Choir of the Cursed, Grail of
  Sorrow — in `i18n.js`, in `index.html`'s inline English, and in the demo
  faction tabs (`demos/demo-boot.js`).

## Local preview

Any static server over `web/` will do; the page needs no build step.
