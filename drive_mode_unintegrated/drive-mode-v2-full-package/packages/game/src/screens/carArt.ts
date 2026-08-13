/**
 * Placeholder car art: a procedural top-down 90s coupe painted once to an
 * offscreen canvas per (colour, size) and blitted every frame. Deliberately
 * simple shapes in the game's neon palette; real sprites replace this by
 * swapping one function. Guarded for a null 2D context so happy-dom tests
 * can exercise the module without a real canvas.
 */
export interface CarSprite {
  canvas: HTMLCanvasElement
  /** Pixels per metre the sprite was painted at. */
  pxPerM: number
  lengthM: number
  widthM: number
}

export function paintCarSprite(lengthM: number, tone: string, pxPerM = 14): CarSprite {
  const widthM = 1.7
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(lengthM * pxPerM)
  canvas.height = Math.ceil(widthM * pxPerM)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const w = canvas.width
    const h = canvas.height
    const r = (f: number): number => Math.round(f)
    // Tyres first so the body overlaps them.
    ctx.fillStyle = '#0a0a10'
    const tyreAt: ReadonlyArray<readonly [number, number]> = [
      [0.16, 0.02],
      [0.16, 0.82],
      [0.78, 0.02],
      [0.78, 0.82],
    ]
    for (const [fx, fy] of tyreAt) {
      ctx.fillRect(r(w * fx), r(h * fy), r(w * 0.13), r(h * 0.16))
    }
    // Body with a nose taper, painted as three slabs.
    ctx.fillStyle = tone
    ctx.fillRect(0, r(h * 0.08), r(w * 0.92), r(h * 0.84))
    ctx.fillRect(r(w * 0.92), r(h * 0.18), w - r(w * 0.92), r(h * 0.64))
    // Cabin glass and a windscreen band.
    ctx.fillStyle = '#11131dd9'
    ctx.fillRect(r(w * 0.3), r(h * 0.16), r(w * 0.34), r(h * 0.68))
    ctx.fillStyle = '#e8f2ff55'
    ctx.fillRect(r(w * 0.6), r(h * 0.16), r(w * 0.05), r(h * 0.68))
    // Bonnet highlight, boot spoiler, pop-up lamp slits.
    ctx.fillStyle = '#ffffff2e'
    ctx.fillRect(r(w * 0.68), r(h * 0.12), r(w * 0.22), r(h * 0.1))
    ctx.fillStyle = tone
    ctx.fillRect(0, r(h * 0.04), r(w * 0.06), r(h * 0.92))
    ctx.fillStyle = '#fff6d8'
    ctx.fillRect(r(w * 0.95), r(h * 0.2), r(w * 0.04), r(h * 0.14))
    ctx.fillRect(r(w * 0.95), r(h * 0.66), r(w * 0.04), r(h * 0.14))
    // Tail lamps.
    ctx.fillStyle = '#ff3b58'
    ctx.fillRect(0, r(h * 0.12), r(w * 0.025), r(h * 0.2))
    ctx.fillRect(0, r(h * 0.68), r(w * 0.025), r(h * 0.2))
  }
  return { canvas, pxPerM, lengthM, widthM }
}
