# Sprint 169: the colour palette

**Content and research only. No code, no schema, no sim change.** The paint system it feeds is
Sprint 170.

Design of record: `docs/design/systems/paint-system-design.md`.

## Goal

**A colour pool per car, so that there is such a thing as a wrong colour.** Without it a Honda Beat
generates in Bayside Blue and the game calls that factory.

The current twelve colours in `paintColours.json` are retired. They are a generic period palette
that carries none of what makes a colour matter, and a wrong colour only reads as wrong if the right
ones mean something.

## Definition of done

1. What each of the 94 roster cars was actually sold in, researched and sourced.
2. That list consolidated into a shipped palette, hard, because five near-identical light blues are
   one colour in a four-tone ramp.
3. The iconic colours surviving consolidation, with parody names in front of the naming-layer flag
   and the real names behind it.
4. A per-car pool authored into the roster CSV for all 94 rows.
5. Every colour carrying what a four-tone sprite ramp needs, not one hex.

## The three jobs, in order

### 1. Research

**What colours was each car actually sold in.** This cannot be invented: it is the whole basis of
the feature, and a pool that is guessed makes the wrong-colour signal meaningless.

**Where a car's real options cannot be established, say so rather than filling the gap.** An honest
gap is a maintainer decision; a plausible invention is a lie that ships.

### 2. Consolidate

**The research output is the input, not the answer.** Merge ruthlessly:

- Near-identical colours across manufacturers become one. The game renders in a four-tone ramp on a
  pixel sprite, and if nobody could call two shades apart there, they are one colour.
- Prefer fewer, more distinct colours over a faithful catalogue. **The palette exists to be
  recognised, not to be complete.**
- Keep enough range that a pool is a real choice: a car with four options should not have four
  greys.

### 3. Alias the iconic ones

**Bayside Blue and Midnight Purple are the reason this is worth doing at all.** They are the colours
a player recognises on sight, and they survive consolidation whatever the merging says.

They are also manufacturers' names for manufacturers' colours, so they follow the naming layer
exactly as brands do: a parody name in front, the real one behind the flag. Midnight Purple becomes
something like "Dead of Night Indigo".

**The copy bar applies.** These are player-facing names on cars a player already loves, so they have
to be worth reading rather than merely legally distinct. The maintainer sweeps them.

## What a colour needs to carry

Not one hex. `art-direction.md` renders car bodies through an **indexed four-tone template with
runtime palette swapping**, and excludes bodies from the 24-to-32 environment cap precisely so this
can work. A colour is a ramp: base, shade, highlight, line.

## Out of scope

- **Aftermarket colours.** They are not authored at all: Sprint 170 gives the player a quantised
  hue, saturation and brightness grid and derives the name from the coordinates. Only FACTORY
  colours are researched and authored here.
- **All code.** Schema, generation, the paint stage, the SKUs and the authenticity and style wiring
  are Sprint 170.
- **Buyer colour preference.** Its own thing, later.

## Exit

_To be completed at the end of the sprint._
