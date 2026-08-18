import { CARS, type ConditionBand } from '@midnight-garage/content'
import {
  carCostToMintYen,
  groupCostToMintYen,
  marketValueYen,
  priorBand,
  seedVerifiedSlots,
} from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

/**
 * The knowledge model's own guard (sprint215.md task B3, docs/design/
 * systems/knowledge-and-diagnosis.md section 1): no owned-car surface may
 * ever read an unverified slot's true band or true part identity. A
 * dev-granted car starts fully verified (task A3), so every test here
 * re-seeds through `seedVerifiedSlots` - the real function bidding.ts's own
 * acquisition settlement calls - to reproduce both the verified-slot set AND
 * the frozen `acquisitionEvidenceDelta` (rulings-ledger item 14) a real
 * auction purchase leaves the player with.
 */
describe('the knowledge model never leaks truth for an unverified slot', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** A granted car, re-seeded to the ordinary acquisition knowledge state
   * (only the always-visible slots verified, evidence frozen from that same
   * state) with `internals` forced to a true band that provably differs from
   * its own `priorBand` guess - whichever way the mileage/provenance/
   * evidence roll landed. */
  function seedUnverifiedCar() {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const granted = game.gameState.ownedCars[0]!
    const seeded = seedVerifiedSlots(granted, game.context)
    const trueBand: ConditionBand =
      priorBand(seeded, 'internals', game.context) === 'poor' ? 'mint' : 'poor'
    const car = {
      ...seeded,
      parts: {
        ...seeded.parts,
        internals: {
          ...seeded.parts.internals,
          installed: { ...seeded.parts.internals.installed!, band: trueBand },
        },
      },
    }
    game.gameState = {
      ...game.gameState,
      ownedCars: [car, ...game.gameState.ownedCars.slice(1)],
    }
    return {
      game,
      carId: car.id,
      trueBand,
      estimatedBand: priorBand(car, 'internals', game.context),
    }
  }

  it('the per-part row shows the estimate, flags itself estimated, and never the true band', () => {
    const { game, carId, trueBand, estimatedBand } = seedUnverifiedCar()
    const row = game.partsInGroup(carId, 'engine').find((r) => r.partId === 'internals')!
    expect(row.estimated).toBe(true)
    expect(row.band).toBe(estimatedBand)
    expect(row.band).not.toBe(trueBand)
  })

  it('a verified slot on the same car shows the plain truth, not an estimate', () => {
    const { game, carId } = seedUnverifiedCar()
    const row = game.partsInGroup(carId, 'wheels').find((r) => r.partId === 'tyres')!
    expect(row.estimated).toBe(false)
  })

  it('the group headline band never reads truer than the per-part row underneath it', () => {
    const { game, carId, trueBand, estimatedBand } = seedUnverifiedCar()
    if (trueBand === estimatedBand) return // nothing to distinguish this run
    const detail = game.carDetail(carId)!
    // The engine group's worst band can only be the true 'poor' if some
    // OTHER engine part is also true-poor; internals itself must never be
    // the source of a truer-than-estimated group read.
    if (trueBand === 'poor' && estimatedBand !== 'poor') {
      const otherEnginePartsAllBetterThanPoor = game
        .partsInGroup(carId, 'engine')
        .filter((r) => r.partId !== 'internals')
        .every((r) => r.band !== 'poor' && r.band !== 'scrap')
      if (otherEnginePartsAllBetterThanPoor) {
        expect(detail.groupBands.engine).not.toBe('poor')
      }
    }
  })

  it("yourNumberYen reads the player's own knowledge, not the car's true value", () => {
    const { game, carId, trueBand, estimatedBand } = seedUnverifiedCar()
    if (trueBand === estimatedBand) return // nothing to distinguish this run
    const detail = game.carDetail(carId)!
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    const model = game.context.modelsById[car.modelId]!
    const heatPercent = game.gameState.marketHeat[car.modelId] ?? 100
    const trueValueYen = Math.round(
      marketValueYen(
        model,
        car,
        heatPercent,
        game.context.partsById,
        game.context.partsTaxonomyById,
        game.context.economy,
      ),
    )
    // internals is a real reliability/value-bearing slot on every roster
    // model, so masking it to a different band must move the player's own
    // number away from the truth.
    expect(detail.yourNumberYen).not.toBe(trueValueYen)
  })

  it('workBillYen prices an unverified slot from the estimate, never the truth underneath it', () => {
    const { game, carId } = seedUnverifiedCar()
    const detail = game.carDetail(carId)!
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    const model = game.context.modelsById[car.modelId]!
    // An "est. fine" slot must never carry a bill that implies its true,
    // worse band - the bug this guard test was added to catch: the bill
    // preview leaking truth through price even though the band chip itself
    // was already masked.
    const trueBillYen = carCostToMintYen(
      car,
      model,
      game.context.partsById,
      game.context.partsTaxonomyById,
      game.context.economy,
    )
    expect(detail.workBillYen).not.toBe(trueBillYen)
  })

  it("groupBillYen prices an unverified slot's group from the estimate, never the truth underneath it", () => {
    const { game, carId } = seedUnverifiedCar()
    const detail = game.carDetail(carId)!
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    const model = game.context.modelsById[car.modelId]!
    const trueEngineBillYen = groupCostToMintYen(
      car,
      model,
      'engine',
      game.context.partIdsByGroup,
      game.context.partsById,
      game.context.partsTaxonomyById,
      game.context.economy,
    )
    expect(detail.groupBillYen.engine).not.toBe(trueEngineBillYen)
  })

  it('the reveal-then-confirm preview names the true band under the estimate for a group repair address (no carPartId), covering the group-repair entry point', () => {
    const { game, carId, trueBand, estimatedBand } = seedUnverifiedCar()
    const reveals = game.repairRevealFor(carId, 'engine')
    const internalsReveal = reveals.find((r) => r.partId === 'internals')
    expect(internalsReveal).toBeDefined()
    expect(internalsReveal!.trueBand).toBe(trueBand)
    expect(internalsReveal!.estimatedBand).toBe(estimatedBand)
  })

  it('repairRevealFor is empty once the slot is verified - nothing left to reveal, the click just runs', () => {
    const { game, carId } = seedUnverifiedCar()
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    game.gameState = {
      ...game.gameState,
      ownedCars: [
        { ...car, verifiedSlots: [...car.verifiedSlots!, 'internals'] },
        ...game.gameState.ownedCars.slice(1),
      ],
    }
    expect(game.repairRevealFor(carId, 'engine', 'internals')).toEqual([])
  })
})
