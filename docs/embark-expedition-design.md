# Embark Expeditions — Design

Status: **draft for discussion, nothing built.** Last updated 2026-11-14.
Pilot region: **Crimson Basilica.** Every other region keeps the current single-fight embark
until the pilot is finished.

## Why

An embark today is one fight. You see the enemies, pick a squad, fight, collect. It is
quick and it works, but every embark plays the same way, and once you have seen a level's
lineup there is nothing left to learn about it.

An expedition turns an embark into a small, randomised map of rooms. The current battle is
not replaced. It becomes **what happens inside a combat room**.

Guiding rules:

- **Upgrade, don't replace.** The battle engine, reconnect modal, abandon penalty, supply
  gate, first-clear tokens and Quick Battle all stay. The expedition is a layer around them.
- **State carries.** HP, deaths, boons and curses persist from room to room for the whole
  run. That carry-over is the game. Without it the map is just a menu.
- **Pressure makes choices matter.** The torch, hidden rooms and exit doors exist so that
  "push on or get out" is a real decision every few steps.
- **Controlled randomness.** Each map is random, but generated from templates and
  constraints, checked on the server. The randomiser never hands out an unwinnable map.
- **Server-authoritative.** Seed, layout, room contents, torch, rewards: everything lives
  on the server. Closing the game mid-run and coming back resumes exactly where you were.

---

## 1. The run at a glance

1. Player picks region and level on the embark screen, as today. One supply is charged
   at the same single gate in `/battle/create` (see `EMBARK_SUPPLY_COST`). One supply pays
   for one whole run, not per room.
2. Player picks the squad. **The squad is fixed for the whole run.** Positions can be
   reshuffled at camp nodes only.
3. The server generates the map and places the squad on the entrance cell.
4. Player moves cell by cell. Moving burns torch. Entering a room resolves it: fight,
   boon, curse, loot, key, camp, nothing.
5. The run ends one of three ways (§6).

## 2. The map

The generator has exactly **two modes**:

| Mode | Levels | Cells | Purpose |
|---|---|---|---|
| **3x3** | 1–3 | 9  | Learning the map: short, readable, teaches movement |
| **5x5** | 4+  | 25 | The real expedition |

### 2.1 Fixed composition per mode

Every map guarantees a minimum set of cells. The rest are filled from the level's
unlocked node pool (§2.2).

| Cell | 3x3 | 5x5 |
|---|---|---|
| Entrance        | 1 | 1 |
| Goal            | 1 | 1 |
| Empty           | 1 | 3 |
| Exit door       | 1 | 2 |
| Secondary fight | 1 | 3 |
| **Fixed total** | **5** | **10** |
| Filled from pool | 4 | 15 |

- The **goal fight is fixed**: always the level's hand-authored encounter (§4).
- **Secondary fights are random**, drawn from controlled encounter templates (§4.1).
- The entrance is always a corner.

### 2.2 Node unlocks by level

New node types appear as the player progresses, so each one can be introduced on its own
rather than all at once. Draft schedule, to tune during the pilot:

| From level | Pool adds | Notes |
|---|---|---|
| 1 | empty, secondary fight | Levels 1–3 teach moving, fighting, exiting and the goal. Nothing else. |
| 4 | camp | First 5x5. The camp is the first new node: rest and reshuffle. |
| 5 | shrine (boon) | |
| 7 | curse / event | Choices with a downside appear once the basics are known. |
| 9 | elite fight | |
| later | keys & doors, dark rooms | Milestone 3+ (§11). |

Pool weights (how many of each per map) are data per level band, not code.

Example 5x5, fully revealed:

```
┌───┬───┬───┬───┬───┐
│ E   ·   C │ ? │ X │      E  entrance        C  combat
├   ┼───┼   ┼   ┼   ┤      ·  empty           L  elite
│ ·   S │ L   ·   ? │      S  shrine          K  key
├───┼   ┼───┼───┼   ┤      R  camp (rest)     D  locked door
│ K   ·   C │ R   · │      X  exit door       G  goal (Aldra)
├   ┼───┼   ┼   ┼───┤      ?  event
│ C │ X   ·   D   C │      ║/─ wall
├   ┼   ┼───┼   ┼   ┤
│ ·   ·   ?   L   G │
└───┴───┴───┴───┴───┘
```

### Cell types

| Cell | What it does |
|---|---|
| **Entrance** | Start. Not an exit (see §6). |
| **Empty** | Nothing. Costs torch to cross like any other cell. |
| **Combat** | A fight from the region's room pool (§4). Pays room loot on a win. |
| **Elite** | A harder fight, better loot. |
| **Shrine** | A boon, or a gamble between a boon and a curse. Litanies and callings hook in here. |
| **Event** | A small scripted choice: pay HP for loot, free a prisoner, etc. Can grant a boon or a curse. |
| **Camp** | Refuels the torch, allows reshuffling the squad, and is where heal-type passives and litanies fire. |
| **Key / Door** | A key opens its matching door. Doors block a path until opened. |
| **Exit door** | Leave the run and keep everything earned (§6). Usually 2 per map. |
| **Goal** | The level's set piece: the existing hand-authored encounter (§4). |

Walls are what keep the map interesting. In an open grid the centre cell touches four
others, so a player who heads for the middle sees most of the map in a couple of moves.
**The generator should favour corridors over open space**, so most cells have only
one or two open neighbours.

**Movement is orthogonal only:** up, down, left, right. No diagonal moves. "Adjacent"
everywhere in this doc (movement, fog reveals, generator paths, exit placement) means the
up-to-4 orthogonal neighbours, never the 8 that include diagonals.

**3x3 maps have no walls.** They are small enough to stay readable, and levels 1–3 exist
to teach movement. Walls arrive with 5x5 at level 4.

## 3. Generation

Template-driven, with hard constraints validated on the server:

1. Pick the mode from the level: 3x3 for levels 1–3, 5x5 for level 4 and up.
2. Place the entrance in a corner. Place the goal at least N steps away (3x3: the
   opposite corner; 5x5: N is a tuning number).
3. Carve a guaranteed path from entrance to goal.
4. If the template has a locked door: put the door **on** the critical path, and the key
   on a side branch that is reachable **without passing that door**.
5. Carve side branches, then add walls and empty cells.
6. Place the fixed cells for the mode (§2): exit doors (1 or 2), empties, secondary
   fights. Exits go not on the entrance and not adjacent to the goal. In 5x5, the two
   exits are not both close to the entrance.
7. Fill the remaining cells (4 or 15) from the level's unlocked pool (§2.2) and its weights.
8. **Validate:** the goal is reachable, every key is reachable before its door, at least
   one exit is reachable, and the torch budget (§5) covers the shortest route to the goal.
   If anything fails, regenerate with the next seed.

The seed and the generated map are stored with the run. The client receives only what is
revealed (§5.1).

## 4. Encounters

- **Goal room = the existing level encounter.** `REGION_ENCOUNTERS[region].level_N` stays
  exactly what it is: the curated set piece (Sister Aldra at level 6, and so on). The goal
  of a Crimson Basilica level 6 run is to find and defeat Aldra.
- **Secondary fights (combat and elite rooms) come from controlled encounter templates**
  (§4.1). This is the main piece of new content work.

### 4.1 Secondary encounter templates

Hand-authored like the goal fights, but many per level band, so the generator has real
variety to draw from while every lineup is still one a designer approved. Each template:

- a lineup: enemy keys, cells, optional `item_id` and `spells`, in the same format as
  `REGION_ENCOUNTERS` so `getEncounter`'s resolving code is reused
- the level range it can appear in
- a weight, and a tag (`combat` / `elite`)
- its loot table (§8)

A map never repeats the same template twice. Basilica needs enough templates per band
that two runs of the same level rarely share more than one fight.
- Every fight goes through the existing battle flow: `/battle/create`, the stream,
  reconnect, `/battle/end`, `/battle/reward`. The run just supplies the enemy lineup and
  the fight modifiers (§7), and gets the outcome back.

## 5. Fog and the torch

### 5.1 Fog of war

- On each move, **2–3 random adjacent cells** are revealed.
- Revealing a cell shows its **type** (combat, shrine, exit...), not its contents. Enemy
  lineups and loot are only shown when you step in.
- Optional: **dark rooms** that never reveal from outside. A natural hook for a scouting
  litany or boon.
- Stepping into a combat room starts its fight at once. There is no preview and no
  stepping back: walking into the room is the decision.

### 5.2 The torch — shown to players as Resolve

**Renamed 2026-11-14:** players see this meter as **Resolve / Решимость**, the squad's nerve
wearing down in hostile ground, with stages **Steadfast / Wavering / Shaken / Broken**
(Стойкость / Колебание / Смятение / Надлом). The rules below are unchanged; `torch` remains
the internal name in code and data. Lantern became **Rally**, Gloom became **Dread**, and the
Dark Well became the **Whispering Well**.

A per-run meter, not a unit stat. Every step costs torch. Torch stages apply a modifier
to **every fight started at that stage**. Stored unit data is never touched.

| Stage  | Effect on fights |
|---|---|
| Bright | none |
| Dim    | -3 initiative for the player squad |
| Dark   | -6 initiative, enemies deal more damage |
| Out    | -10 initiative (cap), enemies deal more damage still |

Why stages and a cap rather than a flat -1 per step: unit initiative is roughly 20–55, and
items give +1 to +6. A flat -15 after 15 steps would cancel out every initiative item,
halve a 30-speed unit, and flip turn order against the player.

- **Budget scales with the map:** a full torch lasts about **1.5× the shortest route** to
  the goal on that map, so a 3x3 and a 5x5 feel the same. An efficient player stays at
  Bright or Dim. A full clear goes Dark.
- **Camps refuel**, fully or partly (tuning).
- **Optional, risk/reward:** rooms resolved in Dark or Out pay a loot bonus, so low light
  is a choice and not only a punishment.

The torch is the answer to "why not full-clear every map?". Exploring is allowed, but it
costs.

## 6. Ending a run

| How | Room rewards earned so far | Goal reward | Squad HP |
|---|---|---|---|
| **Defeat the goal** | 100% | yes | as it is |
| **Leave through an exit door** | 100% | no | as it is |
| **Abandon a fight** | 50% | no | every unit set to 1 |
| **Squad wiped** (fight lost) | 0% | no | as the battle left it |
| **Leave from the map** (no exit door) | 50% | no | every unit set to 1 |

- Abandoning reuses the existing abandon path (`persistBattleRosterState` with
  `abandoned: true` sets survivor HP to 1). The run then ends and pays half.
- **The entrance is not an exit.** Otherwise "peek at two rooms, walk back out" is a free
  safe option every time.
- Exit doors are hidden like any other cell. Finding one is part of the map. "Do I have
  the torch to reach that exit, or do I push on to the goal?" is the intended tension.
- After the run, units heal passively or with potions, as after an embark today.

## 7. Boons, curses and fight modifiers

Boons, curses and torch stages are all the same thing: **modifiers applied to a fight from
the run's state.** They should share one slot on the battle creation path, ideally the
same one boss spells already use, so a new boon or curse is pure data.

- Boons: e.g. +X% damage for the next 2 fights, reveal the whole map, refuel torch, shield
  the front row in the next fight.
- Curses: e.g. -initiative for 3 fights, faster torch burn, one unit starts each fight at
  -20% HP, a goal-room buff.
- Each has a duration (N fights, or until the run ends) and stacks by explicit rule.
- **Litanies and callings** hook in at shrines, events and camps. Examples: a litany that
  removes a curse, a calling that scouts, camp-time healing. The existing `embark_heal_pct`
  passive (`collectEmbarkBonuses`) is a natural fit for camp nodes.

## 8. Rewards

- **Goal reward:** the level's reward table (gold, crystals, trophies). Refactored for the
  expedition economy, but it remains the single "level reward". **First-clear tokens**
  (`FIRST_CLEAR_TOKENS`) are awarded on the first goal kill, since that is the new
  "progress advanced".
- **Room rewards:** controlled-random loot per room type and level band (combat < elite;
  shrines and events have their own tables). Banked as you go and paid out when the run ends.
- **Quick Battle (3 supplies, `QUICK_BATTLE_SUPPLY_COST`):** resolves a cleared level's
  **goal reward only**. Room loot is only earned by walking the map. Quick Battle stays the
  way to farm a level you have outgrown.
- Embark bonus passives (gold, XP and crystal percentages, plus building and event
  bonuses) apply once, to the final payout.
- The "where does X drop" index (`buildDropIndex`) must learn the room loot tables.

## 9. Server state

New per-player run record (one open run per player):

- `region_id`, `level`, `seed`, full generated map, revealed cells, current cell
- squad (roster ids + positions), torch value, active boons/curses with durations
- banked room rewards, keys held, rooms resolved
- link to the active battle record while a fight is in progress
- status: `active` / `completed` / `exited` / `abandoned` / `wiped`

New endpoints (names indicative): start run, move, resolve room/choice, camp actions,
leave by exit. Fights go through the existing battle routes with a `run_id` attached.
Every move is validated on the server: adjacency, walls, doors, keys, torch.

## 10. Open questions

Still open:

1. **Dark-room loot bonus:** in or out? (Milestone 2+.)
2. **Quests:** separate layer on top of runs (e.g. "find the relic in 3 Basilica runs"),
   or a room type? Out of pilot scope either way.
3. **Revives:** can a camp or shrine revive a dead unit? (Milestone 2+; in Milestone 1
   a death is final until the run ends.)

## 10.1 Decisions (2026-11-14)

- **Losing a fight = squad wiped = run over, nothing paid.** Banked room loot is lost.
  This is what makes the exit door a real decision.
- **Deployed units are busy.** Units on an open run cannot go on errands, into the
  Colossus, PvP or the tourney until the run ends (the mirror of errands blocking embark).
- **No time limit on an open run.** The player can always leave from the map with the
  abandon penalty (half of banked loot, HP set to 1), so units are never stuck.
- **Secondary fight loot (placeholder):** each pays about 20–30% of the level's goal gold
  and crystals, with an occasional trophy. Tuned during the pilot.
- **XP is banked** with everything else and paid when the run ends. Units do not level up
  mid-run.
- **No fight preview (changed 2026-11-14):** stepping into a fight cell starts the battle in
  the same request. No lineup screen, no stepping back. Only if the battle could not be
  opened (connection lost) does the map show the room with a Fight button.
- **Cleared fight cells become empty** and can be walked through again.
- **Dead units stay dead** until the run ends. The run continues while one unit lives.
- **Level progress and first-clear tokens only on the goal kill.** Exiting does not unlock
  the next level.
- **Embark bonuses** (unit passives, buildings, events) apply once, to the final payout.
- **After a fight the player returns to the map.** The reconnect modal resumes the fight
  if one is in progress, otherwise opens the map.
- **Quest counters** (damage, kills by tag) already count per battle and need no change.
- **Every new string ships in English and Russian.**
- **The web demo** (`web/demos/embark.js`) stays the old embark for Milestone 1.
- **No dev tools in the game.** Seeds, full reveal and teleporting were tried and removed
  (2026-11-14); runs are tested through the server tests instead.
- **Run telemetry:** every run logs its outcome (goal / exit / abandon / wipe), steps
  taken and fights fought.

## 11. Rollout: Crimson Basilica first

Rework **one region**, ship it to the friends-test group, fix it, then move on.

- **Why Basilica:** 15 levels, the most authored content, three Aldra variants as natural
  goal rooms across the bands.
- A per-region switch in `REGIONS` (e.g. `mode: 'expedition'`) routes Basilica embarks
  to the run flow. Glittering Abyss and Chamber of Unrest keep the single-fight flow
  unchanged. This coexistence is temporary, for the migration only. The end state is
  one system.
- Quick Battle on Basilica switches to "goal reward only" the same day the region switches.

**Art is out of scope for now.** Map cells, node icons and backgrounds use placeholders
(plain tiles, text or glyphs). Art is added later without changing any logic.

### Milestone 1 — Navigation (current goal)

Properly navigating a Basilica expedition, end to end:

- Generator with both modes (3x3 / 5x5) and the fixed composition from §2.1
- Node pool limited to **entrance, goal, empty, secondary fight, exit door**; any pool
  slot is filled with empty or secondary fight
- Walls in 5x5, validation (§3) and reroll on failure
- Fog: 2–3 random adjacent reveals, type only
- Server run record, move validation, resume after closing the game
- Fights through the existing battle flow with carry-over HP and deaths
- Secondary encounter templates for Basilica (§4.1), goal = existing level encounter
- The end conditions (§6), banked room loot, first-clear tokens on the goal
- Quick Battle on Basilica pays goal reward only
- **Tutorial update** (§12)

### Milestone 2 — Pressure and nodes

- Torch with stages, the shared fight-modifier slot (§7)
- Camp (level 4+), shrine/boons (5+), curses/events (7+), elites (9+) per §2.2

### Milestone 3+

- Keys and locked doors, dark rooms
- Litany and calling hooks beyond camp healing
- Quests
- Remaining regions, one at a time, each with its own encounter templates

## 12. Tutorial

**The tutorial must be updated** ([public/tutorial.js](../public/tutorial.js)). Today it
walks the player through a single-fight embark, and the first Basilica embark will now be
a 3x3 map.

What the first expedition (level 1, 3x3) has to teach:

1. The map: what a cell is, the entrance, the goal.
2. How to move: tap an open cell directly up, down, left or right. No diagonals.
3. Fog: moving reveals neighbours; a revealed cell shows its type, not its contents.
4. Stepping into a fight: the existing battle flow, then back to the map with damage kept.
5. Exit doors: leaving early keeps what you earned, without the goal reward.
6. Reaching and beating the goal.

Each new node type gets a one-time hint the first time it appears (camp at level 4,
shrine at 5, etc.), rather than a front-loaded explanation.

Open point for the tutorial: should level 1 be fully revealed or use a fixed seed, so
every new player gets the same teachable map?

### What the pilot should tell us

- Typical run length per level band (target: low levels well under 10 minutes)
- How often players exit vs push to the goal vs abandon
- Whether the torch numbers create pressure without forcing a straight beeline
- Generator failure rate and how often maps feel samey

## 13. Milestone 1 — implementation notes (2026-11-14)

- **Database:** run `sql/015_expeditions.sql` before deploying. Until then the
  expedition routes fail, but `/bootstrap` and the guards treat a missing table as
  "no run", so the rest of the game keeps working.
- **Files:** `data/expedition.js` (modes, pools, Basilica secondary templates,
  loot), `utils/expedition-map.js` (generator, movement, fog; pure),
  `routes/index.js` (§ Expeditions: start / move / fight / leave, plus hooks
  in `/battle/reward` and `/battle/end`), `public/screens/expedition.js` (map screen).
- **Shared payout:** the win payout of `/battle/reward` is now `payRegionRewards`,
  used by both single-fight embarks and expedition runs.
- **Telemetry:** every finished run keeps its row (`outcome`, `steps`, `fights`) and
  logs one `[expedition] {...}` line.
- **Deployed squad:** heal / potion / resurrect / tome / level-up / engrave /
  calling / oath / equip / unequip / errands are refused for squad units; restore,
  item sets, Quick Battle, Colossus and PvP are refused while any run is open.
- **Known gap:** the passive 10%-per-5-minutes HP recovery is not in this server
  (it runs in the database). Until that job skips squad units of active
  expeditions, a squad recovers between rooms if the player waits.
- **Room fights between turns:** the engine is rebuilt from the battle record on every
  turn. `battle_data.expedition.template` names the room's lineup so the rebuild uses it
  (`expeditionBattleEnemies`); without it every room turned into the goal fight after
  the first turn.

## 14. Milestone 2 — implementation notes (2026-11-14)

All numbers live in `data/expedition.js` (`TORCH`, `CAMP`, `BOONS`, `CURSES`, `EVENTS`,
`ELITE`, `POOLS`) and are first guesses for the pilot.

- **Torch (level 4+):** max = 1.5 × the shortest route to the goal (at least 6); each step
  burns 1. Stages by what is left: Bright > 50%, Dim > 25% (squad −3 initiative), Dark
  (−6, enemies +15% power), Out (−10, enemies +30%). Not on 3x3 maps.
- **Camp (4+, at least one per map):** rest once — torch +50%, living units heal 20% of
  max HP. Standing on a camp also allows reshuffling the squad (no overlap; the fallen
  keep their cells).
- **Shrine (5+):** two boons offered, one taken, once. Boons: Valor (+15% power, 2 fights),
  Haste (+5 initiative, 2), Aegis (+4 armor, 2), Lantern (torch +50%), Mending (heal 25%),
  Farsight (reveal the map).
- **Curse (7+):** triggers on entry, once. Frailty (−15% power, 2), Torpor (−5 initiative,
  2), Exposure (−4 armor, 2), Gloom (torch −30%), Bleeding (−15% of current HP, never
  below 1). A revealed curse room is visible as such, so it can be walked around.
- **Event (7+):** accept or walk on, once. Reliquary (40% of the level's gold and
  crystals + a trophy, and a random curse), Blood Altar (−20% HP for a random boon), Dark
  Well (torch +40%, and a random curse).
- **Elite (9+):** a template from 2–3 levels further in (clamped to the hardest band),
  enemies +20% power and +3 armor, double loot.
- **Fight-modifier slot:** torch stage + lasting boons/curses + elite, summed per side
  (`fightMods`), stored on the battle as `battle_data.expedition.mods` and applied to both
  armies at creation and on every rebuild between turns (`applyFightMods`). Power scales
  attacks only, not heals. Lasting effects tick down after each won fight.
- **Routes:** `POST /expedition/choose` (rest / boon id / accept / decline) and
  `POST /expedition/formation` (camp only).
- **Tutorial:** one-time hints for the torch, camp, shrine, event, curse and elite.
- **Not done yet:** the battle screen does not show which modifiers are active; dark-room
  loot bonus; revives.

## 15. The goal no longer ends the run (2026-11-14)

- **Beating the goal clears the level at once:** next level unlocked and first-clear tokens
  granted on the kill (`clearExpeditionLevel`).
- **The goal's gold, crystals, XP, trophies and event drops join the haul.** They are paid
  with the rest when the player leaves, and lost with the rest to a wipe.
- **After the goal, leaving from any cell is going home:** full haul, no HP penalty,
  outcome `goal`. Abandoning a fight is still half, and a wipe still loses everything.
- The map shows **Return home** in place of the exit/abandon buttons, and a one-time hint
  (`expedition_goal_done`) explains the choice.
- Lineup rule (same day): every secondary lineup has at least as many attackers as
  supports; four Basilica rooms were support-only and could not deal damage.
