import { BUYERS, CARS, COURSES, ECONOMY, PARTS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { driveParamsForInstance, driveSetupFor } from '../src/drive/instance'
import { lapTimeSecondsFor } from '../src/lapModel'
import { buildCarInstance, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const CIVIC = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!

describe('instance-aware drive setup', () => {
  it('matches the lap board time for the same instance and refuses undrivable cars', () => {
    const car = buildCarInstance({ modelId: CIVIC.id })
    const setup = driveSetupFor(car, CIVIC, CONTEXT, 'hakone')
    expect(setup).not.toBeNull()
    // The target the driving player chases is exactly the board's own figure
    // for this instance (the board rounds to a tenth).
    const board = lapTimeSecondsFor(car, CIVIC, CONTEXT, 'hakone')
    expect(Math.abs(setup!.modelLapS! - board!)).toBeLessThan(0.06)
    expect(setup!.params.vMaxMs).toBeGreaterThan(30)

    // A scrap-banded disabling part means no lap and no driving: the same
    // gate as the test track.
    const disabling = CONTEXT.partsTaxonomy.find((e) => e.scrapDisablesCar)!
    const parts = mintCarParts()
    const entry = parts[disabling.id].installed!
    parts[disabling.id] = { installed: { ...entry, band: 'scrap' } }
    const stripped = buildCarInstance({ modelId: CIVIC.id, parts })
    expect(driveSetupFor(stripped, CIVIC, CONTEXT, 'hakone')).toBeNull()
    expect(driveSetupFor(car, CIVIC, CONTEXT, 'nowhere')).toBeNull()

    // The endless mode's params-only route: same figures, same gate.
    const only = driveParamsForInstance(car, CIVIC, CONTEXT)
    expect(only!.vMaxMs).toBeCloseTo(setup!.params.vMaxMs, 6)
    expect(driveParamsForInstance(stripped, CIVIC, CONTEXT)).toBeNull()
  })
})
