import { PAINT_COLOURS } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { PAINT_FINISHES, hexToHsl, hslToHex, rampFor, type PaintFinish } from './paintRamp'

const BLACK = '#16171a'
const WHITE = '#f2f2ef'
const IVORY = '#f0ead8'
const BEIGE = '#cdbb9c'
const RED = '#c8202a'

/**
 * The two multi-layer pearls' fixed highlight hue. `paintColours.json` does
 * not carry it (hand-cut ramps beyond the base hex are art work, not
 * content), so `rampFor`'s optional override is exercised here with the
 * same degrees the consolidated research assigns each colour's flake.
 */
const SHIFTED_HIGHLIGHT_HUES: Record<string, number> = {
  'purple-shift-green': 90,
  'purple-shift-gold': 45,
}

function colour(id: string): { hex: string; highlightHue?: number } {
  const entry = PAINT_COLOURS.find((c) => c.id === id)
  if (!entry) throw new Error(`no palette colour ${id}`)
  return { hex: entry.hex, highlightHue: SHIFTED_HIGHLIGHT_HUES[id] }
}

describe('hex and HSL round trip', () => {
  it('returns a colour within a channel step of where it started', () => {
    for (const entry of PAINT_COLOURS) {
      const back = hslToHex(hexToHsl(entry.hex))
      for (let i = 1; i < 7; i += 2) {
        const before = parseInt(entry.hex.slice(i, i + 2), 16)
        const after = parseInt(back.slice(i, i + 2), 16)
        expect(Math.abs(before - after)).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('rampFor', () => {
  it('orders every palette colour dark to light in every finish', () => {
    for (const entry of PAINT_COLOURS) {
      for (const finish of PAINT_FINISHES) {
        const ramp = rampFor(entry.hex, finish, { highlightHue: SHIFTED_HIGHLIGHT_HUES[entry.id] })
        const shade = hexToHsl(ramp.shade).l
        const base = hexToHsl(ramp.base).l
        const highlight = hexToHsl(ramp.highlight).l
        expect(shade, `${entry.id} ${finish} shade`).toBeLessThan(base)
        expect(highlight, `${entry.id} ${finish} highlight`).toBeGreaterThan(base)
      }
    }
  })

  it('separates all three tones on every palette colour', () => {
    for (const entry of PAINT_COLOURS) {
      for (const finish of PAINT_FINISHES) {
        const ramp = rampFor(entry.hex, finish, { highlightHue: SHIFTED_HIGHLIGHT_HUES[entry.id] })
        expect(new Set([ramp.shade, ramp.base, ramp.highlight]).size).toBe(3)
      }
    }
  })

  it('widens the spread from solid through metallic to pearl', () => {
    const spread = (finish: PaintFinish): number =>
      hexToHsl(rampFor(RED, finish).highlight).l - hexToHsl(rampFor(RED, finish).shade).l
    expect(spread('metallic')).toBeGreaterThan(spread('solid'))
    expect(spread('pearl')).toBeGreaterThan(spread('metallic'))
  })

  // The dark edge case. A fixed lift on a near-black base yields a mid grey
  // panel that reads as a different colour, so the lift is bounded by the base
  // and the highlight keeps the base's cast instead of washing out.
  it('keeps black highlighting as black rather than as grey', () => {
    for (const finish of PAINT_FINISHES) {
      const ramp = rampFor(BLACK, finish)
      const base = hexToHsl(ramp.base)
      const highlight = hexToHsl(ramp.highlight)
      expect(highlight.l, `${finish} highlight lightness`).toBeLessThan(30)
      expect(highlight.s, `${finish} highlight saturation`).toBeGreaterThanOrEqual(base.s * 0.9)
      expect(hexToHsl(ramp.shade).l).toBeGreaterThan(0)
    }
  })

  // The light edge case, and the palette states it outright: Championship White
  // must never read as beige. A very light base sheds most of its cast on the
  // way down, so the shade darkens without picking up a colour of its own.
  it('sheds the cast on a white or ivory shade', () => {
    for (const hex of [WHITE, IVORY]) {
      for (const finish of PAINT_FINISHES) {
        const shade = hexToHsl(rampFor(hex, finish).shade)
        expect(shade.s, `${hex} ${finish} saturation`).toBeLessThan(hexToHsl(hex).s * 0.55)
      }
    }
  })

  // `white-ivory` and `beige` are one of the palette's closest pairs and only
  // about eighteen lightness points apart, so the pair has to survive tone by
  // tone: an ivory car's shaded panels must stay clear of a beige car's.
  it('keeps the ivory ramp clear of the beige ramp', () => {
    for (const finish of PAINT_FINISHES) {
      const ivory = rampFor(IVORY, finish)
      const beige = rampFor(BEIGE, finish)
      for (const tone of ['shade', 'base'] as const) {
        expect(hexToHsl(ivory[tone]).l, `${finish} ${tone}`).toBeGreaterThan(
          hexToHsl(beige[tone]).l + 10,
        )
      }
      // The two highlights converge and are meant to: a highlight is bounded by
      // the room above its base, so the lighter the colour the closer its
      // highlight sits to white. The pair is told apart on base and shade.
      expect(hexToHsl(ivory.highlight).l, `${finish} highlight`).toBeGreaterThan(
        hexToHsl(beige.highlight).l,
      )
    }
  })

  it('rotates a pearl highlight off the base hue and leaves a solid one on it', () => {
    const base = hexToHsl(RED).h
    expect(hexToHsl(rampFor(RED, 'solid').highlight).h).toBeCloseTo(base, 0)
    const pearl = hexToHsl(rampFor(RED, 'pearl').highlight).h
    expect(((pearl - base + 540) % 360) - 180).toBeGreaterThan(10)
  })

  it('gives each shifting purple its own highlight hue', () => {
    const green = colour('purple-shift-green')
    const gold = colour('purple-shift-gold')
    const greenHue = hexToHsl(
      rampFor(green.hex, 'pearl', { highlightHue: green.highlightHue }).highlight,
    ).h
    const goldHue = hexToHsl(
      rampFor(gold.hex, 'pearl', { highlightHue: gold.highlightHue }).highlight,
    ).h
    // Read back through 8-bit hex, so a degree of quantisation is expected.
    expect(Math.abs(greenHue - 90)).toBeLessThan(1.5)
    expect(Math.abs(goldHue - 45)).toBeLessThan(1.5)
    // Worth shifting only if the shifted tone carries its own colour.
    expect(hexToHsl(rampFor(green.hex, 'pearl', { highlightHue: 90 }).highlight).s).toBeGreaterThan(
      hexToHsl(green.hex).s,
    )
  })
})
