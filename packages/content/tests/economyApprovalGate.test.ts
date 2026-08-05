import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import damagePatterns from '../data/damagePatterns.json'
import economy from '../data/economy.json'
import partPricing from '../data/partPricing.json'
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
 * lever table (`docs/sprints/sprint_archive/sprint119.md`, "The complete lever table"): L3
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
 * B, signed by the maintainer 2026-07-25 in docs/sprints/sprint_archive/sprint124.md): the old
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
 * the maintainer 2026-07-25 in docs/sprints/sprint_archive/sprint125.md): adds
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
 * the maintainer 2026-07-27 in docs/sprints/sprint_archive/sprint128.md, including option C for
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
 * why: the aftermarket physical ladder approved in docs/sprints/sprint_archive/sprint130.md
 * ("The ladder") puts a weight delta on the race exhaust line, so the two lap
 * missions' probe builds are fractionally lighter and their ceilings re-derive
 * mechanically through `storyMissionProbes`'s own `ceil1AtTwoPercentSlower` rule
 * (`the-column-clock` 125.1 -> 125.0, `under-one-fifteen` 115 -> 114.9). Nothing
 * this gate asserts changes: economy.json is untouched and every payout and
 * budget cap holds, because those derive from build cost, not from lap time.
 *
 * Re-pinned for the condition-to-physics curves approved in docs/sprints/sprint_archive/sprint129.md
 * ("The curves"): adds `statFormulas.condition.bandFactor`, one five-band curve per
 * physical dial - `grip` 1.000/0.975/0.935/0.875/0.800, `braking`
 * 1.000/0.980/0.950/0.900/0.840, `driveline` 1.000/0.995/0.980/0.960/0.930, `aero`
 * 1.000/0.990/0.960/0.900/0.800. Every one is a PROVISIONAL first-pass value, stated
 * as such in that doc and in the schema. Mint is exactly 1.000 on all four, so no
 * shipped lap time, handling stat, mission ceiling or payout moves: the harness
 * acceptance times are untouched.
 *
 * Re-pinned for the maintainer's correction to those same four curves, recorded in
 * docs/sprints/sprint_archive/sprint129.md ("The curves"): the first pass was far too mild for what
 * the bands mean, so every sub-mint value steepens - `grip`
 * 1.000/0.960/0.880/0.740/0.550, `braking` 1.000/0.950/0.860/0.700/0.500, `driveline`
 * 1.000/0.985/0.950/0.890/0.800, `aero` 1.000/0.980/0.930/0.840/0.680. The braking
 * curve was corrected a second time in the same change, to fall faster than grip at
 * every band: the coefficient it scales is a lap-average over nine to eleven braking
 * events, not a single measured stop, and worn hardware fades across that. No other
 * lever moves. Still PROVISIONAL, and mint is still exactly 1.000 on all four, so the
 * harness acceptance times, every mission ceiling and every payout are untouched.
 *
 * Re-pinned for the period parts recalibration signed in docs/sprints/sprint_archive/sprint132.md
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
 *
 * Re-pinned for the tier/rarity/origin split approved in docs/sprints/sprint_archive/sprint133.md
 * (sections 4 and 8). NO VALUE MOVES: the six tier-keyed blocks
 * (`valuation.expectationByTier`, `partsGeneration.minWorkBillFractionByTier`, the
 * three `partsGeneration.zoneStates` weight tables, and `diagnosis.symptomChanceByTier`)
 * carry their numbers verbatim under the renamed keys shitbox -> entry, common ->
 * everyday, uncommon -> enthusiast, rare -> flagship. `reputation.cleanSaleMinBand`
 * was never tier-keyed and is untouched. What DOES move is the key SET of the three
 * tables the old enum keyed by scarcity rather than price band, because `shitbox` and
 * `gaisha` are no longer rarities: `selling.offerChanceByTier` becomes
 * `selling.offerChanceByRarity` and drops shitbox 1.1 and gaisha 0.6 (common 1.05,
 * uncommon 0.9, rare 0.75, legend 0.45 all unchanged);
 * `sellingChannels.freeAdsPaper.offerChanceFactorByTierClass` becomes
 * `offerChanceFactorByRarity` and drops shitbox 1.5 and gaisha 0.5 (common 1.5,
 * uncommon 0.5, rare 0.5, legend 0.5 all unchanged); and
 * `auction.rarityWeightsByReputation` loses its only entry, `{unknown: {shitbox: 3}}`,
 * leaving `{}`. That last one is section 8's flagged decision and is NOT yet signed:
 * keyed to rarity the table is inert by construction, because `auctionTierForRarity`
 * partitions rooms by the same field, so every candidate in a room draws the identical
 * weight. The day-1 Local Yard is therefore uniform over 15 models spanning 130000 to
 * 1850000 yen, where it previously favoured cheap cars 3:1 over 12 models spanning
 * 130000 to 650000. Mission payouts and budget caps are deliberately untouched here
 * and four of them are consequently off-formula; see that sprint doc's Exit.
 *
 * Re-pinned 2026-07-28 (maintainer approval, in session, values signed with the
 * design): auction catalogues are drawn per ROOM rather than per rarity.
 * `auction.rarityWeightsByReputation` (an empty map, and inert by construction)
 * is removed, and two new tables replace it. `auction.carTierWeightsByAuctionTier`
 * gives each room its own appetite per car price band - local-yard 70/28/2/0,
 * regional 25/45/27/3, premium 3/17/55/25, collector-network 0/3/27/70, over
 * entry/everyday/enthusiast/flagship. `auction.rarityDrawMultiplier` is common 1.0,
 * uncommon 0.5, rare 0.2, legend 0.05. The draw is two-stage on the maintainer's
 * own correction: the room rolls a price band from its row, THEN picks a car within
 * that band by scarcity, so a row entry is literally the band's share of the room
 * and cannot drift as models are added to the roster. `auctionTierForRarity` is
 * gone, replaced by `canAppearAtAuctionTier`; a zero row entry keeps a band out of
 * a room entirely, and GDD 9.2's legend rule is now an explicit gate rather than a
 * consequence of the old 1:1 mapping. No other lever moves. What follows from it is
 * that every generated board changes, so both `advanceDay` golden hashes and the
 * auction-room demo bench are re-derived from real runs.
 *
 * Re-pinned in the same change for the four formula-derived mission payouts that
 * Sprint 133 left off-formula, per the maintainer's standing ruling of 2026-07-28
 * that formula-derived payouts follow the formula: `first-proper-car` 519000 ->
 * 425000, `make-it-pull` 949000 -> 1113000, `the-fleet-spare` 237000 -> 266000,
 * `the-showroom-standard` 926000 -> 800000. Each budget cap moves with its own
 * payout, holding the one-price contract. Every figure is what `storyMissionProbes`'s
 * own `payoutYenFor` rule yields against a fresh measurement, never hand-picked.
 * `four-wheels` stays at 135000: it sits deliberately off the generic formula.
 *
 * Re-pinned 2026-07-28 (maintainer approval, in session) for the teardown and
 * repair retune, whose whole purpose is that a car's four plays rank correctly:
 * fix to the expected condition, fix past it, strip and recondition, strip as
 * found. Four levers, each approved by name:
 *
 * 1. `teardown.usedPartSaleFraction` 0.55 -> 0.3.
 * 2. `teardown.resaleBandFactors` is NEW - mint 1.0, fine 0.75, worn 0.55, poor
 *    0.1, with no `scrap` entry because a scrap part is unsellable. It is the
 *    condition curve used for RESALE only; `bands.bandFactors` (1.0/0.85/0.65/
 *    0.4/0.15) still drives repair cost and car value and is untouched. The
 *    resale curve is deliberately steeper at the bottom, so reconditioning a
 *    poor part to worn before selling it costs 10% of the part's price and
 *    returns 13.5%, while every rung above worn costs more than it returns.
 * 3. `partPricing.json`'s `classFactors` 0.25/1.0/1.6/2.5 -> 0.14/0.16/0.4/0.9.
 *    economy.json does not carry them, so this is recorded here rather than
 *    hashed here. Derived, not chosen: a tier's whole stock-parts basket now
 *    lands at 0.56/0.66/0.68/0.62 of what a typical car in that tier is worth
 *    (it ran 0.93/4.05/2.73/3.47 before), and the binding constraint is the
 *    cheapest car in each tier, which must not be strippable for profit. The
 *    entry-to-everyday step collapses because the re-tier made those two tiers
 *    the same price band; the old 4x step was calibrated when `shitbox` meant
 *    "cheap car" rather than "kei-sized components".
 * 4. `energy.actionPoints.removeAssembly` stays 0 and pulling an assembly stops
 *    being free anyway: `resolveRemoveAssembly` now charges that figure PLUS
 *    one `removePart` per member actually installed, the same shape
 *    `resolveRefitAssembly` already used for refit labour. An engine therefore
 *    costs 8 points to pull rather than 0, and re-prices itself if the assembly
 *    ever gains or loses a member. `refitAssembly`, `refitUnchangedMember`,
 *    `benchFitMember` and `benchRemoveMember` all stay at 0.
 *
 * Deleted in the same change, on the maintainer's instruction: economy-bible
 * law 6, the wage check. It charged a share of the weekly rent against one
 * car's repair, which directive 22 forbids outright. `wageMarginYen`,
 * `wageRatio`, `repairGainYen` and `rentDuringRepairYen` are gone from the
 * coherence row, the CSV export and the Python invariants, with no softened
 * replacement. What a repair is worth against the alternatives is measured by
 * the four-play ranking (`packages/sim/src/plays.ts`) instead, which charges no
 * overhead to any play.
 *
 * Every formula-derived mission payout moves with the parts prices, per the
 * maintainer's standing ruling of 2026-07-28 that formula-derived payouts
 * follow the formula: `wont-strand-her` 165000 -> 156000, `the-fleet-spare`
 * 266000 -> 388000, `first-proper-car` 425000 -> 614000, `make-it-pull` 1113000
 * -> 785000, `the-column-clock` 1048000 -> 1000000, `the-showroom-standard`
 * 800000 -> 704000, `low-and-loud` 1265000 -> 1162000,
 * `street-power-street-manners` 1343000 -> 952000, `under-one-fifteen` 1876000
 * -> 1701000. Each budget cap moves with its own payout, holding the one-price
 * contract. The directions differ because a cheaper parts basket cuts repair
 * cost but RAISES what a rough car is worth to buy. Every figure is what
 * `storyMissionProbes`'s own `payoutYenFor` rule yields against a fresh
 * measurement, never hand-picked. `four-wheels` is unchanged at 135000 and is
 * the one open question: it sits deliberately off the formula, and the taught
 * build now costs 138012 against its 135000 cap, so `tutorialProbe` is left RED
 * rather than moving a lever nobody signed.
 *
 * Re-pinned 2026-07-28 (maintainer approval, in session): `four-wheels`
 * payout/budget 135000 -> 142000, which answers the open question the
 * paragraph above left standing. This mission sits deliberately off the
 * generic formula (it is the tutorial), so this is a hand-set value, not a
 * formula re-derivation. The re-derived class factors made the scripted lot's
 * repair bill smaller, so the car itself got dearer while every part got
 * cheaper. Measured fresh through `tutorialProbe`, the taught build spends
 * 134912: the reserve 112832, one stock tyre 3100, the head/valvetrain rung
 * 980, the wheels line hire 3000, the engine line hire 15000. Against the old
 * 135000 that left 88 yen, well short of the 3100 the one sanctioned mistake
 * costs (sport rubber instead of the stock tyres the copy points at). At
 * 142000 the mistake is absorbed with 3988 to spare and designed profit is
 * 7088, inside the (0, 15000] band that probe asserts.
 *
 * Re-pinned 2026-07-28 (maintainer approval, in session):
 * `AUCTION_BUYOUT_PREMIUM` 1.25 -> 1.05 -> 1.00. Buying a lot outright rather
 * than bidding for it is meant to be an impatience tax with a way back, and at
 * 1.25 the premium exceeded what a restoration can add on most of the roster.
 * The maintainer then set it to exactly 1.00, full guide value with nothing
 * added on top: an INTERIM value, to be tuned again after playtesting.
 *
 * Read this premium against 0.81, not against 1.0, or the lever gets set wrong
 * again. It multiplies GUIDE value, but a contested win in the live room lands
 * at that room's clearing fraction, whose expectation is 0.8081 over the
 * shipped `auctionRoom` turnout bands and bargain chance. So 1.00 is not a
 * premium of nothing: it still costs 1.24x an average room win, and about 5%
 * more than the luckiest win a room can produce (a packed room clears at most
 * at 0.95 of guide). The premium sits on top of that implicit tax, which is
 * why 1.25 left the expectation play below water on 25 of the 26 models.
 *
 * The value is recorded with the measurement that judges it rather than with a
 * claim that it clears. Against each model's rough probe car
 * (`buildRoughProbeCar`, every slot at poor), restored value minus buyout price
 * minus restoration bill is positive at 1.00 on 26 of 26 models on the
 * repair-to-expectation play the economy actually asks for, and on 21 of 26 on
 * a full mint restoration; at 1.05 it was 21 and 20, and at 1.25 it was 1 and
 * 5. The five that miss on the mint play are honda-city-e-aa,
 * suzuki-wagon-r-ct21s, suzuki-alto-works-ha21s, honda-city-turbo-ii-aa and
 * honda-beat-pp1, whose break-even premiums run 0.781 to 0.971, every one of
 * them BELOW 1.00: a full mint restore on those five cannot repay even a buy at
 * flat guide, so the miss is Law 1's expectation band (mint-restoring a cheap
 * car burns the margin) rather than the premium's doing. Four of the five still
 * clear when the same car is won in the room at 0.8081; honda-city-e-aa, at
 * 0.781, clears on neither route.
 *
 * The tax that remains is visible on every model. On the expectation play the
 * buyout pays a median 4.4% of book where a room win on the same car pays 13.9%
 * of book, so buying outright still hands back roughly two thirds of the
 * restoration margin.
 *
 * PINNED FOR THE FIRST TIME 2026-07-29 (maintainer approval, in session: "T3
 * approved"): `partPricing.json` joins this gate. It was the one economy surface
 * directive 22 did not actually protect - Sprint 132 identified the gap in its own
 * section 5, called closing it "more valuable than any individual number", and then
 * never closed it. Eleven levers moved through the hole during that sprint and the
 * suite stayed green, and `classFactors` moved a twelfth time afterwards.
 *
 * The pin therefore locks in values already approved elsewhere, listed here by name
 * and value so the gate carries its own ledger from the start:
 *
 * - `baseCostYen`, the nine period-recalibrated entries signed in
 *   docs/sprints/sprint_archive/sprint132.md section 4a: exhaust 40000, springs 18000, dampers
 *   40000, brakePadsDiscs 15000, brakeCalipersLines 45000, intake 18000,
 *   ignitionEcu 28000, rims 34000, aero 26000. The other 21 are unchanged from the
 *   original sheet. These are NOT catalogue shelf prices: period bills carried 20 to
 *   35 per cent of mandatory accessories (ECU wiring harnesses, caliper mounting
 *   stays, metal catalysts to make an exhaust road-legal) and the review baked that
 *   into the base rather than modelling it separately.
 * - `gradeFactors` stock 1 / street 1.3 / sport 2 / race 3, the `race` rung 2.8 -> 3.0
 *   signed in the same section 4a table.
 * - `classFactors` entry 0.14 / everyday 0.16 / enthusiast 0.4 / flagship 0.9, signed
 *   with the teardown and repair retune recorded above (item 3 of that four-lever
 *   approval). Derived rather than chosen, and the entry-to-everyday step is small on
 *   purpose because the re-tier put those two tiers in the same price band.
 * - `globalFactor` 1, and `overrides` EMPTY, which is the state its own schema comment
 *   intends. Sprint 132 section 4c settled that the three suggested overrides (rotary,
 *   exotic and kei multipliers) cannot be expressed by this schema at all: it is keyed
 *   by SKU id and valued in absolute yen, with no multipliers and no car-level keys.
 *   The rotary premium became its own mechanic instead and is not in this sheet.
 * - `classFactors.legend` was deleted in Sprint 132 T1. It was inert (a plain z.object
 *   strips it) while reading as a live lever, which is the worst of the three states.
 *   The `legend` fitment class is deferred, and carries the `gaisha` mapping call and
 *   three new `expectationByTier.legend` values with it whenever it is picked up.
 *
 * Re-pinned 2026-07-29 (maintainer approval, in session): four formula-derived mission
 * payouts move because the 13-car re-tier changed the fitment class (and so the probe
 * cost) of the cars those missions build. economy.json and partPricing.json are
 * untouched, so their hashes hold. `first-proper-car` 614000 -> 687000, `make-it-pull`
 * 785000 -> 756000, `under-one-fifteen` 1701000 -> 1653000, `the-fleet-spare` 388000
 * -> 484000. Each budget cap moves with its own payout, holding the one-price contract.
 * Every figure is what `storyMissionProbes`'s own `payoutYenFor` rule yields against a
 * fresh measurement, never hand-picked.
 *
 * Re-pinned 2026-07-29 (maintainer approval, in session: "Levers 1 to 4 approved
 * exactly as written", lever 5 added the same day) for `docs/sprints/sprint_archive/sprint135.md`,
 * proportional power replacing the flat additive ladder. Five levers, each approved by
 * name and value:
 *
 * 1. `statFormulas.engineCharacter.naHighStrungThreshold` - NEW, 80.0 PS per effective
 *    litre. Splits a naturally aspirated car into `high-strung-na` or `lazy-na`;
 *    forced-induction cars read `forced` outright regardless of this value.
 * 2. Race-grade `statModifiers.powerFraction`, per engine character, on the eight
 *    power-bearing engine slots (block, internals, headValvetrain, camsTiming, intake,
 *    exhaust, ignitionEcu, forcedInduction) - the full 8x3 table is authored directly
 *    in `parts.json` and pinned by `packages/sim/tests/proportionalPower.test.ts` and
 *    `packages/sim/tests/engineCharacter.test.ts`. No `powerReferencePs` and nothing
 *    converted from the old ladder.
 * 3. `fuelSystem` and `clutch` carry `powerFraction` 0.000 at every grade and every
 *    character - the two pure enablers never partly pay for the gain their own slot
 *    demands.
 * 4. The grade shape per category (street/sport as a fraction of race): block,
 *    internals, camsTiming and forcedInduction linear (0.33 / 0.67 / 1.00);
 *    headValvetrain mildly diminishing (0.45 / 0.75); exhaust diminishing (0.50 / 0.80);
 *    intake strongly diminishing (0.60 / 0.85); ignitionEcu threshold-shaped
 *    (0.15 / 0.55). `forcedInduction` is deliberately linear for now; an increasing
 *    curve is hard-gated behind the support-ratio mechanism and lands separately.
 * 5. `partPricing.json`'s `gradeFactors` becomes a per-slot map with a `default` entry
 *    (the unchanged 1 / 1.3 / 2 / 3), plus a dedicated `ignitionEcu` ladder of
 *    1 / 1.30 / 4.77 / 8.67 - lever 4 gave the ECU a threshold-shaped power curve, and
 *    without its own price ladder the street rung was 2.89x worse value per horsepower
 *    than the race rung, making the top rung the only sensible buy. Every other power
 *    slot's curve stays close enough to the default shape that it is not given its own
 *    entry this sprint.
 *
 * `statModifiers.power` (the old flat PS delta) is removed from the schema and from all
 * 472 SKUs in the same change, per the sprint's own rule that a missing SKU then fails
 * schema validation rather than silently becoming a near-zero part.
 *
 * What moves as a MECHANICAL CONSEQUENCE of lever 5, not as an independent decision:
 * every mission whose probe build fits a non-stock `ignitionEcu` gets a dearer probe
 * (the ECU's sport and race rungs cost substantially more under the new ladder), so its
 * formula-derived payout/budget cap moves with it, exactly as every other formula-
 * derived payout in this ledger always has. Re-derived from a fresh
 * `storyMissionProbes.test.ts` run, never hand-picked: `make-it-pull` 756000 -> 772000,
 * `street-power-street-manners` 952000 -> 992000, `under-one-fifteen` 1653000 ->
 * 1693000. `the-column-clock`'s probe never touches `ignitionEcu`, so its payout is
 * unchanged.
 *
 * The proportional power change itself also moves four formula-derived STAT
 * THRESHOLDS in `storyMissions.json` (not gated by this hash, but recorded here as the
 * same class of mechanical re-derivation): `make-it-pull`'s power floor 191 -> 173 PS
 * (`floor90` of the freshly measured probe build), `the-column-clock`'s lap ceiling
 * 125 -> 125.7s and `under-one-fifteen`'s 114.9 -> 113.5s (both `ceil1AtTwoPercentSlower`
 * of the fresh lap time), and `street-power-street-manners`'s tuner taste-match floor
 * 0.97 -> 0.98 (`round2At97Percent` of the fresh taste ratio). Each is exactly what
 * `storyMissionProbes.test.ts`'s own fixed formula yields against the new power
 * figures, never hand-picked; `street-power-street-manners`'s hand-set power floor
 * (180, PROVISIONAL) is untouched, since it was never a `floor90(measured)` pin.
 *
 * Re-pinned 2026-07-29 (maintainer approval, in session: "Levers 1 to 4 approved
 * exactly as written, implement them"; levers 6, 7, 8 signed outright; lever 5 is a
 * copy proposal, not a value) for `docs/sprints/sprint_archive/sprint136.md`, support ratios and
 * reliability as what they move. Eight levers:
 *
 * 1. `statFormulas.support.specByGrade` (NEW) - the support-specification ladder:
 *    stock 0.00, street 0.25, sport 0.60, race 1.00.
 * 2. `statFormulas.support.demandWeights` (NEW) - cylinderPressure 2.00, fuelling
 *    0.80, heat 0.70, revs 3.50, torqueTransmission 0.90.
 * 3. `statFormulas.support.supportWeights` (NEW) - cylinderPressure {internals 0.45,
 *    block 0.25}, fuelling {fuelSystem 0.75}, heat {cooling 0.70}, revs
 *    {headValvetrain 0.25, internals 0.15}, torqueTransmission {clutch 0.30, gearbox
 *    0.25, driveline 0.15, differential 0.15}.
 * 4. `statFormulas.support.thresholds` (NEW) - adequateAtOrAbove 0.90,
 *    strainedAtOrAbove 0.75.
 * 5. `supportReadout.shortfallCopy`/`framingByBand` (NEW) - the warning's copy, a
 *    proposal like every other lever here, shown only at `strained`/`dangerous`.
 * 6. `statFormulas.support.coherenceExponent` (NEW) - 2.0.
 * 7. `CarModel.spec.reliabilityBase` (NEW, required field on `cars.json`, all 26
 *    shipped cars) - replaces `statFormulas.reliabilityCap` (70), which is RETIRED
 *    outright rather than moved. The 26 values, copied from
 *    `docs/design/midnight-garage-roster.csv`: toyota-carina-at150 100,
 *    honda-city-e-aa 99, nissan-sunny-b12 98, suzuki-wagon-r-ct21s 98,
 *    honda-civic-sir2-eg6 97, honda-crx-sir-ef8 96, toyota-sera-exy10 95,
 *    honda-prelude-si-vtec-bb4 95, toyota-aristo-30v-jzs147 95,
 *    toyota-supra-rz-jza80 94, toyota-chaser-tourer-v-jzx90 94,
 *    toyota-sprinter-trueno-ae86 94, nissan-cefiro-a31 93, toyota-mr2-aw11 93,
 *    nissan-silvia-s13 92, nissan-180sx-rps13 92, nissan-silvia-ks-s14 92,
 *    suzuki-alto-works-ha21s 91, honda-beat-pp1 91, toyota-mr2-sw20 90,
 *    nissan-skyline-gtr-bnr32 90, honda-city-turbo-ii-aa 88,
 *    subaru-impreza-wrx-sti-gc8 86, nissan-fairlady-z-z32 84,
 *    mazda-savanna-rx7-fc3s 82, mazda-rx7-fd3s 80.
 * 8. `statFormulas.condition.reliabilityCeiling` (NEW) - poor 0.55, scrap 0.25.
 *
 * `statModifiers.reliability` is removed from the schema and from all 472 SKUs in
 * the same change, per the same missing-SKU-fails-loudly rule Sprint 135 set for
 * `statModifiers.power`. `StatBlock.reliability` and the taxonomy's reliability
 * weights are untouched; only a purchased part's ability to add a flat number goes.
 *
 * Every valuation pin that reads a mint car's reliability moves, because the
 * ceiling is now per-car rather than a flat 70; re-derived from real runs
 * (directive 17 case (a)), see the sim test suite's own pins
 * (`packages/sim/tests/reliabilityModel.test.ts`, `valueModelProbes.test.ts`).
 *
 * Four story-mission reliability thresholds re-derive under the maintainer's
 * narrow 2026-07-29 exception ("if we change systems deliberately then downstream
 * should change too"): `wont-strand-her` 54 -> 75 and `first-proper-car` 54 -> 73
 * (both still `floor90(measured)` pins, on honda-city-e-aa and honda-civic-sir2-eg6
 * respectively, repaired to `fine`, all stock); `the-fleet-spare` 58 -> 79 (a
 * hand-set floor with margin, re-derived by the same share-of-the-ceiling method the
 * sprint doc names, on honda-crx-sir-ef8); `street-power-street-manners` 48 -> 82,
 * re-derived from a real run of the SUPPORTED probe build (the doc's own instruction:
 * the unsupported shape alone reads a dangerous 0.678 headline and 51-52 reliability,
 * so the probe now also fits sport-grade internals/block/fuelSystem/cooling/clutch/
 * gearbox/driveline/differential alongside the existing sport intake/exhaust/
 * ignitionEcu/forcedInduction, reaching an adequate 0.966 headline and reliability
 * exactly 92, `floor90(92)` = 82). The heavier probe also moves
 * `street-power-street-manners`'s own `payoutYen`/`budgetCapYen` (992000 -> 1453000,
 * the unchanged 1.3x/1.1x formula against the dearer probe cost) and its tuner
 * taste-match floor (0.98 -> 1.01) and `first-proper-car`'s first-timer taste-match
 * floor (0.97 -> 1), both `round2At97Percent` of the freshly measured taste ratio,
 * which moved because reliability is 57 per cent of a first-timer's taste and 37 per
 * cent of a tuner's. Each is recorded with its own arithmetic in
 * `docs/sprints/sprint_archive/sprint136.md`'s Exit, including which shipped cars each threshold now
 * excludes.
 *
 * Re-pinned 2026-07-30 (maintainer approval, in session, all nine levers signed by
 * name and value in the same session) for the Sprint 136 reliability rebalance
 * (`docs/sprints/sprint_archive/sprint136.md`'s amendment section), measured after the sprint
 * shipped and fixing three defects it left behind:
 *
 * 1. `parts-taxonomy.json` `statWeights.reliability` (NEW, additive, six parts) -
 *    tyres +2, brakeCalipersLines +2, steering +2, brakePadsDiscs +1, springs +1,
 *    underbody +1. Existing handling/style weights on all six are untouched.
 *    Total reliability weight rises 22 -> 31 across 15 -> 21 parts.
 * 2. `statFormulas.support.stockSupportMargin` (NEW) - 0.55. The stock car's own
 *    factory headroom, proportional to what the build demands rather than flat:
 *    `support[s] = 1 + stockSupportMargin * (demand[s] - 1) + supportWeights term`.
 * 3. `statFormulas.condition.reliabilityCeiling.poor` 0.55 -> 0.70.
 * 4. `statFormulas.condition.reliabilityCeiling.scrap` 0.25 -> 0.40.
 * 5. `statFormulas.condition.reliabilityCeilingWeightReference` (NEW) - 3 (the
 *    taxonomy's own highest reliability weight, cooling). The ceiling now reads
 *    `cap = 1 - (1 - reliabilityCeiling[band]) * min(1, weight / reference)`, the
 *    minimum across every reliability-bearing part, instead of a flat lookup on the
 *    worst band alone.
 * 6. Demand in `packages/sim/src/support.ts` now reads GRADE, not band (dropped the
 *    `* bandFactor(installed.band, economy)` term from the demand gain calculation).
 *    Not an economy.json value - a formula fix, recorded here because it moves
 *    reliability figures alongside the five content levers above. Band-scaled
 *    demand let a rotting gain part demand less of the bottom end it was rated for,
 *    which raised the coherence factor as the part aged (172 measured cases; the
 *    worn-FD figure docs/sprints/sprint_archive/sprint136.md published as 6, in its
 *    illustrative table's "race turbo on a stock bottom end, all worn" row, only
 *    reproduces without band-scaling - the shipped code gave 19).
 *
 * No mission payout, budget cap, or reliability threshold moves: `wont-strand-her`,
 * `first-proper-car` and `street-power-street-manners`'s probes are all-stock
 * uniform-band or already-adequate mint builds, mathematically unaffected by every
 * one of the six changes above (re-verified against a fresh
 * `storyMissionProbes.test.ts` run); `the-fleet-spare`'s fresh measurement (81, was
 * 82) still clears its hand-set 79 floor with margin. Every reliability pin that DID
 * move lives in `packages/sim/tests/reliabilityModel.test.ts` and
 * `supportRatios.test.ts`, both re-derived from real runs. `harnessAcceptance.test.ts`
 * passes untouched: reliability is not read by the lap model.
 *
 * Re-pinned 2026-07-30 (maintainer approval, in session, single lever signed by name
 * and value) for `docs/sprints/sprint_archive/sprint136.md`'s second same-day amendment:
 * `statFormulas.support.stockSupportMargin` 0.55 -> 0.27. The 0.55 value signed
 * earlier the same day was itself wrong: it put a mathematical floor of `margin +
 * (1 - margin) / demand` under every headline, which never fell below roughly 0.793
 * for any demand the shipped catalogue's own gain parts can produce - so `dangerous`
 * was unreachable through a pure demand/support imbalance anywhere on the 26-car
 * roster, and only a broken part (the severity ceiling) could ever produce it. 0.27
 * is the most robust point in the maintainer's signed valid window [0.22, 0.30].
 * Re-derived from real runs: a bare race turbo on `nissan-180sx-rps13` now reads
 * headline 0.699 (`dangerous`, was 0.815 `strained`) and reliability 56 (was 75); a
 * sport-grade turbo with matched sport fuelSystem/cooling on the same car reads
 * reliability 67 (was 83); the equivalent pair on `toyota-sprinter-trueno-ae86`
 * (whose analogous unsupported subsystem is `revs`, driven by `camsTiming` rather
 * than `forcedInduction`) reads 76 and 86, both `strained`. Every stock-mint and
 * fully-supported race build still reads exactly its own `spec.reliabilityBase` on
 * all 26 cars (unaffected by construction: a stock car's demand is always exactly 1
 * regardless of the margin). All four story-mission reliability thresholds were
 * checked against a fresh `storyMissionProbes.test.ts` run and none moved: none of
 * their probes is an imbalanced build the margin bites on. Full pin table and
 * arithmetic in `docs/sprints/sprint_archive/sprint136.md`'s second amendment.
 *
 * Re-pinned 2026-07-30 (adversarial-verification defect fix, no value approval
 * needed - directive 22 gates VALUES, and this changes none): `sprint136.md`'s own
 * Task 1 required "the demand and support maps are content, not code", but only the
 * support half moved there - WHICH slot drives each subsystem's demand
 * (`cylinderPressure`/`forcedInduction`, `revs`/`camsTiming`, the other three/total
 * gain) was still hard-coded in `packages/sim/src/support.ts` and hand-mirrored in
 * `packages/sim/tests/supportRatios.test.ts`. Added `statFormulas.support.
 * demandDrivers` (NEW, five entries, each `{ kind: 'slot', slot }` or `{ kind:
 * 'total' }`) carrying exactly the same mapping the code already implemented;
 * `support.ts` now reads it instead of hard-coding it, and the test's own hardcoded
 * mirror is deleted in favour of reading the same content. The hash moves because
 * the file gained a field; no demand weight, support weight, threshold or any other
 * value changed, confirmed by `supportRatios.test.ts` and `reliabilityModel.test.ts`
 * both passing unchanged.
 *
 * Re-pinned 2026-07-30 (maintainer approval, in session, single lever signed by name
 * and value: `stressCoefficient` = 0.20) for the reliability build-intensity term
 * (`docs/sprints/sprint_archive/sprint136.md`'s third amendment): `statFormulas.support.
 * stressCoefficient` (NEW) - 0.20. A fully supported race build no longer reads
 * exactly its own `spec.reliabilityBase`: reliability gains an OUTER multiplier,
 * `1 - stressCoefficient * totalGainFraction` (clamped to `[0, 1]`), where
 * `totalGainFraction` is the same `totalGain` accumulator `supportRatios` already
 * computes, exported as `totalGainFractionOf` (`packages/sim/src/support.ts`) so
 * there is exactly one implementation of the sum. Structurally independent of
 * `coherenceFactor`, not folded into its additive budget (that alternative was
 * measured and rejected: it subtracts an identical flat amount from a supported
 * and an unsupported build alike). Exactly 1 at zero total gain, so a stock car is
 * unaffected by construction and every stock-mint pin in this suite holds
 * unchanged. **This supersedes the "a supported race build reads exactly its own
 * base" claim recorded in the `stockSupportMargin` re-pin above (2026-07-30,
 * "Every stock-mint and fully-supported race build still reads exactly its own
 * `spec.reliabilityBase`..."): that claim was true when written and is left in
 * place as the historical record of what that change did; from this lever onward
 * it is a supported build with ZERO total gain that reads exactly base, not every
 * supported build.** Full arithmetic and every re-derived pin in
 * `docs/sprints/sprint_archive/sprint136.md`'s third amendment and `packages/sim/tests/
 * reliabilityModel.test.ts`.
 *
 * Re-derived in the same change, as a MECHANICAL CONSEQUENCE of the `stressCoefficient`
 * lever above rather than an independent decision: `street-power-street-manners` is the
 * one story mission whose probe fits aftermarket gain parts (Sprint 136's own signed
 * exception covering this mission's reliability threshold as a `floor90(measured)` pin,
 * not a chosen design number). Its probe's measured reliability moves 92 -> 82 under the
 * new outer factor, so `storyMissions.json`'s `statThreshold(reliability).min` re-derives
 * `floor90(82)` = 82 -> **73**, and its `tasteMatch(tuner).minMultiplier` re-derives
 * `round2At97Percent` of the freshly measured taste ratio, 1.01 -> **1**. Neither
 * `payoutYen` nor `budgetCapYen` moves (both stay 1453000): the probe's cost is
 * unaffected by reliability, so `payoutYenFor`/`budgetCapYenFor` of that unchanged cost
 * are unchanged, confirmed by a fresh `storyMissionProbes.test.ts` run rather than
 * assumed. The other three reliability-gated missions (`wont-strand-her`,
 * `the-fleet-spare`, `first-proper-car`) are unaffected: all three probes are all-stock
 * or cosmetics-only builds with zero total gain, so the new factor is exactly 1 there.
 * This is not the movement of an unlisted lever: `stressCoefficient` is the one value
 * signed, and this threshold is its arithmetic consequence, not a second decision.
 *
 * Re-pinned 2026-07-29 (maintainer approval, in session, both levers signed as a pair)
 * for `docs/sprints/sprint_archive/sprint137.md`, the forced-induction return curve. `economy.json`
 * is untouched (only `parts.json` and `partPricing.json` move), so its hash holds. Two
 * levers:
 *
 * 1. `forcedInduction`'s `statModifiers.powerFraction` grade shape, street and sport
 *    only (race is unchanged) - increasing, 0.20 / 0.45 of the race value per
 *    character: high-strung NA street 0.040, sport 0.090; lazy NA street 0.056, sport
 *    0.126; forced street 0.070, sport 0.158. Authored in `parts.json`, pinned by
 *    `packages/sim/tests/engineCharacter.test.ts`.
 * 2. `partPricing.json`'s `gradeFactors` gains a `forcedInduction` entry, 1 / 1.30 /
 *    2.93 / 6.50 - derived so price tracks power exactly (1.30/0.20 = 2.93/0.45 =
 *    6.50/1.00 = 6.50), so climbing the turbo ladder never improves value per yen.
 *
 * What moves as a MECHANICAL CONSEQUENCE, not an independent decision:
 * `street-power-street-manners` is the one story mission whose probe fits a sport-grade
 * `forcedInduction`, so its formula-derived figures re-derive from a fresh
 * `storyMissionProbes.test.ts` run: `statThreshold(reliability).min` `floor90(measured)`
 * 73 -> 74 (the build-intensity term reads the new, larger sport-grade gain fraction);
 * `payoutYen`/`budgetCapYen` `payoutYenFor(probeCostYen)` 1453000 -> 1497000 (the
 * probe's sport-grade turbo costs more under the new ladder). `tasteMatch(tuner).
 * minMultiplier` is unchanged at 1. No other mission's probe touches `forcedInduction`
 * at a non-stock grade.
 *
 * Re-pinned 2026-07-30 (maintainer approval, in session, both levers signed by name
 * and value) for `docs/sprints/sprint_archive/sprint137.md`'s amendment, the `camsTiming` price
 * correction that fixed the acceptance-2b defect this sprint's own Exit had left
 * open. `economy.json` is untouched (only `partPricing.json` moves), so its hash
 * holds. Two levers, approved as a pair:
 *
 * 1. `baseCostYen.camsTiming` 30000 -> 50000.
 * 2. `gradeFactors.camsTiming` (NEW own-ladder entry) - stock 1, street 1.3, sport
 *    2.75, race 4.5, replacing the shared default (1 / 1.3 / 2 / 3). Sprint 137's own
 *    acceptance test found `camsTiming` won power-per-yen at every rung for both NA
 *    characters, by up to 192 per cent, because its base cost undercut an exhaust
 *    while delivering like a major engine part; period parts research judged the
 *    power figures grounded, so the price sheet was the defect.
 *
 * Measured against a fresh `packages/content/tests/partPricing.test.ts` run: the
 * catalogue-wide residue (cases above parity, 288 total) fell 51 -> 39, its maximum
 * held at 1.334961x (`internals/entry/high-strung-na/street`, untouched by this
 * lever), and the worst cross-slot power-per-yen margin anywhere in the catalogue is
 * now 18.023 per cent (`forcedInduction`/everyday/`forced`/sport, `exhaust` over
 * `intake`) - `forced` is otherwise unmoved, since neither `camsTiming` lever touches
 * it. Everyday class: high-strung NA now reads street `intake` +2.211%, sport
 * `camsTiming` +3.904%, race `camsTiming` +16.667%; lazy NA reads street `intake`
 * +17.662%, sport `intake` +13.357%, race `camsTiming` +3.519%. Player prices,
 * everyday class: street 6200 -> 10400, sport 9600 -> 22000, race 14400 -> 36000;
 * flagship race 81000 -> 202500.
 *
 * What moves as a MECHANICAL CONSEQUENCE, not an independent decision: raising
 * `baseCostYen.camsTiming` raises the STOCK-grade price too (its grade factor is
 * unchanged at 1), so every mission whose probe reads a stock `camsTiming` part's
 * catalog price re-derives, re-measured from a fresh `storyMissionProbes.test.ts`
 * run: `first-proper-car` 687000 -> 686000, `the-column-clock` 1000000 -> 999000,
 * `low-and-loud` 1162000 -> 1161000, `the-fleet-spare` 484000 -> 483000,
 * `the-showroom-standard` 704000 -> 703000 (all small, mixed-direction moves from the
 * repair-cost and purchase-price formulas both reading the dearer stock part).
 * `make-it-pull` moves the most, 772000 -> 787000, because its probe fits a
 * sport-grade `camsTiming` directly (`honda-civic-sir2-eg6`, everyday class): the
 * SKU's own price rose 9600 -> 22000 under both levers together. `four-wheels`,
 * `wont-strand-her`, `street-power-street-manners` and `under-one-fifteen` are
 * unaffected (re-confirmed passing, unchanged, in the same run): none of their
 * probes' repair or purchase math is sensitive to this SKU's price at the cars and
 * bands they build.
 *
 * Re-pinned 2026-07-30 under the standing lever grant recorded as R3 in
 * `docs/design/systems/sale-value-implementation-plan.md` (all seven levers signed by
 * name and value in `docs/sprints/sprint_archive/sprint144.md`'s own lever table, provisional pending
 * the maintainer's ratification) for Sprint 144, sections 3C and 3D of
 * `sale-value-system.md`: an incoherent build
 * now discounts the car (Stage C, new) and parts retention scales with coherence
 * instead of being flat (Stage D, changed). Seven levers:
 *
 * 1. `valuation.coherenceDiscountWeight` (NEW) - 0.35. Stage C:
 *    `coherenceDiscount = coherenceDiscountWeight * (1 - coherenceFactor) *
 *    coherenceTolerance`.
 * 2. `valuation.retentionFloor` (NEW) - 0.30.
 * 3. `valuation.retentionCeiling` (NEW) - 1.10. Stage D:
 *    `retention = retentionFloor + (retentionCeiling - retentionFloor) *
 *    coherenceFactor`, replacing the flat `partsRetention`.
 * 4. `valuation.partsRetention` - DELETED (was 0.55), not left inert. Added to
 *    `retiredIdentifiers.test.ts` in the same change.
 * 5. `valuation.tolerance.default` (NEW) - 1.0, the market's own view: every
 *    buyer-agnostic caller of `marketValueYen` (the auction anchor, diagnosis
 *    pricing, the balance probes, taste-blind exits) reads this by not passing the
 *    function's new optional `coherenceTolerance` parameter at all.
 * 6. `valuation.tolerance.stancer` (NEW) - 0.0: the stancer ignores the discount
 *    entirely.
 * 7. `valuation.tolerance.tuner` (NEW) - 0.5: the tuner feels half of it. Only
 *    `valuateCarForBuyer`/`valuateCarForBuyerViaChannel` read a named archetype's
 *    override (`coherenceToleranceFor`, `valuation.ts`); an archetype with no entry
 *    (collector, racer, first-timer) falls back to `default`.
 *
 * The stock-car invariant (a car with no aftermarket parts must value exactly as
 * before) is asserted across all 26 shipped cars in
 * `stockCarValuationInvariant.test.ts` and holds: coherence reads fitted GRADE only,
 * never band, so an all-stock car's `coherenceFactor` is exactly 1.0 regardless of
 * condition, making Stage C's discount exactly zero and Stage D's retention curve
 * multiply nothing (every slot is `grade === 'stock'`, which
 * `installedPartsValueYen` already excludes). No mission payout, budget cap, or
 * balance-probe figure moves: every `balanceProbes.ts` probe car is built via
 * `stockInstanceFor` (all-stock, real generation-grade parts only), and every
 * story-mission probe that fits aftermarket parts (`street-power-street-manners`)
 * fits a matched, supported build whose measured headline (0.966) sits above the
 * `adequate` knee (0.90), so its `coherenceFactor` is also exactly 1.0, capped -
 * re-confirmed passing, unchanged, by a fresh `storyMissionProbes.test.ts`,
 * `balanceProbes.test.ts` and `valueModelProbes.test.ts` run. `economy.json`'s hash
 * changes only because of the four schema keys added and the one deleted.
 *
 * Re-pinned (under the R3 standing lever grant, `docs/design/systems/sale-value-
 * implementation-plan.md`, signed by name in `docs/sprints/sprint_archive/sprint145.md`'s lever table
 * and provisional pending the maintainer's ratification) for a car looking like itself:
 * `statFormulas.styleCap` (flat 20 for every car) is RETIRED outright, the same
 * footing `reliabilityCap` left this file on in the Sprint 136 entry above. It is
 * replaced by `CarModel.spec.styleBase`, a per-car value authored for all 94 roster
 * rows (91 from the original research pass; the three missing ones - Honda Civic
 * 1.5 EF2 6, Nissan S-Cargo 12, Nissan Laurel Club S C33 11 - authored in the same
 * change) and required on all 26 shipped cars. The scale is unchanged at 4 to 20,
 * matching the retired cap's own ceiling: a deliberate restraint, not an oversight -
 * rescaling those 94 judged values is authoring work for a later sprint, recorded in
 * TODO.md rather than done here.
 *
 * A mint stock car authored at `styleBase` 20 reads style exactly as it did under
 * the flat cap (asserted in `derivedStats.test.ts`); every car below 20 now reads
 * less style than before, so its taste score falls for any buyer weighting style,
 * which is the correction this sprint makes, not a regression. One mission
 * requirement moves as a MECHANICAL CONSEQUENCE, re-derived from a fresh
 * `storyMissionProbes.test.ts` run rather than hand-picked: `low-and-loud`'s probe
 * (a mint `nissan-silvia-ks-s14` with sport aero/rims and street seats, authored
 * `styleBase` 14) now measures style 56 (was 62 under the flat cap), so
 * `statThreshold(style).min` `floor90(measured)` re-derives 55 -> 50, and
 * `tasteMatch(stancer).minMultiplier` `round2At97Percent(measured ratio)` re-derives
 * 1 -> 0.99. Neither `payoutYen` nor `budgetCapYen` moves (both stay 1161000): the
 * probe's cost is unaffected by style, confirmed by the mission-payouts test above
 * passing unchanged. No other story mission's probe carries a style-gated
 * requirement, so no other threshold moves; re-confirmed by the same fresh run.
 *
 * Re-derived for Sprint 146 (buyer statTargets, all six archetypes signed under the
 * R3 standing lever grant, `docs/design/systems/sale-value-implementation-plan.md`,
 * provisional pending the maintainer's ratification, `docs/sprints/sprint_archive/sprint146.md`):
 * `normalizedTasteScore` (valuation.ts) became a per-stat target/upper/importance
 * MATCH instead of a weighted mean of five deliberately anti-correlated stats.
 * `economy.json` is untouched (only `Buyer.statTargets`, buyers.json, and the
 * private scoring function's body move), so its hash holds; every mission's
 * `tasteMatch.minMultiplier` re-derives mechanically from a fresh
 * `storyMissionProbes.test.ts` run against each probe's SAME build, never
 * hand-picked: `first-proper-car` (first-timer) 1 -> 1.08, `low-and-loud`
 * (stancer) 0.99 -> 1.07, `street-power-street-manners` (tuner) 1 -> 1.07. Every
 * probe's own stat thresholds, payout and budget cap are unaffected - taste never
 * touches `marketValueYen`, only the taste-match requirement's own ratio.
 * `make-it-pull`, `the-column-clock`, `the-fleet-spare`, `the-showroom-standard`,
 * `four-wheels`, `wont-strand-her` and `under-one-fifteen` carry no `tasteMatch`
 * requirement and are unaffected.
 *
 * Re-derived for the Sprint 146 amendment (the shortfall normalisation defect):
 * `tasteMatchFor` (valuation.ts, split out from `normalizedTasteScore` in the same
 * change) now normalizes each stat's shortfall by the room it had to fall short in
 * (`/ target` below the bar, `/ (1 - upper)` above it) instead of carrying it as an
 * absolute gap in score units. No target, upper or importance value moves - every
 * `Buyer.statTargets` entry in `buyers.json` is untouched, per the amendment's own
 * constraint - so this is not a directive-22 lever; `economy.json` is untouched and
 * its hash holds. Every mission's `tasteMatch.minMultiplier` re-derives mechanically
 * from a fresh `storyMissionProbes.test.ts` run against each probe's SAME build,
 * never hand-picked: `first-proper-car` (first-timer) 1.08 -> 1.07, `low-and-loud`
 * (stancer) 1.07 -> 1.06, `street-power-street-manners` (tuner) 1.07 -> 1.05. Every
 * probe's own stat thresholds, payout and budget cap are unaffected, as before.
 *
 * NOT a re-pin, recorded here because this file is the ledger of what moved and why:
 * under the R3 standing lever grant (`docs/design/systems/sale-value-implementation-
 * plan.md`), provisional pending the maintainer's ratification, `AUCTION_BUYOUT_PREMIUM`
 * was swept at 1.00/1.02/1.03/1.05/1.08 (`docs/sprints/sprint_archive/sprint146.md`, "Amendment 2") to try
 * to close the instant-flip guard's remaining gap. Measured, not applied: the premium
 * cancels algebraically out of the guard's own `marginMedian < bound` comparison (both sides
 * share the identical `/ premium - 1` shape), so the guard's real pass condition reduces to
 * `resaleMedian < (spreadMin + spreadMax) / 2` regardless of the premium's value - confirmed
 * empirically at all five swept values and at two absurd control values (5 and 1000). No
 * value in economy.json changed; `AUCTION_BUYOUT_PREMIUM` stays at 1.00 and this hash holds
 * unchanged. The old flat walk-in spread, the buyer tables and `pickWeightedCandidate`'s
 * weighting were left untouched per the ruling's own instruction; closing the guard needs
 * one of those, or a fix to the guard's own bound formula, neither of which this sweep was
 * authorised to pull. Sprint 147 is the fix to the first of those.
 *
 * Re-pinned for Sprint 147's normalised listing clock (docs/sprints/sprint_archive/sprint147.md, all seven
 * levers signed by name and value under the R3 standing lever grant recorded in
 * `docs/design/systems/sale-value-implementation-plan.md`, provisional pending the
 * maintainer's ratification):
 * `selling.offerSpread` (the flat uniform band applied identically to a listing regardless
 * of age) is RETIRED outright and replaced by a new `liquidity` block, seven levers:
 * `stalenessFloor` 0.35, `stalenessHalfLifeOffers` 3.5, `qualityFresh` 0.98, `qualityFloor`
 * 0.86, `qualityHalfLifeOffers` 3.0, `qualitySpread` 0.04, `relistRecovery` 0.70. Both the
 * offer-chance staleness curve and the offer-quality curve read `ForSaleEntry.offersSeen`
 * only, never a day count - the hard constraint this sprint exists to enforce. No mission
 * payout, budget cap, or balance-probe figure moves: none of those pipelines reads
 * `economy.selling`/`economy.liquidity` at all. The instant-flip guard's own bound is
 * rewritten against the new quality curve's fresh mean rather than the retired spread's
 * midpoint - see that probe's own updated comment for the arithmetic.
 *
 * Re-pinned under the R3 standing lever grant (`docs/design/systems/sale-value-
 * implementation-plan.md`), provisional pending the maintainer's ratification, closing
 * the instant-flip guard `docs/sprints/sprint_archive/sprint147.md` left red: `liquidity.qualityFresh`
 * 0.98 -> 0.96. `sellViaWalkIn`'s own contract is a buyer offering somewhat under their
 * true valuation for the convenience of an instant sale, and 0.98 was only a 2% convenience
 * discount that `pickWeightedCandidate`'s size-biased pick then ate 1.44 points of (the
 * picked buyer's taste runs about `tasteSpread^2` above the taste-free market read, since
 * the draw is weighted by valuation). 0.96 also moves the 1.0 clamp from z = +0.5 to
 * z = +1 on the quality draw's own Normal, so roughly 16% of fresh offers land near full
 * value instead of 31% piling on the ceiling. `pickWeightedCandidate`'s weighting is
 * unchanged and stays: it is the mechanism that lets a specialised build find its buyer.
 * No other lever moves. Measured median instant-flip margins, entry/everyday/enthusiast/
 * flagship: -1.07%/-1.22%/-0.55%/-0.06% (qualityFresh 0.98, guard red) -> see
 * `valueModelProbes.test.ts`'s own updated guard for the closed figures.
 *
 * Re-pinned for Sprint 148's space and rent (docs/sprints/sprint_archive/sprint148.md, both lever groups
 * signed by name and value, under the standing lever grant recorded as R3 in
 * docs/design/systems/sale-value-implementation-plan.md): selling a car now costs a
 * forecourt slot, and rent scales with what the shop owns rather than sitting flat forever.
 * Three lever groups:
 *
 * 1. `WEEKLY_RENT_YEN` (flat 20000) is RETIRED outright, replaced by a new `rent` block:
 *    `rent.baseWeeklyYen` 6000, `rent.perBayWeeklyYen.service` 5000,
 *    `rent.perBayWeeklyYen.parking` 2000, `rent.perBayWeeklyYen.forecourt` 1500.
 *    `weeklyRentYen = baseWeeklyYen + sum over kinds of (bayCount[kind] *
 *    perBayWeeklyYen[kind])` (`finances.ts`'s `computeWeeklyRentYen`), chosen so day 1 is
 *    unchanged at exactly 20000 (6000 + 5000x1 + 2000x3 + 1500x2). Added to
 *    `retiredIdentifiers.test.ts` in the same change.
 * 2. The `forecourt` facility (NEW, `facilities.json`) - `startCount` 2, `maxCount` 8,
 *    `bayPricesYen` [150000, 220000, 320000, 450000, 620000, 800000], `minReputationTier`
 *    [local, local, known, known, respected, respected].
 * 3. `requiresForecourt` (NEW, required on every `sellingChannels` entry): true when a buyer
 *    comes to look at the car in person, false when it is collected or shipped instead.
 *    `shopFront`/`freeAdsPaper`/`tunerMagazine`/`weekendMeet` are true; `tradeNetwork` is the
 *    one false.
 *
 * Listing a car on a `requiresForecourt` channel now moves it onto a forecourt slot, freeing
 * its real one; delisting (or switching to the trade network) is the reverse move, falling
 * back to the grace slot and refusing only when even that is taken. The forecourt is
 * deliberately NOT acquisition capacity: `hasOwnedShopSpace`/`hasAcquisitionSpace` keep their
 * exact prior meaning. No mission payout, budget cap, or balance-probe figure moves: none of
 * those pipelines reads rent or the selling channels' capacity flag. `partPricing.json` is
 * untouched, so its own hash holds.
 *
 * Re-pinned for Sprint 149's calendar (docs/sprints/sprint149.md, signed under the standing
 * lever grant recorded as R3 in docs/design/systems/sale-value-implementation-plan.md,
 * provisional pending the maintainer's ratification): a new `calendar` block, six levers,
 * scheduling positions rather than economic values - no yen figure changes in this sprint.
 * `calendar.daysPerWeek` 7 (replaces the three private `% 7` literals `advanceDay.ts`,
 * `finances.ts` and `marketHeat.ts` each kept), `calendar.daysPerMonth` 28 (four clean weeks,
 * so a month boundary always lands on a week boundary too), `calendar.auctionDayOfWeek` 3
 * (Wednesday), `calendar.meetDayOfWeek` 7 (Sunday, the weekend), `calendar.paydayOfWeek` 5
 * (Friday), `calendar.rentDayOfWeek` 1 (Monday, the start of the week). Rent and wages split
 * off the one shared 7-day boundary they used to fire on together onto these two separate
 * named days; each still falls exactly once per `daysPerWeek`-day span, so the amount charged
 * per week is unchanged (`finances.test.ts`'s own 28-day total-unchanged test asserts this
 * directly) - only which day it lands on differs. The weekend meet's one guaranteed draw now
 * waits for `calendar.meetDayOfWeek` instead of firing on whichever day happened to be the next
 * End Day after listing. No mission payout, budget cap, or balance-probe figure moves: none of
 * those pipelines reads the calendar block. `partPricing.json` is untouched, so its own hash
 * holds.
 *
 * Re-pinned 2026-07-31 (MAINTAINER RULING, explicit and signed - NOT under R3, which expired
 * once the maintainer reviewed `docs/sprints/sale-value-arc-lever-ledger.md`): `calendar.
 * rentDayOfWeek` 1 -> 7. The maintainer's own words: "rent starts on day 7. like current." This
 * is the one lever moved; `paydayOfWeek` stays 5, `meetDayOfWeek` stays 7, `auctionDayOfWeek`
 * stays 3, `daysPerWeek` stays 7, `daysPerMonth` stays 28. At `rentDayOfWeek` 1 a brand-new
 * player's very first End Day took 20,000 off their 300,000 starting cash before they had
 * bought, fixed or sold anything; day 7 restores the pre-sprint149.md `day % 7 === 0` cadence
 * exactly. Rent day 7 now coincides with meet day 7 - ruled fine and expected, since one is a
 * charge and the other is a selling-channel draw, not a defect to fix. `partPricing.json` and
 * every mission payout/budget cap are untouched (confirmed passing unchanged): none of those
 * pipelines reads the calendar block. What moves as a consequence: `advanceDay.test.ts`'s two
 * golden-master hashes (job-loop `db7f2695` -> `8cf486eb`, acquisition-to-sale `0d29ca19` ->
 * `634d4493`, both re-run twice to confirm determinism) and its "rent is charged again" count
 * (5 -> 4, since the 30-day script's rent days move from 1/8/15/22/29 back to 7/14/21/28). Both
 * new hashes are exactly the PRE-sprint149.md values recorded in `sale-value-arc-lever-ledger.md`
 * ("sprint148/149 | 8cf486eb -> db7f2695" and "634d4493 -> 0d29ca19"), confirming the change
 * restores the prior state bit for bit rather than merely restoring the rent day. `finances.
 * test.ts`'s 28-day total-unchanged tests pass untouched: the amount charged per week never
 * moved, only which day it lands on.
 *
 * Re-pinned for Sprint 150 (docs/sprints/sprint150.md; MAINTAINER RULINGS of 2026-07-31,
 * explicit and signed - NOT under R3, which expired when the maintainer reviewed the arc's
 * lever ledger). Three content changes, one of them a value and two of them shape:
 *
 * 1. `auctionRoom.reserveFraction` 0.55 -> RETIRED, unified into the existing
 *    `AUCTION_RESERVE_PRICE_FRACTION` (already 0.6, unchanged). The ruling in full: "set the
 *    reserve to 0.6 everywhere." One idea had two authored numbers over the SAME base (the
 *    lot's guide value: `bidding.ts`'s `anchorValueYen` and the live room's `roomReadYen` are
 *    both `carGuideValueYen`), five points apart, so the room opened below the reserve its own
 *    auction card printed. The live room now folds the single top-level fraction into its
 *    tuning via `auctionRoom.ts`'s `roomConfigFrom`; the retired name is in
 *    `retiredIdentifiers.test.ts`. A cold room's clearing draw floor rises with it
 *    (`clearingFractionFor` draws a bargain room between the reserve and the turnout band's
 *    `clearMin`, so that band narrows) - a stated consequence of the ruling, and no other lever
 *    moved to compensate.
 * 2. `calendar.auctionDayOfWeek` 3 -> RETIRED, replaced by `auction.cadenceByTier`: per-room
 *    opening hours (`openDaysOfWeek` + `weeksBetween`), signed as tabled. `local-yard` [1,3,5,7]
 *    weekly, `regional` [2,4] weekly, `premium` [6] weekly, `collector-network` [6,7] every
 *    SECOND week. Cadence is a property of the VENUE, not the calendar: one global auction day
 *    gave a player who had earned four rooms exactly one buying day a week, which is backwards.
 *    The day-6 overlap between `premium` and `collector-network` on alternate weeks is
 *    deliberate and pinned by test; attending costs no part of the day. Week 1 is an open week
 *    for every room, so `local-yard` sits on day 1 and the day-1 tutorial bug sprint149.md
 *    recorded is closed by construction. `calendar` keeps `daysPerWeek` 7, `daysPerMonth` 28,
 *    `meetDayOfWeek` 7, `paydayOfWeek` 5, `rentDayOfWeek` 7, all untouched.
 * 3. No yen figure moves anywhere else. `partPricing.json` and every mission payout/budget cap
 *    are untouched (confirmed passing unchanged): none of those pipelines reads the auction
 *    cadence, and the reserve fraction they DO read (`AUCTION_RESERVE_PRICE_FRACTION`) is the
 *    survivor at its existing 0.6.
 *
 * Re-pinned for Sprint 151 (docs/sprints/sprint151.md), authenticity becoming a fact about the
 * car. ONE key leaves economy.json and no value moves: `valuation.genuinePeriodMultiplier`
 * (1.25) is RETIRED outright, on the same footing `partsRetention` and `styleCap` left this
 * file on. It multiplied an installed part's contribution when that instance was genuine
 * period; no shipped content ever set `genuinePeriod` true (six construction sites hardcoded
 * false), so it multiplied by exactly 1.0 on every part of every car in the game and its
 * deletion cannot move a single yen. The flag it read is retired with it, along with
 * `CarInstance.authenticityPercent` (a stored rng.int(60, 95) roll) and
 * `statModifiers.authenticity` (exactly 0 on all 472 SKUs); all four are in
 * `retiredIdentifiers.test.ts`.
 *
 * NOT gated by this hash, recorded here because this file is the ledger of what moved and why:
 * `parts-taxonomy.json` gains a `statWeights.authenticity` column on all 29 slots, totalling
 * exactly 100 - block 18, paint 11, panels 11, aero 10, internals 8, rims 7, headValvetrain 6,
 * gearbox 6, camsTiming 4, seats 4, forcedInduction 3, springs 2, then 1 apiece for steering,
 * chassis, differential, dampers, brakeCalipersLines, underbody, exhaust, ignitionEcu, intake
 * and dashGauges, and 0 for tyres, brakePadsDiscs, clutch, cooling, fuelSystem, driveline and
 * antiRollBars. These are PRELIMINARY figures accepted as sane defaults, recorded in that
 * sprint doc as the values implemented rather than signed under directive 22, so a later pass
 * can move them. `authenticityPercentOf` (packages/sim/src/derivedStats.ts) reads them twice,
 * once for originality and once for the condition factor, which is why a weight of 0 removes a
 * slot from both.
 *
 * No mission payout or budget cap moves: none of those pipelines reads authenticity, which
 * enters valuation only through buyer taste and never through `marketValueYen`. What DOES move
 * is every generated board and both `advanceDay` golden hashes, because generation stopped
 * consuming an rng draw for the retired roll and every draw after it in the stream shifts.
 *
 * Re-pinned for Sprint 152 (docs/sprints/sprint152.md), style becoming an axis a car can climb.
 * ONE key ENTERS economy.json and no existing value moves:
 * `statFormulas.styleSaturationPoints` = **60**. It is the exchange rate between the
 * catalogue's style points and every car's own headroom: an aftermarket part no longer ADDS
 * style, it closes the gap between the car's own `spec.styleBase` and its own new
 * `spec.styleCeiling`, and `reach = min(1, fitted / styleSaturationPoints)` says how much of
 * that gap a given fit buys. At 60 against the 82 points a fit-the-best-in-every-slot build
 * totals, a focused build reaches its car's ceiling without needing literally every style part.
 *
 * This is a PRELIMINARY figure, recorded in that sprint doc as the value implemented rather
 * than signed under directive 22, so a later pass can move it.
 *
 * NOT gated by this hash, recorded here because this file is the ledger of what moved and why:
 * `cars.json` gains `spec.styleCeiling` on all 26 shipped cars and every one of the 26
 * `spec.styleBase` values is REPLACED, both promoted from `docs/design/midnight-garage-roster.csv`
 * where they are authored for all 94 roster rows. The base scale moves from the retired flat
 * cap's own 4-to-20 (Sprint 145's deliberately un-rescaled placeholder) to a real 15-to-88, and
 * the ceilings run 42 to 96. Those are PRELIMINARY too, reviewed and accepted as sane in
 * `docs/design/systems/style-authoring-proposal.md`. No part SKU changes: the 19 style-bearing
 * families keep their points, and what moves is what those points buy.
 *
 * No mission payout or budget cap moves, and `partPricing.json` holds: style reaches value only
 * through buyer taste, never through `marketValueYen`. Every story mission's own
 * `statThreshold(style)` and `tasteMatch.minMultiplier` DOES move, re-derived mechanically from
 * a fresh `storyMissionProbes.test.ts` run against each probe's same build rather than
 * hand-picked, because a stock car's style is no longer near zero.
 *
 * Re-pinned for Sprint 153 (docs/sprints/sprint153.md), cars no longer arriving as wrecks. ONE
 * key leaves economy.json and ONE enters it:
 *
 * 1. `partsGeneration.minWorkBillFractionByTier` (entry 0.1 / everyday 0.06 / enthusiast 0.05 /
 *    flagship 0.04) is RETIRED outright, on the same footing `partsRetention`, `styleCap` and
 *    `genuinePeriodMultiplier` left this file on. Generation broke parts until the repair bill
 *    reached that fraction of book value, with a 121-step spin guard as its only real limit, so
 *    it authored 62 to 89 per cent of the final damage on every car in the game and hit cheap
 *    cars hardest (their parts are cheap, so it had to break more of them). Measured on the
 *    1993 Wagon R the tutorial ships: 14.5 of 29 slots at `poor`. `enforceMinWorkBill` and
 *    `minWorkTopUpCeilingBinds` are retired with it, in `retiredIdentifiers.test.ts`.
 * 2. `partsGeneration.damageGrades` (NEW) - `weights` tidy 45 / used 35 / rough 15 / project 5,
 *    the roster-wide shares tabled in `docs/design/systems/generation-damage.md` layer 1 and
 *    signed there; and `bandStepsByGrade` tidy 2 / used 5 / rough 11 / project 20, what each
 *    grade buys in BAND STEPS. The share table is the signed half. The step ladder is a
 *    PRELIMINARY figure, recorded in that sprint doc as the value implemented rather than
 *    signed under directive 22: the design fixes the mechanism (a budget counted in steps, not
 *    yen) and the shares, and leaves the size of each grade to a first pass that a later tuning
 *    round can move. Measured against the retired floor on the same Wagon R: 3.8 slots at
 *    `poor` rather than 14.5, and 15.4 slots at `fine` or better rather than 4.9.
 *
 * There is NO per-venue lever. An earlier draft of the sprint carried a presentability floor
 * (premium refusing worse than `rough`, collector-network worse than `used`); it was CUT by
 * maintainer ruling, because a rare wreck at a premium auction is interesting rather than a
 * problem. The roughness gradient across rooms is entirely emergent from the already-signed
 * `auction.carTierWeightsByAuctionTier`, and `auctions.test.ts` now asserts that emergent
 * ordering directly rather than leaving it assumed.
 *
 * NOT gated by this hash, recorded here because this file is the ledger of what moved and why:
 * `CarModel.spec` gains a required `yearTo`, authored for all 94 roster rows in
 * `docs/design/midnight-garage-roster.csv` and copied onto the shipped 26, and the hardcoded
 * nine-year `rng.int(0, 8)` model-year window is replaced by the car's own production window.
 * Four roster rows that had never carried a `yearFrom` at all (the Honda Today, the Mira TR-XX
 * L70, the BCNR33 and the R35) gain one in the same pass, since a window with one end missing
 * cannot be validated. `AUCTION_MIN_AGE_YEARS` is untouched at 3 and still sits inside the same
 * `max()`, so a 1994 model in a 1995 campaign still generates as a 1994 car.
 *
 * No mission payout or budget cap moves: none of those pipelines reads generation damage or the
 * model-year window, and `partPricing.json` is untouched so its own hash holds. What DOES move
 * is every generated car in the game, which is the point of the sprint, and with it both
 * `advanceDay` golden hashes and every probe derived from `buildRoughProbeCar`.
 *
 * Re-pinned 2026-07-31 (maintainer approval, in session, single lever signed by name and value):
 * `partsGeneration.damageGrades.bandStepsByGrade` doubles across the board - tidy 2 -> 4, used
 * 5 -> 10, rough 11 -> 22, project 20 -> 40. `damageGrades.weights` is untouched. Both halves of
 * `damageGrades` are now SIGNED: `weights` was signed with the mechanism itself, and
 * `bandStepsByGrade` (PRELIMINARY at Sprint 153) is signed here for the first time.
 *
 * Both `advanceDay` golden hashes move with it (30-day career `ca96a465` -> `e37069f7`,
 * acquisition-to-sale `0a55e42e` -> `4ae2f761`), as do `schemas.test.ts`'s lever pin and
 * `docs/design/systems/worked-example-two-cars.md`. `partPricing.json` and every mission payout
 * are untouched.
 *
 * At this value, three generation guards calibrated against the smaller budget read red and were
 * left untouched, not relaxed: `auctions.test.ts`'s age-0 regression (measures 8.09% against its
 * signed 5% ceiling), its Wagon R "reads as tidy" headline, and `generationCoherence.test.ts`'s
 * barely-driven-car median.
 *
 * Re-pinned (maintainer approval, in session, two levers signed by name and value): a further 20
 * per cent rise on `bandStepsByGrade` (tidy 4 -> 5, used 10 -> 12, rough 22 -> 26, project 40 ->
 * 48), paired with a new age gate - `projectGateMaxAgeYears` 6 and `projectGateMaxMileageKm`
 * 60000 - that demotes a rolled `project` to `rough` on any car under both thresholds, since the
 * flat roll otherwise put the worst grade on cars too young and lightly used to have earned it.
 *
 * Re-pinned for Sprint 153's core-loop amendment (economy-bible.md's core-loop clause, which the
 * budget had left unimplemented since the retired floor was the only mechanism that guaranteed
 * work on a lot). ONE key enters `partsGeneration.damageGrades`: `minWorkSteps` = **10**. The
 * budget formula becomes `max(minWorkSteps, round(bandStepsByGrade[grade] * wearExposure(...)))`,
 * so a scaled `tidy` roll on a barely-driven car can no longer round toward zero fixable work. Ten
 * steps against a car's 26 ordinary slots is a handful of parts dropped one band each (mint to
 * fine), which is real work but well short of what it takes to ruin one (three steps reach
 * `poor`).
 *
 * Both `advanceDay` golden hashes move with it (30-day career `dc007267` -> `aa7ec752`,
 * acquisition-to-sale `3c84008d` -> `5f6dd458`), as does `schemas.test.ts`'s lever pin. The floor
 * also compresses `auctions.test.ts`'s grade-ladder gap test (tidy is now pulled up toward the
 * floor), re-derived there rather than in this file. `partPricing.json` and every mission payout
 * are untouched.
 *
 * `generationCoherence.test.ts`'s barely-driven-car median ruined-parts guard reads red at this
 * value (median 1 against its signed 0) and was left untouched, not relaxed, per this sprint's own
 * stop rule: no bound was loosened and no second lever was tuned to chase it green.
 *
 * Re-pinned 2026-07-31 (MAINTAINER RULING, explicit and signed): ONE lever moves,
 * `valuation.expectationByTier.entry.band` `worn` -> **`fine`**. `everyday` and `enthusiast` were
 * already `fine` and `flagship` stays **`mint`**. NO other value moves - every `beyondDiscount`
 * (0.4 / 0.8 / 1.2 / 1.3) and every `aftermarketReturn` (0.3 / 0.6 / 0.9 / 1.0) is untouched.
 *
 * The defect this closes. `entry` expected `worn`, and the only band below `worn` is `poor`, so
 * giving a cheap car real work and ruining it were the same operation: a cheap car could not carry
 * a meaningful repair bill without being a wreck. Measured over 600 generated local-yard lots,
 * 25.8 per cent arrived with fewer than three parts below the expected band, so a quarter of the
 * first room a player ever sees held nothing worth doing.
 *
 * `flagship` was carried to `fine` as part of the same ruling and then REVERTED to `mint` on the
 * maintainer's instruction, because the measurement said the drop cost more than it bought: with
 * flagship at `fine` the dead-lot rate at premium and collector-network went 13.67% -> 17.17% and
 * 6.00% -> 20.83%, since a flagship often arrived already presentable. `beyondDiscount` 1.3 on that
 * tier is therefore still inert on a mint-expectation car, which is deliberate and NOT dead
 * content: it is waiting on the machining system to create a rung above mint for it to price.
 *
 * Measured over 600 generated lots per room (`generateAuctionCatalog`, 60 draws of 10 per room,
 * seed `hashStringToSeed("expectation-profile-<room>-<draw>")`, calendar year 1995), pre-sprint
 * (entry `worn`, flagship `mint`) -> shipped (entry `fine`, flagship `mint`). Lots with fewer than
 * three parts below the expected band: local-yard 25.83% -> 4.17%, regional 17.00% -> 8.83%,
 * premium 13.67% -> 13.17%, collector-network 6.00% -> 6.00%. Only the two lower rooms move, which
 * is exactly the scope of a lever that touches the `entry` tier alone. Law 1 as a number (median
 * profit from repairing to expectation, `bill x (marketRepairDiscount - 1)`) is clearly positive in
 * every room and rises where the bar rose: 5130 -> 11628, 7863 -> 10488, 15240 -> 15348, 42261 ->
 * 42261 yen.
 *
 * Both structural guards hold untouched. Law 1: `marketRepairDiscount` stays 1.3, so every yen
 * spent below the expected band still returns 1.3. Law 2: `worstCaseBill <= maxBillFraction x
 * cleanValue` is a GENERATION guard against the mint-referenced bill, which this change does not
 * touch at all (the expectation band only splits that bill for valuation), and
 * `marketRepairDiscount x maxBillFraction` = 1.3 x 0.6 = 0.78 < 1 is unmoved.
 *
 * What moves as a MECHANICAL CONSEQUENCE, re-derived from real runs rather than hand-picked: every
 * `balanceProbes` figure that reads the expectation band, `valueModelProbes`'s expectation-band
 * probes, the acquisition-to-sale `advanceDay` golden hash, `workedExample`'s two-car walkthrough
 * and its published doc, and the tutorial's scripted Wagon R. `partPricing.json` is untouched, so
 * its own hash holds.
 *
 * ONE mission payout moves with it, per the maintainer's standing ruling that formula-derived
 * payouts follow the formula ("NO mission payouts are set in stone"): `wont-strand-her` 156000 ->
 * **125000**, its budget cap with it (the one-price contract). Its probe car, the Honda City E, is
 * the only `entry`-tier car any mission probe builds on, and `payoutYenFor` reads that build's
 * cost, which opens with the uniform-`worn` car's `marketValueYen` - the one term the expectation
 * band does move. Every other formula-derived payout re-derives to its existing pin unchanged, and
 * `four-wheels` is unchanged at 142000 because it sits deliberately off the generic formula.
 *
 * The tutorial's scripted lot is re-authored in the same change rather than its payout being tuned
 * to chase the probe band (maintainer ruling: "the tutorial car is wrong, not the number").
 * `tutorialLot.json` `baseBand` `worn` -> `fine`, the now-redundant `internals: fine` override
 * dropped, and four honest-wear items on a 96,000 km daily added at `worn` (clutch,
 * brakePadsDiscs, dampers, exhaust). The two taught faults are untouched (scrap tyres, a `poor`
 * head/valvetrain), so the car arrives mostly at the bar it is now held to, carrying only the jobs
 * the tutorial teaches plus wear a player may leave. Measured fresh through `tutorialProbe`: the
 * taught build spends 133724 (reserve 111644, one stock tyre 3100, the head/valvetrain rung 980,
 * the wheels hire 3000, the engine hire 15000), designed profit is 8276 inside the (0, 15000] band
 * that probe asserts, and the one sanctioned mistake is absorbed with 5176 to spare.
 *
 * Re-pinned 2026-07-31 under the maintainer's R4 grant (recorded in
 * `docs/design/systems/sale-value-implementation-plan.md`: "just decide on a value, implement,
 * test, and DOCUMENT what you changed") for `docs/sprints/sprint154.md`, layer 2 of
 * generation-damage.md: a car gets a HISTORY, and the history is the cause of everything else
 * about its condition. Four levers move inside `partsGeneration`, and one retires:
 *
 * 1. `damageGrades.careProfiles` (NEW) - five grade distributions over tidy/used/rough/project,
 *    exactly as the design doc's table signs them: cherished 70/25/5/0, enthusiast 50/35/13/2,
 *    mixed 45/35/15/5, hammered 25/35/30/10, worked 20/35/33/12.
 * 2. `damageGrades.careProfileByCulture` (NEW) - which profile each of the 13 authored cultures
 *    starts from: exotic and kyusha cherished; wangan, touge, rotary and touring-car enthusiast;
 *    front-drive-tuner and oddball mixed; drift, rally-bred and kurokan hammered; honest-transport
 *    and kei worked. `CarTier` then shifts the choice ONE step along the ladder (flagship toward
 *    cherished, entry toward worked), which is code rather than content because it is the ladder's
 *    own ordering, not a number.
 * 3. `damageGrades.upkeepTierByGrade` (NEW) - tidy cherished, used average, rough neglected,
 *    project neglected. This is what RETIRES `partsGeneration.upkeepTierWeights` (0.25/0.50/0.25)
 *    rather than moving it: the upkeep roll and the history roll asked the same question, so the
 *    upkeep tier is now read off the history instead of drawn beside it. The three upkeep EFFECT
 *    tables (`upkeepBaselineOffset`, `upkeepJitterRange`, `upkeepMissingMultiplier`) are untouched.
 * 4. `damageGrades.aftermarketChanceMultiplierByGrade` (NEW) - tidy 0.6, used 1.0, rough 1.6,
 *    project 2.0, multiplying the unchanged `aftermarketChance` of 0.06. Chosen for the property
 *    that it REDISTRIBUTES rather than inflates: weighted by the emergent grade mix its mean is
 *    0.995 across the full 94-car roster and 1.054 across the shipped 26, so the aftermarket rate
 *    barely moves, while the spread between a garaged car and a hard-driven one is 3.33x.
 * 5. `damageGrades.weights` (45/35/15/5) is RETIRED, not moved. It was one flat table for a Toyota
 *    2000GT and a Honda Acty alike. The roster-wide mix is now emergent from the 94 authored
 *    cultures and measures 43.4/32.3/18.7/5.6 across the full roster.
 *
 * `bandStepsByGrade`, `projectGateMaxAgeYears`, `projectGateMaxMileageKm`, `minWorkSteps`,
 * `maxBillFraction`, `wearExposureByMileageKm` and every valuation lever are untouched.
 * `partPricing.json`'s hash holds and no mission payout or budget cap moves: none of those
 * pipelines reads how a generated car was treated. Both `advanceDay` golden hashes DO move, because
 * the history roll now happens before the parts loop rather than after the symptom roll and the
 * retired upkeep draw is gone, so every generated board changes.
 *
 * Re-pinned 2026-07-31 under the maintainer's R4 grant (`docs/design/systems/
 * sale-value-implementation-plan.md`), closing the finding sprint154.md's Exit left open. One
 * lever, named and valued here per R4's requirement: `diagnosis.symptomChanceByTier` - entry
 * 0.55 -> 0.597, everyday 0.5 -> 0.513, enthusiast 0.45 -> 0.474, flagship 0.35 -> 0.357.
 *
 * The ruling: the signed number describes what a PLAYER meets - a symptom present or absent -
 * not what goes into the roll. `applySymptoms` drops a symptom outright when it would breach the
 * Law 2 ceiling, and Sprint 154's care profiles left cars closer to that ceiling on every class, so
 * the roll rate and the rate a player actually experiences are no longer the same number. Rather
 * than treat the roll as the thing being signed, the roll is raised until what survives the veto
 * lands back on the signed intent. **`symptomChanceByTier` and the true per-car roll probability are
 * now two different numbers on purpose**, and that gap is not fixed: anything that changes how rough
 * generated cars are (a care-profile edit, a zone-severity table, a `maxBillFraction` change) moves
 * how much the veto eats and reopens the gap. See `TODO.md`'s Open engineering entry for the standing
 * hazard this creates.
 *
 * Every value was found by measurement, not arithmetic: `auctions.test.ts`'s own symptom-rate
 * methodology (all 26 shipped cars, seeds 0-299 each, bucketed by fitment class) run against
 * candidate inputs and bisected per class until the effective rate landed on the signed target,
 * then rounded to three decimals and re-measured at the rounded value. Classes are independent
 * (a car's fitment class fixes which table entry it reads), so each was searched separately.
 * Measured effective rate at the shipped inputs: entry 0.5505 (signed 0.55, drift +0.0005),
 * everyday 0.5000 (signed 0.50, drift 0), enthusiast 0.4522 (signed 0.45, drift +0.0022), flagship
 * 0.3533 (signed 0.35, drift +0.0033) - all four inside the test's 0.05 tolerance with room to
 * spare. No second lever was touched: the veto itself, `maxBillFraction`, and every care-profile
 * and zone table from Sprint 154 are unchanged.
 *
 * Both `advanceDay` goldens were re-checked: the 30-day master held unchanged (that script's
 * rolled lots do not fall on a symptom draw the new inputs move), and the acquisition-to-sale
 * golden moved (`4c86d4c9` -> `81133d36`) because the RNG draw sequence inside symptom generation
 * shifts with the input on the one script that actually buys and sells a rolled car.
 * `workedExample.test.ts` was re-run and is unaffected; `partPricing.json` and every mission
 * payout and budget cap hold.
 *
 * Re-pinned 2026-08-01 for Sprint 155 (damage patterns, `generation-damage.md` layer 3), under
 * the same R4 grant. `damagePatterns.json` joins this gate as a fourth pinned file, because a
 * pattern's slot weights are levers in every sense that matters even though they are not economy
 * numbers. Levers moved, named and valued per R4's requirement:
 *
 * 1. NEW `damageGrades.patternWeightsByGrade` - which named thing happened to a car that arrived
 *    at each grade. tidy 60/25/6/7/2, used 30/40/12/15/3, rough 8/34/24/26/8, project
 *    2/20/33/25/20 over garaged / neglected-commuter / frontal-collision / drifted / grenade. A
 *    tidy car mostly has no story; a project car got that way for a reason, and the two reasons
 *    people give up on a car are a shunt and a let-go engine.
 * 2. NEW `damageGrades.patternSymptomBias` 0.6 - how hard the pattern leans on the symptom draw,
 *    as a linear blend between an even draw (0) and a fully pattern-proportional one (1). At 0.6
 *    the most-implicated group runs about 3x the least on a directional pattern and nothing falls
 *    below 0.54 of an even draw, so a shunted car with a tired gearbox stays a real car.
 * 3. NEW `damagePatterns.json` - five patterns, each a weighting over the six taxonomy groups and
 *    the five panel zones, and nothing else. No band, no amount, no list of effects.
 * 4. `diagnosis.symptomChanceByTier` MOVED AGAIN - entry 0.597 -> 0.566, everyday 0.513 -> 0.510,
 *    enthusiast 0.474 -> 0.465, flagship 0.357 -> 0.365. Not a re-tune: these four are derived,
 *    not authored, as `signed / measured survival` (see the 2026-07-31 entry above for the
 *    ruling). Biasing the symptom draw toward the pattern's own groups draws symptoms that
 *    survive the Law 2 veto more often, so survival rose from about 0.92 to 0.958-0.980 and the
 *    inputs come back down. Survival was measured at 1500 seeds per shipped model (n=10500
 *    entry / 12000 everyday / 13500 enthusiast / 3000 flagship, roughly 4x the sample the
 *    2026-07-31 entry used), the inputs set to `signed / survival` rounded to three decimals, and
 *    the effective rate re-measured at the rounded values: entry 0.5524, everyday 0.4998,
 *    enthusiast 0.4507, flagship 0.3493, every class within 0.0025 of signed. Disclosed rather
 *    than smoothed over: at that sample only `entry` had drifted materially (+0.0305); everyday
 *    (+0.0027), enthusiast (+0.0091) and flagship (-0.0080) were inside one to two standard
 *    errors, and their moves are refinements from the larger sample rather than corrections.
 *
 * Nothing else moved. `bandStepsByGrade`, `minWorkSteps`, the age gate, `maxBillFraction`, the
 * care profiles, the zone severity tables and every valuation lever are untouched, and the zone
 * ARRANGEMENT this sprint added is a pure permutation of the severities those tables already
 * rolled (`panels`/`paint` derive from the worst panel zone, and a worst-of is permutation
 * invariant), so no derived band, repair bill or Law 2 check sees a different distribution.
 * `partPricing.json` holds and no mission payout or budget cap moves.
 *
 * Re-pinned 2026-08-01 for Sprint 156 (listing channels, `listing-channels.md`), under the same
 * R4 grant. A channel was a fee and a taste ceiling, with no buyer pool at all, so the tuner
 * magazine and the weekend meet priced byte-identically on both worked-example cars. Levers moved,
 * named and valued per R4's requirement:
 *
 * 1. NEW `sellingChannels[*].buyerPoolWeights` - one draw multiplier per buyer archetype, on the
 *    four persona channels (the trade network has no persona and carries none). Over collector /
 *    tuner / stancer / racer / first-timer / kei-specialist:
 *    shopFront 1 / 1 / 1 / 1 / 1 / 1 (flat: everyone walks past a forecourt, nobody is favoured);
 *    freeAdsPaper 0.4 / 0.5 / 0.5 / 0.2 / 1.6 / 1.4 (the classifieds: practical buyers, plus the
 *    collector who combs small ads for a survivor); tunerMagazine 0.15 / 1.8 / 0.6 / 1.4 / 0.05 /
 *    0.05 (a tuning monthly's readership); weekendMeet 0.3 / 1.2 / 1.8 / 0.5 / 0.1 / 0.8 (a car
 *    park on a Sunday night, stance-led). Multiplied INTO the existing valuation-weighted draw,
 *    never in place of it, so the size bias holding the instant-flip guard closed survives.
 * 2. NEW `sellingChannels[*].poolWidening` - shopFront 0.35, freeAdsPaper 0.5, weekendMeet 0.4,
 *    tunerMagazine 0.25. The weight an archetype with NO stated interest in the car's tier still
 *    draws at, which is what finally makes `Buyer.tierPreferences[].weight` (authored 0.3 to 1.0
 *    and, until this sprint, read by nothing) a probability rather than a wall. Ordered by how far
 *    each channel reaches past the people already looking at that league of car: the paper widest,
 *    because presence-widening is the niche `sale-value-system.md` S6 gives it; the magazine
 *    narrowest, a national title with a specific readership, but non-zero so a tuned Alto Works is
 *    reachable by the people who would actually want it.
 * 3. NEW `selling.channelStandingFocusByReputationTier` - unknown 1, local 1.2, known 1.45,
 *    respected 1.7, legend 2. The exponent `buyerPoolWeights` is raised to before the draw, so
 *    standing sharpens a channel's own crowd rather than opening a door or adding to a price. A
 *    flat pool is untouched by any exponent, so the free shop front never improves, which is the
 *    design rather than a coincidence of the values.
 * 4. NEW `StoryMission.unlocksSellingChannel`, the `unlocksAuctionTier` pattern applied to
 *    channels: `low-and-loud` opens `weekendMeet`, `street-power-street-manners` opens
 *    `tunerMagazine`. Not an economy.json value and not gated by this hash; recorded here because
 *    it decides when two of these five channels exist at all. Both missions' `deliveredCopy` gains
 *    the sentence that hands the introduction over. Shop front, free ads paper and trade network
 *    stay open from day one, and the schema forbids a mission claiming either always-open channel.
 *
 * NOT moved, deliberately: `tasteCeiling` on any channel, including the shop front's 1.00, which
 * R4 covered and the maintainer's own note preferred to leave alone ("widening who appears may be
 * the better half of the answer"). No fee moves. No cadence moves. `matchedOnly` and
 * `requiresForecourt` are untouched on every channel. No mission payout or budget cap moves, and
 * `partPricing.json` and `damagePatterns.json` both hold.
 *
 * Both `advanceDay` goldens were re-checked and BOTH HELD unchanged: neither scripted career's
 * offer draw falls on a pool the weighting reorders. The instant-flip guard was re-measured rather
 * than assumed - it stays green, and its medians move to entry -1.68%, everyday -0.92%, enthusiast
 * -0.99%, flagship +1.87% (from a bound of 0.10), because the walk-in now reads each archetype's
 * own tier-preference weight. The worked example was regenerated: the magazine and the meet no
 * longer agree on either car (Wagon R ¥224,587 to a tuner who fails the matched gate, against
 * ¥239,769 to the kei specialist; Silvia ¥448,745 to a tuner against ¥460,775 to a shakotan), and
 * which of the two pays more now depends on the car rather than the fee.
 *
 * Re-pinned for Sprint 158 (docs/sprints/sprint158.md), two defects found by measurement after
 * the arc shipped. ONE key ENTERS economy.json, ONE moves, and four are RENAMED with no value
 * change:
 *
 * 1. `partsGeneration.patternConditionSwingPercent` = **7** (NEW). How far a damage pattern moves
 *    a slot's rolled condition, in percent per unit of its group's relative pattern weight, summed
 *    to exactly zero across the car. A pattern reached the mechanical groups only through the
 *    damage budget, which is a fifth of a car's band steps, so the widest group it could move
 *    measured 1.26x the flat baseline while the body zones moved 1.47x. Rearranging the rolled
 *    condition instead tops out at a measured 1.22x, so the roll itself has to move. At 7, against
 *    band widths of 20 to 30 percent and a sharpest authored relative weight of 3.7 (`grenade`,
 *    engine), the loudest group shifts by about one band and no more, and the widest measured
 *    per-group multiple lands at 1.53x with total damage per pattern still inside 1.06.
 * 2. `statFormulas.styleSaturationPoints` 60 -> **66**, moved with the catalogue it prices rather
 *    than on its own. See below.
 * 3. `sellingChannels.*.buyerPoolWeights["kei-specialist"]` -> `["hobbyist"]` on all four channels
 *    that carry a pool. A pure rename: 1, 1.4, 0.05 and 0.8 are unchanged. The archetype was never
 *    kei-only (`tierPreferences` entry 1.0 AND everyday 0.6) and every other archetype is a
 *    role-noun. The old name is in `retiredIdentifiers.test.ts`.
 *
 * NOT gated by this hash, recorded here because this file is the ledger of what moved and why:
 * `parts.json` re-authors `statModifiers.style` on 144 rows (36 SKU families across the four
 * fitment classes). The axis was three parts long: `aero` 30, `rims` 20 and `seats` 18 totalled 68
 * against a saturation of 60, so a car reached its ceiling on three purchases and every other
 * style part in the game was then worth exactly nothing on it. Style now sits on TEN slots with a
 * best-in-slot ladder of aero 18, rims 14, seats 10, dampers 8, dashGauges 8, exhaust 7, springs 7,
 * brakeCalipersLines 6, tyres 6, intake 4 - 88 points total, of which the loudest three hold 47.7
 * per cent (was 83). Grade order holds in every slot, which it did not before: `dampers` ran street
 * 3, sport 0, race 0. Against 66, a top-grade build buys half a car's headroom in three parts, four
 * fifths in five and the last of it in seven (was one, two and three). `buyers.json` renames the
 * archetype and re-authors its want-line, which claimed it only wanted keis; no target, importance
 * or tier-preference value moves. `partPricing.json` holds: a SKU's price reads its slot, class and
 * grade, never its stat block.
 *
 * Re-pinned for `docs/sprints/sprint159.md`, a panel that can be beyond saving. TWO NEW LEVERS,
 * BOTH **RATIFIED** on the measurements recorded below:
 *
 * 1. `partsGeneration.zoneStates.zoneBeyondRepairChance` (NEW) - **0.18**. The chance the panel a
 *    car's damage pattern hit hardest escalates past weldable, applied only when the car's rolled
 *    history is `rough` or `project` AND that panel's metal already sits at the weldable maximum,
 *    so at most one panel per car can ever reach it.
 * 2. `partsGeneration.zoneStates.zonePanelMissingChance` (NEW) - **0.25**. The chance such a panel
 *    is absent outright rather than ruined in place.
 *
 * No pricing lever moves with them: `partPricing.json`'s `baseCostYen.zonePanel` (6000) and
 * `baseCostYen.panels` (28000) are untouched, and that file's hash holds. The panel price is what a
 * later sprint prices against the system this one produces.
 *
 * The realised rates the two chances produce, measured over 3000 generated lots per fitment class
 * against a game year of 1995, as the share of cars carrying at least one such panel: entry 3.67%
 * beyond repair / 1.20% absent, everyday 1.27% / 0.40%, enthusiast 0.43% / 0.20%, flagship 0.03% /
 * 0.00%. The gradient is emergent rather than authored: a flagship's culture rarely rolls a heavy
 * history at all, which is the intended reading (nobody wrecks one and walks away).
 *
 * Law 2 was measured, not assumed, because `enforceMaxBillFraction` now sees a panel price in a
 * generated bill and could have clipped real damage to stay under the ceiling. Same seeds, same
 * code, both chances at 0 against both at the values above: across all four classes NOT ONE car in
 * 12000 came out with fewer band steps, and mean band steps per car moved 53.235 -> 53.275 (entry),
 * 44.534 -> 44.546 (everyday), 38.622 -> 38.626 (enthusiast) and 30.8990 -> 30.8993 (flagship) -
 * up in every class, because a beyond-repair panel takes the `panels` carrier from `poor` to
 * `scrap`. Generated body damage got louder, never quieter.
 *
 * Re-pinned for `docs/sprints/sprint160.md`, splitting the body-kit price basis. ONE key ENTERS
 * `partPricing.json` and NO value moves:
 *
 * 1. `baseCostYen.bodyKit` (NEW) - **28000**, exactly today's `baseCostYen.panels`. The twelve
 *    `aero`-slot body-kit SKUs (FRP Lightweight, Sport and Carbon, four fitment classes each)
 *    repoint their `priceBasisPartId` from `panels` to it. `baseCostYen.panels` was doing two
 *    unrelated jobs, pricing a bodyshell and pricing a body kit, so raising the shell dragged
 *    every kit with it. The number is unchanged; only what it means is.
 *
 * Every one of the 472 resolved SKU prices is byte-identical before and after, verified by
 * re-resolving the whole catalogue against both sheets: 0 moved. The twelve kits read entry
 * 5100/7800/11800, everyday 5800/9000/13400, enthusiast 14600/22400/33600 and flagship
 * 32800/50400/75600 for street/sport/race in both. `economy.json` is untouched and its hash holds.
 *
 * NOT approved and NOT implemented here, recorded because this file is the ledger: the two values
 * the split unblocks, `baseCostYen.zonePanel` 6000 -> 30000 and `baseCostYen.panels` 28000 ->
 * 140000, await the maintainer's signature and land in their own change.
 *
 * Re-pinned 2026-08-01 for `docs/sprints/sprint162.md` (maintainer approval, in session, both
 * levers signed by name and value against the measurements in
 * `docs/design/systems/body-system-analysis.md` Parts 5 and 6). TWO levers, and no third:
 *
 * 1. `baseCostYen.zonePanel` 6000 -> **30000**. A replacement panel cost less than the tin of
 *    filler needed to repair one, so beating a dented wing was never the frugal route on a cheap
 *    car. The floor is arithmetic: repair beats swap in every salvage state only once
 *    `0.7 x panel > 1900`, i.e. above about 2714 yen. The ceiling is the rot toll a tier-1 shop
 *    cannot weld its way out of, which holds under 5 per cent of an entry car's value here and
 *    reaches 8.8 per cent at twice this value.
 * 2. `baseCostYen.panels` 28000 -> **140000**, the same 4.667 ratio the sheet already carried, so
 *    five zone panels come to 107 per cent of the shell they bolt to on all four classes (it ran
 *    103 to 111 per cent before). Without it the sheet would assert that one bonnet costs more
 *    than the whole shell.
 *
 * `baseCostYen.bodyKit` STAYS at 28000, which is the whole point of the basis split recorded
 * above: 472 SKUs re-resolved against both sheets, 24 move (the 20 zone panels and the 4 shell
 * SKUs) and the 12 body kits are byte-identical, still entry 5100/7800/11800, everyday
 * 5800/9000/13400, enthusiast 14600/22400/33600, flagship 32800/50400/75600. `economy.json` and
 * `damagePatterns.json` are untouched and their hashes hold.
 *
 * Every consequence below was re-measured against the code as it now stands rather than carried
 * over from the pre-sprint-159 probe:
 *
 * - **The lemon threshold barely moves, and only downward.** 26 models x 100 seeds = 2600 real
 *   generated cars, each priced both ways so the delta is the levers' alone: 7 cars change status,
 *   0 new lemons and 7 cured. By the factor clause alone (the only clause that reads a price)
 *   entry 119 -> 118, everyday 49 -> 44, enthusiast 21 -> 16, flagship 1 -> 1. The factor's own
 *   median delta is -0.0120 / -0.0076 / -0.0054 / -0.0048 by class and its largest absolute move
 *   anywhere is 0.0555. `costWeightedBandFactor` is read by the lemon rule and by nothing else, so
 *   this is the whole of that lever's reach into valuation.
 * - **Generated body damage does not get quieter.** 26 models x 400 seeds = 10400 lots, generated
 *   under both sheets from the same seeds. Everyday, enthusiast and flagship are byte-identical on
 *   every car; entry differs on 17 of 2800 and comes out 6 band steps LOUDER in total (9 cars lose
 *   steps to `enforceMaxBillFraction`, 6 gain them as the refused candidate hands the step to
 *   another slot). Law 2 therefore brushes the entry class and does not bite it.
 * - **The whole-body bill stays a sane fraction of the car.** Bill to the class expectation band as
 *   a share of the car's own `marketValueYen`, median and p90: entry 7.63% -> 7.66% and 30.25% ->
 *   31.82%, everyday 1.30% -> 1.31% and 2.85% -> 2.86%, enthusiast 0.31% -> 0.31% and 1.07% ->
 *   1.09%, flagship 0.25% -> 0.25% and 0.41% -> 0.41%. To mint, entry reads 11.18% -> 11.22%
 *   median and 40.03% -> 40.05% p90. The bill is capped by the repair route, so price cannot
 *   inflate it: only the 3.36% of entry cars (0.88% everyday, 0.22% enthusiast, 0.00% flagship)
 *   carrying a panel past saving or absent pay a panel at all.
 * - **Repair now beats swap on money at every class**, on both representative zone states, by 1040
 *   to 24290 yen; before, the swap won outright on entry and everyday. Swapping still wins on time
 *   at tool tier 2 (by 1 point on light damage, 9 on a rotted panel) and at tool tier 3 on a rotted
 *   panel (6 points); on light damage at tool tier 3 the two routes tie at 9 points. Below tool
 *   tier 2 a panel past saving still has no repair route at all, so the swap remains the only exit,
 *   which is the role these values give it.
 *
 * What moves as a MECHANICAL CONSEQUENCE, not an independent decision, re-derived from a fresh
 * `storyMissionProbes.test.ts` run rather than hand-picked: eight formula-derived mission payouts,
 * each budget cap with its own payout, holding the one-price contract. `wont-strand-her` 125000 ->
 * 123000, `the-fleet-spare` 483000 -> 481000, `first-proper-car` 686000 -> 684000,
 * `the-column-clock` 999000 -> 996000, `the-showroom-standard` 703000 -> 701000, `low-and-loud`
 * 1161000 -> 1159000, `street-power-street-manners` 1497000 -> 1494000, `under-one-fifteen`
 * 1693000 -> 1690000. Every one falls by 0.17 to 1.60 per cent, because a probe's start car carries
 * no `zoneState` and so prices its body carriers from the catalogue, which raises the restoration
 * bill inside `marketValueYen` slightly faster than it raises the repair leg. `four-wheels` (off
 * the generic formula) and `make-it-pull` are unchanged. The 30-day `advanceDay` golden moves with
 * the shell weight; the acquisition-to-sale golden holds.
 *
 * Also measured and disclosed rather than smoothed over: the three service-job templates carrying a
 * `panels` task quote that task off the installed stock `panels` SKU, so their payouts rise while
 * the player's real cost (the body pipeline) does not. Mean payout at `marginMin` over 50 seeds per
 * shipped model: `small-bodywork-touchup` +32.9% / +28.1% / +49.0% / +83.7% by class,
 * `put-her-in-a-ditch` +15.9% / +12.7% / +16.8% / +20.0%, `one-off-widebody` +13.5% / +11.9% /
 * +15.4% / +17.0%. Read the other way this is a defect the lever partly closes: the game used to
 * quote a few hundred yen of materials for a panel tidy-up whose real fill-and-sand tin costs 1900.
 * The 1.15x profitability invariant (`serviceJobPayout.test.ts`) holds at the new values.
 *
 * NOT closed by these levers, measured rather than assumed: `honda-city-e-aa` still turns a profit
 * on a strip-as-found play on 15 of 400 real lots (3.75%), best case 7543 yen, against a median
 * 50958 yen more for repairing the same lot. The count, the best case and the median gap are all
 * identical before and after; only 10 of the 400 lots see any movement at all, because a strip's
 * takings never include the body carriers and the buy price barely moves. Closing it needs a
 * different lever and is left to the maintainer.
 *
 * Re-pinned 2026-08-01 (maintainer approval, in session, the one lever signed as exactly the
 * four-by-five table it carries) for `docs/sprints/sprint142.md`, grade sensitivity. ONE lever,
 * and no second:
 *
 * 1. `statFormulas.condition.gradeBandFactor` (NEW) - how much of an installed SKU's own
 *    `physicalModifiers` advantage survives its condition band, by the GRADE of the part fitted.
 *    Four rows of five, mint/fine/worn/poor/scrap: stock 1.00/0.85/0.65/0.40/0.15, street
 *    1.00/0.90/0.75/0.52/0.22, sport 1.00/0.86/0.65/0.38/0.13, race 1.00/0.80/0.52/0.25/0.05.
 *    `buildFactors` (packages/sim/src/derivedStats.ts) reads it in place of `bandFactor(band,
 *    economy)`; a grade that cannot be read falls back to the `stock` row.
 *
 * `statFormulas.condition.bandFactor` and `bands.bandFactors` are both UNTOUCHED, and `bandFactor`
 * keeps every other job it had: the condition input to all five derived stats, the `style` part
 * modifier, and the cost-weighted value shim. This lever replaces its use inside `buildFactors`
 * alone.
 *
 * It is a curve shape and not a wear rate. No band moves during play (`degradeBand` runs only at
 * generation, and only a repair moves a band afterwards), so a race part is more SENSITIVE at a
 * given band rather than more fragile over time, and no value here is denominated in days.
 *
 * Nothing else moves, and the two identities are why. The `stock` row is `bands.bandFactors`
 * verbatim, so a car built from stock parts produces byte-identical build factors, asserted by
 * strict equality on all 26 shipped cars at all five bands; and every row is exactly 1.00 at
 * `mint`, so a mint build reads the raw product of its SKUs' modifiers as it always did.
 * `harnessAcceptance.test.ts` passes untouched, and a fresh `storyMissionProbes.test.ts` run
 * confirms every payout, budget cap, lap ceiling, power floor, reliability threshold and taste
 * floor is unchanged: every probe builds at mint, where this table is the identity. What moves is
 * a car carrying NON-MINT aftermarket parts, and it moves by the grade of what is fitted - a race
 * coilover at `poor` now delivers 1.00725 against a mint street coilover's 1.01000.
 *
 * NOT re-pinned, and recorded here only because it moves a formula-derived mission threshold:
 * Sprint 140's retirement of the flat per-part handling delta (`docs/sprints/sprint140.md`, task
 * 1, which needs no sign-off - it deletes a duplicate of `physicalModifiers.grip` and moves no
 * economy value). NO hash in this file changes: `economy.json` and `partPricing.json` are both
 * untouched, no part price moves, and every `payoutYen`/`budgetCapYen` above holds, confirmed by
 * a fresh `storyMissionProbes.test.ts` run rather than assumed. ONE formula-derived STAT
 * THRESHOLD in `storyMissions.json` (not gated by this hash, the same class of mechanical
 * re-derivation as the Sprint 135 and 136 entries above) moves with it:
 * `street-power-street-manners`'s `tasteMatch(tuner).minMultiplier`, `round2At97Percent` of the
 * freshly measured taste ratio, **1.08 -> 1.06**. Its probe is the one that fits aftermarket
 * suspension and body parts, so the handling stat those SKUs used to add to falls and the tuner's
 * taste match falls with it. Nothing else in the ten missions moves: every other probe is
 * all-stock, cosmetics-only, or engine-only.
 *
 * NOT re-pinned, recorded because this file is the ledger of what moved and why: Sprint 140's
 * `spec.aeroCeiling` (`docs/sprints/sprint140.md`, task 2). NINETY-FOUR values, one per roster row
 * in `docs/design/midnight-garage-roster.csv`, of which the 26 shipped cars carry theirs in
 * `cars.json`. **RATIFIED** on review of the authoring pass. The rubric, the classics ruling and
 * the deliberate calls behind the outliers are in that sprint doc.
 *
 * The lever is a 0-to-1 multiplier on what a FITTED aero SKU's downforce is worth on a given body.
 * It never touches the car's own factory figure and never touches drag, so its entire reach is the
 * handling readout and the lap time of a car with a functional wing bolted to it. NO hash in this
 * file changes: `economy.json`, `damagePatterns.json` and `partPricing.json` are untouched, no part
 * price moves, and every `payoutYen`/`budgetCapYen` above holds.
 *
 * No formula-derived mission threshold moves either, confirmed by a fresh
 * `storyMissionProbes.test.ts` run rather than assumed, and the one probe that could have moved is
 * worth naming: `low-and-loud` fits a sport wing to a Silvia S14, whose ceiling is 0.85, which
 * takes that build's handling readout from 40 to 39. `tasteMatch(stancer).minMultiplier` holds at
 * its pinned value regardless, because the stancer buys style rather than handling and the shave
 * is inside the second decimal place the threshold is rounded to. `harnessAcceptance.test.ts`
 * passes untouched: a stock car carries no aero SKU, so there is nothing for a ceiling to scale.
 *
 * Re-pinned 2026-08-02 (maintainer approval, in session, all three levers signed by name and
 * value) for `docs/sprints/sprint141.md`, the dyno screen. ONE new block, `dyno`, and no
 * second:
 *
 * 1. `dyno.hireFeeYen` - 15000. What hiring a portable dyno in costs, on the same day-stamped
 *    shape a machine line's hire uses.
 * 2. `dyno.purchasePriceYen` - 750000. Buying one outright, which ends the fee. Break-even is
 *    50 sessions, so hiring is correct early and owning pays off once a shop dynos most of what
 *    it builds.
 * 3. `dyno.minReputationTier` - `known`. The standing a purchase needs, mirroring a tool tier's
 *    own `minReputationTier`.
 *
 * NOTHING ELSE MOVES, and it cannot: a dyno v1 is measurement only. It has no slider, no
 * adjustment and no outcome, and a completed session's whole effect on state is booking the car
 * onto the rollers. No stat, band, price, lap time, payout, budget cap or mission threshold is
 * reachable from any of these three values, which `packages/sim/tests/dyno.test.ts` pins as
 * strict equality on the car across a session rather than asserting it. `damagePatterns.json`,
 * `partPricing.json` and `storyMissions.json` are untouched, so their pins hold.
 *
 * Re-pinned for `docs/sprints/sprint167.md`, grip a build cannot use. ONE new block,
 * `statFormulas.chassisSupport`, carrying SIX levers, all six APPROVED in that sprint doc's lever
 * table on the measurements in `docs/design/systems/chassis-support-measured.md`:
 *
 * 1. `lossByGrade.street` - **0.10**. The largest value at which the median car on the roster
 *    loses nothing at all and no car loses more than a point, so bolting street dampers to stock
 *    brakes reads as a number that went up.
 * 2. `lossByGrade.sport` - **0.20**. The smallest value that is always visible and never zero,
 *    without reaching the race band.
 * 3. `lossByGrade.race` - **0.35**. An unsupported race build gives up around a tenth of its
 *    readout and several seconds of a mountain lap, and is worth going back and fixing.
 * 4. `share.brakes` - **0.45**, split evenly across `brakePadsDiscs` and `brakeCalipersLines`.
 * 5. `share.steering` - **0.35**.
 * 6. `share.chassis` - **0.20**, the smallest share because a chassis SKU already carries its own
 *    `physicalModifiers.grip` and earns a second time that way.
 *
 * `lossByGrade.stock` is pinned at 0 by the schema (`z.literal(0)`, the same treatment
 * `support.specByGrade.stock` gets) and is not a lever: it is one of the two structural reasons a
 * stock car cannot move. The other is that a stock build IS the factory reference its gain is
 * measured against, so that gain is exactly 0.
 *
 * A STOCK CAR IS BYTE-IDENTICAL ON ALL 26 SHIPPED CARS, on grip, on handling and on all four
 * course laps, asserted directly in `packages/sim/tests/chassisSupport.test.ts` against the same
 * content with every loss fraction at zero rather than inferred.
 * `packages/sim/tests/harnessAcceptance.test.ts` passes UNTOUCHED: it holds no `CarInstance` at
 * all, so it runs on `STOCK_BUILD_FACTORS` and the model is unreachable from it.
 *
 * Two rulings in the sprint doc are folded in, and both make the loss LARGER than the
 * mechanical-only pass the design doc measured. Recorded because the values are the design doc's
 * and the magnitudes are not:
 *
 * - **Gain is measured in EFFECTIVE grip**, mechanical grip times the downforce multiplier at the
 *   display curve's own reference speed, converted back to mechanical grip on the way out.
 *   Measured mechanically a race wing raised the bar to race and paid nothing towards it, while
 *   being worth 17 handling points on an S13.
 * - **The brake share splits across both brake slots** rather than reading the worse of the two,
 *   which made the first brake part bought worth exactly nothing.
 *
 * Freshly measured across all 26 shipped cars rather than carried over. Handling points lost by an
 * unsupported build, min/median/max: street 0/0/1, sport 1/3/3, race 11/15/19 (the design doc's
 * mechanical-only pass read 0/0/1, 1/2/2, 10/11/13). What one support part returns on an
 * unsupported race build: brake pads alone 3/3/5, both brake slots 5/7/9, steering 4/5/7, chassis
 * 6/7/9 - none is zero, and a race steering rack is worth 4 to 7 points where it was worth
 * literally nothing before. The ladder holds: 26 cars x 11 support levels x 2 adjacent pairs = 572
 * comparisons with 0 violations, tightest step +3 (Suzuki Wagon R, all support at street, street
 * grip 19 against sport grip 22).
 *
 * ONE formula-derived STAT THRESHOLD in `storyMissions.json` moves with it (not gated by this
 * hash, the same class of mechanical re-derivation as the Sprint 135, 136 and 140 entries above):
 * `the-column-clock`'s `lapTimeCeiling.maxSeconds`, `ceil1AtTwoPercentSlower` of the freshly
 * measured probe lap, **125.7 -> 125.8**. Its probe fits street tyres to an AE86 with stock
 * brakes, steering and chassis, so it now laps a tenth slower and the ceiling derived from it
 * rises with it. `under-one-fifteen`'s ceiling holds, and so does every taste-match multiplier.
 *
 * NOTHING ELSE MOVES: every `payoutYen` and `budgetCapYen` above holds, `damagePatterns.json` and
 * `partPricing.json` are untouched so their own hashes hold, and BOTH `advanceDay` golden hashes
 * were re-run and held unchanged, as did `balanceProbes.test.ts` and `valueModelProbes.test.ts`.
 *
 * Re-pinned for the machining block, a new `economy.machining` key holding the
 * whole of that feature's content (`docs/design/systems/machining-system-design.md`,
 * numbers in `machining-performance-table.md`). Every figure in it is either signed
 * in that table or is one of the two values the implementing sprint was asked to
 * propose:
 *
 * - SIGNED: the nine operations' `powerFraction` per engine character (summing to
 *   the authored machining base of 8.00 / 10.50 / 20.00 per cent), their five `spec`
 *   contributions, their nine `authenticityCost` ratings (summing to 48 on a fully
 *   machined engine), the flat 5 `labourPoints`, and `gradeMultiplier`
 *   (stock 1.0, street 1.0, sport 1.25, race 1.5). `minEngineToolTier` is 3, the rung
 *   `toolLines.json` already names "Machine-shop tooling".
 * - RATIFIED, pending playtest: `reliabilityCostPerOperation` 0.004 (a fully
 *   machined nine-operation engine reads 3.6 per cent below its own reliability base,
 *   levied once through the build-intensity factor and never a second time through
 *   `totalGainFractionOf`) and `valuePremiumPerOperation` 0.03 (one operation adds
 *   3 per cent of the part's own catalogue price to what that part is worth). The
 *   premium was sized against the plays ranking: a full nine-operation engine returns
 *   Y28 (entry) / Y243 (enthusiast) / Y607 (flagship) per labour point of credited
 *   premium, against repair-to-expectation's Y146 / Y468 / Y2,082, so machining stays
 *   below fixing per labour point on every class. Both are expected to be retuned once
 *   the mechanic has been played, which is what "pending playtest" records.
 *
 * NOTHING ELSE IN THIS FILE MOVES: no existing lever changed value, `damagePatterns.json`
 * and `partPricing.json` are untouched, and every mission payout above holds.
 *
 * Re-pinned 2026-08-03 (maintainer approval, recorded in docs/sprints/sprint170.md's
 * Levers section) for the paint system's generation table: `partsGeneration` gains
 * `paintHistory`, four named profiles (`cherished`/`scene`/`worked`/`mixed`), each a
 * weighted row over the four whole-car paint states `rollZoneStates` rolls
 * (original/resprayed/mismatchedPanel/primedPanel) - cherished 90/3/5/2, scene
 * 55/30/9/6, worked 70/6/14/10, mixed 75/12/9/4 - and `paintHistoryByCulture`, mapping
 * all 13 cultures onto those profiles exactly as the sprint doc's table states
 * (kyusha/exotic/touring-car to cherished; drift/front-drive-tuner/touge/kurokan/wangan
 * to scene; honest-transport/kei to worked; rotary/rally-bred/oddball to mixed). No
 * existing value moves; both tables are wholly new.
 *
 * Re-pinned 2026-08-03 (maintainer approval, verbatim: "800ps ceiling") for
 * `statFormulas.radarPowerCeilingPs` at 800, a DISPLAY scale and a wholly new field.
 * It exists because the stat radar had been plotting power against a hardcoded 560 in
 * the game package while labelling the spoke with raw PS, so power was the one axis
 * whose number could not be compared with its four 0-100 neighbours. The buyer model's
 * `powerNormalizationCeiling` (300) is deliberately NOT reused for it: that answers
 * where a buyer stops caring, and at 300 the spoke pegs for nine stock cars and for
 * every built engine. 800 sits above the roster's fastest stock car (560 PS, the LFA)
 * with room for a fully built motor. No existing value moves, and this field feeds no
 * sim formula, price or payout.
 *
 * Re-pinned for the body zone rebuild signed in docs/sprints/sprint172.md: six zones
 * become nine (`bonnet`/`boot`/`left-front`/`left-rear`/`right-front`/`right-rear`
 * metal, `front-bumper`/`rear-bumper`/`skirts` trim) and `underbody` is deleted as a
 * slot, its structural concern folded into `chassis`, which moves from the
 * `drivetrain` group to `body`. Three files move:
 *
 * - `damagePatterns.json`: all five patterns' `slotWeights.zones` re-authored from
 *   five keys to nine (the schema itself refuses the old five-key shape once
 *   `ZoneSlotWeightsSchema` moves to nine, so the reshape is mandatory, not
 *   optional). The sprint doc directs the qualitative shape by name for four of
 *   the five - `frontal-collision` weights bonnet/left-front/right-front/
 *   front-bumper heavily and the rear lightly, `drifted` favours the corners and
 *   the bumpers, `neglected-commuter` favours the horizontals and the lower
 *   corners, `garaged` stays near-even - and the exact integer weights (and the
 *   whole of `grenade`, left to authoring judgement: bonnet weighted heavily for
 *   engine-bay proximity, the rest low and near-even) are this change's own
 *   authoring within that direction, flagged for review rather than presented as
 *   a literal maintainer-dictated table.
 * - `economy.json`: three structural deletions of the now-nonexistent `underbody`
 *   slot, none of them a value change - `valuation.foundation.parts` drops
 *   `underbody` (`chassis` alone still names the structural foundation part),
 *   `partsGeneration.missingSlotWeightByPart.underbody` (was 0, so its removal moves
 *   nothing) is gone, and `machineShopAssist.signatureSlotsByGroup.body` drops
 *   `underbody` and gains `chassis` - the sprint doc's own text ("the stiffening kits
 *   require the body line to install, owned or hired for the day... `hasMachineLineFor`
 *   already do exactly this for assemblies") names this exact wiring as the whole of
 *   what makes the stiffening kits need the welder, with no sim code change.
 * - `partPricing.json`: `baseCostYen.underbody` (24000) removed with the slot; no
 *   other base, class factor, grade factor or override moves.
 *
 * `materials.json` is not gated by this hash (it is not one of the three files this
 * suite hashes) - its seven approved prices are pinned by `material.test.ts` instead,
 * per the sprint doc's Levers table (filler 1250, paper 350, primer 650, paint 1400,
 * paint-metallic 2750, paint-pearl 4150, polish 450, underseal deleted), rescaled so a
 * full respray holds its per-car total (32000 -> 32100, 0.3 per cent) rather than
 * rising 80 per cent by the zone count alone.
 *
 * No mission payout or budget cap moves: none of the three re-derivation formulas
 * (`payoutYenFor`, the probe cost, the taste-match ratio) reads a zone weight, a
 * foundation part list, a signature-slot membership, or the deleted `underbody` base
 * cost.
 *
 * Re-pinned for the same body zone rebuild (docs/sprints/sprint172.md), one
 * further structural deletion the pin above missed:
 * `partsGeneration.zoneStates.chassisMetalWeightsByTier` rolled the
 * now-deleted chassis ZONE's own metal severity, one tier row kinder than the
 * panel zones' table. Zones are nine now and none of them is named `chassis`
 * - the shell's condition is a normal per-part band on the `chassis` part
 * instead, generated the same way every other non-derived slot is, so the
 * table has no zone left to roll for. Not a value change: the table is gone
 * because its subject is gone, and nothing reads it. `metalWeightsByTier`,
 * `finishWeightsByTier`, `surfaceExtraChance`, `zoneBeyondRepairChance` and
 * `zonePanelMissingChance` are untouched.
 *
 * Three formula-derived mission payouts move as a MECHANICAL CONSEQUENCE of
 * the same body zone rebuild, not an independent decision: `underbody`'s
 * removal drops each probe's part count from 29 to 28 and moves its
 * `marketValueYen` purchase proxy, which `storyMissionProbes.test.ts`'s own
 * `payoutYenFor`/`budgetCapYenFor` rules re-derive against a fresh
 * measurement, never hand-picked - `wont-strand-her` 123000 -> 124000,
 * `the-fleet-spare` 481000 -> 482000, `the-column-clock` 996000 -> 997000.
 * Each budget cap moves with its own payout, holding the one-price contract.
 * No other mission's probe reads a body-derived slot at a price-relevant
 * band, so nothing else moves; `economy.json` and `partPricing.json` are
 * untouched, so their hashes hold.
 *
 * Re-pinned 2026-08-04 (maintainer approval, verbatim: "Lets keep the labour costs set, but
 * increase the labour starting pool to 80", and for the cafe "Adds back a little labour lets say
 * 20, but costs yen ... maybe make it like, 1000 yen to start with. Scaling up with another 1000
 * for every staff member on staff. (buy coffee for the crew)"). Two changes, both wholly additive
 * or a single named value:
 *
 * - `energy.basePoolPoints` 60 to 80. **No labour COST moves**: every per-action, per-band-step
 *   and per-class figure in `energy` is byte-identical. A day simply holds more, because it ran
 *   out too soon to finish anything satisfying.
 * - A new `cafe` block: `coffeeLabourPoints` 20, `coffeeBasePriceYen` 1000, `coffeePerStaffYen`
 *   1000, `maxPurchasesPerDay` 1. A round of coffee hands back labour already spent today for
 *   cash, never lifting the pool's own ceiling and never advancing the day. The daily cap is the
 *   one value not named by the maintainer: without it, cash converts into unlimited labour and the
 *   day stops meaning anything.
 *
 * NOTHING ELSE MOVES: no payout, no price, no repair or valuation formula.
 *
 * Re-pinned for `docs/sprints/sprint176.md` (the six scenes: buyers and channels), APPROVED
 * 2026-08-04 under the maintainer's blanket lever authority for this build. Six lever groups, all
 * named and valued in the sprint doc's own lever list:
 *
 * 1. Renames, no value moved: the buyer archetype (and `Buyer.id`) `stancer` -> `show-crowd` and
 *    `first-timer` -> `daily-drivers` in `buyers.json`; the same two strings in every
 *    `sellingChannels[*].buyerPoolWeights` key and in `valuation.tolerance`. THE TRAP:
 *    `valuation.ts`'s `coherenceToleranceFor` hardcodes the archetype string AND
 *    `economy.valuation.tolerance` keys on the same string in two places typecheck cannot
 *    cross-check - both were renamed together in the same change (`show-crowd`, kept as
 *    `tolerance['show-crowd']` at its unmoved 0.0), and `coherenceValuation.test.ts` gained a new
 *    guard that asserts every one of the six archetypes resolves to an authored tolerance rather
 *    than falling through to `default` by accident.
 * 2. Hobbyist DELETED outright (not renamed, not demoted to an unaffiliated pool) - added to
 *    `retiredIdentifiers.test.ts` in the same change. Its demand (1.4 in the free ads paper, 0.8 at
 *    the weekend meet) is inherited by daily-drivers and the broadened tuner, which is why lever 3
 *    below re-authors all four previously-weighted channels rather than merely dropping a key.
 * 3. `sellingChannels[*].buyerPoolWeights` re-authored on all four existing weighted channels, over
 *    collector / tuner / show-crowd / racer / daily-drivers / touge:
 *    shopFront 1 / 1 / 1 / 1 / 1 / 1 (unchanged - flat, nobody favoured);
 *    freeAdsPaper 0.4 / 0.7 / 0.5 / 0.2 / 2.0 / 0.3 (tuner and daily-drivers up from 0.5/1.6);
 *    tunerMagazine 0.2 / 1.6 / 0.3 / 1.8 / 0.05 / 1.4 (collector down from 0.15, racer up from 1.4 -
 *    racer now tops the magazine outright, the performance-press half of the magazine/meet split);
 *    weekendMeet 0.3 / 1.5 / 2.2 / 0.4 / 0.4 / 1.0 (show-crowd up from 1.8 to 2.2 and now the single
 *    highest weight on any persona channel - the meet is where the scene is seen - tuner up from
 *    1.2, daily-drivers up from 0.1). Tuners stay strong in both split channels by design, never
 *    falling below touge in either.
 * 4. A sixth selling channel, NEW: `collectorNetwork`, hung off the Collector Network building that
 *    already exists as a reputation-gated buying-side auction tier (fortnightly, 70 per cent
 *    flagship) - same place, same fiction, so collectors finally have a channel that favours them
 *    (their best weight anywhere else was 1.0 at the shop front). `feeYen` 20000, `tasteCeiling`
 *    1.20 (the highest of any channel), `matchedOnly` true, `poolWidening` 0.3, `requiresForecourt`
 *    true, `buyerPoolWeights` collector 3.0 / tuner 0.2 / show-crowd 0.1 / racer 0.2 /
 *    daily-drivers 0.05 / touge 0.1 - collector-heavy by a wide margin, the only channel where
 *    collector is not the trailing weight. Cadence: `oneDrawNextEndDay`, the weekend meet's own
 *    shape, reused rather than inventing a genuine fortnightly scheduler the channel schema does
 *    not support - mechanically this ties the guaranteed draw to `calendar.meetDayOfWeek`, the same
 *    single day the weekend meet itself resolves on, not a separate biweekly landmark. No unlocking
 *    mission names `collectorNetwork` (none names the buying-side `collector-network` auction tier
 *    either, in this content), so the channel is open from day one like the shop front, not gated by
 *    reputation as the fiction implies - a real gap between the story and the mechanism, left as
 *    found rather than invented for this content-only sprint.
 * 5. Tuner retune, importances only, targets untouched: power 0.9 -> 0.6, handling 0.6 -> 0.7,
 *    style 0.4 -> 0.6, reliability 0.4 -> 0.6. Authenticity importance stays exactly 0 - the
 *    tuner-0/collector-1.0 authenticity split is the sharpest authored distinction in `buyers.json`
 *    and this retune does not touch it.
 * 6. Touge, NEW archetype, the handling-biased twin of the power-biased racer: handling target 0.75
 *    importance 1.0, power target 0.7 importance 0.6 (provisional - sprint 175 revisits buyer power
 *    expectation and this target is authored now only so the archetype ships complete),
 *    style target 0.3 importance 0.2, reliability target 0.6 importance 0.5, authenticity target 0
 *    importance 0. `tierPreferences` enthusiast 0.8, everyday 0.6, entry 0.3. `valuation.tolerance.
 *    touge` 1.0, authored explicitly rather than left to inherit `default` by omission. Weighted
 *    into every persona channel (lever 3's freeAdsPaper/tunerMagazine/weekendMeet figures above)
 *    plus the new collectorNetwork channel (lever 4): cold in the classifieds (0.3), warm in the
 *    magazine (1.4) and at the meet (1.0), per the sprint doc's own guidance.
 *
 * Mechanical consequence, not an independent lever: `storyMissions.json`'s two renamed `tasteMatch`
 * `buyerId` fields (`first-proper-car` -> `daily-drivers`, `low-and-loud` -> `show-crowd`) carry
 * their `minMultiplier` UNCHANGED (1.08, 1.09) - neither archetype's `statTargets` moved, only the
 * id. `street-power-street-manners`'s `tuner` `minMultiplier` DOES move, 1.06 -> 1.05, re-derived
 * mechanically from a fresh `storyMissionProbes.test.ts` run against the same probe build (the
 * tuner's own retuned importances read the same build's stats differently), never hand-picked, the
 * same footing every prior retune on this file has used. Neither mission's `payoutYen`/
 * `budgetCapYen` moves, and no other probe's requirement is sensitive to a buyer archetype's own
 * profile.
 *
 * Re-pinned for `docs/sprints/sprint175.md` (buyer power expectation), APPROVED 2026-08-04 under
 * the maintainer's blanket lever authority for this build. Two levers, both named and valued in
 * the sprint doc:
 *
 * 1. `statFormulas.powerNormalizationCeiling` 300 -> 600. Every archetype's `statTargets.power`
 *    is a fraction of this, so ordinary appetite moves in proportion for everybody at once
 *    (racer 225 -> 450 PS, tuner 195 -> 390, touge 210 -> 420, daily-drivers 75 -> 150 (`upper`
 *    165 -> 330), show-crowd 60 -> 120, collector 90 -> 180 (`upper` 150 -> 300)) - no
 *    archetype's own fraction changes, only the PS a fraction now means. 600 sits just above the
 *    roster's fastest stock car (560 PS).
 * 2. `statFormulas.powerExpectationChainStepDiscounts` (NEW) - `[0.10, 0.05, 0.01]`, the climbing
 *    chain's three steps (10/5/1 per cent below the player's own best-ever delivered power).
 *    Governs the derived `currentPowerExpectationBarPs` (`valuation.ts`) only; no buyer's own
 *    `statTargets.power` reads it, and nothing in shipped content consumes the bar yet - built
 *    and proved for a later sprint (scene-standing-arc.md) to read.
 *
 * Measured before/after through `valuateCarForBuyer` against four representative cars (a stock
 * kei, a mid-power stock enthusiast car, a stock high-power flagship, and a heavily built engine):
 * the largest single-buyer swing was daily-drivers on the high-power flagship (+2.1 per cent, its
 * power `upper` now sits at a PS figure the car no longer overshoots as badly) and the largest
 * drop was racer/touge on the mid-power car (-3.0/-2.1 per cent, their target's PS-equivalent
 * moved further out of reach for a car that was never built for power); most swings were under
 * 1.5 per cent in either direction, and the heavily-built car's price against every archetype was
 * UNCHANGED, because it already fully cleared every archetype's power target under the OLD
 * ceiling too (raising the ceiling cannot help a car so far past it that both ceilings' targets
 * were already cleared - closing that gap for a no-upper archetype is exactly what the climbing
 * chain exists for, and it deliberately ships unconsumed this sprint). No result approached the
 * magnitude of the game's existing flip-margin tolerances; nothing else in `economy.json` moves.
 *
 * `partPricing.json`, `damagePatterns.json` and every mission payout/budget cap are untouched, so
 * their hashes and the payout pin hold.
 *
 * Mechanical consequence, not an independent lever: `street-power-street-manners`'s `tuner`
 * `tasteMatch.minMultiplier` moves 1.05 -> 1.04, re-derived mechanically from a fresh
 * `storyMissionProbes.test.ts` run against the same probe build (the raised ceiling reads the same
 * build's power differently) - never hand-picked, the same footing every prior retune on this file
 * has used. `payoutYen`/`budgetCapYen` are unchanged, so they are not part of this gate's pinned
 * object. No other mission's requirement is sensitive to the power ceiling: `first-proper-car`'s
 * `daily-drivers` match and `low-and-loud`'s `show-crowd` match are both re-measured unchanged.
 *
 * Re-pinned for `docs/sprints/sprint177.md` (standing moves the band), approved under the
 * orchestrator's blanket lever authority for this build, every value named and recorded in that
 * sprint doc's Exit. Two new `valuation` levers:
 *
 * 1. `valuation.sceneStanding` (NEW) - `known` floor 0.92 (no ceiling); `respected` floor 0.95,
 *    ceiling 1.17 (exactly the tuner magazine and weekend meet ceiling, so a respected scene
 *    pays magazine money off the shop front); `shop` floor 0.95, ceiling 1.25 (past every
 *    channel that exists). Read by `channelTasteMultiplier` (sim/valuation.ts) for one scene's
 *    buyers only; every other scene's price is unaffected by construction (the lookup is
 *    per-buyer-archetype). Ceilings take the max against a selling channel's own `tasteCeiling`,
 *    never stacking.
 * 2. `valuation.matchedTasteScoreThreshold` (NEW) - 0.5, the score `tasteMatchFor` must clear
 *    for a sale to count MATCHED. Replaces the old `channelBuyerTaste(...) >= 1` (a test on the
 *    PRICE, which drifted easier to clear as standing raised the floor) with a test on the
 *    underlying [0, 1] score, which cannot drift: 0.5 is mathematically the score that prices at
 *    exactly 1.0 under the standard, no-standing band regardless of `tasteSpread`'s own value.
 *    Governs the `matchedOnly` gate on `tunerMagazine`/`weekendMeet`/`collectorNetwork` and
 *    `reputation.matchedSaleRepBonus` alike (`isTasteMatched`, sim/valuation.ts) - both already
 *    existed and both change definition with this one lever, no code path is new.
 *
 * No mission payout or budget cap moves: none of the ten probes reads scene standing (every
 * probe car is measured at `sceneStanding` absent, i.e. every scene at `none`), and the
 * matched-threshold change moves a BOOLEAN gate, never a `marketValueYen` input, so
 * `storyMissionProbes.test.ts` is unaffected and the payout pin holds unchanged.
 *
 * Re-pinned for `docs/sprints/sprint178.md` (the earn event and the shop ledger), approved
 * under the orchestrator's blanket lever authority for this build, every value named and
 * recorded in that sprint doc's Exit. One new top-level block:
 *
 * `sceneStandingProgress` (NEW) - `knownDeliveries` 3, `respectedDeliveries` 10,
 * `marqueeBarYenByTier` (entry 500000, everyday 1200000, enthusiast 3000000,
 * flagship 8000000 - a marquee Daily Drivers car and a marquee Collector car are not the same
 * money), `rollingWindowDays` 14. Read only by `creditSceneDelivery`
 * (sim/sceneStanding.ts), the one place a matched sale or a delivered story mission turns
 * into a scene-standing stage change; nothing else in the pricing or valuation path reads it.
 * The Shop stage additionally requires the scene already at (or newly reaching, on the same
 * delivery) Respected - `respectedDeliveries` can never be cleared by a single delivery, so a
 * scene can never vault from `none` straight to The Shop regardless of price.
 *
 * No mission payout or budget cap moves: the lever only feeds the NEW scene-standing stage
 * machinery, which nothing in `storyMissionProbes.test.ts` measures. `partPricing.json` and
 * `damagePatterns.json` are untouched, so their hashes and the payout pin hold.
 *
 * Re-pinned for `docs/sprints/sprint179.md` (word of mouth, and work that comes to you),
 * approved under the orchestrator's blanket lever authority for this build. Two new
 * `sceneStandingProgress` fields plus one new top-level block:
 *
 * 1. `sceneStandingProgress.wordOfMouthMultiplierByStage` (NEW) - `known` 1.4, `respected`
 *    1.8, `shop` 2.4. The flat, per-stage multiplier a scene's own `buyerPoolWeights` draw
 *    across every channel out, MULTIPLICATIVE on the channel's own authored weight (never
 *    additive, so a channel that barely carries a scene still barely carries it). Below
 *    Known the multiplier is a flat 1: there is no `none` entry, and `wordOfMouthMultiplierFor`
 *    (sim/sceneStanding.ts) never looks one up at that stage.
 * 2. `sceneStandingProgress.rollingWindowShareCap` (NEW) - 1.5. The rolling window's own
 *    ceiling: a scene worked exclusively across `rollingWindowDays` reaches this multiplier
 *    on top of the stage multiplier above; a scene untouched in the window reads a flat 1.
 *    Linear in recent share of matched deliveries across all scenes:
 *    `1 + share * (cap - 1)`.
 * 3. `sceneCommissions` (NEW top-level block) - `refreshIntervalDays` 7, `payoutMultiplier`
 *    1.25. A Respected-or-better scene's own generated brief: an unaccepted commission is
 *    replaced after a week (a rolling age check against its own `postedOnDay`, not a
 *    calendar weekday), and a completed one pays 1.25x whatever the ACTUAL delivered car
 *    would fetch on the open market for that scene's buyer (`valuateCarForBuyer`) - never a
 *    flat authored figure, so a commission can never under- or over-quote a car nobody had
 *    chosen yet.
 *
 * No mission payout or budget cap moves: none of the ten probes reads word of mouth or a
 * generated commission (both are new machinery outside `storyMissionProbes.test.ts`'s
 * reach), so `partPricing.json` and `damagePatterns.json` are untouched and the payout pin
 * holds unchanged.
 *
 * Re-pinned for `docs/sprints/sprint180.md` (the operation chassis generalised, and six
 * scenes authored onto it), approved under the orchestrator's blanket lever authority for
 * this build, every value named and recorded in that sprint doc's Exit.
 *
 * One new field in the existing `machining` block: `craftOperationToolTier` (NEW) - 3.
 * Every scene operation's tool gate, on top of the standing gate, regardless of which of
 * the six tool lines its own `carPartId` belongs to. Kept separate from the four original
 * operations' own `minEngineToolTier` (unchanged, still 3) because a scene operation's line
 * is read off its own slot and can be any of the six, where the original four are always
 * engine.
 *
 * Six new entries in `machining.operations`, sharing the existing nine's exact shape plus
 * five new optional fields the schema now carries (`scene`, `handlingFraction`, `style`,
 * `reliabilityConditionBonus`, `coherenceSupported` - all absent/default-false on the
 * original nine, so their own figures and every existing test against them are untouched).
 * Every one of the six needs its scene at the Shop stage AND `craftOperationToolTier` of its
 * own line - standing ungates the tool, the tool is what performs it, and neither
 * substitutes for the other. Magnitude is calibrated to roughly one grade step on the axis
 * each operation writes, read from the catalogue's own grade ladders; labour (5 points) and
 * money (none) are anchored to the four original operations' own figures, so all ten sit on
 * one scale:
 *
 * - `race-prep` (Racers, `dampers`, suspension line): `powerFraction` 0.0065/0.0085/0.0065
 *   (half the average engine-slot grade step, split with handling), `handlingFraction` 0.005
 *   (half a dampers grade step, +0.01 per step measured from the catalogue),
 *   `authenticityCost` 3, `coherenceSupported` true - its own power and handling both scale
 *   by the car's coherence factor (`coherenceFactorFor`), so an incoherent build gets less.
 * - `corner-weighting` (Touge, `springs`, suspension line): `handlingFraction` 0.01 (one full
 *   springs grade step, no power share since it forgoes the axis race prep splits with),
 *   `authenticityCost` 2.
 * - `blueprint-building` (Tuners, `internals`, engine line): `powerFraction`
 *   0.013/0.017/0.013 (one full internals grade step, averaged across its three catalogue
 *   transitions), `authenticityCost` 1 - the reduced-originality-cost operation the design
 *   names, well below the internals slot's existing 2/4 machining costs.
 * - `show-fitment` (Show Crowd, `rims`, wheels line): `style` 5 (one full rims grade step,
 *   averaged: +6/+4/+4 across the three catalogue transitions), `authenticityCost` 3.
 * - `period-correct-restoration` (Collectors, `block`, engine line): `spec` 0.25 (mid-range
 *   of the block slot's existing 0.15-0.35 spec-carrying operations - no directly comparable
 *   grade ladder for spec, so anchored to the existing range instead), `authenticityCost` 1 -
 *   the other reduced-originality-cost operation, well below the block slot's existing
 *   6/8/9 machining costs.
 * - `sorting` (Daily Drivers, `differential`, drivetrain line): `reliabilityConditionBonus`
 *   0.15 (the mint-to-fine band step, `economy.bands.bandFactors`), applied as a flat
 *   car-level addition to reliability's own condition factor rather than diluted through
 *   the weighted mean by `differential`'s own small taxonomy weight, `authenticityCost` 2.
 *
 * No mission payout or budget cap moves: none of the ten probes ever applies a scene
 * operation to a probe car, so `partPricing.json` and `damagePatterns.json` are untouched
 * and the payout pin holds unchanged. `serviceJobTemplates.json` also moves in this same
 * change (three existing signature templates gain `requiresOperationId` as a second, OR'd
 * route to their existing gate; three new templates are the other three operations' own
 * matching job) but carries no separate approval hash of its own.
 *
 * Re-pinned for the teardown of the old specialty system (docs/design/systems/
 * scene-standing-refactor.md, the arc's last sprint): the whole `specialty` block -
 * `biasFactor` 0.5, `softcapPoints` 100, `premiumThresholdPoints` 40, `inLanePremium` 1.15,
 * `titleThresholdPoints` 80, `titleBiasMultiplier` 1.25 - is deleted outright, not moved.
 * No value changes: this removes levers rather than retuning any, approved under the
 * orchestrator's blanket lever authority for this build (a deletion-only sprint moves no
 * value by construction). No mission payout or budget cap moves, and `partPricing.json`/
 * `damagePatterns.json` are untouched.
 */
describe('the economy approval gate', () => {
  it('economy.json matches its approved content exactly', () => {
    const hash = createHash('sha256').update(JSON.stringify(economy)).digest('hex')
    expect(
      hash,
      'economy.json changed. Every lever is approval-gated (CLAUDE.md directive 22): ' +
        're-pin this hash ONLY in the same change as the recorded approval of the ' +
        'specific lever and value.',
    ).toBe('955e7f275f32e103b5b54f797330e1350d59cf67368233dbde238befb3fc4b1a')
  })

  it('damagePatterns.json matches its approved content exactly', () => {
    const hash = createHash('sha256').update(JSON.stringify(damagePatterns)).digest('hex')
    expect(
      hash,
      'damagePatterns.json changed. The slot weights decide where every generated car is ' +
        'damaged and which symptom it presents: re-pin this hash ONLY in the same change as ' +
        'the recorded approval of the specific weighting.',
    ).toBe('6a3936623b3a0be38270b85d71f2e25e976f5eba58b4caf5773526ae221f6cca')
  })

  it('partPricing.json matches its approved content exactly', () => {
    const hash = createHash('sha256').update(JSON.stringify(partPricing)).digest('hex')
    expect(
      hash,
      'partPricing.json changed. Every SKU in the catalog resolves its price from ' +
        'these five knobs, so one edit here re-prices the whole market: base costs, ' +
        'class factors, grade factors, the global factor and the overrides map are all ' +
        'approval-gated (CLAUDE.md directive 22). Re-pin this hash ONLY in the same ' +
        'change as the recorded approval of the specific lever and value.',
    ).toBe('c1329be01da7abbf50863960fdf373bbd8067ee677153c9bd6c82ce166226be4')
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
      'four-wheels': { payoutYen: 142000, budgetCapYen: 142000 },
      'wont-strand-her': { payoutYen: 124000, budgetCapYen: 124000 },
      'first-proper-car': { payoutYen: 684000, budgetCapYen: 684000 },
      'make-it-pull': { payoutYen: 787000, budgetCapYen: 787000 },
      'the-column-clock': { payoutYen: 997000, budgetCapYen: 997000 },
      'low-and-loud': { payoutYen: 1159000, budgetCapYen: 1159000 },
      'street-power-street-manners': { payoutYen: 1494000, budgetCapYen: 1494000 },
      'under-one-fifteen': { payoutYen: 1690000, budgetCapYen: 1690000 },
      'the-fleet-spare': { payoutYen: 482000, budgetCapYen: 482000 },
      'the-showroom-standard': { payoutYen: 701000, budgetCapYen: 701000 },
    })
  })
})
