import { BUYERS, CARS, FACILITIES, PARTS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { runWorkedExample, type CarRunReport, type CashLine } from '../src/workedExample'
import { renderWorkedExampleMarkdown } from '../src/workedExampleDoc'

/**
 * The reconciliation gate for `docs/design/systems/worked-example-two-cars.md`.
 *
 * The document's whole claim is that the ledger it prints is COMPLETE - that
 * the named lines account for every yen the sim moved. These tests are what
 * make that claim checkable: they assert the identity to the yen, with no
 * tolerance anywhere, and they assert that the three non-car income streams
 * (service jobs, story missions, the contract-staff retainer) never fired, so
 * the per-car margins are genuinely per-car.
 *
 * `WORKED_EXAMPLE_WRITE=1` additionally rewrites the document from this run,
 * which is the only supported way to regenerate it.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)
const REPORT = runWorkedExample(CONTEXT)

const HERE = dirname(fileURLToPath(import.meta.url))
const DOC_PATH = resolve(HERE, '../../../docs/design/systems/worked-example-two-cars.md')
/** U+2014, spelled by code point so this file does not itself carry the
 * character directive 15 bans and `packages/`'s own guard test enforces. */
const EM_DASH = String.fromCharCode(0x2014)

function totalOf(lines: readonly CashLine[]): number {
  return lines.reduce((sum, line) => sum + line.yen, 0)
}

function categoryTotal(category: CashLine['category']): number {
  return totalOf(REPORT.cashLines.filter((line) => line.category === category))
}

describe('the two-car worked example reconciles to the yen', () => {
  it('starting cash plus every named ledger line equals the closing cash the sim reports', () => {
    expect(REPORT.startingCashYen + totalOf(REPORT.cashLines)).toBe(REPORT.finalCashYen)
  })

  it('decomposes the same total into the two car ledgers plus the day costs', () => {
    // Machine-shop hire is a running cost, not a car cost
    // (`resolveHireMachineLine` charges the day), so it sits outside both
    // `CarLedger`s and has to be added back by hand here. Rent likewise.
    // Listing fees do NOT appear here: they are on the car ledgers now
    // (sprint150.md), so adding them again would double-count them.
    const decomposed =
      REPORT.carA.netYen +
      REPORT.carB.netYen +
      categoryTotal('rent') +
      categoryTotal('machine-hire') +
      categoryTotal('attendance') +
      categoryTotal('other')
    expect(decomposed).toBe(REPORT.finalCashYen - REPORT.startingCashYen)
  })

  it('never takes a yen from a non-car income stream', () => {
    expect(REPORT.excludedIncome).toEqual([])
  })

  it('leaves no cash line unexplained - every line carries a scope, a category and a label', () => {
    for (const line of REPORT.cashLines) {
      expect(line.label.length, JSON.stringify(line)).toBeGreaterThan(0)
      expect(line.yen, JSON.stringify(line)).not.toBe(0)
      expect(Number.isInteger(line.yen), JSON.stringify(line)).toBe(true)
    }
  })

  it('books rent to the shop, never to a car', () => {
    for (const line of REPORT.cashLines.filter((l) => l.category === 'rent')) {
      expect(line.scope).toBe('shop')
    }
    // ...and no car's own lines contain any rent at all.
    for (const scope of ['car-a', 'car-b'] as const) {
      const rentOnCar = REPORT.cashLines.filter((l) => l.scope === scope && l.category === 'rent')
      expect(rentOnCar).toEqual([])
    }
  })
})

describe("each car's ledger is the sim's own, not a recomputation", () => {
  it.each([
    ['car A', REPORT.carA],
    ['car B', REPORT.carB],
  ])('%s: net equals priceYen minus every CarLedger line', (_label, car: CarRunReport) => {
    expect(car.netYen).toBe(
      car.soldForYen -
        (car.ledgerPurchaseYen +
          car.ledgerRepairYen +
          car.ledgerPartsYen +
          car.ledgerListingFeesYen),
    )
    expect(car.ledgerPurchaseYen).toBe(car.acquisition.paidYen)
    // The fee charged to list is the fee the ledger recorded - one number,
    // read back off the sim's own state rather than recomputed.
    expect(car.ledgerListingFeesYen).toBe(car.listingFeeYen)
  })

  it.each([
    ['car A', REPORT.carA],
    ['car B', REPORT.carB],
  ])('%s: the acquisition band is anchor x 0.6 to anchor x 1.0', (_label, car: CarRunReport) => {
    expect(car.acquisition.reserveYen).toBe(
      Math.round(car.acquisition.anchorYen * CONTEXT.economy.AUCTION_RESERVE_PRICE_FRACTION),
    )
    expect(car.acquisition.buyoutYen).toBe(
      Math.round(car.acquisition.anchorYen * CONTEXT.economy.AUCTION_BUYOUT_PREMIUM),
    )
    expect(car.acquisition.paidYen).toBeGreaterThanOrEqual(car.acquisition.reserveYen)
    expect(car.acquisition.paidYen).toBeLessThanOrEqual(car.acquisition.buyoutYen)
  })
})

describe('the value ladder is the shipped valuation, decomposed', () => {
  it.each([
    ['car A', REPORT.carA],
    ['car B', REPORT.carB],
  ])('%s: every rung has three entries and each ledger sums to its own total', (_label, car) => {
    expect(car.rungs).toHaveLength(3)
    for (const rung of car.rungs) {
      const sum = rung.ledger.lines.reduce((total, line) => total + line.yen, 0)
      expect(sum, `${car.modelId} ${rung.label}`).toBe(rung.ledger.totalYen)
    }
  })

  it("an honest lot's rung-1 total is exactly the auction anchor it was priced from", () => {
    // Both are `marketValueYen` on an HONEST car at the same heat, so the
    // acquisition quote and the ladder can never disagree there. A lot that
    // arrives carrying a symptom is quoted off the room's APPARENT view
    // instead (`sheetGuideValueYen`) - a different function of a different
    // car - so no equality is claimed for it, and the document says so in
    // its own stated limits.
    const honest = [REPORT.carA, REPORT.carB].filter((car) => car.symptomsAtPurchase === 0)
    expect(
      honest.length,
      'both lots came up symptomatic: this check has nothing left to prove',
    ).toBeGreaterThan(0)
    for (const car of honest) {
      expect(car.rungs[0]!.ledger.totalYen, car.modelId).toBe(car.acquisition.anchorYen)
    }
  })

  it('prices every channel off the same underlying market value', () => {
    for (const car of [REPORT.carA, REPORT.carB]) {
      const tradeNetwork = car.channelQuotes.find((q) => q.channelId === 'tradeNetwork')!
      expect(tradeNetwork.tasteCeiling).toBeNull()
      // The trade network has no taste roll, so its quote IS the taste-free
      // market value of the same car at the same heat.
      expect(tradeNetwork.channelPriceYen).toBe(car.rungs[2]!.ledger.totalYen)
    }
  })
})

describe('the staleness walk answers the question it was run to answer', () => {
  const walk = REPORT.carB.stalenessWalk!

  it('collected a real run of offers without taking one', () => {
    expect(walk.offers.length).toBeGreaterThan(5)
    expect(walk.firstOfferYen).toBe(walk.offers[0]!.priceYen)
    expect(walk.bestOfferYen).toBe(Math.max(...walk.offers.map((o) => o.priceYen)))
  })

  it('advances offersSeen only when a buyer actually turned up', () => {
    for (const [index, offer] of walk.offers.entries()) {
      expect(offer.offersSeenAtDraw, `offer ${index}`).toBe(index)
    }
  })

  it('costs more in rent than patience is worth', () => {
    expect(walk.rentOverWalkYen).toBeGreaterThan(walk.holdingGainYen)
  })
})

describe('the scripted run stays inside its stated constraints', () => {
  it('never fires a service-job, story-mission or retainer payout', () => {
    const forbidden = REPORT.cashLines.filter(
      (line) =>
        line.label.includes('Service job') ||
        line.label.includes('Story mission') ||
        line.label.includes('retainer'),
    )
    expect(forbidden).toEqual([])
  })

  it('buys no bays, upgrades no tools and hires no staff', () => {
    expect(REPORT.cashLines.filter((l) => l.label.includes('Staff wage'))).toEqual([])
    expect(REPORT.weeklyRentYen).toBe(
      6000 + 1 * 5000 + 3 * 2000 + 2 * 1500, // the new-game bay counts, unchanged
    )
  })

  it('sells both cars through a real buyer archetype', () => {
    for (const car of [REPORT.carA, REPORT.carB]) {
      expect(CONTEXT.buyers.some((b) => b.id === car.soldToBuyerId)).toBe(true)
      expect(car.soldForYen).toBeGreaterThan(0)
    }
  })

  it('prices the sale below the channel value it drew against', () => {
    for (const car of [REPORT.carA, REPORT.carB]) {
      const channel = car.channelQuotes.find((q) => q.channelId === car.listingChannelId)!
      expect(car.soldForYen).toBeLessThanOrEqual(channel.channelPriceYen)
      expect(car.soldQualityFraction).toBeGreaterThanOrEqual(
        CONTEXT.economy.liquidity.qualityFloor - 1e-9,
      )
      expect(car.soldQualityFraction).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})

describe('the generated document', () => {
  it('renders, and is rewritten when WORKED_EXAMPLE_WRITE is set', () => {
    const markdown = renderWorkedExampleMarkdown(REPORT)
    expect(markdown).toContain('Two cars, end to end')
    expect(markdown).not.toContain(EM_DASH) // directive 15: no em dashes, ever
    expect(markdown).toContain(REPORT.carA.displayName)
    expect(markdown).toContain(REPORT.carB.displayName)
    if (process.env.WORKED_EXAMPLE_WRITE === '1') {
      mkdirSync(dirname(DOC_PATH), { recursive: true })
      writeFileSync(DOC_PATH, markdown, 'utf8')
    }
  })
})
