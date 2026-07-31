import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
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
 */
describe('the economy approval gate', () => {
  it('economy.json matches its approved content exactly', () => {
    const hash = createHash('sha256').update(JSON.stringify(economy)).digest('hex')
    expect(
      hash,
      'economy.json changed. Every lever is approval-gated (CLAUDE.md directive 22): ' +
        're-pin this hash ONLY in the same change as the recorded approval of the ' +
        'specific lever and value.',
    ).toBe('b014412563d50d237a00492058f7a6802a46007ddcf79727d3b0bdc6127922b0')
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
    ).toBe('1fa0f99b4fe2c86143cdd0f57ce00a28e6f82057a1fde97635e8e114ecb8fd7f')
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
      'wont-strand-her': { payoutYen: 156000, budgetCapYen: 156000 },
      'first-proper-car': { payoutYen: 686000, budgetCapYen: 686000 },
      'make-it-pull': { payoutYen: 787000, budgetCapYen: 787000 },
      'the-column-clock': { payoutYen: 999000, budgetCapYen: 999000 },
      'low-and-loud': { payoutYen: 1161000, budgetCapYen: 1161000 },
      'street-power-street-manners': { payoutYen: 1497000, budgetCapYen: 1497000 },
      'under-one-fifteen': { payoutYen: 1693000, budgetCapYen: 1693000 },
      'the-fleet-spare': { payoutYen: 483000, budgetCapYen: 483000 },
      'the-showroom-standard': { payoutYen: 703000, budgetCapYen: 703000 },
    })
  })
})
