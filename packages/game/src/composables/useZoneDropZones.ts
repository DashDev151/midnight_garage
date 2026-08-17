import { fitmentClassForTier, type ZoneId } from '@midnight-garage/content'
import { ALL_ZONE_IDS } from '@midnight-garage/sim'
import type { ComputedRef } from 'vue'
import { useGameStore, type CarDetail } from '../stores/gameStore'
import { useDropZone, type DropZoneHandle } from './useDragAndDrop'

export interface ZoneDropZones {
  dropZones: Record<ZoneId, DropZoneHandle>
  /**
   * Whether `partInstanceId` is a panel that legally fits `zoneId` right now
   * - the zone's own panel has to be missing first (there is no swap verb:
   * a fresh panel only ever goes on an empty zone, the same "off, then a
   * fresh one goes on" rule the zone panel's own Fit control already
   * enforces), and the part has to be that exact zone's panel at this car's
   * fitment class.
   */
  acceptsPanel: (zoneId: ZoneId, partInstanceId: string) => boolean
}

/**
 * One drop zone per body zone, keyed by `ZoneId` - the panel-fitting
 * counterpart to `useCarPartDropZones` (sprint211.md task D): a body panel is
 * a part like any other, so it fits through the same drag-or-pick idiom every
 * other slot uses rather than the bespoke per-SKU button block the body shop
 * carried before. A drop resolves instantly through `installPanel`, the same
 * resolver the Warehouse's own zone-scoped pick uses.
 */
export function useZoneDropZones(detail: ComputedRef<CarDetail | undefined>): ZoneDropZones {
  const game = useGameStore()

  function acceptsPanel(zoneId: ZoneId, partInstanceId: string): boolean {
    const d = detail.value
    if (!d) return false
    const zone = d.car.zoneState?.[zoneId]
    if (!zone || !zone.panelMissing) return false
    const model = game.context.modelsById[d.car.modelId]
    if (!model) return false
    const fitClass = fitmentClassForTier(model.tier)
    const instance = game.gameState.partInventory.find((p) => p.id === partInstanceId)
    const part = instance ? game.context.partsById[instance.partId] : undefined
    return part?.zoneId === zoneId && part.fitmentClass === fitClass
  }

  const dropZones = Object.fromEntries(
    ALL_ZONE_IDS.map((zoneId) => [
      zoneId,
      useDropZone<string>(
        (partInstanceId) => acceptsPanel(zoneId, partInstanceId),
        (partInstanceId) => {
          const d = detail.value
          if (d) game.installPanel(d.car.id, zoneId, partInstanceId)
        },
      ),
    ]),
  ) as Record<ZoneId, DropZoneHandle>

  return { dropZones, acceptsPanel }
}
