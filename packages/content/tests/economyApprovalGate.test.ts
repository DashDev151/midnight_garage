import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import economy from '../data/economy.json'
import storyMissions from '../data/storyMissions.json'

/**
 * Economy levers are approval-gated (CLAUDE.md directive 22): every value in
 * economy.json and every mission payout is game design the maintainer owns
 * personally. These pins make a lever movement impossible to land silently:
 * any change turns the suite red until this file is re-pinned, and the
 * re-pin belongs in the same change as the recorded approval of the specific
 * lever and value (sprint doc or economy-bible amendment log).
 */
describe('the economy approval gate', () => {
  it('economy.json matches its approved content exactly', () => {
    const hash = createHash('sha256').update(JSON.stringify(economy)).digest('hex')
    expect(
      hash,
      'economy.json changed. Every lever is approval-gated (CLAUDE.md directive 22): ' +
        're-pin this hash ONLY in the same change as the recorded approval of the ' +
        'specific lever and value.',
    ).toBe('e4a56a9238e3128c461600f806fd3fdd81709e46b3f69d020a711fc9d3f75e57')
  })

  it('mission payouts and budget caps match their approved values exactly', () => {
    const payouts = Object.fromEntries(
      storyMissions.map((mission) => [
        mission.id,
        { payoutYen: mission.payoutYen, budgetCapYen: mission.budgetCapYen },
      ]),
    )
    expect(
      payouts,
      'A mission payout or budget cap changed. These are approval-gated ' +
        '(CLAUDE.md directive 22): re-pin only alongside the recorded approval.',
    ).toEqual({
      'four-wheels': { payoutYen: 145000, budgetCapYen: 145000 },
      'wont-strand-her': { payoutYen: 218000, budgetCapYen: 218000 },
      'first-proper-car': { payoutYen: 534000, budgetCapYen: 534000 },
      'make-it-pull': { payoutYen: 892000, budgetCapYen: 892000 },
      'the-column-clock': { payoutYen: 1557000, budgetCapYen: 1557000 },
      'low-and-loud': { payoutYen: 1763000, budgetCapYen: 1763000 },
      'street-power-street-manners': { payoutYen: 1623000, budgetCapYen: 1623000 },
      'under-one-fifteen': { payoutYen: 3681000, budgetCapYen: 3681000 },
      'the-fleet-spare': { payoutYen: 350000, budgetCapYen: 350000 },
      'the-showroom-standard': { payoutYen: 1200000, budgetCapYen: 1200000 },
    })
  })
})
