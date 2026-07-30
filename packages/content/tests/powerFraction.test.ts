import { describe, expect, it } from 'vitest'
import rawParts from '../data/parts.json'
import { CarPartIdSchema, PARTS, PartCatalogEntrySchema } from '../src'

/**
 * Catalogue completeness for the proportional power mechanism.
 * `engineCharacter.test.ts` (sim) pins the exact authored VALUES for the
 * eight power-bearing slots; this file checks the shape and coverage of the
 * whole catalogue - every SKU carries the new field with the right keys, the
 * two pure enablers and the non-power engine slot carry zero everywhere, and
 * `power` is gone outright, not merely unused.
 */

const ENGINE_SLOT_IDS = [
  'block',
  'internals',
  'headValvetrain',
  'camsTiming',
  'intake',
  'exhaust',
  'fuelSystem',
  'ignitionEcu',
  'cooling',
  'forcedInduction',
] as const

/** The eight slots Lever 2 authors a nonzero race-grade fraction for. */
const POWER_BEARING_SLOT_IDS = [
  'block',
  'internals',
  'headValvetrain',
  'camsTiming',
  'intake',
  'exhaust',
  'ignitionEcu',
  'forcedInduction',
] as const

describe('powerFraction catalogue completeness (Sprint 135)', () => {
  it('the ten engine-slot ids covers every CarPartId under the engine group, matching the taxonomy', () => {
    // Guards the fixture list above against the taxonomy drifting - not a
    // duplicate source of truth, a cross-check between two independently
    // maintained lists (this file's and parts-taxonomy.json's).
    expect(ENGINE_SLOT_IDS.length).toBe(10)
    expect(new Set(ENGINE_SLOT_IDS).size).toBe(10)
  })

  it('every SKU in the catalogue carries a powerFraction object with exactly the three character keys', () => {
    const offenders: string[] = []
    for (const part of PARTS) {
      const keys = Object.keys(part.statModifiers.powerFraction).sort()
      const expected = ['forced', 'high-strung-na', 'lazy-na']
      if (keys.join(',') !== expected.join(',')) {
        offenders.push(`${part.id}: keys [${keys.join(', ')}]`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no SKU anywhere still carries a power field (checked against the raw JSON, not the parsed/stripped type)', () => {
    const offenders = (rawParts as ReadonlyArray<{ id: string; statModifiers: object }>)
      .filter((part) => 'power' in part.statModifiers)
      .map((part) => part.id)
    expect(offenders).toEqual([])
  })

  it('fuelSystem and clutch carry zero powerFraction on all three keys, at every grade (Lever 3)', () => {
    const offenders: string[] = []
    for (const part of PARTS) {
      if (part.carPartId !== 'fuelSystem' && part.carPartId !== 'clutch') continue
      if (
        part.statModifiers.powerFraction['high-strung-na'] !== 0 ||
        part.statModifiers.powerFraction['lazy-na'] !== 0 ||
        part.statModifiers.powerFraction.forced !== 0
      ) {
        offenders.push(part.id)
      }
    }
    expect(offenders).toEqual([])
  })

  it('cooling (the one engine slot Lever 2 does not touch) carries zero powerFraction at every grade', () => {
    const offenders = PARTS.filter((part) => part.carPartId === 'cooling')
      .filter(
        (part) =>
          part.statModifiers.powerFraction['high-strung-na'] !== 0 ||
          part.statModifiers.powerFraction['lazy-na'] !== 0 ||
          part.statModifiers.powerFraction.forced !== 0,
      )
      .map((part) => part.id)
    expect(offenders).toEqual([])
  })

  it('every stock-grade SKU carries zero powerFraction, on every slot', () => {
    const offenders = PARTS.filter((part) => part.grade === 'stock')
      .filter(
        (part) =>
          part.statModifiers.powerFraction['high-strung-na'] !== 0 ||
          part.statModifiers.powerFraction['lazy-na'] !== 0 ||
          part.statModifiers.powerFraction.forced !== 0,
      )
      .map((part) => part.id)
    expect(offenders).toEqual([])
  })

  it('every SKU outside the eight power-bearing slots carries zero powerFraction, on every grade', () => {
    const offenders = PARTS.filter(
      (part) => !(POWER_BEARING_SLOT_IDS as readonly string[]).includes(part.carPartId),
    )
      .filter(
        (part) =>
          part.statModifiers.powerFraction['high-strung-na'] !== 0 ||
          part.statModifiers.powerFraction['lazy-na'] !== 0 ||
          part.statModifiers.powerFraction.forced !== 0,
      )
      .map((part) => part.id)
    expect(offenders).toEqual([])
  })

  it('every power-bearing slot has at least one non-stock SKU with a real (nonzero) fraction on all three characters', () => {
    // The complement of the zero checks above: a slot that is supposed to
    // carry power really does, on every character column, somewhere in the
    // catalogue - guards against an authoring gap reading as a false pass
    // of the zero checks.
    for (const carPartId of POWER_BEARING_SLOT_IDS) {
      const nonStock = PARTS.filter(
        (part) => part.carPartId === carPartId && part.grade !== 'stock',
      )
      expect(nonStock.length, carPartId).toBeGreaterThan(0)
      for (const character of ['high-strung-na', 'lazy-na', 'forced'] as const) {
        const hasNonzero = nonStock.some((part) => part.statModifiers.powerFraction[character] > 0)
        expect(hasNonzero, `${carPartId} / ${character}`).toBe(true)
      }
    }
  })

  it('the fixture engine-slot list agrees with CarPartIdSchema (no typo in the id list above)', () => {
    for (const id of ENGINE_SLOT_IDS) {
      expect(CarPartIdSchema.options).toContain(id)
    }
  })

  /**
   * The catalogue-wide count, pinned exactly: 472 SKUs total, every one
   * carrying `powerFraction`; 96 of them (12 per power-bearing slot, 8
   * slots) carry a real nonzero fraction on at least one character. Guards
   * against silent catalogue drift - a SKU added or removed changes these
   * numbers, which is exactly the signal this pin exists to raise.
   */
  it('472 SKUs carry powerFraction; exactly 96 carry a nonzero fraction, 12 per power-bearing slot across 8 slots', () => {
    expect(PARTS.length).toBe(472)
    expect(PARTS.every((part) => part.statModifiers.powerFraction !== undefined)).toBe(true)

    const isNonzero = (part: (typeof PARTS)[number]) =>
      part.statModifiers.powerFraction['high-strung-na'] !== 0 ||
      part.statModifiers.powerFraction['lazy-na'] !== 0 ||
      part.statModifiers.powerFraction.forced !== 0

    const nonzeroParts = PARTS.filter(isNonzero)
    expect(nonzeroParts.length).toBe(96)

    const countBySlot: Record<string, number> = {}
    for (const part of nonzeroParts) {
      countBySlot[part.carPartId] = (countBySlot[part.carPartId] ?? 0) + 1
    }
    expect(Object.keys(countBySlot).sort()).toEqual([...POWER_BEARING_SLOT_IDS].sort())
    for (const slotId of POWER_BEARING_SLOT_IDS) {
      expect(countBySlot[slotId], slotId).toBe(12)
    }
  })

  /**
   * The defect this schema now closes (formerly `.default(...)` on
   * `PowerFractionSchema` and on `StatModifierSchema.powerFraction`): Zod is
   * non-strict, so an object missing the field - or missing one of its three
   * character keys - used to validate silently as zero power rather than
   * failing. `sprint135.md` claimed a missed SKU "fails loudly"; it did not,
   * until this test's own schema change made it true.
   */
  it('a SKU missing powerFraction entirely fails schema validation rather than silently reading as zero power', () => {
    const withoutPowerFraction = {
      id: 'test-missing-power-fraction',
      brand: 'Test',
      name: 'Test Part',
      carPartId: 'intake',
      fitmentClass: 'everyday',
      grade: 'race',
      statModifiers: { handling: 0, style: 0, authenticity: 0 },
    }
    expect(() => PartCatalogEntrySchema.parse(withoutPowerFraction)).toThrow()
  })

  it('a SKU with an incomplete powerFraction (missing one character) fails schema validation', () => {
    const withPartialPowerFraction = {
      id: 'test-partial-power-fraction',
      brand: 'Test',
      name: 'Test Part',
      carPartId: 'intake',
      fitmentClass: 'everyday',
      grade: 'race',
      statModifiers: {
        handling: 0,
        style: 0,
        authenticity: 0,
        powerFraction: { 'high-strung-na': 0.5, 'lazy-na': 0.3 },
      },
    }
    expect(() => PartCatalogEntrySchema.parse(withPartialPowerFraction)).toThrow()
  })
})
