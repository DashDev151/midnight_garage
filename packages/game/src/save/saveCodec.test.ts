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
 * A save code produced by version 2 (Sprint 08), pinned as a literal — same
 * Save law as the v1 code above. Carries non-default `reputationPoints` so
 * the test can distinguish "preserved" from "defaulted."
 */
const GOLDEN_V2_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjoyLCJnYW1lU3RhdGUiOnsiZGF5IjoxMiwic2VlZCI6OTksImNhc2hZZW4iOjExMDAwMDAsInJlcHV0YXRpb25UaWVyIjoibG9jYWwiLCJyZXB1dGF0aW9uUG9pbnRzIjo1LCJzZXJ2aWNlSm9iT2ZmZXJzIjpbXSwiYWN0aXZlU2VydmljZUpvYnMiOltdfX0='

/**
 * A save code produced by version 3 (Sprint 09), pinned as a literal — same
 * Save law again. Carries non-default `serviceBayCount`/`parkingBayCount` so
 * the test can distinguish "preserved" from "defaulted" for those, while
 * `laborSlotsSpentToday` (added in v4) is necessarily absent, proving the
 * v3 -> v4 migration default-fills it correctly.
 */
const GOLDEN_V3_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjozLCJnYW1lU3RhdGUiOnsiZGF5IjoyMCwic2VlZCI6NTUsImNhc2hZZW4iOjIwMDAwMDAsInJlcHV0YXRpb25UaWVyIjoia25vd24iLCJyZXB1dGF0aW9uUG9pbnRzIjoxMiwic2VydmljZUpvYk9mZmVycyI6W10sImFjdGl2ZVNlcnZpY2VKb2JzIjpbXSwic2VydmljZUJheUNvdW50IjoyLCJwYXJraW5nQmF5Q291bnQiOjQsInNlcnZpY2VCYXlDYXJJZHMiOltdfX0='

/**
 * A save code produced by version 5 (Sprint 12, post components-refactor),
 * pinned as a literal — same Save law again. Carries non-default
 * `laborSlotsSpentToday` so the test can distinguish "preserved" from
 * "defaulted", while `ownedEquipmentIds` (added in v6) is necessarily
 * absent, proving the v5 -> v6 migration default-fills it correctly.
 */
const GOLDEN_V5_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjo1LCJnYW1lU3RhdGUiOnsiZGF5IjozMywic2VlZCI6NywiY2FzaFllbiI6MzAwMDAwMCwicmVwdXRhdGlvblRpZXIiOiJrbm93biIsInJlcHV0YXRpb25Qb2ludHMiOjIwLCJzZXJ2aWNlSm9iT2ZmZXJzIjpbXSwiYWN0aXZlU2VydmljZUpvYnMiOltdLCJzZXJ2aWNlQmF5Q291bnQiOjIsInBhcmtpbmdCYXlDb3VudCI6NSwic2VydmljZUJheUNhcklkcyI6W10sImxhYm9yU2xvdHNTcGVudFRvZGF5IjozfX0='

/**
 * A save code produced by version 6 (Sprint 13, post equipment economy),
 * pinned as a literal — same Save law again. Carries non-default
 * `ownedEquipmentIds` so the test can distinguish "preserved" from
 * "defaulted", while `pendingPartOrders`/`cartPartIds` (added in v7) are
 * necessarily absent, proving the v6 -> v7 migration default-fills them
 * correctly.
 */
const GOLDEN_V6_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjo2LCJnYW1lU3RhdGUiOnsiZGF5Ijo1MCwic2VlZCI6MywiY2FzaFllbiI6NDUwMDAwMCwicmVwdXRhdGlvblRpZXIiOiJyZXNwZWN0ZWQiLCJyZXB1dGF0aW9uUG9pbnRzIjozMCwic2VydmljZUpvYk9mZmVycyI6W10sImFjdGl2ZVNlcnZpY2VKb2JzIjpbXSwic2VydmljZUJheUNvdW50IjozLCJwYXJraW5nQmF5Q291bnQiOjYsInNlcnZpY2VCYXlDYXJJZHMiOltdLCJsYWJvclNsb3RzU3BlbnRUb2RheSI6MSwib3duZWRFcXVpcG1lbnRJZHMiOlsid2VsZGVyIiwidGlyZS1tYWNoaW5lIl19fQ=='

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
  activeListings: [],
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
    expect(decoded.activeListings).toEqual([])
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
    // v5 -> v6 migration is pure default-fill too: a v1 save never had the
    // Sprint-13 equipment list either.
    expect(decoded.ownedEquipmentIds).toEqual([])
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
    // v5 -> v6 migration is pure default-fill: a v2 save never had the
    // Sprint-13 equipment list either.
    expect(decoded.ownedEquipmentIds).toEqual([])
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
    // v5 -> v6 migration is pure default-fill: a v3 save never had the
    // Sprint-13 equipment list either.
    expect(decoded.ownedEquipmentIds).toEqual([])
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
    // v5 -> v6 migration (Sprint 13): a v5 save never had the equipment list
    // at all — correct, since equipment didn't exist as a concept yet, and
    // this is the normal additive case, unlike Sprint 12's deliberate nuke.
    expect(decoded.ownedEquipmentIds).toEqual([])
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
    expect(decoded.ownedEquipmentIds).toEqual(['welder', 'tire-machine'])
    // v6 -> v7 migration (Sprint 14): a v6 save never had the order/cart
    // fields at all — correct, since neither concept existed yet, and this
    // is the normal additive case, unlike Sprint 12's deliberate nuke.
    expect(decoded.pendingPartOrders).toEqual([])
    expect(decoded.cartPartIds).toEqual([])
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
        activeListings: [],
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

  it('round-trips a v5 state with a real car through the new components shape', () => {
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
          hiddenIssues: [],
          authenticityPercent: 90,
          components: {
            engine: { condition: 50, installed: null },
            forcedInduction: { condition: 100, installed: null },
            drivetrain: { condition: 50, installed: null },
            suspension: { condition: 50, installed: null },
            brakes: { condition: 100, installed: null },
            wheels: { condition: 100, installed: null },
            body: { condition: 50, installed: null },
            interior: { condition: 50, installed: null },
          },
        },
      ],
    })
    const decoded = decodeSave(encodeSave(withCar))
    expect(decoded).toEqual(withCar)
  })
})
