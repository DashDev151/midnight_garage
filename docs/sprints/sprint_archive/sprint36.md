# Sprint 36: Tool lines replace equipment ownership

*Arc: Progression Rework. Read `docs/design/progression-bible.md` (canonical principles), then
`docs/sprints/arc-progression-rework.md`, then `CLAUDE.md` in full; no em dashes anywhere. This
sprint is the mechanical core: after it, the player owns tier 1 of every tool line from day one,
upgrades buy labor efficiency, and the "shown but un-doable job" bug class is unrepresentable.
Every decision is made below; implement exactly, do not improvise.*

## Reuse analysis (directive 16)

**Existing mechanisms to reuse (the rework re-sources, it does not rebuild):**

- **The repair formula is already tiered.** `bands.ts` `slotsNeededToClimb(grades, repairLevel)` =
  `ceil(grades / repairLevel)`; `repairLevelForGroup` already returns 1|2|3, defaulting to 1 with
  nothing owned. Tier IS the repairLevel; only its SOURCE changes (a persisted `toolTiers` map
  instead of an ownership scan).
- **The 6-group `ComponentId` vocabulary** (`packages/content/src/tags.ts:43`) keys the lines. No
  new vocabulary, no mapping layer.
- **The purchase pipeline** (`actions.ts` action -> `advanceDay.ts` step 0 -> apply function with
  cash check + day log) becomes the upgrade pipeline, same shape.
- **The migration pattern** (`saveCodec.ts` MIGRATIONS table + version-history doc + golden tests).
- **Labor economy untouched:** `PLAYER_BASE_LABOR_SLOTS`, `laborSlotsSpentToday`,
  `availableLaborSlots`, `applyAvailableLaborToJob` unchanged.
- **Payout pricing untouched:** `serviceJobCostBreakdown` keeps pricing repair labor at level 1
  (bible: payouts price worst-case tooling).

**Genuinely new (small):** the `toolTiers` state field; `toolLines.json`; the `upgradeToolLine`
action; the optional `minToolTier` task field (schema + enforcement; Sprint 37 authors values).

**Deleted outright:** `hasEquipmentFor`/`hasEquipmentForIds` as refusals; `ownedEquipmentIds`;
`applyEquipmentPurchase`'s once-only + reputation gates; `serviceJobs.ts` `missingEquipmentGroups`,
`groupHasPurchasableEquipment`, `actionableOrOnePurchaseAwayTemplates`,
`MAX_MISSING_EQUIPMENT_GROUPS_FOR_OFFER`, the `JOB_HINT_OFFER_CHANCE` hint-reroll in
`pickServiceJobTemplate`; the accept-time equipment refusal in `resolveAcceptServiceJob`; bots'
`ensureEquipmentFor` + `ASCENDING_EQUIPMENT_COST_COMPONENTS`. (This retires interim fix dc306d9 by
design.)

## Locked specification

### 1. Tool lines content (`packages/content/data/toolLines.json`)

Six entries keyed by ComponentId. Each: `tiers` array of exactly 3, each tier
`{ displayName, upgradePriceYen, consumablesCostYen }`. Tier 1 `upgradePriceYen` is 0 (owned from
the start). All numbers below are first-pass and content-tunable, but THESE are the shipped
values:

| Line | T1 name (price / consumables) | T2 name (price / cons.) | T3 name (price / cons.) |
|---|---|---|---|
| engine | Hand tools & timing kit (0 / 2000) | Engine crane & stand (600000 / 5000) | Machine-shop tooling (1500000 / 8000) |
| drivetrain | Driveline hand tools (0 / 2000) | Transmission bench (900000 / 9000) | Driveline rebuild bench & press (1800000 / 11000) |
| suspension | Trolley jack & axle stands (0 / 2000) | Two-post lift (250000 / 3000) | Drive-on alignment lift (400000 / 10000) |
| wheels | Tyre levers & bubble balancer (0 / 2000) | Tyre machine & balancer (150000 / 8000) | Alignment & road-force rig (350000 / 9000) |
| body | Filler, sandpaper & rattle cans (0 / 2000) | MIG welder & panel tools (700000 / 6000) | Spray booth & chassis jig (1400000 / 8000) |
| interior | Hand stitching & trim tools (0 / 2000) | Upholstery & trim bench (350000 / 8000) | Full trim shop (700000 / 9000) |

`data/equipment.json` and `src/equipment.ts` (content) are DELETED; `src/toolLines.ts` Zod schema
replaces them (validate: exactly the 6 ComponentIds as keys, exactly 3 tiers, tier-1 price 0,
prices strictly increasing within a line). `src/data.ts` exports `TOOL_LINES`; `src/index.ts`
re-exports schema + type.

### 2. State, action, upgrade rules

- `GameStateSchema` (`packages/content/src/gameState.ts`): REMOVE `ownedEquipmentIds`; ADD
  `toolTiers: z.record(ComponentIdSchema, z.union([z.literal(1), z.literal(2), z.literal(3)]))`
  (all six keys required). DayLogEntry: ADD `{ type: 'tool-upgraded', componentId, toTier,
  priceYen }`; KEEP `equipment-purchased` in the schema for old-log decode compatibility.
- `actions.ts`: `BuyEquipmentActionSchema`/`buyEquipment` -> `UpgradeToolLineActionSchema
  { componentId: ComponentIdSchema }` / `upgradeToolLines` (array, default []).
- `packages/sim/src/equipment.ts` -> renamed `toolLines.ts`: `toolTierForGroup(state, componentId)`
  reads the map; `applyToolUpgrade(state, componentId, context)` gates, in order: line already at
  3 -> no-op not-applied; `cashYen < nextTier.upgradePriceYen` -> no-op not-applied; else deduct,
  set tier+1, log `tool-upgraded`. Sequential only (one call = one step; a same-day duplicate in
  the batch is a no-op because cash/tier are re-checked). NO reputation gate. `applyToolUpgrades`
  batch mirrors `applyEquipmentPurchases`.
- `newGame.ts`: seed all six lines at 1.
- `context.ts`: `equipment`/`equipmentById` -> `toolLines` (the parsed record); expose
  `toolLineFor(componentId)`.

### 3. The offer rule (replaces every equipment filter)

`ServiceJobTaskSchema` (repair AND install variants) gains
`minToolTier: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1)`.

Define per template: `deficit(task) = max(0, task.minToolTier - toolTiers[group(task)])`.
A template is OFFERABLE iff `max deficit over tasks <= 1` AND at most ONE DISTINCT group has
deficit 1. A template with any deficit is offered as an UPGRADE-HINT offer carrying the hint
string "needs <that group's next tier displayName>"; affordability is NOT checked (cash is the
player's lever, it fluctuates daily). `resolveAcceptServiceJob` refuses (log reason
`'tool-tier'`) unless ALL deficits are 0 at accept time. With Sprint 36's all-default-1 content
every template is offerable with zero deficits; Sprint 37 authors real ceilings. The old
`no-equipment` refusal and all three filter helpers are deleted.

### 4. Repair paths (no gates, tier-sourced)

- `bands.ts`: `repairLevelForGroup(toolTiers, groupId)` returns `toolTiers[groupId]`;
  `planGroupRepair` drops the `ownedEquipmentIds`/`equipmentById` params for `toolTiers`.
  `slotsNeededToClimb`/`planPartRepair` byte-identical.
- `jobs.ts`: `repairJobGate` drops the `hasEquipmentFor` refusal and the
  `job-blocked/equipment-missing` path entirely; `repairConsumablesCostYen(componentId, state,
  context)` returns the line's CURRENT-tier `consumablesCostYen`; the recondition path
  (`planReconditionPart`/`reconditionQuote`/`resolveReconditionLabor`) same: no gate, tier-sourced
  level, current-tier consumables.

### 5. Save migration (v22 -> v23)

`SAVE_VERSION = 23`. `MIGRATIONS[22]`: build `toolTiers` from the save's `ownedEquipmentIds` using
this frozen legacy map (then delete `ownedEquipmentIds`):

| legacy id | group | level |
|---|---|---|
| tire-machine | wheels | 2 |
| brake-lathe | suspension | 2 |
| suspension-press | suspension | 3 |
| upholstery-bench | interior | 2 |
| welder | body | 2 |
| transmission-bench | drivetrain | 2 |
| engine-crane | engine | 3 |

Per group: tier = max level among owned ids covering it, else 1. Unknown ids are ignored. The map
is hardcoded inline in the migration (pattern: `migrateV17ToV18`'s
`GROUP_TO_REPRESENTATIVE_PART`), since `equipment.json` no longer exists. Version-history entry +
golden tests: a v22 save owning `engine-crane` + `tire-machine` decodes to engine 3, wheels 2,
rest 1; a fresh v23 round-trips.

### 6. Bots

`equipmentHelpers.ts` -> `toolUpgradeHelpers.ts`: shared
`considerToolUpgrade(state, componentId, actions, budget, cashBufferMultiplier)`: queue the next
tier iff tier < 3 AND `cashYen >= upgradePriceYen * cashBufferMultiplier`; same-tick dedupe via
the existing budget object pattern. Strategy re-basing (mechanical, no judgment):
- `handyman.ts`: the tier-payback archetype; each day, upgrade the CHEAPEST next-tier upgrade
  across all lines it can buffer (multiplier 1.0), replacing its buy-cheapest-machine loop.
- `investor.ts`: never upgrades (unchanged control; its runCareer assertion becomes
  "equipmentOwnedCount stays 0", same meaning).
- `cautiousRestorer.ts` / `competentPolicy.ts`: where they called `ensureEquipmentFor(group)`
  before repairing, call `considerToolUpgrade(group, multiplier 2.0)` and PROCEED with the repair
  regardless (work is always possible now).
- `serviceGrinder.ts`: accepts per the new offer rule; its Sprint 33 single-discipline
  special-casing is deleted; upgrades via `considerToolUpgrade` (multiplier 1.5) for the group of
  its accepted job's largest-deficit task, else none.
- `balancedPlayer.ts` / `flipper.ts` / `randomStrategy.ts`: replace `ensureEquipmentFor` call
  sites with `considerToolUpgrade` (multiplier 2.0) and proceed.
- `bandHelpers.ts` / `serviceJobHelpers.ts`: thread `toolTiers` into `planGroupRepair`.
- `runCareer.ts`: `equipmentOwnedCount` KEEPS its snapshot/CSV name; value = sum of tiers minus 6.

### 7. Game UI

- `gameStore.ts`: `equipmentCatalog`/`EquipmentView`/`buyEquipment`/`hasEquipmentForComponent`/
  `firstMissingEquipmentTask`/`devGrantEquipment` -> `toolLineViews` (per line: componentLabel,
  current tier name, next tier name + price, `maxed` flag), `upgradeToolLine(componentId)`,
  `devSetToolTier(componentId, tier)`; `repair`/`install`/`reconditionQuoteFor` thread
  `toolTiers`; `serviceJobOfferViews`: `canAccept` = zero deficits, `upgradeHint` = the hint
  string from the offer rule (replaces `missingEquipmentName`).
- `UpgradesScreen.vue`: equipment section -> tool-line ladders (line label, current tier name,
  "Upgrade: <next name> (<price>)" button disabled only on cash, "Fully equipped" when maxed).
- `CarDetailScreen.vue`: DELETE `needs-equipment` classes/tooltips/`equipmentFor`; repair buttons
  gate on labor only.
- `ServiceJobsScreen.vue`: accept disabled only while deficits exist, title = the upgrade hint.
- `PartCard.vue`: recondition control loses the equipment gate (labor gate stays).
- `dayLogFormat.ts`: `tool-upgraded` -> "Upgraded <line label> to <tier displayName> for <yen>";
  keep `equipment-purchased` rendering; delete the `equipment not owned` job-blocked branch.

### 8. Tests (rewrite/add; sim tests in `packages/sim/tests/`)

- `equipment.test.ts` -> `toolLines.test.ts`: starts all-1; upgrade applies/deducts/logs; refuses
  unaffordable and maxed; sequential (two upgrades same line same day = one applies when cash for
  one).
- `bands.test.ts`: repairLevel sourced from `toolTiers` (1/2/3 worked examples unchanged).
- `jobs.test.ts`: gate describes -> "repair proceeds at tier 1 with nothing upgraded";
  consumables-per-tier assertions; recondition parity intact.
- `serviceJobs.test.ts`: DELETE the Sprint 33 filter + hinting describes (incl. dc306d9's
  regression test); ADD: across 300 fresh seeds every offer has max deficit <= 1 and at most one
  deficient group (with default content: all zero-deficit).
- `restorationPacing.test.ts`: re-anchor (all-T1 days vs all-T3 days; T3 strictly faster).
- `bots/runCareer.test.ts`: handyman upgrade count > 0 by day 100; investor stays 0; strategies
  complete careers.
- Content `schemas.test.ts`: toolLines.json parses; 6 keys; 3 tiers; T1 price 0; ascending
  prices. `gameState.test.ts` fixture: `toolTiers` all-1.
- Game: `gameStore.equipment.test.ts` -> tool-line store tests (view shape, upgrade, dev setter);
  `UpgradesScreen.test.ts` ladder rendering + disabled-on-cash; `saveCodec.test.ts` per section 5;
  `dayLogFormat.test.ts` new line.
- Re-pin advanceDay golden hashes (offer-gen RNG order changes when the hint reroll dies): read
  the real hashes from the failures, never invent.

## Definition of Done

- New game: all six lines tier 1; every repair/recondition startable immediately; zero equipment
  refusal paths anywhere in sim or UI.
- Upgrades: sequential, cash-gated only, logged, visible with named tiers.
- Offer generation cannot emit an offer with deficit > 1 or two deficient groups (300-seed test).
- v22 saves migrate per the frozen map; goldens green.
- Full gate green. Balance harness (orchestrator-run): all hard invariants pass, or any
  days-to-`local` band exit is investigated and re-based ONLY with maintainer approval recorded
  here; movement disclosed in Exit either way.

## Fences

Do NOT touch: the value model (`marketValue.ts`, `bands.ts` cost math), auction generation or
bidding, selling, facilities/staff, reputation earn/derive logic, `tools/balance/**` (python).
Do NOT rename reputation symbols. Do NOT author Sprint 37 content values. Do NOT run the balance
harness (orchestrator does).

## Exit

Implemented in full, 2026-07-12. Every locked-specification section landed as written; nothing
was improvised.

- **Content:** `data/equipment.json` + `src/equipment.ts` deleted; `data/toolLines.json` ships
  the exact table above, validated by `src/toolLines.ts` (6 ComponentId keys exhaustive, 3 tiers,
  tier-1 price 0, strictly ascending prices; `schemas.test.ts` asserts all four).
- **State/action:** `GameStateSchema.toolTiers` (all six keys required, not defaulted);
  `tool-upgraded` DayLog entry added, `equipment-purchased` kept for old-log decode;
  `upgradeToolLines` DayAction replaces `buyEquipment`; `newGame` seeds all six lines at 1;
  `SimContext.toolLines`/`toolLineFor` replace the equipment catalog (8th `buildSimContext`
  positional, defaulted to `TOOL_LINES`).
- **Offer rule:** `minToolTier` (default 1) on both task variants; offerable iff max deficit <= 1
  AND at most one distinct deficient group; hint string "needs <next tier displayName>";
  accept-time refusal logs reason `'tool-tier'`. The Sprint 33 filter/hint pipeline
  (`missingEquipmentGroups`, `groupHasPurchasableEquipment`,
  `actionableOrOnePurchaseAwayTemplates`, `MAX_MISSING_EQUIPMENT_GROUPS_FOR_OFFER`,
  `JOB_HINT_OFFER_CHANCE`) is deleted, retiring interim fix dc306d9 by design.
- **Repair paths:** `repairLevelForGroup(toolTiers, groupId)` reads the map;
  `planGroupRepair`/recondition take `toolTiers`; consumables are the line's CURRENT-tier
  `consumablesCostYen`; zero ownership refusals remain in sim or UI (grep-verified: no
  `ownedEquipmentIds`/`hasEquipmentFor*`/`ensureEquipmentFor` references outside `saveCodec.ts`'s
  v22->v23 migration and its tests).
- **Save migration:** `SAVE_VERSION = 23`; `MIGRATIONS[22]` maps the frozen 7-id legacy table
  (per group max level, unknown ids ignored, list deleted). Golden tests: engine-crane +
  tire-machine -> engine 3 / wheels 2 / rest 1; same-group max (brake-lathe + suspension-press ->
  suspension 3); unknown-id ignored; empty list -> all-1; fresh v23 round-trip. The pinned v6/v7
  golden codes now decode through the new map (body/wheels 2 and wheels 2 respectively).
- **Bots:** `toolUpgradeHelpers.considerToolUpgrade` with the specified per-strategy multipliers;
  serviceGrinder's Sprint 33 single-discipline special-casing deleted; investor unchanged control;
  `equipmentOwnedCount` keeps its CSV name, now sum(tiers) - 6.
- **Golden hash re-pins (from real failure output):** 30-day career `10108ea2` -> `7eb02198`;
  acquisition->sale `2261bd6a` -> `ce6e0f11`. Cause: the hashed state shape changed
  (equipment list -> `toolTiers`) and the deleted offer-generation hint reroll reordered the
  daily RNG draw sequence. No value-model math changed.
- **Test rework:** `equipment.test.ts` -> `toolLines.test.ts`;
  `gameStore.equipment.test.ts` -> `gameStore.toolLines.test.ts`; the 300-seed offer-rule sweep;
  restoration pacing re-anchored all-T1 vs all-T3; Service Grinder's equipment-bootstrap
  describes replaced by the paid-service-work claim (50 seeds); UpgradesScreen ladder tests;
  ServiceJobsScreen deficit-disabled + hint-tooltip test; dayLogFormat "Upgraded Wheels to
  Tyre machine & balancer for ¥150,000".
- **Gate:** typecheck / lint / format / `test:coverage` (70 files, 768 tests, coverage
  90.22 / 78.92 / 90.46 / 93.99 vs 80/65/78/82 thresholds) / build all green.
- **Balance harness (orchestrator run, 2026-07-12): all hard invariants PASS; the economy moved
  hard and is disclosed, not hidden.** Days-to-`local` p50 12.0 -> 19.0 (in [10,35], no re-base
  needed), but seeds reaching `local` fell 960 -> 798/1000. Day-100 median cash collapsed for the
  car-flipping strategies (flipper Y1.42M -> Y15k; balanced Y1.47M -> -Y49k; restorer -> -Y146k;
  handyman -> -Y211k; random -> -Y93k) while service-grinder DOUBLED (Y1.11M -> Y1.93M, now the
  only strategy beating passive) and competent-policy improved (Y87k -> Y176k). Acquisitions
  halved (68k -> 34.6k). Mechanism, not mystery: every bot now spends scarce labor on slow tier-1
  repairs it previously was FORBIDDEN from attempting (repair-to-mint policies tuned for owned
  2-3x machines now take 2-3x the days), plus capital on tier upgrades, while service jobs
  (priced at worst-case tooling, unchanged) became universally accessible from day one - the
  design working as intended: service work IS the honest early money, capital work is slow until
  you invest. The sanity-floor invariant (the catastrophic-bug catcher) passes; per the house
  rule these are changed numbers under a changed world, not regressions - the strategies' POLICIES
  are simply not re-tuned for it, the expected mid-arc seam (same shape as the Sprint 26->27
  seam). Sprint 37's real ceilings + richer tier-1 job mix move this again; a bot/pacing re-tune
  belongs after Sprint 39, not mid-arc. One genuine tuning signal for the maintainer: handyman
  (the tier-payback archetype) at -Y211k median says tool upgrades do not pay for themselves
  within 100 days at current prices; revisit tier prices or payback horizon in the arc-end
  balance pass.
