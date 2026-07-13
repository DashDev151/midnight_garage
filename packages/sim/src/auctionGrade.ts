import type { CarInstance, CarModel, CarPartId, ComponentId } from '@midnight-garage/content'
import { bandIndex, isPartMissing } from './bands'

/**
 * Sprint 50: a real-world Japanese-used-car-auction-style condition summary,
 * computed purely from the car's EXISTING band state (never a new mechanic -
 * the 5-band repair/value model in bands.ts is untouched). Display-only:
 * feeds the auction screen's condition-report replacement, nothing else
 * reads it.
 *
 * The 6 component groups partition cleanly across the three readings below
 * so nothing is counted twice: `overall` reads ONLY the mechanical groups
 * (engine/drivetrain/suspension) - a real auction's headline grade tracks
 * age/mechanical condition, not cosmetics, which the two letter grades
 * already cover. `exterior`/`interior` read the remaining three groups
 * (body+wheels, interior) and never move the overall number.
 */
export type OverallAuctionGrade = 'S' | '6' | '5' | '4.5' | '4' | '3.5' | '3' | '2' | '1' | 'R'
export type LetterAuctionGrade = 'A' | 'B' | 'C' | 'D' | 'E'

export interface AuctionGrade {
  overall: OverallAuctionGrade
  exterior: LetterAuctionGrade
  interior: LetterAuctionGrade
}

const MECHANICAL_GROUPS: readonly ComponentId[] = ['engine', 'drivetrain', 'suspension']
const EXTERIOR_GROUPS: readonly ComponentId[] = ['body', 'wheels']
const INTERIOR_GROUPS: readonly ComponentId[] = ['interior']

/** mint(4) -> A ... scrap(0) -> E - a direct 1:1 readout, no new tunables. */
const LETTER_BY_BAND_INDEX: readonly LetterAuctionGrade[] = ['E', 'D', 'C', 'B', 'A']

/** Overall grade steps, checked top-down against the mechanical groups'
 * average band index (0 = every mechanical part scrap-equivalent, 4 = every
 * mechanical part mint). Reaching `S` requires a near-perfect car, matching
 * how rare a real S-grade actually is. */
const OVERALL_GRADE_STEPS: readonly [minAverage: number, grade: OverallAuctionGrade][] = [
  [3.9, 'S'],
  [3.6, '6'],
  [3.2, '5'],
  [2.8, '4.5'],
  [2.4, '4'],
  [2.0, '3.5'],
  [1.5, '3'],
  [1.0, '2'],
]

function overallGradeFromAverage(average: number): OverallAuctionGrade {
  for (const [minAverage, grade] of OVERALL_GRADE_STEPS) {
    if (average >= minAverage) return grade
  }
  return '1'
}

/** Worst-band-index reading (0..4) across `groups`, treating a genuinely
 * missing part as worse than scrap-equivalent (0) and a legitimately-absent
 * slot (e.g. forced induction on an NA car) as never counting at all -
 * mirrors `worstRepairableBandInGroup`'s present/missing/absent handling
 * (bands.ts), just aggregated across several groups instead of one. Defaults
 * to `mint` (index 4) when every part in `groups` is legitimately absent. */
function worstBandIndexIn(
  car: CarInstance,
  model: CarModel,
  groups: readonly ComponentId[],
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
): number {
  let worst = bandIndex('mint')
  for (const groupId of groups) {
    for (const partId of partIdsByGroup[groupId]) {
      const installed = car.parts[partId].installed
      let index: number
      if (!installed) {
        if (!isPartMissing(car, model, partId)) continue // legitimately absent - never counts
        index = bandIndex('scrap')
      } else {
        index = bandIndex(installed.band)
      }
      if (index < worst) worst = index
    }
  }
  return worst
}

export function computeAuctionGrade(
  car: CarInstance,
  model: CarModel,
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
): AuctionGrade {
  let hasStructuralDefect = false
  let sum = 0
  let count = 0
  for (const groupId of MECHANICAL_GROUPS) {
    for (const partId of partIdsByGroup[groupId]) {
      const installed = car.parts[partId].installed
      let index: number
      if (!installed) {
        if (!isPartMissing(car, model, partId)) continue
        hasStructuralDefect = true
        index = bandIndex('scrap')
      } else {
        index = bandIndex(installed.band)
        if (installed.band === 'scrap') hasStructuralDefect = true
      }
      sum += index
      count += 1
    }
  }
  const average = count > 0 ? sum / count : bandIndex('mint')

  const exteriorIndex = worstBandIndexIn(car, model, EXTERIOR_GROUPS, partIdsByGroup)
  const interiorIndex = worstBandIndexIn(car, model, INTERIOR_GROUPS, partIdsByGroup)

  return {
    overall: hasStructuralDefect ? 'R' : overallGradeFromAverage(average),
    exterior: LETTER_BY_BAND_INDEX[exteriorIndex]!,
    interior: LETTER_BY_BAND_INDEX[interiorIndex]!,
  }
}
