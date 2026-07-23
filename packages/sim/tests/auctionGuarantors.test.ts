import { BUYERS, CARS, PARTS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { isAuctionTierUnlocked, unlockedAuctionTiers } from '../src/catalogs'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

/**
 * Chain order: the two guarantor missions join the SAME linear campaign,
 * interleaved by `gateReputationPoints` alongside the pre-existing eight -
 * `buildSimContext` sorts `storyMissions` by that field, so their neighbours
 * in the sorted list are the direct proof of where each one slots in.
 */
describe('guarantor mission chain order', () => {
  it('the-fleet-spare (gate 45) sits between wont-strand-her (30) and first-proper-car (60)', () => {
    const ids = CONTEXT.storyMissions.map((m) => m.id)
    const index = ids.indexOf('the-fleet-spare')
    expect(index).toBeGreaterThan(0)
    expect(ids[index - 1]).toBe('wont-strand-her')
    expect(ids[index + 1]).toBe('first-proper-car')
  })

  it('the-showroom-standard (gate 240) sits between the-column-clock (200) and low-and-loud (320)', () => {
    const ids = CONTEXT.storyMissions.map((m) => m.id)
    const index = ids.indexOf('the-showroom-standard')
    expect(index).toBeGreaterThan(0)
    expect(ids[index - 1]).toBe('the-column-clock')
    expect(ids[index + 1]).toBe('low-and-loud')
  })
})

/**
 * D1a: the collector-network tier is written into the design as dark until
 * the Hall of Legends arc lands its own guarantor mission - no mission in
 * the shipped campaign carries `unlocksAuctionTier: 'collector-network'`,
 * so it stays locked no matter how much of the rest of the campaign (or how
 * much reputation) a career has banked.
 */
describe('collector-network stays dark under D1a', () => {
  it('stays locked with both guarantor missions delivered and reputation maxed', () => {
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      reputationTier: 'legend' as const,
      storyMissions: [
        { missionId: 'the-fleet-spare', status: 'delivered' as const, acceptedOnDay: 1 },
        { missionId: 'the-showroom-standard', status: 'delivered' as const, acceptedOnDay: 1 },
      ],
    }
    expect(isAuctionTierUnlocked(state, CONTEXT, 'collector-network')).toBe(false)
    expect(unlockedAuctionTiers(state, CONTEXT)).toEqual(['local-yard', 'regional', 'premium'])
  })
})

/**
 * The unlock is derived from `storyMissions` alone - no dedicated save
 * field exists for it. A plain JSON round-trip of `GameState` (the shape
 * every save actually persists) must read back identically, proving the
 * derived function needs nothing beyond what a save file already carries.
 */
describe('the derived unlock survives a save/load round-trip', () => {
  it('matches before and after a JSON round-trip of the whole GameState', () => {
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      storyMissions: [
        { missionId: 'the-fleet-spare', status: 'delivered' as const, acceptedOnDay: 1 },
      ],
    }
    const before = unlockedAuctionTiers(state, CONTEXT)
    const roundTripped = JSON.parse(JSON.stringify(state))
    const after = unlockedAuctionTiers(roundTripped, CONTEXT)
    expect(after).toEqual(before)
    expect(after).toEqual(['local-yard', 'regional'])
  })
})
