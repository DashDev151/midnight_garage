import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type ConditionBand,
  type ZoneState,
  type ZoneStates,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance } from '../src/auctions'
import { bandIndex } from '../src/bands'
import { ALL_ZONE_IDS, PANEL_ZONE_IDS, derivePaintBand } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import { createRng, hashStringToSeed } from '../src/rng'

/**
 * `derivePaintBand`'s colour-mismatch penalty (docs/sprints/sprint164.md).
 * Panels that disagree about their colour read one band WORSE than the finish
 * alone says, with `scrap` as the floor. The penalty is a step along an
 * ordered ladder, so it has a sign, and every rung is asserted in both
 * directions to keep that sign from inverting unseen.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const GAME_YEAR = 1995

/** Finish severity to the band it reads unpenalised, the mapping
 * `bandForSeverity` holds. Severity 4 is one rung past what `ZoneState.finish`
 * accepts and is listed so the ladder's bottom rung is covered as an INPUT:
 * the floor has to hold for a band the function is total over, not merely for
 * the bands today's schema can feed it. */
const BAND_BY_FINISH: readonly ConditionBand[] = ['mint', 'fine', 'worn', 'poor', 'scrap']

/** What each rung reads once a mismatch applies. `scrap` maps to itself: two
 * colours cannot leave a car worse than the worst band there is. */
const ONE_RUNG_WORSE: Readonly<Record<ConditionBand, ConditionBand>> = {
  mint: 'fine',
  fine: 'worn',
  worn: 'poor',
  poor: 'scrap',
  scrap: 'scrap',
}

function zone(overrides: Partial<ZoneState> = {}): ZoneState {
  return { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false, ...overrides }
}

/**
 * Every panel zone at `finish`, over a clean chassis (which `derivePaintBand`
 * never reads). `colours` is dealt to the leading zones in order, so no entry
 * is a bare car, one entry is a car settled on a single shade, and two is a
 * disagreement.
 */
function paintedZones(finish: number, colours: readonly string[] = []): ZoneStates {
  const states = {} as Record<string, ZoneState>
  PANEL_ZONE_IDS.forEach((zoneId, index) => {
    states[zoneId] = zone({ finish, colour: colours[index] })
  })
  states.chassis = zone()
  return states as ZoneStates
}

describe('the paint band reads the worst finish when the panels agree', () => {
  it('maps every finish severity to its own rung, on a bare car', () => {
    BAND_BY_FINISH.forEach((expected, finish) => {
      expect(derivePaintBand(paintedZones(finish)), `finish ${finish}`).toBe(expected)
    })
  })

  it('leaves every rung alone when the whole car wears one shade', () => {
    const oneShade = ['kaido-blue', 'kaido-blue', 'kaido-blue', 'kaido-blue', 'kaido-blue']
    BAND_BY_FINISH.forEach((expected, finish) => {
      expect(derivePaintBand(paintedZones(finish, oneShade)), `finish ${finish}`).toBe(expected)
    })
  })

  it('leaves every rung alone when only one zone is painted at all', () => {
    // An unpainted zone has no colour to disagree with, so a single resprayed
    // panel on an otherwise bare shell is not yet a two-tone car.
    BAND_BY_FINISH.forEach((expected, finish) => {
      expect(derivePaintBand(paintedZones(finish, ['kaido-blue'])), `finish ${finish}`).toBe(
        expected,
      )
    })
  })
})

describe('a colour disagreement steps the paint band one rung worse', () => {
  const twoTone = ['kaido-blue', 'wangan-silver']

  it('steps every rung down exactly one, and never up', () => {
    BAND_BY_FINISH.forEach((clean, finish) => {
      const penalised = derivePaintBand(paintedZones(finish, twoTone))
      expect(penalised, `finish ${finish}`).toBe(ONE_RUNG_WORSE[clean])
      expect(bandIndex(penalised), `finish ${finish} moved towards mint`).toBeLessThanOrEqual(
        bandIndex(clean),
      )
    })
  })

  it('takes a mint car to fine, not to scrap', () => {
    // The boundary an index walked the wrong way got most wrong: stepping
    // towards mint fell off the top of the ladder and landed on the bottom.
    expect(derivePaintBand(paintedZones(0))).toBe('mint')
    expect(derivePaintBand(paintedZones(0, twoTone))).toBe('fine')
  })

  it('leaves a scrap car at scrap, rather than improving it', () => {
    // The other end of the same walk: a penalty must never be a promotion.
    expect(derivePaintBand(paintedZones(4))).toBe('scrap')
    expect(derivePaintBand(paintedZones(4, twoTone))).toBe('scrap')
  })

  it('counts distinct shades rather than painted zones', () => {
    // Three zones, two shades, is still one disagreement and one rung.
    const threePainted = ['kaido-blue', 'kaido-blue', 'wangan-silver']
    expect(derivePaintBand(paintedZones(1, threePainted))).toBe('worn')
  })
})

describe('who the penalty can actually reach', () => {
  it('reads a generated car through its own factoryColour: an honest respray never mismatches, and only the rolled anti-clown states ever cost a band', () => {
    // Generation now rolls a real colour per zone (paintGeneration.test.ts
    // covers the roll itself in depth); this file's own concern is that
    // `derivePaintBand`, fed the car's `factoryColour`, reads every one of
    // those rolled outcomes correctly - never penalising a car still in its
    // own colours (single or two-tone) or a uniform respray, and always
    // penalising the one-zone anti-clown states.
    let cars = 0
    let sawPenalty = 0
    for (const model of CARS) {
      for (let seed = 0; seed < 20; seed++) {
        const key = `paint-mismatch-${model.id}-${seed}`
        const car = generateAuctionCarInstance(
          model,
          key,
          createRng(hashStringToSeed(key)),
          CONTEXT,
          GAME_YEAR,
        )
        const states = car.zoneState!
        const cleanBand = derivePaintBand(
          Object.fromEntries(
            ALL_ZONE_IDS.map((zoneId) => [
              zoneId,
              { ...states[zoneId], colour: undefined, primed: false },
            ]),
          ) as ZoneStates,
        )
        const realBand = derivePaintBand(states, car.factoryColour)
        expect(bandIndex(realBand), `${model.id} seed ${seed}`).toBeLessThanOrEqual(
          bandIndex(cleanBand),
        )
        if (realBand !== cleanBand) sawPenalty += 1
        cars += 1
      }
    }
    expect(cars).toBeGreaterThan(0)
    expect(sawPenalty, 'a mismatched or primed panel should turn up somewhere').toBeGreaterThan(0)
  })
})

describe('the factory scheme is a set, not an arrangement (two-tone)', () => {
  const whiteBlack = ['white', 'black', 'white', 'black', 'white']

  it('does not penalise a car whose zones split across its own two factory colours', () => {
    for (const finish of BAND_BY_FINISH.keys()) {
      const clean = derivePaintBand(paintedZones(finish))
      const twoTone = derivePaintBand(paintedZones(finish, whiteBlack), 'white+black')
      expect(twoTone, `finish ${finish}`).toBe(clean)
    }
  })

  it('still penalises the same car once a third colour lands on a zone', () => {
    const withIntruder = ['white', 'black', 'white', 'black', 'kaido-blue']
    for (const finish of BAND_BY_FINISH.keys()) {
      const clean = derivePaintBand(paintedZones(finish))
      const penalised = derivePaintBand(paintedZones(finish, withIntruder), 'white+black')
      expect(penalised, `finish ${finish}`).toBe(ONE_RUNG_WORSE[clean])
    }
  })

  it("a single-colour car's factory set has one member, so an off-scheme zone still mismatches", () => {
    const penalised = derivePaintBand(paintedZones(0, ['white', 'kaido-blue']), 'white')
    expect(penalised).toBe('fine')
  })

  it('reads a plain single factory colour exactly as before - passing it changes nothing', () => {
    const oneShade = ['kaido-blue', 'kaido-blue', 'kaido-blue', 'kaido-blue', 'kaido-blue']
    for (const finish of BAND_BY_FINISH.keys()) {
      expect(derivePaintBand(paintedZones(finish, oneShade), 'kaido-blue')).toBe(
        derivePaintBand(paintedZones(finish, oneShade)),
      )
    }
  })
})
