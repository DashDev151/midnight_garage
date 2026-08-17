import { ECONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { auctionCadencePhraseFor } from './auctionTierLabels'

/**
 * `auctionCadencePhraseFor` reads straight off the shipped `cadenceByTier`
 * content (sprint209.md task A3: local M/W/F, regional Tu/Th, premium Fri,
 * collector-network alternate Fri) - these pin the real, shipped phrasing so
 * a future cadence retune is caught here rather than only in a screen
 * snapshot.
 */
describe('auctionCadencePhraseFor', () => {
  it('names every open day for a weekly room', () => {
    expect(auctionCadencePhraseFor('local-yard', ECONOMY)).toBe('Open Monday, Wednesday, Friday.')
    expect(auctionCadencePhraseFor('regional', ECONOMY)).toBe('Open Tuesday, Thursday.')
    expect(auctionCadencePhraseFor('premium', ECONOMY)).toBe('Open Friday.')
  })

  it('names a fortnightly room as alternate weeks, not every week', () => {
    expect(auctionCadencePhraseFor('collector-network', ECONOMY)).toBe(
      'Open Friday, alternate weeks.',
    )
  })
})
