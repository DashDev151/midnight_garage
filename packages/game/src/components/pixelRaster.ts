/**
 * Generic pixel-template rasteriser for DOM surfaces.
 *
 * A template is an array of equal-length strings where each character indexes a
 * palette of CSS colours; a character the palette does not name is transparent
 * (the part sprites author that as '.'). The template is drawn to an offscreen
 * canvas at integer scale, nearest-neighbour, with no anti-aliasing, and handed
 * back as a PNG data URL an <img> can use. Shared by every hand-authored pixel
 * drawing in the game: the part sprites and the larger workshop view drawings
 * author at different grid sizes but rasterise identically.
 *
 * This module stays free of Pixi, of any store and of the sim boundary.
 */
export type PixelTemplate = readonly string[]

export type PixelPalette = Readonly<Record<string, string>>

/** A template's authored dimensions, taken from its own rows. */
export function templateGrid(template: PixelTemplate): { w: number; h: number } {
  return { w: template[0]?.length ?? 0, h: template.length }
}

const dataUrlCache = new Map<string, string>()

/**
 * Rasterise a template to a PNG data URL. Returns '' when the template is empty
 * or the canvas yields no 2D context.
 *
 * Memoised only when `cacheKey` is supplied, and the key must identify the
 * template, palette and scale together, since one cache is shared by every
 * caller: a caller with a stable sprite id passes `${id}:${scale}`, and a caller
 * whose drawing has no stable identity omits the key and pays for each draw.
 */
export function rasterise(
  template: PixelTemplate,
  palette: PixelPalette,
  scale = 4,
  cacheKey?: string,
): string {
  if (template.length === 0) return ''
  if (cacheKey !== undefined) {
    const cached = dataUrlCache.get(cacheKey)
    if (cached !== undefined) return cached
  }
  const { w, h } = templateGrid(template)
  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingEnabled = false
  for (let y = 0; y < template.length; y++) {
    const row = template[y] ?? ''
    for (let x = 0; x < row.length; x++) {
      const colour = palette[row[x] ?? '.']
      if (!colour) continue
      ctx.fillStyle = colour
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
  const url = canvas.toDataURL('image/png')
  if (cacheKey !== undefined) dataUrlCache.set(cacheKey, url)
  return url
}
