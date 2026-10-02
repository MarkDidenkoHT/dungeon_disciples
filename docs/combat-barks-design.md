# Combat Barks v2 — Design

Status: **draft for agreement, nothing built.** Last updated 2026-09-17.
Companion doc: [bark-style-guide.md](bark-style-guide.md) — what the lines say. This doc is how they are chosen.

## Why

The current system ([data/combat_barks.js](../data/combat_barks.js), matcher in
`BattleEngine.checkBark()`) is a global pool of 79 rules scored by specificity
(`+100` name, `+3` faction, `+2` per tag). Every rule tied at the top score is pooled
and one line is picked at random. It works, and it produces two defects by design:

1. **Lines that make no sense for the speaker.** Pooling. A Mithrails Exemplar and an
   Acolyte both score `faction e + Holy = 5` and draw from one pot, so the zealot
   says the medic's line. More rules widen more tie-pools; the problem grows with content.
2. **Lines that don't match the action.** Four triggers (`attack`, `kill`, `death`,
   `heal_low_hp`) cover 12 action types. `holy_shock`, `song_of_ash`, a spear and a
   bite all emit `attack`, so the bark cannot know what the unit did.

v2 replaces actor-filter × target-filter rules with **bark sets owned by characters**,
plus a **litany** layer for multi-speaker moments owned by a formation.

Guiding rules:

- A unit only ever speaks lines written for it. No pooling across characters.
- The most specific line that fits the moment wins, deterministically.
- Silence is a valid outcome. A bad line is worse than no line.
- Litanies are rare events, not ambience.

---

## 1. Data model

One file, `data/combat_barks.js` (decided). It exports:

| Export | What it is |
|---|---|
| `BARK_SETS` | Per-character sets, keyed by unit ids |
| `BARK_FLOOR` | Small generic sets per faction × tag — the safety net |
| `LITANIES` | *Moved out.* Litanies are mechanical, not cosmetic, and shipped first — they live in [data/litanies.js](../data/litanies.js) (built 2026-09-17) |

### 1.1 Bark sets

A set names the unit ids that share a voice — normally a branch of one upgrade tree:

```js
{
  ids: ['e21', 'e211', 'e2111'],          // Templar → Mithrails Champion → Exemplar
  voice: 'Templar line: zealous protectors, purge and burn',
  on_kill:          [['It is unmade.',                 'Оно развоплощено.']],
  on_kill_demon:    [['The song ends here.',            'Здесь песня и кончится.']],
  on_action_enemy:  [['Hold. Strike. Hold.',            'Стоять. Бить. Стоять.']],
  on_death:         [['The line closes over me.',       'Строй сомкнётся надо мной.']],
  synergy_ally_kill_demon: [['Burn what is left.',      'Сожгите остальное.']],
}
```

**Lines are `[en, ru]` pairs.** The current file keeps `lines` and `lines_ru` as
parallel arrays and has to pad Russian to keep indexes aligned. A pair makes drift
structurally impossible, and a missing translation is a visible `['…']` of length 1
that the validator rejects.

**1 or 2 pairs per key.** One is the default. Two only when the trigger fires often
enough in one battle (`on_action_enemy`) that a repeat would be noticed.

**Overrides.** An id may appear in more than one set. Per key, the set listing
**fewer** ids wins. That is how a tier gets its own line without forking the branch:

```js
{ ids: ['e21', 'e211', 'e2111'], on_death: [[/* shared */]], on_kill: [[/* shared */]] },
{ ids: ['e2111'],                on_death: [[/* Exemplar only */]] },  // on_kill still shared
```

Two sets with the same id count that both define the same key for one unit is a
validator error, not a tie to pool.

> Why `ids: [...]` instead of a `'e21,e211,e2111': {}` object key: the validator can
> check each id exists in units.js and name the bad one, and the ids stay greppable.

### 1.2 Key grammar

```
on_<trigger>[_<qualifier>]
synergy_ally_<trigger>[_<qualifier>]
```

- `<trigger>` — from the table in §2.
- `<qualifier>` — lowercase **tag** (`demon`, `zombie`, `holy` …) or **faction**
  (`empire`, `grail`, `choir`). Tags are the 13 that exist in units.js; anything else
  is a validator error, because today a misspelt tag silently never matches.
- For `death`, the qualifier describes the **killer**. For everything else, the **target**.

### 1.3 Floor

`BARK_FLOOR` uses the same set shape keyed by `{ faction, tag }` instead of ids. It
covers the 44 enemy-pool units and any unit not yet authored, so a new unit ships
speaking. It is deliberately thin — roughly the size of today's file — and is the only
place tag-matching survives.

---

## 2. Triggers

| Trigger | Fires when | Speaker | Engine hook |
|---|---|---|---|
| `action_enemy` | Actor's action lands on an enemy and does not kill | actor | exists (`attack`) |
| `kill` | Actor's action kills | actor | exists |
| `death` | Unit dies. Qualifier = killer | the dead | exists |
| `action_ally` | Actor heals / shields / buffs an ally | actor | new (today only low-HP heals) |
| `heal_low` | `action_ally` on an ally below 25% HP | actor | exists (`heal_low_hp`) |
| `ability` | Actor's signature ability fires | actor | new |
| `low_hp` | Unit crosses below 25% HP (once) | the hurt | new |
| `ally_death` | An ally dies. Qualifier = the dead ally | one witness | new |
| `last_standing` | Unit becomes the last alive on its side | the survivor | new |
| `battle_start` | First turn of the battle | one unit per side | new |

`heal_low` falls back to `action_ally`; `ability` falls back to `action_enemy` /
`action_ally` by target type. A unit with no `ability` lines still speaks when it
uses its ability, just less precisely.

### 2.1 Synergy (single witness)

`synergy_ally_<trigger>[_qualifier]` lives in the **witness's** set: "when an ally of
mine does X, I say Y". On an event, the engine offers the reaction to allies of the
actor (never the actor) that have a matching key — adjacent units first — and at most
one speaks.

---

## 3. Resolution

For one speaker and one event:

```
keys = [ on_kill_<tag> for each target tag, in TAG_PRIORITY order ]
     + [ on_kill_<target faction> ]
     + [ on_kill ]
for key in keys:
    for set in sets containing speaker.id, fewest ids first:
        if set has key → pick one pair at random, done
for key in keys:
    if BARK_FLOOR[faction][tag] has key → done
silent
```

**Specificity wins over closeness.** A shared-branch `on_kill_demon` beats a
tier-only `on_kill`: fitting the moment matters more than which tier's set holds it.

**Tag ties are ordered, not random.** A target with `Caster` and `Zombie` resolves in
one global order, so an author can predict what a unit will say:

```
TAG_PRIORITY = Demon, Vampire, Zombie, Skeleton, Spirit, Construct,
               Holy, Court, Knight, Warrior, Engineer, Archer, Caster
```

(Most-defining first. `Caster` is last because 137 units carry it — it describes a
role, not a creature.)

---

## 4. Frequency

Kept from v1: speak chance **decays per unit, per trigger, per battle** (`BARK_CHANCES`).
Added:

- **Event budget.** One action produces at most **two** barks: the actor's, plus one of
  (victim's `death`, a witness's `synergy_*`). `death` wins that slot — last words
  outrank commentary.
- **Litany replaces everything** for that action (§5): no actor bark, no victim
  `death`, no witness `synergy_*`.
- `battle_start`, `low_hp`, `last_standing` fire at most once per unit per battle.

---

## 5. Litanies

Revised 2026-09-27. **18 litanies are built - two per hero, six per faction** — [data/litanies.js](../data/litanies.js),
`fireLitany` / `applyLitanyReward` in [utils/battle-engine.js](../utils/battle-engine.js),
playback in [public/screens/battle.js](../public/screens/battle.js). The rest of this
document is still design. A litany is **not** a reaction to a kill. It is a **staged
execution**: the killing blow is held back, two chorus members strike first for show,
and the lead lands the real blow on the last verse. It fires only when the formation
the litany describes is actually standing on the board, and it pays out a mechanical
reward — so it teaches positioning instead of only decorating it.

Each of the nine heroes has exactly two, all of them pure data in
[data/litanies.js](../data/litanies.js) — the engine and the tome page carry no
per-litany code, and each hero's pair is mutually exclusive by formation. **One
litany is one whole object**: its lead ids, every cell, its verses and its reward are
written out inside it and shared with nothing, so editing one cannot affect another.
The **target is the one exception** — `LITANY_TARGETS`, a single list shared by all
eighteen. Everything but the original `profane_chorus`
carries placeholder verses; the lines are written separately.

Three things the first three litanies got wrong, fixed by the shape below:

- **A formation is a list of cells, not a column.** Each cell names its own row AND
  column (`front` / `back`, relative to the acting side), so a litany can stand its
  lead on the line and its singers behind it. One front column for all three cells is
  what put a back-rank priest in the melee rank.
- **A cell is as big as the unit in it.** `size` is `tile`, `row` (both columns of its
  row) or `column` (its row and the one below, so `row` is the top of the two). A
  two-cell unit is one speaker standing in two places - a Golden Lion, a Chorister, a
  Gargoyle - and nine of the eighteen litanies are built around one. Cells are matched
  against an occupant's WHOLE footprint, so a `column` unit cannot answer for a `tile`
  cell and a square a large unit half-covers is not filled.
- **The lead is whoever lands the blow, not always the hero.** A unit whose action
  targets an ally cannot kill, and two heroes are in that position: the Artificer
  repairs and the Choir Regent's song is a heal. Both sing from a chorus cell while
  something of theirs leads - the Artificer's Sentinel line and Siege line, the
  Regent's Choristers and Imps. A lead list of healers is a litany that can never
  fire.
- **A verse is what its speaker actually does.** `strike: 'visual'` is a fighter's blow
  at the victim; `strike: 'support'` is a healer's, shielder's or singer's own rite,
  performed over its own side. Playing a priest's `holy_heal` at the corpse read as
  blessing the body.
- **The reward is what the chorus did**, one field per singing cell: a heal action pays
  `ally_heal_flat`, a shield action `ally_shield_flat`, a decay action
  `enemy_decay_flat`, an attacker `enemy_damage_flat` or a stagger field. The single
  `initiative_flat_reduction` is now the vocabulary in 5.4.

A unit with no `action_animation` cannot perform - its verse would be a silent beat -
which is why the Blessed Soul line (`e7...`, `action: 'none'`), the Grail Acolytes
(`gs5...`) and the Mother's Chalice line (`gs83...`) appear in no litany.

The tome shows a player only the litanies their own faction can LEAD, so each faction
sees six cards. The **target is drawn once** for the page, between the header and the
cards, because it is one list for all of them - a Target section on each card was the
same twelve faces six times over, and read as if each litany had a quarrel of its own.
The ninety ids come out as twelve portraits: the page dedupes by name, so a reader sees
the nine hero lines and the three bosses rather than every tier of each.

**Each faction calls the rite by its own name.** A litany is the Empire's word; the
Grail of Sorrow sings **dirges** (Панихиды) and the Choir of the Cursed **chants**
(Распевы). This is wording only — `litany` stays the name in the data, the engine and
the log entry type. `RITE_TERMS` in [public/screens/spell_tome.js](../public/screens/spell_tome.js)
holds the term per faction, in both languages and in the Russian forms the sentences
need, and the Proving Grounds' own description says the faction's word too
([data/buildings.js](../data/buildings.js), one copy per faction pool).

### A chorus cell names a CALLING, not units

**Built 2026-10-02.** [data/callings.js](../data/callings.js) holds the six;
`litanySpeakers` in [utils/battle-engine.js](../utils/battle-engine.js) matches them;
`roster.calling` carries them, seeded by
[sql/backfill_callings.sql](../sql/backfill_callings.sql).

**Only the id list goes.** Everything else about a cell is untouched: `key`, `row`,
`col`, `size`, `role`. A formation is still a list of PLACES on the acting side's own
half of the board, still matched against an occupant's whole footprint, and a hero's two
litanies are still kept apart by where their cells sit. The `ids` array is replaced by
one word.

```js
// before — five ids, hand-picked, repeated across up to six litanies
{ key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus',
  ids: ['e21', 'e211', 'e2111', 'e212', 'e2121'] },

// after
{ key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'crusade' },
```

Why:

- **298 id references** across the eighteen (157 chorus, 141 lead) become nine hero
  lines and 36 calling words. `data/litanies.js` goes from 991 lines to ~300.
- **A new unit is eligible the day it ships.** Today adding one means finding every
  chorus array it belongs in and editing each.
- **The verses become writable.** A chorus line currently has to sound right out of a
  Templar *and* a Mithrail Knight *and* a Paragon, in two languages. That five-way
  compromise is why seventeen of the eighteen still carry placeholder verses. "A
  Crusade" is one voice — three characters per faction (the hero and its two callings)
  instead of a negotiation with an id list.
- **Filling a litany becomes a decision instead of a recruitment lottery.** A calling is
  assigned per unit and costs 500 gold to change
  ([unit-identity-design.md](unit-identity-design.md) §2), so the cell asks the player to
  commit a unit rather than to happen to own a particular one.

**A calling is not a tag.** §5.1 argues against filtering by tag and that argument
stands — a tag is an authored property the player cannot touch, which is why the Choir
Regent carries no `Demon` and is still a heretic. A calling is the opposite: the first
per-unit decision the game hands the player, paid for, resettable, already recorded. A
cell naming one is an instruction *to the player*, which is what a formation is for.

**The callings, per faction** — from [unit-identity-design.md](unit-identity-design.md) §2:

| Faction | callings | ids |
|---|---|---|
| Empire | Vigil · Crusade | `vigil` `crusade` |
| Grail of Sorrow | Acceptance · Denial | `acceptance` `denial` |
| Choir of the Cursed | Descant · Hunger | `descant` `hunger` |

A litany only ever names a calling of the faction that leads it, so a cell's calling and
its litany's hero line cannot disagree — one validator rule, replacing the per-id checks.

**Where the calling comes from.** `roster.calling` jsonb, shaped `{"id": "vigil"}` — the
same flat shape `engraving` uses, with room for the rungs and counters
[unit-identity-design.md](unit-identity-design.md) adds later. It rides on the roster
ROW rather than inside `unit_data`, because `makeUnitData` rebuilds `unit_data` from the
definition on every level-up and would drop it. `buildPlayerUnitFromRosterEntry` passes
it through and `createCombatant` reads it into `_calling`. PvP needs nothing extra — the
other side is built from its owner's roster by the same function.

**Bots have callings too.** A slot may name its own (`{ unit, cell, item_id, hero,
calling }` in [data/bot_templates.js](../data/bot_templates.js)) — that is how a
template is written to field a particular litany — and anything that does not gets one
**derived from its unit id**. Derived rather than rolled, because a template has to
field the same army every time it is drawn, or `checkBotTemplate` and the ⚔ bands would
be measuring something the player never meets. An authored calling that is not one of
its faction's two is a template error, caught by the audit.

**A unit with no calling fills no chorus cell** — that is the whole rule for mercenaries
and for anything the Chronicle has not reached.

**What does not change:**

- **The lead.** `lead.ids` is still the line that lands the blow, and it is still not
  always the hero: the Artificer repairs and the Choir Regent's song is a heal, so four
  of the eighteen give the lead to a construct or a chorister. A calling says nothing
  about whether a unit can kill; the lead list does.

  Those four gained a **third kind of cell**, `role: 'hero'`, matched against the
  litany's own `hero.ids`. Before, the hero sat in a chorus cell with its line written
  into `ids` — which under callings would have let *any* unit with the right calling
  stand where the Artificer is supposed to be singing. Three roles now: `lead` (the
  actor, from `lead.ids`), `hero` (that hero's line), `chorus` (a calling).
- **The target.** `LITANY_TARGETS`, one list, an enemy champion.
- **The positions.** Cells keep their row, column and size, and the board still decides
  which of a hero's two is spoken.
- **Size matching.** A cell is still as big as the unit standing in it, matched against
  the whole footprint. The live consequence is worth saying out loud: a `tile` chorus
  cell cannot be filled by a `column`-sized Vigil, so a player whose only Vigil is a
  Chorister has that cell empty. Today the author hand-picks ids of the right size;
  under callings the engine's footprint match does it at run time and the player feels
  it instead.

**Exclusivity, pair by pair.** Every hero's pair shares at least one square, and one of
three things keeps them apart:

| what separates them | pairs |
|---|---|
| the **lead** stands somewhere else | `iron_sentence`/`last_volley`, `taken_breath`/`ash_antiphon` |
| the shared square wants different **sizes** — a `tile` cell and half of a `row` or `column` unit cannot both be filled | `cinder_verdict`/`winter_sermon`, `first_sorrow`/`pale_procession`, `iron_homily`/`shut_gate`, `kindling_creed`/`seventh_ember` |
| the shared square wants different **callings** | `profane_chorus`/`unbroken_banner`, `clean_passage`/`carried_cup`, `long_wailing`/`mothers_answer` |

Only the third is new, and it is the one to watch when editing: two chorus cells on the
same square of a hero's two litanies must name different callings, or a rich board
satisfies both and `fireLitany` silently takes the earlier one.

**The reward follows the chorus's callings.** "The reward is what the chorus did"
becomes "what the chorus *is*". Each calling carries a `pays` in
[data/callings.js](../data/callings.js):

| pays | callings | fields |
|---|---|---|
| `ally` | Vigil · Denial · Descant | `ally_heal_flat`, `ally_shield_flat` |
| `enemy` | Crusade · Acceptance · Hunger | `enemy_damage_flat`, `enemy_decay_flat`, the stagger fields |

Two cells of one calling put the whole reward on that side; one of each pays both; a
`hero` cell is one of the four healer heroes and pays the ally side like any other rite.
**No reward numbers changed** — the eighteen were assigned callings that match the
rewards they already had, which is why ten of them are one ally cell and one enemy cell
rather than a pair.

The old rule could not survive the change on its own: `strike` and the reward were both
authored against *which unit* would sing, and a chorus cell no longer knows. `strike` is
now **derived at run time** from the occupant — a unit whose action targets an ally
performs its own rite over its own side (`'support'`), everything else swings at the
victim (`'visual'`), and the lethal verse is always the lead's.

**The target is ONE list, `LITANY_TARGETS`, shared by every litany**: an **enemy
champion**. No litany names a target of its own and none may - `fireLitany` reads that
list and nothing else, once, before it looks at a single litany.

It holds every **hero** line of all three playable factions (every tier, both branches)
and every **regional boss** line - Sister Aldra, Malgrath the Undying, Cryodrox. The
heroes are the point; the bosses are in it because a list of enemy heroes alone makes a
litany a drill that can only ever fire in a PvP match, and most hosts would never see
it. A new region's boss belongs in the list, as a whole line, the day it ships. The
Reliquary Titan is deliberately out: the Colossus is its own daily activity rather than
a region's boss.

**Own-faction heroes are in the list on purpose.** A mirror match is two hosts of one
faction, and a Paladin who cuts down another Paladin has still felled a champion.

This replaced a five-slot target list written out on each of the eighteen, which was
one answer - *who is worth the rite* - copied into eighteen places that could drift
apart, and which made a mirror match silently litany-free for no reason a player could
see.

**Unlocked by the Proving Grounds' third level** (`litaniesUnlocked` in
[data/buildings.js](../data/buildings.js)). Levels 1 and 2 of that building raise the
unit tier ceiling; level 3 pays in litanies instead, so `maxUnitTier` is clamped to
tier 4 rather than read straight off the building's level. The gate gives the
**player** side only: an enemy formation that earns a litany stages it whatever the
player has built. It is read once when a battle is created
(`litaniesUnlockedFor` in [routes/index.js](../routes/index.js)), carried in
`battle_data` so a castle raised mid-fight cannot change a fight already under way,
and enforced in `fireLitany`. A battle saved before the gate existed, and any caller
with no castle to read, defaults to unlocked. The spell tome's third page mirrors the
same condition to decide whether it draws the litany locked.

### 5.1 `profane_chorus`

**The lead is a hardcoded id list; the chorus is a calling.** No tags, no factions, no
filters — tags do not describe roles well enough to drive a scripted moment, and the
Choir Regent carries `Caster, Court` and no `Demon` tag while still being a heretic to
be purged. Who may *lead* is an authoring decision made by name, here. Who may *sing* is
the player's decision, made by calling (see "A chorus cell names a CALLING" above). The
sample below is the original, pre-calling shape, kept because it is what the engine
reads today.

```js
// Who may stand in the chorus cells — Templar and both Mithrail branches.
// Under callings this list is deleted and the cells read `calling: 'crusade'`.
const LITANY_CHORUS_IDS = ['e21', 'e211', 'e2111', 'e212', 'e2121'];

// Who may lead — Paladin, every tier of both paths.
const LITANY_LEAD_IDS = ['h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
                         'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212'];

// Whose death triggers it is NOT written here: it is LITANY_TARGETS, one list at the
// top of the file, the same for all eighteen - every hero line of every faction and
// every regional boss line.

{
  id: 'profane_chorus',
  trigger: 'lethal',                 // the lead's attack is ABOUT to kill (§5.2)
  lead:    { ids: LITANY_LEAD_IDS },
  // The formation IS the condition: named CELLS, each with its own letter, row and
  // column. Hardcoded cells, not a count. A verse names its speaker by letter.
  formation: {
    cells: [                         // col: front is col 1 for a player, col 0 for an enemy
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', ids: LITANY_CHORUS_IDS },
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },  // the acting unit
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', ids: LITANY_CHORUS_IDS },
    ],
  },
  verses: [
    { speaker: 'A', strike: 'visual',
      line: ['I am His shield against the talons in the night!',
             'Я Его щит от когтей в ночи!'] },
    { speaker: 'C', strike: 'visual',
      line: ['I am His light that burns the unclean!',
             'Я Его свет испепеляющий нечистых!'] },
    { speaker: 'B', strike: 'lethal',
      line: ['I am His hammer and your end!',
             'Я его Молот и твоя смерть!'] },
  ],
  reward: { enemy_initiative_flat: 10, message: '...', message_ru: '...' },
  once_per: 'battle',
}
```

A litany that mixes ranks and roles looks like this instead - the Unbroken Banner, whose
singers are a priest behind the line and a banner on it, and whose reward is the two of
them doing their own work at once:

```
  A C        A  back  row 0  tile  chorus  Priest line      strike: 'support'  (holy_heal)
  . B        C  front row 0  tile  chorus  Standart Bearer  strike: 'support'  (shield_ward)
  . .        B  front row 1  tile  lead    Paladin          strike: 'lethal'

  reward: { ally_heal_flat: 5, ally_shield_flat: 5 }
```

And one built on a two-cell unit - the Iron Sentence, where the Artificer cannot kill, so
it repairs from the back rank while the Golden Lion it keeps standing does the killing
across two squares of the front column:

```
  A .        A  back  row 0   tile    chorus  Artificer        strike: 'support'  (repair)
  . B        B  front row 1-2 column  lead    Sentinel line    strike: 'lethal'
  C B        C  back  row 2   tile    chorus  Rifleman line    strike: 'visual'   (cannon_shot)

  reward: { ally_heal_flat: 5, enemy_damage_flat: 5 }
```

Adding a unit to a role is editing one of these arrays. Nothing about the unit's tags,
faction or tier is consulted at any point.

Notes on the shape:

- **The lead speaks last.** The killing blow and its verse land together; the two
  chorus verses lead up to it. This inverts the previous draft, where verse 1 belonged
  to the lead.
- **No count, no substitutes, no shorter version.** Three named cells or nothing. The
  single-Templar fallback mentioned in the style guide is dropped.
- **The two chorus cells may hold different Templar tiers**, including two of the same
  unit. Any ids from `LITANY_CHORUS_IDS`.
- **A `row` or `column` unit may hold a cell**, and `size` on the cell says so. On this
  board a `row` unit covers both columns of one row and a `column` unit covers two rows
  of one column (`getFootprint`) - neither covers three, which is what the first draft
  assumed when it ruled the Choristers out. The Grail Angels are back in a litany too,
  as the Pale Procession's `row` cell.
- **A cell must suit the units standing in it.** `pref_position` in
  [data/units.js](../data/units.js) says which rank a unit belongs in, and every chorus
  line is placed to match it. The one deliberate exception is the Standart Bearer line,
  placed in the front column because a banner stands on the line.
- **Two litanies under one lead are kept apart by their formations**: a cell they share
  cannot hold two different units, so the board decides which is spoken. Where their
  cells do not overlap at all, a rich enough board can satisfy both, and `fireLitany`
  takes the earlier one in the array. That is true today of the First Sorrow and the
  Pale Procession - and now on any champion's death, since the two no longer differ in
  who they are staged over.

### 5.2 Firing — the lethal pre-empt

The litany has to be decided **before** the kill is written to the log, because the
chorus strikes precede it. In `executeAction`, once damage is resolved to a final
number and the target is known to be reduced to 0 HP, and before the `action` entry is
pushed:

```
if (lethal && litanyApplies(actor, target)) → emit litany (§5.3)
```

`litanyApplies` is a pure check, in order:

1. `once_per: 'battle'` not yet spent for this litany on this side.
2. Target's unit id ∈ `LITANY_TARGETS` (checked once, for all litanies); actor's unit
   id ∈ this litany's `lead.ids`.
3. Actor stands in the cell the litany marks `role: 'lead'` - that cell's own footprint,
   read against the acting side, matched against the actor's own whole footprint.
4. Every other cell the litany names holds an **alive** unit of its own side whose id is
   in that cell's list and whose footprint is exactly that cell's. No unit answers for
   two cells.

Any failure → nothing happens and the kill resolves normally, with the ordinary
`on_kill` / `on_death` barks. There is no partial litany and no log entry saying one
nearly happened.

**Which actions can trigger it.** The lead's own **action** — for the Paladin, its
attack. Heroes have no abilities; they cast spells, and a spell's damage is applied
side-wide by `castSpell` → `applySpellParams`, where no acting unit is attached to the
kill (utils/battle-engine.js:3414, :3256). A spell kill therefore cannot be attributed
to the Paladin without reworking that path, and is **out of scope**: the litany fires on
the hero's own blow.

Two code sites apply a lethal attack today — `executeAction`
(utils/battle-engine.js:1230) and the per-target helper (:1317). Both get the hook, via
one shared `maybeLitany(actor, target)` rather than a copy in each.

**Both sides.** The check is symmetric: a PvP opponent fielding Paladin + two Templars
in a front column against a demon hero gets the same litany and the same reward. It is
a formation rule, not a player perk.

### 5.3 Emission

The damage is applied once, as normal. The litany changes **how it is told** and adds
the reward. The engine pushes, in order:

| # | Entry | Notes |
|---|---|---|
| 1 | `{ type: 'litany', id, i: 0, n: 3, actorId, actorCell, targetCell, strike: 'visual' \| 'support', text, text_ru }` | first chorus cell, in verse order |
| 2 | same, `i: 1` | second chorus cell |
| 3 | same, `i: 2`, `strike: 'lethal'` | the lead's verse only — the blow is entry 4 |
| 4 | the ordinary `action` entry for the kill (`killed: true`) | unchanged |
| 5 | `{ type: 'notice', litany: id, message, message_ru }` | the reward line (§5.4) |
| — | no `kill` bark, no `death` bark, no `synergy_*` for this action | the litany owns the moment |

A `strike: 'visual'` entry means: play that speaker's `action_animation` and
`action_sfx` at the target's cell, and **nothing else**. **Range is not checked** — a
Templar's mace swing plays on a back-column target just the same. The strikes are
cosmetic flavour; reach is not part of the fiction here.

A `strike: 'support'` entry plays the same animation over the speaker's **own side**
instead: the self-centred effects (`holy_heal`, `shield_ward`, `repair`, `mend_flesh`)
are drawn on the singer's cell, and a fan-out one (`pale_embrace`) is handed its own
side's living cells. A priest, a Standart Bearer or an ash singer performs its rite;
it does not mime a blow it has no animation for.

Either way: no damage, no heal, no `on_hit`, no passives, no triggers, no fatigue, no
`acted_this_round`. The chorus units have not acted; they still take their own turns
this round, and the litany's reward is the only thing that pays out.

### 5.4 The reward

A reward is any mix of the flat fields below, applied once the kill has landed - so
"every enemy" means every enemy **alive after the kill** - and **permanent for the
battle**: no rounds, no expiry, no dispel, never reverted. Units summoned after the
litany are unaffected. `applyLitanyReward` is the whole of what reads them.

| Field | Effect |
|---|---|
| `enemy_initiative_flat` | every living enemy loses this much initiative (floor 1) |
| `enemy_armor_flat` | every living enemy loses this much armor (floor 0) |
| `enemy_damage_flat` | every living enemy takes this much damage, ignoring armor and resistances - it can kill |
| `enemy_decay_flat` | every living enemy gains a decay pool this big, through `applyDecay`, so healing is eaten before it reaches their HP |
| `ally_heal_flat` | every living ally heals this much, capped at max HP |
| `ally_shield_flat` | every living ally gains a shield pool this big, through `grantShield` |
| `ally_initiative_flat` | every living ally gains this much initiative |
| `ally_armor_flat` | every living ally gains this much armor |
| `ally_resist_flat` | `{ school: amount }`, added to every living ally |
| `ally_all_resist_flat` | the same amount added to every school |

**The reward must match the singers**, one field per singing cell:

| The cell's action | pays |
|---|---|
| heal (priest, mender, ash singer, embrace) | `ally_heal_flat` |
| shield (Standart Bearer, Warder, Aegis) | `ally_shield_flat` |
| decay (Pale Mourner) | `enemy_decay_flat` |
| attack (everyone else) | `enemy_damage_flat`, or a stagger field |

Nothing in the engine enforces it; a reward that does not match its formation is a bug
in the data.

Armor and resistances cap at `MITIGATION_CAP_PCT`, a shield pool at `POOL_CAP_PCT` of
max HP, so a unit at the ceiling gains nothing from those. The reward does **not**
respect the singers' own targeting rules: a litany heals every living ally, Construct
and Zombie alike, where a priest's own Heal can touch neither. The miracle is the
litany's, not the unit's.

`message` / `message_ru` is what the log and the Litanies page print, and it is composed
FROM the fields beside it - at most two clauses, one per side, each naming what its
number is ("Allies are healed for 5 HP and enemies take 5 damage."). It carries no
flavour: the litany's name is already the heading above it, and a sentence written apart
from the fields is a second place to get them wrong.

Rulings:

- The reward is a **mechanic**, not a bark. With `barks_enabled: false` the verses and
  the staging are suppressed, but the kill and the −5 still happen.
- `once_per: 'battle'` covers the reward too — a second qualifying kill neither replays
  the litany nor stacks another −5.
- −5 against a base of 25–45 is about one enemy sliding behind one of yours in the turn
  order. That is the intended size: felt, not a stun.

### 5.5 Playback and pacing

Target: **~3.5–4 s** from the first verse to the corpse. Client
([public/screens/battle.js](../public/screens/battle.js)):

| t | What |
|---|---|
| 0 ms | first verse toast on its cell + that unit's own animation: at the victim for a fighter, over its own side for a supporter |
| ~1200 ms | second verse toast + the same for that cell |
| ~2400 ms | last verse toast on the lead + the real killing blow, damage number, death |
| ~3600 ms | toasts clear; the reward line appears in the log |

- Verse toasts use `bark-toast--litany` and do **not** dismiss on tap mid-sequence;
  earlier verses stay up while later ones appear, so the three read as one chant.
- Normal per-entry playback pacing is suspended for the duration: the litany plays as
  one uninterrupted beat.
- The combat log renders the three verses, the kill and the reward as one grouped entry.
## 6. Validator

`scripts/validate-barks.js`, run in CI and before a content commit. Errors:

- An id in `ids`, in `LITANY_TARGETS`, or in a litany's `lead` cells, that does not
  exist in units.js.
- A litany carrying a `target` of its own - the target is `LITANY_TARGETS` and nothing
  else.
- A chorus cell carrying `ids` instead of a `calling`, or a `calling` that is not one of
  the two belonging to the faction that leads the litany.
- A hero's two litanies whose shared square names the same calling in both - the board
  could then satisfy either and `fireLitany` would silently take the earlier.
- A key that does not parse against §1.2 — unknown trigger, tag or faction.
- A pair that is not exactly `[en, ru]` with both non-empty.
- Two sets with the same id count both defining one key for one unit.
- A key holding more than 2 pairs.
- A line over the length limits in the style guide.
- A litany whose `verses` count does not equal its `formation` cell count, or whose
  `speaker` names a cell letter the formation does not define.
- A litany verse whose `strike` disagrees with what its unit does: `'support'` for an
  enemy-targeted attacker, `'visual'` for an ally-targeted healer or shielder.
- A litany with no verse marked `strike: 'lethal'`, or with more than one, or whose
  lethal verse is not the last.
- A hero with anything other than exactly two litanies, or a hero's two litanies that one
  board could satisfy at once.
- A litany `lead` id whose unit's `size` is not the size its cell declares. Chorus
  cells are no longer checked this way: the cell declares a size and the engine matches
  it against whoever is standing there.
- A litany whose cells overlap on the board, or a `column` cell starting at row 2.
- A litany whose `lead` ids cannot land a kill (an ally-targeted action).
- A litany naming no hero, or more than one, across its lead and cells.
- An id listed in two roles of the same litany.

Report (not errors): units with no set at all; units covered only by the floor;
coverage per faction and trigger.

---

## 7. Migration

1. Engine: resolver, new triggers, event budget, litany emission. The v1 rules are
   converted mechanically into `BARK_FLOOR` so nothing goes silent.
2. Client: litany pacing, toast style, grouped log entry.
3. Validator.
4. Content, one faction at a time, starting with **Empire → Templar branch + Paladin +
   `profane_chorus`** as the pilot. `profane_chorus` can be built and played on its own,
   ahead of the sets, since it depends on nothing but ids and the formation check. Grail and Choir keep speaking from the floor until
   their sets land.

---

## 8. Open questions

### Resolved 2026-09-16

| Question | Ruling |
|---|---|
| Do Constructs, Skeletons and base Zombies speak? | **Everyone speaks.** Every unit gets a real set; the floor is a safety net, not a destination. Constructs are spirits in machines, not robots (style guide §4) |
| Heroes: one set per path, or one for the whole hero? | **One set per hero, covering every upgrade on both paths** (e.g. Paladin = all 9 `h_e_1*` ids). A tier may still override with a smaller set (§1.1) |
| Named enemy bosses (Malgrath etc.) get own sets? | **Yes.** Pool units stay on the floor |
| Templar branch: Champion/Exemplar and Warden/Paragon — one voice or two? | **One shared voice for now** (`e21, e211, e2111, e212, e2121`); may split later |
| Litany when the formation check fails (too few units, or wrong positions)? | **No litany.** All-or-nothing (§5.2) |
| Unused tags (`Choir`, `Beast`) | **Deleted** from position_barks.js |
| Voice-guide conflicts | **Ruled** — see style guide §7 |
| Litany RU verse 3 | **«Не познаю страха!»** |
| Astaloth's gender | **Female** — the Mother |

### Resolved 2026-09-17 — `profane_chorus`

| Question | Ruling |
|---|---|
| What does a litany do besides speak? | It **stages the kill** — chorus strikes for show, lead lands the real blow — and grants a reward (§5) |
| Trigger | The lead's **attack** is about to kill an **enemy champion** — `LITANY_TARGETS`, one list for all eighteen (§5.2). Spell kills are out of scope — no actor is attached to spell damage |
| Filters | **None. Every role is a hardcoded id list** — lead and chorus per litany, target shared. Tags do not describe roles reliably (the Choir Regent has no `Demon` tag and is still a heretic) |
| Chorus strikes out of range | **Play anyway** — cosmetic flavour, no reach check |
| Formation | Hardcoded front column: chorus id top, lead middle, chorus id bottom (§5.1) |
| Verse order | Chorus, chorus, **lead last** with the killing blow |
| Reward | All enemies alive after the kill: **−5 initiative for the rest of the battle**, once per battle |
| Reward vs `barks_enabled: false` | Verses suppressed, **kill and −5 still apply** (§5.4) |
| Chorus strikes | Purely visual — no damage, no triggers, no turn spent (§5.3) |

### Still open

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Can a qualifier be a unit id (rivalries: `on_kill_e2111`)? | No, not in v2 |
| 2 | Can a unit lead one litany and be chorus in another in the same battle? | Yes; each litany is once per battle independently |
