import { createRng } from '@midnight-garage/sim'
import { Container, Graphics, Sprite, Texture } from 'pixi.js'

/**
 * R1 art-architecture spike: one indexed body template
 * plus a separate wheel layer, composited at runtime with palette swaps and
 * a ride-height offset. One drawing = every paint color; wheels are drawn
 * once and shared. The sprite itself is deliberately bad placeholder art.
 *
 * Index chars: '.' transparent, '0' outline, '1' paint main, '2' paint
 * shade, '3' paint highlight, '4' glass (fixed, not paint-swapped).
 */
const BODY_TEMPLATE = [
  '..............0000000000000................',
  '.............034444444114430................',
  '............03444444441144430...............',
  '...........0344444444114444430..............',
  '..000000000344444444411444444300000000......',
  '.0333333333111111111111111111133333333.0....',
  '03111111111111111111111111111111111111300...',
  '03111111111111111111111111111111111111130...',
  '02111111111111111111111111111111111111120...',
  '02211111111111111111111111111111111112220...',
  '00222222222222222222222222222222222222200...',
  '.000000000000000000000000000000000000000....',
]

// Wheel chars: 'o' tire, 'r' rim, 'h' hub.
const WHEEL_TEMPLATE = [
  '..ooooo..',
  '.ooooooo.',
  'oorrrrroo',
  'oorhhhroo',
  'oorhhhroo',
  'oorrrrroo',
  '.ooooooo.',
  '..ooooo..',
]

type ColorMap = Record<string, string>

/** The body drawing's own two fixed tones: the outline the silhouette is cut
 * with and the glass, neither of which a paint colour swaps. */
export const OUTLINE = '#0b0820'
export const GLASS = '#9adcff'

export interface Paint {
  name: string
  colors: ColorMap
}

export const PAINTS: readonly Paint[] = [
  {
    name: 'Sunset Pink',
    colors: { '0': OUTLINE, '1': '#ff4f9e', '2': '#b52e74', '3': '#ff9ccc', '4': GLASS },
  },
  {
    name: 'Wangan Cyan',
    colors: { '0': OUTLINE, '1': '#22d3ee', '2': '#0e7f9c', '3': '#9defff', '4': GLASS },
  },
  {
    name: 'Midnight Violet',
    colors: { '0': OUTLINE, '1': '#7c5cff', '2': '#4c37a8', '3': '#b7a6ff', '4': GLASS },
  },
  {
    name: 'Sodium Amber',
    colors: { '0': OUTLINE, '1': '#ffb42e', '2': '#b2751a', '3': '#ffdf8e', '4': GLASS },
  },
]

const WHEEL_COLORS: ColorMap = { o: '#1a1626', r: '#8f93a8', h: '#d7dbe8' }

const SCALE = 4
const WHEEL_XS = [4, 30] // template px, left edge of each wheel
const WHEEL_TOP_ROW = 6 // template px, wheels overlap the lower body

/**
 * The side-view master canvas of the art bible (3.2): 96x48, one 1990s Japanese
 * coupe occupying 91px of it, drawn on the same index convention as the spike
 * template above. Pop-up headlight pods stand raised; the greenhouse carries the
 * windscreen, side glass and rear screen with the pillars left in body colour;
 * the wheel arches are cut through to the outline tone so the wheel layer seats
 * in a shadowed well.
 *
 * Tone placement is what this drawing exists to show. Highlight runs the upper
 * surfaces the sky reaches (bonnet crown, roof, the shoulder line along the
 * flank, the deck); base carries the flank; shade takes the rocker, the
 * valances, the arch lips and the crease under the shoulder.
 */
const MASTER_BODY_TEMPLATE = [
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '......................................................00000000000000............................',
  '.....................................................0333333333333330...........................',
  '....................................................044411444444114440..........................',
  '...................................................044411444444441144400........................',
  '.................................................0044411444444444441144400......................',
  '...............................................00444114444444444444441144400....................',
  '.............................................004441144444444444444444441144400..................',
  '...........................................004441144444444444444444444444114440.........000.....',
  '.........................................004443333333333333333333333333333334440000000003330....',
  '..........0000.........................00444222222222222222222222222222222222223333333331110....',
  '..........0333000...............0000000331111111111111111111112111111111111111111111111111130...',
  '..........0111330.......000000003333333111111111111111112211112111111111111111111111111122220...',
  '..........01111130000000333333331111111111111111111111111111112111111111111111111111111122220...',
  '.........031111113333333111111121111111111111111111111111111112111111111111111111111111122220...',
  '......0003111111112222222111111211111111111111111111111111111121111112222222111111111111111130..',
  '.....03331111111220000000221111211111111111111111111111111111121111220000000221111111111111110..',
  '....031111111112000000000002111211111111111111111111111111111121112000000000002111111111111110..',
  '...0322221111120000000000000211211111111111111111111111111111121120000000000000211111111111110..',
  '...0222221111200000000000000021211111111111111111111111111111121200000000000000021111111111110..',
  '...0222221111200000000000000021211111111111111111111111111111121200000000000000021111111111110..',
  '...0222221112000000000000000002211111111111111111111111111111122000000000000000002111111111110..',
  '...0222221112000000000000000002211111111111111111111111111111122000000000000000002111111111110..',
  '...0222222222000000000000000002222222222222222222222222222222222000000000000000002222222222220..',
  '....02222222200000000000000000222222222222222222222222222222222200000000000000000222222222220...',
  '.....0222222200000000000000000222222222222222222222222222222222200000000000000000222222222220...',
  '......02222220000000000000000022222222222222222222222222222222220000000000000000022222222220....',
  '.......022222000000000000000000000000000000000000000000000000000000000000000000002222222220.....',
  '........0000000000000000000000...................................0000000000000000000000000......',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
]

/** 15px five-spoke sized to the master canvas. Chars: 'o' tyre, 'r' rim,
 * 'd' spoke gap, 'h' hub. */
const MASTER_WHEEL_TEMPLATE = [
  '.....ooooo.....',
  '...ooooooooo...',
  '..oooorrroooo..',
  '.ooorrrrrrrooo.',
  '.oorrddrddrroo.',
  'ooordddrdddrooo',
  'oorrrrhhhrrrroo',
  'oordddhhhdddroo',
  'oorrddhhhddrroo',
  'ooordrrdrrdrooo',
  '.oorrrdddrrroo.',
  '.ooorrrdrrrooo.',
  '..oooorrroooo..',
  '...ooooooooo...',
  '.....ooooo.....',
]

const MASTER_WHEEL_COLORS: ColorMap = {
  o: '#221d33',
  r: '#9498ad',
  d: '#4d5166',
  h: '#d7dbe8',
}

/** The master rasterizes one canvas pixel per texel; callers pick the zoom. */
const MASTER_SCALE = 1
const MASTER_WHEEL_XS = [14, 65]
const MASTER_WHEEL_TOP_ROW = 26

/** Master template px: the first row below the tyres, for standing the car on a
 * surface without measuring the sprite's transparent lower margin. */
export const MASTER_GROUND_ROW = 41

/** One car's layer set: the drawing, its wheel, and where the two meet. */
interface CarArt {
  body: readonly string[]
  wheel: readonly string[]
  wheelColors: ColorMap
  wheelXs: readonly number[]
  wheelTopRow: number
  scale: number
}

const SPIKE_ART: CarArt = {
  body: BODY_TEMPLATE,
  wheel: WHEEL_TEMPLATE,
  wheelColors: WHEEL_COLORS,
  wheelXs: WHEEL_XS,
  wheelTopRow: WHEEL_TOP_ROW,
  scale: SCALE,
}

const MASTER_ART: CarArt = {
  body: MASTER_BODY_TEMPLATE,
  wheel: MASTER_WHEEL_TEMPLATE,
  wheelColors: MASTER_WHEEL_COLORS,
  wheelXs: MASTER_WHEEL_XS,
  wheelTopRow: MASTER_WHEEL_TOP_ROW,
  scale: MASTER_SCALE,
}

/** Rasterize an indexed template through a color map; unmapped chars stay transparent. */
function renderLayer(template: readonly string[], colors: ColorMap, scale: number): Texture {
  const width = Math.max(...template.map((row) => row.length))
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = template.length * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d canvas context')
  template.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x] ?? '.']
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  })
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  return texture
}

/**
 * Composite one car: shared wheel layer at ground level, palette-swapped
 * body above it. `dropPx` lowers the body over the wheels (template px), so a
 * ride-height change needs no extra art.
 */
function buildFrom(art: CarArt, paint: Paint, dropPx: number): Container {
  const car = new Container()
  const body = new Sprite(renderLayer(art.body, paint.colors, art.scale))
  body.y = dropPx * art.scale
  car.addChild(body)
  const wheelTexture = renderLayer(art.wheel, art.wheelColors, art.scale)
  for (const x of art.wheelXs) {
    const wheel = new Sprite(wheelTexture)
    wheel.x = x * art.scale
    wheel.y = art.wheelTopRow * art.scale
    car.addChild(wheel)
  }
  return car
}

/** The R1 spike car: placeholder art, kept for the architecture demo. */
export function buildCar(paint: Paint, dropPx = 0): Container {
  return buildFrom(SPIKE_ART, paint, dropPx)
}

/** The 96x48 side-view master, one template pixel per texel. */
export function buildMasterCar(paint: Paint, dropPx = 0): Container {
  return buildFrom(MASTER_ART, paint, dropPx)
}

/**
 * The demo scene: the same template in all four paints, order
 * shuffled by the seeded sim RNG (proves the sim workspace import), last
 * car slammed to show the ride-height layer offset.
 */
export function buildPaletteDemo(): Container {
  const scene = new Container()
  const rng = createRng(1995)

  const paints = [...PAINTS]
  for (let i = paints.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    const a = paints[i]
    const b = paints[j]
    if (a && b) {
      paints[i] = b
      paints[j] = a
    }
  }

  const spacing = 210
  paints.forEach((paint, i) => {
    const car = buildCar(paint, i === paints.length - 1 ? 2 : 0)
    car.x = 16 + i * spacing
    car.y = 40
    scene.addChild(car)
  })

  const groundY = 40 + (WHEEL_TOP_ROW + WHEEL_TEMPLATE.length) * SCALE
  const ground = new Graphics().rect(0, groundY, 16 + paints.length * spacing, 3).fill(0xff4f9e)
  scene.addChild(ground)

  return scene
}
