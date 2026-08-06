import {
  ComponentIdSchema,
  type ComponentId,
  type GameState,
  type ReputationTier,
} from '@midnight-garage/content'
import { craftOperationCapabilityGateReason, type SimContext } from '@midnight-garage/sim'

/**
 * What the machine shop physically holds. The room is a room: what matters is
 * the equipment standing in it, one piece per tool line whose work is done at
 * a machine, present or absent by whether that line owns its top rung.
 *
 * Presence is sim's own per-operation gate
 * (`craftOperationCapabilityGateReason`), asked of that line's own operations,
 * so the room can never disagree with what the bench will actually accept. A
 * line whose operations are refused on tool tier has no machine in the room;
 * anything else an operation is refused on (a scene's standing) is a machine
 * that is there and idle.
 */
export interface MachineShopMachine {
  componentId: ComponentId
  /** The top rung's own name, from `toolLines.json`. */
  displayName: string
  present: boolean
  /** What buying that rung costs. */
  priceYen: number
  /** The standing the rung needs before it can be bought, or `null` when it
   * needs none. */
  minReputationTier: ReputationTier | null
  /** The slots this machine takes work on, in the taxonomy's own words. */
  worksOn: readonly string[]
}

/**
 * Every machine the shop's own room holds, in the catalogue's declared line
 * order. Only the lines with loose-part operations appear: work done with the
 * part off the car is what a machine is for, and equipment that could never do
 * anything would be worse than nothing.
 */
export function machineShopMachinery(
  state: GameState,
  context: SimContext,
): readonly MachineShopMachine[] {
  const looseOperations = context.economy.machining.operations.filter(
    (operation) => operation.performedOn === 'loose-part',
  )
  const machinery: MachineShopMachine[] = []
  for (const componentId of ComponentIdSchema.options) {
    const operations = looseOperations.filter(
      (operation) => context.partsTaxonomyById[operation.carPartId].group === componentId,
    )
    if (operations.length === 0) continue
    const { tiers } = context.toolLineFor(componentId)
    const rung = tiers[tiers.length - 1]!
    machinery.push({
      componentId,
      displayName: rung.displayName,
      present: operations.some(
        (operation) =>
          craftOperationCapabilityGateReason(
            operation,
            state.toolTiers,
            state.sceneStanding,
            context,
          ) !== 'tool-tier',
      ),
      priceYen: rung.upgradePriceYen,
      minReputationTier: rung.minReputationTier ?? null,
      worksOn: [
        ...new Set(
          operations.map((operation) => context.partsTaxonomyById[operation.carPartId].displayName),
        ),
      ],
    })
  }
  return machinery
}

/**
 * Whether the shop owns any machining equipment at all - what tells an empty
 * room from a working one, and the whole of what the garage map's derelict
 * scene now means. One machine is enough: a shop with the driveline press and
 * no engine tooling is a shop with a machine in it.
 */
export function machineShopHasMachinery(state: GameState, context: SimContext): boolean {
  return machineShopMachinery(state, context).some((machine) => machine.present)
}
