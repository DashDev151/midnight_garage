import { GameStateSchema, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { decodeSave, encodeSave, SAVE_VERSION } from './saveCodec'

/**
 * A save code produced by version 1, pinned as a literal. The Save law:
 * this must keep decoding to the same state in every future version, or a
 * migration is missing. Regenerate only when a version bump legitimately
 * changes the format (and add the matching migration).
 */
const GOLDEN_V1_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjoxLCJnYW1lU3RhdGUiOnsiZGF5Ijo1LCJzZWVkIjoxLCJjYXNoWWVuIjo5MDAwMDAsInJlcHV0YXRpb25UaWVyIjoidW5rbm93biJ9fQ=='

/**
 * A save code produced by version 2 (Sprint 08), pinned as a literal - same
 * Save law as the v1 code above. Carries non-default `reputationPoints` so
 * the test can distinguish "preserved" from "defaulted."
 */
const GOLDEN_V2_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjoyLCJnYW1lU3RhdGUiOnsiZGF5IjoxMiwic2VlZCI6OTksImNhc2hZZW4iOjExMDAwMDAsInJlcHV0YXRpb25UaWVyIjoibG9jYWwiLCJyZXB1dGF0aW9uUG9pbnRzIjo1LCJzZXJ2aWNlSm9iT2ZmZXJzIjpbXSwiYWN0aXZlU2VydmljZUpvYnMiOltdfX0='

/**
 * A save code produced by version 3 (Sprint 09), pinned as a literal - same
 * Save law again. Carries non-default `serviceBayCount`/`parkingBayCount` so
 * the test can distinguish "preserved" from "defaulted" for those, while
 * `laborSlotsSpentToday` (added in v4) is necessarily absent, proving the
 * v3 -> v4 migration default-fills it correctly.
 */
const GOLDEN_V3_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjozLCJnYW1lU3RhdGUiOnsiZGF5IjoyMCwic2VlZCI6NTUsImNhc2hZZW4iOjIwMDAwMDAsInJlcHV0YXRpb25UaWVyIjoia25vd24iLCJyZXB1dGF0aW9uUG9pbnRzIjoxMiwic2VydmljZUpvYk9mZmVycyI6W10sImFjdGl2ZVNlcnZpY2VKb2JzIjpbXSwic2VydmljZUJheUNvdW50IjoyLCJwYXJraW5nQmF5Q291bnQiOjQsInNlcnZpY2VCYXlDYXJJZHMiOltdfX0='

/**
 * A save code produced by version 5 (Sprint 12, post components-refactor),
 * pinned as a literal - same Save law again. Carries non-default
 * `laborSlotsSpentToday` so the test can distinguish "preserved" from
 * "defaulted", while `ownedEquipmentIds` (added in v6) is necessarily
 * absent, proving the v5 -> v6 migration default-fills it correctly.
 */
const GOLDEN_V5_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjo1LCJnYW1lU3RhdGUiOnsiZGF5IjozMywic2VlZCI6NywiY2FzaFllbiI6MzAwMDAwMCwicmVwdXRhdGlvblRpZXIiOiJrbm93biIsInJlcHV0YXRpb25Qb2ludHMiOjIwLCJzZXJ2aWNlSm9iT2ZmZXJzIjpbXSwiYWN0aXZlU2VydmljZUpvYnMiOltdLCJzZXJ2aWNlQmF5Q291bnQiOjIsInBhcmtpbmdCYXlDb3VudCI6NSwic2VydmljZUJheUNhcklkcyI6W10sImxhYm9yU2xvdHNTcGVudFRvZGF5IjozfX0='

/**
 * A save code produced by version 6 (Sprint 13, post equipment economy),
 * pinned as a literal - same Save law again. Carries non-default
 * `ownedEquipmentIds` so the test can distinguish "preserved" from
 * "defaulted", while `pendingPartOrders`/`cartPartIds` (added in v7) are
 * necessarily absent, proving the v6 -> v7 migration default-fills them
 * correctly.
 */
const GOLDEN_V6_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjo2LCJnYW1lU3RhdGUiOnsiZGF5Ijo1MCwic2VlZCI6MywiY2FzaFllbiI6NDUwMDAwMCwicmVwdXRhdGlvblRpZXIiOiJyZXNwZWN0ZWQiLCJyZXB1dGF0aW9uUG9pbnRzIjozMCwic2VydmljZUpvYk9mZmVycyI6W10sImFjdGl2ZVNlcnZpY2VKb2JzIjpbXSwic2VydmljZUJheUNvdW50IjozLCJwYXJraW5nQmF5Q291bnQiOjYsInNlcnZpY2VCYXlDYXJJZHMiOltdLCJsYWJvclNsb3RzU3BlbnRUb2RheSI6MSwib3duZWRFcXVpcG1lbnRJZHMiOlsid2VsZGVyIiwidGlyZS1tYWNoaW5lIl19fQ=='

/**
 * A save code produced by version 7 (Sprint 14, post cart/checkout rework),
 * pinned as a literal - same Save law again. Carries a real pending
 * `activeListings` entry in the pre-v8 shape (no `reputationDeltaOnSale`),
 * so the test can confirm the v7 -> v8 migration default-fills that field to
 * 0 rather than throwing - a pre-existing pending sale created before the
 * quality/lemon rule existed resolves reputation-neutral.
 */
const GOLDEN_V7_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjo3LCJnYW1lU3RhdGUiOnsiZGF5Ijo2MCwic2VlZCI6OSwiY2FzaFllbiI6NTAwMDAwMCwicmVwdXRhdGlvblRpZXIiOiJrbm93biIsInJlcHV0YXRpb25Qb2ludHMiOjQwLCJzZXJ2aWNlSm9iT2ZmZXJzIjpbXSwiYWN0aXZlU2VydmljZUpvYnMiOltdLCJzZXJ2aWNlQmF5Q291bnQiOjMsInBhcmtpbmdCYXlDb3VudCI6Nywic2VydmljZUJheUNhcklkcyI6W10sImxhYm9yU2xvdHNTcGVudFRvZGF5IjowLCJvd25lZEVxdWlwbWVudElkcyI6WyJ0aXJlLW1hY2hpbmUiXSwicGVuZGluZ1BhcnRPcmRlcnMiOltdLCJjYXJ0UGFydElkcyI6W10sImFjdGl2ZUxpc3RpbmdzIjpbeyJpZCI6Imxpc3RpbmctNTAtY2FyLTAwMDEiLCJjYXJJbnN0YW5jZUlkIjoiY2FyLTAwMDEiLCJtb2RlbElkIjoiaG9uZGEtY2l0eS1lLWFhIiwiYXNraW5nUHJpY2VZZW4iOjM1MDAwMCwicmVzb2x2ZXNPbkRheSI6NjV9XX19'

type CarPartsFixture = GameState['ownedCars'][number]['parts']
type CarPartStateFixture = CarPartsFixture[keyof CarPartsFixture]
type PartInstanceFixture = NonNullable<CarPartStateFixture['installed']>
type ConditionBandFixture = PartInstanceFixture['band']

/** One slot override, mirroring `packages/sim/tests/testFixtures.ts`'s own
 * `CarPartOverride` convenience: a bare band keeps the slot filled with a
 * mint-catalog-shaped stock instance at that band, a full `PartInstance`
 * installs it as-is, `null` leaves the slot genuinely empty. */
type CarPartOverrideFixture = ConditionBandFixture | PartInstanceFixture | null

const ALL_CAR_PART_IDS_FOR_TEST = [
  'block',
  'internals',
  'headValvetrain',
  'camsTiming',
  'intake',
  'exhaust',
  'fuelSystem',
  'ignitionEcu',
  'cooling',
  'forcedInduction',
  'gearbox',
  'clutch',
  'differential',
  'driveline',
  'chassis',
  'dampers',
  'springs',
  'antiRollBars',
  'steering',
  'brakePadsDiscs',
  'brakeCalipersLines',
  'rims',
  'tyres',
  'panels',
  'paint',
  'underbody',
  'aero',
  'seats',
  'dashGauges',
] as const

function stockPartFixture(carPartId: string, band: ConditionBandFixture): PartInstanceFixture {
  return {
    id: `fixture-stock-${carPartId}`,
    partId: `fixture-stock-part-${carPartId}`,
    band,
    genuinePeriod: false,
  }
}

/** A full 29-key mint `parts` map (Sprint 26; reshaped Sprint 32 for the
 * stock-baseline/missing-slot model - every slot defaults to a mint stock
 * `PartInstance`, matching real generation), for tests that need a
 * current-schema `CarInstance` without hand-writing every key. `overrides`
 * is keyed by `CarPartId`, one `CarPartOverrideFixture` per slot to change. */
function mintParts(
  overrides: Partial<Record<string, CarPartOverrideFixture>> = {},
): CarPartsFixture {
  const base = Object.fromEntries(
    ALL_CAR_PART_IDS_FOR_TEST.map((id) => [id, { installed: stockPartFixture(id, 'mint') }]),
  ) as CarPartsFixture
  for (const [id, override] of Object.entries(overrides)) {
    if (override === undefined) continue
    const state: CarPartStateFixture =
      override === null
        ? { installed: null }
        : typeof override === 'string'
          ? { installed: stockPartFixture(id, override) }
          : { installed: override }
    ;(base as Record<string, CarPartStateFixture>)[id] = state
  }
  return base
}

/** A fresh shop's tool tiers (Sprint 36) - what every pre-v23 save with no
 * owned equipment migrates to, and what a new game starts at. */
const FRESH_TOOL_TIERS = {
  engine: 1,
  drivetrain: 1,
  suspension: 1,
  wheels: 1,
  body: 1,
  interior: 1,
}

/** A fresh shop's specialty (Sprint 38) - what every pre-v24 save (which
 * never earned any) migrates to, and what a new game starts at. */
const FRESH_SPECIALTY = {
  engine: 0,
  drivetrain: 0,
  suspension: 0,
  wheels: 0,
  body: 0,
  interior: 0,
}

const fullState: GameState = GameStateSchema.parse({
  day: 42,
  seed: 7,
  cashYen: 1_234_567,
  reputationTier: 'known',
  ownedCars: [],
  partInventory: [],
  staff: [],
  jobs: [],
  marketHeat: { 'honda-city-e-aa': 108 },
  activeAuctionLots: [],
  toolTiers: FRESH_TOOL_TIERS,
})

describe('saveCodec', () => {
  it('round-trips a full state unchanged and re-validates', () => {
    const decoded = decodeSave(encodeSave(fullState))
    expect(decoded).toEqual(fullState)
    expect(() => GameStateSchema.parse(decoded)).not.toThrow()
  })

  it('decodes the pinned golden v1 save under the current version (Save law)', () => {
    const decoded = decodeSave(GOLDEN_V1_CODE)
    expect(decoded.day).toBe(5)
    expect(decoded.cashYen).toBe(900_000)
    expect(decoded.reputationTier).toBe('unknown')
    // Schema defaults fill the arrays a minimal v1 save omitted.
    expect(decoded.ownedCars).toEqual([])
    expect(decoded.carsForSale).toEqual([])
    expect(decoded.pendingOffers).toEqual([])
    // v1 -> v2 migration is pure default-fill: the Sprint-08 fields a v1 save
    // never had come back at their defaults, proving old saves still load.
    expect(decoded.reputationPoints).toBe(0)
    expect(decoded.serviceJobOffers).toEqual([])
    expect(decoded.activeServiceJobs).toEqual([])
    // v2 -> v3 migration is likewise pure default-fill: a v1 save never had
    // the Sprint-09 bay fields either, and comes back at a fresh game's
    // starting counts (matching facilities.json's startCounts).
    expect(decoded.serviceBayCount).toBe(1)
    expect(decoded.parkingBayCount).toBe(3)
    expect(decoded.serviceBayCarIds).toEqual([])
    // v3 -> v4 migration is pure default-fill too: a v1 save never had the
    // Sprint-11 daily labor counter either.
    expect(decoded.laborSlotsSpentToday).toBe(0)
    // v22 -> v23 (Sprint 36): a v1 save never owned any equipment, so every
    // tool line comes back at the tier-1 floor.
    expect(decoded.toolTiers).toEqual(FRESH_TOOL_TIERS)
    // v6 -> v7 migration is pure default-fill too: a v1 save never had the
    // Sprint-14 order/cart fields either.
    expect(decoded.pendingPartOrders).toEqual([])
    expect(decoded.cartPartIds).toEqual([])
  })

  it('decodes the pinned golden v2 save under the current version (Save law)', () => {
    const decoded = decodeSave(GOLDEN_V2_CODE)
    expect(decoded.day).toBe(12)
    expect(decoded.cashYen).toBe(1_100_000)
    expect(decoded.reputationTier).toBe('local')
    // v2 fields are preserved unchanged, not reset to their defaults.
    expect(decoded.reputationPoints).toBe(5)
    // v2 -> v3 migration is pure default-fill: the Sprint-09 bay fields a v2
    // save never had come back at a fresh game's starting counts.
    expect(decoded.serviceBayCount).toBe(1)
    expect(decoded.parkingBayCount).toBe(3)
    expect(decoded.serviceBayCarIds).toEqual([])
    // v3 -> v4 migration is pure default-fill: a v2 save never had the
    // Sprint-11 daily labor counter either.
    expect(decoded.laborSlotsSpentToday).toBe(0)
    // v22 -> v23 (Sprint 36): no equipment owned -> every line at tier 1.
    expect(decoded.toolTiers).toEqual(FRESH_TOOL_TIERS)
    // v6 -> v7 migration is pure default-fill: a v2 save never had the
    // Sprint-14 order/cart fields either.
    expect(decoded.pendingPartOrders).toEqual([])
    expect(decoded.cartPartIds).toEqual([])
  })

  it('decodes the pinned golden v3 save under the current version (Save law)', () => {
    const decoded = decodeSave(GOLDEN_V3_CODE)
    expect(decoded.day).toBe(20)
    expect(decoded.cashYen).toBe(2_000_000)
    expect(decoded.reputationTier).toBe('known')
    expect(decoded.reputationPoints).toBe(12)
    // v3 fields are preserved unchanged, not reset to their defaults.
    expect(decoded.serviceBayCount).toBe(2)
    expect(decoded.parkingBayCount).toBe(4)
    // v3 -> v4 migration is pure default-fill: a v3 save never had the
    // Sprint-11 daily labor counter.
    expect(decoded.laborSlotsSpentToday).toBe(0)
    // v22 -> v23 (Sprint 36): no equipment owned -> every line at tier 1.
    expect(decoded.toolTiers).toEqual(FRESH_TOOL_TIERS)
    // v6 -> v7 migration is pure default-fill: a v3 save never had the
    // Sprint-14 order/cart fields either.
    expect(decoded.pendingPartOrders).toEqual([])
    expect(decoded.cartPartIds).toEqual([])
  })

  it('decodes the pinned golden v5 save under the current version (Save law)', () => {
    const decoded = decodeSave(GOLDEN_V5_CODE)
    expect(decoded.day).toBe(33)
    expect(decoded.cashYen).toBe(3_000_000)
    expect(decoded.reputationTier).toBe('known')
    expect(decoded.reputationPoints).toBe(20)
    // v5 fields are preserved unchanged, not reset to their defaults.
    expect(decoded.serviceBayCount).toBe(2)
    expect(decoded.parkingBayCount).toBe(5)
    expect(decoded.laborSlotsSpentToday).toBe(3)
    // v5 -> v6 (Sprint 13) used to default-fill the equipment list a v5 save
    // never had; v22 -> v23 (Sprint 36) now lands that same "never owned
    // anything" state at the tool-tier floor instead.
    expect(decoded.toolTiers).toEqual(FRESH_TOOL_TIERS)
    // v6 -> v7 migration is pure default-fill: a v5 save never had the
    // Sprint-14 order/cart fields either.
    expect(decoded.pendingPartOrders).toEqual([])
    expect(decoded.cartPartIds).toEqual([])
  })

  it('decodes the pinned golden v6 save under the current version (Save law)', () => {
    const decoded = decodeSave(GOLDEN_V6_CODE)
    expect(decoded.day).toBe(50)
    expect(decoded.cashYen).toBe(4_500_000)
    expect(decoded.reputationTier).toBe('respected')
    expect(decoded.reputationPoints).toBe(30)
    // v6 fields are preserved unchanged, not reset to their defaults.
    expect(decoded.serviceBayCount).toBe(3)
    expect(decoded.parkingBayCount).toBe(6)
    expect(decoded.laborSlotsSpentToday).toBe(1)
    // v22 -> v23 (Sprint 36): the code's real owned machines (welder +
    // tire-machine) map through the frozen legacy table - body and wheels
    // land at tier 2, everything else at the tier-1 floor - rather than
    // silently resetting the player's spent money to all-1.
    expect(decoded.toolTiers).toEqual({ ...FRESH_TOOL_TIERS, body: 2, wheels: 2 })
    // v6 -> v7 migration (Sprint 14): a v6 save never had the order/cart
    // fields at all - correct, since neither concept existed yet, and this
    // is the normal additive case, unlike Sprint 12's deliberate nuke.
    expect(decoded.pendingPartOrders).toEqual([])
    expect(decoded.cartPartIds).toEqual([])
  })

  it('decodes the pinned golden v7 save under the current version (Save law)', () => {
    const decoded = decodeSave(GOLDEN_V7_CODE)
    expect(decoded.day).toBe(60)
    // Sprint 31: the pinned v7 code carries a real pending listing (350,000
    // asking price, see GOLDEN_V7_CODE's own doc comment) that
    // migrateV19ToV20 now resolves instantly at load, crediting the cash on
    // top of the code's own 5,000,000 - the "least player harm" rule, not a
    // dropped sale.
    expect(decoded.cashYen).toBe(5_000_000 + 350_000)
    expect(decoded.reputationTier).toBe('known')
    expect(decoded.reputationPoints).toBe(40)
    // v22 -> v23 (Sprint 36): the code's owned tire-machine maps to wheels
    // tier 2 via the frozen legacy table; every other line floors at 1.
    expect(decoded.toolTiers).toEqual({ ...FRESH_TOOL_TIERS, wheels: 2 })
    // v19 -> v20 migration (Sprint 31): the resolved listing leaves nothing
    // behind - no stray for-sale toggle or offer under a mechanic that
    // didn't exist when this code was produced.
    expect(decoded.carsForSale).toEqual([])
    expect(decoded.pendingOffers).toEqual([])
  })

  /**
   * v8 -> v9 (Sprint 17): a pre-v9 save's `serviceBayCarIds` is a compact
   * list of only-occupied ids (no `parkingCarIds` at all) - the exclusion-
   * based model every version before this used. `MIGRATIONS[8]` must
   * reconstruct both real, index-addressable arrays rather than default-
   * filling `parkingCarIds` to `[]`, which would silently strand every
   * already-parked car (still present in `ownedCars`/`activeServiceJobs`,
   * but invisible to the new parking view).
   */
  it('decodes a pre-v9 save, reconstructing indexed bay/parking arrays from the old exclusion model', () => {
    const carComponents = {
      engine: { condition: 80, installed: null },
      forcedInduction: { condition: 80, installed: null },
      drivetrain: { condition: 80, installed: null },
      suspension: { condition: 80, installed: null },
      brakes: { condition: 80, installed: null },
      wheels: { condition: 80, installed: null },
      body: { condition: 80, installed: null },
      interior: { condition: 80, installed: null },
    }
    const ownedCar = (id: string) => ({
      id,
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      color: 'White',
      provenanceNote: '',
      hiddenIssues: [],
      authenticityPercent: 90,
      components: carComponents,
    })
    const preV9 = {
      version: 8,
      gameState: {
        day: 70,
        seed: 5,
        cashYen: 2_000_000,
        reputationTier: 'known',
        reputationPoints: 25,
        // Only one of these two owned cars is in the old compact list - the
        // other was "parked" purely by exclusion under the pre-v9 model.
        ownedCars: [ownedCar('car-service-1'), ownedCar('car-parked-1')],
        activeServiceJobs: [
          {
            id: 'svc-1',
            typeId: 'repair-engine',
            customerName: 'Test Customer',
            description: 'test',
            work: { kind: 'repair', componentId: 'engine' },
            car: ownedCar('car-job-parked'), // also parked by exclusion
            payoutYen: 20_000,
            baseReputation: 1,
            expiresOnDay: 80,
            dueOnDay: 75,
          },
        ],
        serviceBayCount: 2,
        parkingBayCount: 3,
        serviceBayCarIds: ['car-service-1'], // compact: only the real occupant, despite count 2
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV9))
    const decoded = decodeSave(code)
    expect(decoded.serviceBayCarIds).toEqual(['car-service-1', null])
    // ownedCars-parked ids come before activeServiceJobs-parked ids (the
    // same order the old exclusion-based parkingView used to derive them
    // in), then padded with null up to parkingBayCount.
    expect(decoded.parkingCarIds).toEqual(['car-parked-1', 'car-job-parked', null])
  })

  it('decodes a pre-v10 save with nothing staged (Sprint 18: purely additive, back to the normal case)', () => {
    const preV10 = {
      version: 9,
      gameState: {
        day: 80,
        seed: 11,
        cashYen: 3_000_000,
        reputationTier: 'respected',
        reputationPoints: 130,
        serviceBayCount: 2,
        parkingBayCount: 3,
        serviceBayCarIds: [null, null],
        parkingCarIds: [null, null, null],
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV10))
    const decoded = decodeSave(code)
    expect(decoded.day).toBe(80)
    expect(decoded.reputationPoints).toBe(130)
    // v9 -> v10 migration is pure default-fill: a v9 save never had the
    // Sprint-18 staged-work field either.
    expect(decoded.stagedCarWork).toEqual({})
  })

  it('round-trips a v10 state with real staged work', () => {
    const withStagedWork: GameState = GameStateSchema.parse({
      ...fullState,
      stagedCarWork: {
        'car-0001': [
          { kind: 'repair', componentId: 'engine', targetBand: 'mint' },
          { kind: 'install', componentId: 'suspension', partInstanceId: 'pi-0001' },
        ],
      },
    })
    const decoded = decodeSave(encodeSave(withStagedWork))
    expect(decoded).toEqual(withStagedWork)
  })

  it('decodes a pre-v11 save with an active lot that never had a bid (Sprint 19: purely additive)', () => {
    const carComponents = {
      engine: { condition: 60, installed: null },
      forcedInduction: { condition: 100, installed: null },
      drivetrain: { condition: 60, installed: null },
      suspension: { condition: 60, installed: null },
      brakes: { condition: 100, installed: null },
      wheels: { condition: 100, installed: null },
      body: { condition: 60, installed: null },
      interior: { condition: 60, installed: null },
    }
    const preV11 = {
      version: 10,
      gameState: {
        day: 90,
        seed: 13,
        cashYen: 2_500_000,
        reputationTier: 'known',
        reputationPoints: 40,
        serviceBayCount: 2,
        parkingBayCount: 3,
        serviceBayCarIds: [null, null],
        parkingCarIds: [null, null, null],
        activeAuctionLots: [
          {
            id: 'lot-90-honda-city-e-aa',
            tier: 'local-yard',
            modelId: 'honda-city-e-aa',
            bookValueYen: 200_000,
            expiresOnDay: 93,
            car: {
              id: 'lot-car-1',
              modelId: 'honda-city-e-aa',
              year: 1984,
              mileageKm: 120_000,
              color: 'White',
              provenanceNote: '',
              hiddenIssues: [],
              authenticityPercent: 85,
              components: carComponents,
            },
          },
        ],
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV11))
    const decoded = decodeSave(code)
    expect(decoded.day).toBe(90)
    expect(decoded.activeAuctionLots).toHaveLength(1)
    // v10 -> v11 migration is pure default-fill: a v10 save's lots never had
    // a bid in progress (bidding always resolved the instant it was placed).
    // v11 -> v12 (Sprint 20) then converts that "no bid at all" state into
    // the new open-bidding shape: nobody has raised, so the lot hasn't even
    // opened yet.
    expect(decoded.activeAuctionLots[0]?.currentBidYen).toBe(0)
    expect(decoded.activeAuctionLots[0]?.leadingBidder).toBeNull()
    expect(decoded.activeAuctionLots[0]?.quietDays).toBe(0)
    expect(decoded.activeAuctionLots[0]?.playerHasBid).toBe(false)
  })

  /**
   * v11 -> v12 (Sprint 20, auction rework II): a real save with an in-flight
   * bid - the player leading over a rival's escalated position, and a
   * second lot where a rival leads instead - must migrate to the new open-
   * bidding shape without losing that live standing (see the SAVE_VERSION
   * doc comment: this is the one genuinely non-additive step in this
   * migration, same category as v9's bay/parking reconstruction).
   */
  it('decodes a pre-v12 save with in-flight bids, reconstructing open-bidding state (Sprint 20 migration)', () => {
    const carComponents = {
      engine: { condition: 60, installed: null },
      forcedInduction: { condition: 100, installed: null },
      drivetrain: { condition: 60, installed: null },
      suspension: { condition: 60, installed: null },
      brakes: { condition: 100, installed: null },
      wheels: { condition: 100, installed: null },
      body: { condition: 60, installed: null },
      interior: { condition: 60, installed: null },
    }
    const lotCar = (id: string) => ({
      id,
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 120_000,
      color: 'White',
      provenanceNote: '',
      hiddenIssues: [],
      authenticityPercent: 85,
      components: carComponents,
    })
    const preV12 = {
      version: 11,
      gameState: {
        day: 100,
        seed: 21,
        cashYen: 3_000_000,
        reputationTier: 'known',
        reputationPoints: 60,
        serviceBayCount: 2,
        parkingBayCount: 3,
        serviceBayCarIds: [null, null],
        parkingCarIds: [null, null, null],
        activeAuctionLots: [
          {
            // Player is leading over the highest rival escalation so far.
            id: 'lot-100-player-leads',
            tier: 'local-yard',
            modelId: 'honda-city-e-aa',
            bookValueYen: 200_000,
            expiresOnDay: 105,
            playerMaxBidYen: 220_000,
            rivalEscalatedBidsYen: [150_000, 90_000],
            car: lotCar('lot-car-a'),
          },
          {
            // A rival is leading - the player bid, but a rival went higher.
            id: 'lot-100-rival-leads',
            tier: 'local-yard',
            modelId: 'honda-city-e-aa',
            bookValueYen: 200_000,
            expiresOnDay: 105,
            playerMaxBidYen: 180_000,
            rivalEscalatedBidsYen: [210_000],
            car: lotCar('lot-car-b'),
          },
        ],
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV12))
    const decoded = decodeSave(code)
    expect(decoded.day).toBe(100)
    expect(decoded.activeAuctionLots).toHaveLength(2)

    const playerLeads = decoded.activeAuctionLots.find((l) => l.id === 'lot-100-player-leads')
    expect(playerLeads?.currentBidYen).toBe(220_000)
    expect(playerLeads?.leadingBidder).toBe('player')
    expect(playerLeads?.quietDays).toBe(0)
    expect(playerLeads?.playerHasBid).toBe(true)

    const rivalLeads = decoded.activeAuctionLots.find((l) => l.id === 'lot-100-rival-leads')
    expect(rivalLeads?.currentBidYen).toBe(210_000)
    expect(rivalLeads?.leadingBidder).toBe('rival')
    expect(rivalLeads?.quietDays).toBe(0)
    // playerHasBid stays true even though a rival currently leads - it never
    // resets once set (the "My Active Bids" panel deliberately keeps
    // showing a lot the player is currently losing).
    expect(rivalLeads?.playerHasBid).toBe(true)
  })

  it('round-trips a v12 state with real open-bidding state on a lot', () => {
    const withActiveBid: GameState = GameStateSchema.parse({
      ...fullState,
      activeAuctionLots: [
        {
          id: 'lot-42-honda-city-e-aa',
          tier: 'local-yard',
          modelId: 'honda-city-e-aa',
          bookValueYen: 200_000,
          expiresOnDay: 45,
          currentBidYen: 220_000,
          leadingBidder: 'player',
          quietDays: 1,
          playerHasBid: true,
          car: {
            id: 'lot-car-2',
            modelId: 'honda-city-e-aa',
            year: 1984,
            mileageKm: 120_000,
            color: 'White',
            provenanceNote: '',
            authenticityPercent: 85,
            parts: mintParts(),
          },
        },
      ],
    })
    const decoded = decodeSave(encodeSave(withActiveBid))
    expect(decoded).toEqual(withActiveBid)
  })

  it('round-trips a v9 state preserving real, index-addressable bay/parking slots (empty slots included)', () => {
    const withSlots: GameState = GameStateSchema.parse({
      ...fullState,
      serviceBayCount: 2,
      parkingBayCount: 3,
      serviceBayCarIds: ['car-0001', null],
      parkingCarIds: [null, 'car-0002', null],
    })
    const decoded = decodeSave(encodeSave(withSlots))
    expect(decoded).toEqual(withSlots)
  })

  /**
   * v12 -> v13 (Sprint 21, value model): a pre-v13 save never tracked the
   * supply/demand ledger - purely additive, so it decodes with both
   * counters empty rather than needing an explicit migration step.
   */
  it('decodes a pre-v13 save with no market ledger (Sprint 21: purely additive)', () => {
    const preV13 = {
      version: 12,
      gameState: {
        day: 105,
        seed: 3,
        cashYen: 1_800_000,
        reputationTier: 'known',
        reputationPoints: 45,
        serviceBayCount: 2,
        parkingBayCount: 3,
        serviceBayCarIds: [null, null],
        parkingCarIds: [null, null, null],
        marketHeat: { 'honda-city-e-aa': 112 },
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV13))
    const decoded = decodeSave(code)
    expect(decoded.day).toBe(105)
    expect(decoded.marketHeat).toEqual({ 'honda-city-e-aa': 112 })
    expect(decoded.marketLedger).toEqual({ lotSupply: {}, playerSales: {} })
  })

  it('round-trips a v13 state with real market-ledger counters', () => {
    const withLedger: GameState = GameStateSchema.parse({
      ...fullState,
      marketLedger: {
        lotSupply: { 'honda-city-e-aa': 2.5 },
        playerSales: { 'honda-city-e-aa': 1 },
      },
    })
    const decoded = decodeSave(encodeSave(withLedger))
    expect(decoded).toEqual(withLedger)
  })

  /**
   * v13 -> v14 (Sprint 22, hidden issues), now observed through the full
   * chain up to v16: `hiddenIssues` no longer exists as a concept at all
   * (Sprint 26 removes the paused inspection system entirely, not just the
   * severity/repaired backfill this step used to add) - so the only thing
   * left to verify here is that a real pre-v14 save carrying `hiddenIssues`
   * on all three `CarInstance` populations (owned, active-lot, active
   * service job) still decodes cleanly through the now-much-longer chain
   * rather than crashing, and that each car's `hiddenIssues` data is gone
   * (not merely defaulted) on the far side.
   */
  it('decodes a pre-v14 save carrying hiddenIssues on all three CarInstance populations, dropping them cleanly through the full chain to v16', () => {
    const carComponents = {
      engine: { condition: 60, installed: null },
      forcedInduction: { condition: 100, installed: null },
      drivetrain: { condition: 60, installed: null },
      suspension: { condition: 60, installed: null },
      brakes: { condition: 100, installed: null },
      wheels: { condition: 100, installed: null },
      body: { condition: 60, installed: null },
      interior: { condition: 60, installed: null },
    }
    const preV14 = {
      version: 13,
      gameState: {
        day: 50,
        seed: 9,
        cashYen: 1_000_000,
        reputationTier: 'unknown',
        reputationPoints: 0,
        ownedCars: [
          {
            id: 'owned-car',
            modelId: 'honda-city-e-aa',
            year: 1984,
            mileageKm: 120_000,
            color: 'White',
            provenanceNote: '',
            hiddenIssues: [{ issueId: 'rusted-rails', revealed: true }],
            authenticityPercent: 85,
            components: carComponents,
          },
        ],
        activeAuctionLots: [
          {
            id: 'lot-50-local-yard',
            tier: 'local-yard',
            modelId: 'honda-city-e-aa',
            bookValueYen: 200_000,
            expiresOnDay: 55,
            currentBidYen: 0,
            leadingBidder: null,
            quietDays: 0,
            playerHasBid: false,
            car: {
              id: 'lot-car',
              modelId: 'honda-city-e-aa',
              year: 1984,
              mileageKm: 120_000,
              color: 'White',
              provenanceNote: '',
              hiddenIssues: [{ issueId: 'rusted-rails', revealed: false }],
              authenticityPercent: 85,
              components: carComponents,
            },
          },
        ],
        activeServiceJobs: [
          {
            id: 'service-job-1',
            typeId: 'repair-engine',
            customerName: 'Tanaka-san',
            description: 'oil change',
            work: { kind: 'repair', componentId: 'engine' },
            payoutYen: 15_000,
            baseReputation: 1,
            expiresOnDay: 60,
            dueOnDay: 55,
            car: {
              id: 'service-car',
              modelId: 'honda-city-e-aa',
              year: 1984,
              mileageKm: 120_000,
              color: 'White',
              provenanceNote: '',
              hiddenIssues: [{ issueId: 'rusted-rails', revealed: false }],
              authenticityPercent: 85,
              components: carComponents,
            },
          },
        ],
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV14))
    const decoded = decodeSave(code)

    // hiddenIssues is gone, not defaulted - TypeScript already confirms the
    // decoded CarInstance type has no such property; check at runtime too so
    // a schema regression that let it leak back in would fail loudly.
    expect(decoded.ownedCars[0]).not.toHaveProperty('hiddenIssues')
    expect(decoded.activeAuctionLots[0]?.car).not.toHaveProperty('hiddenIssues')
    expect(decoded.activeServiceJobs[0]?.car).not.toHaveProperty('hiddenIssues')

    // Every car still comes out with a complete, valid 29-part band map -
    // the v15 -> v16 step ran too, not just v13 -> v14.
    expect(Object.keys(decoded.ownedCars[0]!.parts)).toHaveLength(29)
    expect(Object.keys(decoded.activeAuctionLots[0]!.car.parts)).toHaveLength(29)
    expect(Object.keys(decoded.activeServiceJobs[0]!.car.parts)).toHaveLength(29)
  })

  /**
   * v14 -> v15 (Sprint 25 task 2): a pre-v15 save's accepted service jobs
   * never had `arrivesOnDay` - it defaults to `null`, and null is exactly
   * right here: under the old instant-placement rule, every such car was
   * already fully in the shop, not still in transit.
   */
  it('decodes a pre-v15 save, treating every existing accepted service job as already arrived', () => {
    const carComponents = {
      engine: { condition: 60, installed: null },
      forcedInduction: { condition: 100, installed: null },
      drivetrain: { condition: 60, installed: null },
      suspension: { condition: 60, installed: null },
      brakes: { condition: 100, installed: null },
      wheels: { condition: 100, installed: null },
      body: { condition: 60, installed: null },
      interior: { condition: 60, installed: null },
    }
    const preV15 = {
      version: 14,
      gameState: {
        day: 50,
        seed: 9,
        cashYen: 1_000_000,
        reputationTier: 'unknown',
        reputationPoints: 0,
        activeServiceJobs: [
          {
            id: 'service-job-1',
            typeId: 'repair-engine',
            customerName: 'Tanaka-san',
            description: 'oil change',
            work: { kind: 'repair', componentId: 'engine' },
            payoutYen: 15_000,
            baseReputation: 1,
            expiresOnDay: 60,
            dueOnDay: 55,
            car: {
              id: 'service-car',
              modelId: 'honda-city-e-aa',
              year: 1984,
              mileageKm: 120_000,
              color: 'White',
              provenanceNote: '',
              hiddenIssues: [],
              authenticityPercent: 85,
              components: carComponents,
            },
          },
        ],
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV15))
    const decoded = decodeSave(code)
    expect(decoded.activeServiceJobs[0]?.arrivesOnDay).toBeNull()
  })

  it('round-trips a current-schema state with a real in-transit service job (Sprint 29: tasks, not work)', () => {
    const withInTransitJob: GameState = GameStateSchema.parse({
      ...fullState,
      activeServiceJobs: [
        {
          id: 'service-job-1',
          typeId: 'repair-engine',
          customerName: 'Tanaka-san',
          description: 'oil change',
          tasks: [{ action: 'repair', carPartId: 'block', targetBand: 'mint' }],
          payoutYen: 15_000,
          baseReputation: 1,
          deadlineDays: 7,
          expiresOnDay: 60,
          arrivesOnDay: 43,
          dueOnDay: 50,
          car: {
            id: 'service-car',
            modelId: 'honda-city-e-aa',
            year: 1984,
            mileageKm: 120_000,
            color: 'White',
            provenanceNote: '',
            authenticityPercent: 85,
            parts: mintParts(),
          },
        },
      ],
    })
    const decoded = decodeSave(encodeSave(withInTransitJob))
    expect(decoded).toEqual(withInTransitJob)
    expect(decoded.activeServiceJobs[0]?.arrivesOnDay).toBe(43)
  })

  it('rejects a non-save string', () => {
    expect(() => decodeSave('hello world')).toThrow(/not a Midnight Garage save code/i)
  })

  it('rejects a corrupted code', () => {
    expect(() => decodeSave('MGSAVE1.!!!not-base64!!!')).toThrow(/corrupted|could not be read/i)
  })

  it('refuses a save from a newer version', () => {
    const future = 'MGSAVE1.' + btoa(JSON.stringify({ version: SAVE_VERSION + 1, gameState: {} }))
    expect(() => decodeSave(future)).toThrow(/newer version/i)
  })

  /**
   * Sprint 12 decision 3 ("nuke"): the zones+slots -> components migration
   * deliberately has no `MIGRATIONS[4]` transform, since the maintainer
   * confirmed there are no existing saves worth preserving. A pre-v5 save
   * that actually contains a car (unlike GOLDEN_V1/V2/V3 above, which never
   * populate `ownedCars`) exercises the real break: its car's old
   * `condition`/`buildSheet` shape no longer matches `CarInstanceSchema`, so
   * decoding must fail cleanly rather than silently produce a corrupt state.
   */
  it('a pre-v5 save containing a car fails to decode (no migration, by design)', () => {
    const preV5WithCar = {
      version: 4,
      gameState: {
        day: 10,
        seed: 1,
        cashYen: 500_000,
        reputationTier: 'unknown',
        reputationPoints: 0,
        ownedCars: [
          {
            id: 'car-0001',
            modelId: 'honda-city-e-aa',
            year: 1984,
            mileageKm: 100_000,
            color: 'White',
            provenanceNote: '',
            condition: { engine: 50, drivetrain: 50, suspension: 50, body: 50, interior: 50 },
            hiddenIssues: [],
            authenticityPercent: 90,
            buildSheet: {
              engine: null,
              forcedInduction: null,
              drivetrain: null,
              suspension: null,
              brakes: null,
              bodyAero: null,
              wheelsInterior: null,
            },
          },
        ],
        partInventory: [],
        staff: [],
        jobs: [],
        marketHeat: {},
        activeAuctionLots: [],
        serviceJobOffers: [],
        activeServiceJobs: [],
        serviceBayCount: 1,
        parkingBayCount: 3,
        serviceBayCarIds: [],
        laborSlotsSpentToday: 0,
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV5WithCar))
    expect(() => decodeSave(code)).toThrow()
  })

  it('round-trips a current state with a real for-sale car and a live pending offer (Sprint 31)', () => {
    const withOffer: GameState = GameStateSchema.parse({
      ...fullState,
      carsForSale: [{ carInstanceId: 'car-0002', sinceDay: 40 }],
      pendingOffers: [{ carInstanceId: 'car-0002', buyerId: 'tuner', priceYen: 500_000 }],
    })
    const decoded = decodeSave(encodeSave(withOffer))
    expect(decoded).toEqual(withOffer)
  })

  it('round-trips a v7 state with real pending orders and cart contents', () => {
    const withOrdersAndCart: GameState = GameStateSchema.parse({
      ...fullState,
      pendingPartOrders: [
        {
          id: 'order-10-0',
          partId: 'khs-street-ecu',
          priceYen: 45_000,
          purchasedOnDay: 10,
          arrivesOnDay: 11,
        },
      ],
      cartPartIds: ['tanuki-street-coilovers', 'tanuki-street-coilovers'],
    })
    const decoded = decodeSave(encodeSave(withOrdersAndCart))
    expect(decoded).toEqual(withOrdersAndCart)
  })

  it('round-trips a v16 state with a real car through the parts/band shape', () => {
    const withCar: GameState = GameStateSchema.parse({
      ...fullState,
      ownedCars: [
        {
          id: 'car-0001',
          modelId: 'honda-city-e-aa',
          year: 1984,
          mileageKm: 100_000,
          color: 'White',
          provenanceNote: '',
          authenticityPercent: 90,
          parts: mintParts({ dampers: 'worn' }),
        },
      ],
    })
    const decoded = decodeSave(encodeSave(withCar))
    expect(decoded).toEqual(withCar)
  })

  /**
   * v16 -> v17 (Sprint 28, per-part addressing): `Job`/`StagedAction` each
   * gained an optional `carPartId` - the normal additive case (like v2-v8),
   * so it needs NO `MIGRATIONS[16]` entry, but it DOES bump `SAVE_VERSION`
   * (Save law / engineering law 4: every save-schema change bumps the
   * version, migration or not - the bump is the guard that makes an older
   * client reject a newer save rather than silently strip the field). See
   * the `SAVE_VERSION` doc comment for the full reasoning. These three tests
   * are its regression coverage: a real pre-v17 (v16 envelope) save with
   * only group-level jobs/staged work still decodes cleanly under v17
   * (additive backward-compat), a group-only v17 state round-trips unchanged,
   * and a per-part v17 state round-trips its `carPartId` exactly.
   */
  it('a real pre-v17 save (a v16 envelope with group-level jobs/stagedCarWork, no carPartId) decodes cleanly under v17', () => {
    const preV17 = {
      version: 16,
      gameState: {
        ...fullState,
        jobs: [
          {
            id: 'job-group-repair',
            carInstanceId: 'car-0001',
            kind: 'repair-zone',
            componentId: 'body',
            targetBand: 'mint',
            laborSlotsRequired: 2,
            laborSlotsSpent: 1,
          },
        ],
        stagedCarWork: {
          'car-0001': [{ kind: 'repair', componentId: 'engine', targetBand: 'fine' }],
        },
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV17))
    const decoded = decodeSave(code)
    // The additive case: a v16 group-level entry decodes unchanged under v17,
    // with `carPartId` simply absent (which IS a group-level address now).
    expect(decoded.jobs[0]?.componentId).toBe('body')
    expect(decoded.jobs[0]).not.toHaveProperty('carPartId')
    expect(decoded.stagedCarWork['car-0001']?.[0]).toEqual({
      kind: 'repair',
      componentId: 'engine',
      targetBand: 'fine',
    })
    expect(decoded.stagedCarWork['car-0001']?.[0]).not.toHaveProperty('carPartId')
  })

  it('a v17 state with only group-level staged work/jobs (no carPartId anywhere) round-trips exactly', () => {
    const groupOnly: GameState = GameStateSchema.parse({
      ...fullState,
      jobs: [
        {
          id: 'job-group-repair',
          carInstanceId: 'car-0001',
          kind: 'repair-zone',
          componentId: 'body',
          targetBand: 'mint',
          laborSlotsRequired: 2,
          laborSlotsSpent: 1,
        },
      ],
      stagedCarWork: {
        'car-0001': [{ kind: 'repair', componentId: 'engine', targetBand: 'fine' }],
      },
    })
    const decoded = decodeSave(encodeSave(groupOnly))
    expect(decoded).toEqual(groupOnly)
    expect(decoded.jobs[0]).not.toHaveProperty('carPartId')
    expect(decoded.stagedCarWork['car-0001']?.[0]).not.toHaveProperty('carPartId')
  })

  it('a per-part staged action and job (carPartId set) round-trip exactly under version 17', () => {
    expect(SAVE_VERSION).toBe(30)
    const perPart: GameState = GameStateSchema.parse({
      ...fullState,
      jobs: [
        {
          id: 'job-part-repair',
          carInstanceId: 'car-0001',
          kind: 'repair-zone',
          componentId: 'engine',
          carPartId: 'intake',
          targetBand: 'mint',
          laborSlotsRequired: 1,
          laborSlotsSpent: 0,
        },
      ],
      stagedCarWork: {
        'car-0001': [
          { kind: 'repair', componentId: 'engine', carPartId: 'exhaust', targetBand: 'mint' },
        ],
      },
    })
    const decoded = decodeSave(encodeSave(perPart))
    expect(decoded).toEqual(perPart)
    expect(decoded.jobs[0]?.carPartId).toBe('intake')
    expect(decoded.stagedCarWork['car-0001']?.[0]).toMatchObject({ carPartId: 'exhaust' })
  })

  /**
   * v21 -> v22 (Sprint 35, customer-owned parts): `PartInstance` gained an
   * optional `customerJobId` - the normal additive case (like v2-v8/v17), so
   * it needs NO `MIGRATIONS[21]` entry, but it DOES bump `SAVE_VERSION` (Save
   * law / engineering law 4). These two tests are its regression coverage: a
   * real pre-v22 (v21 envelope) save with an untagged inventory part still
   * decodes cleanly under v22 (the part reads player-owned, `customerJobId`
   * absent), and a v22 state carrying a `customerJobId`-tagged part round-trips
   * the tag exactly.
   */
  it('a real pre-v22 save (a v21 envelope with an untagged inventory part) decodes as player-owned under v22', () => {
    const preV22 = {
      version: 21,
      gameState: {
        ...fullState,
        partInventory: [{ id: 'pi-spare-1', partId: 'khs-street-ecu', band: 'worn' }],
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV22))
    const decoded = decodeSave(code)
    // The additive case: a v21 part decodes unchanged under v22, with
    // `customerJobId` simply absent (which IS "player-owned" now).
    expect(decoded.partInventory[0]?.band).toBe('worn')
    expect(decoded.partInventory[0]).not.toHaveProperty('customerJobId')
  })

  it('a v22 state with a customer-owned (tagged) inventory part round-trips the tag exactly', () => {
    expect(SAVE_VERSION).toBe(30)
    const withTaggedPart: GameState = GameStateSchema.parse({
      ...fullState,
      partInventory: [
        { id: 'pi-owned', partId: 'khs-street-ecu', band: 'mint' },
        { id: 'pi-customer', partId: 'khs-street-ecu', band: 'poor', customerJobId: 'svc-5-0' },
      ],
    })
    const decoded = decodeSave(encodeSave(withTaggedPart))
    expect(decoded).toEqual(withTaggedPart)
    expect(decoded.partInventory[0]).not.toHaveProperty('customerJobId')
    expect(decoded.partInventory[1]?.customerJobId).toBe('svc-5-0')
  })

  /**
   * v15 -> v16 (Sprint 26, the banded parts model) - the single biggest
   * structural migration this file carries (see the SAVE_VERSION doc
   * comment). Exercises the full mapping from sprint26.md decision 11 on one
   * real save: non-uniform group conditions bucket into distinct bands, an
   * installed part relocates to its correct specific slot by catalog
   * address, `aero` always comes back mint (no old-model counterpart),
   * `forcedInduction.fitted` follows the model's Turbo/Supercharged tag, a
   * retired `fix-issue` job/staged action is dropped outright, a surviving
   * `repair-zone`/`repair` entry backfills `targetBand: 'mint'`, an old
   * 8-way `componentId` remaps through the new 6-way group set, and
   * `partInventory`'s `conditionPercent` becomes `band`.
   */
  describe('v15 -> v16 migration (Sprint 26, banded parts model)', () => {
    // economy.json's bands.migrationThresholds: mint >= 90, fine >= 70,
    // worn >= 40, poor >= 15, else scrap.
    const turboCarComponents = {
      engine: {
        condition: 95,
        installed: { id: 'pi-ecu-1', partId: 'khs-street-ecu', conditionPercent: 72 },
      },
      forcedInduction: { condition: 55, installed: null },
      drivetrain: { condition: 40, installed: null },
      suspension: { condition: 25, installed: null },
      brakes: { condition: 95, installed: null },
      wheels: { condition: 95, installed: null },
      body: { condition: 95, installed: null },
      interior: { condition: 95, installed: null },
    }
    const naCarComponents = {
      engine: { condition: 95, installed: null },
      forcedInduction: { condition: 95, installed: null },
      drivetrain: { condition: 95, installed: null },
      suspension: { condition: 95, installed: null },
      brakes: { condition: 95, installed: null },
      wheels: { condition: 95, installed: null },
      body: { condition: 95, installed: null },
      interior: { condition: 95, installed: null },
    }
    const preV16 = {
      version: 15,
      gameState: {
        day: 120,
        seed: 17,
        cashYen: 4_000_000,
        reputationTier: 'known',
        reputationPoints: 70,
        ownedCars: [
          {
            id: 'turbo-car',
            modelId: 'nissan-180sx-rps13',
            year: 1994,
            mileageKm: 140_000,
            color: 'Black',
            provenanceNote: '',
            hiddenIssues: [
              { issueId: 'rusted-rails', revealed: true, severityPercent: 0, repaired: true },
            ],
            authenticityPercent: 80,
            components: turboCarComponents,
          },
          {
            id: 'na-car',
            modelId: 'honda-city-e-aa',
            year: 1984,
            mileageKm: 100_000,
            color: 'White',
            provenanceNote: '',
            hiddenIssues: [],
            authenticityPercent: 90,
            components: naCarComponents,
          },
        ],
        partInventory: [{ id: 'pi-spare-1', partId: 'khs-street-ecu', conditionPercent: 50 }],
        serviceJobOffers: [
          {
            id: 'offer-1',
            typeId: 'repair-brakes',
            customerName: 'Tanaka-san',
            description: 'squeaky brakes',
            work: { kind: 'repair', componentId: 'brakes' },
            car: {
              id: 'offer-car',
              modelId: 'honda-city-e-aa',
              year: 1984,
              mileageKm: 100_000,
              color: 'White',
              provenanceNote: '',
              hiddenIssues: [],
              authenticityPercent: 90,
              components: naCarComponents,
            },
            payoutYen: 12_000,
            baseReputation: 1,
            expiresOnDay: 130,
          },
        ],
        jobs: [
          {
            id: 'job-repair',
            carInstanceId: 'turbo-car',
            kind: 'repair-zone',
            componentId: 'brakes',
            laborSlotsRequired: 2,
            laborSlotsSpent: 0,
          },
          {
            id: 'job-fix-issue',
            carInstanceId: 'turbo-car',
            kind: 'fix-issue',
            componentId: 'body',
            issueId: 'rusted-rails',
            laborSlotsRequired: 1,
            laborSlotsSpent: 0,
          },
        ],
        stagedCarWork: {
          'turbo-car': [
            { kind: 'repair', componentId: 'forcedInduction' },
            { kind: 'fix-issue', componentId: 'body', issueId: 'rusted-rails' },
          ],
        },
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV16))
    const decoded = decodeSave(code)
    const turboCar = decoded.ownedCars.find((c) => c.id === 'turbo-car')!
    const naCar = decoded.ownedCars.find((c) => c.id === 'na-car')!

    // decodeSave runs the FULL migration chain, v15 all the way to the
    // current v21 - so every assertion below reads the final Sprint 32
    // `{ installed }` shape (`migrateV20ToV21`'s own synthesized-stock-part
    // mapping), not the intermediate v16 `{ band, installed, fitted }` one
    // this describe block's own migration (v15 -> v16) originally produced.
    it('buckets each old group condition through the same band thresholds auction generation uses, fanning out to every part in the group', () => {
      // engine: 95 -> mint, fanned out to all 9 non-FI engine parts - no
      // instance was ever explicitly installed on these slots, so v20 -> v21
      // synthesizes a fresh stock PartInstance at the bucketed band.
      expect(turboCar.parts.block.installed?.band).toBe('mint')
      expect(turboCar.parts.cooling.installed?.band).toBe('mint')
      // suspension: 25 -> poor, fanned out to the 4 non-brake parts.
      expect(turboCar.parts.dampers.installed?.band).toBe('poor')
      expect(turboCar.parts.steering.installed?.band).toBe('poor')
    })

    it('relocates an installed part to its correct specific slot by catalog carPartId', () => {
      // Sprint 53: decodeSave's full chain now also runs v27 -> v28, which
      // remaps every installed part to its own model's fitment class -
      // nissan-180sx-rps13 (turboCar) is 'uncommon' tier.
      expect(turboCar.parts.ignitionEcu.installed?.partId).toBe('uncommon-khs-street-ecu')
      expect(turboCar.parts.ignitionEcu.installed?.band).toBe('fine')
      // Every other engine part instead gets v20 -> v21's synthesized generic
      // stock part (it was never explicitly installed) - not left unoccupied
      // the way it was under the pre-Sprint-32 shape.
      expect(turboCar.parts.block.installed?.partId).toBe('uncommon-stock-block')
    })

    it('aero always migrates to mint - no old-model counterpart existed for it - and v20 -> v21 fills it with a mint stock part', () => {
      // Sprint 53: nissan-180sx-rps13 (turboCar) is 'uncommon' tier;
      // honda-city-e-aa (naCar) is 'shitbox' tier.
      expect(turboCar.parts.aero.installed?.partId).toBe('uncommon-stock-aero')
      expect(turboCar.parts.aero.installed?.band).toBe('mint')
      expect(naCar.parts.aero.installed?.partId).toBe('shitbox-stock-aero')
      expect(naCar.parts.aero.installed?.band).toBe('mint')
    })

    it('forced induction follows the Turbo/Supercharged tag: a factory turbo gets a synthesized stock turbo at its rolled band, an NA slot stays genuinely empty', () => {
      // Sprint 53: nissan-180sx-rps13 (turboCar) is 'uncommon' tier.
      expect(turboCar.parts.forcedInduction.installed?.partId).toBe(
        'uncommon-stock-forced-induction',
      )
      expect(turboCar.parts.forcedInduction.installed?.band).toBe('worn')
      expect(naCar.parts.forcedInduction.installed).toBeNull()
    })

    it('drops a retired fix-issue job outright and backfills targetBand on the surviving repair-zone job', () => {
      expect(decoded.jobs).toHaveLength(1)
      expect(decoded.jobs[0]?.kind).toBe('repair-zone')
      expect(decoded.jobs[0]?.targetBand).toBe('mint')
      // brakes folds into suspension under the new 6-way group set.
      expect(decoded.jobs[0]?.componentId).toBe('suspension')
    })

    it('drops a retired fix-issue staged action and backfills targetBand on the surviving repair stage, remapping its group', () => {
      const staged = decoded.stagedCarWork['turbo-car']
      expect(staged).toHaveLength(1)
      expect(staged?.[0]).toEqual({ kind: 'repair', componentId: 'engine', targetBand: 'mint' })
    })

    it('migrates partInventory conditionPercent to band', () => {
      expect(decoded.partInventory[0]?.band).toBe('worn')
      expect(decoded.partInventory[0]).not.toHaveProperty('conditionPercent')
    })

    // Sprint 29 (v17 -> v18): serviceJobOffers are dropped, not mapped, by
    // the later migration this same decodeSave call also runs (see that
    // version's SAVE_VERSION doc comment) - so a pre-v16 offer's `work`
    // (whatever the v15 -> v16 group remap left it as) is no longer
    // observable through the public decodeSave path by the time decoding
    // finishes. The v17 -> v18 describe block below covers the group remap's
    // real successor: an ACTIVE (already-accepted) job's `work` surviving as
    // a real, addressable `tasks` entry instead.
    it('drops the pre-v16 offer entirely (Sprint 29: offers are dropped, not mapped, by v17 -> v18)', () => {
      expect(decoded.serviceJobOffers).toEqual([])
    })
  })

  /**
   * v17 -> v18 (Sprint 29, service-jobs framework v2): `ServiceJob.work` is
   * replaced by `tasks`, and a new `deadlineDays` is required - see the
   * `SAVE_VERSION` doc comment for the full reasoning behind treating
   * `activeServiceJobs` (kept, migrated) and `serviceJobOffers` (dropped)
   * differently.
   */
  describe('v17 -> v18 migration (Sprint 29, service-jobs framework v2)', () => {
    it("maps an in-flight active job's old single work to a one-task list, preserving payoutYen and dueOnDay untouched", () => {
      const preV18 = {
        version: 17,
        gameState: {
          ...fullState,
          activeServiceJobs: [
            {
              id: 'service-job-1',
              typeId: 'repair-engine',
              customerName: 'Tanaka-san',
              description: 'oil change',
              work: { kind: 'repair', componentId: 'engine' },
              payoutYen: 15_000,
              baseReputation: 3,
              expiresOnDay: 60,
              arrivesOnDay: 40,
              dueOnDay: 50,
              car: {
                id: 'service-car',
                modelId: 'honda-city-e-aa',
                year: 1984,
                mileageKm: 120_000,
                color: 'White',
                provenanceNote: '',
                authenticityPercent: 85,
                parts: mintParts(),
              },
            },
          ],
        },
      }
      const code = 'MGSAVE1.' + btoa(JSON.stringify(preV18))
      const decoded = decodeSave(code)
      const job = decoded.activeServiceJobs[0]
      // `minToolTier: 1` is the Sprint 36 schema default - a legacy task
      // decodes at the no-ceiling floor.
      expect(job?.tasks).toEqual([
        { action: 'repair', carPartId: 'block', targetBand: 'mint', minToolTier: 1 },
      ])
      // Already-rolled economics untouched, per the sprint doc's own
      // instruction: never re-derive a live job's payout or deadline.
      expect(job?.payoutYen).toBe(15_000)
      expect(job?.dueOnDay).toBe(50)
      // Reconstructed from the real dueOnDay - arrivesOnDay gap (50 - 40),
      // not the historical fallback (both were present on this fixture).
      expect(job?.deadlineDays).toBe(10)
    })

    it('maps an in-flight install-kind active job to a one-task install with the permissive stock floor', () => {
      const preV18 = {
        version: 17,
        gameState: {
          ...fullState,
          activeServiceJobs: [
            {
              id: 'service-job-2',
              typeId: 'install-suspension',
              customerName: 'Tanaka-san',
              description: 'coilovers please',
              work: { kind: 'install', componentId: 'suspension' },
              payoutYen: 90_000,
              baseReputation: 8,
              expiresOnDay: 60,
              arrivesOnDay: null,
              dueOnDay: 55,
              car: {
                id: 'service-car-2',
                modelId: 'honda-city-e-aa',
                year: 1984,
                mileageKm: 120_000,
                color: 'White',
                provenanceNote: '',
                authenticityPercent: 85,
                parts: mintParts(),
              },
            },
          ],
        },
      }
      const code = 'MGSAVE1.' + btoa(JSON.stringify(preV18))
      const decoded = decodeSave(code)
      const job = decoded.activeServiceJobs[0]
      expect(job?.tasks).toEqual([
        { action: 'install', carPartId: 'dampers', minGrade: 'stock', minToolTier: 1 },
      ])
      // arrivesOnDay was null on the fixture (already arrived), so there's
      // no real gap to reconstruct - falls back to the historical constant.
      expect(job?.deadlineDays).toBe(7)
      expect(job?.payoutYen).toBe(90_000)
    })

    it('drops pre-v18 serviceJobOffers entirely rather than guessing a task list for them', () => {
      const preV18 = {
        version: 17,
        gameState: {
          ...fullState,
          serviceJobOffers: [
            {
              id: 'offer-1',
              typeId: 'repair-engine',
              customerName: 'Tanaka-san',
              description: 'oil change',
              work: { kind: 'repair', componentId: 'engine' },
              payoutYen: 15_000,
              baseReputation: 3,
              expiresOnDay: 60,
              arrivesOnDay: null,
              dueOnDay: null,
              car: {
                id: 'offer-car',
                modelId: 'honda-city-e-aa',
                year: 1984,
                mileageKm: 120_000,
                color: 'White',
                provenanceNote: '',
                authenticityPercent: 85,
                parts: mintParts(),
              },
            },
          ],
        },
      }
      const code = 'MGSAVE1.' + btoa(JSON.stringify(preV18))
      const decoded = decodeSave(code)
      expect(decoded.serviceJobOffers).toEqual([])
    })

    it('round-trips a current v18 state with a real multi-task service job', () => {
      const withTasks: GameState = GameStateSchema.parse({
        ...fullState,
        activeServiceJobs: [
          {
            id: 'service-job-1',
            typeId: 'suspension-refresh',
            customerName: 'Tanaka-san',
            description: 'wallowy ride',
            tasks: [
              { action: 'repair', carPartId: 'dampers', targetBand: 'mint' },
              { action: 'install', carPartId: 'tyres', minGrade: 'street' },
            ],
            payoutYen: 60_000,
            baseReputation: 12,
            deadlineDays: 6,
            expiresOnDay: 60,
            arrivesOnDay: null,
            dueOnDay: 50,
            car: {
              id: 'service-car',
              modelId: 'honda-city-e-aa',
              year: 1984,
              mileageKm: 120_000,
              color: 'White',
              provenanceNote: '',
              authenticityPercent: 85,
              parts: mintParts(),
            },
          },
        ],
      })
      const decoded = decodeSave(encodeSave(withTasks))
      expect(decoded).toEqual(withTasks)
    })
  })

  /**
   * v18 -> v19 (Sprint 30, living auctions): `AuctionLot` gained `turnout` -
   * see the `SAVE_VERSION` doc comment for why this is a plain default-fill
   * (no `MIGRATIONS[18]` entry) rather than a reconstruction.
   */
  describe('v18 -> v19 migration (Sprint 30, living auctions)', () => {
    it('a real pre-v19 save (a v18 envelope with a lot carrying no turnout) decodes cleanly, defaulting to steady', () => {
      const preV19 = {
        version: 18,
        gameState: {
          ...fullState,
          activeAuctionLots: [
            {
              id: 'lot-42-honda-city-e-aa',
              tier: 'local-yard',
              modelId: 'honda-city-e-aa',
              bookValueYen: 200_000,
              expiresOnDay: 46,
              currentBidYen: 0,
              leadingBidder: null,
              quietDays: 0,
              playerHasBid: false,
              car: {
                id: 'lot-car-1',
                modelId: 'honda-city-e-aa',
                year: 1984,
                mileageKm: 120_000,
                color: 'White',
                provenanceNote: '',
                authenticityPercent: 85,
                parts: mintParts(),
              },
            },
          ],
        },
      }
      const code = 'MGSAVE1.' + btoa(JSON.stringify(preV19))
      const decoded = decodeSave(code)
      expect(decoded.activeAuctionLots).toHaveLength(1)
      expect(decoded.activeAuctionLots[0]?.turnout).toBe('steady')
    })

    it('round-trips a current v19 state with a real (non-default) turnout band', () => {
      const withPackedLot: GameState = GameStateSchema.parse({
        ...fullState,
        activeAuctionLots: [
          {
            id: 'lot-42-honda-city-e-aa',
            tier: 'local-yard',
            modelId: 'honda-city-e-aa',
            bookValueYen: 200_000,
            expiresOnDay: 46,
            currentBidYen: 0,
            leadingBidder: null,
            quietDays: 0,
            playerHasBid: false,
            turnout: 'packed',
            car: {
              id: 'lot-car-1',
              modelId: 'honda-city-e-aa',
              year: 1984,
              mileageKm: 120_000,
              color: 'White',
              provenanceNote: '',
              authenticityPercent: 85,
              parts: mintParts(),
            },
          },
        ],
      })
      const decoded = decodeSave(encodeSave(withPackedLot))
      expect(decoded).toEqual(withPackedLot)
      expect(decoded.activeAuctionLots[0]?.turnout).toBe('packed')
    })
  })

  /**
   * v19 -> v20 (Sprint 31, listings removed): a genuinely pending pre-v20
   * listing represents real money the player was owed - `migrateV19ToV20`
   * must resolve it instantly at its locked asking price rather than
   * silently dropping it. See the SAVE_VERSION doc comment above.
   */
  describe('v19 -> v20 migration (Sprint 31, listings removed)', () => {
    it('a real pre-v20 save with a pending listing credits its locked asking price to cash and drops the listing', () => {
      const preV20 = {
        version: 19,
        gameState: {
          ...fullState,
          cashYen: 1_000_000,
          activeListings: [
            {
              id: 'listing-40-car-0002',
              carInstanceId: 'car-0002',
              modelId: 'honda-city-e-aa',
              askingPriceYen: 500_000,
              resolvesOnDay: 45,
              reputationDeltaOnSale: 0,
            },
          ],
        },
      }
      const code = 'MGSAVE1.' + btoa(JSON.stringify(preV20))
      const decoded = decodeSave(code)
      expect(decoded.cashYen).toBe(1_500_000)
      expect(decoded.carsForSale).toEqual([])
      expect(decoded.pendingOffers).toEqual([])
    })

    it('a pre-v20 save with no pending listings decodes cleanly with empty for-sale/offer state', () => {
      const preV20 = { version: 19, gameState: { ...fullState, activeListings: [] } }
      const code = 'MGSAVE1.' + btoa(JSON.stringify(preV20))
      const decoded = decodeSave(code)
      expect(decoded.cashYen).toBe(fullState.cashYen)
      expect(decoded.carsForSale).toEqual([])
      expect(decoded.pendingOffers).toEqual([])
    })

    it('resolves more than one pending listing, crediting each locked price', () => {
      const preV20 = {
        version: 19,
        gameState: {
          ...fullState,
          cashYen: 0,
          activeListings: [
            {
              id: 'l1',
              carInstanceId: 'car-a',
              modelId: 'honda-city-e-aa',
              askingPriceYen: 300_000,
              resolvesOnDay: 10,
              reputationDeltaOnSale: 0,
            },
            {
              id: 'l2',
              carInstanceId: 'car-b',
              modelId: 'honda-city-e-aa',
              askingPriceYen: 450_000,
              resolvesOnDay: 12,
              reputationDeltaOnSale: 2,
            },
          ],
        },
      }
      const code = 'MGSAVE1.' + btoa(JSON.stringify(preV20))
      const decoded = decodeSave(code)
      expect(decoded.cashYen).toBe(750_000)
    })
  })

  /**
   * v20 -> v21 (Sprint 32, stock-baseline/missing-slot model): the
   * `{ band, installed, fitted }` -> `{ installed }` reshape - see the
   * SAVE_VERSION doc comment above for the full mapping. Exercises every
   * branch on one real pre-v21 save: an already-aftermarket-installed slot
   * (kept as-is), an ordinary slot with nothing installed (synthesized to a
   * fresh stock part at its old band), a factory turbo (synthesized to a
   * fresh stock TURBO at its old band), and an NA car's unfitted forced
   * induction (migrates to a genuinely empty `null`, not a synthesized
   * part).
   */
  describe('v20 -> v21 migration (Sprint 32, stock-baseline/missing-slot model)', () => {
    /** A pre-v21 29-key `parts` map in the old `{ band, installed, fitted }`
     * shape, mint/unoccupied/fitted by default - the old-model counterpart
     * to this file's own current-shape `mintParts` above. */
    function oldShapeParts(
      overrides: Partial<
        Record<string, { band: string; installed: unknown; fitted: boolean }>
      > = {},
    ): Record<string, { band: string; installed: unknown; fitted: boolean }> {
      const base: Record<string, { band: string; installed: unknown; fitted: boolean }> =
        Object.fromEntries(
          ALL_CAR_PART_IDS_FOR_TEST.map((id) => [
            id,
            { band: 'mint', installed: null, fitted: true },
          ]),
        )
      for (const [id, override] of Object.entries(overrides)) {
        if (override !== undefined) base[id] = override
      }
      return base
    }

    const preV21 = {
      version: 20,
      gameState: {
        ...fullState,
        ownedCars: [
          {
            id: 'turbo-car',
            // nissan-180sx-rps13 is Turbo-tagged (used as the turbo fixture
            // model throughout this file's v15 -> v16 block above).
            modelId: 'nissan-180sx-rps13',
            year: 1994,
            mileageKm: 90_000,
            color: 'Black',
            provenanceNote: '',
            authenticityPercent: 80,
            parts: oldShapeParts({
              // Already aftermarket-installed - kept exactly as-is, it
              // already carries its own band.
              dampers: {
                band: 'mint',
                installed: {
                  id: 'pi-coilovers',
                  partId: 'tanuki-street-coilovers',
                  band: 'fine',
                  genuinePeriod: false,
                },
                fitted: true,
              },
              // Ordinary part, nothing explicitly installed - synthesizes a
              // fresh generic stock part at the old slot band.
              tyres: { band: 'worn', installed: null, fitted: true },
              // A factory turbo (fitted: true, nothing explicitly
              // installed) - synthesizes a fresh stock TURBO at the old band.
              forcedInduction: { band: 'worn', installed: null, fitted: true },
            }),
          },
          {
            id: 'na-car',
            // honda-city-e-aa is NA-tagged (used as the NA fixture model
            // throughout this file's v15 -> v16 block above).
            modelId: 'honda-city-e-aa',
            year: 1984,
            mileageKm: 100_000,
            color: 'White',
            provenanceNote: '',
            authenticityPercent: 90,
            parts: oldShapeParts({
              forcedInduction: { band: 'mint', installed: null, fitted: false },
            }),
          },
        ],
      },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV21))
    const decoded = decodeSave(code)
    const turboCar = decoded.ownedCars.find((c) => c.id === 'turbo-car')!
    const naCar = decoded.ownedCars.find((c) => c.id === 'na-car')!

    it('keeps an already-installed aftermarket part exactly as-is - it already carries its own band', () => {
      // Sprint 53: decodeSave's full chain now also runs v27 -> v28, which
      // remaps every installed part (stock or aftermarket) to its own
      // model's fitment class - nissan-180sx-rps13 (turboCar) is 'uncommon'
      // tier. Band/id/genuinePeriod are otherwise untouched - "as-is" still
      // holds for everything but the class-corrected catalog address.
      expect(turboCar.parts.dampers.installed).toEqual({
        id: 'pi-coilovers',
        partId: 'uncommon-tanuki-street-coilovers',
        band: 'fine',
        genuinePeriod: false,
      })
    })

    it('synthesizes a fresh generic stock part for an ordinary slot with nothing explicitly installed, at the old slot band', () => {
      expect(turboCar.parts.tyres.installed?.partId).toBe('uncommon-stock-tyres')
      expect(turboCar.parts.tyres.installed?.band).toBe('worn')
      expect(turboCar.parts.tyres.installed?.genuinePeriod).toBe(false)
    })

    it('synthesizes a fresh stock turbo for a factory-turbo car, at the old slot band', () => {
      expect(turboCar.parts.forcedInduction.installed?.partId).toBe(
        'uncommon-stock-forced-induction',
      )
      expect(turboCar.parts.forcedInduction.installed?.band).toBe('worn')
    })

    it('migrates an NA car’s unfitted forced induction to a genuinely empty slot, not a synthesized part', () => {
      expect(naCar.parts.forcedInduction.installed).toBeNull()
    })

    it('every ordinary mint/unoccupied slot synthesizes a mint generic stock part', () => {
      // honda-city-e-aa (naCar) is 'shitbox' tier - unaffected here since
      // this assertion targets turboCar ('uncommon').
      expect(turboCar.parts.block.installed?.partId).toBe('uncommon-stock-block')
      expect(turboCar.parts.block.installed?.band).toBe('mint')
    })

    it('round-trips a current v21 state with a real missing slot and a real aftermarket part', () => {
      const withGaps: GameState = GameStateSchema.parse({
        ...fullState,
        ownedCars: [
          {
            id: 'car-0001',
            modelId: 'honda-city-e-aa',
            year: 1984,
            mileageKm: 100_000,
            color: 'White',
            provenanceNote: '',
            authenticityPercent: 90,
            parts: mintParts({
              // A genuinely missing slot (Sprint 32 decision 3).
              rims: null,
              // A real aftermarket part, distinct from the mint-stock default.
              dampers: {
                id: 'pi-0001',
                partId: 'tanuki-street-coilovers',
                band: 'fine',
                genuinePeriod: false,
              },
            }),
          },
        ],
      })
      const roundTripped = decodeSave(encodeSave(withGaps))
      expect(roundTripped).toEqual(withGaps)
      expect(roundTripped.ownedCars[0]?.parts.rims.installed).toBeNull()
      expect(roundTripped.ownedCars[0]?.parts.dampers.installed?.partId).toBe(
        'tanuki-street-coilovers',
      )
    })
  })

  /**
   * v22 -> v23 (Sprint 36, tool lines): `ownedEquipmentIds` is replaced by
   * the six-line `toolTiers` map. NOT a plain default-fill: a legacy save's
   * owned machines are real repair capability (and real money spent), so
   * `migrateV22ToV23` maps them through its frozen inline legacy table
   * (per group, tier = max level among owned ids covering it, else 1;
   * unknown ids ignored), then deletes `ownedEquipmentIds`. See the
   * SAVE_VERSION doc comment above.
   */
  describe('v22 -> v23 migration (Sprint 36, tool lines)', () => {
    function v22SaveOwning(ownedEquipmentIds: string[]): string {
      // A genuine pre-v23 shape: the legacy list present, `toolTiers` absent.
      const stateWithoutToolTiers: Record<string, unknown> = { ...fullState, ownedEquipmentIds }
      delete stateWithoutToolTiers.toolTiers
      const preV23 = { version: 22, gameState: stateWithoutToolTiers }
      return 'MGSAVE1.' + btoa(JSON.stringify(preV23))
    }

    it('a v22 save owning engine-crane + tire-machine decodes to engine 3, wheels 2, rest 1', () => {
      const decoded = decodeSave(v22SaveOwning(['engine-crane', 'tire-machine']))
      expect(decoded.toolTiers).toEqual({ ...FRESH_TOOL_TIERS, engine: 3, wheels: 2 })
      // The legacy field is gone, not defaulted - the schema has no such key.
      expect(decoded).not.toHaveProperty('ownedEquipmentIds')
    })

    it('two machines covering the same group take the max level (brake-lathe 2 + suspension-press 3 -> suspension 3)', () => {
      const decoded = decodeSave(v22SaveOwning(['brake-lathe', 'suspension-press']))
      expect(decoded.toolTiers).toEqual({ ...FRESH_TOOL_TIERS, suspension: 3 })
    })

    it('an unknown legacy equipment id is ignored, not an error', () => {
      const decoded = decodeSave(v22SaveOwning(['some-modded-in-machine', 'welder']))
      expect(decoded.toolTiers).toEqual({ ...FRESH_TOOL_TIERS, body: 2 })
    })

    it('a v22 save owning nothing decodes to the all-tier-1 floor', () => {
      const decoded = decodeSave(v22SaveOwning([]))
      expect(decoded.toolTiers).toEqual(FRESH_TOOL_TIERS)
    })

    it('a fresh v23 state round-trips its toolTiers exactly (non-default tiers included)', () => {
      const withUpgrades: GameState = GameStateSchema.parse({
        ...fullState,
        toolTiers: { ...FRESH_TOOL_TIERS, engine: 2, interior: 3 },
      })
      const decoded = decodeSave(encodeSave(withUpgrades))
      expect(decoded).toEqual(withUpgrades)
      expect(decoded.toolTiers.engine).toBe(2)
      expect(decoded.toolTiers.interior).toBe(3)
    })
  })

  /**
   * v23 -> v24 (Sprint 38, specialty): `GameStateSchema` gained `specialty`,
   * the progression bible's horizontal axis - the normal additive case (like
   * v2/v22), so it needs NO `MIGRATIONS[23]` entry, but it DOES bump
   * `SAVE_VERSION` (Save law). These two tests are its regression coverage:
   * a real pre-v24 (v23 envelope) save with no `specialty` field at all
   * still decodes cleanly under v24 (all-zero, exactly what "never earned
   * any" means), and a v24 state carrying real specialty values round-trips
   * them exactly.
   */
  it('a real pre-v24 save (a v23 envelope with no specialty field) decodes all-zero under v24', () => {
    const stateWithoutSpecialty: Record<string, unknown> = { ...fullState }
    delete stateWithoutSpecialty.specialty
    const preV24 = { version: 23, gameState: stateWithoutSpecialty }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV24))
    const decoded = decodeSave(code)
    expect(decoded.specialty).toEqual(FRESH_SPECIALTY)
  })

  it('a v24 state with real specialty values round-trips them exactly', () => {
    const withSpecialty: GameState = GameStateSchema.parse({
      ...fullState,
      specialty: { ...FRESH_SPECIALTY, engine: 120, body: 40 },
    })
    const decoded = decodeSave(encodeSave(withSpecialty))
    expect(decoded).toEqual(withSpecialty)
    expect(decoded.specialty.engine).toBe(120)
    expect(decoded.specialty.body).toBe(40)
    expect(decoded.specialty.drivetrain).toBe(0)
  })

  /**
   * Sprint 39 (techniques + the derived shop title): NO save bump. Both are
   * pure functions of `state.specialty` (already persisted since v24) plus
   * the technique catalog (content, not save data) - nothing new is ever
   * stored, so a v24 save carrying high specialty decodes identically
   * whether or not a technique/title derives from it. (Sprint 42 DID bump
   * the version again, for an unrelated reason - `carLedgers` - so this
   * canary now reads 25, not 24; the Sprint 39 fact itself, that Sprint 39
   * on its own added nothing, remains true.)
   */
  it('Sprint 39 (techniques + shop title) needed no save bump on its own; SAVE_VERSION has since moved to 30 (Sprint 61)', () => {
    expect(SAVE_VERSION).toBe(30)
  })

  it('a v24 save with specialty high enough to unlock a technique/title decodes identically either way - nothing new is stored', () => {
    const withHighSpecialty: GameState = GameStateSchema.parse({
      ...fullState,
      specialty: { ...FRESH_SPECIALTY, engine: 150 },
    })
    const decoded = decodeSave(encodeSave(withHighSpecialty))
    expect(decoded).toEqual(withHighSpecialty)
  })

  /**
   * v24 -> v25 (Sprint 42, the flip ledger): `GameStateSchema` gained
   * `carLedgers` (default `{}`) and `PartInstanceSchema` gained an optional
   * `pricePaidYen` - the normal additive case (like v2/v22/v24), so it needs
   * NO `MIGRATIONS[24]` entry, but it DOES bump `SAVE_VERSION` (Save law).
   * These two tests are its regression coverage: a real pre-v25 (v24
   * envelope) save with no `carLedgers` field at all still decodes cleanly
   * under v25 (empty ledgers - every already-owned car reads unknown-
   * purchase, exactly right since the concept did not exist yet), and a v25
   * state carrying real ledger/pricePaidYen values round-trips them exactly.
   */
  it('a real pre-v25 save (a v24 envelope with no carLedgers field) decodes with empty ledgers under v25', () => {
    const stateWithoutCarLedgers: Record<string, unknown> = { ...fullState }
    delete stateWithoutCarLedgers.carLedgers
    const preV25 = { version: 24, gameState: stateWithoutCarLedgers }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV25))
    const decoded = decodeSave(code)
    expect(decoded.carLedgers).toEqual({})
  })

  it('a v25 state with real carLedgers and a priced PartInstance round-trips them exactly', () => {
    const withLedger: GameState = GameStateSchema.parse({
      ...fullState,
      ownedCars: [
        {
          id: 'car-ledger-01',
          modelId: 'honda-city-e-aa',
          year: 1984,
          mileageKm: 100_000,
          color: 'White',
          authenticityPercent: 80,
          parts: mintParts(),
        },
      ],
      partInventory: [
        {
          id: 'pi-priced',
          partId: 'khs-street-ecu',
          band: 'mint',
          genuinePeriod: false,
          pricePaidYen: 60_000,
        },
      ],
      carLedgers: {
        'car-ledger-01': { purchaseYen: 500_000, repairYen: 20_000, partsYen: 60_000 },
      },
    })
    const decoded = decodeSave(encodeSave(withLedger))
    expect(decoded).toEqual(withLedger)
    expect(decoded.carLedgers['car-ledger-01']).toEqual({
      purchaseYen: 500_000,
      repairYen: 20_000,
      partsYen: 60_000,
    })
    expect(decoded.partInventory[0]?.pricePaidYen).toBe(60_000)
  })

  it('a car ledger with purchaseYen: null (unknown purchase) round-trips as null, not 0', () => {
    const withUnknownPurchase: GameState = GameStateSchema.parse({
      ...fullState,
      ownedCars: [
        {
          id: 'car-ledger-02',
          modelId: 'honda-city-e-aa',
          year: 1984,
          mileageKm: 100_000,
          color: 'White',
          authenticityPercent: 80,
          parts: mintParts(),
        },
      ],
      carLedgers: {
        'car-ledger-02': { purchaseYen: null, repairYen: 0, partsYen: 0 },
      },
    })
    const decoded = decodeSave(encodeSave(withUnknownPurchase))
    expect(decoded.carLedgers['car-ledger-02']?.purchaseYen).toBeNull()
  })

  /**
   * v25 -> v26 (Sprint 45, the double-parking grace slot): `GameStateSchema`
   * gained `graceParkingCarId` (default `null`) - the normal additive case
   * (like v2/v22/v24/v25), so it needs NO `MIGRATIONS[25]` entry, but it DOES
   * bump `SAVE_VERSION` (Save law). These two tests are its regression
   * coverage: a real pre-v26 (v25 envelope) save with no `graceParkingCarId`
   * field at all still decodes cleanly under v26 (nothing double-parked,
   * exactly right since the concept did not exist yet), and a v26 state with
   * a real double-parked car round-trips it exactly.
   */
  it('SAVE_VERSION has since moved to 30 (Sprint 61)', () => {
    expect(SAVE_VERSION).toBe(30)
  })

  it('a real pre-v26 save (a v25 envelope with no graceParkingCarId field) decodes with nothing double-parked under v26', () => {
    const stateWithoutGraceParking: Record<string, unknown> = { ...fullState }
    delete stateWithoutGraceParking.graceParkingCarId
    const preV26 = { version: 25, gameState: stateWithoutGraceParking }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV26))
    const decoded = decodeSave(code)
    expect(decoded.graceParkingCarId).toBeNull()
  })

  it('a v26 state with a real double-parked car round-trips graceParkingCarId exactly', () => {
    const withGraceParking: GameState = GameStateSchema.parse({
      ...fullState,
      graceParkingCarId: 'car-double-parked-01',
    })
    const decoded = decodeSave(encodeSave(withGraceParking))
    expect(decoded.graceParkingCarId).toBe('car-double-parked-01')
  })

  /**
   * v26 -> v27 (Sprint 52, the used-machinery classifieds): `GameStateSchema`
   * gained `machineListing` and `nextMachineListingDay` (both default `null`)
   * - the normal additive case (like v2/v22/v24/v25/v26), so it needs NO
   * `MIGRATIONS[26]` entry, but it DOES bump `SAVE_VERSION` (Save law). These
   * three tests are its regression coverage: a real pre-v27 (v26 envelope)
   * save with neither field at all still decodes cleanly under v27 (nothing
   * listed, nothing scheduled - exactly right since the concept did not
   * exist yet), and a v27 state with a real live listing round-trips it
   * exactly.
   */
  it('SAVE_VERSION is 30 (Sprint 61)', () => {
    expect(SAVE_VERSION).toBe(30)
  })

  it('a real pre-v27 save (a v26 envelope with neither field) decodes with nothing listed or scheduled under v27', () => {
    const stateWithoutListing: Record<string, unknown> = { ...fullState }
    delete stateWithoutListing.machineListing
    delete stateWithoutListing.nextMachineListingDay
    const preV27 = { version: 26, gameState: stateWithoutListing }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV27))
    const decoded = decodeSave(code)
    expect(decoded.machineListing).toBeNull()
    expect(decoded.nextMachineListingDay).toBeNull()
  })

  it('a v27 state with a real live listing round-trips machineListing exactly', () => {
    const withListing: GameState = GameStateSchema.parse({
      ...fullState,
      machineListing: {
        componentId: 'wheels',
        tier: 2,
        priceYen: 250_000,
        postedOnDay: 10,
        expiresOnDay: 13,
      },
      nextMachineListingDay: null,
    })
    const decoded = decodeSave(encodeSave(withListing))
    expect(decoded.machineListing).toEqual({
      componentId: 'wheels',
      tier: 2,
      priceYen: 250_000,
      postedOnDay: 10,
      expiresOnDay: 13,
    })
  })

  /**
   * v27 -> v28 (Sprint 53, fitment-class parts): NOT the pure-additive case
   * (`GameStateSchema` gained no new field) - a pre-v28 save's installed
   * parts are all implicitly `common`-class regardless of their host car's
   * real tier, so `migrateV27ToV28` remaps every real `CarInstance`
   * population's installed parts to their own model's fitment class. A real
   * pre-v28 (v27 envelope) shitbox car with the pre-Sprint-53 `stock-block`
   * id installed must come out re-addressed to the shitbox-class sibling SKU,
   * same slot, same band, same everything else.
   */
  it('SAVE_VERSION is 30 (Sprint 61)', () => {
    expect(SAVE_VERSION).toBe(30)
  })

  it("a real pre-v28 save remaps a shitbox car's common-class stock part to the shitbox-class sibling SKU", () => {
    const preV28State = {
      ...fullState,
      ownedCars: [
        {
          id: 'car-0001',
          modelId: 'honda-city-e-aa',
          year: 1990,
          mileageKm: 80_000,
          color: 'Red',
          provenanceNote: '',
          authenticityPercent: 80,
          parts: mintParts({
            block: { id: 'pi-block-01', partId: 'stock-block', band: 'worn', genuinePeriod: false },
          }),
        },
      ],
    }
    const preV28 = { version: 27, gameState: preV28State }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV28))
    const decoded = decodeSave(code)
    const block = decoded.ownedCars[0]!.parts.block.installed
    expect(block?.partId).toBe('shitbox-stock-block')
    // Everything else about the instance survives untouched.
    expect(block?.id).toBe('pi-block-01')
    expect(block?.band).toBe('worn')
  })

  it("a customer-owned loose part tagged to a still-open service job remaps to that job car's class", () => {
    const preV28State = {
      ...fullState,
      partInventory: [
        {
          id: 'pi-loose-01',
          partId: 'stock-block',
          band: 'mint',
          genuinePeriod: false,
          customerJobId: 'job-01',
        },
      ],
      activeServiceJobs: [
        {
          id: 'job-01',
          typeId: 'test-job',
          customerName: 'Test Customer',
          description: 'test',
          tasks: [{ action: 'repair', carPartId: 'block', targetBand: 'mint', minToolTier: 1 }],
          car: {
            id: 'car-customer-01',
            modelId: 'toyota-supra-rz-jza80',
            year: 1994,
            mileageKm: 60_000,
            color: 'White',
            provenanceNote: '',
            authenticityPercent: 85,
            parts: mintParts(),
          },
          payoutYen: 50_000,
          baseReputation: 1,
          deadlineDays: 5,
          expiresOnDay: 10,
          arrivesOnDay: 2,
          dueOnDay: 7,
        },
      ],
    }
    const preV28 = { version: 27, gameState: preV28State }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV28))
    const decoded = decodeSave(code)
    const loosePart = decoded.partInventory.find((p) => p.id === 'pi-loose-01')
    // toyota-supra-rz-jza80 is a 'rare' tier model.
    expect(loosePart?.partId).toBe('rare-stock-block')
  })

  it('an untagged loose part (no recoverable host car) is left at its pre-v28 (common-class) id', () => {
    const preV28State = {
      ...fullState,
      partInventory: [
        { id: 'pi-loose-02', partId: 'stock-block', band: 'mint', genuinePeriod: false },
      ],
    }
    const preV28 = { version: 27, gameState: preV28State }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV28))
    const decoded = decodeSave(code)
    const loosePart = decoded.partInventory.find((p) => p.id === 'pi-loose-02')
    expect(loosePart?.partId).toBe('stock-block')
  })

  /**
   * v28 -> v29 (Sprint 57, the service-job ledger): `GameStateSchema` gained
   * `serviceJobLedgers` (default `{}`) - the normal additive case, so it
   * needs NO `MIGRATIONS[28]` entry, but it DOES bump `SAVE_VERSION` (Save
   * law). These two tests are its regression coverage: a real pre-v29 (v28
   * envelope) save with no `serviceJobLedgers` field at all still decodes
   * cleanly under v29 (no job has spent anything, exactly right since the
   * concept did not exist yet), and a v29 state with a real per-job ledger
   * round-trips it exactly.
   */
  it('a real pre-v29 save (a v28 envelope with no serviceJobLedgers field) decodes with every job ledger empty under v29', () => {
    const stateWithoutServiceJobLedgers: Record<string, unknown> = { ...fullState }
    delete stateWithoutServiceJobLedgers.serviceJobLedgers
    const preV29 = { version: 28, gameState: stateWithoutServiceJobLedgers }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV29))
    const decoded = decodeSave(code)
    expect(decoded.serviceJobLedgers).toEqual({})
  })

  it('a v29 state with a real per-job ledger round-trips it exactly', () => {
    const withLedger: GameState = GameStateSchema.parse({
      ...fullState,
      serviceJobLedgers: { 'svc-real-job': { repairYen: 8_000, partsYen: 15_000 } },
    })
    const decoded = decodeSave(encodeSave(withLedger))
    expect(decoded.serviceJobLedgers).toEqual({
      'svc-real-job': { repairYen: 8_000, partsYen: 15_000 },
    })
  })

  /**
   * v29 -> v30 (Sprint 61, baseline-tracked installs): `ServiceJobSchema`
   * gained `baselineInstalledPartIds` (default `{}`) - the normal additive
   * case, so it needs NO `MIGRATIONS[29]` entry, but it DOES bump
   * `SAVE_VERSION` (Save law). These two tests are its regression coverage: an
   * in-flight pre-v30 (v29 envelope) service job with no `baselineInstalledPartIds`
   * field still decodes cleanly under v30 (empty baseline = the legacy "any
   * qualifying part present is done" semantics for that job, so a save mid-job
   * never breaks), and a v30 job with a real captured baseline round-trips it
   * exactly.
   */
  it('a real pre-v30 save (a v29 envelope whose service job has no baselineInstalledPartIds) decodes with an empty baseline under v30', () => {
    const jobWithoutBaseline = {
      id: 'service-job-legacy',
      typeId: 'suspension-refresh',
      customerName: 'Tanaka-san',
      description: 'wallowy ride',
      tasks: [{ action: 'install', carPartId: 'tyres', minGrade: 'street' }],
      payoutYen: 60_000,
      baseReputation: 12,
      deadlineDays: 6,
      expiresOnDay: 60,
      arrivesOnDay: null,
      dueOnDay: 50,
      car: {
        id: 'service-car',
        modelId: 'honda-city-e-aa',
        year: 1984,
        mileageKm: 120_000,
        color: 'White',
        provenanceNote: '',
        authenticityPercent: 85,
        parts: mintParts(),
      },
    }
    const preV30 = {
      version: 29,
      gameState: { ...fullState, activeServiceJobs: [jobWithoutBaseline] },
    }
    const code = 'MGSAVE1.' + btoa(JSON.stringify(preV30))
    const decoded = decodeSave(code)
    expect(decoded.activeServiceJobs[0]?.baselineInstalledPartIds).toEqual({})
  })

  it('a v30 job with a real captured baseline round-trips it exactly', () => {
    const withBaseline: GameState = GameStateSchema.parse({
      ...fullState,
      activeServiceJobs: [
        {
          id: 'service-job-1',
          typeId: 'suspension-refresh',
          customerName: 'Tanaka-san',
          description: 'wallowy ride',
          tasks: [{ action: 'install', carPartId: 'tyres', minGrade: 'street' }],
          payoutYen: 60_000,
          baseReputation: 12,
          deadlineDays: 6,
          expiresOnDay: 60,
          arrivesOnDay: null,
          dueOnDay: 50,
          baselineInstalledPartIds: { tyres: 'pi-original-tyre' },
          car: {
            id: 'service-car',
            modelId: 'honda-city-e-aa',
            year: 1984,
            mileageKm: 120_000,
            color: 'White',
            provenanceNote: '',
            authenticityPercent: 85,
            parts: mintParts(),
          },
        },
      ],
    })
    const decoded = decodeSave(encodeSave(withBaseline))
    expect(decoded.activeServiceJobs[0]?.baselineInstalledPartIds).toEqual({
      tyres: 'pi-original-tyre',
    })
  })
})
