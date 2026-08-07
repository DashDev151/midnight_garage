import { emptyDayActions, type DayActions } from '../src/actions'
import { BUYERS, CARS, PARTS, PARTS_TAXONOMY, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { advanceDay } from '../src/advanceDay'
import { planGroupRepair } from '../src/bands'
import { buildSimContext } from '../src/context'
import { bayCountsByKind } from '../src/facilities'
import { computeWeeklyRentYen } from '../src/finances'
import { hashState } from '../src/hashState'
import { resolveHireMachineLine } from '../src/jobs'
import { createInitialGameState } from '../src/newGame'
import { groupCarParts, testSceneStanding, testToolTiers } from './testFixtures'

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
    sceneStanding: testSceneStanding(),
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [
      {
        id: 'car-0001',
        modelId: 'honda-city-e-aa',
        year: 1984,
        mileageKm: 128_000,
        factoryColour: 'white',
        provenanceNote: 'one-owner, garage kept, Gunma plates',
        parts: {
          ...groupCarParts({
            engine: 'worn',
            drivetrain: 'worn',
            suspension: 'worn',
            body: 'worn',
            interior: 'worn',
          }),
          // Every slot defaults to a filled stock part, so day 3's
          // scripted install-part job (below) needs a genuinely empty
          // target slot - a group-level install into an already-occupied
          // slot is refused by installFitGate. dampers is the
          // suspension-group part the script installs the spare
          // coilovers onto.
          dampers: { installed: null },
        },
        symptoms: [],
        apparentBandByPartId: null,
      },
    ],
    partInventory: [
      {
        id: 'pi-0001',
        // honda-city-e-aa (car-0001) is 'entry' tier - the
        // fitment-class gate refuses a mismatched-class spare part.
        partId: 'shitbox-tanuki-street-coilovers',
        band: 'mint',
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
    // car-0001 starts parked - day 1's scripted move-to-service action
    // needs a real source slot to move it out of.
    parkingCarIds: ['car-0001', null, null],
    forecourtBayCount: 2,
    forecourtCarIds: [null, null],
    graceParkingCarId: null,
    energySpentToday: 0,
    // Every tool line is owned at tier 1 from day one - the scripted
    // day-1 body repair just runs at the tier-1 repair level; the job's
    // caller-sized 3 labor slots below are the fixture's own script, not
    // a plan-derived figure.
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    toolShopsOwned: [],
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    workbenchPartId: null,
    machinePartId: null,
    storyMissions: [],
    // An empty bench (no assemblies pulled) - matches
    // `createInitialGameState`'s own seed, so the golden reflects the live shape.
    assemblyInventory: [],
  }
}

const noActions: DayActions = emptyDayActions()

/**
 * Scripted 30-day career: day 1 moves the car into the (sole, starting)
 * service bay and opens a repair-zone job (body group, target fine, 3
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
          targetBand: 'fine',
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

/**
 * Instant machine hires the scripted career fronts before a day's actions
 * queue - mirrors the store's own `hireMachineLine` wrapper (an immediate
 * action, not a `DayActions` entry, same as `attendAuction`). Day 1's body
 * repair climbs bodywork/underbody (body's signature slots) and day 3's
 * install targets dampers (a suspension signature slot), so both lines need
 * hiring for the day before the machine-gated work can proceed.
 */
function hireForDay(state: GameState, day: number): GameState {
  if (day === 1) return resolveHireMachineLine(state, 'body', CONTEXT).state
  if (day === 3) return resolveHireMachineLine(state, 'suspension', CONTEXT).state
  return state
}

function runCareer(days: number): GameState {
  let state = initialState()
  for (let day = 1; day <= days; day++) {
    state = hireForDay(state, day)
    const actions = scriptedActionsForDay(day)
    const result = advanceDay(state, actions, state.seed + state.day, CONTEXT)
    state = result.state
  }
  return state
}

describe('advanceDay golden master', () => {
  it('a scripted 30-day career reproduces an exact state hash', () => {
    const finalState = runCareer(30)
    expect(finalState.day).toBe(31)
    // One hash over the whole scripted career, so it moves when anything
    // feeding it moves: every generated lot's condition and value, the
    // catalog each aftermarket roll and repair quote draws from, every
    // labour and cash figure, and every derived stat. A deliberate change to
    // any of those is re-derived from a real run of this script; the script
    // itself is never bent to preserve the number.
    //
    // It also moves on a pure SHAPE change to any state this script still
    // holds at day 31, because `hashState` serializes the whole thing:
    // `CarLedger` gained `listingFeesYen` (sprint150.md) and this script ends
    // still owning its car, so its ledger carries one more key. The
    // acquisition-to-sale hash below is unmoved by the same change, because
    // that script sells the car and `resolveSellViaWalkIn` deletes the ledger
    // with it - which is the proof that this is a shape change and not a
    // behavioural one.
    //
    // It last moved when a car gained a DAMAGE PATTERN (sprint155.md). Four
    // things in this script's rng stream changed together: the pattern is drawn
    // right after the history, the panel zones are dealt out along a
    // pattern-weighted order (four more draws), the symptom draw is weighted
    // rather than uniform, and the budget draws a taxonomy group before it
    // picks a slot inside it. Every generated board therefore differs, and
    // every car carries one more stamped field. Re-derived from a real run,
    // twice, to confirm determinism.
    //
    // It last moved for the weekly cost sheet (sprint157.md): `GameState`
    // gained `financeLedger`, and this script trades, so the state carries a
    // week of real figures at day 31. Another pure shape-and-record change -
    // no cash figure, rng draw or derived stat moved, and the ledger is the
    // same money the career already moved, written down.
    //
    // It last moved because the damage pattern reached the CONDITION ROLL:
    // every slot now takes its group's pattern offset
    // (`partsGeneration.patternConditionSwingPercent`) before it buckets into a
    // band, so every generated board carries the same damage arranged
    // differently. No draw was added or removed - the offset consumes no rng -
    // and the style catalogue re-author moves every derived style figure the
    // state records alongside it. Re-derived from a real run, twice, to
    // confirm determinism.
    //
    // It last moved because a panel can now be beyond saving (sprint159.md):
    // `rollZoneStates` draws two more values per generated car (the escalation
    // past weldable, and whether that panel is absent outright), so every
    // generated board's rng stream shifts from that point on even where neither
    // roll lands. Re-derived from a real run, twice, to confirm determinism.
    //
    // It last moved because a bodyshell is priced as a bodyshell:
    // `baseCostYen.bodywork` carries the shell's weight in the cost-weighted band
    // factor, so raising it re-weights every generated car's condition factor
    // and every guide value that reads it. No draw was added or removed.
    // Re-derived from a real run, twice, to confirm determinism.
    //
    // It last moved for the paint system (sprint170.md): generation now rolls
    // a factory colour and a whole-car paint history for every car, and the
    // paint slot's own fit follows that roll instead of the generic per-slot
    // aftermarket mechanism, so every generated board's rng stream shifts from
    // that point on. Re-derived from a real run, twice, to confirm
    // determinism.
    //
    // It moves once more, on its own again, for standing moving the band:
    // `GameState` gained `sceneStanding`, `createInitialGameState` seeds it to
    // every scene at `none`. A pure SHAPE change, measured rather than
    // assumed: no roll, cash figure or derived stat moved, since nothing in
    // this script ever reads or sets a scene's own standing.
    //
    // It moves once more, on its own again, for the teardown of the old
    // specialty system: `GameState` loses `specialty` outright. A pure SHAPE
    // change, measured rather than assumed: this script never accepts or
    // completes a service job or a mission, so specialty held all-zero for
    // its whole 30 days under the old code too, which made the retired
    // offer-selection bias mathematically a no-op the whole way through
    // (`pickServiceJobTemplate`'s weighted roll and the replacement
    // `rng.pick` both reduce to `Math.floor(rng.next() * length)` at equal
    // weight) - no roll, cash figure or derived stat moved, only the key
    // disappearing from the state this hash serializes.
    //
    // It moves once more for a CONTENT change rather than a code one: the
    // shipped roster grows from 26 cars to 48, generated from the roster CSV.
    // Every auction catalogue this script draws now picks from a larger pool,
    // so the lots differ from day one and the whole career diverges. Nothing
    // in the sim moved. Re-derived from a real run.
    //
    // It moves again for the workbench: `GameState` gains the two work
    // stations this hash serialises, and on-car repair narrows to the parts
    // that never come off, so any scripted repair of a removable part is now
    // bench work. Re-derived from a real run.
    //
    // And again for the shops: `GameState` gains `toolShopsOwned`, which this
    // hash serialises. Re-derived from a real run.
    //
    // It moves once more, on its own again, for the summary body slot being
    // renamed `bodywork`: every car's `parts` map carries the new key and
    // `hashState` sorts keys, so both the key text and its position in the
    // serialisation move. A pure NAME change, measured rather than assumed:
    // rename `bodywork` back to `panels` throughout this state and the hash is
    // exactly the previous `2610e4d1`, so no roll, cash figure or derived stat
    // moved. Re-derived from a real run.
    expect(hashState(finalState)).toBe('b656e85d')
  })

  it('the same 30-day script from the same seed is fully deterministic', () => {
    const a = hashState(runCareer(30))
    const b = hashState(runCareer(30))
    expect(a).toBe(b)
  })

  it('the repair-zone job completes and restores the body group to fine', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.parts.bodywork.installed?.band).toBe('fine')
    expect(car?.parts.aero.installed?.band).toBe('fine')
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

  it('rent is charged again, every calendar.daysPerWeek days (calendar.rentDayOfWeek is 7, matching the old day % 7 === 0)', () => {
    const finalState = runCareer(30)
    // Rent lands on calendar.rentDayOfWeek (7, the end of the week, so a
    // brand-new player's first End Day is never a rent charge). Within a
    // 30-day career that is days 7/14/21/28 - four charges, matching the
    // pre-sprint149.md `day % 7 === 0` cadence exactly (finances.test.ts's
    // own 28-day span test is the one that proves the WEEKLY TOTAL is
    // unchanged regardless of which day the charge lands on). The opening
    // bay counts' own computed rate never moves (no bay is ever bought in
    // this script). `hireForDay`
    // fronts the body line's daily hire on day 1 (the body repair climbs a
    // signature slot) and the suspension line's on day 3 (the dampers
    // install targets one), each exactly once - a running cost, same
    // treatment as rent, never charged per operation.
    const weeklyRentYen = computeWeeklyRentYen(bayCountsByKind(initialState()), CONTEXT.economy)
    const bodyPlan = planGroupRepair(
      initialState().ownedCars[0]!,
      'body',
      'fine',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy.restoration.repairStepFraction,
      CONTEXT.economy.energy.energyPerBandStepByToolTier,
    )
    const { body: bodyFeeYen, suspension: suspensionFeeYen } =
      CONTEXT.economy.machineShopAssist.feeYenByGroup
    const rentChargeCount = 4
    expect(finalState.cashYen).toBe(
      1_200_000 -
        bodyPlan.costYen -
        bodyFeeYen -
        suspensionFeeYen -
        rentChargeCount * weeklyRentYen,
    )
  })
})

/**
 * A second golden master covering the money path the job-loop career above
 * never touches: winning a lot at auction and selling the car. Pinned by
 * hash so a regression here trips the golden test, not only the unit tests.
 */
describe('advanceDay golden master - acquisition and sale path', () => {
  function acquisitionCareer(): { won: GameState; sold: GameState } {
    // Scripted with high starting cash to guarantee an over-market bid wins
    // against any realistic rival ceiling, independent of future tuning.
    let state = { ...createInitialGameState(CONTEXT, 42), cashYen: 5_000_000 }
    let guard = 0
    while (state.activeAuctionLots.length === 0 && guard++ < 30) {
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
    }
    const lot = state.activeAuctionLots.find((l) => l.tier === 'local-yard')
    if (!lot) throw new Error('expected a local-yard lot to appear')
    // The instant buyout is the acquisition channel a queued action reaches -
    // it resolves the same tick it is queued, no overnight step involved.
    state = advanceDay(
      state,
      { ...noActions, buyoutLots: [{ lotId: lot.id }] },
      state.seed + state.day,
      CONTEXT,
    ).state
    const won = state
    const car = won.ownedCars[0]
    if (!car) throw new Error('expected to win the lot')

    // Selling requires marking the car for sale, waiting for an offer, then
    // accepting it - not instant.
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
    // The acquisition-to-sale hash, on the same terms as the golden master
    // above: the lot's rolled condition, the car's derived stats and the
    // buyer's taste-adjusted price all feed it, so it is re-derived from a
    // real run whenever one of them deliberately changes. It moved on its own
    // this time, while the 30-day golden master above held: the `entry` tier's
    // expected condition band became `fine`, which reprices a car but changes
    // nothing generation rolls, and this is the one script that actually buys
    // and sells a car. It moved again with the history roll (sprint154.md),
    // this time alongside the 30-day master, because that change reaches every
    // generated lot rather than only the priced ones. It moves once more, on
    // its own again, for the symptomChanceByTier raise that restores the
    // effective symptom rate to its signed value: the RNG draw sequence inside
    // symptom generation shifts with the input, and this is again the one
    // script whose rolled lot happens to fall on that draw; the 30-day master
    // held unchanged. It moves again with damage patterns (sprint155.md),
    // alongside the 30-day master, because that change reaches every generated
    // lot: where the damage lands, which zone carries it, and which symptom is
    // drawn. It moves again for the weekly cost sheet (sprint157.md), this
    // time alongside the 30-day master and for the same reason: `financeLedger`
    // is new state, and unlike a `CarLedger` it survives the sale - a sold
    // car's week still has to add up. It moves again with the pattern's reach
    // into the condition roll, alongside the 30-day master and for the same
    // reason as damage patterns themselves: every generated lot's bands are
    // arranged differently, and this script both buys and prices one. It moves
    // again for the beyond-saving panel (sprint159.md), alongside the 30-day
    // master and for the same reason: two more draws per generated car shift
    // every board's rng stream from the zone roll onward. It moves again for
    // the distance-priced body bill (sprint161.md), alongside the 30-day
    // master: every generated car's restoration bill moves, and this script
    // both buys a car at a guide value and sells one.
    //
    // It moves once more, on its own again, for the rolling road: `GameState`
    // gained `dyno`, `createInitialGameState` seeds it, and this is the one
    // script that starts from a real new career rather than a hand-written
    // literal, which is why the 30-day master above holds unchanged. A pure
    // SHAPE change, measured rather than assumed: strip the new key back out
    // of this state and the hash is exactly the previous `d280dc4d`, so no
    // roll, cash figure or derived stat moved. Nothing here ever could - a
    // dyno measures and changes nothing.
    //
    // It moves again for the paint system (sprint170.md), alongside the
    // 30-day master and for the same reason: every generated lot now rolls a
    // factory colour and a whole-car paint history, and the paint slot's own
    // fit reads that roll instead of the generic aftermarket mechanism, so
    // this script's bought and sold car is priced and generated differently.
    //
    // It moves once more, on its own again, for consumables as stock:
    // `GameState` gained `consumableStock`, `createInitialGameState` seeds it
    // to `{}`, and this is the one script that starts from a real new career
    // rather than a hand-written literal, which is why the 30-day master
    // above holds unchanged. A pure SHAPE change, measured rather than
    // assumed: strip the new key back out of this state and the hash is
    // exactly the previous `bc01e04e`, so no roll, cash figure or derived
    // stat moved. Nothing here ever could - this script never buys or uses a
    // tin, so the shelf stays empty from day 1 to the sale.
    //
    // It moves once more for the climbing chain (sprint175.md): `GameState`
    // gained `powerExpectationChain`, absent until a car is actually
    // delivered, and this is the one script that sells one - the 30-day
    // master above never completes a sale, so it holds unchanged. Not a pure
    // shape change: the sold car's own measured power becomes the chain's
    // first recorded `bestPowerPs`, a real figure rather than an
    // always-empty default. Re-derived from a real run.
    //
    // It moves once more, on its own again, for standing moving the band:
    // `GameState` gained `sceneStanding`, `createInitialGameState` seeds it to
    // every scene at `none`, same as the 30-day master above. A pure SHAPE
    // change, measured rather than assumed: this script's buy and sell prices
    // through no scene's raised band, since nothing here ever sets one.
    //
    // It moves once more, on its own again, for the earn event
    // (scene-standing-arc.md step 4): this is the one script that actually
    // completes a MATCHED sale, so `GameState` gaining `sceneLedger` is NOT a
    // pure shape change here (unlike the 30-day master above, which never
    // completes a sale and holds unchanged) - the sold car (a Toyota Carina,
    // day 4) genuinely credits the `daily-drivers` scene with a real ledger
    // entry at its real sale price. One delivery does not clear the
    // three-delivery Known threshold, so `sceneStanding` itself stays every
    // scene at `none`; only the ledger gains the entry. Re-derived from a
    // real run.
    //
    // It moves once more, on its own again, for word of mouth and scene
    // commissions (scene-standing-arc.md step 5/6): `GameState` gained
    // `sceneCommissions`, seeded to every scene with nothing live. A pure
    // SHAPE change, measured rather than assumed: strip the new key back out
    // of this state and the hash is exactly the previous `9cc0edef`, so no
    // roll, cash figure or derived stat moved. Nothing here ever could -
    // word of mouth reads as a flat 1 for every scene still at `none` (true
    // throughout this script), and no scene here ever reaches Respected, so
    // the commission board's own daily tick never draws from the shared rng
    // stream at all.
    //
    // It moves once more, on its own again, for the teardown of the old
    // specialty system: `GameState` loses `specialty` outright, same reason
    // and same shape-only conclusion as the 30-day master above - this
    // script never accepts or completes a service job either, so the retired
    // offer-selection bias was already a no-op throughout. No roll, cash
    // figure or derived stat moved.
    //
    // It moves once more, on its own again, for the champion gate
    // (sprint182.md): the acquisition roll and the lot itself are bit-for-bit
    // unchanged (same Toyota Carina, same day 2 win, the same daily-drivers
    // buyer still finds the day-4 listing), so this is not a shape change.
    // The lot arrives rough (reliability 51, style 9, authenticity 49,
    // measured), well under daily-drivers' own champion target of 75, so the
    // gate now zeroes the match: the shop front carries no `matchedOnly`
    // gate, so the sale still completes, but at the unmatched floor price
    // rather than a taste premium, and `sceneLedger` gains no entry where it
    // used to. Exactly the "the gate now reaches PRICE" consequence the
    // Stage E v5 amendment calls out by name. Re-derived from a real run.
    //
    // It moves once more for a CONTENT change rather than a code one: the
    // shipped roster grows from 26 cars to 48, so the acquisition roll draws
    // from a larger pool and the career diverges from its first catalogue.
    // Nothing in the sim moved. Re-derived from a real run.
    //
    // It moves again for the workbench, on the same terms as the golden
    // master above: `GameState` gains the two work stations this hash
    // serialises. Re-derived from a real run.
    //
    // And again for the shops, on the same terms: `GameState` gains
    // `toolShopsOwned`. Re-derived from a real run.
    //
    // It moves once more, on its own again, for mileage losing its ability to
    // ADD value: `valuation.mileageFactorCurve`'s first breakpoint drops from
    // 1.05 to 1.00, so the multiplier is flat at 1.00 from 0 to 60,000 km and
    // a car below that figure is no longer worth more than its book value.
    // The 30-day master above holds unchanged (it never completes a sale);
    // this script buys and sells a 21,744 km Wagon R, which is exactly the
    // car the change is about. Measured against the previous curve from the
    // same seed: the lot is bit-for-bit identical (same `lot-1-local-yard-0`,
    // same model, same year, same mileage, same 28 bands, still bought on day
    // 1), so nothing generation rolls moved. What moves is price and what
    // follows from it - the buyout falls 195834 to 184334 and the offer
    // accepted falls 164458 to 157575, and the first offer the car draws now
    // arrives on day 10 rather than day 3: the sale path reads the car's own
    // price, so the day an offer lands moves with it. Re-derived from a real
    // run.
    expect(hashState(acquisitionCareer().sold)).toBe('7118cd29')
  })
})

/**
 * Regression test: the day-1 opening board (`createInitialGameState` ->
 * `refreshCatalogs`) and the first daily arrivals roll
 * (`generateDailyAuctionArrivals`, called from inside the very first
 * `advanceDay`) must not stamp fresh lots with ids that collide with the
 * day-1 seed batch's own ids. Two lots sharing one id collapse into "the same
 * lot" everywhere that keys off `lotId`, causing bogus duplicate losses and
 * "randomly lost" player confusion. Fixed by generating the first day's
 * arrivals for `next.day + 1`, the same offset `generateDailyServiceJobOffers`
 * already used one call below for the identical hazard.
 */
describe('advanceDay: no colliding auction lot ids', () => {
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
      carsForSale: [
        {
          carInstanceId: 'car-0001',
          offersSeen: 0,
          channelId: 'shopFront',
          weekendMeetPending: false,
        },
      ],
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
      carsForSale: [
        {
          carInstanceId: 'car-0001',
          offersSeen: 0,
          channelId: 'shopFront',
          weekendMeetPending: false,
        },
      ],
      pendingOffers: [{ carInstanceId: 'car-0001', buyerId: 'daily-drivers', priceYen: 400_000 }],
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
      pendingOffers: [{ carInstanceId: 'car-0001', buyerId: 'daily-drivers', priceYen: 400_000 }],
    }
    const { state: next } = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
    expect(next.pendingOffers.some((o) => o.carInstanceId === 'car-0001')).toBe(false)
    // The car itself is untouched (never sold) - the offer just lapsed.
    expect(next.ownedCars).toHaveLength(1)
  })
})
