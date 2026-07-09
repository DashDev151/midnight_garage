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
})
