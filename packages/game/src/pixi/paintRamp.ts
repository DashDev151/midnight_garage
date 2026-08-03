/**
 * FOUR-TONE PAINT RAMPS.
 *
 * A body sprite is drawn through an indexed ramp (`carSprite.ts`): outline,
 * base, shade, highlight. A paint colour supplies three of those four, and this
 * module is the one place that decides them. The outline belongs to the drawing
 * rather than to the paint, so it is not derived here.
 *
 * The rule works in HSL because a finish is a statement about lightness spread,
 * about saturation and about hue cast, none of which is expressible by nudging
 * RGB channels. The three finishes differ in the SHAPE of the ramp:
 *
 * - solid: a modest even spread, both tones slightly desaturated. Flat paint
 *   has a soft falloff and no cast of its own.
 * - metallic: a wider spread, the shade darker and slightly cooler and the
 *   highlight brighter, cooler and washed out, because flake catches light hard.
 * - pearl: the widest highlight, and its hue is ROTATED rather than only lifted.
 *   Pearl paint has a colour cast in the light: red flashes gold, blue flashes
 *   violet, purple flashes pink (the consolidated palette's own description of
 *   Deep Purple, "pinkish-violet highlights", is that rotation).
 *
 * Nothing here is authored content: it derives a rendering ramp from a
 * palette base tone. Used by the paint palette dev screen and by any future
 * in-game paint preview.
 */

export const PAINT_FINISHES = ['solid', 'metallic', 'pearl'] as const
export type PaintFinish = (typeof PAINT_FINISHES)[number]

/** Hue in degrees, saturation and lightness in per cent. */
export interface Hsl {
  h: number
  s: number
  l: number
}

/** The three tones a paint colour contributes to the body ramp. */
export interface Ramp {
  base: string
  shade: string
  highlight: string
}

export interface RampOptions {
  /**
   * An absolute hue for the highlight, in degrees, replacing whatever the
   * finish would have computed. The two multi-layer pearls use it: their
   * highlight is a different colour rather than a lit version of the base.
   */
  highlightHue?: number
}

interface FinishRule {
  /** Lightness points the shade drops at mid lightness. */
  shadeDrop: number
  /** What the shade keeps of the base saturation. */
  shadeSat: number
  /** Degrees the shade rotates toward blue. */
  shadeCool: number
  /** Lightness points the highlight lifts at mid lightness. */
  highlightLift: number
  /** What the highlight keeps of the base saturation. */
  highlightSat: number
  /** Degrees the highlight rotates toward blue. */
  highlightCool: number
  /** Degrees the highlight rotates around the wheel, the pearl cast. */
  highlightHueShift: number
}

const FINISH_RULES: Record<PaintFinish, FinishRule> = {
  solid: {
    shadeDrop: 13,
    shadeSat: 0.92,
    shadeCool: 0,
    highlightLift: 11,
    highlightSat: 0.94,
    highlightCool: 0,
    highlightHueShift: 0,
  },
  metallic: {
    shadeDrop: 18,
    shadeSat: 0.88,
    shadeCool: 6,
    highlightLift: 20,
    highlightSat: 0.72,
    highlightCool: 12,
    highlightHueShift: 0,
  },
  pearl: {
    shadeDrop: 19,
    shadeSat: 0.9,
    shadeCool: 4,
    highlightLift: 26,
    highlightSat: 0.8,
    highlightCool: 0,
    highlightHueShift: 22,
  },
}

/** The hue "cooler" means: a mid blue. */
const COOL_ANCHOR = 220

/**
 * Below this lightness a base has little room beneath it, and a fixed lift
 * above it reads as a different colour rather than as the same colour lit. This
 * is the black case: a plain +26 on black yields a mid grey panel.
 */
const DARK_PIVOT = 28

/**
 * Above this lightness a warm cast carried down into the shade stops reading as
 * shadow and starts reading as a colour of its own. This is the white case, and
 * the palette states the failure outright: Championship White must never read
 * as beige.
 */
const LIGHT_PIVOT = 74

/**
 * What a very light colour's shade keeps of its saturation. Low, because
 * `white-ivory` and `beige` are one of the palette's closest pairs and only
 * about eighteen lightness points apart: an ivory shade that held its full warm
 * cast would sit on top of the beige entry.
 */
const LIGHT_SHADE_SAT = 0.22

/**
 * The saturation floor for a highlight given an absolute hue. A shifted
 * highlight has to carry its own colour to be worth shifting, and the two
 * colours that use it are both deep, low-saturation purples.
 */
const SHIFTED_HIGHLIGHT_SAT = 40

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

/** Rotate `hue` at most `degrees` along the short arc toward `target`. */
function rotateToward(hue: number, target: number, degrees: number): number {
  const delta = (((target - hue + 540) % 360) - 180 + 360) % 360
  const signed = delta > 180 ? delta - 360 : delta
  return (((hue + clamp(signed, -degrees, degrees)) % 360) + 360) % 360
}

export function hexToHsl(hex: string): Hsl {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: l * 100 }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return { h: (h + 360) % 360, s: s * 100, l: l * 100 }
}

export function hslToHex(hsl: Hsl): string {
  const h = ((hsl.h % 360) + 360) % 360
  const s = clamp(hsl.s, 0, 100) / 100
  const l = clamp(hsl.l, 0, 100) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const sector = Math.floor(h / 60)
  const rgb: readonly [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ]
  const channels = rgb[sector] ?? [c, x, 0]
  const byte = (v: number): string =>
    Math.round(clamp((v + m) * 255, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${byte(channels[0])}${byte(channels[1])}${byte(channels[2])}`
}

/**
 * The ramp one base colour makes under one finish.
 *
 * Both ends are bounded rather than fixed, which is what keeps the extremes
 * honest. The shade never takes more than half the lightness left below the
 * base, eases off further as the base approaches white, and sheds most of its
 * cast there, so a warm off-white shades grey rather than beige. The highlight
 * is bounded both by the room above the base and, on a dark colour, by the base
 * itself, and a dark colour keeps its saturation instead of washing out, so
 * black gets a sheen with its own cast rather than a grey panel.
 */
export function rampFor(baseHex: string, finish: PaintFinish, options: RampOptions = {}): Ramp {
  const base = hexToHsl(baseHex)
  const rule = FINISH_RULES[finish]
  const dark = clamp((DARK_PIVOT - base.l) / DARK_PIVOT, 0, 1)
  const light = clamp((base.l - LIGHT_PIVOT) / (100 - LIGHT_PIVOT), 0, 1)

  const drop = Math.min(rule.shadeDrop, base.l / 2) * (1 - 0.25 * light)
  const shade: Hsl = {
    h: rotateToward(base.h, COOL_ANCHOR, rule.shadeCool),
    s: base.s * mix(rule.shadeSat, LIGHT_SHADE_SAT, light),
    l: base.l - drop,
  }

  const lift = Math.min(rule.highlightLift, (100 - base.l) / 2, base.l * 1.1 + 6)
  const shiftedHue = options.highlightHue
  const highlight: Hsl =
    shiftedHue === undefined
      ? {
          h: rotateToward(base.h + rule.highlightHueShift, COOL_ANCHOR, rule.highlightCool),
          s: base.s * mix(rule.highlightSat, 1, dark),
          l: base.l + lift,
        }
      : {
          h: shiftedHue,
          s: Math.max(base.s, SHIFTED_HIGHLIGHT_SAT),
          l: base.l + lift,
        }

  return {
    base: baseHex.toLowerCase(),
    shade: hslToHex(shade),
    highlight: hslToHex(highlight),
  }
}
