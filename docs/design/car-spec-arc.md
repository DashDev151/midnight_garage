# The Car Spec Arc (real specs, condition and aftermarket modifiers, a feel model)

**Status: DESIGN, in progress (opened 2026-07-23).** Groundwork for a later driving/feel
model; art still deferred. This arc turns cars from names into physical objects with distinct
personalities. This phase captures accurate stock data and locks the schema; it does NOT build
the driving simulation (that is the deferred `drive-mode-spec.md`, post-launch). Amendments
require maintainer approval recorded here.

## The goal, in one line

Every car should feel unique to drive, condition should change how it drives, and aftermarket
parts should change it further, all from one coherent set of tunable dials.

## Reuse analysis (directive 16)

The game already has the exact shape this needs. Today: `stock spec -> part condition (band)
-> aftermarket parts -> four abstract stats (power/handling/style/reliability)`
(`derivedStats.ts`). This arc keeps both modifier layers and deepens the two ends.

**New mechanisms**

- A richer `spec` object: torque curves, mass distribution, drag, tyre/grip, drivetrain and
  engine layout as first-class fields (today only `curbWeightKg` and `stockPowerPs` exist).
- Published performance figures stored as calibration anchors (0-100, top speed, lateral g).
- A calibration method that maps physical specs to comparable summary-stat ratings.

**Existing mechanisms to reuse (do not rebuild)**

- The Naming Layer's `spec` object (`carModel.ts`): real, immutable fact lives here, names stay
  swappable. Every new field is real spec data, so it belongs in `spec` by law 3.
- The condition machinery: `weightedBandFactorForStat` + the taxonomy's `statWeights`
  (`derivedStats.ts`, `parts-taxonomy.json`). Condition modifiers on physical dials reuse this
  verbatim, just pointed at power/torque/grip instead of the four abstract stats.
- The aftermarket machinery: each part's `statModifiers` (`parts.json`). Aftermarket dial
  deltas reuse this, extended from four stats to the physical dials.
- `lapModel.ts` (power-to-weight x tyre grip) is the seed of the feel model; the feel model
  generalises it rather than replacing the pattern.
- The layout tag (`FR/FF/AWD/MR/RR`) and induction tag (`NA/Turbo/Supercharged`) already encode
  drivetrain, engine position, and aspiration; the explicit spec fields derive from or replace
  these, never duplicate them silently.

## The dials (per-car spec, researched)

Grouped by the driving question each answers. "Have" = exists today; "new" = this arc adds it.

| Question | Dial(s) | Status |
|---|---|---|
| How hard does it pull? | real power (PS), torque curve, kerb weight | power/weight have; curve new |
| How does the power arrive? | torque curve, redline, aspiration, engine config | curve/redline/config new |
| How fast will it top out? | drag coefficient (Cd), frontal area | new |
| How much grip? | stock tyre (size/compound), chassis-grip factor, downforce | new (stock downforce = 0) |
| How does it behave at the limit? | drivetrain (F/R/AWD), weight distribution (front %), engine position | drivetrain/position have; distribution new |
| Planted or nervous? | CoM height, wheelbase, kerb weight | weight have; CoM/wheelbase new |

### Powertrain: model the curve, not scalar markers

The torque curve is stored as sampled `{ rpm, torqueNm }` points (as many as a real source
gives; minimum the peak-torque point and the redline point). **Power derives** (power = torque
x rpm x constant), so the power curve and peak PS are computed, and peak PS is a validated
check against the published figure, not a separately authored truth. Where a real dyno source
exists we store more points; where it does not, the archetype (NA-linear, turbo-step,
rotary-peaky) shapes the fit between the anchored points.

### Real power vs the gentleman's agreement

The sim reads REAL power. Many hero JDM cars of the era were officially quoted at a capped
280 PS while making more. We store `realPowerPs` (sim truth) and `quotedPowerPs` (the
marketing/280 figure, display only). The GDD already sanctions this; a future dyno lets players
discover the real number, and we have fun with the reveal. `quotedPowerPs` defaults to
`realPowerPs` for cars with no cap game.

### Chassis, mass, drivetrain, aero

- `weightDistributionFront` (% on the front axle), `wheelbaseMm`, `comHeightMm`. CoM height is
  rarely published for 90s cars: estimate from body type + layout where absent, and flag it as
  estimated.
- `drivetrain` (FWD/RWD/AWD) and `enginePosition` (front/mid/rear) become explicit fields; the
  layout tag derives from them (or is kept in lockstep), never contradicts them.
- `aspiration` refines to NA / turbo / twin-turbo / supercharged (the induction tag gains
  twin-turbo).
- `dragCoefficient` (Cd) + `frontalAreaM2`; CdA derives. **Stock downforce = 0 for every car**
  (a decided simplification: even the homologation wings and whale-tails are more anti-lift than
  real downforce at road speeds, and it keeps the stock model clean). Downforce becomes a real
  dial only for aftermarket aero.
- `stockTyre` (`widthMm`, `aspectRatio`, `rimDiameterIn`, a compound class) feeds base grip; a
  per-car `chassisGripFactor` (a semi-estimated coefficient for suspension geometry and roll
  stiffness) is the tunable that lands the car on its published lateral g.

### Published anchors (calibration targets, not inputs)

`zeroToHundredS`, `topSpeedKmh`, `lateralGSkidpad` where published. The model computes these;
the published figures bracket the fit (specs pin the start, results pin the end, the model fits
the path). Where a figure is not published, the model predicts and we sanity-check.

### Provenance

Per car: a `sources` list and an `estimatedFields` list, so an estimated CoM or Cd is never
mistaken for sourced fact. Accuracy is the whole point of this arc; a field's confidence is
part of its data.

## The two modifier layers (reused)

**Condition.** Each dial is scaled by the weighted band-factor of the parts that feed it (the
existing `statWeights` mechanism). Worn engine internals cut power and torque; tired dampers and
poor tyres cut the grip factor; a stripped exhaust drops power. One source of truth, self-derived
from the taxonomy.

**Aftermarket.** Each SKU carries dial deltas (the existing `statModifiers` mechanism,
extended). A turbo on an NA car adds power and torque and moves the torque onset up the rpm
range while dropping reliability; lightweight panels drop weight (improving power-to-weight,
grip-per-kilo, and balance at once); an aero kit adds downforce and drag; coilovers add grip and
lower the CoM. These are the same deltas the four abstract stats already use, now on physical
dials.

## Calibrating the summary stats

The four abstract stats (power/handling/style/reliability) stay as summary readouts DERIVED from
the physical model, so the card, the economy, and existing UI keep working. Making a "6" mean
the same thing on every axis and across the whole roster:

1. **Rate the feel-proxy, not the raw spec.** Power rating comes from power-to-weight (PS/tonne),
   handling from predicted lateral g (plus a small balance term), never from raw PS or Nm.
2. **Anchor to reference cars, not to the roster.** Pin ~4 well-known cars at declared ratings;
   everything else lands on the curve between them. Min and max are pinned to generous DOMAIN
   bounds, not the roster's current extremes, so adding a car never re-ranks existing ones.
   Roster-relative percentiles are the trap (they reshuffle everyone on every addition).
3. **The power ceiling sits above a maxed BUILD, not the fastest stock car.** The summary stats
   are derived and rise with aftermarket parts, so a fully-built ~1000 PS Wangan Supra
   (~660-700 PS/tonne) must fit under the ceiling with headroom. The ceiling pins near
   ~800 PS/tonne, not ~280.
4. **Compressive curve, not linear.** 40 to 90 PS/tonne is transformative; 240 to 300 is barely
   felt. A log-ish curve keeps resolution where most of the roster lives and stops fast cars
   pegging at max.
5. **Cross-stat comparability is a pinned judgement, not physics.** Nothing says a given PS/tonne
   "equals" a given lateral g. You choose reference cars you consider equally impressive and pin
   them to the same number (an AE86 is a 5 on power but a 7 on handling; a base kei ~2 across),
   deciding the equivalences once, at the anchors.
6. **A probe holds it.** The anchor curves are tunable content; a test asserts the reference cars
   land on their declared ratings, the same discipline as the economy coherence probes.

## Research methodology (accuracy is the deliverable)

- **Source-grounded.** Specs come from real sources, cited per car, never confidently recalled.
  Agents gather; the maintainer's reviewer triages every batch for plausibility.
- **Cross-checked against known-good data.** The in-game cars in `cars.json` already carry
  accurate `curbWeightKg` and `stockPowerPs`; the research must reproduce them (or explain a
  deviation, e.g. a 280 PS quoted car whose real dyno is higher). This is the pilot's accuracy
  gate before the full roster runs.
- **Confidence-flagged.** Fields we estimate (CoM, Cd for obscure cars) are marked estimated;
  the obscure cars get the maintainer's eyes.
- **Batched by archetype** (kei, FWD, FR, rotary, AWD-turbo, flagship, gaisha) so agents
  specialise and unit conventions (PS/JIS vs kW vs bhp) stay consistent within a batch.

## Scope and exclusions

- **In scope now:** the spec schema, the comprehensive accurate stock data for the full roster,
  and the condition/aftermarket modifier structure. Data and schema only.
- **Deferred:** the driving/feel simulation that consumes the specs (post-launch drive-mode), and
  the actual per-part condition/aftermarket dial-delta VALUES (a later tuning arc; this phase
  defines the structure, not every number).
- **Excluded from the tunable-spec model:** the sealed secret Legend (a non-buildable
  enshrinement whose handling stays private per the roster directive), and the Motocompo (a
  scooter easter-egg utility, not a driving car). The S-Cargo and other slow oddities are in.

## Phasing

- **Phase 1 (this arc): the schema and the data.** Lock the extended `spec` schema (Zod);
  research and populate accurate stock specs for the full roster, cross-checked and
  confidence-flagged; wire `realPowerPs`/`quotedPowerPs` into the existing power readouts.
- **Phase 2: the modifier tables.** Populate condition weights and aftermarket deltas on the
  physical dials; recalibrate the four summary stats onto the physical model with the anchor
  curves and their probe.
- **Phase 3 (post-launch): the feel/driving model.** The simulation that turns specs into
  what-it-feels-like, calibrated against the published anchors. Out of this arc.

## The roster (research scope, ~84 buildable cars)

Full list in `midnight-garage-roster.md`. Batches: Shitboxes (5), Kei Sport & Utility (7, minus
the Motocompo), Fast FWD (7), FR/Drift (8), Rotary (3), Homologation/AWD (5), Flagships &
Weirdos (14), Kyusha (3 + the Cosmo Sport 110S pilgrimage step), the 10 Legends, Gaisha (8) +
Gaisha II (4), Era-Progression 2004+ (5), Hyper Wave (3). The sealed Zero Legend is out of the
buildable-spec scope by design.
