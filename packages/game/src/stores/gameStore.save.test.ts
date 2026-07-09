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
