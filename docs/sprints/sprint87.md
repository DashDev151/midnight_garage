# Sprint 87 - The assembly model

Third sprint of the 2026-07-18 playtest arc (item 11a, and the systemic half of 21).
Sim-first: the repair flow gains sub-assemblies; the diagram UI that surfaces them properly
is Sprint 88. Depends on Sprint 85 (machine-shop assist, phantom-mint fix).

## Reuse analysis (directive 16)

**New mechanisms (genuinely new):**

- Assembly definitions in content (three of them) and an assembly container in inventory.
- Atomic assembly remove/refit operations composed over the existing per-slot resolvers.
- A wheels-group machine fee (tyre fitting) added to the Sprint 85 assist table.

**Existing mechanisms to reuse (the load-bearing list):**

- The per-slot `CarInstance` model, `installed`/`vacatedBaseline` and the equivalence rule
  are reused VERBATIM per member slot. An assembly op is a batched multi-slot operation
  over the same bookkeeping; there is no second labour model.
- The `blockedBy` graph stays the physical truth: an assembly's external blockers are the
  union of its members' blockers pointing outside the assembly; edges internal to an
  assembly stop mattering once it is on the bench (that is the point of a bench).
- `removeMachineGateGroup` + Sprint 85 assist fees gate assembly ops exactly as they gated
  buried-part ops (same groups, same fees, same ledger posting).
- `resolveReconditionLabor` / bench repair already operates on loose `PartInstance`s;
  members of an opened assembly go through it unchanged.
- Sprint 79's labour law lifts wholesale: removal free, equivalence refit free, repairs and
  changed members cost. The three binding worked examples from `sprint79.md` are re-pinned
  at assembly level with identical totals.
- Staged-work planning (`stageAction`/`stagedWork.ts`) is extended with the two new action
  kinds; the confirm/labour pipeline is untouched.

## The model

Three assemblies, defined in content (`parts-taxonomy.json` gains an `assemblies` block,
Zod-schema'd):

| id | members | station (tool line) | external blockers | machine gate |
| --- | --- | --- | --- | --- |
| `wheelAssembly` | rims, tyres | wheels (tyre machine) | none | none to remove; tyre ops need wheels tier 2 or fee |
| `engineAssembly` | block, internals, headValvetrain, camsTiming | engine (crane & stand) | intake, exhaust, cooling | engine tier 2 or assist fee, both directions |
| `gearboxAssembly` | gearbox, clutch | drivetrain (bench) | driveline, exhaust | drivetrain tier 2 or assist fee, both directions |

Everything else stays a per-part, car-level operation exactly as today (bolt-ons and
surface parts never grew ceremony; the complaint was the buried clusters and the wheel).

**Operations:**

1. **Remove assembly** (car-level): legal when all external blockers are vacant; 0 labour
   (Sprint 79 law); machine gate satisfied by ownership or the assist fee. All member
   instances move into one assembly container in inventory; each member slot stamps its
   `vacatedBaseline` as per-slot removal does today. `brakePadsDiscs`/`brakeCalipersLines`
   keep their `blockedBy: [rims]` edge, now satisfied by the wheel assembly being off.
2. **Bench work** (station-level): an assembly on the bench exposes every member with no
   internal ordering (engine on a stand: everything reachable). Repairs use the existing
   recondition path and prices. Swapping a member (e.g. a new tyre onto the rims) is an
   inventory move into the container; tyre-into-assembly ops require wheels tier 2 or the
   new wheels fee.
3. **Refit assembly** (car-level): 0 labour for the operation itself plus per-member
   charging: members equivalent to their `vacatedBaseline` refit free, changed members
   charge their normal install labour (`installSlotsByClass`). Machine gate applies as on
   removal. The container dissolves back into the car's slots.
4. Assemblies can also be **built on the bench from loose parts** (bare rims + new tyres
   make a wheel assembly) and installed onto a car with only vacancies; every member
   charges install labour then, as new-to-car parts do today.

**Worked example, re-pinned (the tyre change):** pull wheel assembly (0), fit new tyre at
the machine (fee if renting), refit assembly (tyre charges 1 bolt-on slot, rims free by
equivalence). Total 1 labour slot: identical economics to today's four-step ceremony,
minus the fiction damage.

**Worked example (worn internals):** strip intake/exhaust/cooling (0), pull engine
assembly (0 + crane or ¥15,000 assist), repair internals on the stand (normal cash and
labour), refit assembly (internals charge 2 buried slots; block/head/cams free by
equivalence; + crane or ¥15,000 assist). Same repair economics as the current
part-by-part chain; two assist fees end to end when renting, which is the margin the
maintainer's rental ruling intends.

## Decisions

1. Content: `assemblies` block as above; wheels assist fee added to
   `economy.machineShopAssist.feeYenByGroup` at 3,000 yen per tyre operation (a 1995
   tyre-shop fitting charge; the ¥150,000 tyre machine is the natural first tool purchase
   because this fee is the one bread-and-butter service jobs eat).
2. Sim: assembly container state (`assemblyInventory`), the two composite resolvers, the
   bench-work pass-through, staged-work support. Deterministic, seed-free additions.
3. Coherence probes (closed-form, Vitest): (a) the Sprint 79 worked-example totals hold at
   assembly level (the three binding cases); (b) service-job payouts on tyre/brake
   templates still clear costs when the wheels fee applies (renting must never make a
   standard job loss-making); (c) story-mission satisfiability probes green with assembly
   ops + fees in their recipes.
4. UI, minimal only (Sprint 88 is the real surface): assembly rows on CarDetailScreen with
   Remove/Refit and a plain "On the bench" panel listing open containers with the existing
   per-part row controls. Captions reuse the swept Sprint 85 assist string.
5. Save schema: Dexie bump, no migration, no compat (directive 19).
6. The tyres/rims `blockedBy` relationship becomes assembly-internal; verify no remaining
   surface lets a tyre be removed "from the car" while the wheel is on it.

## Definition of done

- [ ] Three assemblies removable/refittable as units with the labour law holding
      (worked-example probes pin the totals).
- [ ] Members of a benched assembly all workable with no internal ordering; tyre ops
      gated by machine-or-fee.
- [ ] Renting never makes a standard tyre/brake service job loss-making (probe).
- [ ] Assembly ops post fees to the ledger; budget caps see them.
- [ ] Staged-work planner handles assembly actions; existing per-part flows untouched
      elsewhere.
- [ ] Narrowest checks once; pre-push gate is the evidence (directive 20).

## Task breakdown

**Claude-implementable:** all of it. **User-only:** none.

## Exit

(Filled at sprint close.)
