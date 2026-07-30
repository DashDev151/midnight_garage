# Engine swaps

**Status: DESIGNED, NOT IMPLEMENTED, not scheduled. Nothing in this document exists
in the game.** Drafted 2026-07-28.

**This is frozen v1.0 scope, not a post-launch idea.** GDD 5.3 calls engine swaps
"the marquee deep mechanic". The roadmap slotted them into Sprint 17 alongside a
dyno tune screen; that sprint was built as something else and neither exists in
code. `dyno` appears exactly once in `packages/`, as a word inside a mission string.

Every number here is a proposal and unapproved.

---

## 1. What the GDD already commits to

Verbatim, GDD 5.3:

> **Engine swaps** are the marquee deep mechanic: any engine can go in any platform
> *if* you source/fabricate a mounting kit (expensive, high labor, small permanent
> Reliability tax if cross-family). Swaps tank Authenticity but unlock monster Power
> ceilings. The classic tension: restore the numbers-matching engine, or drop in the
> big turbo lump?

So four things are already decided and are not open: a mounting kit gates the swap,
cross-family carries a permanent reliability tax, authenticity is hit hard, and the
payoff is a power ceiling rather than a flat gain. The design below serves those
rather than revisiting them.

GDD 5.4 pairs it with a **dyno session** (1 labour slot, "2-3 sliders, e.g. Boost
versus Reliability, Camber: Grip versus Tyre wear/Style"). That is the natural
interface for the tuning system's trade-off dimension as well; see
`tuning-system.md` section 5.

---

## 2. The blocker: there is no engine

**An engine is not an object in this codebase.** It is a set of optional scalars on
the immutable `CarModel.spec` plus a tag:

`engineCode`, `stockPowerPs` (required), `quotedPowerPs`, `powerRpm`,
`peakTorqueNm`, `torqueRpm`, `redlineRpm`, `displacementCc`, `engineConfig`,
`aspiration`.

Three consequences, all load-bearing:

**The physics reads only `stockPowerPs`.** `formulas.md` section 2 states that
torque, torque rpm, power rpm, redline and capacity are "Display data; the physics
does not read them". `engineConfig` and `aspiration` are read by nothing in the
physics path either.

**There is nowhere to record a swap.** Engine identity lives on `CarModel`, which is
shared content, and `CarInstance` carries only `parts` and condition. Two cars of
the same model cannot currently have different engines. **This is a schema question
before it is a design question.**

**Aspiration is stored twice and the two are unguarded.** `hasForcedInduction` does
NOT read `spec.aspiration`; it reads tags:

```ts
return model.tags.includes('Turbo') || model.tags.includes('Supercharged')
```

The schema refinement guards only the tag side. Nothing checks that
`aspiration: 'turbo'` and the `Turbo` tag agree. A swap changes aspiration, so this
duplicate has to be collapsed as part of the work rather than worked around.

---

## 3. The schema, which is most of the feature

**Make an engine a first-class content object.** A new `engines.json` under
`packages/content`, Zod-validated like everything else:

| field | purpose |
| --- | --- |
| `id`, `code` | `2jz-gte`, "2JZ-GTE" |
| `family` | for the cross-family reliability tax |
| `powerPs`, `displacementCc`, `config`, `aspiration` | what it is |
| `massKg` | **new, and necessary**: a swap changes the car's mass and balance |
| `lengthClass` or similar | what it physically fits into |

Then:

- **`CarModel.spec.engineCode` points at one.** The 26 shipped cars get their
  existing engine authored as content. No behaviour changes.
- **`CarInstance.engineId` is a nullable override.** Null means "the engine this
  model came with", which is every car in every save today. Directive 19 applies:
  a Dexie version bump and nothing else, no migration.
- **`aspiration` moves onto the engine and the induction tag is derived from it**,
  collapsing the duplicate. `hasForcedInduction` reads the instance's effective
  engine.

That last point matters more than it looks: under `tuning-system.md`, an engine's
whole tuning response keys off its induction and its specific output. Once the
engine is an object, **a swap automatically changes how the car responds to every
tuning part**, with no special-casing. That is the payoff for doing the schema
properly.

---

## 4. What a swap actually changes, physically

Three inputs move, and all three are already model inputs, which is why this is
safe:

**Power.** The new engine's `powerPs` replaces the car's stock figure as the base
that `computeDerivedStats` builds on.

**Mass.** A 2JZ-GTE is roughly 50 kg heavier than a VQ35DE. Mass is already a
first-class input and already moved by `physicalModifiers.mass`.

**Weight distribution.** An iron-block straight six sits further forward than an
alloy V6. `spec.weightDistributionFront` feeds the grip balance term.

**And the ratio bridge survives, which is the whole reason this is tractable.**
`powerRatio` is a per-car fraction solved from the measured acceleration pair, and
it describes how much crank power reaches the road **through that car's
drivetrain**. It is a drivetrain property, not an engine property, so it travels
across a swap unchanged and rescales itself. This is exactly the argument that makes
the JDM variant switch safe (`TODO.md`), and it is the same bridge.

What a swap must NOT do is invent a torque curve or a rev range. The physics does
not read them and there is no data behind them (`tuning-system.md` section 2).
Display them, do not simulate them.

---

## 5. Fitment: the constraint is the culture

"Any engine can go in any platform" is the GDD's line, and the *if* is the mounting
kit. But an unconstrained swap catalogue is a spreadsheet, and the flavour lives
entirely in which swaps are canonical:

- SR20DET into almost anything
- 1JZ and 2JZ into the JZX chassis and the S-chassis
- 13B into things that should not have one
- RB26 into an R32 that came with an RB20
- K-series into a Civic that came with a D

Proposal: a swap's **difficulty** is derived rather than authored per pair.

| factor | effect |
| --- | --- |
| Same family, same maker | cheapest kit, no reliability tax. The tuner's obvious move |
| Same maker, different family | dearer kit, small permanent reliability tax (GDD's "cross-family") |
| Different maker | dearest kit, larger tax, and a real fabrication job |
| Physically too large for the bay | not possible at all |

That gives every pair a sensible answer without authoring hundreds of them, and it
makes the canonical swaps naturally the cheap ones, because they are canonical
*because* they were the easy ones.

---

## 6. 公認: the JDM friction nothing else has

A swapped car in Japan needs **公認 (kōnin)**: official re-approval and
re-registration of the modification. Our own period research is full of it:
`L28公認`, `3000cc公認`, `エンジン乗せ換え公認車検` appear throughout the archived
classic-dealer listings in `docs/design/reference/period-scans/`.

This is the single most valuable thing in the feature, because it is friction that
is not money and **it cannot be reskinned to any other setting.** `TODO.md` carries
a standing maintainer concern that the game "would play identically with a European
roster". Shaken plus 公認 plus a swap culture is the answer to that concern, and it
arrives free with a mechanic already in the GDD.

Proposal: until a swap is 公認, the car is a liability. It cannot be sold at a
premium, some buyers will not touch it, and it carries risk. Getting it approved
costs money and time and is a deliberate step, not a checkbox.

---

## 7. Value, and the tension the GDD promised

"Restore the numbers-matching engine, or drop in the big turbo lump" only works if
both are genuinely viable, which means **the market has to disagree with itself**.

The machinery exists. `authenticityPercent` is already a stat, buyer taste already
weights stats per buyer, and `buyers.json` already keys preferences. A swap should:

- **Tank authenticity**, per the GDD. A numbers-matching car is worth more to the
  buyer who cares.
- **Raise the power ceiling**, so it is worth more to the buyer who wants speed.
- **Be a real fork**, not a strict upgrade. If swapping is always right, the
  mechanic is decoration.

This is where the genuine-versus-replica finding from the period research applies
directly: a Skyline `GT-R仕様` ran 30 to 40 per cent of a real GT-R, but a 240ZG
replica ran roughly the *same* as a genuine one, because the ZG's difference was a
bolt-on nose cone while the GT-R's was a completely different engine. **The market
discounts what you can fake and pays for what you cannot.** A swapped car should
behave the same way: it is worth what it does, not what it is.

---

## 8. Reuse analysis (directive 16)

**Genuinely new:** the engine content object; `CarInstance.engineId`; the mounting
kit and its derived difficulty; the 公認 state and its flow; swap-specific labour.

| Concern | What already exists |
| --- | --- |
| Power reaching the physics | `computeDerivedStats` into `carBlock`, unchanged |
| Rescaling honestly when power moves | `powerRatio`, the ratio bridge |
| Mass and balance as inputs | `spec.curbWeightKg`, `weightDistributionFront` |
| Whether an engine is forced | `hasForcedInduction`, once the duplicate is collapsed |
| Authenticity as a stat, and buyers who weigh it | `authenticityPercent`, `buyers.json` |
| A job that costs labour and days | the existing job and labour system. **Reuse it. Directive 16 exists because a parallel job system was built once already** |
| A part that has to be sourced and delivered | `resolveBuyPart`, standard and express |
| Reliability as a stat | `computeDerivedStats`'s condition-plus-coherence combine (`packages/sim/src/derivedStats.ts`, `support.ts`), scaled by the car's own `spec.reliabilityBase` - `statModifiers.reliability` was retired in Sprint 136 |

**Must NOT be built:** a second job system for swaps, a torque-curve simulation, or
a second engine representation alongside `spec`'s scalars. Collapse those scalars
onto the engine object rather than having both.

---

## 9. Build order

1. **The engine content object** and `spec.engineCode` pointing at it, with all 26
   shipped cars authored. Zero behaviour change, fully testable, and it collapses
   the aspiration duplicate. Independently shippable.
2. **`CarInstance.engineId`** as an override, with the physics reading the effective
   engine. Still no swap mechanic; the plumbing simply exists.
3. **The swap job**: mounting kit, labour, mass and balance moving, authenticity hit,
   cross-family reliability tax.
4. **公認**, and the market consequences of an unapproved car.
5. **The dyno** (GDD 5.4), which is where a swapped engine's boost-versus-reliability
   trade-off becomes something the player controls.

Step 1 is worth doing regardless of whether swaps are ever built, because it fixes a
real duplicate representation and gives `tuning-system.md` the per-engine response
character it needs.

---

## 10. Open questions

1. **Does a swap need a donor car, or can engines be bought outright?** A donor
   makes the scrapyard (`scrapyard.md`) the natural source and ties two features
   together handsomely. Buying outright is simpler. My instinct is both, with the
   donor route cheaper and riskier.
2. **Can the original engine be kept and refitted?** It should be: "I kept the
   numbers-matching lump in the corner" is exactly the fantasy, and it makes the
   choice reversible at a cost rather than permanent.
3. **How many engines get authored for v1.0?** The roster is 26 cars. A tight
   catalogue of perhaps fifteen well-chosen engines beats an exhaustive one.
4. **Does an engine wear?** The engine is currently expressed through the `block`,
   `internals`, `headValvetrain` and `camsTiming` slots, which have condition. A
   swapped engine presumably arrives with a condition of its own and those slots
   follow it. Needs settling before implementation, not during.
