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

/**
 * A save code produced by version 7 (Sprint 14, post cart/checkout rework),
 * pinned as a literal — same Save law again. Carries a real pending
 * `activeListings` entry in the pre-v8 shape (no `reputationDeltaOnSale`),
 * so the test can confirm the v7 -> v8 migration default-fills that field to
 * 0 rather than throwing — a pre-existing pending sale created before the
 * quality/lemon rule existed resolves reputation-neutral.
 */
const GOLDEN_V7_CODE =
  'MGSAVE1.eyJ2ZXJzaW9uIjo3LCJnYW1lU3RhdGUiOnsiZGF5Ijo2MCwic2VlZCI6OSwiY2FzaFllbiI6NTAwMDAwMCwicmVwdXRhdGlvblRpZXIiOiJrbm93biIsInJlcHV0YXRpb25Qb2ludHMiOjQwLCJzZXJ2aWNlSm9iT2ZmZXJzIjpbXSwiYWN0aXZlU2VydmljZUpvYnMiOltdLCJzZXJ2aWNlQmF5Q291bnQiOjMsInBhcmtpbmdCYXlDb3VudCI6Nywic2VydmljZUJheUNhcklkcyI6W10sImxhYm9yU2xvdHNTcGVudFRvZGF5IjowLCJvd25lZEVxdWlwbWVudElkcyI6WyJ0aXJlLW1hY2hpbmUiXSwicGVuZGluZ1BhcnRPcmRlcnMiOltdLCJjYXJ0UGFydElkcyI6W10sImFjdGl2ZUxpc3RpbmdzIjpbeyJpZCI6Imxpc3RpbmctNTAtY2FyLTAwMDEiLCJjYXJJbnN0YW5jZUlkIjoiY2FyLTAwMDEiLCJtb2RlbElkIjoiaG9uZGEtY2l0eS1lLWFhIiwiYXNraW5nUHJpY2VZZW4iOjM1MDAwMCwicmVzb2x2ZXNPbkRheSI6NjV9XX19'

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

  it('decodes the pinned golden v7 save under the current version (Save law)', () => {
    const decoded = decodeSave(GOLDEN_V7_CODE)
    expect(decoded.day).toBe(60)
    expect(decoded.cashYen).toBe(5_000_000)
    expect(decoded.reputationTier).toBe('known')
    expect(decoded.reputationPoints).toBe(40)
    // v7 fields are preserved unchanged, not reset to their defaults.
    expect(decoded.ownedEquipmentIds).toEqual(['tire-machine'])
    // v7 -> v8 migration (Sprint 15): a real pending listing created before
    // the quality/lemon rule existed comes back reputation-neutral, not
    // rejected — the field it never had default-fills to 0.
    expect(decoded.activeListings).toHaveLength(1)
    expect(decoded.activeListings[0]?.askingPriceYen).toBe(350_000)
    expect(decoded.activeListings[0]?.reputationDeltaOnSale).toBe(0)
  })

  /**
   * v8 -> v9 (Sprint 17): a pre-v9 save's `serviceBayCarIds` is a compact
   * list of only-occupied ids (no `parkingCarIds` at all) — the exclusion-
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
        // Only one of these two owned cars is in the old compact list — the
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
          { kind: 'repair', componentId: 'engine' },
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
   * bid — the player leading over a rival's escalated position, and a
   * second lot where a rival leads instead — must migrate to the new open-
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
            // A rival is leading — the player bid, but a rival went higher.
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
    // playerHasBid stays true even though a rival currently leads — it never
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
            hiddenIssues: [],
            authenticityPercent: 85,
            components: {
              engine: { condition: 60, installed: null },
              forcedInduction: { condition: 100, installed: null },
              drivetrain: { condition: 60, installed: null },
              suspension: { condition: 60, installed: null },
              brakes: { condition: 100, installed: null },
              wheels: { condition: 100, installed: null },
              body: { condition: 60, installed: null },
              interior: { condition: 60, installed: null },
            },
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

  it('round-trips a v8 state with a real pending listing carrying a reputation delta', () => {
    const withListing: GameState = GameStateSchema.parse({
      ...fullState,
      activeListings: [
        {
          id: 'listing-40-car-0002',
          carInstanceId: 'car-0002',
          modelId: 'honda-city-e-aa',
          askingPriceYen: 500_000,
          resolvesOnDay: 45,
          reputationDeltaOnSale: 3,
        },
      ],
    })
    const decoded = decodeSave(encodeSave(withListing))
    expect(decoded).toEqual(withListing)
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
