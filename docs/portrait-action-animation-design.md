# Portrait Action Animation — Design

Status: **pilot implemented for the Mithrails Exemplar (`e2111`) basic action.** Last updated 2026-10-13.

## Why

The current battle presentation has a useful floor: character art sits in a cell and
coded effects communicate swings, spells, impacts and status changes. But the character
itself mostly stays still, so the unit can read like a static portrait while the effect
does the acting.

Full character animation is a poor fit for a solo project. Drawing, rigging or animating
every unit to a high standard would take too long, and a conventional sprite sheet still
asks for many carefully consistent frames. The project already has a large collection of
good character images, and can generate additional images over time. The opportunity is
to use a very small number of expressive poses to make those portraits feel like they
act.

The target is deliberately modest: move the battle presentation from **1** (static art)
toward **3–4** on a subjective 1–10 animation scale, not toward a handcrafted 10. The
result should feel intentional and readable without requiring continuous frame-by-frame
art production.

## The idea

Keep the existing portrait and coded effect system. At the moment of an action, briefly
darken or mute the idle portrait and show one or two generated action poses as separate
images anchored to the acting unit's battle cell. The action image is not embedded in or
clipped to the character portrait. The existing coded effect carries the motion, impact
or spell result.

The authored images provide **character acting**; the existing effects provide
**gameplay motion and feedback**. Neither needs to pretend to be the other.

An action beat could look like this:

1. **Ready:** the normal portrait remains visible.
2. **Anticipation:** the portrait darkens slightly or pulls back for a short beat.
3. **Action pose:** a separate generated image appears briefly (or cuts between two
poses), enlarged and centered on the acting unit.
4. **Effect and impact:** the existing coded animation plays and gameplay feedback lands.
5. **Settle:** return to the normal portrait.

The action pose may overlap the coded effect if playtesting shows that a faster,
connected beat reads better. It should not delay combat excessively.

## Guiding rules

- **Small image count, strong timing.** A good pose change, a short hold and a clean
  return should do more than several weak in-between images.
- **The pose belongs to the character.** Reuse the existing coded effect for projectiles,
  impacts, healing, status and other battlefield information.
- **Build coverage gradually.** Missing action art must never block a unit, action or
  battle.
- **Prioritize visible payoff.** Start with frequently seen actions and units, then add
  images where players will notice them.
- **Preserve combat readability and pacing.** Damage, targets, outcomes and turn order
  remain clear; presentation cannot change combat results.
- **Respect reduced motion.** The action beat must have a static or shortened alternative.

## Image scope

The simplest useful asset set is:

| Image | Purpose |
|---|---|
| Existing portrait | Idle / default state |
| Anticipation pose (optional) | A small wind-up or change of posture |
| Action pose | The readable moment of the character performing the action |

This is **two or three images total per covered character/action pairing**, counting the
existing portrait. A first pass can use only the idle and action images. A third image
should be added only when it improves the action's silhouette or timing; it is not a
minimum requirement.

These are authored stills, not a promise of a full sprite sheet. Short holds and cuts
between poses create the impression of a beat. Small CSS transitions—brief dimming,
scale, nudge or recoil—may connect the stills, but should not require new drawn frames.

### Coverage and reuse

“Per action” should mean a **visual action family**, not every mechanically distinct
ability rank or damage variation. Existing data already groups many units under shared
action animation names such as `sword_swing` or `fire_bolt`. The asset lookup should
allow a specific unit-and-action image set first, with sensible fallbacks:

1. Unit-specific pose for the action family.
2. Unit-specific generic action pose, if authored.
3. Existing portrait plus the current coded effect, with no pose swap.

Do not make a missing image an error or a reason to suppress the current effect. Action
art is an enhancement layer, not a new requirement for valid unit data.

The first implementation registers available art by log action type and unit id. The
`action` type is the basic unit action, and `action_e2111.png` is its pilot pose. Only
registered images are requested; unregistered units keep their existing portrait and
coded effect unchanged. The idle portrait dims as a separate action image appears, anchored
to the actor's battle cell but rendered independently of the portrait frame. The action
image is shown at twice its normal scale, then fades away while the existing coded effect
plays. That effect starts 120 ms after the image appears, with no added delay for
reduced-motion users. The image does not travel across the board or shake the cell. Art is
preloaded through the normal CDN-to-origin fallback so a new asset can work before it has
been copied to the CDN.

## Presentation and timing

Use the battle cell as the anchor so the art remains attached to its unit through the
existing playback flow. Keep the enlarged pose centered and preserve the readability of
health, status, target and damage feedback.

Initial timing should be tuned in play rather than treated as a fixed spec. A reasonable
first prototype is a short anticipation (roughly 80–150 ms), an action pose held for
roughly 120–250 ms, then the existing effect and a quick return to idle. The whole
presentation should fit inside the action's existing playback beat wherever possible.
Support actions should still animate on the acting unit, not on the ally receiving the
effect; attacks should not make the target appear to perform the action.

At high playback speed, or when combat is skipping presentation, shorten or omit the
pose beat instead of queueing stale poses. On reduced-motion settings, retain an
instantaneous pose swap or existing static presentation and avoid extra movement.

## Asset authoring guide

Generated poses need to read as the same character, not merely as another image of the
same class. Keep the following consistent with the existing portrait:

- recognizable face, costume, weapon, palette and silhouette;
- camera angle, framing, scale and lighting direction;
- transparent background where the current art style and pipeline support it;
- no baked-in text, damage numbers, spell impacts or scenery that duplicates battle UI;
- a clear action silhouette that still reads at the size of a battle cell.

The action pose should show the **moment before or during commitment**, not a result that
could contradict combat (for example, depicting a target as already struck before the
effect resolves). If an image is awkward at actual display size, reject or regenerate
it rather than compensating with more elaborate animation.

The current asset lives at `public/assets/animations/action_e2111.png`. Keep the
`action_` prefix for basic unit-action poses; future action types should use distinct
prefixes and explicit entries in the battle action-pose lookup.

## Suggested rollout

1. **Prototype one melee action.** Choose one common unit and one common action family.
   Add one action pose, use the existing portrait as idle, and test dim → pose → existing
   effect → idle in a real battle.
2. **Tune readability and speed.** Compare the same action with and without the pose.
   Confirm the unit is visibly acting, the effect still reads, and the beat does not make
   battles feel sluggish.
3. **Try one contrasting action.** Add a ranged or spell action to reveal whether pose
   timing, framing and transition rules generalize.
4. **Expand by payoff.** Add poses for common units and action families first. Let new
   character images and pose sets arrive incrementally.

The pilot succeeds if players can identify who acted and what kind of action they took
more easily than with the static portrait, while combat remains quick and legible. A
large number of generated images is not itself a success metric.

## Future implementation boundaries

This is an art and presentation layer on top of the current battle system. Additions
should reuse the existing action/effect resolution and playback sequencing rather than
create a parallel combat animation engine. It should not change server outcomes, damage
timing, targets or action rules.

Before broad asset production, verify that the pilot:

- returns to the correct portrait after completion, interruption or screen redraw;
- handles multiple units acting close together without leaving stale poses;
- falls back cleanly when the unit/action pair has no image;
- does not replay or duplicate the coded effect;
- works at the smallest supported battle layout and with reduced motion.

## Open questions

- How should pose scale, lunge distance and timing be tuned for other image proportions
  and action families?
- Should pose lookup be strictly unit-and-action-specific, or can some action families
  share generic poses? The proposed fallback supports both; the pilot should establish
  whether shared poses look coherent enough.
- Which common action family and unit make the best first pilot?
- Should pose art play on every normal action, or only on the most visually important
  actions at first?
