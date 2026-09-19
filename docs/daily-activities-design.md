# Daily Activities — Design

Status: PvP bots wired (templates still being tuned); the rest not built. Last updated 2026-09-15.

## Why

The game plays like a game you sit down with, not one you return to. Daily crystals,
errands and daily quests are checklists: they say "come collect", not "come see what
happened". The aim is pull through **anticipation and shared progress**, not gates.

Guiding rules:

- A return should reveal something (a result, a changed world, a prize to fight for),
  not just unlock another click.
- Cap sessions with **formats** ("a tourney is 5 battles"), never with stamina.
- Units' everyday HP never gates these activities.
- Factions should feel like teams, not labels.

## Overview

| # | Activity | Pull | Status |
|---|---|---|---|
| 1 | PvP bots | Unranked is never empty | Build first |
| 2 | Faction Colossus | Shared weekly boss, faction race | Build second |
| 3 | Engravings | The long-term thing everything pays into | Build before the tourney |
| 4 | Crown Tourney | Evening competition with known prizes | Build last |
| — | Daily Omen | Shared daily puzzle | Parked |

---

## Engravings (progression)

Permanent small stat changes on a unit. Built on the transmutation triangle layout:
**two positive slots and one negative**.

- Values stay small: +2 / +1 / −2.
- Examples: (+Power, +Initiative, −HP), (+Armor, +Life resist, −Power).
- **Replace, never remove.** A unit always keeps an engraving once it has one.
- **Replacing swaps the whole triangle**, never a single slot. Otherwise players keep
  their two positives and cycle the negative to whatever costs them nothing.

### The negative has to hurt

Unchecked, everyone picks a "dump" negative (a resist the unit never needs). Pick one
of these rules during implementation:

- **Paired pools:** each positive stat allows only certain negatives
  (+Power → −HP / −Armor / −Initiative, never a resist), or
- **Weights:** every stat has a cost; the negative must pay for the positives
  (−2 HP buys +1/+1, −2 Power buys +2/+2).

### Sources

- **Crafted:** spend the activity currency in the triangle, choose your own stats,
  weaker values (e.g. +1 / +1 / −2).
- **Won:** Crown Tourney top places award a **pre-made engraving**, shown before the
  tourney starts, with values or combinations crafting cannot make.

### Currency name

"Crown Dust" does not work in Russian. Candidates:

| EN | RU | Note |
|---|---|---|
| Valor | Доблесть | Earned by fighting — fits both activities |
| Glory | Слава | Strong, but may blur with faction season standing |
| Renown | Почёт | Softer |

The Russian name for "Engraving" is also open (Гравировка reads technical;
Клеймо / Руна / Печать are options).

Engravings count toward ⚔ power, so matchmaking stays fair as they spread.

---

## 1. PvP bots

**Goal:** unranked quick match (`utils/pvp-queue.js`) always finds a fight, for a
small tester group that is rarely online at the same moment.

Bots are also a **showcase of builds**: within a few fights a player sees working
armies for their faction and others, which pulls them toward more barracks slots and
mercenaries.

### Templates

Bots are **hand-made templates**, not generated armies.

- A template is one army for **one faction and one power band**.
- Written in the **same shape as an embark encounter** (`data/embark.js`): slots of
  `cell`, unit, optional `item_id`, optional `spells`. Units are **player unit ids**
  from `data/units.js` (not region enemy keys), so players meet units they can recruit.
- Cells follow embark's enemy-side rules. No mirroring.
- **The slot with `spells` is the hero**, as with embark bosses. **1–2 spells** per
  template per band, cast by the existing boss spell AI.
  Note: that AI casts the most expensive spell it can afford each turn, so a cheap
  spell may keep it from saving for a big one. Watch in testing.
- **No loyalty rules** for bots. Templates are balanced by **power only**.
- No level stats: a higher level is a different (evolved) unit id.

### Power bands

| Band | Roughly |
|---|---|
| 200–300 | t2 armies |
| 301–500 | t3 armies |
| 501+ | t4 armies |

- Players below 200 meet the 200–300 band. They lose some and come back for revenge.
- A band with no templates falls back to the nearest band that has some (lower first).
- No ceiling needed yet: a maxed army is ~685 power today.
- The band is picked from **power computed on the server**, never the client's number.

### Picking a template

- **Semi-random faction:** in any 5 bot battles in a row, at least one template of
  each faction. Otherwise random.
- Never the same template twice in a row.
- History comes from the template id stored in each bot battle's record, so a restart
  does not reset it.
- If a faction has no template for a band yet, fall back to another faction's.

### Queue and battle

- No human within **30 seconds** → a bot is assigned automatically.
- **The 30 s turn clock stays**, to build a decision habit.
- Opponent card shows a clear bot label.
- Rewards: **100 XP** on a win, same as a human duel. Adjust later.
- One **global bot system**: the tourney reuses it, choosing templates that fit its rules.

### Wiring notes

- New battle kind `pvp_bot`: the template's army is stored in `battle_data`, rehydrate
  reads it back instead of a second roster, `runAiTurns` plays the enemy side, and the
  player claims rewards once.
- Fallback lives next to `runMatchmaking` in `routes/index.js`.
- Template data file + loader + an **admin preview** that checks ids exist and shows
  each template's power against its band.

### Tasks

1. Server-side squad check and power on `/pvp/enqueue`. **Done.**
2. Template data file, loader, admin preview. **Done.**
3. `pvp_bot` battle kind. **Done.**
4. 30 s queue fallback + faction rotation. **Done.**
5. Author and tune templates with testers.

Picking order when rules clash: never the same template twice (unless it is the only one in
the band), then faction rotation, then random.

### Found in testing

- **Placement.** On the enemy side the front line is **column 0: cells 0 / 2 / 4**, and the
  back line is column 1: cells 1 / 3 / 5. Dual Gargoyles first had the ranged hero on 2
  (front) and the melee Inferno Spawn on 3 (back): the hero was exposed and the Spawn had
  nothing in reach. Fixed by swapping them. Units already carry `pref_position`, so the
  template check can warn when a `front` unit stands in column 1 or a `back` unit in column 0.
- **Ability use.** Bots fire abilities with no reason to. Both gargoyles used Stone Form
  (a heal) on their first turn, at full HP. The enemy AI (`chooseAiAction` →
  `aiPickAbilityTarget` in `utils/battle-engine.js`) has to judge an ability by what it
  would do now: no heal on a full-HP unit, no buff that is already up, and keep it for when
  it matters. This AI also plays region encounters, so a fix improves both.

### Next tasks

6. Template check: warn on `pref_position` against the column a unit stands in. **Done.**
7. Bot ability AI: use abilities only when their effect applies (see Ability use above).
   **Done** for every ally/self ability that used to fire on sight: Stone Form, Ember Shroud,
   Prayer of Healing, Mother's Blessing, Shared Suffering, Verse of Cataclysm (a self-kill),
   Blessing of Protection. Lion's Roar, Blood Craze and Infernal Mandate still fire early,
   which is when they are worth most.

---

## 2. Faction Colossus

A **weekly boss per faction** (Empire, Grail, Choir), with HP far larger than one
battle can remove. The faction chips it down together.

**Built** (2026-09-15). Run `sql/colossus.sql` in Supabase before deploying. All tuning
lives in `data/colossus.js`.

Decisions taken while building (change in `data/colossus.js`):

- **Boss:** new unit `colossus` (Reliquary Titan / Титан-Реликварий), a row unit on the middle row, so
  melee and ranged both reach it. Art: `character_portraits/p_colossus.png`,
  `character_portraits/p2_colossus.png` (grid), `character_art/colossus.png`,
  `embark/colossus.jpg` (page and card).
- **Reset:** Monday 18:00 UTC (21:00 Moscow). Unit rest follows each player's local day,
  the same as daily tasks.
- **Phases** are fixed for a whole attempt, from the pool's HP when it starts. Phase 1 is
  deliberately easy; from phase 2 the sweep stops being physical and cuts healing, because
  tester feedback showed a flat 14-physical sweep is outhealed by any t2.5+ army:
  1 Awakened (14 physical to all) ·
  2 Roots Take Hold (22 nature, Infect 1, Thorns 1, Grave Rot) ·
  3 The Bells Toll (28 death, Infect 2, Death's Verdict) ·
  4 Last Light (34 fire, faster, less armor, Infect 2, Decay 2, Thorns 2, Death's Verdict).
  One spell per phase, so the boss saves power for it.
- **The hero never rests.** A hero is required, so resting it would make one attempt per
  day the whole allowance. Only followers rest.
- **Units enter at full HP** and the attempt never writes roster HP.
- **Abandoning** an attempt still counts the damage dealt.
- **Currency:** "Valor" (name still open), banked as a resource.
- **Season score:** kill order is stored with 3 / 2 / 1 points on the weekly boss row.
  Nothing sums it yet; that waits for a season system.
- **Kill reward** is paid the next time each contributor opens the Colossus page.

Measured offline: a 300–500 ⚔ army deals roughly 300–400 damage per attempt, so a
10,000 pool needs ~30 attempts per faction. Tune the pool to tester numbers.

- **Boss HP:** ~10,000 to start (tune to current numbers; not millions).
- **Week:** resets on a fixed day and time. Each faction fights its **own copy**.
- **Every attempt is one battle.** Damage dealt to the boss is taken off the shared
  pool. The battle does not need to "win".
- **Withering is the timer.** Player units wither as normal; **the boss is immune**.
  Every attempt ends on its own, and damage dealt is the score.
- **Phases** at 75% / 50% / 25% pool HP change the boss's abilities. A faction
  finds out together when its boss reaches a new phase.
- **Unit exhaustion:** units used in an attempt can't fight the Colossus again
  **until the daily reset**. This rewards a wide roster and stops the same top 5
  hitting every time.
- **Kill:** once the pool reaches 0, the boss is defeated for the rest of the week.
  **Everyone who contributed** gets the kill reward.
- **Race:** factions compare kill times. The first faction to kill gains season score.

### Rewards

- Personal damage milestones for the week.
- A kill reward for all contributors.
- Season score to the faction for kill order.
- Until Engravings exist, pay existing rewards (XP / crystals) plus the new
  currency, banked for later.

### Colossus screen

A dedicated screen showing:

- **All three factions' boss bars** side by side: HP left, current phase,
  killed / kill time.
- Your attempts today, your exhausted units, your damage this week.
- Top contributors in your faction.
- Time to reset.

### Wiring notes

- The pool decrement must be **atomic** on the server. Two players finishing at once
  must not both apply damage to the same old HP value, and a kill must be decided once.
- A battle starts with the boss at the pool's **current** HP (and phase); the damage
  written back is capped at what was left.
- Exhaustion is per player, per unit, per day.
- New tables: weekly boss instances per faction, per-player contributions,
  per-unit daily exhaustion.

---

## 3. Crown Tourney

A **daily evening tournament**. Start with **one per day**: the testers keep the same
hours. Later: 2–3 per day, including a newcomer tourney.

- **Duration:** 1 hour.
- **Format:** real-time PvP, like the current quick match.
- **Limit: 5 battles per player per tourney**, so free time alone doesn't win.
- **Matchmaking:** a separate queue mode for the tourney. Prefer opponents with a
  similar tourney score, within ⚔ power bands. Fall back to a **bot** (built under the
  tourney's rules) so nobody waits out the hour.
- **Units enter fresh.** Normal HP does not carry into or out of the tourney.

### Rules

Each tourney rolls **one or two** constraints from a pool:

| Type | Example |
|---|---|
| Banned tag | No Demons |
| Required tag | At least 3 Warriors |
| Unit size | Tile-size units only |
| Loyalty cap | Total loyalty ≤ X |
| Item rarity cap | Nothing above rare |
| Engravings off | Raw stats only |
| Twist | All units +2 Initiative / healing halved |

**No tier cap in regular tourneys.** It locks veterans out of their own roster.
Tier caps belong to the **newcomer tourney** only.

### Announce tomorrow today

Tomorrow's tourney **rules and top prize engraving** are visible today.
Players go to bed planning their roster. This is the "return later" hook.

### Scoring and rewards

- Points per battle (e.g. win 3, loss 1 if the battle is played out, 0 for a forfeit).
- Tiebreakers: fewer units lost, then earlier finish time.
- **All participants:** currency scaled by results.
- **Top places:** the announced pre-made engraving(s).
- **Bots never take a podium place.** A bot win still counts for the human who beat
  it, but bots are left out of the final ranking.
- **Faction season score:** tourney wins add to the player's faction standing.

### Newcomer tourney (later, with 2–3 tourneys per day)

- Tier cap plus one extra constraint, tailored so new players can place and earn.
- Entry limited by account progress, so veterans can't farm it.

### Wiring notes

- Tourney definitions: start / end time, rules, prizes, state
  (announced → open → closed → paid out).
- Per-player entry: battles used, points, tiebreak values.
- Rules are validated **on the server** when a formation is queued, and the same
  rule set is handed to the bot builder.
- Payout runs once when the tourney closes, then marks it paid.

---

## Invites and sharing

Not built. Agreed 2026-09-19.

Every player gets a **share code** and a **Copy invite link** button, in settings
directly under the promo code section. Telegram is the whole distribution channel, so
a link a player can paste into a chat is the cheapest growth there is — and it gives
the "play with friends" pull the Colossus and the tourney assume.

### The invited player gets, on sign-up

- 3 Health Potions
- 1 spell tome
- 50 gold
- 20 of every crystal

### The inviter is paid over time, not at once

| When | Reward |
|---|---|
| The invited player signs up | 1 Tome of Experience |
| Their first battle is finished | 50 gold |
| Each daily set they complete | 5 crystals |

The third line is the interesting one: it pays the inviter **every day their friend
plays**, so an invite is worth something for as long as the friend stays. It also
gives the inviter a reason to care whether their friend is still playing — the closest
thing to a social loop before guilds exist.

### Open questions

- Is the daily payout capped (per day, per invitee, or in total), and does it stop
  after some number of days? Without a cap, a player with many invitees earns crystals
  passively forever.
- Which crystal: the inviter's faction crystal, or the invitee's?
- Is there a limit on how many invites one player can be paid for?
- Self-invites and throwaway accounts: rewards land only when the invitee actually
  finishes a battle or a daily, which raises the cost of faking, but a cap on the
  sign-up reward may still be needed.
- Does the invited player have to enter the code, or does the Telegram deep link carry
  it (`?start=<code>`) so nothing is typed?

### Wiring notes

- A `share_code` per player, and an `invited_by` on the invitee.
- Payouts are events, not a total: sign-up, first battle finished, each daily claimed.
  Each needs its own idempotency, the way `/daily/claim` marks before paying.
- The daily hook belongs next to the existing daily claim, which already runs once per
  player per day.

---

## Parked: Daily Omen

One fixed enemy formation per day, same for everyone, unlimited retries, best result
counts, shareable Telegram card. Cheap to build and reuses the rule pool.
Parked because Colossus + Tourney are enough for the next 1–2 weeks of testing.

---

## Daily tasks

The daily set grows with the hero (`min_hero_tier` in `data/daily_tasks.js`):

| Hero tier | Tasks |
|---|---|
| 1 | Fight 3 battles · Send an errand · Cast a spell at 3+ power |
| 2+ | + Fight the Colossus (one attempt, any damage) |
| 3+ | + Fight a quick match (human or bot, win or lose) |

Counted when the battle's result is claimed. A player who concedes a duel does not count it.

---

## Build order

1. **PvP bots.** Unranked stops being dead. The bot army builder takes a rule set
   from the start.
2. **Faction Colossus.** Needs a full week live to see a real result, so it goes in
   early. Includes the Colossus screen.
3. **Engravings.** The currency sink. Without it, tourney rewards have nothing to buy.
4. **Crown Tourney.** One evening tourney per day, 5 battles, bots as fallback.

Each step is a series of small tasks, deployed and tested before the next begins.

## Open questions

- Currency name (EN + RU) and the Russian name for Engravings.
- Engraving negative rule: paired pools or weights.
- Colossus reset day/time and tourney start time (timezone: testers' evening).
- Colossus boss: new unit or scaled existing one; what each phase changes.
- Do bot wins pay the same XP as human wins long-term?
