import { ECONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { formatAuthenticityCost, formatReliabilityCost } from './machiningFigures'

/**
 * An operation's costs are authored as fractions of a point, so the wording has
 * to carry a fraction without padding it out, and has to treat nothing as
 * nothing rather than as a penalty of zero.
 */
describe('how the shop states what an operation costs', () => {
  it('states an originality cost to the precision it carries', () => {
    expect(formatAuthenticityCost(0.25)).toBe('-0.25')
    expect(formatAuthenticityCost(0.7)).toBe('-0.7')
    expect(formatAuthenticityCost(1)).toBe('-1')
  })

  it('calls a cost of nothing nothing, never a penalty of zero', () => {
    expect(formatAuthenticityCost(0)).toBe('nothing')
    expect(formatAuthenticityCost(0)).not.toBe('-0')
  })

  it('rounds off floating-point noise rather than printing it', () => {
    expect(formatAuthenticityCost(0.1 + 0.2)).toBe('-0.3')
  })

  it('renders every authored cost as a plain fraction or as nothing at all', () => {
    for (const operation of ECONOMY.machining.operations) {
      expect(formatAuthenticityCost(operation.authenticityCost), operation.id).toMatch(
        /^(nothing|-\d+(\.\d{1,2})?)$/,
      )
    }
  })

  it('states a reliability cost as a percentage, to the one decimal it needs', () => {
    expect(formatReliabilityCost(0.004)).toBe('-0.4 per cent')
    expect(formatReliabilityCost(0.05)).toBe('-5.0 per cent')
  })
})
