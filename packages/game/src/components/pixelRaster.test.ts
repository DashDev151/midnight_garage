import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rasterise, templateGrid, type PixelPalette, type PixelTemplate } from './pixelRaster'

/**
 * The rasteriser's contract, not its pixels: happy-dom's canvas hands back a
 * stub data URL rather than real PNG bytes, so these tests stand a recording
 * canvas in front of it and assert on what was asked of the context (which
 * cells were filled, at what size, in what colour), on the empty-string escape
 * hatches, and on the memoisation rule.
 */

interface Fill {
  x: number
  y: number
  w: number
  h: number
  colour: string
}

const PALETTE: PixelPalette = { '0': '#101113', '1': '#26272b' }

let fills: Fill[]
let canvasSizes: { width: number; height: number }[]
let contexts: { imageSmoothingEnabled: boolean }[]
let dataUrlCalls: number
let contextAvailable: boolean

function installCanvasStub() {
  const realCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') return realCreateElement(tag)
    const ctx = {
      imageSmoothingEnabled: true,
      fillStyle: '',
      fillRect(x: number, y: number, w: number, h: number) {
        fills.push({ x, y, w, h, colour: ctx.fillStyle })
      },
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => {
        if (!contextAvailable) return null
        contexts.push(ctx)
        canvasSizes.push({ width: canvas.width, height: canvas.height })
        return ctx
      },
      toDataURL: (type: string) => {
        dataUrlCalls++
        return `data:${type};stub-${dataUrlCalls}`
      },
    }
    return canvas as unknown as HTMLCanvasElement
  })
}

/** Unique per test run so one test's cache entry can never satisfy another. */
let keySeed = 0
function freshKey(): string {
  keySeed++
  return `pixel-raster-test-${keySeed}`
}

describe('pixelRaster', () => {
  beforeEach(() => {
    fills = []
    canvasSizes = []
    contexts = []
    dataUrlCalls = 0
    contextAvailable = true
    installCanvasStub()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('templateGrid', () => {
    it('reports the first row length as width and the row count as height', () => {
      const template: PixelTemplate = ['0..1', '.00.', '1..0']
      expect(templateGrid(template)).toEqual({ w: 4, h: 3 })
    })

    it('reports a zero grid for an empty template', () => {
      expect(templateGrid([])).toEqual({ w: 0, h: 0 })
    })
  })

  describe('rasterise', () => {
    it('fills one scale-sized rect per palette character, in that palette colour', () => {
      rasterise(['01'], PALETTE, 3)
      expect(fills).toEqual([
        { x: 0, y: 0, w: 3, h: 3, colour: '#101113' },
        { x: 3, y: 0, w: 3, h: 3, colour: '#26272b' },
      ])
    })

    it('sizes the canvas to the grid times the scale, with smoothing off', () => {
      rasterise(['0..1', '.00.', '1..0'], PALETTE, 5)
      expect(canvasSizes).toEqual([{ width: 20, height: 15 }])
      expect(contexts.map((ctx) => ctx.imageSmoothingEnabled)).toEqual([false])
    })

    it('draws nothing for transparent characters', () => {
      rasterise(['....', '....'], PALETTE, 4)
      expect(fills).toEqual([])
    })

    it('treats a character the palette does not name as transparent', () => {
      rasterise(['?0z'], PALETTE, 1)
      expect(fills).toEqual([{ x: 1, y: 0, w: 1, h: 1, colour: '#101113' }])
    })

    it('returns the empty string for an empty template, without touching a canvas', () => {
      expect(rasterise([], PALETTE, 4)).toBe('')
      expect(canvasSizes).toEqual([])
      expect(dataUrlCalls).toBe(0)
    })

    it('returns the empty string when there is no 2D context', () => {
      contextAvailable = false
      expect(rasterise(['01'], PALETTE, 4)).toBe('')
      expect(dataUrlCalls).toBe(0)
    })

    it('memoises on a cache key: the second call returns the first result undrawn', () => {
      const key = freshKey()
      const first = rasterise(['01'], PALETTE, 4, key)
      const second = rasterise(['01'], PALETTE, 4, key)
      expect(first).not.toBe('')
      expect(second).toBe(first)
      expect(dataUrlCalls).toBe(1)
      expect(fills).toHaveLength(2)
    })

    it('does not cache without a cache key', () => {
      const first = rasterise(['01'], PALETTE, 4)
      const second = rasterise(['01'], PALETTE, 4)
      expect(second).not.toBe(first)
      expect(dataUrlCalls).toBe(2)
    })

    it('keeps distinct cache keys apart', () => {
      const template: PixelTemplate = ['01']
      const first = rasterise(template, PALETTE, 4, freshKey())
      const second = rasterise(template, PALETTE, 8, freshKey())
      expect(second).not.toBe(first)
      expect(dataUrlCalls).toBe(2)
    })
  })
})
