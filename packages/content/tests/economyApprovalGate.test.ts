import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import economy from '../data/economy.json'
import storyMissions from '../data/storyMissions.json'

/**
 * Economy levers are approval-gated (CLAUDE.md directive 22): every value in
 * economy.json and every mission payout is game design the maintainer owns
 * personally. These pins make a lever movement impossible to land silently:
 * any change turns the suite red until this file is re-pinned, and the
 * re-pin belongs in the same change as the recorded approval of the specific
 * lever and value (sprint doc or economy-bible amendment log).
 *
 * Re-pinned for the labour and fitting retune (`energy.energyPerGradeByTier`
 * renamed to `energy.energyPerBandStepByToolTier`, 10/6/4 -> 5/4/3;
 * `energy.energyByClass["bolt-on"]` 10 -> 3; `energy.energyByClass.buried`
 * 20 -> 6) signed in `docs/design/systems/workshop-rework.md`, Labour (signed
 * 2026-07-23).
 *
 * Re-pinned 2026-07-23 (maintainer order, in session): `four-wheels`
 * payout/budget 145000 -> 130000, restoring the tutorial's designed margin
 * after the daily machine hire removed one 15000-yen engine fee from the
 * taught build ("keep the margin as it was, reduce Yuki's payment amount").
 *
 * Re-pinned 2026-07-23 (maintainer choice, in session): `the-showroom-standard`
 * payout/budget 1200000 -> 1231000. The body-zone rework retired the sport
 * body-part grades the original 1200000 was formula-derived from; the honest
 * replacement build re-derives to 1231000, and the maintainer chose to bump
 * the payout to match rather than let the mission drift off-formula.
 *
 * Re-pinned for the body-model generation levers signed in the Sprint 119
 * lever table (`docs/sprints/sprint119.md`, "The complete lever table"): L3
 * added `partsGeneration.zoneStates` (per-tier metal/finish severity weight
 * tables, the chassis metal table one row kinder per tier, and
 * `surfaceExtraChance` 0.2) exactly as that table states.
 *
 * Re-pinned for the L5 SKU-disposition lever in the same table:
 * `missingSlotWeightByPart.panels`/`.paint`/`.underbody` 1 -> 0 - those
 * three parts are derived from zone state now, so they never roll missing
 * as a whole slot; only the `aero` kit slot still can, weight unchanged at
 * 3, exactly as the table states.
 *
 * Re-pinned for the grip-driven handling model (Sprint 123, maintainer-confirmed
 * 2026-07-24): `statFormulas.handlingBase`/`handlingWeightDivisor` removed and a
 * new `statFormulas.grip` block added (era rubber table, tier deltas incl. the
 * provisional `slick: 0.20`, grade-to-compound map, width/transfer/layout/track
 * constants, the two-segment display curve, and the balance term). Handling now
 * derives from mechanical grip rather than weight.
 *
 * Re-pinned 2026-07-24 (maintainer approval, in session): the grip display
 * curve's `statFormulas.grip.displayCurve.modifiedHighG` 2.0 -> 1.62, so a
 * full-slick race build (mechanical mu ~1.51, per the Calsonic BNR32 Gr.A
 * telemetry) reads ~90 on the 0-100 handling stat instead of ~76. No current
 * (stock) car exceeds mu 1.10, so no displayed stat or payout moves; this only
 * sets the future modified-grip ceiling. Signed in docs/design/car-performance/archive/lap-calibration.md.
 *
 * Re-pinned for Sprint 124's grip-and-pace lap model (lever table sections A and
 * B, signed by the maintainer 2026-07-25 in docs/sprints/sprint124.md): the old
 * `lapModel` block (`C`, `ratioExp`, `gripMult`, `courseId`, `courseName`) is
 * removed, and `statFormulas.pace` is added, carrying the Forza-calibrated
 * physics constants (gravity, air density, driveline efficiency, rolling
 * resistance, the launch and agility terms, and the nine torque-delivery
 * factors by engine archetype). Lap time is now a quasi-static point-mass sim
 * over a real course rather than a power-to-weight curve. Mission payouts are
 * unchanged: they derive from build cost, not lap time. The two lap CEILINGS
 * move (`the-column-clock` 83.1 -> 78.1, `under-one-fifteen` 71.8 -> 76.4), each
 * re-derived mechanically by `storyMissionProbes`'s own
 * `ceil1AtTwoPercentSlower` rule from the freshly measured probe builds, not
 * hand-picked.
 *
 * Re-pinned for Sprint 125's aero model (lever table sections A and C, signed by
 * the maintainer 2026-07-25 in docs/sprints/sprint125.md): adds
 * `statFormulas.aero` - `downforceK` 6.2e-5 (calibrated from the Calsonic BNR32
 * Gr.A's measured lateral-g pair), `maxGripMultiplier` 1.6, and the per-grade
 * downforce/drag table (street 0.10/+0.01, sport 0.40/+0.04, race 0.85/+0.09).
 * Downforce is speed-squared, so it is worth nothing at a standstill and never
 * touches the skidpad-based handling stat, valuation, or the goldens. No stock
 * car carries factory downforce, so no shipped lap time, mission ceiling, or
 * payout moves.
 *
 * Re-pinned 2026-07-25 (maintainer approval, in session: "Signed off on the change
 * to 0.3"): `statFormulas.pace.agilityWeight` 0.5 -> 0.3. The agility term is the
 * model's stand-in for the direction-change time a point-mass sim cannot represent,
 * and at 0.5 it over-penalised every car. Measured against twelve driven Forza laps
 * (docs/design/car-performance/archive/lap-calibration.md): at 0.3 the nine originally-fitted cars land at
 * +0.01% mean error and the three blind-test cars improve from +4.6% to +1.5%.
 * The two lap ceilings re-derive mechanically (`the-column-clock` 252.2 -> 237.1,
 * `under-one-fifteen` 248 -> 230.1); payouts are untouched.
 *
 * Re-pinned for the physics port's lever table (Sprint 128 section 6, signed by
 * the maintainer 2026-07-27 in docs/sprints/sprint128.md, including option C for
 * the display curve). Section A deletes `statFormulas.pace.awdLaunchFactor`,
 * `launchCapCoeff`, `delivery` and `deliverySaturationSpeed`; section B changes
 * `agilityWeight` 0.3 -> 0.82 (the term's formula changed, so the numbers are not
 * comparable); section C adds `brakeDeadDistanceM` 5.987, `geoMu` 1.220, `geoR`
 * 20, `geoT` 0.0612 and `dragOffsetPct` 3.28; section D raises
 * `statFormulas.aero.maxGripMultiplier` 1.6 -> 2.5 and
 * `aero.byGrade.race.downforceCoeff` 0.85 -> 1.20; section E adds
 * `statFormulas.grip.displayCurve.displayReferenceSpeedKmh` 200 and moves
 * `modifiedHighG` to 1.60, so the handling readout is effective grip at a
 * reference speed rather than a mechanical skidpad figure. Mission payouts and
 * budget caps are untouched: they derive from build cost, not from lap time. The
 * two lap missions move from the retired Kirifuri to Hakone and their ceilings
 * re-derive mechanically through `storyMissionProbes`'s own
 * `ceil1AtTwoPercentSlower` rule (`the-column-clock` 237.1 -> 125.1,
 * `under-one-fifteen` 230.1 -> 115), as does `street-power-street-manners`'s
 * tuner taste match (0.99 -> 0.97, which follows its 180SX's handling stat). That
 * mission's power floor 235 -> 180 is a PROVISIONAL hand-set value, recorded as
 * such in the sprint doc.
 *
 * Not a re-pin, recorded here because this file is the ledger of what moved and
 * why: the aftermarket physical ladder approved in docs/sprints/sprint130.md
 * ("The ladder") puts a weight delta on the race exhaust line, so the two lap
 * missions' probe builds are fractionally lighter and their ceilings re-derive
 * mechanically through `storyMissionProbes`'s own `ceil1AtTwoPercentSlower` rule
 * (`the-column-clock` 125.1 -> 125.0, `under-one-fifteen` 115 -> 114.9). Nothing
 * this gate asserts changes: economy.json is untouched and every payout and
 * budget cap holds, because those derive from build cost, not from lap time.
 *
 * Re-pinned for the condition-to-physics curves approved in docs/sprints/sprint129.md
 * ("The curves"): adds `statFormulas.condition.bandFactor`, one five-band curve per
 * physical dial - `grip` 1.000/0.975/0.935/0.875/0.800, `braking`
 * 1.000/0.980/0.950/0.900/0.840, `driveline` 1.000/0.995/0.980/0.960/0.930, `aero`
 * 1.000/0.990/0.960/0.900/0.800. Every one is a PROVISIONAL first-pass value, stated
 * as such in that doc and in the schema. Mint is exactly 1.000 on all four, so no
 * shipped lap time, handling stat, mission ceiling or payout moves: the harness
 * acceptance times are untouched.
 *
 * Re-pinned for the maintainer's correction to those same four curves, recorded in
 * docs/sprints/sprint129.md ("The curves"): the first pass was far too mild for what
 * the bands mean, so every sub-mint value steepens - `grip`
 * 1.000/0.960/0.880/0.740/0.550, `braking` 1.000/0.950/0.860/0.700/0.500, `driveline`
 * 1.000/0.985/0.950/0.890/0.800, `aero` 1.000/0.980/0.930/0.840/0.680. The braking
 * curve was corrected a second time in the same change, to fall faster than grip at
 * every band: the coefficient it scales is a lap-average over nine to eleven braking
 * events, not a single measured stop, and worn hardware fades across that. No other
 * lever moves. Still PROVISIONAL, and mint is still exactly 1.000 on all four, so the
 * harness acceptance times, every mission ceiling and every payout are untouched.
 *
 * Re-pinned for the period parts recalibration signed in docs/sprints/sprint132.md
 * section 4a (the ten live levers: nine `partPricing.json` base costs plus
 * `gradeFactors.race` 2.8 -> 3.0, each anchored to 1994-2004 catalogue data).
 * economy.json itself is untouched, so its hash holds. What moves is every
 * formula-derived mission payout, because the probe build cost those prices feed moved
 * with them, per the maintainer's ruling of 2026-07-28 that mission payouts follow the
 * formula: `wont-strand-her` 218000 -> 220000, `the-fleet-spare` 350000 -> 326000,
 * `first-proper-car` 534000 -> 519000, `make-it-pull` 892000 -> 949000,
 * `the-column-clock` 1557000 -> 1611000, `the-showroom-standard` 1231000 -> 1298000,
 * `low-and-loud` 1763000 -> 1795000, `street-power-street-manners` 1623000 -> 1708000,
 * and `under-one-fifteen` 3681000 -> 3810000. Each budget cap moves with its own payout,
 * holding the one-price contract. The directions differ because the reshuffled prices
 * changed which SKU a probe build selects; every figure is what `storyMissionProbes`'s
 * own `payoutYenFor` rule yields against a fresh measurement, never hand-picked.
 * `four-wheels` alone is unchanged: it sits deliberately off the generic formula.
 *
 * Re-pinned for the canonical roster price list
 * (docs/design/reference/period-scans/roster-price-list-v2.md section 2), applied to
 * every `cars.json` `bookValueYen` on the maintainer's ruling of 2026-07-28 that the
 * price list is canon. economy.json is untouched, so its hash holds. What moves is
 * every formula-derived mission payout whose probe car's book value moved, because
 * repair cost and market value both scale with it: `wont-strand-her` 220000 ->
 * 165000, `the-fleet-spare` 326000 -> 237000, `the-showroom-standard` 1298000 ->
 * 926000, `the-column-clock` 1611000 -> 1048000, `low-and-loud` 1795000 -> 1265000,
 * `street-power-street-manners` 1708000 -> 1343000, and `under-one-fifteen` 3810000
 * -> 1876000. Each budget cap moves with its own payout, holding the one-price
 * contract. `first-proper-car` and `make-it-pull` are unchanged because their probe
 * car (the EG6 Civic) is one of the two roster cars the price list left alone;
 * `four-wheels` is unchanged because it sits deliberately off the generic formula.
 * Every figure is what `storyMissionProbes`'s own `payoutYenFor` rule yields against
 * a fresh measurement, never hand-picked.
 *
 * Re-pinned 2026-07-28 (maintainer approval, in session):
 * `energy.actionPoints.removePart` 0 -> 2. Removing a part cost no labour at all,
 * which left price as the only brake on stripping a car for parts. At 2 points
 * against the 60-point `basePoolPoints`, stripping all 29 slots costs 58 points, so
 * a full strip is just under one day of a solo shop's labour; that ratio is the
 * intent of the value. No payout or budget cap follows from it (they derive from
 * build cost, not from labour), and no other lever moves. What does move is the
 * donor coherence row's disclosed `stripLaborSlots`, previously zero for every model
 * by construction and now 48 points on a naturally aspirated model and 50 on a
 * forced-induction one; the donor law's own yen comparison is untouched, since strip
 * labour is disclosed alongside it rather than gated by it.
 *
 * Re-pinned 2026-07-28 (maintainer approval, in session): `four-wheels`
 * payout/budget 130000 -> 135000. This mission sits deliberately off the generic
 * formula (it is the tutorial), so this is a hand-set value, not a formula
 * re-derivation. The Wagon R's canonical book value of 230000 left the taught build
 * able to absorb its designed profit but not one player mistake, missing by 3570
 * yen. 135000 restores the maintainer's standing rule for this lever ("keep the
 * margin as it was"): measured fresh through `tutorialProbe`, the taught build
 * spends 128070, the one sanctioned mistake adds 5500 for 133570 against the 135000
 * cap, and designed profit is 6930, inside the (0, 15000] band that probe asserts.
 */
describe('the economy approval gate', () => {
  it('economy.json matches its approved content exactly', () => {
    const hash = createHash('sha256').update(JSON.stringify(economy)).digest('hex')
    expect(
      hash,
      'economy.json changed. Every lever is approval-gated (CLAUDE.md directive 22): ' +
        're-pin this hash ONLY in the same change as the recorded approval of the ' +
        'specific lever and value.',
    ).toBe('d294ac5b58aed18db40dc1b8bdd1098c98b34c2f0ae677f3b34f1001fe6e29a2')
  })

  it('mission payouts and budget caps match their approved values exactly', () => {
    const payouts = Object.fromEntries(
      storyMissions.map((mission) => [
        mission.id,
        { payoutYen: mission.payoutYen, budgetCapYen: mission.budgetCapYen },
      ]),
    )
    expect(
      payouts,
      'A mission payout or budget cap changed. These are approval-gated ' +
        '(CLAUDE.md directive 22): re-pin only alongside the recorded approval.',
    ).toEqual({
      'four-wheels': { payoutYen: 135000, budgetCapYen: 135000 },
      'wont-strand-her': { payoutYen: 165000, budgetCapYen: 165000 },
      'first-proper-car': { payoutYen: 519000, budgetCapYen: 519000 },
      'make-it-pull': { payoutYen: 949000, budgetCapYen: 949000 },
      'the-column-clock': { payoutYen: 1048000, budgetCapYen: 1048000 },
      'low-and-loud': { payoutYen: 1265000, budgetCapYen: 1265000 },
      'street-power-street-manners': { payoutYen: 1343000, budgetCapYen: 1343000 },
      'under-one-fifteen': { payoutYen: 1876000, budgetCapYen: 1876000 },
      'the-fleet-spare': { payoutYen: 237000, budgetCapYen: 237000 },
      'the-showroom-standard': { payoutYen: 926000, budgetCapYen: 926000 },
    })
  })
})
