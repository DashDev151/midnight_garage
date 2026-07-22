import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

describe('persistence: export / import save code', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a career exported to a code restores into a fresh store', () => {
    const a = useGameStore()
    a.newGame(1)
    a.endDay()
    a.endDay()
    a.devGiveCash(500_000)
    const code = a.exportSaveCode()
    const savedDay = a.day
    const savedCash = a.cashYen

    setActivePinia(createPinia())
    const b = useGameStore()
    const result = b.importSaveCode(code)

    expect(result.ok).toBe(true)
    expect(b.day).toBe(savedDay)
    expect(b.cashYen).toBe(savedCash)
  })

  it('importing garbage fails cleanly and leaves the career untouched', () => {
    const game = useGameStore()
    game.newGame(1)
    const dayBefore = game.day
    const result = game.importSaveCode('not a real code')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/save code/i)
    expect(game.day).toBe(dayBefore)
  })

  /**
   * A pre-v5 save carrying a car in the old
   * condition/buildSheet shape is intentionally unsupported (no migration).
   * `importSaveCode`'s existing try/catch (the same one `hydrate()` uses at
   * startup) must turn that decode failure into a clean `{ok: false}`
   * rather than crashing or corrupting the current career.
   */
  it('importing a pre-v5 save with a car fails cleanly, not a crash', () => {
    const game = useGameStore()
    game.newGame(1)
    const dayBefore = game.day
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
    const result = game.importSaveCode(code)
    expect(result.ok).toBe(false)
    expect(game.day).toBe(dayBefore) // current career untouched
  })
})

describe('persistence: end-of-day report', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('endDay records the ended day + cash delta and shows the report', () => {
    const game = useGameStore()
    game.newGame(1)
    expect(game.reportVisible).toBe(false)

    game.endDay()

    expect(game.reportVisible).toBe(true)
    expect(game.lastDayReport?.day).toBe(1) // the day that just ended
    expect(typeof game.lastDayReport?.cashDeltaYen).toBe('number')

    game.dismissReport()
    expect(game.reportVisible).toBe(false)
  })

  it('newGame clears any prior report', () => {
    const game = useGameStore()
    game.newGame(1)
    game.endDay()
    game.newGame(2)
    expect(game.reportVisible).toBe(false)
    expect(game.lastDayReport).toBeNull()
    expect(game.day).toBe(1)
  })
})
