import { ALL_CAR_PART_IDS, type CarPartId } from '@midnight-garage/content'
import type { ComputedRef } from 'vue'
import { useGameStore, type CarDetail } from '../stores/gameStore'
import { addressesOverlap } from '../utils/partAddress'
import { useDropZone, type DropZoneHandle } from './useDragAndDrop'

export interface CarPartDropZones {
  dropZones: Record<CarPartId, DropZoneHandle>
  /**
   * Whether `partInstanceId` legally fits `carPartId`'s empty slot right now
   * - the same predicate a pick-fallback click reads (`onFitClick`'s own
   * check ahead of `dropZones[carPartId].onClick()`), so a drag and a pick
   * agree on what counts as a legal fit.
   */
  acceptsInstall: (carPartId: CarPartId, partInstanceId: string) => boolean
}

/**
 * One drop zone per real part on `detail`'s car, keyed by `CarPartId` - the
 * shared build behind every drag-to-fit surface the workshop diagram is
 * mounted on (the car page, the body shop). A drop resolves the install
 * instantly through the same `install` resolver every fit path uses;
 * `acceptsInstall` is the one predicate both the sidebar's own Fit button
 * and the diagram's part regions read, wherever the diagram is hosted.
 * `onInstalled` fires after a successful drop-install - the car page uses it
 * to close the Warehouse drawer, the body shop (which has no drawer of its
 * own) simply omits it.
 */
export function useCarPartDropZones(
  detail: ComputedRef<CarDetail | undefined>,
  onInstalled?: () => void,
): CarPartDropZones {
  const game = useGameStore()

  function acceptsInstall(carPartId: CarPartId, partInstanceId: string): boolean {
    const d = detail.value
    if (!d) return false
    const componentId = game.groupForCarPart(carPartId)
    if (!componentId) return false
    if (d.jobs.some((j) => addressesOverlap(j, { componentId, carPartId }))) return false
    return game.installablePartsForPart(d.car.id, carPartId).some((p) => p.id === partInstanceId)
  }

  const dropZones = Object.fromEntries(
    ALL_CAR_PART_IDS.map((carPartId) => [
      carPartId,
      useDropZone<string>(
        (partInstanceId) => acceptsInstall(carPartId, partInstanceId),
        (partInstanceId) => {
          const d = detail.value
          const componentId = game.groupForCarPart(carPartId)
          if (d && componentId) game.install(d.car.id, componentId, partInstanceId, carPartId)
          onInstalled?.()
        },
      ),
    ]),
  ) as Record<CarPartId, DropZoneHandle>

  return { dropZones, acceptsInstall }
}
