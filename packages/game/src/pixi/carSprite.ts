import { createRng } from '@midnight-garage/sim'
import { Container, Graphics, Sprite, Texture } from 'pixi.js'

/**
 * R1 art-architecture spike (roadmap Sprint 0): one indexed body template
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

const OUTLINE = '#0b0820'
const GLASS = '#9adcff'

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

/** Rasterize an indexed template through a color map; unmapped chars stay transparent. */
function renderLayer(template: readonly string[], colors: ColorMap): Texture {
  const width = Math.max(...template.map((row) => row.length))
  const canvas = document.createElement('canvas')
  canvas.width = width * SCALE
  canvas.height = template.length * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d canvas context')
  template.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x] ?? '.']
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE)
    }
  })
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  return texture
}

/**
 * Composite one car: shared wheel layer at ground level, palette-swapped
 * body above it. `dropPx` lowers the body over the wheels (template px),
 * proving the ride-height offset needs no extra art.
 */
export function buildCar(paint: Paint, dropPx = 0): Container {
  const car = new Container()
  const body = new Sprite(renderLayer(BODY_TEMPLATE, paint.colors))
  body.y = dropPx * SCALE
  car.addChild(body)
  const wheelTexture = renderLayer(WHEEL_TEMPLATE, WHEEL_COLORS)
  for (const x of WHEEL_XS) {
    const wheel = new Sprite(wheelTexture)
    wheel.x = x * SCALE
    wheel.y = WHEEL_TOP_ROW * SCALE
    car.addChild(wheel)
  }
  return car
}

/**
 * The Sprint 0 DoD scene: the same template in all four paints, order
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
