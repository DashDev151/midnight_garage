# Sprint 170: the paint system

**Design of record:** `docs/design/systems/paint-system-design.md`.
**Vocabulary and data:** landed in Sprint 169. 34 colours, 37 iconic aliases, a pool on all 94
roster rows and `spec.factoryColours` on the model.

Sprint 169 gave the game a way to say what colour a car should be. This one makes the game care.

## Goal

**Paint stops being pure subtraction.** Today a resprayed car keeps all 11 of its authenticity
points, because `stocknessOf` asks whether the fitted paint SKU is stock grade and the only paint
SKU there is, is stock. A player can spend a week making a car's paint perfect and the game notices
only that it is no longer worse.

After this sprint: a car arrives wearing something, that something can be wrong, putting it right is
real work with a real payoff, and choosing a showier finish trades originality for style.

## Reuse analysis (directive 16)

### The central finding: `stocknessOf` does not change

The whole originality mechanic falls out of installing the correct paint SKU, because
`stocknessOf` already credits a slot only when its fitted SKU is `grade: 'stock'`.

| the car is | paint SKU installed | authenticity |
| --- | --- | --- |
| wearing its factory colour | `stock-paint` | the full 11 |
| resprayed, any colour or finish | the street, sport or race SKU | 0 |
| resprayed back, factory-correct | `stock-paint` again | the full 11, won back |

**So there is no formula to write.** The design doc's "respray it back and it is again" is delivered
by generation installing the right SKU and the paint stage swapping it. One gate does the work: the
stock-grade job may only be laid in the car's own factory colour.

### Everything else reused

| concern | what already does it |
| --- | --- |
| A stage that paints a zone | `planPaintStage`: takes a colour, needs the zone primed, sets `finish`, costs one labour unit and one tin. Gains a grade parameter and nothing else |
| Charging for materials | `materialCostYen` against `materials.json`. Two tins join it |
| Pricing the new SKUs | `resolvePartPriceYen` against `partPricing.json`. `baseCostYen.paint` and the default grade factors already exist, so all 12 SKUs price themselves |
| Style from a fitted part | `statModifiers.style`, exactly as the aero line's 7/13/18 |
| Per-zone colour, collapsed worst-governs | `derivePaintBand`. Only its mismatch clause changes |
| A per-culture generation table | `partsGeneration.damageGrades.careProfileByCulture` maps 13 cultures onto named profiles rather than 13 sets of raw weights. Paint history takes the same shape |
| The bare-metal look | `zoneState.primed`. A primed zone with no colour IS the unpainted panel; no new zone and no new state |
| Colour families for a near-miss | the grouping already exists as dev-screen presentation and moves into content |

**Not stood up in parallel:** no second authenticity formula, no second paint stage, no second
pricing path, no bumper zone.

### Genuinely new

- `CarInstance.factoryColour`, the pool entry this particular car left in.
- 12 paint SKUs (3 grades x 4 fitment classes).
- Two paint tins.
- `paintHistoryByCulture` and its four profiles.
- A `family` field on the palette colours.

## Decisions taken (maintainer, 2026-08-03)

**Originality reads per zone, rolled up**, the way the paint band already collapses. Not a single
car-level colour: the body model already makes the distinction and a car really can have one wing in
the wrong shade.

**The aftermarket colour picker is deferred.** A respray picks from the same 34. The quantised HSB
grid and its derived names are a later thing, and nothing here forecloses them.

**No bumper slot.** Sideskirts and splitters already exist (`namazu-sport-underbody-kit`), as do
lips and wings (the aero line). Bumpers sit inside `panels`, and the unpainted-bumper look is a
primed zone.

## Generation: five states, never random per zone

The rule that prevents clown cars is structural, not probabilistic. **A car rolls one of five whole
states**, and a mismatch is always exactly one zone.

| state | zones | paint SKU installed |
| --- | --- | --- |
| **original** | every zone the factory colour | `stock-paint` |
| **resprayed** | every zone one other colour from the 34 | street, sport or race |
| **mismatched panel** | factory colour, except one zone in a **near neighbour from the same colour family** | `stock-paint` |
| **primed panel** | factory colour, except one zone `primed` with no colour | `stock-paint` |
| **factory two-tone** | the authored scheme's colours | `stock-paint` |

Three panels can never disagree. The wrong-shade panel is always a family neighbour, so it is the
wrong white rather than a random colour: `white` against `white-ivory`, one silver against another.

A mismatched or primed panel leaves the car ORIGINAL in the authenticity sense, which is correct: it
is still wearing its own paint, with one panel repaired badly. It loses through the paint band's
mismatch penalty and its finish, which is what those are for.

### Three rulings that avoid three levers

**A resprayed car always arrives at street grade**, a cheap solid job. Metallic and pearl are things
the PLAYER pays for. So the wrong-colour car on the lot has lost its 11 authenticity points and
gained only 5 style, which is the right story (somebody did this on the cheap) and the player's
opportunity to do it properly. No weighting between the three aftermarket grades needs authoring.

**A respray picks uniformly from the 34, excluding the car's own factory colour.** Not a tuned
distribution: a respray is somebody else's taste and reads better arbitrary than curated.

**A mismatched panel picks uniformly from its own colour's family**, excluding the colour it is
meant to be, and the affected zone is uniform across the five panel zones. Whether damage patterns
should steer which panel gets it (the front takes the hits) is a later refinement, not a value to
author now.

## Two-tone: the factory scheme is a set, not an arrangement

`derivePaintBand` penalises zones that disagree on colour. Seven cars are authored with a genuine
factory two-tone and would read as damaged.

**The fix: a two-tone car's factory scheme is the SET of colours it legitimately wears, and the
mismatch penalty does not fire while every zone colour is in that set.** Which panel takes which
half is deliberately not modelled, because the research could not establish the panel arrangement
for most of the seven and inventing one would be exactly the failure the research spent its effort
avoiding. Two-tone rendering is not attempted either.

## The finish ladder

| grade | job | colour allowed | authenticity | style | tin |
| --- | --- | --- | --- | --- | --- |
| stock | factory-correct | **the car's own factory colour only** | restores the 11 | 0 | solid, 2,500 |
| street | solid respray | any of the 34 | costs the 11 | 5 | solid, 2,500 |
| sport | metallic | any of the 34 | costs the 11 | 10 | metallic, 5,000 |
| race | pearl | any of the 34 | costs the 11 | 15 | pearl, 7,500 |

The honest job is the cheap one and the expensive job is the one that costs originality. A
restoration and a show car want opposite ends of this ladder, which is the point.

`rampFor` already produces exactly solid, metallic and pearl, so the grade IS the ramp finish.

## Levers (directive 22)

**Every value below is named here before any implementation agent launches. Nothing else moves.**

### Approved 2026-08-03

| lever | file | value |
| --- | --- | --- |
| paint SKU style, street | `parts.json` | 5 |
| paint SKU style, sport | `parts.json` | 10 |
| paint SKU style, race | `parts.json` | 15 |
| `paint-metallic` tin | `materials.json` | 5,000 |
| `paint-pearl` tin | `materials.json` | 7,500 |
| roster-wide original share | `economy.json` | about 70 per cent, via the profile table below |

Anchors: the aero line reads 7 / 13 / 18, so paint sits just under it. A whole-car job is five panel
zones, so materials run 12,500 solid, 25,000 metallic, 37,500 pearl, on top of prime and labour,
both unchanged.

**No price lever is needed for the 12 new SKUs.** `baseCostYen.paint` is already 40,000 and the
default grade factors already exist, so they price themselves: entry 7,280 / 11,200 / 16,800 up to
flagship 46,800 / 72,000 / 108,000. That price is inert for paint in any case, since
`bodyPipeline.ts` overrides the generic band-cost formula with its own pipeline walk.

`economy.json`, `partsGeneration.paintHistory`. Four named profiles, weights per 100 cars,
**derived to the approved roster-wide target of about 70 per cent original**:

| profile | original | resprayed | mismatched panel | primed panel |
| --- | ---: | ---: | ---: | ---: |
| `cherished` | 90 | 3 | 5 | 2 |
| `scene` | 55 | 30 | 9 | 6 |
| `worked` | 70 | 6 | 14 | 10 |
| `mixed` | 75 | 12 | 9 | 4 |

Across the 94-car roster that resolves to **70 original, 16 resprayed, 9 with a mismatched panel and
5 with a primed panel**, or on an eight-car lot roughly five and a half original cars, one
resprayed, and panel trouble on one lot in two. An original car is the ordinary case and a
wrong-colour car is worth remarking on, which is what makes the signal mean anything.

`economy.json`, `partsGeneration.paintHistoryByCulture`, mapping all 13:

| culture | profile | why |
| --- | --- | --- |
| kyusha, exotic, touring-car | `cherished` | originality is the value and the owner knew it |
| drift, front-drive-tuner, touge, kurokan, wangan | `scene` | the scene repaints cars, that is the whole point of it |
| honest-transport, kei | `worked` | nobody resprays a commuter, they just repair the wing cheaply |
| rotary, rally-bred, oddball | `mixed` | bought with the heart, kept in every possible way |

**A separate table from `careProfileByCulture`, deliberately.** That one answers how hard a car was
used; this one answers whether it was repainted. They correlate but they are not the same question,
and a wangan car is an `enthusiast` for care while being scene-heavy for paint.

## Tasks

**A. Content: the SKUs, the tins, the families.** 12 paint SKUs with their style modifiers; two
materials; a `family` field on the 34 palette colours, moved from the dev screen's presentation
grouping. Guard tests for each.

**B. The paint stage takes a grade.** `planPaintStage` gains a finish grade, charges the matching
tin, and refuses stock grade in any colour but the car's own. `stagedWork.ts` carries the grade
through and swaps the installed paint SKU.

**C. Generation.** `CarInstance.factoryColour` rolled from `spec.factoryColours`; the five-state
roll driven by `paintHistoryByCulture`; zone colours, `primed` and the installed paint SKU all set
to agree. Save schema is a Dexie version bump and nothing else (directive 19).

**D. The two-tone exception** in `derivePaintBand`.

**E. The UI.** The paint stage asks which finish as well as which colour, and shows what each costs
and what it does to the two stats. The factory colour is marked as such wherever colours are listed.

## Definition of done

1. A car generates wearing a colour, and most cars wear their own.
2. A resprayed car has lost its paint authenticity; repainting it factory-correct wins it back.
3. Metallic and pearl jobs cost more and give style; the factory-correct job gives none.
4. The seven two-tone cars do not read as damaged.
5. No car generates with three panels disagreeing.
6. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deliberately deferred

- **The HSB aftermarket picker** and colour names derived from coordinates.
- **Two-tone rendering**, and which panel takes which half of a factory scheme.
- **Buyer colour preference.** A buyer-model change, not a paint change.
- **Ramps hand-cut per colour.** `rampFor` derives them from the base hex.

## Exit

**All five tasks are done.** Paint is no longer pure subtraction: a car arrives wearing something,
that something can be wrong, and putting it right wins the originality back.

- [x] **A.** 12 `Nurikabe` respray SKUs (3 grades x 4 fitment classes) at the approved style points;
      the metallic and pearl tins; `family` on the 34 palette colours, moved out of the dev screen so
      generation can read it. The catalogue went 472 to 484 and paint became the 13th style-bearing
      slot.
- [x] **B.** `planPaintStage` takes a grade, charges the matching tin, and refuses stock grade in any
      colour but the car's own through a new `'wrong-colour'` refusal. Chassis is exempt from the
      colour gate and still takes underseal.
- [x] **C.** `CarInstance.factoryColour` rolled from the pool; the paint-history roll driven by
      culture; zone colours, `primed` and the installed paint SKU all set to agree. `SAVE_VERSION`
      56 to 57, no migration (directive 19).
- [x] **D.** `derivePaintBand` waives the mismatch penalty while every zone colour is in the car's
      factory set. Omit the parameter and behaviour is byte-identical to before.
- [x] **E.** The paint stage offers colour and finish, groups the 34 by family, marks the car's own
      factory colour and shows its iconic name where one applies. The finish buttons read their
      disabled state from the sim's own plan rather than re-deriving the gate, so the UI cannot
      accept what `planPaintStage` would refuse.

### The finding that removed the hard part

**`stocknessOf` did not change.** It already credits a slot only when its fitted SKU is stock grade,
so the whole originality mechanic is delivered by generation installing the right paint SKU and the
stage swapping it. `authenticity.test.ts` had been carrying an assertion that paint had no
aftermarket ladder, with a comment predicting its own death; it now proves the mechanic instead.

### Two faults found in verification, both fixed

**The consumables probe was charging every car for three paint jobs.** `MATERIALS_COST_YEN` summed
every material flatly, which was right while all six were used in one pipeline pass and wrong the
moment the three paint tins became alternatives to each other. Law 3 failed on two kei cars as a
result. The metallic and pearl tins are now excluded, on two independent grounds: they are
alternatives rather than additions, and they are upgrades a repair never buys, so they cannot belong
in a guard asking whether a cheap car is crushed by costs it cannot avoid. **No lever moved.**

**The alias table was keyed on an unstable identity.** `PAINT_ALIASES.cars` held roster numbers, and
the roster is ordered by price, so inserting one car renumbers every row below it and would have
moved iconic colour names onto the wrong cars with nothing failing. Re-keyed onto `uid`, which is
what `uid` exists for, verified as 56 alias-car pairs before and 56 after with zero drift. This also
deleted a 26-entry roster shadow copy that had been added to `packages/game` to work around the
model not carrying an identity: `CarModel` now carries `uid`, guarded against the CSV.

### Rulings recorded rather than levers spent

A resprayed car always arrives at street grade, the cheap solid job. The respray colour is uniform
across the 34 excluding the car's own. A mismatched panel picks within its own colour's family. None
of the three needed a number.

### Checks

`pnpm typecheck` clean across content, sim and game. `pnpm test --project sim` 2206 passed across 86
files; `--project content` 600 passed across 28; `--project game` 902 passed across 69. One game
test was a stale assertion (directive 17 case (a)): the sandbox screen pinned `paint` as the one
slot no aftermarket part fits, and **paint was the last such slot**, so it now asserts that set-all
reaches all 29.

### Not verified

**Nobody has seen the paint stage render.** Layout and how the family-grouped swatch grid reads are
unchecked. The screen also keeps the existing button vocabulary rather than the diegetic retrofit
`art-direction.md` describes, because which screens get that pass first is still an open call.
