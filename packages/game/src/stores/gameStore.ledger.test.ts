import {
  ECONOMY,
  EMPTY_FINANCE_WEEK,
  PARTS,
  addCashMovement,
  type FinanceWeek,
} from '@midnight-garage/content'
import { weekIndex } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as saveDb from '../save/saveDb'
import { useGameStore } from './gameStore'

vi.mock('../save/saveDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../save/saveDb')>()
  return { ...actual, appendLedgerEvent: vi.fn() }
})

const appendLedgerEvent = vi.mocked(saveDb.appendLedgerEvent)

/**
 * The persisted ledger stream and the sim's own weekly sheet
 * are two readings of the same movements through the same classification law
 * (`cashMovementFor`), captured at different layers - the stream at the
 * store's day-log write point, the sheet inside each resolver. A played week
 * must therefore roll up to identical five-bucket totals, to the yen; any gap
 * is a movement one side saw and the other did not.
 */
describe('ledger stream reconciliation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    appendLedgerEvent.mockClear()
  })

  it('a played week rolls up to the financeLedger totals to the yen', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(10_000_000)

    // Stock out: buy the first catalogue part the market will sell today.
    const beforeIds = new Set(game.gameState.partInventory.map((p) => p.id))
    const bought = PARTS.find((p) => game.buyPart(p.id))
    expect(bought).toBeTruthy()

    // Income in: sell that same part straight back at the used haircut.
    const instance = game.gameState.partInventory.find((p) => !beforeIds.has(p.id))
    expect(instance).toBeTruthy()
    expect(game.sellPart(instance!.id)).toBe(true)

    // Running out: hire the engine machine line for the day (a running cost
    // that must show up in the ledger stream like any other cash flow).
    expect(game.hireToolLine('engine')).toBe(true)

    // Play the week out - End Day carries the boundary charges (rent) into
    // the stream stamped with the day they were booked on, not the morning
    // after.
    while (game.day <= ECONOMY.calendar.daysPerWeek) game.endDay()

    const events = appendLedgerEvent.mock.calls.map(([event]) => event)
    expect(events.length).toBeGreaterThan(0)
    expect(events.some((event) => event.entryType === 'machine-hired')).toBe(true)

    // Roll the stream up per week through the same fold the sheet uses.
    const weeks = new Map<string, FinanceWeek>()
    for (const event of events) {
      const key = String(weekIndex(event.day, ECONOMY))
      weeks.set(
        key,
        addCashMovement(weeks.get(key) ?? EMPTY_FINANCE_WEEK, {
          bucket: event.bucket,
          amountYen: event.amountYen,
        }),
      )
    }

    // Both directions: every week the sheet booked exists in the stream, and
    // the stream invents no week the sheet never saw.
    const ledger = game.gameState.financeLedger ?? {}
    expect([...weeks.keys()].sort()).toEqual(Object.keys(ledger).sort())
    for (const [key, week] of weeks) expect(ledger[key]).toEqual(week)

    // The reconciled week actually moved money on several lines - a week of
    // all-zero buckets would reconcile trivially and prove nothing.
    const week1 = weeks.get('1')
    expect(week1).toBeTruthy()
    expect(week1!.incomeYen).toBeGreaterThan(0)
    expect(week1!.stockYen).toBeGreaterThan(0)
    expect(week1!.runningYen).toBeGreaterThan(0)
  })
})
