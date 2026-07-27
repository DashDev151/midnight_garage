# Sprint 129: what condition does to performance

**Status: DESIGNED at outline depth. Needs a full lever table before it opens, which cannot be
written until Sprint 128 has landed and the physical dials exist to name.**

Opens after Sprint 128. Third of four in the porting arc.

## The gap, stated plainly

A car's measured figures are the figures of a **stock car in good order**. Today a worn engine and
dead tyres move the four abstract stats and nothing physical: a car with scrap tyres laps exactly as
fast as the same car on fresh ones, because condition never reaches the lap model. After Sprint 128
that is the largest remaining lie in the sim, because the lap model will be precise about a car
whose condition it ignores.

## Reuse analysis (directive 16)

### Genuinely new

Only the mapping: **which physical dial each component group degrades, and by how much at each
band**. Nothing else here is new, and that is the point.

### Existing mechanisms reused, unchanged

- **`weightedBandFactorForStat` and the taxonomy's `statWeights`** (`derivedStats.ts`,
  `parts-taxonomy.json`). This is the whole condition machinery and it already does exactly the
  required job: take a group's parts, weight them, produce a factor. It gets pointed at physical
  dials instead of abstract stats. **Do not build a second condition system.** The Sprint 08
  service-jobs rework is the standing warning against precisely that.
- **The band vocabulary** (scrap through mint) is unchanged.
- **The ratio bridge from Sprint 128.** Condition scales the same ratios a build scales, so the two
  compose without a third mechanism.

## The trap that must be designed around, not discovered

**Double counting.** After Sprint 128, effective power is `rPower x Pw_now`, and `Pw_now` already
carries engine condition through `derivedStats`. If this sprint also applies an engine-condition
factor to `rPower`, worn engines are punished twice and the model quietly stops reproducing its own
measurements.

The rule that avoids it: **each physical dial has exactly one condition path, named in the lever
table.** Anything already flowing through `Pw_now` must not be reapplied. The sprint's first task is
an audit that writes down, dial by dial, where condition already reaches it today.

## The dials and their plausible owners

A starting map for the design session, not a decision:

| Dial | Component group | Why |
|---|---|---|
| mechanical grip `mu` | tyres, suspension | contact patch and how well the car uses it |
| braking `bmu` | brakes (and tyres) | tyres appear twice, which is real and needs one path chosen |
| effective power `pEff` | engine, forced induction, exhaust | **already partly covered via `Pw_now`** |
| driveline loss | drivetrain | today a fixed 0.88 |
| drag / downforce | body, aero | a damaged splitter should cost downforce |

**Tyres and the brakes both wanting `bmu` is the sharpest question in the sprint**, because braking
is measured as one coefficient and the game models the two parts separately.

## Scope line

Condition only. What an aftermarket part does is Sprint 130. A worn part and a better part are
different questions and mixing them makes both untestable.

## Definition of done (draft)

- [ ] A lever table naming every dial, its single condition path, and its factor at each band,
      signed before any agent runs.
- [ ] An audit proving no dial is degraded twice.
- [ ] A car at mint reproduces its measured figures **exactly**, so the model's calibration is
      untouched by this sprint at the top of the band. This is the acceptance test.
- [ ] Values and prices unmoved: performance and value are independent.

## Exit

_(to be filled on completion.)_
