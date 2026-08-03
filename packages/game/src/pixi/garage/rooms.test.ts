import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OFFICE_COUNTS,
  MAX_CERTIFICATE_STAMPS,
  MAX_LISTING_CARDS,
  MAX_PHOTO_STAMPS,
  officeCardPositions,
  officeCertificatePositions,
  officePhotoPositions,
} from './rooms'

/**
 * The office scene's stamping maths - how many card/photo/certificate
 * positions a given count produces, and the clamp at both ends - without
 * touching Pixi or the DOM: `buildOfficeScene` itself needs a real canvas
 * and is exercised only by eye, per `README.md`'s own account of how this
 * art was built.
 */
describe('officeCardPositions', () => {
  it('draws nothing for a shop with no cars listed', () => {
    expect(officeCardPositions(0)).toEqual([])
  })

  it('draws exactly one position per car for a normal count', () => {
    expect(officeCardPositions(5)).toHaveLength(5)
    expect(officeCardPositions(DEFAULT_OFFICE_COUNTS.listings)).toHaveLength(
      DEFAULT_OFFICE_COUNTS.listings,
    )
  })

  it('clamps at the board capacity rather than overflowing it', () => {
    expect(officeCardPositions(MAX_LISTING_CARDS)).toHaveLength(MAX_LISTING_CARDS)
    expect(officeCardPositions(MAX_LISTING_CARDS + 50)).toHaveLength(MAX_LISTING_CARDS)
  })

  it('never returns a negative count for a negative input', () => {
    expect(officeCardPositions(-3)).toEqual([])
  })

  it('gives every card its own centre, none repeated', () => {
    const positions = officeCardPositions(MAX_LISTING_CARDS)
    const unique = new Set(positions.map(([x, y]) => `${x},${y}`))
    expect(unique.size).toBe(MAX_LISTING_CARDS)
  })
})

describe('officePhotoPositions', () => {
  it('matches the new-shop starting count of three curling snapshots', () => {
    expect(officePhotoPositions(DEFAULT_OFFICE_COUNTS.photos)).toHaveLength(3)
  })

  it('clamps at the top reputation tier own photo count', () => {
    expect(officePhotoPositions(MAX_PHOTO_STAMPS)).toHaveLength(MAX_PHOTO_STAMPS)
    expect(officePhotoPositions(MAX_PHOTO_STAMPS + 10)).toHaveLength(MAX_PHOTO_STAMPS)
  })
})

describe('officeCertificatePositions', () => {
  it('draws no frames when nothing has been earned yet', () => {
    expect(officeCertificatePositions(0)).toEqual([])
  })

  it('clamps at the wall frame capacity', () => {
    expect(officeCertificatePositions(MAX_CERTIFICATE_STAMPS)).toHaveLength(MAX_CERTIFICATE_STAMPS)
    expect(officeCertificatePositions(MAX_CERTIFICATE_STAMPS + 4)).toHaveLength(
      MAX_CERTIFICATE_STAMPS,
    )
  })

  it('keeps an earlier stamp slot as the count grows', () => {
    const twoEarned = officeCertificatePositions(2)
    const threeEarned = officeCertificatePositions(3)
    expect(threeEarned.slice(0, 2)).toEqual(twoEarned)
  })
})
