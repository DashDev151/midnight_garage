import { z } from 'zod'

/**
 * The four consumables priced at one size each (docs/design/systems/
 * consumables-as-stock.md): filler and sanding paper together ready a metal
 * zone's surface for paint, primer and polish bracket the paint job itself.
 * None of the four is colour-bound, so a large tin is never dead money -
 * unlike paint, which is (`PaintTinSchema` below).
 */
export const SimpleConsumableIdSchema = z.enum(['filler', 'paper', 'primer', 'polish'])

export type SimpleConsumableId = z.infer<typeof SimpleConsumableIdSchema>

/**
 * One purchasable tin of a simple consumable: how many uses it holds and
 * what the whole tin costs. `GameState.consumableStock` is counted in uses,
 * not tins, so buying one of these adds `usesPerTin` at once.
 */
export const ConsumableTinSchema = z.object({
  id: SimpleConsumableIdSchema,
  name: z.string().min(1),
  usesPerTin: z.number().int().positive(),
  priceYen: z.number().int().positive(),
})

export const ConsumableTinsSchema = z.array(ConsumableTinSchema).min(1)

export type ConsumableTin = z.infer<typeof ConsumableTinSchema>

/**
 * The three finishes the paint stage can lay - stock and street both lay a
 * plain solid colour, sport lays metallic, race lays pearl. A tin is mixed
 * to one of these AND one colour, which is what makes paint the one
 * consumable that needs its own, differently-shaped catalogue.
 */
export const PaintFinishSchema = z.enum(['solid', 'metallic', 'pearl'])

export type PaintFinish = z.infer<typeof PaintFinishSchema>

/**
 * Paint's two tin sizes: small covers three zones, large covers all nine, at
 * a per-zone discount for committing to the bigger tin up front. Sized so a
 * touch-up never has to buy a whole car's worth of a colour that may never
 * be used again.
 */
export const PaintTinSizeSchema = z.enum(['small', 'large'])

export type PaintTinSize = z.infer<typeof PaintTinSizeSchema>

/**
 * One purchasable paint product: a finish and a size, priced flat. The
 * colour is chosen at the point of purchase rather than carried here, so
 * this catalogue stays six rows (three finishes times two sizes) regardless
 * of how large the colour palette grows.
 */
export const PaintTinSchema = z.object({
  finish: PaintFinishSchema,
  size: PaintTinSizeSchema,
  usesPerTin: z.number().int().positive(),
  priceYen: z.number().int().positive(),
})

export const PaintTinsSchema = z.array(PaintTinSchema).min(1)

export type PaintTin = z.infer<typeof PaintTinSchema>

/**
 * The `GameState.consumableStock` key for one paint colour at one finish -
 * finish and colour together, since a tin is mixed to a colour and buying
 * one means choosing which. Deliberately carries no tin size: once bought,
 * a small tin's uses and a large tin's uses of the same finish and colour
 * are the same paint, and behave identically on the shelf.
 */
export function paintStockKey(finish: PaintFinish, colour: string): string {
  return `paint:${finish}:${colour}`
}
