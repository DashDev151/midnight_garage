import type { ValueLedgerLineId } from './valueLedger'
import type {
  CarRunReport,
  CashLine,
  CashScope,
  ValueRung,
  WorkedExampleReport,
} from './workedExample'

/**
 * Renders a `WorkedExampleReport` as the markdown document at
 * `docs/design/systems/worked-example-two-cars.md`. Presentation only: it
 * performs no valuation, no pricing and no simulation, and the only arithmetic
 * it does is summing yen figures the harness already produced. Kept beside the
 * harness rather than inside it so the run and its write-up stay separable.
 */

/** Locale-independent thousands grouping - a generated document must not
 * change shape with the machine that generated it. */
function yen(value: number): string {
  const sign = value < 0 ? '-' : ''
  const digits = Math.abs(Math.round(value)).toString()
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}¥${grouped}`
}

function num(value: number, places: number): string {
  return Number.isFinite(value) ? value.toFixed(places) : 'n/a'
}

const VALUE_LINE_LABELS: Record<ValueLedgerLineId, string> = {
  book: 'Book value',
  mileage: 'Mileage curve',
  heat: 'Market heat',
  wear: 'Restoration bill below the expected band (x marketRepairDiscount 1.3)',
  polish: 'Restoration bill above the expected band (x the tier beyondDiscount)',
  floor: 'Scrap-value backstop',
  coherence: 'Stage C coherence discount',
  aftermarket: 'Stage D aftermarket premium',
  fear: 'Symptom fear discount',
}

const CATEGORY_LABELS: Record<CashLine['category'], string> = {
  acquisition: 'Acquisition',
  attendance: 'Auction attendance',
  repair: 'Repair labour charges',
  parts: 'Parts',
  materials: 'Body-pipeline materials',
  'machine-hire': 'Machine-line hire',
  listing: 'Listing fee',
  sale: 'Sale proceeds',
  rent: 'Rent',
  other: 'Other',
}

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`
  const rule = `|${headers.map(() => '---').join('|')}|`
  const body = rows.map((row) => `| ${row.join(' | ')} |`)
  return [head, rule, ...body].join('\n')
}

function totalOf(lines: readonly CashLine[]): number {
  return lines.reduce((sum, line) => sum + line.yen, 0)
}

function linesFor(report: WorkedExampleReport, scope: CashScope): CashLine[] {
  return report.cashLines.filter((line) => line.scope === scope)
}

function rungTable(rung: ValueRung): string {
  const rows = rung.ledger.lines.map((line) => [
    VALUE_LINE_LABELS[line.id],
    `\`${line.id}\``,
    yen(line.yen),
  ])
  rows.push(['**Total (`marketValueYen`)**', '', `**${yen(rung.ledger.totalYen)}**`])
  return table(['Line', 'id', 'Yen'], rows)
}

function rungHeading(rung: ValueRung, index: number): string {
  return `#### Rung ${index + 1}: ${rung.label} (day ${rung.day}, market heat ${rung.heatPercent}%)`
}

function carSection(report: WorkedExampleReport, car: CarRunReport, label: string): string {
  const out: string[] = []
  const lines = linesFor(report, car.scope)

  out.push(`## ${label}: ${car.displayName}`)
  out.push('')
  out.push(
    `**Tier** ${car.tier} - **culture** ${car.culture} - **${car.year}, ${car.mileageKm.toLocaleString('en-US').replace(/,/g, ',')} km** - lot \`${car.acquisition.lotId}\`, generated at seed \`${car.generationSeed}\`.`,
  )
  out.push('')
  out.push(`**Why this car.** ${car.whyChosen}`)
  out.push('')

  out.push('### 1. Acquisition')
  out.push('')
  out.push(
    table(
      ['Figure', 'Function', 'Yen'],
      [
        ['Guide value (the anchor)', '`anchorValueYen`', yen(car.acquisition.anchorYen)],
        [
          'Auction reserve',
          '`reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6)',
          yen(car.acquisition.reserveYen),
        ],
        [
          'Desk buyout',
          '`computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0)',
          yen(car.acquisition.buyoutYen),
        ],
        [
          `Attendance fee (${car.acquisition.tier})`,
          '`auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier',
          yen(car.acquisition.attendanceFeeYen),
        ],
        [
          'Inspection / travel fee',
          '`diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run',
          'not paid',
        ],
        [
          '**Paid (this run)**',
          '`settleAuctionHammer` at the reserve',
          `**${yen(car.acquisition.paidYen)}**`,
        ],
      ],
    ),
  )
  out.push('')
  out.push(
    `The realised price of a live-room win lands **somewhere between ${yen(car.acquisition.reserveYen)} and ${yen(car.acquisition.buyoutYen)}**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at the room's own \`auctionRoom.reserveFraction\` of 0.55. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ${yen(car.acquisition.buyoutYen - car.acquisition.reserveYen)} more.`,
  )
  out.push('')
  if (car.inheritedAftermarket.length > 0) {
    out.push(
      `It arrived carrying somebody else's part${car.inheritedAftermarket.length === 1 ? '' : 's'}: ${car.inheritedAftermarket
        .map((p) => `\`${p.carPartId}\` ${p.displayName} (${p.grade}, ${p.band})`)
        .join(
          ', ',
        )}. Generation fits up to \`partsGeneration.maxAftermarketSlots\` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.`,
    )
    out.push('')
  }

  out.push('### 2. The work')
  out.push('')
  const workCategories: CashLine['category'][] = ['repair', 'materials', 'parts', 'machine-hire']
  const workRows = workCategories.flatMap((category) =>
    lines
      .filter((line) => line.category === category)
      .map((line) => [`day ${line.day}`, CATEGORY_LABELS[category], line.label, yen(line.yen)]),
  )
  if (workRows.length > 0) {
    out.push(table(['Day', 'Category', 'Item', 'Yen'], workRows))
    out.push('')
    const workTotal = totalOf(lines.filter((l) => workCategories.includes(l.category)))
    out.push(`Work spend, all categories: **${yen(-workTotal)}**.`)
  } else {
    out.push('No work was needed.')
  }
  out.push('')
  out.push(
    `Labour is slots, not yen, and is never charged to the bank: this car consumed **${car.laborSlotsSpent} energy points** out of a solo shop's ${'`economy.energy.basePoolPoints`'} of 60 per day.`,
  )
  out.push('')
  if (car.machineHires.length > 0) {
    out.push(
      table(
        ['Day', 'Line hired', 'Fee', 'What it unlocked'],
        car.machineHires.map((hire) => [
          `day ${hire.day}`,
          `\`${hire.group}\``,
          yen(hire.feeYen),
          hire.group === 'wheels'
            ? 'mounting a fresh tyre onto the rim on the bench'
            : `fitting that group's signature slots (\`machineShopAssist.signatureSlotsByGroup\`)`,
        ]),
      ),
    )
    out.push('')
    out.push(
      'A machine-line hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from.',
    )
    out.push('')
  }

  out.push('### 3. The value ladder')
  out.push('')
  for (const [index, rung] of car.rungs.entries()) {
    out.push(rungHeading(rung, index))
    out.push('')
    out.push(rungTable(rung))
    out.push('')
    out.push(
      `Restoration bill still owed to the \`${car.expectedBand}\` band the tier expects: ${yen(rung.billToExpectedBandYen)}.`,
    )
    out.push('')
  }

  out.push('#### What decides the aftermarket premium')
  out.push('')
  out.push(
    table(
      [
        'Rung',
        'Support headline',
        'coherenceFactor',
        'retentionFor',
        'foundationFactor',
        'aftermarketReturn',
        'installedPartsValueYen',
        'Credited premium',
      ],
      car.rungs.map((rung) => {
        const line = rung.ledger.lines.find((l) => l.id === 'aftermarket')
        return [
          rung.label,
          num(rung.supportHeadline, 3),
          num(rung.coherenceFactor, 3),
          num(rung.retention, 3),
          num(rung.foundationFactor, 2),
          num(rung.aftermarketReturn, 2),
          yen(rung.installedPartsValueYen),
          yen(line?.yen ?? 0),
        ]
      }),
    ),
  )
  out.push('')
  out.push(
    "The credited premium is `foundationFactor x aftermarketReturn x installedPartsValueYen`, and `installedPartsValueYen` is itself every non-stock part's catalogue price times `retentionFor(coherenceFactor)`. All three gates multiply, so any one of them at zero takes the whole premium with it.",
  )
  out.push('')

  if (car.fittedParts.length > 0) {
    out.push('#### The build')
    out.push('')
    out.push(
      table(
        ['Slot', 'Part', 'Grade', 'List price', 'Paid', 'Express surcharge'],
        car.fittedParts.map((part) => [
          `\`${part.carPartId}\``,
          part.displayName,
          part.grade,
          yen(part.listPriceYen),
          yen(part.paidYen),
          part.expressSurchargeYen === 0 ? '-' : yen(part.expressSurchargeYen),
        ]),
      ),
    )
    out.push('')
    out.push(
      `Parts total ${yen(car.fittedParts.reduce((sum, p) => sum + p.paidYen, 0))}; the ladder above credits ${yen(
        (car.rungs[2]?.ledger.lines.find((l) => l.id === 'aftermarket')?.yen ?? 0) -
          (car.rungs[1]?.ledger.lines.find((l) => l.id === 'aftermarket')?.yen ?? 0),
      )} of it back into the car's value.`,
    )
    out.push('')
  }

  if (car.residual.length > 0) {
    out.push('#### What the shop could not reach')
    out.push('')
    out.push(
      table(
        ['Slot', 'Band', 'Why it stayed there'],
        car.residual.map((row) => [`\`${row.carPartId}\``, row.band, row.reason]),
      ),
    )
    out.push('')
    out.push(
      `Remaining bill to the expected band: **${yen(car.residualBillYen)}**. This is real, and the market is discounting it in every rung above.`,
    )
    out.push('')
  }

  out.push('### 4. The sale')
  out.push('')
  out.push(
    table(
      ['Figure', 'Value'],
      [
        ['Channel', `\`${car.listingChannelId}\``],
        ['Listing fee', yen(car.listingFeeYen)],
        [
          'Forecourt slot',
          car.listingChannelId === 'tradeNetwork' ? 'not required' : '1 of 2 taken while listed',
        ],
        [
          'Days listed before it sold',
          `${car.soldOnDay - car.rungs[2]!.day} day${car.soldOnDay - car.rungs[2]!.day === 1 ? '' : 's'}`,
        ],
        ['Buyer archetype', `\`${car.soldToBuyerId}\``],
        ['Buyer taste (through the channel ceiling)', num(car.soldBuyerTaste, 4)],
        ['Offer quality fraction drawn', num(car.soldQualityFraction, 4)],
        ['**Final `priceYen`**', `**${yen(car.soldForYen)}**`],
      ],
    ),
  )
  out.push('')
  out.push('#### The same car, the same buyer, every channel')
  out.push('')
  out.push(
    table(
      [
        'Channel',
        'Fee',
        'tasteCeiling',
        'Matched only',
        'Buyer taste',
        'Channel price',
        'Price less fee vs shop front',
      ],
      car.channelQuotes.map((quote) => {
        const shopFront = car.channelQuotes.find((q) => q.channelId === 'shopFront')!
        const delta = quote.channelPriceYen - quote.feeYen - shopFront.channelPriceYen
        return [
          `\`${quote.channelId}\``,
          yen(quote.feeYen),
          quote.tasteCeiling === null ? 'n/a (flat `priceBand`)' : num(quote.tasteCeiling, 2),
          quote.matchedOnly ? 'yes' : 'no',
          num(quote.buyerTaste, 4),
          yen(quote.channelPriceYen),
          quote.channelId === 'shopFront' ? '-' : yen(delta),
        ]
      }),
    ),
  )
  out.push('')

  out.push("### 5. Net, from the sim's own car ledger")
  out.push('')
  out.push(
    table(
      ['`CarLedger` field', 'Yen'],
      [
        ['`purchaseYen`', yen(car.ledgerPurchaseYen)],
        ['`repairYen`', yen(car.ledgerRepairYen)],
        ['`partsYen`', yen(car.ledgerPartsYen)],
        ['Sale `priceYen`', yen(car.soldForYen)],
        ['**Net**', `**${yen(car.netYen)}**`],
      ],
    ),
  )
  out.push('')
  const offLedger = totalOf(
    lines.filter((l) => l.category === 'machine-hire' || l.category === 'listing'),
  )
  if (offLedger !== 0) {
    out.push(
      `The car ledger does not carry the machine-line hires or the listing fee (${yen(-offLedger)} between them): those are day costs, not car costs. Counting them, this car actually returned **${yen(car.netYen + offLedger)}** to the bank.`,
    )
    out.push('')
  }
  return out.join('\n')
}

function stalenessSection(car: CarRunReport): string {
  const walk = car.stalenessWalk
  if (!walk) return ''
  const out: string[] = []
  out.push('## Staleness: what happens if it does not sell straight away')
  out.push('')
  out.push(
    `A side branch off ${car.displayName}'s listing snapshot: the same listing, the same seeds, walked ${walk.days} days without taking anything. Nothing here touches the career the ledger above reconciles - it is a hypothetical run of the same state.`,
  )
  out.push('')
  out.push(
    table(
      ['Day', '`offersSeen` at the draw', 'Buyer', 'Quality fraction', 'Offer'],
      walk.offers.map((offer) => [
        `${offer.day}`,
        `${offer.offersSeenAtDraw}`,
        `\`${offer.buyerId}\``,
        num(offer.qualityFraction, 4),
        yen(offer.priceYen),
      ]),
    ),
  )
  out.push('')
  out.push(
    `${walk.offers.length} offers in ${walk.days} days. First offer **${yen(walk.firstOfferYen)}** (day ${walk.offers[0]?.day ?? 0}); best offer **${yen(walk.bestOfferYen)}** (day ${walk.bestOfferDay}). Holding out for the best one seen is worth **${yen(walk.holdingGainYen)}** - and costs ${yen(walk.rentOverWalkYen)} of rent over the same stretch, plus a forecourt slot that could have held another car.`,
  )
  out.push('')
  out.push(
    `**Is there ever a point in not taking the first offer?** On these numbers, no. The quality fraction decays with \`offersSeen\` exactly as \`qualityMeanFor\` says it should (${'`qualityFresh`'} 0.96 down toward ${'`qualityFloor`'} 0.86), so the OFFER side of the equation only ever gets worse. What moves the price up again is a different buyer walking in, not a better offer from the same one: the spread between archetypes on this car is far wider than the whole staleness decay. Waiting is therefore a bet on WHO turns up, at a known cost of ${yen(Math.round(walk.rentOverWalkYen / walk.days))} a day in rent alone, and the bet does not pay.`,
  )
  out.push('')
  return out.join('\n')
}

export function renderWorkedExampleMarkdown(report: WorkedExampleReport): string {
  const { carA, carB } = report
  const out: string[] = []
  const rentTotal = totalOf(report.cashLines.filter((l) => l.category === 'rent'))
  const hireTotal = totalOf(report.cashLines.filter((l) => l.category === 'machine-hire'))
  const listingTotal = totalOf(report.cashLines.filter((l) => l.category === 'listing'))

  out.push('# Two cars, end to end, generated from the shipped sim')
  out.push('')
  out.push(
    'This document is **generated**, not written: every number in it comes from executing the shipped resolvers in `packages/sim`, once, on a fixed seed. Nothing here is a hand-recomputed formula. Regenerate it with:',
  )
  out.push('')
  out.push('```')
  out.push('WORKED_EXAMPLE_WRITE=1 pnpm test packages/sim/tests/workedExample.test.ts')
  out.push('```')
  out.push('')
  out.push(
    '(PowerShell: `$env:WORKED_EXAMPLE_WRITE=1; pnpm test packages/sim/tests/workedExample.test.ts`.)',
  )
  out.push('')
  out.push('## Plain language, first')
  out.push('')
  out.push(
    `The shop opens with ${yen(report.startingCashYen)}. It buys a rough ${carA.year} ${carA.displayName} for ${yen(carA.acquisition.paidYen)}, spends ${yen(-totalOf(linesFor(report, 'car-a').filter((l) => l.category !== 'sale' && l.category !== 'acquisition')))} putting it right and dressing it up, and sells it on day ${carA.soldOnDay} for ${yen(carA.soldForYen)}. It then buys a tidy ${carB.year} ${carB.displayName} for ${yen(carB.acquisition.paidYen)}, spends ${yen(-totalOf(linesFor(report, 'car-b').filter((l) => l.category !== 'sale' && l.category !== 'acquisition')))} on it, and sells that on day ${carB.soldOnDay} for ${yen(carB.soldForYen)}. Rent takes ${yen(-rentTotal)} over the same ${carB.soldOnDay} days regardless of what the shop does. The till finishes at ${yen(report.finalCashYen)}: **${yen(report.finalCashYen - report.startingCashYen)} made in ${carB.soldOnDay} days**, out of two cars and no other income at all.`,
  )
  out.push('')

  out.push('## Seeds and assumptions')
  out.push('')
  out.push(
    table(
      ['Input', 'Value'],
      [
        [
          'Career seed',
          `\`${report.careerSeed}\` (also the base of every day's stream: \`advanceDay\` is called with \`seed + day\`)`,
        ],
        [`${carA.displayName} lot generation seed`, `\`${carA.generationSeed}\``],
        [`${carB.displayName} lot generation seed`, `\`${carB.generationSeed}\``],
        ['Calendar year', '1995 (reputation `unknown`)'],
        ['Starting cash', yen(report.startingCashYen)],
        ['Bays', '1 service, 3 parking, 2 forecourt (the new-game counts; none bought)'],
        ['Tools', 'tier 1 on all six lines; none upgraded'],
        ['Staff', 'none hired'],
        ['Reputation', '`unknown` throughout'],
        ['Weekly rent at these bays', `${yen(report.weeklyRentYen)} (\`computeWeeklyRentYen\`)`],
      ],
    ),
  )
  out.push('')
  out.push('Deliberate limits of this run, stated so nothing reads as a claim it is not:')
  out.push('')
  out.push(
    '- Both lots came up **honest** (no symptoms). A symptomatic lot prices through `sheetGuideValueYen` instead, which adds a negative `fear` line to the room ledger and a diagnosis game on top. That is a different document.',
  )
  out.push(
    '- The opening auction catalogue and the day-1 service-job board are cleared before the run starts, so the two scripted lots are the only lots and no service job, story mission or staff retainer can pay into the till by accident. The test asserts all three streams stayed empty.',
  )
  out.push(
    '- Both cars are settled at the **auction reserve**, the bottom of the band a live room can produce. Each car section prices the desk buyout alongside it.',
  )
  out.push(
    '- The shop never hires the engine, drivetrain or body machine lines, so buried engine internals, the gearbox and welding are all out of reach. What that leaves behind is itemised per car.',
  )
  out.push('')

  out.push('## Headline')
  out.push('')
  out.push(
    table(
      ['', carA.displayName, carB.displayName],
      [
        ['Tier / culture', `${carA.tier} / ${carA.culture}`, `${carB.tier} / ${carB.culture}`],
        [
          'Book value',
          yen(carA.rungs[0]!.ledger.lines[0]!.yen),
          yen(carB.rungs[0]!.ledger.lines[0]!.yen),
        ],
        ['Condition bought', 'rough', 'tidy'],
        ['Paid (auction reserve)', yen(carA.acquisition.paidYen), yen(carB.acquisition.paidYen)],
        [
          'Desk buyout would have been',
          yen(carA.acquisition.buyoutYen),
          yen(carB.acquisition.buyoutYen),
        ],
        [
          'Rung 1 - as bought',
          yen(carA.rungs[0]!.ledger.totalYen),
          yen(carB.rungs[0]!.ledger.totalYen),
        ],
        [
          'Rung 2 - repaired',
          yen(carA.rungs[1]!.ledger.totalYen),
          yen(carB.rungs[1]!.ledger.totalYen),
        ],
        [
          'Rung 3 - modified',
          yen(carA.rungs[2]!.ledger.totalYen),
          yen(carB.rungs[2]!.ledger.totalYen),
        ],
        ['Repair charges (`repairYen`)', yen(carA.ledgerRepairYen), yen(carB.ledgerRepairYen)],
        ['Parts (`partsYen`)', yen(carA.ledgerPartsYen), yen(carB.ledgerPartsYen)],
        ['Sold for', yen(carA.soldForYen), yen(carB.soldForYen)],
        ['**Net (ledger)**', `**${yen(carA.netYen)}**`, `**${yen(carB.netYen)}**`],
        ['Labour spent (energy points)', `${carA.laborSlotsSpent}`, `${carB.laborSlotsSpent}`],
        ['Days owned', `${carA.daysHeld}`, `${carB.daysHeld}`],
      ],
    ),
  )
  out.push('')
  out.push(
    `**Fixed overheads, held out of both margins.** Rent is a function of bays owned, not of any one car: ${yen(report.weeklyRentYen)} a week at 1 service, 3 parking and 2 forecourt bays, charged on \`calendar.rentDayOfWeek\`. Over this run it took ${yen(-rentTotal)}. That is what the week costs whatever the shop does with it, and it is never subtracted from a car's margin above.`,
  )
  out.push('')

  out.push(carSection(report, carA, 'Car A'))
  out.push(carSection(report, carB, 'Car B'))
  out.push(stalenessSection(carA) + stalenessSection(carB))

  out.push('## The whole cash ledger')
  out.push('')
  out.push('Every yen that moved, in order. This is the list the reconciliation test sums.')
  out.push('')
  let running = report.startingCashYen
  out.push(
    table(
      ['Day', 'Scope', 'Category', 'Item', 'Yen', 'Balance'],
      [
        ['-', '-', '-', 'Opening cash', '-', yen(report.startingCashYen)],
        ...report.cashLines.map((line) => {
          running += line.yen
          return [
            `${line.day}`,
            line.scope,
            CATEGORY_LABELS[line.category],
            line.label,
            yen(line.yen),
            yen(running),
          ]
        }),
      ],
    ),
  )
  out.push('')

  out.push('## Reconciliation')
  out.push('')
  out.push(
    table(
      ['Check', 'Yen'],
      [
        ['Opening cash', yen(report.startingCashYen)],
        ['Sum of every ledger line above', yen(totalOf(report.cashLines))],
        ['**Closing cash, from the sim**', `**${yen(report.finalCashYen)}**`],
        [
          'Difference',
          yen(report.startingCashYen + totalOf(report.cashLines) - report.finalCashYen),
        ],
      ],
    ),
  )
  out.push('')
  out.push('The same total, decomposed the other way:')
  out.push('')
  out.push(
    table(
      ['Component', 'Yen'],
      [
        [`${carA.displayName} net (car ledger)`, yen(carA.netYen)],
        [`${carB.displayName} net (car ledger)`, yen(carB.netYen)],
        ['Rent', yen(rentTotal)],
        ['Machine-line hire (day cost, not on any car ledger)', yen(hireTotal)],
        ['Listing fees (day cost, not on any car ledger)', yen(listingTotal)],
        ['**Change in cash**', `**${yen(report.finalCashYen - report.startingCashYen)}**`],
      ],
    ),
  )
  out.push('')
  out.push(
    'Both identities are asserted to the yen, with no tolerance, in `packages/sim/tests/workedExample.test.ts`. The harness additionally refuses to continue if any single scripted step moves cash it cannot name, so an incomplete ledger fails loudly rather than balancing by accident.',
  )
  out.push('')
  return out.join('\n')
}
