# Sprint 109: The failure map (formalising diagnosis)

**Date:** 2026-07-21
**Source:** maintainer design discussion, 2026-07-21, after the board-opens slice landed.
The routed diagnosis system works but exists as three hand-built trees; before the
fourteen-symptom sweep (Sprint 108) bakes in unformalised shapes, the whole structure gets
mapped: failure modes on one side, symptoms on the other, tests tying them together, with
dynamic results and no symptom ever resolving 1:1. Maintainer endorsement: shared
failure-mode registry goes into the v1.0 schema; the map document is the sweep's blueprint.

**One-line goal:** one formal failure map - a shared failure-mode registry in content, a
diagnosis design bible, and a generator that draws the real map from the shipped JSON so
the document can never drift from the game.

**Sequencing:** lands BEFORE the Sprint 108 sweep; 108 then authors to the approved map.

## Reuse analysis (directive 16)

**Existing mechanisms reused (nothing about play changes in this sprint):**

- The routed diagnosis machinery (`unlockedBy`, `availableTestIdsFor`, the board-opens
  laws, the reading-pays probe): untouched. This sprint is structure and documentation.
- The cause model (`carPartId` + `setBand` + `weight`, worse-of application at
  generation): the registry carries exactly these fields; symptoms keep their own
  weights (odds are contextual: the same failure is likelier under some symptoms).
- The route probes: keep running unchanged over the resolved (registry-joined) shape.
- `docs/design/live-auction.md` precedent: a design-of-record document owned by the
  maintainer's review flow.

**Genuinely new:**

1. `packages/content/data/failureModes.json` + Zod schema: the global registry
   ({ id, carPartId, setBand }); a symptom's cause entry becomes
   { failureModeId, weight }.
2. The migration of all 17 symptoms' inline causes into registry references (pure
   restructure; identical resolved values; duplicate-id collisions merged or renamed
   deliberately and reported).
3. `docs/design/failure-map.md`: the diagnosis bible (ontology, laws, the full map).
4. `scripts/generateFailureMap.cjs`: reads the shipped content JSON, emits the mermaid
   map to `docs/design/failure-map.generated.md`. Run when content changes; the design
   doc links it.

## Design

### The ontology (the formal structure)

- **Failure mode:** ground truth. A specific fault in a specific component with a
  severity band. Global registry; terminal nodes of the map. One is rolled true per
  car-symptom, weighted.
- **Symptom:** a public observable pointing at 2+ failure modes with weighted odds (the
  odds the room prices). Never 1:1 with a cause - enforced by schema (min 2) and the
  root-shape probe.
- **Test:** an edge. Binary result, determined by the car's rolled failure mode, so the
  same test on the same symptom answers differently car to car. Costs minutes from the
  shared visit.
- **Finding:** what a result produces - a knowledge state (the surviving failure modes)
  plus its authored line. Findings stay implicit in content for v1.0 (per-symptom trees,
  proven and probe-checked); the map document draws them explicitly, and if the full map
  shows the same sub-tree recurring, promoting findings to shared nodes is the recorded
  follow-up, evidence first.
- **Dead end:** contextual, never a node type: any test whose split does not divide what
  is currently still suspected. Every test is signal in some knowledge states and waste
  in others; only reading separates them.

### The laws (probe-enforced, inherited by every future symptom)

1. Root shape: no root outcome carrying more than 25% of the weight resolves outright.
2. Choice everywhere: once a test has run, every unresolved node offers 2+ unrun tests.
3. Waste and signal: every such node offers a live dead end AND a narrowing test.
4. Reading pays: blind expected minutes >= 1.5x weighted best-route minutes.
5. Grenade budgets measured and pinned per symptom.
6. Copy is the compass: every result line routes; tone per the art/content bar
   (mechanically true, wholesome, dry, never cringey).

### Open decision parked with the maintainer (recorded, not implemented)

Cross-symptom coherence: a two-symptom car whose symptoms trace to the SAME rolled
failure (one bill, one "it's all one thing" reveal). Becomes cheap to express once the
registry exists; needs an economy read before it is switched on.

## Tasks

**Claude-implementable:**

- [ ] Registry schema + `failureModes.json` + symptom schema referencing it; content
      loader/sim resolution; migration of all 17 symptoms (collisions reported, resolved
      values proven identical by the passing suite).
- [ ] `scripts/generateFailureMap.cjs` -> `docs/design/failure-map.generated.md`.
- [ ] `docs/design/failure-map.md`: ontology + laws (orchestrator-authored) + the full
      seventeen-symptom map: the three routed trees as built, and the fourteen unrouted
      boards DESIGNED for maintainer review (orchestrator-personal design work; the
      Sprint 108 sweep implements only what survives that review).

**User-only:**

- [ ] Review the fourteen designed boards in `failure-map.md`; mark up; the approved map
      gates Sprint 108.

## Exit

- [ ] (filled at completion)
