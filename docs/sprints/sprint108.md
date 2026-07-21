# Sprint 108: Diagnosis V - the authoring sweep (every doubt becomes a route)

**Date:** 2026-07-21
**Source:** the Sprint 106 routing machinery and its three-tree vertical slice, once the
maintainer's playtest validates the fork feel. This sprint is almost entirely authoring:
the remaining fourteen symptoms get their trees, within the schema and laws 106 shipped.

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

**Genuinely new:** nothing mechanical. Fourteen authored trees, their new observation
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

### 2. Scope: the fourteen

The slice (106) covered `damp-passenger-footwell`, `smokes-on-startup`,
`crunch-into-second`. This sprint routes the remaining fourteen, including the other ten
grenade-bearing doubts (`non-starter`, `tick-at-idle`, `diff-whine`,
`quarter-panel-filler`, `oil-pressure-flutter`, `overheats-in-traffic`,
`hesitates-under-load`, `wont-idle`, `clunk-over-bumps`, `sagging-spring`) and the four
honestly non-fatal ones (brakes, steering, tyres, exhaust, and kin), which may stay
shallow - a flat two-test doubt is legitimate where the ladder is simple; routing for
routing's sake is noise.

Special care:

- **`tick-at-idle`** is the tutorial's diagnosis (`four-wheels`). Maintainer ruling
  (2026-07-21): the tutorial predates the routed system and BENDS TO IT - the system is
  never weakened to fit it. The tree goes fully legal (no law-1 exception); the tutorial's
  guided step becomes the two-step read (revs-and-listen, then the stethoscope) and the
  satisfiability probe is updated with it, in this sprint.
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
2. **Shallow is allowed** where the ladder is simple; the four non-fatal doubts are not
   padded to three layers.
3. **The system wins** any conflict with the tutorial: the tutorial is updated to teach
   the real tree, never the reverse (maintainer ruling, 2026-07-21).
4. **Ambiguity is declared, not accidental:** the deliberately-partial symptoms are listed
   in the Exit and asserted by the probe.
5. **Every line swept personally** against the content bar, era 1995-2005; the routing
   hints make this a mechanics review as much as a tone review.

## Tasks

**Claude-implementable:**

- [x] Author the ten grenade trees (routes, dead ends where earned, new observation tests
      registered, all result copy).
- [x] The four non-fatal doubts stay FLAT deliberately (two honest causes, one honest
      test is a complete mechanic; the laws bind routed symptoms only).
- [x] Probes: grenade-route walker, resolution accounting + the declared-ambiguity list,
      sweep-wide integrity; tutorial satisfiability green.
- [x] Copy sweep: every line authored by the orchestrator personally (see Exit).
- [x] Docs: the routing laws live in `docs/design/failure-map.md` (the diagnosis bible).

**User-only:**

- [x] Slice verdict given; board mark-up signed off 2026-07-21 ("happy to sign off; we
      can always tune later").
- [ ] Full-sweep playtest; tune minute costs, tree shapes, symptom odds, and the demo
      pair variety.

## Exit

- [x] All THIRTEEN routed boards live (10 built this sprint over the three slice trees),
      plus the four deliberately flat doubts. Registry at 62 failure modes (7 new gems/
      moderates added; worn-propshaft-uj renamed collapsed-centre-bearing per the external
      mechanical review). 19 new diagnostic tests registered.
- [x] Every law green on every board, measured and pinned (reader / blind / ratio /
      grenade minutes): footwell 17.4/31.8/1.83x/15, smokes 19.1/30.8/1.61x/30, crunch
      25.0/42.5/1.70x/25, non-starter 21.7/32.6/1.51x/15 (tightest on the map, reported
      honestly), tick 10.0/25.3/2.53x/10, wont-idle 18.8/31.9/1.70x/30, clunk
      15.0/28.9/1.93x/15, overheats 20.4/37.2/1.82x/35, diff-whine 16.5/33.1/2.01x/20,
      sagging 18.5/33.3/1.80x/25, quarter-panel 15.0/27.0/1.80x/20, flutter
      15.3/30.1/1.98x/25, hesitates 17.0/31.1/1.83x/30.
- [x] **The declared-ambiguity list is EMPTY.** Wont-idle's ECU-versus-cams call, planned
      as bench-only, resolves by elimination under the approved root (spray clears the
      leak, compression clears the valve); the bible records the correction. Every cause
      on every board is isolatable at the yard.
- [x] Copy provenance: every result line authored by the orchestrator under the Vimes
      voice law (bible law 6), through three external reviews all applied: the
      mechanical-accuracy review (9 rulings, 2 structural swaps), the Vimes pass (2
      priority-1 fixes, the rail keep-and-earn ruling, the scaffold variation rule), and
      the final review (the non-starter card line no longer pre-answers its own grenade:
      "Won't start."; the electrics negative reads voltage, not cranking). The
      earn-the-rail worldview ships in three lines (spring seats, the boot, the fuel
      tank). Grenades carry dry gallows weight; gems land the treasure moment; the
      honest-limit closing waits for a board where the limit is mechanically real.
- [x] Symptom odds retuned to the maintainer's half-and-half (symptomChanceByTier
      0.55/0.50/0.45/0.35, was 0.45/0.30/0.22/0.12): roughly half the yard now carries a
      doubt, graded so rarer cars run cleaner. A symptomless car remains uninspectable by
      construction.
- [x] Tutorial teaches the two-step read (ears first, then the stethoscope), gated on the
      new testRun condition; the orchestrator personally traced the gating and the tree
      maths end to end (lifter-tick: revs-and-listen group 0 -> stethoscope isolation ->
      lotInspected). The bid step's reveal stays truthful.
- [x] Golden masters re-pinned twice (registry expansion, then the odds retune), both
      case (a); repeat-run determinism unchanged. Demo pair reshuffled: the steal is a
      Honda CR-X SiR (EF8) (read ¥196,877 / true ¥221,938), the trap a Honda Prelude Si
      VTEC (BB4) (read ¥444,437 / true ¥308,951, a rotted strut turret under a ¥444k
      read). Noted for the playtest: both demo lots currently roll sagging-spring; a
      variety criterion in the demo picker is a tunable nicety, not a defect.
- [x] Evidence: sim + content 67 files / 1483 passed; game 51 files / 642 passed;
      typecheck clean; failure-map regenerated (13 routed, 4 flat, 62 modes).
      Uncommitted, pending maintainer word; the pre-push hook is the full gate.
