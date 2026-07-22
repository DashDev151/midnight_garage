import type { CarInstance, CarModel, ComponentId } from '@midnight-garage/content'
import { bandIndex, carCostToMintYen, isPartMissing } from './bands'
import type { SimContext } from './context'

/**
 * The auction card's four-stamp condition read: one OVERALL number (how big
 * the visible restoration project is, priced against the model it sits on)
 * plus three area letters (where the wear actually lives). Display-only,
 * computed purely from the car's own band state - never a second condition
 * mechanic. Callers pass the APPARENT car (`apparentViewOf`); this function
 * never applies that view itself, so a hidden symptom never leaks through
 * the grade.
 *
 * OVERALL prices `carCostToMintYen` against `model.bookValueYen`: the same
 * bill in yen weighs more on a cheap car than an expensive one, so a trashed
 * interior barely dents a collector car's overall while it craters a kei's -
 * the letters below carry the state, the overall carries the cost.
 *
 * The 'R' override is the visible-corpse flag: a scrap or genuinely missing
 * MECHANICAL part (engine, drivetrain, or suspension) reads as a car nobody
 * should drive home, regardless of what the ratio table would otherwise say.
 * Real auction R means accident history, not this - kept as a donor-car
 * shorthand rather than a literal claim.
 *
 * Mileage and market heat never enter this grade: it reads the metal in
 * front of the bidder, not what the market currently thinks that metal is
 * worth.
 */
export type OverallAuctionGrade = 'S' | '6' | '5' | '4.5' | '4' | '3.5' | '3' | '2' | '1' | 'R'
export type LetterAuctionGrade = 'A' | 'B' | 'C' | 'D' | 'E'

export interface AuctionGrade {
  overall: OverallAuctionGrade
  mechanical: LetterAuctionGrade
  exterior: LetterAuctionGrade
  interior: LetterAuctionGrade
}

const MECHANICAL_GROUPS: readonly ComponentId[] = ['engine', 'drivetrain', 'suspension']
const EXTERIOR_GROUPS: readonly ComponentId[] = ['body', 'wheels']
const INTERIOR_GROUPS: readonly ComponentId[] = ['interior']

/** mint(4) -> A ... scrap(0) -> E: a direct readout of `bandIndex`, no tunables. */
const LETTER_BY_BAND_INDEX: readonly LetterAuctionGrade[] = ['E', 'D', 'C', 'B', 'A']

/**
 * One area's condition impression: the average band index over every
 * present-or-genuinely-missing part in `groups` (a legitimately-absent slot,
 * e.g. forced induction on a naturally-aspirated model, never counts either
 * way), and whether any counted part is scrap or genuinely missing at all -
 * the step-down trigger below. `count` zero (every slot in the area
 * legitimately absent) defaults the average to mint and the flag to false,
 * which is exactly "an all-absent area reads A."
 */
interface AreaReading {
  averageBandIndex: number
  hasWreckage: boolean
  count: number
}

function areaReadingFor(
  car: CarInstance,
  model: CarModel,
  groups: readonly ComponentId[],
  partIdsByGroup: SimContext['partIdsByGroup'],
): AreaReading {
  let sum = 0
  let count = 0
  let hasWreckage = false
  for (const groupId of groups) {
    for (const partId of partIdsByGroup[groupId]) {
      const installed = car.parts[partId].installed
      let index: number
      if (!installed) {
        if (!isPartMissing(car, model, partId)) continue // legitimately absent - never counts
        index = bandIndex('scrap')
        hasWreckage = true
      } else {
        index = bandIndex(installed.band)
        if (installed.band === 'scrap') hasWreckage = true
      }
      sum += index
      count += 1
    }
  }
  return { averageBandIndex: count > 0 ? sum / count : bandIndex('mint'), hasWreckage, count }
}

/**
 * The area's average band index, rounded to the nearest letter, then stepped
 * down one letter (floored at 'E') when the area carries any scrap or
 * genuinely missing part - so two areas can share a middling average and
 * still read differently once one of them is actually wrecked rather than
 * merely worn all over.
 */
function letterFor(reading: AreaReading): LetterAuctionGrade {
  const roundedIndex = Math.round(reading.averageBandIndex)
  const steppedIndex = reading.hasWreckage ? Math.max(0, roundedIndex - 1) : roundedIndex
  return LETTER_BY_BAND_INDEX[steppedIndex]!
}

/**
 * Walks `overallRatioSteps` top-down for the first step whose `maxRatio`
 * covers `ratio`, falling through to '1' when the bill outruns every listed
 * step - the same "first match wins, else the floor" shape the content
 * schema's own doc comment describes.
 */
function overallGradeForRatio(
  ratio: number,
  overallRatioSteps: SimContext['economy']['auctionGrading']['overallRatioSteps'],
): OverallAuctionGrade {
  for (const step of overallRatioSteps) {
    if (step.maxRatio >= ratio) return step.grade
  }
  return '1'
}

export function computeAuctionGrade(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
): AuctionGrade {
  const mechanical = areaReadingFor(car, model, MECHANICAL_GROUPS, context.partIdsByGroup)
  const exterior = areaReadingFor(car, model, EXTERIOR_GROUPS, context.partIdsByGroup)
  const interior = areaReadingFor(car, model, INTERIOR_GROUPS, context.partIdsByGroup)

  const letters = {
    mechanical: letterFor(mechanical),
    exterior: letterFor(exterior),
    interior: letterFor(interior),
  }

  if (mechanical.hasWreckage) {
    return { overall: 'R', ...letters }
  }

  const billYen = carCostToMintYen(
    car,
    model,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const ratio = billYen / model.bookValueYen
  return {
    overall: overallGradeForRatio(ratio, context.economy.auctionGrading.overallRatioSteps),
    ...letters,
  }
}
