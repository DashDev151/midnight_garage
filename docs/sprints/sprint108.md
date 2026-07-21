# Sprint 108: Diagnosis V - the authoring sweep (every doubt becomes a route)

**Date:** 2026-07-21
**Source:** the Sprint 106 routing machinery and its three-tree vertical slice, once the
maintainer's playtest validates the fork feel. This sprint is almost entirely authoring:
the remaining fifteen symptoms get their trees, within the schema and laws 106 shipped.

**One-line goal:** every symptom in the game is a routed diagnosis - read, choose, learn,
close - with dead ends, grenade routes, and copy that carries the mechanics.

**Gate:** does NOT start until the maintainer's slice verdict from 106. If the slice needs
reshaping, that happens first and this sprint inherits the reshaped laws.

## Reuse analysis (directive 16)

**Existing mechanisms reused (this sprint builds nothing):**

- The complete Sprint 106 machinery: `unlockedBy`, `availableTestIdsFor`, the `locked`
  outcome, the routed `SymptomChecklist`, the integrity refinements. Untouched.
- The Sprint 105 cause spectra: every ladder, weight, and scrap catastrophe stays as
  authored; this sprint wires ROUTES over them, it does not re-balance them.
- `diagnosticTests.json`: new cheap observation tests register in the existing flat
  registry, exactly as `clutch-drag-check` and `magnet-check` did.
- The tutorial-satisfiability probe and the `four-wheels` tutorial lot: the standing guard
  that the guided path still resolves.
- The content-quality bar and the era band (1995-2005): every line personally swept by the
  orchestrator; result lines double as routing hints, so the sweep is a gameplay review.

**Genuinely new:** nothing mechanical. Fifteen authored trees, their new observation
tests, their copy, and the sweep-wide probes below.

## Design

### 1. The authoring laws (from 106, applied at scale)

- **Information before choice:** every fork rankable from the previous result line or the
  card line. No blind 50/50s.
- **One dead end per tree where it earns its place** - predictable to a reader, honest
  after the fact. Not every symptom needs one; a two-cause doubt may not support one
  worth authoring.
- **The grenade route:** for each of the thirteen symptoms hiding a scrap cause, a best
  route decides the write-off in or out within two tests. The walk-away question is the
  auction's clock question; it must never require a full workup.
- **Layers 2-3, never deeper.** Short branches are fine (a lucky first test may close the
  case); depth is for the interesting middles, not for its own sake.
- **Deliberate residual ambiguity stays a lever.** A symptom may remain partially knowable
  (Sprint 105's design lever, e.g. `wont-idle`'s bench-only ECU-versus-cams call); each
  such case is listed explicitly in the Exit so the probe asserts it rather than fails
  on it.

### 2. Scope: the fifteen

The slice (106) covered `damp-passenger-footwell`, `smokes-on-startup`,
`crunch-into-second`. This sprint routes the remaining fifteen, including the other ten
grenade-bearing doubts (`non-starter`, `tick-at-idle`, `diff-whine`,
`quarter-panel-filler`, `oil-pressure-flutter`, `overheats-in-traffic`,
`hesitates-under-load`, `wont-idle`, `clunk-over-bumps`, `sagging-spring`) and the five
honestly non-fatal ones (brakes, steering, tyres, exhaust, and kin), which may stay
shallow - a flat two-test doubt is legitimate where the ladder is simple; routing for
routing's sake is noise.

Special care:

- **`tick-at-idle`** is the tutorial's diagnosis (`four-wheels`: one stethoscope run
  resolves the lifter). Its tree must keep that single-test resolution reachable at the
  root, or the tutorial breaks. The satisfiability probe is the gate; if the tree and the
  tutorial conflict, the tree bends, not the tutorial.
- **`wont-idle`** keeps its deliberate bench-only ambiguity; its tree routes what IS
  knowable at the yard and closes honestly short.

### 3. Budget pressure is the point

With trees of 2-3 tests plus observation looks, fully resolving one doubt costs roughly
20-40 minutes of the shared 60-minute visit. Two symptomatic cars in a yard means the
player CANNOT do everything: route well on both, or resolve one and gamble the other.
That scarcity is the strategy layer and it needs no new mechanism - it falls out of
minutes, trees, and the shared visit.

### 4. Probes (arithmetic, in Vitest, per directive 21's spirit)

- Integrity (from 106, now sweep-wide): unlock references valid, acyclic, roots exist,
  depth <= 3.
- Grenade-route: for each scrap-bearing symptom, some route decides the scrap cause in or
  out within two tests (assert by walking the content, no bots).
- Resolution accounting: for every symptom, either every cause is isolatable by some
  route, or the symptom appears on the explicit deliberately-ambiguous list in this doc's
  Exit.
- Tutorial satisfiability: stays green throughout.

## Decisions

1. **Authoring, not building.** Any mechanical gap discovered here goes back into a 106
   follow-up, not hacked in mid-sweep.
2. **Shallow is allowed** where the ladder is simple; the five non-fatal doubts are not
   padded to three layers.
3. **The tutorial wins** any conflict with `tick-at-idle`'s tree.
4. **Ambiguity is declared, not accidental:** the deliberately-partial symptoms are listed
   in the Exit and asserted by the probe.
5. **Every line swept personally** against the content bar, era 1995-2005; the routing
   hints make this a mechanics review as much as a tone review.

## Tasks

**Claude-implementable:**

- [ ] Author the ten grenade trees (routes, dead ends where earned, new observation tests
      registered, all result copy).
- [ ] Author the five non-fatal doubts (shallow where right).
- [ ] Probes: grenade-route walker, resolution accounting + the declared-ambiguity list,
      sweep-wide integrity; tutorial satisfiability green.
- [ ] Copy sweep: orchestrator reads every new line personally; sign-off recorded in the
      Exit.
- [ ] Docs: the routing laws recorded as the design of record (progression-bible amendment
      only if the maintainer rules it law; otherwise this doc).

**User-only:**

- [ ] Slice verdict from Sprint 106's playtest (the gate to start).
- [ ] Full-sweep playtest afterwards; tune minute costs and tree shapes.

## Exit

- [ ] (filled at completion; must include the declared deliberately-ambiguous list and the
      copy sign-off)
