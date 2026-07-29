# Sprint 136: support ratios and the always-on readout

**Status: AWAITING SIGN-OFF, then ready to implement.** Every value in "The levers" below is
proposed and unapproved (directive 22).

Opens after Sprint 135. Third of nine, and **the keystone of the arc**: Sprint 137 is
blocked on it by a hard gate, and Sprints 140 and 142 both read what it builds.

Design reference: `docs/design/systems/tuning-system.md` sections 6 and 7c.

## The gap, stated plainly

Every part in the catalogue is a gain, so the cheapest gain always wins and there is exactly
one correct build order. Nothing in the game can express **a build that makes power it
cannot hold together**: 1.5 bar on stock internals is currently just a fast car.

This sprint makes a build's coherence a first-class derived quantity, and makes it visible.

## Reuse analysis (directive 16)

### Genuinely new

- **Five per-subsystem ratios and their minimum**, and the content that weights them.
- **A qualitative always-on readout** on the car.

### Existing mechanisms reused, unchanged

- **`statModifiers.powerFraction[character]`** from Sprints 135 and 136 is the *entire*
  demand side. Demand is not separately authored; it falls out of what the build gains.
- **`engineCharacterOf`** from Sprint 135, so demand is character-correct without a second
  derivation.
- **The four grades** (`stock`, `street`, `sport`, `race`) as the support-specification
  ladder. **No fifth grade** (`IDEAS.md` records that as rejected).
- **`ALL_CAR_PART_IDS` and the car's `parts` record**, the same traversal
  `buildFactors` and `computeDerivedStats` already use.
- **The car detail screen and the sale listing flow**, which get one new element each rather
  than a new screen.

### Must NOT be built

- **One aggregate ratio.** Section 6a: it cannot name the part that would fix it, and it is
  gameable, because over-supplying fuel would arithmetically mask stock internals. Fuel does
  not hold a piston together.
- **A dyno.** That is Sprint 141. This sprint ships the *existence* of the problem, not its
  precision.
- **Any engine-explodes event.** Section 6d: the consequence is that the car is worth less
  and costs standing, never that it detonates.
- **A reputation consequence.** Design 7b is descoped for the whole arc, blocked on the
  reputation ratchet (design 8). It would ship inert.

## The mechanism

For each of five subsystems, `ratio = support / demand`, and the headline `supportRatio` is
**`min(ratio)` across all five**.

```text
demand[s]  = 1 + demandWeight[s]  * (the gain that drives s)
support[s] = 1 + sum over supporting slots of supportWeight[s][slot] * spec(slot)
```

where `spec(slot)` is the installed SKU's grade on the support ladder, and the gain figures
are `statModifiers.powerFraction[character]` for the installed SKUs.

**A stock car sits at exactly 1.0 on every subsystem, by construction**, because every gain
is 0 and every spec is 0, so both sides are exactly 1. This is the property that makes the
whole thing readable, and it is the single best regression test in the sprint: assert it for
all 26 shipped cars with strict equality.

### The dual-role convention, which must be implemented exactly

Section 6c: **demand comes from output, support comes from specification, and within any one
subsystem a part is a demander or a supporter, never both.**

| subsystem | demand driven by | supported by |
| --- | --- | --- |
| cylinder pressure | `forcedInduction` gain only | `internals`, `block` |
| fuelling | total gain across all slots | `fuelSystem` |
| heat | total gain across all slots | `cooling` |
| revs | `camsTiming` gain only | `headValvetrain`, `internals` |
| torque transmission | total gain across all slots | `clutch`, `driveline` |

Read that table against the dual-role parts and it holds:

- **A bored block** adds output, so it raises demand on fuelling, heat and torque
  transmission. It does **not** raise cylinder-pressure demand, which is the subsystem it
  supports.
- **A ported head** supports revs, and as a gain raises fuelling and heat demand. It does
  not raise revs demand; only cams do.
- **`fuelSystem` and `clutch` carry zero gain** (Sprint 135, Lever 3), which is what keeps
  them from partly paying for themselves.

### The acceptance criterion the arc doc got slightly wrong

The arc doc says "adding any single gain part must never raise that car's headline ratio".
**That is too strong and would fail correctly-implemented code.** Fitting race internals to
a big-turbo car raises cylinder-pressure support by far more than it raises fuelling demand,
so the headline rises, and it *should*: buying the bottom end is exactly what fixes that
build.

The correct pair of assertions:

1. **Structural.** For every subsystem, the set of slots contributing to its demand and the
   set contributing to its support are **disjoint**. This is the convention itself, and it
   is what makes self-cancelling impossible.
2. **Behavioural.** Adding a **pure gain** part (one that supports no subsystem at all:
   `camsTiming`, `intake`, `exhaust`, `ignitionEcu`, `forcedInduction`) never raises the
   headline ratio.

## The levers (ALL UNAPPROVED, directive 22)

All live in `packages/content/data/economy.json` under `statFormulas.support` (content law).

### Lever 1: the support-specification ladder

What a grade is worth as *specification*, on every supporting slot.

| grade | spec |
| --- | ---: |
| stock | 0.00 |
| street | 0.25 |
| sport | 0.60 |
| race | 1.00 |

### Lever 2: demand weights

| subsystem | driven by | weight |
| --- | --- | ---: |
| cylinderPressure | `forcedInduction` gain | 2.00 |
| fuelling | total gain | 0.80 |
| heat | total gain | 0.70 |
| revs | `camsTiming` gain | 3.50 |
| torqueTransmission | total gain | 0.90 |

### Lever 3: support weights

| subsystem | slot | weight |
| --- | --- | ---: |
| cylinderPressure | internals | 0.45 |
| cylinderPressure | block | 0.25 |
| fuelling | fuelSystem | 0.75 |
| heat | cooling | 0.70 |
| revs | headValvetrain | 0.25 |
| revs | internals | 0.15 |
| torqueTransmission | clutch | 0.50 |
| torqueTransmission | driveline | 0.35 |

### Lever 4: thresholds

| band | headline ratio |
| --- | --- |
| adequate | >= 0.90 |
| strained | 0.75 to 0.90 |
| dangerous | < 0.75 |

### What these levers produce

Calibrated so that **a fully committed race build lands at 1.0 and a half-committed one
collapses**, which is the whole point of section 5e's hard gate.

**A maximal forced-induction build, race grade throughout:**

| subsystem | demand | support | ratio |
| --- | ---: | ---: | ---: |
| cylinder pressure | 1.700 | 1.700 | 1.000 |
| fuelling | 1.760 | 1.750 | 0.994 |
| heat | 1.665 | 1.700 | 1.021 |
| revs | 1.175 | 1.400 | 1.191 |
| torque transmission | 1.855 | 1.850 | 0.997 |
| **headline** | | | **0.994, adequate** |

**A race turbo and nothing else**, which is design 6d's worked example:

| subsystem | demand | support | ratio |
| --- | ---: | ---: | ---: |
| **cylinder pressure** | 1.700 | 1.000 | **0.588** |
| fuelling | 1.280 | 1.000 | 0.781 |
| heat | 1.245 | 1.000 | 0.803 |
| revs | 1.000 | 1.000 | 1.000 |
| torque transmission | 1.315 | 1.000 | 0.760 |
| **headline** | | | **0.588, dangerous, cylinder pressure named** |

**A race turbo with a race fuel system and race cooling, stock bottom end** still reads
0.588 and still names cylinder pressure. That is section 6a's argument made arithmetic: **an
excellent fuel pump does not hold a piston together.**

**A maximal high-strung NA build** lands at 1.037, bound by revs, which is the correct
binding constraint for an NA engine. **A maximal lazy NA build** lands at 0.962, also on
revs: slightly optimistic, comfortably adequate, not a warning.

**A street exhaust on a turbo car** lands at 0.959. Mild bolt-ons must not trigger warnings,
and they do not.

### Lever 5: the readout copy

Shown only at `strained` and `dangerous`; **`adequate` shows nothing at all**, because
competence is the baseline rather than an achievement (design 7b).

| subsystem | the shortfall, in the game's voice |
| --- | --- |
| cylinderPressure | asking more of the bottom end than it can give |
| fuelling | making more air than the fuel system can feed |
| heat | making more heat than it can shed |
| revs | asking for more revs than the head will hold |
| torqueTransmission | making more torque than the drivetrain will take |

| band | framing |
| --- | --- |
| strained | `It will do, but it is {shortfall}.` |
| dangerous | `This is {shortfall}.` |

Copy lives in content, not in code. It goes through the maintainer's own copy sweep before
it ships; the strings above are a proposal like every other lever here.

## Task breakdown

### Task 1: content schema and data

`packages/content/src/economy.ts`: `statFormulas.support`, carrying the four numeric levers
and the threshold pair. Zod-validated, with the stock-car-equals-1.0 property stated in the
schema comment.

`packages/content/data/economy.json`: the signed values.

`packages/content/src/tags.ts`: `SubsystemSchema` as a five-value enum
(`cylinderPressure`, `fuelling`, `heat`, `revs`, `torqueTransmission`).

**The demand and support maps are content, not code.** A future part must not be able to
join a subsystem by editing a list in a source file.

### Task 2: the derivation

New file `packages/sim/src/support.ts`, exported through `packages/sim/src/index.ts`:

```text
supportRatios(car, model, partsById, economy): Record<Subsystem, number>
supportVerdict(car, model, partsById, economy): SupportVerdict
```

where `SupportVerdict` is `{ headline: number, band: 'adequate' | 'strained' | 'dangerous',
subsystem: Subsystem }` and `subsystem` names the minimum.

1. Resolve the character once via `engineCharacterOf`.
2. Walk the car's slots once, accumulating each slot's gain and each slot's spec.
3. Compute the five ratios, then the minimum.
4. **Ties break in the order the subsystem enum declares**, so the named subsystem is
   deterministic. State that in the doc comment; a non-deterministic name would make the
   readout flicker.

A slot the catalogue cannot resolve contributes nothing on either side, matching
`buildFactors`'s existing rule that an unknown part id can never silently move anything.

### Task 3: the always-on readout

Design 7c requires the warning at two points in this sprint (the third, the dyno, is Sprint
142):

1. **The car's own readout, always.** `packages/game/src/screens/CarDetailScreen.vue`.
2. **Listing it for sale, restated and unmissable.** The set-for-sale flow.

The element is qualitative: the band and the named shortfall, no numbers. **Numbers are the
dyno's product and must not appear here**, or Sprint 141 has nothing to sell.

The art bible's diegetic-UI law binds: it is an in-world object with a real pressed or
active state, not a coloured banner. If that cannot be satisfied without new art, **ship the
plainest in-world treatment that obeys the law and record the art dependency in the Exit**;
do not invent a modern-UI alert.

### Task 4: tests

New file `packages/sim/tests/supportRatios.test.ts`:

1. **The stock identity.** All 26 shipped cars, every subsystem exactly 1.0, strict equality.
   The headline is exactly 1.0 and the band is `adequate`.
2. **The structural disjointness test.** For each subsystem, its demand slots and its support
   slots share no member. Read from content, so hand-editing the data cannot break the
   convention silently.
3. **Pure gains never raise the headline.** For each of `camsTiming`, `intake`, `exhaust`,
   `ignitionEcu`, `forcedInduction`, at each grade, on a representative car of each
   character: fitting it leaves the headline the same or lower.
4. **The two worked tables above**, pinned exactly.
5. **Fuel does not hold a piston together.** A race turbo with race fuelling and race cooling
   but a stock bottom end still reads `dangerous` and still names `cylinderPressure`.
6. **Mild bolt-ons do not warn.** A street exhaust alone reads `adequate` on all 26 cars.
7. **Determinism of the named subsystem** when two ratios tie.
8. **Every character's maximal build**, headline and named subsystem pinned.

Component tests for the readout: present at `strained` and `dangerous`, **absent at
`adequate`**, and carrying no numeric figure in any state.

### Task 5: checks

```text
pnpm test --project content
pnpm test --project sim
pnpm test --project game
```

`harnessAcceptance.test.ts` must pass untouched: this sprint adds a derived quantity and
changes no physics.

### Task 6: re-derive whatever moved

Nothing in this sprint feeds price or lap time, so very little should move.
`economyApprovalGate.test.ts` moves because `statFormulas.support` is new; re-pin it in the
same change as the recorded sign-off, naming every lever and value.

**If a valuation or lap pin moves, stop.** It means support has leaked into a path it must
not touch yet; wiring cohesion to value is Sprint 139 and is gated on Sprint 138's
measurement.

## Hard constraints

- **No unlisted lever.** Execution ENDS if implementation appears to need one.
- **Support must not reach price or reputation in this sprint.** Assert it: a car's sale
  price is identical with and without a collapsed support ratio.
- **No numbers in the readout.**
- **No engine-failure event, no wear rate, no reliability stat.**
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [ ] Levers 1 to 5 signed and recorded in this doc.
- [ ] Five subsystem ratios and a `min` headline, derived in `packages/sim/src/support.ts`.
- [ ] All 26 stock cars sit at exactly 1.0 on every subsystem, strict equality.
- [ ] Demand and support slot sets are disjoint per subsystem, proved structurally from
      content.
- [ ] Pure gain parts never raise the headline.
- [ ] Both worked examples pinned; the fuel-does-not-hold-a-piston case pinned.
- [ ] Mild bolt-ons read `adequate` on every car.
- [ ] The warning is visible on the car always and restated at listing, with no numbers.
- [ ] Sale price provably unchanged by support ratio.
- [ ] Economy gate re-pinned in the same change as the sign-off.
- [ ] Checks run once each, output shown.

## Exit

_To be completed at the end of the sprint._
