import { describe, expect, it } from 'vitest'
import { addressesOverlap, sameAddress } from './partAddress'

describe('partAddress', () => {
  describe('addressesOverlap', () => {
    it('is false for different groups', () => {
      expect(addressesOverlap({ componentId: 'engine' }, { componentId: 'body' })).toBe(false)
    })

    it('is true for two group-level addresses on the same group', () => {
      expect(addressesOverlap({ componentId: 'engine' }, { componentId: 'engine' })).toBe(true)
    })

    it('is true when a group-level address meets a part-level one in the same group', () => {
      expect(
        addressesOverlap({ componentId: 'engine' }, { componentId: 'engine', carPartId: 'intake' }),
      ).toBe(true)
      expect(
        addressesOverlap({ componentId: 'engine', carPartId: 'intake' }, { componentId: 'engine' }),
      ).toBe(true)
    })

    it('is true for the same specific part, false for two different parts in the same group', () => {
      expect(
        addressesOverlap(
          { componentId: 'engine', carPartId: 'intake' },
          { componentId: 'engine', carPartId: 'intake' },
        ),
      ).toBe(true)
      expect(
        addressesOverlap(
          { componentId: 'engine', carPartId: 'intake' },
          { componentId: 'engine', carPartId: 'exhaust' },
        ),
      ).toBe(false)
    })
  })

  describe('sameAddress', () => {
    it('matches two group-level addresses on the same group', () => {
      expect(sameAddress({ componentId: 'engine' }, { componentId: 'engine' })).toBe(true)
    })

    it('does not match a group-level address against a part-level one, even overlapping', () => {
      expect(
        sameAddress({ componentId: 'engine' }, { componentId: 'engine', carPartId: 'intake' }),
      ).toBe(false)
    })

    it('matches only the exact same part', () => {
      expect(
        sameAddress(
          { componentId: 'engine', carPartId: 'intake' },
          { componentId: 'engine', carPartId: 'intake' },
        ),
      ).toBe(true)
      expect(
        sameAddress(
          { componentId: 'engine', carPartId: 'intake' },
          { componentId: 'engine', carPartId: 'exhaust' },
        ),
      ).toBe(false)
    })
  })
})
