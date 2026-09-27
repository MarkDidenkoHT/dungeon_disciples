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

Revised 2026-09-27. **21 litanies are built - two or three per hero, for all nine heroes** — [data/litanies.js](../data/litanies.js),
`fireLitany` / `applyLitanyReward` in [utils/battle-engine.js](../utils/battle-engine.js),
playback in [public/screens/battle.js](../public/screens/battle.js). The rest of this
document is still design. A litany is **not** a reaction to a kill. It is a **staged
execution**: the killing blow is held back, two chorus members strike first for show,
and the lead lands the real blow on the last verse. It fires only when the formation
the litany describes is actually standing on the board, and it pays out a mechanical
reward — so it teaches positioning instead of only decorating it.

Each of the nine heroes leads two or three, seven per faction, all of them pure data in
[data/litanies.js](../data/litanies.js) — the engine and the tome page carry no
per-litany code. **One litany is one whole object**: its lead ids, every cell, its
target ids, its verses and its reward are written out inside it and shared with nothing,
so editing one cannot affect another. Everything but the original `profane_chorus`
carries placeholder verses; the lines are written separately.

Three things the first three litanies got wrong, fixed by the shape below:

- **A formation is a list of cells, not a column.** Each cell names its own row AND
  column (`front` / `back`, relative to the acting side), so a litany can stand its
  lead on the line and its singers behind it. One front column for all three cells is
  what put a back-rank priest in the melee rank.
- **A verse is what its speaker actually does.** `strike: 'visual'` is a fighter's blow
  at the victim; `strike: 'support'` is a healer's, shielder's or singer's own rite,
  performed over its own side. Playing a priest's `holy_heal` at the corpse read as
  blessing the body.
- **The reward is what the chorus sang.** A priest cell pays a heal, a Standart Bearer
  cell pays a shield, a Flame Spawn cell pays damage. The single
  `initiative_flat_reduction` is now the vocabulary in 5.4.

A unit with no `action_animation` cannot perform - its verse would be a silent beat -
which is why the Blessed Soul line (`e7...`, `action: 'none'`), the Grail Acolytes
(`gs5...`) and the Mother's Chalice line (`gs83...`) appear in no litany.

The tome shows a player only the litanies their own faction can LEAD, so each faction
sees seven cards.

**A chorus id must be a `size: 'tile'` unit.** A chorus cell holds one unit, and a
`column` unit fills rows 0, 1 and 2 as a single body — it can never man row 0 and row 2
as two separate speakers. This is why `taken_breath` is sung by the Choir Servant and
Ash Cantor lines rather than by the Chorister branch (`d12`, `d121`, `d1211`, `d1212`),
which is the obvious chorus by name and is column-sized.

**Every target list needs a PvE name on it.** A list of enemy heroes alone makes the
litany a drill that can only ever fire in a PvP match, and most hosts would never see
it. `profane_chorus` and `clean_passage` both carry Sister Aldra; `taken_breath`
carries Malgrath the Undying.

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

**Everything is a hardcoded id list.** No tags, no factions, no filters. Tags do not
describe roles well enough to drive a scripted moment — the Choir Regent carries
`Caster, Court` and no `Demon` tag, and is still a heretic to be purged. Which unit may
fill which role is an authoring decision, made by name, here.

```js
// Who may stand in the chorus cells — Templar and both Mithrail branches.
const LITANY_CHORUS_IDS = ['e21', 'e211', 'e2111', 'e212', 'e2121'];

// Who may lead — Paladin, every tier of both paths.
const LITANY_LEAD_IDS = ['h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
                         'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212'];

// Whose death triggers it — every Choir hero, all three lines, both paths.
// Black Castellan, Choir Regent and Infernal Ascendant: heretics, tags irrelevant.
const LITANY_TARGET_IDS = [
  'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
           'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42',
  'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
           'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
  'h_d_3', 'h_d_3_a2', 'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42',
           'h_d_3_b2', 'h_d_3_b3', 'h_d_3_b41', 'h_d_3_b42',
];

{
  id: 'profane_chorus',
  trigger: 'lethal',                 // the lead's attack is ABOUT to kill (§5.2)
  lead:    { ids: LITANY_LEAD_IDS },
  target:  { ids: LITANY_TARGET_IDS },
  // The formation IS the condition: named CELLS, each with its own letter, row and
  // column. Hardcoded cells, not a count. A verse names its speaker by letter.
  formation: {
    cells: [                         // col: front is col 1 for a player, col 0 for an enemy
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: LITANY_CHORUS_IDS },
      { key: 'B', row: 1, col: 'front', role: 'lead' },   // the acting unit itself
      { key: 'C', row: 2, col: 'front', role: 'chorus', ids: LITANY_CHORUS_IDS },
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
  A C        A  back  row 0  chorus  Priest line      strike: 'support'  (holy_heal)
  . B        C  front row 0  chorus  Standart Bearer  strike: 'support'  (shield_ward)
  . .        B  front row 1  lead    Paladin          strike: 'lethal'

  reward: { ally_heal_flat: 5, ally_shield_flat: 5 }
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
- The lead is `size: 'tile'` and so is every Templar, so footprints never complicate
  the check. A litany whose lead or chorus is a `row`/`column` unit is out of scope -
  which is why the Grail Angels (`gs4...`, `size: 'row'`) are no longer in the Clean
  Passage's chorus.
- **A cell must suit the units standing in it.** `pref_position` in
  [data/units.js](../data/units.js) says which rank a unit belongs in, and every chorus
  line is placed to match it. The one deliberate exception is the Standart Bearer line,
  placed in the front column because a banner stands on the line.
- **Two litanies under one lead are kept apart by their formations**: a cell they share
  cannot hold two different units, so the board decides which is spoken. Where their
  cells do not overlap at all, a rich enough board can satisfy both, and `fireLitany`
  takes the earlier one in the array. That is true today of the First Sorrow and the
  Pale Procession, but only on a Sister Aldra kill - she is the one target both lists
  carry.

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
2. Actor's unit id ∈ `lead.ids`; target's unit id ∈ `target.ids`.
3. Actor stands in the cell the litany marks `role: 'lead'` - that cell's own row and
   column, read against the acting side.
4. Every other cell the litany names holds an **alive** unit of its own side whose id
   is in that cell's list.

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
| `ally_heal_flat` | every living ally heals this much, capped at max HP |
| `ally_shield_flat` | every living ally gains a shield pool this big, through `grantShield` |
| `ally_initiative_flat` | every living ally gains this much initiative |
| `ally_armor_flat` | every living ally gains this much armor |
| `ally_resist_flat` | `{ school: amount }`, added to every living ally |
| `ally_all_resist_flat` | the same amount added to every school |

**The reward must match the singers** - a heal for a priest cell, a shield for a banner
cell, damage for a Flame Spawn cell. Nothing in the engine enforces it; a reward that
does not match its formation is a bug in the data.

Armor and resistances cap at `MITIGATION_CAP_PCT`, a shield pool at `POOL_CAP_PCT` of
max HP, so a unit at the ceiling gains nothing from those. The reward does **not**
respect the singers' own targeting rules: a litany heals every living ally, Construct
and Zombie alike, where a priest's own Heal can touch neither. The miracle is the
litany's, not the unit's.

`message` / `message_ru` is what the log and the Litanies page print, and it is written
by hand to describe the fields beside it - not derived from them.

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

- An id in `ids`, or in a litany's `lead`, `target` or `formation` cells, that does not
  exist in units.js.
- A key that does not parse against §1.2 — unknown trigger, tag or faction.
- A pair that is not exactly `[en, ru]` with both non-empty.
- Two sets with the same id count both defining one key for one unit.
- A key holding more than 2 pairs.
- A line over the length limits in the style guide.
- A litany whose `verses` count does not equal its `formation` cell count, or whose
  `speaker` names a cell letter the formation does not define.
- A litany verse whose `strike` disagrees with what its unit does: `'support'` for an
  enemy-targeted attacker, `'visual'` for an ally-targeted healer or shielder.
- A chorus id with no `action_animation` - its verse would be a silent beat.
- A chorus cell whose `col` contradicts its units' `pref_position`.
- A litany with no verse marked `strike: 'lethal'`, or with more than one.
- A litany `lead` or `formation` id whose unit is not `size: 'tile'` (§5.1).
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
| Trigger | The lead's **attack** is about to kill a unit on the hardcoded target list (§5.2). Spell kills are out of scope — no actor is attached to spell damage |
| Filters | **None. Every role is a hardcoded id list** — lead, target and chorus. Tags do not describe roles reliably (the Choir Regent has no `Demon` tag and is still a heretic) |
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
