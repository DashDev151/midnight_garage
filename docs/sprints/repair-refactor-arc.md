# Repair Refactor Arc (Sprints 224-232)

**Status:** Planned
**Design of record:** `docs/design/systems/repair-refactor-spec.md` (the spec). This index
records the arc's structure, the maintainer decisions taken on top of the spec, and the
locked implementation rules every sprint doc leans on. A sprint doc beats this index where
they disagree; the spec beats both on design intent.

## Maintainer decisions on top of the spec (2026-08-20)

- **D-A1 (valuation basis, approved):** the market prices a fix at what it costs a garage
  that hires whatever it doesn't own. Service and Rebuild work is priced as parts bill plus
  the group's day-hire fee where tier 2 kit is needed; Restore work is priced at its plain
  parts bill (no hire route exists, the shop is assumed). The player's real tools never
  enter any valuation.
- **D-A2 (classifieds gate, killed):** tool lines, shops, and garage equipment are buyable
  whenever reputation and cash allow. `machineListing`, `nextMachineListingDay`,
  `rollMachineListings`, the UpgradesScreen classifieds section, and the `machine-listed` /
  `tool-shop-listed` day-log kinds all retire.
- **D-A3 (prices supersede sprint 222):** the spec's proposed tier 2 and shop prices are
  the live proposal set; sprint 222's body cheapening is superseded because tier 2 now buys
  strictly more (Rebuild capability, not only the panel pipeline).
- **D-A4 (flat step energy):** one flat labour cost per recipe step for all three job
  types; the spec's per-job-tier 4/3/2 table is not implemented. Slog stays at x3 on top.
  Rebuild's premium over Service is the better band, the higher value, and the
  removal/refit work around it. Tune from one lever later.

## Decisions taken during implementation

Rulings the arc produced rather than started with, recorded here because they bind every
later sprint. Both were forced by measurement, and both are stated as behaviour: the
figures that produced them are in `sprint227.md`.

- **D-I1 (a day is bought per LINE, never per part).** Hiring a line buys that line's whole
  tier 2 kit for the day, so a bill that welds nine engine slots buys the engine line ONCE,
  and a bill spanning six lines buys six days at most. A single-part price still names its
  own day, because a single-part job really does buy one; the de-duplication belongs to
  whatever walk sums several parts, and a fee therefore has to name the LINE it is bought
  on, not only its amount. Felt behaviour: planning a day around one bench is rewarded, and
  a big job never costs more in hire than a small one on the same line.
- **D-I2 (what a value counts, and what a quote adds).** A car's VALUE counts the parts and
  the labour a fix needs and never a tool-hire day: a fee whose job is to pace tool
  ownership on the player's own shop floor must not decide what a car is worth, and
  charging a whole day's hire against one flip charges a fixed overhead against a single
  play. A customer QUOTE does fold a day in, but only the day a WELD forces, because a tier
  2 tool is a rate and not a wall everywhere else: an unowned, unhired step is worked by
  hand at `toolHire.slogMultiplier` energy for no yen, so charging cash for it would price a
  choice the player still has. Felt behaviour: a cheap car is never worth less than nothing
  because the market imagined a rig it would not pay for, and a commission that genuinely
  cannot be done by hand still covers the day before any margin.

## Locked implementation rules (used by every sprint doc)

1. **Per-step tool-driven gating.** A job's step list is the requirement. Each step names
   one tool; the tool lives on one bench, in one zone, at one tier (1, 2, or shop). A step
   is executable when its tool is available: owned (line tier reached, or covering shop
   owned), hired today (grants the group's whole tier 2 kit), or slogged (tier 2 tool,
   unowned, unhired, step not `requiresMachine`) at x3 energy for that step. Tier 1 tool
   steps inside a Rebuild run at x1 regardless of route.
2. **Job-level hard gates.** Restore requires owning the covering shop, always, regardless
   of the recipe's tools. `requiresMachine` steps can never slog.
3. **Location gates.** Service runs where the part sits (in situ; buried adds
   `energyByClass.buried`). Rebuild and Restore on a removable part require the part
   removed and on its group's bench. Fixed-surface parts (`removable: false`) always work
   on the car. A step may borrow a tool from another bench (`bench` override on the step,
   e.g. exhaust Rebuild's MIG from the body corner); the part stays on its own bench.
4. **Step resolution scope.** A step's bench = `benchByGroup[part.group]` unless the step
   carries a `bench` override. Tool ids are unique within a bench; a step's tool id
   resolves on its resolved bench. (Both benches may own a `torque-wrench`; they are
   distinct tools.)
5. **Job identity and persistence.** Repair jobs live in `state.jobs` with kinds
   `service` / `rebuild` / `restore` and a `stepsDone` counter. Identity includes the kind,
   so a resume can never deliver a different band than the button said (closes the
   sprint 193 resume-band defect by construction). Ticked steps persist across days and
   hire lapses; grade updates only when the last step ticks.
6. **Money.** The job's full parts bill (`restoration.repairStepFraction` x band steps
   crossed x the installed part's catalogue price, exactly today's `costToBandYen` maths)
   is charged when the first step runs, then frozen. Hire fees are charged at hire time,
   once per day per line, never per operation. Steps are atomic: no partial-step labour,
   a step either runs (energy available) or the button is disabled.
7. **Energy.** Job energy = steps x `energyPerStepPoints` (+ x3 on slogged steps)
   + in-situ buried surcharge (Service only) + removal/refit action energy as today.
   Start grade never changes job energy. Crew skill discount is re-expressed per step:
   the benched crew's discount subtracts from each step's cost, floored at 1 point.
   The lift subtracts 1 further point per step and per remove/refit action on `underCar`
   parts, floored at 1.
8. **What "tier 3" means is unchanged.** Owning the covering shop = tool level 3 and
   implies the whole covered tier 2 kit is available. Machining and craft operations keep
   their existing shop-ownership gating untouched.
9. **The body panel pipeline is untouched**, including sprint 222's hire semantics for it
   (a body-line hire still grants the pipeline's `fullCapability`). Parts-repair hire
   grants tier 2 kit only. The fork is deliberate and recorded here.
10. **No save compatibility** (directive 19): every state-shape sprint bumps
    `SAVE_VERSION` (saveCodec.ts) and the Dexie version; no migrations, no legacy
    branches.
11. **Transitional coexistence is allowed inside the arc only.** New sim machinery lands
    beside the old (sprints 225-227), the UI swaps onto it (228-230), and sprint 231
    deletes every old surface and registers the retired identifiers. Nothing transitional
    survives the arc.

## Sprints

| Sprint | Goal | Layer |
|---|---|---|
| 224 | workbench.json (benches, boards, all 23 recipe sets), taxonomy `underCar`, additive economy keys, new tool prices, guard re-pins | content |
| 225 | The job engine: job cards, routes, step execution, job state, money, grades | sim |
| 226 | Access and hire rework: hire = tier 2 kit, one line per day, slog, lift, classifieds kill, per-op assist fees retired | sim |
| 227 | Consumers re-based: service-job generation and quoting, diagnosis fix costs, valuation (D-A1), probes, bots, goldens | sim |
| 228 | Garage purchase page (benches / the bay / rooms), hire panel update | game |
| 229 | Bench screens: shadow boards, bench surface, step strip, slog affordance | game |
| 230 | On-car flow: job card panel, tool trolley, in-situ Service, tyre fitting, CarDetailScreen surgery | game |
| 231 | Retirement: old pipeline, old keys, old screens deleted; retired identifiers registered; final re-pins; typecheck carve-out | both |
| 232 | Tutorial retrace (maintainer-traced), day log and finance lines, full copy sweep, arc exit | both |

## Retirement checklist (owned by sprint 231, ticked as sprints land)

Closed out by sprint 231. Five items retired in full, four survive under decision D-R1
(delete only what is genuinely unreachable), each with its reason below. Every survival is
carried in `TODO.md`; none is left dead-but-alive without an entry.

- [ ] `machineGate` (taxonomy field + `MachineGateOperationSchema` + `machineGateGroupFor`)
      **SURVIVES, live in the arc's own new engine.** `removalEnergyPointsFor`
      (`repairJobs.ts`) sizes remove-and-refit energy through it, `assemblyMachineGateGroup`
      reads it for every assembly row, and the tyre bench-fit note reads it too. It gates
      operations, which the three-job model still has.
- [ ] `repairBandCeilingByTier` + `repairCeilingForLevel` + `clampRepairTarget`
      **ALL THREE SURVIVE.** The first two are on the live body-shop chassis path, which
      D-R1 spares; `clampRepairTarget` is additionally read by `sensibleRepairTargetBand`
      (`marketValue.ts`), outside the repair path entirely.
- [ ] `energyPerBandStepByToolTier` + `energyToClimb`'s tier parameter
      **BOTH SURVIVE**, on two independent paths: the chassis repair path, and
      `toolShopInfo`/`toolTierInfo`, whose player-facing tool-line copy on the Upgrades
      screen is not a repair surface at all. The tier parameter cannot go while the key does.
- [x] `machineShopAssist` (whole block) + `machineAssistFeeYen` (`signatureOpFeeYen` is
      already gone: sprint 227 retired the one probe that read it and the function with it)
      Block deleted from `economy.json` and `economy.ts`; approval gate re-pinned with its
      retirement paragraph. `machineAssistFeeYen` was already gone (sprint 226).
- [x] `machinelessLaborMultiplier` + `machineLaborMultiplier` (replaced by slog routing)
      `machinelessLaborMultiplier` retired with its block, replaced by
      `toolHire.slogMultiplier`. **`machineLaborMultiplier` SURVIVES**: the new engine's
      removal energy, the body pipeline's weld rate and the machine-labour disclosure all
      call it. Slog routing replaced its repair use, not its other three.
- [x] `machineListing` / `nextMachineListingDay` / `rollMachineListings` (D-A2)
      Already gone from code (sprint 226); the inert `economy.machineListings` tuning block
      they left behind is deleted here, and all three names are registered in the guard.
- [ ] `workbenchPartId` (replaced by `benchParts`), `WorkStationTray.vue`, `WorkbenchPanel.vue`
      **`WorkbenchPanel.vue` deleted** with its test and its `screens/workshopFloor.ts`
      helper module. **`WorkStationTray.vue` SURVIVES**: the machine shop still mounts it,
      and nothing in it was workbench-specific. **`workbenchPartId` NOT DELETED** and still
      written by the station helpers; carried in `TODO.md` as the one unfinished item on
      this list.
- [x] `serviceJobTemplates` per-task `minToolTier`
      Already gone from code (sprint 227). Not registered in the guard: the only remaining
      mentions are `saveCodec.ts`'s per-version log, which the guard scans, and erasing a
      version's own description would falsify the record rather than keep a dead name dead.
- [x] Old store actions `repair` / `reconditionPart` and the `repair-zone` / `recondition-part` job kinds
      `reconditionPart` and `recondition-part` deleted outright, with the whole recondition
      resolver chain, the `part-reconditioned` day-log entry and the `reconditionPart`
      session event. **`repair()` and `repair-zone` SURVIVE**: the body shop's chassis
      repair is the one reachable caller and D-R1 spares it. `planGroupRepair` was narrowed
      (its tool-tier ceiling parameter dropped, the clamp left solely with `repairJobGate`);
      the rename D-R1 permits was not taken.
