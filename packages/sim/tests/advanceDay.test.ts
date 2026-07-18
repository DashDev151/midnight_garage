import { emptyDayActions, type DayActions } from '../src/actions'
import { BUYERS, CARS, PARTS, PARTS_TAXONOMY, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { advanceDay } from '../src/advanceDay'
import { planGroupRepair } from '../src/bands'
import { buildSimContext } from '../src/context'
import { hashState } from '../src/hashState'
import { createInitialGameState } from '../src/newGame'
import { groupCarParts, testSpecialty, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

const POC_10_MODEL_IDS = [
  'honda-city-e-aa',
  'suzuki-wagon-r-ct21s',
  'honda-civic-sir2-eg6',
  'toyota-sprinter-trueno-ae86',
  'nissan-180sx-rps13',
  'toyota-chaser-tourer-v-jzx90',
  'nissan-silvia-ks-s14',
  'mazda-savanna-rx7-fc3s',
  'mazda-rx7-fd3s',
  'toyota-supra-rz-jza80',
]

function initialState(): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 1_200_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: testSpecialty(),
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [
      {
        id: 'car-0001',
        modelId: 'honda-city-e-aa',
        year: 1984,
        mileageKm: 128_000,
        color: 'Sodium Amber',
        provenanceNote: 'one-owner, garage kept, Gunma plates',
        authenticityPercent: 88,
        parts: {
          ...groupCarParts({
            engine: 'worn',
            drivetrain: 'worn',
            suspension: 'worn',
            body: 'worn',
            interior: 'worn',
          }),
          // Sprint 32: every slot defaults to a filled stock part now, so
          // day 3's scripted install-part job (below) needs a genuinely
          // empty target slot - a group-level install into an
          // already-occupied slot is refused by the tightened
          // installFitGate. dampers is the suspension-group part the script
          // installs the spare coilovers onto.
          dampers: { installed: null },
        },
        symptoms: [],
        apparentBandByPartId: null,
      },
    ],
    partInventory: [
      {
        id: 'pi-0001',
        // Sprint 53: honda-city-e-aa (car-0001) is 'shitbox' tier - the
        // fitment-class gate refuses a mismatched-class spare part.
        partId: 'shitbox-tanuki-street-coilovers',
        band: 'mint',
        genuinePeriod: false,
        origin: { kind: 'market', day: 1 },
      },
    ],
    staff: [],
    staffAds: [],
    jobs: [],
    marketHeat: Object.fromEntries(POC_10_MODEL_IDS.map((id) => [id, 100])),
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    // car-0001 starts parked (Sprint 17: parking is a real, explicit slot
    // now, not "any owned car not in a service bay") - day 1's scripted
    // move-to-service action needs a real source slot to move it out of.
    parkingCarIds: ['car-0001', null, null],
    graceParkingCarId: null,
    laborSlotsSpentToday: 0,
    // Sprint 36: every tool line is owned at tier 1 from day one - the
    // scripted day-1 body repair just runs at the tier-1 repair level; the
    // job's caller-sized 3 labor slots below are the fixture's own script,
    // not a plan-derived figure.
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    storyMissions: [],
  }
}

const noActions: DayActions = emptyDayActions()

/**
 * Scripted 30-day career: day 1 moves the car into the (sole, starting)
 * service bay and opens a repair-zone job (body group, target mint, 3
 * slots) and works it to completion, then opens an install-part job for the
 * spare coilovers and completes it; the remaining days pass idle so weekly
 * rent (days 7/14/21/28) and market-heat drift exercise on schedule. Seed 42
 * per the roadmap's own golden-master example. The car stays in the service
 * bay for the rest of the career (moves are free, but nothing here needs to
 * move it back out) - labor only reaches a job whose car is in a service bay.
 */
function scriptedActionsForDay(day: number): DayActions {
  if (day === 1) {
    return {
      ...noActions,
      moveCars: [{ carInstanceId: 'car-0001', to: 'service' }],
      createJobs: [
        {
          carInstanceId: 'car-0001',
          kind: 'repair-zone',
          componentId: 'body',
          targetBand: 'mint',
          laborSlotsRequired: 3,
        },
      ],
      laborAssignments: [{ jobId: 'job-1-0', laborSlots: 2 }],
    }
  }
  if (day === 2) {
    return { ...noActions, laborAssignments: [{ jobId: 'job-1-0', laborSlots: 1 }] }
  }
  if (day === 3) {
    return {
      ...noActions,
      createJobs: [
        {
          carInstanceId: 'car-0001',
          kind: 'install-part',
          componentId: 'suspension',
          partInstanceId: 'pi-0001',
          laborSlotsRequired: 1,
        },
      ],
      laborAssignments: [{ jobId: 'job-3-0', laborSlots: 1 }],
    }
  }
  return noActions
}

function runCareer(days: number): GameState {
  let state = initialState()
  for (let day = 1; day <= days; day++) {
    const actions = scriptedActionsForDay(day)
    const result = advanceDay(state, actions, state.seed + state.day, CONTEXT)
    state = result.state
  }
  return state
}

describe('advanceDay golden master', () => {
  it('a scripted 30-day career reproduces an exact state hash', () => {
    // Sprint 41 re-pins this hash (was 7a495efd): tier-scaled repair costs
    // change the day-1 body repair's real cash charge (and every other
    // repair cost downstream), a real cash-flow change, not a logic bug -
    // every other assertion in this file (cash deltas, part installs,
    // catalog refresh) still passes against the same scripted career.
    // Sprint 38 re-pins this hash (was 7eb02198): the hashed state's SHAPE
    // changed (the new `specialty` record added to GameState) - the offer
    // SEQUENCE itself is unaffected at all-zero specialty (proven directly
    // in serviceJobs.test.ts's "byte-identical to pre-Sprint-38 behavior"
    // tests), so this is a pure state-shape change, not a draw-order or
    // value-model change.
    // Sprint 42 re-pins this hash (was ad88a86b): the hashed state's SHAPE
    // changed again (the new `carLedgers` record added to GameState). Pure
    // bookkeeping, not an economic change: a day-by-day cashYen/ownedCars/
    // partInventory trace of this exact scripted career, captured against
    // this working tree and against a `git worktree` checkout of the
    // pre-Sprint-42 commit, diffed byte-identical before this hash was
    // touched (see sprint42.md's Exit for the full comparison).
    // Sprint 44 re-pins this hash (was 37b5ace7): repair cost is now derived
    // from the installed part's own catalog price (a much cheaper formula
    // than Sprint 41's tier-scaled step cost) and the catalog itself was
    // rebased across the board - a real, intended cash-flow change (the
    // day-1 body repair and every downstream repair charge less), not a
    // logic bug. Every other assertion in this file (job completion, band/
    // slot changes, determinism) still passes unchanged against this same
    // scripted career - only the cash number moved.
    // Re-pinned again same day (was d73f6273): fixes a real playtest bug -
    // `generateDailyAuctionArrivals` used `next.day` (still 1 on the first
    // advanceDay call) instead of `next.day + 1`, colliding with the day-1
    // seed batch's own `lot-1-*` ids (see the new
    // "no colliding auction lot ids" describe block below for the full
    // mechanism). This scripted career's own auction catalog refresh now
    // mints different lot ids/expiresOnDay values on the days that spawn a
    // fresh arrival - a real, intended id/day-stamp change, not a value-model
    // regression. Every other assertion in this file still passes unchanged.
    // Re-pinned again (Sprint 45, was 118d523d): `GameState` gained the new
    // `graceParkingCarId` field (the double-parking grace slot) and every
    // `advanceDay` tick now runs a new day-boundary step (`resolveGraceParking`)
    // - a real shape change to the hashed state, not a value-model regression.
    // This scripted career never actually double-parks a car, so the field
    // stays `null` throughout; every other assertion in this file still
    // passes unchanged against this same scripted career.
    // Re-pinned again (Sprint 52, was 008cd2e7): the day-1 offer-count ramp
    // and the new classifieds day-boundary step both add real GameState
    // fields and consume the shared rng stream, shifting every subsequent
    // draw - expected, not a regression. Every other assertion in this file
    // still passes unchanged against this same scripted career.
    // Re-pinned again (Sprint 53, was 4e6c8a68): fitment-class parts
    // (economy-bible.md law 3) - every stock/aftermarket part now resolves
    // to a class-scoped catalog SKU (this fixture's own spare coilovers
    // needed updating from `tanuki-street-coilovers` to
    // `shitbox-tanuki-street-coilovers` to still fit `car-0001`, a shitbox-
    // tier car), and the catalog itself grew from 116 to 464 entries with
    // fitment-derived prices - a real, intended catalog/pricing change, not
    // a logic bug. Every other assertion in this file (job completion,
    // determinism, the day-3 install landing on the dampers slot) still
    // passes unchanged against this same scripted career.
    // Re-pinned again (Sprint 57, was 9a900aae): `GameState` gained
    // `serviceJobLedgers` (additive, default `{}`) - a real state-shape
    // change, not a logic bug; this scripted career never accepts a
    // service job, so the field stays empty throughout and every other
    // assertion in this file still passes unchanged.
    // Re-pinned again (Sprint 66, was f354f178): the economy changed on
    // purpose, in three ways that all reach a scripted career's end state -
    // `marketRepairDiscount` 1.2 -> 1.5 with `maxBillFraction` 0.7 -> 0.6 (the
    // wage law, economy-bible law 6), the value formula's new two-slope split
    // at each tier's expectation band (law 1 as amended), and a rebuilt
    // generation chain (`wearExposure`, `AUCTION_MIN_AGE_YEARS`, ~doubled
    // spawn rates). A golden master that did NOT move here would mean those
    // changes did nothing. The drift is covered by targeted assertions rather
    // than taken on trust: the ceiling/floor/no-free-lunch/foundation/wage
    // probes and the whole `generationCoherence` suite all pass, and every
    // other test in this file still passes unchanged.
    // Re-pinned again (Sprint 70, was 9f8e0a15): `PartInstanceSchema` gained
    // a required `origin` field (parts provenance) - a new field in every
    // hashed state, not a logic change; every other assertion in this file
    // still passes unchanged.
    // Re-pinned again (Sprint 73, was edd4dc35): `generateAuctionCarInstance`
    // now rolls a symptom-count check on EVERY car it generates (Sprint 73
    // decision 2), even one that lands on zero symptoms - that one extra
    // `rng.next()` call per generated car shifts every subsequent random draw
    // for the rest of the run, so the hash moves even though no PRE-EXISTING
    // mechanic's own logic changed; every other assertion in this file still
    // passes unchanged.
    // Re-pinned again (Sprint 74, was 4570c86a): `GameState` gained
    // `inspectionVisit` (default `null`) and each car symptom entry gained
    // `runTestIds` (default `[]`) - a pure state-SHAPE change, not a logic
    // change; every other assertion in this file still passes unchanged.
    // Re-pinned again (Sprint 75, was 73b3c512): `generateAuctionCarInstance`
    // now rolls one extra `rng.next()` per non-forced-induction slot (the
    // aftermarket-at-generation chance, decision 1) even on the vast
    // majority of slots that don't hit it - a real, intentional generation
    // change (the standing TODO.md item this sprint closes), not a bug;
    // every other assertion in this file still passes unchanged.
    // Re-pinned again (Sprint 76, was a808b5d7): `GameState` gained
    // `storyMissions` (default `[]`), and `advanceDay`'s new day-boundary
    // mission hook actually populates it now - the shipped placeholder
    // mission's `gateReputationPoints: 0` means it goes from locked to
    // `offered` on this very career's first day-boundary tick, a real state
    // change, not a bug; every other assertion in this file still passes
    // unchanged.
    // Re-pinned again (Sprint 78, was 8a89c1d6): the real campaign replaced
    // the placeholder missions - `four-wheels` (gate 0) is now the mission
    // that goes from locked to `offered` on this career's first day-boundary
    // tick, with different content than `placeholder-a` had, a real content
    // change, not a bug; every other assertion in this file still passes
    // unchanged.
    // Re-pinned again (Sprint 80, was 6dafb76e): `GameState` gained `staffAds`
    // (default `[]`), and `advanceDay`'s new weekly staff-ad refresh actually
    // populates it on every 7-day boundary this 30-day career crosses (days 7,
    // 14, 21, 28), each posting seeded candidate rolls - a real state change
    // (new field plus its own rng draws), directive 17 case (a), not a bug;
    // every other assertion in this file still passes unchanged.
    // Re-pinned again (Sprint 80 amendment 2026-07-17, was 8166e5e1): the
    // orchestrator's ruling re-derived the wage coefficients
    // (wagePerStatPointYen 1600 -> 1000, hustlePremiumYen 4000 -> 1500), so each
    // weekly-refreshed job-ad candidate's `weeklyWageYen` (a pure function of
    // its rolled stats) now differs. This career hires no staff, so passive
    // service-bay income stays 0 throughout and the rng stream is byte-identical
    // (wage is derived, not rolled) - only the candidate wage VALUES stored in
    // `staffAds` moved. Directive 17 case (a), a content retune, not a bug.
    // Re-pinned again (Sprint 81, was cfcde727): content wave I grew the
    // generation pick pools (cars.json 10 -> 25 models, symptoms.json 8 -> 14),
    // so every seeded auction-catalog roll draws different lots and symptom
    // instances from day 7 onward. Directive 17 case (a): a content change,
    // not a sim-logic change; determinism itself is re-proven by the
    // repeat-run test below, which passes unchanged.
    // Re-pinned again (Sprint 80 crew-model rework, was e1cfd24f): the reworked
    // candidate shape (hustle removed from `stats`, `laborSlotsPerDay`/
    // `assignment`/`pendingAssignment` added, wage coefficients re-derived) and
    // the extra per-candidate labour-slot roll change every weekly-refreshed job
    // ad on this 30-day career (days 7/14/21/28). This career hires no staff, so
    // there is no contract income and no assignment commit - only the `staffAds`
    // candidate contents moved. The refresh is still the last rng consumer of the
    // tick, so no other system's draws shift. Directive 17 case (a), a content/
    // schema rework, not a bug; the repeat-run determinism test still passes.
    // Re-pinned again (Sprint 83, was 6e62e1c3): content wave II grew the
    // generation pick pools again (cars.json 25 -> 26 models, symptoms.json 14
    // -> 17), so every seeded auction-catalog roll from day 7 onward draws
    // different lots and symptom instances. Directive 17 case (a): a content
    // change, not a sim-logic change; determinism itself is re-proven by the
    // repeat-run test below, which passes unchanged. (This hash was pinned
    // against the wave's interim 18-symptom pool and held unchanged when the
    // orchestrator cut `clutch-slip` to reach the final 17 - none of this
    // career's seeded symptom draws landed on the cut entry.)
    // Re-pinned again (Sprint 85, was 21512af3): the honesty-fixes arc moves
    // the seeded stream and the end state in three intended ways (directive 17
    // case (a)) - decision 3 rolls a per-offer service-job lifetime
    // (`rng.int`) inside every day's offer generation, shifting every
    // subsequent draw for the rest of the run; decision 5 replaces the uniform
    // auction model pick with a reputation-weighted one, so an `unknown`-rep
    // career draws different (shitbox-biased) Local Yard lots from day 1; and
    // decision 2 shrank the `storyMissions` record shape (no `dueOnDay`/
    // `reofferOnDay`, no `lapsed`). Determinism itself is re-proven by the
    // repeat-run test below, which passes unchanged.
    const finalState = runCareer(30)
    expect(finalState.day).toBe(31)
    expect(hashState(finalState)).toBe('9a47cf6b')
  })

  it('the same 30-day script from the same seed is fully deterministic', () => {
    const a = hashState(runCareer(30))
    const b = hashState(runCareer(30))
    expect(a).toBe(b)
  })

  it('the repair-zone job completes and restores the body group to mint', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.parts.panels.installed?.band).toBe('mint')
    expect(car?.parts.aero.installed?.band).toBe('mint')
  })

  it('the install-part job moves the spare coilovers onto the dampers slot', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.parts.dampers.installed?.partId).toBe('shitbox-tanuki-street-coilovers')
    expect(finalState.partInventory).toHaveLength(0)
  })

  it('weekly auction catalogs refresh even when no bids are placed', () => {
    const finalState = runCareer(30)
    expect(finalState.activeAuctionLots.length).toBeGreaterThan(0)
    const tiers = new Set(finalState.activeAuctionLots.map((lot) => lot.tier))
    expect(tiers.has('local-yard')).toBe(true)
  })

  it('rent is charged again, every 7 days (Sprint 23 decision 4: restored from 0)', () => {
    const finalState = runCareer(30)
    // The day-1 body repair charges (Sprint 26) the group's real per-grade
    // repair cost, on top of rent - no consumables fee (Sprint 47 decision 1
    // deleted the old per-job flat charge). Rent charges on days 7/14/21/28
    // within a 30-day career (four times) at economy.json's WEEKLY_RENT_YEN.
    const bodyPlan = planGroupRepair(
      initialState().ownedCars[0]!,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy.restoration.repairStepFraction,
    )
    const rentChargeCount = 4
    expect(finalState.cashYen).toBe(
      1_200_000 - bodyPlan.costYen - rentChargeCount * CONTEXT.economy.WEEKLY_RENT_YEN,
    )
  })
})

/**
 * A second golden master covering the money path the job-loop career above
 * never touches: winning a lot at auction and selling the car. Pinned by
 * hash so a regression here trips the golden test, not only the unit tests.
 * (External review 2026-07, 5b.)
 */
describe('advanceDay golden master - acquisition and sale path', () => {
  function acquisitionCareer(): { won: GameState; sold: GameState } {
    // Sprint 59 retuned STARTING_CASH_YEN down (1,500,000 -> 300,000) - this
    // scenario's own scripted "over-market" bid (bookValueYen * 3) exists to
    // guarantee a win against ANY realistic rival ceiling, not to exercise
    // real starting-cash affordability, so it needs headroom the new lower
    // starting cash no longer gives it. Bumped here rather than lowering the
    // bid multiplier, so this test stays decoupled from future starting-cash
    // retunes entirely.
    let state = { ...createInitialGameState(CONTEXT, 42), cashYen: 5_000_000 }
    let guard = 0
    while (state.activeAuctionLots.length === 0 && guard++ < 30) {
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
    }
    const lot = state.activeAuctionLots.find((l) => l.tier === 'local-yard')
    if (!lot) throw new Error('expected a local-yard lot to appear')
    // An over-market bid - well above any realistic demand ceiling - takes
    // the lead immediately and stays there (the overnight step's
    // at-or-above-ceiling branch is silence, not a counter-raise), so this
    // hammers to the player once quietDays or the backstop resolves it
    // (Sprint 20: bidding no longer resolves the instant it's placed).
    state = advanceDay(
      state,
      { ...noActions, bidsOnLots: [{ lotId: lot.id, maxBidYen: lot.bookValueYen * 3 }] },
      state.seed + state.day,
      CONTEXT,
    ).state
    guard = 0
    while (state.activeAuctionLots.some((l) => l.id === lot.id) && guard++ < 30) {
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
    }
    const won = state
    const car = won.ownedCars[0]
    if (!car) throw new Error('expected to win the lot')

    // Sprint 31: selling is no longer instant - mark the car for sale, wait
    // for the daily offer draw to produce a live offer, then accept it.
    state = advanceDay(
      won,
      { ...noActions, setForSale: [{ carInstanceId: car.id, forSale: true }] },
      won.seed + won.day,
      CONTEXT,
    ).state
    guard = 0
    while (!state.pendingOffers.some((o) => o.carInstanceId === car.id) && guard++ < 60) {
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
    }
    if (!state.pendingOffers.some((o) => o.carInstanceId === car.id)) {
      throw new Error('expected an offer to arrive within 60 days')
    }
    const sold = advanceDay(
      state,
      { ...noActions, acceptOffers: [{ carInstanceId: car.id }] },
      state.seed + state.day,
      CONTEXT,
    ).state
    return { won, sold }
  }

  it('wins a lot at auction, then sells the car', () => {
    const { won, sold } = acquisitionCareer()
    expect(won.ownedCars).toHaveLength(1)
    expect(sold.ownedCars).toHaveLength(0)
    expect(sold.cashYen).toBeGreaterThan(0)
  })

  it('reproduces an exact state hash (deterministic acquisition->sale)', () => {
    // Re-pinned for Sprint 41 (was 8c2d16c4): tier-scaled repair/restoration
    // costs (and the hassleFactor/floorFraction retune) change this career's
    // real cash flow and sale value - a real economy change, not a logic
    // bug (`won.ownedCars`/`sold.ownedCars`/`sold.cashYen > 0` above still
    // hold).
    // Re-pinned for Sprint 38 (was ce6e0f11): same cause as the 30-day
    // career above - the hashed state's SHAPE gained `specialty`; no draw-
    // order or value-model change (sale price math is untouched).
    // Re-pinned for Sprint 42 (was 7317802d): same cause as the 30-day
    // career's own Sprint 42 re-pin above - the hashed state's SHAPE gained
    // `carLedgers`, byte-identical day-by-day cash trace proven against the
    // pre-Sprint-42 commit before this hash was touched.
    // Re-pinned for Sprint 44 (was 13501bbf): same cause as the 30-day
    // career's own Sprint 44 re-pin above - repair cost now derives from the
    // installed part's own (rebased, cheaper) catalog price, a real cash-flow
    // change; `won.ownedCars`/`sold.ownedCars`/`sold.cashYen > 0` above still
    // hold unchanged.
    // Re-pinned again same day (was 6849aad8): same cause as the 30-day
    // career's own same-day re-pin above - the auction-lot-id collision fix
    // (`next.day + 1`) changes which id/expiresOnDay a fresh arrival lot
    // gets stamped with; `wins a lot at auction, then sells the car` above
    // still holds unchanged (real car won, real sale, positive cash).
    // Re-pinned again (Sprint 45, was 345b10a8): same cause as the 30-day
    // career's own Sprint 45 re-pin above - `GameState` gained
    // `graceParkingCarId` (a real shape change) and the new
    // `resolveGraceParking` day-boundary step runs on every tick; this career
    // never actually double-parks a car, so the field stays `null`
    // throughout - `wins a lot at auction, then sells the car` above still
    // holds unchanged.
    // Re-pinned again (Sprint 52, was b70f72e9): same cause as the 30-day
    // career's own Sprint 52 re-pin above (the offer-count ramp and the new
    // classifieds day-boundary step both shift the shared rng sequence and
    // add new GameState fields) - `wins a lot at auction, then sells the
    // car` above still holds unchanged.
    // Re-pinned again (Sprint 53, was ab316a54): same cause as the 30-day
    // career's own Sprint 53 re-pin above - fitment-class parts (economy-
    // bible.md law 3) rebase the whole catalog's identity/pricing; this
    // career is purely auction-generation-driven (no hand-fixed part
    // fixture), so the shift is a real, intended value-model/generation
    // change, not a logic bug - `wins a lot at auction, then sells the car`
    // above still holds unchanged (real car won, real sale, positive cash).
    // Re-pinned again (Sprint 54, was 63d7048c): the one-slope value formula
    // (economy-bible.md law 1) and the generation-time bill guard (law 2)
    // both change how this career's rolled/generated car is priced and
    // conditioned - a real, intended value-model change, not a logic bug;
    // `wins a lot at auction, then sells the car` above still holds
    // unchanged.
    // Re-pinned again (Sprint 55, was 2ec1f080): decision 3's retune pass
    // (economy-bible.md law 4) moved `AUCTION_WHOLESALE_FRACTION` (0.85 ->
    // 0.75, pulling rival private valuations back down once the Sprint 54
    // value law made anchorValueYen less discounted) and `selling.offerSpread`
    // (`[0.82, 1.12]` -> `[0.90, 1.08]`, raising the walk-in sale floor) - both
    // real, intended content retunes touching this career's auction/sale
    // price path, not a logic bug; `wins a lot at auction, then sells the
    // car` above still holds unchanged.
    // Re-pinned again (Sprint 57, was 60785b98): `GameState` gained
    // `serviceJobLedgers` (additive, default `{}`) - a real state-shape
    // change, not a logic bug; this career never touches a service job, so
    // the field stays empty throughout and `wins a lot at auction, then
    // sells the car` above still holds unchanged.
    // Re-pinned again (Sprint 59, was 179db04e): the retuned
    // AUCTION_WHOLESALE_FRACTION/AUCTION_RESERVE_PRICE_FRACTION/selling
    // .offerSpread all shift this career's real auction/sale price path, and
    // `acquisitionCareer`'s own starting cash is now bumped to 5,000,000 (the
    // scripted over-market bid needs headroom the new, much lower
    // STARTING_CASH_YEN no longer gives it) - both real, intended changes,
    // not a logic bug; `wins a lot at auction, then sells the car` above
    // still holds unchanged.
    // Re-pinned (Sprint 66, was 2103500e): same cause as the 30-day career
    // hash above - this career buys and sells a car, so the new value slope
    // and the rebuilt generation chain both reach its end state by design.
    // Re-pinned again (Sprint 70, was cfabcf38): same cause as the 30-day
    // career hash above - `PartInstanceSchema` gained a required `origin`
    // field (parts provenance), a new field in every hashed state.
    // Re-pinned again (Sprint 73, was 79f49596): same cause as the 30-day
    // career hash above - every generated car now rolls one extra
    // symptom-count check, shifting the whole subsequent random sequence.
    // Re-pinned again, same sprint (was f1e394b3, after wiring
    // `carGuideValueYen`'s fear-pricing branch): the car this scenario wins
    // and sells carries no symptom of its own (confirmed directly), but
    // OTHER lots in the same active catalog can - `advanceLotOvernight`
    // reprices every active lot nightly, so a symptomatic lot elsewhere on
    // the board now fear-prices differently, which can shift which lots
    // clear/hammer/expire and this model's `marketHeat`, a real economy-wide
    // consequence of decision 3's seam going live, not a bug in this specific
    // scenario's own car.
    // Re-pinned again (Sprint 74, was 404a063c): same cause as the 30-day
    // career hash above - a pure state-SHAPE change (`inspectionVisit`,
    // `runTestIds`), not a logic change.
    // Re-pinned again (Sprint 75, was 7bb89325): same cause as the 30-day
    // career hash above - the new per-slot aftermarket-at-generation roll.
    // Re-pinned again (Sprint 76, was ddaccece): same cause as the 30-day
    // career hash above - `storyMissions` is real, populated state now.
    // Re-pinned again (Sprint 78, was 9c825103): same cause as the 30-day
    // career hash above - the real campaign's `four-wheels` content replaced
    // `placeholder-a`.
    // Re-pinned again (Sprint 80, was 486fefeb): same cause as the 30-day
    // career hash above - `GameState` gained `staffAds` and the new weekly
    // staff-ad refresh populates it with seeded candidate rolls on every
    // 7-day boundary this career crosses (directive 17 case (a)).
    // Re-pinned again (Sprint 81, was 889d6691): same cause as the 30-day
    // career hash above - the 25-model / 14-symptom pick pools change which
    // lots each seeded catalog roll produces (directive 17 case (a)).
    // Re-pinned again (Sprint 83, was 65447382): same cause as the 30-day
    // career hash above - the 26-model / 17-symptom pick pools change which
    // lots each seeded catalog roll produces (directive 17 case (a)). Pinned
    // interim at 2ecb0cb9 against the wave's 18-symptom pool, then moved once
    // more when the orchestrator cut `clutch-slip` (failed the sleeper/trap
    // coherence gate at common/uncommon) - the 18 -> 17 pool shifts this
    // career's seeded symptom draws where the 30-day career's hold still.
    // Re-pinned again (Sprint 85, was 83bc96ab): same causes as the 30-day
    // career hash above - the per-offer service-job lifetime roll (decision 3)
    // and the reputation-weighted auction pick at unknown rep (decision 5)
    // shift this acquisition->sale career's seeded stream and its lots from day
    // 1; directive 17 case (a). The win/sale still resolve (real car won, real
    // sale, the deterministic repeat still holds).
    expect(hashState(acquisitionCareer().sold)).toBe('c6ca47a8')
  })
})

/**
 * Regression test for a real playtest bug (2026-07-13): the day-1 opening
 * board (`createInitialGameState` -> `refreshCatalogs`) and the first daily
 * arrivals roll (`generateDailyAuctionArrivals`, called from inside the very
 * first `advanceDay`) used to both stamp fresh lots `lot-1-${tier}-${i}` -
 * `next.day` was still 1 on that first call, identical to the day-1 seed
 * batch's own day. Two DIFFERENT lots sharing one id string then collapsed
 * into "the same lot" everywhere bidding.ts keys off `lotId` (`resolvePlaceBid`
 * mirrors a bid onto every array entry matching the id; `removeLot` filters
 * all of them out on one hammer). The player-visible symptom: a genuine win
 * (cash spent, car received) immediately followed by a bogus "Lost lot ...
 * went for Y..." for a phantom duplicate that never had a leg to stand on -
 * read by the player as "I was leading and then randomly lost," reported
 * repeatedly before this trace pinned the exact mechanism. Fixed by
 * generating the first day's arrivals for `next.day + 1`, the same offset
 * `generateDailyServiceJobOffers` already used one call below for the
 * identical hazard.
 */
describe('advanceDay: no colliding auction lot ids (2026-07-13 regression)', () => {
  it('the first advanceDay call never mints an arrival lot id that collides with the day-1 seed batch', () => {
    for (let seed = 1; seed <= 50; seed++) {
      let state = createInitialGameState(CONTEXT, seed)
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
      const ids = state.activeAuctionLots.map((lot) => lot.id)
      expect(new Set(ids).size, `seed ${seed}: duplicate lot id in activeAuctionLots`).toBe(
        ids.length,
      )
    }
  })

  it('30 days into a career, no two active lots ever share an id', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let state = createInitialGameState(CONTEXT, seed)
      for (let day = 1; day <= 30; day++) {
        state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
        const ids = state.activeAuctionLots.map((lot) => lot.id)
        expect(
          new Set(ids).size,
          `seed ${seed} day ${day}: duplicate lot id in activeAuctionLots`,
        ).toBe(ids.length)
      }
    }
  })
})

describe('advanceDay: inspectionVisit dies at the day boundary (Sprint 74 decision 1)', () => {
  it('an active visit with real minutes left is unconditionally cleared to null by the next advanceDay call', () => {
    const state: GameState = {
      ...createInitialGameState(CONTEXT, 1),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 45 },
    }
    const result = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
    expect(result.state.inspectionVisit).toBeNull()
  })

  it('stays null across the boundary when no visit was active', () => {
    const state = createInitialGameState(CONTEXT, 1)
    expect(state.inspectionVisit).toBeNull()
    const result = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
    expect(result.state.inspectionVisit).toBeNull()
  })
})

describe('advanceDay: the daily offer draw and acceptance (Sprint 31)', () => {
  it('a for-sale car eventually draws a live offer, logged as offer-received', () => {
    let state: GameState = {
      ...initialState(),
      day: 10,
      carsForSale: [{ carInstanceId: 'car-0001', sinceDay: 10 }],
    }
    let sawOffer = false
    for (let i = 0; i < 60 && !sawOffer; i++) {
      const result = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
      state = result.state
      if (state.pendingOffers.some((o) => o.carInstanceId === 'car-0001')) {
        sawOffer = true
        expect(result.log).toContainEqual(
          expect.objectContaining({ type: 'offer-received', carInstanceId: 'car-0001' }),
        )
      }
    }
    expect(sawOffer).toBe(true)
  })

  it("accepting today's offer sells the car through the walk-in resolution path", () => {
    const state: GameState = {
      ...initialState(),
      day: 10,
      carsForSale: [{ carInstanceId: 'car-0001', sinceDay: 10 }],
      pendingOffers: [{ carInstanceId: 'car-0001', buyerId: 'first-timer', priceYen: 400_000 }],
    }
    const cashBefore = state.cashYen
    const { state: next, log } = advanceDay(
      state,
      { ...noActions, acceptOffers: [{ carInstanceId: 'car-0001' }] },
      state.seed + state.day,
      CONTEXT,
    )
    expect(next.ownedCars).toHaveLength(0)
    expect(next.cashYen).toBe(cashBefore + 400_000)
    expect(log).toContainEqual(
      expect.objectContaining({ type: 'car-sold', channel: 'walk-in-offer', priceYen: 400_000 }),
    )
  })

  it('an unaccepted offer expires at End Day - it never survives into the next advanceDay call (no-reflex rule)', () => {
    const state: GameState = {
      ...initialState(),
      day: 10,
      carsForSale: [], // not (re-)marked for sale, so nothing replaces the stale offer below
      pendingOffers: [{ carInstanceId: 'car-0001', buyerId: 'first-timer', priceYen: 400_000 }],
    }
    const { state: next } = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
    expect(next.pendingOffers.some((o) => o.carInstanceId === 'car-0001')).toBe(false)
    // The car itself is untouched (never sold) - the offer just lapsed.
    expect(next.ownedCars).toHaveLength(1)
  })
})
