import { Container, Graphics } from 'pixi.js'
import { GLASS, MASTER_GROUND_ROW, OUTLINE, buildMasterCar } from './carSprite'
import type { Ramp } from './paintRamp'

/**
 * The paint palette dev screen's preview scene: the 96x48 side-view master in
 * one ramp, blown up far enough to judge as pixel art.
 *
 * The drawing, the palette swap and the wheel layer are all `carSprite.ts`'s
 * already. All this adds is the zoom, the centring and an apron to stand the
 * car on.
 */

/** Zoom over the sprite's own raster scale. Integer, so the pixels stay square. */
const ZOOM = 6

/** A concrete apron, light enough that a near-black car still has a silhouette
 * against it. The extremes of the palette are the ones worth judging. */
const APRON = 0x3d3f45

export const PREVIEW_WIDTH = 760
export const PREVIEW_HEIGHT = 320
export const PREVIEW_BACKGROUND = 0x1c1d20

export function buildPaintPreview(ramp: Ramp): Container {
  const scene = new Container()
  const car = buildMasterCar({
    name: 'preview',
    colors: { '0': OUTLINE, '1': ramp.base, '2': ramp.shade, '3': ramp.highlight, '4': GLASS },
  })
  car.scale.set(ZOOM)
  car.x = Math.round((PREVIEW_WIDTH - car.width) / 2)
  car.y = Math.round((PREVIEW_HEIGHT - car.height) / 2)

  const apronY = Math.round(car.y + MASTER_GROUND_ROW * ZOOM)
  scene.addChild(new Graphics().rect(0, apronY, PREVIEW_WIDTH, PREVIEW_HEIGHT - apronY).fill(APRON))
  scene.addChild(car)
  return scene
}
