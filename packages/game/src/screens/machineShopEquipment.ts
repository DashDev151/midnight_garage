import {
  COMPONENT_DISPLAY_NAMES,
  ComponentIdSchema,
  componentDisplayName,
  type ComponentId,
  type GameState,
  type ReputationTier,
} from '@midnight-garage/content'
import {
  craftOperationCapabilityGateReason,
  toolLevelsFor,
  toolShopForGroup,
  type SimContext,
} from '@midnight-garage/sim'

/**
 * What the machine shop physically holds. The room is a room: what matters is
 * the equipment standing in it, one piece per tool line whose work is done at
 * a machine, present or absent by whether the shop covering that line is
 * owned.
 *
 * Rooms and shops are different axes, so a machine is identified by the LINE it
 * serves and carries the name of the shop that brought it. The room takes every
 * loose-part job in the building, which is why the bench for dampers and the
 * bench for a differential stand here under a shop name that is not the room's
 * own.
 *
 * Presence is sim's own per-operation gate
 * (`craftOperationCapabilityGateReason`), asked of that line's own operations,
 * so the room can never disagree with what the bench will actually accept.
 */
export interface MachineShopMachine {
  componentId: ComponentId
  /** The line this bench serves, in the same words the Upgrades wall uses. */
  displayName: string
  /** The shop that brings this bench, from `toolShops.json` - not always the
   * shop the room is named after. */
  shopName: string
  present: boolean
  /** What buying that shop costs. */
  priceYen: number
  /** The standing the shop needs before it can be bought, or `null` when it
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
  const toolLevels = toolLevelsFor(state, context)
  const machinery: MachineShopMachine[] = []
  for (const componentId of ComponentIdSchema.options) {
    const operations = looseOperations.filter(
      (operation) => context.partsTaxonomyById[operation.carPartId].group === componentId,
    )
    if (operations.length === 0) continue
    const shop = toolShopForGroup(componentId, context)
    machinery.push({
      componentId,
      displayName: componentDisplayName(componentId, COMPONENT_DISPLAY_NAMES),
      shopName: shop.displayName,
      present: operations.some(
        (operation) =>
          craftOperationCapabilityGateReason(operation, toolLevels, context) !== 'tool-tier',
      ),
      priceYen: shop.upgradePriceYen,
      minReputationTier: shop.minReputationTier,
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
