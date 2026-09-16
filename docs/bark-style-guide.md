# Combat Barks — Style Guide

Status: **draft for agreement.** Last updated 2026-09-16.
Companion doc: [combat-barks-design.md](combat-barks-design.md) — how lines are chosen. This doc is what they say.

A bark is a sentence shouted across a battle line by someone who is busy. Everything
below follows from that.

---

## 1. The five rules

1. **Say what just happened.** A bark is attached to an event: the kill, the hit, the
   heal, the death. If the line could be spoken at any moment, it belongs to no trigger.
   *Test:* cover the trigger key — can you guess it from the line?
2. **Say it as this person.** Two characters in one faction do not share a line. If
   you could paste the line into another branch's set unchanged, it is not written yet.
3. **One thought.** One sentence, or two very short ones. No setup-and-punchline.
4. **Understate.** Nobody in this game narrates their own heroism. Weight comes from
   what is left out.
5. **Silence beats filler.** An empty key falls back to something broader. An unwritten
   key is never an error; a generic line in a specific key is.

---

## 2. Form

| | EN | RU |
|---|---|---|
| Target length | ≤ 45 chars | ≤ 50 chars |
| Hard limit (validator) | 60 chars | 65 chars |
| Sentences | 1–2 | 1–2 |
| Pairs per key | 1 (2 only for frequent triggers) | same |

Today's file measures median 34 / max 62 EN — the target keeps us where we already are.
The toast is `0.6rem` over a battle cell; past ~60 characters it wraps to three lines
and covers the neighbouring unit.

**Punctuation.** Full stops. Em dash for a cut-off. Question marks rarely, and never
rhetorical sarcasm. **No exclamation marks — except in litanies**, where the last verse
is a chanted cry and is allowed one.

**Banned outright:**

- Modern idiom and slang (*okay, guys, deal with it, nailed it, bring it*).
- Quips and one-liners — anything that wants a rimshot.
- Commerce: price, debt, payment, contract, share, loan, interest, bargain, terms — for every faction, the Choir included.
- Naming game mechanics: HP, damage, turn, buff, armor value, crit.
- Addressing the player.
- The speaker's own unit name ("A Templar never yields").

---

## 3. Writing per trigger

| Key | The speaker is… | Good bark does | Avoid |
|---|---|---|---|
| `on_action_enemy` | mid-fight, target alive | intent, effort, a promise to the target | announcing victory early |
| `on_kill` | standing over a body | verdict, dismissal, or a rite | cheering |
| `on_kill_<tag>` | over *that kind* of body | what this faction believes about that creature | generic kill lines with a tag word swapped in |
| `on_death` | dying | last words: duty, faith, grief, an unfinished thought | long speeches; revenge threats |
| `on_death_<tag>` | dying *to that* | what it means to fall to that enemy | |
| `on_action_ally` | helping someone | the relationship to that ally | bedside manner — they are soldiers |
| `on_heal_low` | pulling someone back | urgency without panic | "you'll be fine" |
| `on_ability` | using their signature | the thing itself — its name in-world, its purpose | describing the visual effect |
| `on_low_hp` | badly hurt | refusal, faith, grim humour at most | whimpering (Empire); bravado (Grail) |
| `on_ally_death` | watching a comrade fall | one beat of the faction's grief register | vowing vengeance in paragraph form |
| `on_last_standing` | alone | the whole faction's creed in one line | |
| `on_battle_start` | lining up | ritual, not smack talk | taunts |
| `synergy_ally_*` | reacting to a comrade | continue their thought, don't comment on it | "Nice one" in any costume |

**Tag qualifiers must carry belief, not vocabulary.** `on_kill_zombie` for a Templar
is not "Die, zombie." It is what a Mithrail zealot believes a walking corpse *is*.

---

## 4. Faction voices

These voices carry the rulings in §7 and replace the guides at the top of
`combat_barks.js` and `position_barks.js` wherever they disagree.

### Empire — *the line holds*

Militant, disciplined, and devout in a way that is practical rather than mystical:
faith in **MITHRAIL** is a weapon that works, not a comfort. They report, they do not
boast. Everything outside the Empire is presumed unclean until proven otherwise.

**Stoic in speech, xenophobic in belief.** Both are true at once, at different volumes:
the voice stays level, but what it assumes about the enemy is absolute. Templars and
Inquisitors sit at the loud end; Engineers and Constructs at the quiet end.

- An Empire unit never concedes that faith was insufficient. That is heresy in its own
  mouth. Faith is needed *elsewhere*, or needed *whole*.
- Mithrail is named sparingly — a soldier says "the Light" or "Him" more often than the
  name. The name is for prayers and deaths.
- Vocabulary: line, hold, duty, oath, clean, unclean, judged, report, keep, burn.

### Grail of Sorrow — *what the spell cost*

Recent grief. They are barely a decade dead: a time spell they were building for the
war was mistranslated and moved them through time, and bodies did not survive the
journey intact. They remember being alive well enough for it to hurt.

- **ASTALOTH is female — the Mother.** "Mother" and her name are interchangeable. She
  watches, keeps, shelters and mourns. **She never takes, spends, withholds or leaves
  short.** A line that makes her the author of their state inverts the faction.
- The grief is for **their own mistake**. Never forgotten, cast out, betrayed, or
  waiting on the Empire's god.
- **Vampires are envious.** Of the living, and of everything the living still have
  that they lost on the way through time: warmth, breath, years, a body that arrived
  whole. Envy is how their grief points outward. Bitter, never gloating and never
  cunning; a vampire resents what you have, it does not scheme for it.
- Vocabulary: remember, carry, keep, Mother, late, left behind (by time, not by anyone), rest.

### Choir of the Cursed — *born of song*

Sung into being and hungry ever since. Everything is music and appetite: verses, voices,
the chorus, the **First Song**. Their god is **AGGRAIL**.

**Cunning, and willing to do anything for power.** They let someone else bleed first,
they turn your own words back on you, they spend their own without a second thought if
it brings them closer to power. What they want is **power**, never payment.

- They lapse mid-sentence into a tongue nobody else speaks. Those words are
  **transliterated identically in EN and RU** so the strangeness survives.
- **No bargaining, no trade, no terms.** Their cunning is predatory, not transactional:
  they take, they never deal.
- Vocabulary: verse, voice, sing, note, hunger, power, rise, the First Song, silence (as a threat).

### Enemy pools (`dm`, `mv`, `opb`)

Pool units speak from the floor. Named bosses get their own sets (ruled 2026-09-16) —
each boss is a character, not a fourth faction voice to invent casually.

---

## 5. Branch voices

Factions set the register; **branches make characters**. Every bark set opens with a
`voice:` line, and every branch gets an entry here before its set is written:

```
Branch:   <ids>
Is:       one sentence — who these people are
Wants:    what they are fighting for
Sounds:   2–3 adjectives
Never:    the one thing this branch would not say
Sample:   one on_kill, one on_death
```

### Pilot — Templar branch (`e21, e211, e2111` / `e212, e2121`)

```
Is:       Aggressive, zealous protectors. They purge and burn anything
          that even remotely looks like a threat.
Wants:    A clean field behind them.
Sounds:   Clipped, certain, liturgical when it counts.
Never:    Doubt. Mercy offered to the unclean.
```

**One set for the whole branch for now** (ruled 2026-09-16). The Champion/Exemplar
(holy_shock, purge) and Warden/Paragon (mace, sanctuary) may split into the burner and
the shield later; until then, tier overrides carry the difference where it matters.

### Coverage rules (ruled 2026-09-16)

- **Everyone speaks.** Constructs, Skeletons and base Zombies get full sets like anyone
  else. A mindless unit's voice is still a voice — flat, procedural, fragmentary — and
  the branch entry says which.
- **Heroes:** one set per hero, all upgrades on both paths. Write it for the character,
  not the tier.
- **Named bosses** get their own sets. Enemy pool units stay on the floor.

---

## 6. Russian

Russian is **co-written, not translated.** A pair is the same beat in two languages,
not the same words.

- **Keep:** the trigger it answers, the speaker's register, sentence count, the image
  if it survives.
- **Allowed:** different wording, different image if the English one is flat in Russian,
  a proverb-shaped line where English uses a plain one.
- **Register tools:** Empire leans on Church Slavonic cadence in prayers and deaths
  (*познаю, да будет, ибо*) and plain soldier's speech elsewhere. Grail — soft, older
  literary Russian, no archaism for effect. Choir — ornate, with the untranslated tongue
  left in Latin transliteration exactly as in English.
- **Gender.** Astaloth is feminine: *она, Мать, своя* («У нас есть своя»). Check
  agreement on every Grail line.
- **Ты / вы.** Enemies are *ты*.
- Never leave a pair with an English placeholder in the RU slot — the client has no
  English fallback by design.

**Worked example — `profane_chorus`:**

| | EN | RU |
|---|---|---|
| Paladin | Against the profane chorus — | Против хора нечестивого — |
| Templar | Against the unclean voices — | Против голосов нечистых — |
| Templar | I shall know no fear! | Не познаю страха! |

The inversion *хора нечестивого / голосов нечистых* gives the Slavonic cadence.
«Не познаю страха!» keeps the vow in the future tense and the object last, so the
chant closes on its strongest word (ruled 2026-09-16).

With one Templar alive the Templar says verses 2 and 3 together — see design doc §5.1.

---

## 7. Conflicts in the existing guides — ruled 2026-09-16

[combat_barks.js](../data/combat_barks.js) and [position_barks.js](../data/position_barks.js)
each carried a voice guide, and they disagreed. All six are settled; §4 carries the result.

| # | Topic | combat_barks.js says | position_barks.js says |
|---|---|---|---|
| 1 | Choir and commerce | **No commerce**; greedy like a mouth, not a bank | "music, **terms, debt** and appetite… they **bargain**, read the **contract** back to you" |
| 2 | Choir cunning | Hungry, appetite-driven | "Greedy, evil and genuinely **CUNNING**" |
| 3 | Empire temperature | Stoic, "never triumphant", understatement | "zealous to the edge of **xenophobia**" |
| 4 | Vampire register | "formal and tired" | "a **frightened person** who has only just learned what they are" |
| 5 | Astaloth's pronoun | Female throughout | "mourns what became of **his** worshippers" — then "ASTALOTH IS FEMALE" two lines later |
| 6 | Tag lists | 13 real tags | lists `Choir` and `Beast`, which no unit has |

Rulings:

1. **Choir: no bargaining, no trade.** Commerce is banned for every faction.
2. **Choir: cunning, and willing to do anything for power.**
3. **Empire: both.** Stoic in speech, xenophobic in belief.
4. **Vampires: envious** — of the living and what they still have.
5. **Astaloth is female.**
6. **Unused tags deleted.**

The voice guide in position_barks.js is updated to match. The one in combat_barks.js
is replaced wholesale by the v2 file.

---

## 8. Review checklist

Before a set is merged:

- [ ] Every key parses and the validator passes.
- [ ] Cover the key: can a reader guess the trigger from the line?
- [ ] Swap test: would this line work unchanged in another branch's set? If yes, rewrite.
- [ ] No banned words (§2), no exclamation marks outside litanies.
- [ ] Mithrail / Astaloth / Aggrail used only by their own faction, and sparingly.
- [ ] Astaloth: feminine, never the cause of their state.
- [ ] RU is the same beat, gender-checked, no placeholder.
- [ ] Read the whole set aloud in order. If two lines sound like the same sentence, cut one.
