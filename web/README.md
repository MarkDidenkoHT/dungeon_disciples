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
- `demo-boot.js` renders the game's two resource strips (`.resource-bar` and
  the Valor row) itself, because in the game they belong to the app shell rather
  than to any screen — a framed screen has no shell to inherit them from.

## Local preview

Any static server over `web/` will do; the page needs no build step.
