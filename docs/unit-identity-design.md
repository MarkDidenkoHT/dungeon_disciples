# Unit Identity — Design

Status: **draft for discussion, nothing built.** Last updated 2026-10-02.
Companion docs: [daily-activities-design.md](daily-activities-design.md) — where the deeds
come from, and what Engravings already do to a unit.
[bark-style-guide.md](bark-style-guide.md) — the voice an epithet has to survive.

## Why

A unit is a row in a table that happens to have art. Two players with the same faction,
the same branch and the same items own the *same* Blade Master, and nothing a player does
to a unit is a choice — the tree decides, the building decides, the XP decides.

Three problems, one system:

1. **Units have no identity.** Interchangeable with the same unit in anyone else's
   roster, so losing one costs nothing but ⚔.
2. **A maxed unit is finished.** At the end of its branch XP keeps arriving and goes
   nowhere. The unit the player invested most in is the one the game stops talking about.
3. **Gold dies when it peaks.** Every gold sink but engraving is one-time, and engraving
   is gated on tourney tokens — a player who skips the evening tourney has no gold sink.

Guiding rules:

- **Earned, not typed.** A name the player invents says nothing about the unit; a title
  the unit won says everything.
- **Deeds are the game you already play.** Errands, embarks, litanies, the Colossus, the
  tourney. A new *record* of the existing game, not a new grind.
- **Never a second engraving.** Engravings own per-unit stat shopping. This owns identity
  and the gold drain.
- **Losing a unit must hurt.** Dismissal refunds nothing. The record, the deeds, the
  epithets and every oath are gone with the unit, and so is the gold.

---

## 1. The Chronicle

Every screen is a sliding track of three pages, except the castle, which has two —
`castle-layer` 1 (Castle) and 2 (Upgrades) in
[public/screens/castle.js](../public/screens/castle.js). The left page is where the other
screens keep their long-term system: engraving is the items screen's left page, litanies
the spell tome's, the Colossus embark's. **The Chronicle is the castle's left page** — a
new `data-layer` at the head of the track, and the last free page in the app.

The gate follows the house pattern (crafting is Blacksmith 1, engraving is Blacksmith 2,
litanies are Proving Grounds 3):

| Level | Opens |
|---|---|
| **Training Grounds 1** | The Chronicle; callings; deeds |
| **Training Grounds 2** | Names and epithets |
| **Training Grounds 3** *(new level)* | Oaths |

The Training Grounds is the thinnest building in the castle — two levels for +3% then +5%
embark XP ([data/buildings.js](../data/buildings.js)) — so it is the right fiction and a
building that needs a second job. `BUILDING_MAX_LEVELS.training_grounds` goes 2 → 3, and
the third level keeps raising embark XP too, so it is never bought for one feature.

**The screen** is the roster as a book: one line per unit — portrait, name and worn
epithet, calling, five deed pips, oath count. Tapping a unit opens its page: the calling
track with the next deed's counter (`2 / 3 errands`), the epithets it has earned, the oath
ladder with the next price, and the plain record — battles, kills, embarks, errands,
litanies, days in service. The record is cheap to keep and it is most of the identity: a
player reads "41 battles, 9 kills, 112 days" and the unit stops being a row.

---

## 2. Callings and deeds

Each unit is offered **two callings** and keeps one. They are not roles — they are the
faction's two answers to the same question, so the names are the faction's own:

| Faction | Callings | What each is about |
|---|---|---|
| **Empire** | **Vigil** / **Crusade** | holding the line · carrying it forward |
| **Grail of Sorrow** | **Acceptance** / **Denial** | paying the price · refusing to |
| **Choir of the Cursed** | **Descant** / **Hunger** | your voice above the song · power taken from others |

Every unit in a faction sees the same two, so there is no profile detection and no unit
left with a track it cannot fill. The calling is the first decision in the game that is
the player's about a unit rather than the tree's, and it decides four things: which deeds
rungs 1, 3 and 5 ask for, which stats the unit may raise, which passive the capstone
can hand it, and **which litany cells the unit can stand in**.

**Litanies read the calling.** A litany's chorus cells no longer name unit ids - they
name a calling, and the unit standing there has to have it
([combat-barks-design.md](combat-barks-design.md) §5, "A chorus cell names a CALLING").
That is the calling's first visible, in-battle payoff and the reason it is a tactical
choice rather than only a stat track: a *Vigil* and a *Crusade* in the right squares are
what stages the execution. It also cuts 298 hardcoded ids out of
[data/litanies.js](../data/litanies.js).

**Partly built already.** The callings themselves, the storage and the litany half are
in: [data/callings.js](../data/callings.js), `roster.calling` jsonb, and
[sql/backfill_callings.sql](../sql/backfill_callings.sql) to seed every existing unit.
The Chronicle screen, the rungs, the deeds and everything in §3 and §4 below are not.

| Faction | callings | ids | `pays` in a litany |
|---|---|---|---|
| Empire | Vigil · Бдение / Crusade · Поход | `vigil` `crusade` | ally / enemy |
| Grail of Sorrow | Denial · Отрицание / Acceptance · Смирение | `denial` `acceptance` | ally / enemy |
| Choir of the Cursed | Descant · Дискант / Hunger · Голод | `descant` `hunger` | ally / enemy |

The Russian is not a translation where a translation reads wrong, the same rule
`RITE_TERMS` follows: "Крестовый поход" is the literal Crusade and is too long for a
chip on a phone, so the calling is "Поход" - the march, the thing carried forward.

`pays` is which side of a litany's reward that calling's cell accounts for. The Grail's
**Acceptance** is the enemy-facing one of its pair, which reads backwards until you hold
the fiction: the Grail's violence is bought with its own blood, so *paying the price* is
the aggressive calling and *Denial* - refusing that the loss happened - is the one that
heals and wards.

Bot templates carry a `calling` per slot, so the enemy side stages litanies the same
way; a slot that names none gets one derived from its unit id, stably, so a template
fields the same army every time it is drawn.

**Where a calling is picked is the TEMPLE, not the Chronicle.** The two systems read the
same `roster.calling` field and share nothing else: the Training Grounds teaches a squad
to sing (litanies, rungs, epithets, everything else in this doc), the Temple decides what
a unit *is*. The Temple is the castle's **left page** — a grid of one row per unit and one
column per Temple level, every column drawn from the first visit and the ones the Temple
has not reached yet disabled.

| Temple level | Block |
|---|---|
| **1** | the portrait — tap to change the calling, and its border carries the calling's colour. No stats; what it buys is the choice |
| **2** | finish 3 errands — or, for the hero, **cast 10 spells**: a hero never leaves on an errand, so the ordinary rung is one it could never reach |
| **3** | deal, heal or shield 500 — damage, healing and shields pooled, so every unit can fill it by doing its own job |
| **4** | stand in 3 litanies |
| **5** | **the oath** — gold for a permanent point of HP, for a unit at the end of its branch. 1000, then 1500, then 2000, with no ceiling |

**The blocks are a chain, not four open tasks.** A block only becomes workable once
every deed block before it is finished, so a unit walks 2 → 3 → 4 → 5 in order and the
page always shows exactly one thing to get on with.

**A deed only counts while its block is the live one.** Damage dealt by a unit still
working on its errands is not banked against a block that has not opened — it is
dropped. Without that, a unit with a battle record behind it clears three blocks the
instant the first one lands and the Temple stops being a reason to go and do the
thing it is asking for. Enforced in `bumpDevotion` ([routes/index.js](../routes/index.js)),
which resolves the live block before it writes.

**Levelling up wipes the deeds and the unit walks the chain again.** That is the
point of the whole system: the deeds are errands, then fighting, then litanies, so a
unit that keeps advancing keeps being sent back round every corner of the game. What
survives a reset is what was *bought* — `oaths` (it sets the next price) and `bonus`
(HP that gold already paid for). Applied on both the manual endpoint and
`applyAutoLevelUps`, which is where most level-ups actually happen.

Blocks 2–4 pay nothing yet; they count. Only the oath grants a stat, and the stat
is stored (`devotion.bonus`) rather than recomputed from the count, so raising the
reward later never rewrites what earlier oaths bought.

Counters live in `roster.devotion` jsonb ([sql/010_temple_devotion.sql](../sql/010_temple_devotion.sql)),
are added inside the database, and are lifetime — nothing resets them. The deed
counter is credited per unit by the battle engine (`creditDeed`); the errand
counter is credited when the player is shown a finished errand, because the edge
function that *finishes* one lives outside this repo and that acknowledgement is
the only moment this service owns exactly once.

A unit is **born with a calling**, assigned at random from its faction's two at each of the
three roster insert sites (`newCallingFor`, [data/callings.js](../data/callings.js)), so no
row is ever without one and a litany cell always has something to match. The Temple sells
the *correction*.

Changing a calling costs **100 gold**. Not the 500 this doc first asked for: the first
change a player ever wants is to a calling they did not pick, and a wall in front of that
is a wall in front of the system. Once the rungs below exist a change **resets every rung**
— that reset is what makes the choice a choice, and it lands with them rather than before
them.

### The five rungs

Rungs 2 and 4 are the same for every unit and every calling, because the point is that a
unit's record is a record of the whole game — a unit that has never left the castle and
never stood in a litany has not earned a track:

| Rung | Asked of | Example |
|---|---|---|
| 1 | the calling | *Denial*: prevent or restore 500 HP · *Acceptance*: lose 500 HP of your own |
| **2** | **every unit** | **finish 3 errands** |
| 3 | the calling | *Vigil*: survive 15 battles · *Crusade*: 15 kills |
| **4** | **every unit** | **be in the squad for 3 litanies** |
| 5 | the calling, **end of branch only** | *Descant*: 5 tourney battles · *Hunger*: 10 killing blows on a foe already below half HP |

Rungs 1–4 each pay **one point**, in a stat the calling allows, on the same scale
engravings use ([data/engravings.js](../data/engravings.js): 1 point = 1 Initiative,
1 Power, 2 HP, 2 Armor, 2 Resist). Four points over a few weeks with no negative to pay —
about a rare engraving's worth, earned instead of bought, stacking with the engraving
rather than replacing it.

**Rung 5 pays a passive at rank 1**, and only a unit at the end of its branch can claim
it. Each calling names a short list of keys from
[data/unit_abilities.js](../data/unit_abilities.js), chosen to add a habit rather than a
number — *Vigil* offers `shield 1`, *Crusade* `execute 1`. Rank 1 and a fixed list,
because the engine already honours these keys with no new work, and because "any passive
at any rank" is a different, much larger design.

Counters are lifetime and never reset. **Everything counts in bot battles** — a bot battle
is a battle, and a system that audits where the fight came from is a system that argues
with the player about their own record.

**The litany rung counts the squad, not the role.** Litany roles are hardcoded id lists
([data/litanies.js](../data/litanies.js)), so most units can never be a lead or a
chorister; a rung keyed to performing one would be unreachable for them. Standing on the
board when the litany fires is the deed, and it still means the player built a squad that
could sing.

---

## 3. Names and epithets

The question was names, named barks, renaming, or a personalisation item.

**A curated given name plus an earned epithet. No free text.** Free text looks like the
cheapest option and is the most expensive one: every unit name is a pair (`name`,
`name_ru`), barks are written to be spoken *by* a named character, the battle log and the
bark toast print the name at `0.6rem` inside a cell, and a free field needs moderation in
two languages inside Telegram. The player gets the feeling of naming with none of that.

- **Given name.** ~40 period-correct names per faction, EN + RU pairs, in
  `data/unit_names.js`. The player picks from the pool or rolls. It replaces the type name
  in the roster, the Chronicle and the battle log; the type name stays as the subtitle, so
  nobody loses track of what the unit is: **Halvard**, Blade Master. First name free, each
  later rename 200 gold.
- **Name-pool direction.** Every unit definition has a `sex` (`male` or `female`)
  presentation, shared by its evolution line and persisted in `unit_data` at creation;
  login sync backfills it for existing roster entries. Given names are sex-specific.
  The second part is a faction-flavored fantasy byname or epithet, localized for a strong
  Russian fantasy sound rather than translated literally or reshaped as a Slavic surname.
  The following is the current
  shortlist for discussion, not an implementation-ready complete pool:

  | Faction | Male given names | Female given names |
  |---|---|---|
  | **Empire** | Aurelius — Аурилей; Valerius — Валерий; Lucius — Люций; Hadrian — Адриан; Cassian — Кассиан | Aurelia — Аурелия; Valeria — Валерия; Justina — Юстина; Octavia — Октавия; Elisia — Элизия |
  | **Grail of Sorrow** | Corvin — Корвин; Vesper — Веспер; Malakor — Малакор; Iskar — Искар; Odran — Одран | Isolde — Изольда; Vespera — Веспера; Nereza — Нереза; Caldra — Калдра; Morwen — Морвен |
  | **Choir of the Cursed** | Vael — Ваэль; Nerion — Нерион; Sythran — Ситран; Thamiel — Тамиэль; Xavren — Заврен | Vaelira — Ваэлира; Seraphine — Серафина; Nythra — Нитра; Khariel — Кариэль; Orissa — Орисса |

  | Faction | English bynames / epithets | Russian forms |
  |---|---|---|
  | **Empire** | Sunborne; Lightbringer; Ironheart; Dawnshield; Oathkeeper | Солнцерождённый / Солнцерождённая; Светоносный / Светоносная; Железносердный / Железносердная; Рассветный Щит / Щит Рассвета; Хранитель Клятвы / Хранительница Клятвы |
  | **Grail of Sorrow** | Soulreaper; Bloodthirst; Ashbringer; Gravewarden; Shadowstalker | Жнец Душ / Жница Душ; Кровожадный / Кровожадная; Пеплоносец / Пеплоносица; Страж Могилы / Стражница Могилы; Теневой Охотник / Теневая Охотница |
  | **Choir of the Cursed** | Blackcantor; Hollowvoice; Razorchant; Soul-Eater; Voice of the Abyss | Чёрный Певчий / Чёрная Певчая; Пустоголосый / Пустоголосая; Певец Клинков / Певица Клинков; Пожиратель Душ / Пожирательница Душ; Глас Бездны |

  Russian forms should agree with the character's sex where the epithet is gendered.
  Constructions such as Глас Бездны can remain invariant.
- **Epithet.** Earned, never bought. A rung, a tourney podium, a Colossus kill, an errand
  career, an oath count each award one — *the Thrice-Sent*, *Ashen-Handed*, *Who Held the
  Gate*. A unit wears one; swapping which is free. The collection is the record, the worn
  one is the presentation.
- **Named barks.** The cheap, high-value tie-in. A worn epithet adds one key
  (`epithet:<id>`) to the unit's set, resolved above the character's own lines in
  `checkBark` — one or two lines per epithet in the faction's voice. ~20 epithets × 2 lines
  is a day of writing, and it is the moment the system pays off: the unit that held the
  gate says so, in its own words, once in a while.

---

## 4. Oaths — the paragon

A unit at the end of its branch keeps earning XP that currently vanishes. An **oath** is
what that XP buys once there is nothing left to evolve into. The hero is included — the
throne ladder ends at `HERO_MAX_LEVEL` and a hero standing there is exactly a unit with no
branch left.

An oath costs two things:

- **The unit's own XP bar, filled again.** Not a flat number — the `xp` on the unit's own
  definition in [data/units.js](../data/units.js), which is what that unit has always cost
  to advance. A branch end runs from ~3,095 to 8,200, so a Black Castellan's oath is 3,095
  XP and a hero's is 8,200. The unit that was expensive to raise stays expensive to
  deepen, no new number is invented, and the bar the player already watches keeps meaning
  something after the tree ends.
- **Gold, rising 30% a step**, rounded to ten:

| Oath | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Gold | 300 | 390 | 510 | 660 | 860 | 1120 | 1450 | 1890 | 2450 | 3190 |

Ten oaths on one unit is ~12,800 gold; step 15 is 11,800 and step 20 is 44,000. There is
**no cap** — the price is the brake. A hard cap ends the sink; a geometric price ends it
per unit, at a point each player finds for themselves, and the player who wants a famous
unit can always pay more for it.

Each oath pays **one point** in a stat the calling allows — the calling is what stops a
*Denial* unit buying ten points of Power. The player picks each time, so the ladder is a
shape they are building, not a multiplier.

An oath has no negative, so it is not an engraving; it is bought with gold and XP, so it
never competes for Valor or tokens; it cannot touch a passive, so it cannot break the tree.

---

## Wiring notes

- **Storage.** A new table, `unit_record`, keyed by `roster_id` — *not* `unit_data`.
  `makeUnitData` ([routes/index.js](../routes/index.js)) rebuilds `unit_data` from scratch
  on every level-up, which is the exact moment a record must survive. Columns: calling,
  counters (jsonb), rungs claimed, epithets earned and worn, given name, oaths (jsonb list
  of stat picks). `on delete cascade` from `roster` — that cascade *is* the no-refund rule.
- **Counters need a per-unit tally.** The engine keeps `this.tally` per *side* — `kills`,
  `kills:<tag>`, damage by school
  ([utils/battle-engine.js](../utils/battle-engine.js)). Extend it with a
  `byUnit[rosterId]` branch rather than adding a second counting system, and sum it where
  the battle reward is claimed, beside the daily-task ticks. Errands, litanies fired and
  Colossus attempts already know which roster ids were involved.
- **Applying the bonuses.** Deed and oath points are the same kind of stat modifier
  `applyEngraving` / `applyItemModifiers` already produce: one new
  `applyUnitRecord(base, record)`, called everywhere `applyEngraving` is called, in a
  fixed order (base → engraving → record → item), with `STAT_MOD_FLOORS` still applying.
  Missing one call site is the classic bug here — prep shows one number, the battle uses
  another.
- **Rung 5's passive** is appended to the unit's passive list, so `nativePassiveKeys` and
  the expedition-bonus loop pick it up free. Refuse the claim if the unit already has that
  passive at an equal or higher rank, rather than wasting it silently.
- **Power must count it.** `rosterUnitPower` ([utils/army-power.js](../utils/army-power.js))
  counts the engraving; it must count the record too, or a ten-oath roster queues as a
  cheap one and the PvP bands lie. Re-run `scripts/check-bot-templates.js` in the same
  deploy — the templates are written against ⚔ bands.
- **i18n.** Callings, deed text, given names and epithets all need `_ru`; the epithet barks
  need the style guide's RU rules, not a translation.

## Open questions

- **Is the oath point too strong?** Ten points is a tier's worth of stats. Options: every
  second oath pays only an epithet step; or points are granted in pairs and count half; or
  the ladder steepens to 1.4×.
- **Do mercenaries get a record?** They are bought rather than raised, and rebuyable.
- **Calling versus a changing profile.** A unit's action can change on evolution. Both
  callings are open to every unit, so nothing breaks — but a *Crusade* medic is a player
  mistake the system will happily let them pay 500 gold to undo. Fine, or warn?
- **How many epithets, and who writes them?** Start at ~20 and let the counters that
  already exist name them.
