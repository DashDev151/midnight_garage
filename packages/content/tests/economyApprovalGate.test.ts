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
 * 20 -> 6) signed in `docs/design/workshop-rework.md`, Labour (signed
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
 * sets the future modified-grip ceiling. Signed in docs/design/lap-calibration.md.
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
 */
describe('the economy approval gate', () => {
  it('economy.json matches its approved content exactly', () => {
    const hash = createHash('sha256').update(JSON.stringify(economy)).digest('hex')
    expect(
      hash,
      'economy.json changed. Every lever is approval-gated (CLAUDE.md directive 22): ' +
        're-pin this hash ONLY in the same change as the recorded approval of the ' +
        'specific lever and value.',
    ).toBe('8ae8a06c547e8c6c1905d5410dea87796a934d7ea4c443078d087115f8d7a0f9')
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
      'four-wheels': { payoutYen: 130000, budgetCapYen: 130000 },
      'wont-strand-her': { payoutYen: 218000, budgetCapYen: 218000 },
      'first-proper-car': { payoutYen: 534000, budgetCapYen: 534000 },
      'make-it-pull': { payoutYen: 892000, budgetCapYen: 892000 },
      'the-column-clock': { payoutYen: 1557000, budgetCapYen: 1557000 },
      'low-and-loud': { payoutYen: 1763000, budgetCapYen: 1763000 },
      'street-power-street-manners': { payoutYen: 1623000, budgetCapYen: 1623000 },
      'under-one-fifteen': { payoutYen: 3681000, budgetCapYen: 3681000 },
      'the-fleet-spare': { payoutYen: 350000, budgetCapYen: 350000 },
      'the-showroom-standard': { payoutYen: 1231000, budgetCapYen: 1231000 },
    })
  })
})
