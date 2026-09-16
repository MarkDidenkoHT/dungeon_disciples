# Combat Barks v2 — Design

Status: **draft for agreement, nothing built.** Last updated 2026-09-16.
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

One file, `data/combat_barks.js` (decided). It exports three things:

| Export | What it is |
|---|---|
| `BARK_SETS` | Per-character sets, keyed by unit ids |
| `BARK_FLOOR` | Small generic sets per faction × tag — the safety net |
| `LITANIES` | Multi-speaker sequences with formation conditions |

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
- **Litany suppresses everything** for that action (§5).
- `battle_start`, `low_hp`, `last_standing` fire at most once per unit per battle.

---

## 5. Litanies

A litany is a scripted sequence of verses, each spoken by a different unit, fired by
one event when a formation condition holds. It is owned by the formation, so it lives
in `LITANIES`, not in any unit's set.

### 5.1 Schema

```js
{
  id: 'profane_chorus',
  faction: 'e',
  trigger: 'kill',
  lead:   { ids: ['h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
                  'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212'] },   // Paladin, all paths
  target: { tag: 'Demon' },
  chorus: {
    ids: ['e21', 'e211', 'e2111', 'e212', 'e2121'],  // Templar + both Mithrail branches
    count: 2,
    position: 'front',                               // required, not a preference
  },
  once_per: 'battle',
  verses: [
    ['Against the profane chorus —', 'Против хора нечестивого —'],  // lead
    ['Against the unclean voices —', 'Против голосов нечистых —'],  // chorus 1
    ['I shall know no fear!',        'Не познаю страха!'],          // chorus 2
  ],
}
```

- Verse 1 is the **lead** (the unit that triggered it). Verses 2..n go to the chorus
  in order.
- **The formation check is all-or-nothing.** At the moment the event resolves there
  must be `count` chorus units that are **alive, on the lead's side, and standing in
  `position`**. If the units or their positions fail the check, there is **no litany**
  — no shorter version, no substitute speakers. The normal barks fire instead.
- A litany ignores `BARK_CHANCES` but respects `once_per`.

### 5.2 Log and playback

The engine pushes one `bark` entry per verse, each on its own speaker's cell:

```js
{ type: 'bark', actorId, actorCell, text, text_ru, litany: { id: 'profane_chorus', i: 0, n: 3 } }
```

Client ([public/screens/battle.js](../public/screens/battle.js) `showBarkToast`):

- Verses play in order, ~700 ms apart, and hold until the last verse has shown for its
  full duration — they read as one chant, not three toasts.
- A distinct toast style (`bark-toast--litany`) so a player learns to recognise it.
- The combat log renders the three verses as one grouped entry.
- `barks_enabled: false` suppresses litanies too.

---

## 6. Validator

`scripts/validate-barks.js`, run in CI and before a content commit. Errors:

- An id in `ids`, `lead` or `chorus` that does not exist in units.js.
- A key that does not parse against §1.2 — unknown trigger, tag or faction.
- A pair that is not exactly `[en, ru]` with both non-empty.
- Two sets with the same id count both defining one key for one unit.
- A key holding more than 2 pairs.
- A line over the length limits in the style guide.

Report (not errors): units with no set at all; units covered only by the floor;
coverage per faction and trigger.

---

## 7. Migration

1. Engine: resolver, new triggers, event budget, litany emission. The v1 rules are
   converted mechanically into `BARK_FLOOR` so nothing goes silent.
2. Client: litany pacing, toast style, grouped log entry.
3. Validator.
4. Content, one faction at a time, starting with **Empire → Templar branch + Paladin +
   `profane_chorus`** as the pilot. Grail and Choir keep speaking from the floor until
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
| Litany when the formation check fails (too few units, or wrong positions)? | **No litany.** All-or-nothing (§5.1) |
| Unused tags (`Choir`, `Beast`) | **Deleted** from position_barks.js |
| Voice-guide conflicts | **Ruled** — see style guide §7 |
| Litany RU verse 3 | **«Не познаю страха!»** |
| Astaloth's gender | **Female** — the Mother |

### Still open

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Can a qualifier be a unit id (rivalries: `on_kill_e2111`)? | No, not in v2 |
| 2 | Can a unit lead one litany and be chorus in another in the same battle? | Yes; each litany is once per battle independently |
