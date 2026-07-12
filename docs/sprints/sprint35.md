# Sprint 35: Customer-owned parts and in-inventory reconditioning

*Source: maintainer directive 2026-07-12 ("follow how PC Building Simulator does it... it's in
your inventory with a customer-owned tag until the job is closed out, that lets us repair it").
Read `CLAUDE.md` in full first; no em dashes anywhere.*

## Why this sprint exists

Two of the playtest notes converge into one coherent feature:

- **Note 6 (customer-parts ethics).** Sprint 33 decision 8 made a part pulled off a customer's car
  simply vanish. That is lossy and unrealistic: the customer's part should stay tracked, not be
  destroyed. This sprint **supersedes Sprint 33 decision 8**.
- **Note 5c (recondition a part in inventory).** Deferred until now. Today a part can only be
  repaired while installed on a car; a loose part in inventory cannot be reconditioned. The
  PC-Building-Sim model requires exactly this (you pull the customer's part and work on it).

The unifying model: a part pulled off a customer's car goes into inventory **tagged customer-owned**
(locked from sale/scrap, reconciled when the job closes), and, like any inventory part, can be
**reconditioned in inventory** using the same repair economy as on-car repair.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse (this is the whole point; do NOT fork a second system):**

- **The banded-repair machinery** (`bands.ts` `planGroupRepair` / the repair-level gate / band
  targets) and **the job + labor-slot system** (`jobs.ts`, `laborSlots`): in-inventory
  reconditioning is a repair job that targets a loose `PartInstance` instead of an installed slot.
  SAME yen cost, SAME labor-slot consumption, SAME repair-level gate (maintainer-confirmed
  2026-07-12). This is the Sprint 08 trap in miniature: there must be ONE repair economy, not a
  bench economy bolted alongside the on-car one.
- **`resolveRemovePart`** (`jobs.ts`, last touched Sprint 33): the single place a removed part is
  handled. This sprint changes the customer-car branch from "discard" to "tag + keep"; the
  owned-car branch is unchanged.
- **The service-job accept/complete flow** (`serviceJobs.ts` / `advanceDay.ts`): close-out
  reconciliation hooks the existing completion path, it is not a new lifecycle.
- **The sell/scrap flow** (`selling.ts` and its store actions): gains a gate that reads the tag; no
  new selling path.
- **The inventory UI** (`PartsInventoryScreen.vue`, `PartCard.vue`, `BandChip`, `ReplaceDrawer`):
  a customer-owned badge and a recondition control, on the existing cards.
- **The Dexie migration pattern** (`saveDb.ts`, prior version bumps): the tag is one optional field
  on `PartInstance`; bump + migration + golden-save test per the save law (directive 4/law 4).

**Genuinely new (small):**
- One optional field on `PartInstance` identifying the owning service job.
- A recondition-inventory-part action (a thin new entry that routes into the EXISTING repair
  resolution against an inventory target).
- The sell/scrap gate predicate and the close-out reconciliation step.

## Design decisions (locked 2026-07-12)

1. **The tag: `customerJobId?: string` on `PartInstance`.** Absent/undefined = player-owned (the
   default and the state of every existing part). A value = owned by that service job's customer.
   Chosen over a bare boolean so close-out can reconcile the specific job's parts.

2. **Pulling a customer part tags and keeps it.** `resolveRemovePart`'s customer-car branch now
   adds the removed part to `partInventory` with `customerJobId` set (reversing Sprint 33 decision
   8's discard). The owned-car branch is unchanged (untagged, kept).

3. **Customer-owned parts are locked from sale and scrap.** The sell/scrap resolution refuses any
   `PartInstance` with a `customerJobId`. Surfaced in the UI (disabled control + reason), not just
   silently refused.

4. **In-inventory reconditioning reuses the on-car repair economy exactly.** Same yen cost, same
   labor-slot consumption, same repair-level gate, same band-target semantics. Works on ANY
   inventory part (not only customer-owned ones). No separate bench cost or speed.

5. **Close-out reconciliation.** When a service job ends (paid, failed, or expired), every
   `PartInstance` in `partInventory` tagged with that `customerJobId` is removed (it leaves with the
   customer). A customer part the player repaired and refitted to the car is already on the car and
   leaves with it at close-out; a replacement the player fitted means the customer's old pulled part
   (still tagged, in inventory) leaves. The player keeps nothing customer-owned.

## Definition of Done

- Pulling a part off a customer's car: the part appears in inventory with a customer-owned badge;
  sell and scrap are disabled for it with a visible reason. A test covers the tag being set.
- Reconditioning a loose inventory part: costs the SAME as repairing that part on a car, consumes a
  labor slot, and is gated by repair level. A test asserts cost/labor/gate parity with on-car
  repair (no cheaper bench path).
- Completing (and failing/expiring) a service job removes that job's tagged parts from inventory;
  player-owned parts are untouched. Tests cover the paid and the not-paid close paths.
- Save law satisfied: `SAVE_VERSION` bumped, a migration added, a golden-save test proving a
  prior-version save loads (existing parts migrate to untagged/player-owned).
- Full gate green; balance harness re-run (bots use the `removeParts` action from Sprint 33; the
  sell gate and the tag change their part flow, so confirm no strategy chokes and no new hard-
  invariant break); golden-master hashes re-pinned if generation/resolution order shifts.

## Tasks (Claude-implementable)

- [x] Content/schema + save: add `customerJobId?: string` to the `PartInstance` type + Zod schema;
  Dexie version bump + migration + golden-save test.
- [x] Sim: `resolveRemovePart` customer branch tags + keeps; sell/scrap gate; in-inventory
  recondition action routed through the existing repair resolution (one repair economy); close-out
  reconciliation in the service-job completion path.
- [x] Game/UI: customer-owned badge on inventory + drawer cards; recondition control on inventory
  parts; disabled sell/scrap with reason for tagged parts.
- [x] Tests per DoD (tag set on pull; recondition parity; both close-out branches; golden save).

## Exit

Implemented and gate-green (typecheck, lint, format, `test:coverage` 776 tests, build). The balance
harness re-run is the maintainer/orchestrator's own step (not run here).

**The tag (decision 1).** `PartInstance` gained one optional field, `customerJobId?: string` (type +
Zod, `packages/content/src/part.ts`). Absent = player-owned (every existing part). Save law:
`SAVE_VERSION` 21 -> 22, purely additive (no `MIGRATIONS[21]` entry needed - a v21 part decodes with
`customerJobId` simply absent, which IS "player-owned"), documented in `saveCodec.ts`'s version
history, with two Sprint 35 golden tests (a real v21 save decodes player-owned; a v22 tagged part
round-trips the tag). `JobKindSchema` also gained `'recondition-part'` under the same bump.

**Pull tags + keeps (decision 2).** `resolveRemovePart`'s customer-car branch now adds the pulled
part to `partInventory` tagged `customerJobId` (reversing Sprint 33 decision 8's discard); the
owned-car branch keeps it untagged, unchanged.

**Sell/scrap lock (decision 3).** `resolveScrapPart` refuses any part with a `customerJobId`
(silent sim no-op); `PartCard.vue` surfaces it as a disabled control + "customer's part" reason.

**One repair economy (decision 4).** In-inventory recondition routes through the EXISTING repair
machinery, not a fork: `bands.ts`'s `planPartRepair` (the extracted per-part cost/labor atom that
`planGroupRepair` itself now uses), `repairLevelForGroup` (equipment-tier repair level), the same
`hasEquipmentFor` equipment gate, and the same `chargeRepairWork` consumables+cost charge
(`repairJobGate` calls it too). `resolveReconditionLabor` composes those and spends labor via the
SAME `applyAvailableLaborToJob` (bay check skipped for a bench part) + `completeJob` (a
`recondition-part` branch climbs the loose instance's band exactly as the repair-zone branch climbs
an installed one). A parity test asserts identical cash, labor, and equipment gate against the same
part repaired on a car.

**Close-out reconciliation (decision 5).** `resolveServiceJob` - the single place an active job ends
(paid/failed via the "Complete" click AND paid/failed via advanceDay's deadline backstop, which
calls the same function) - removes every `partInventory` entry tagged with that job's id (and any
in-flight recondition job on one), leaving player-owned parts untouched.
