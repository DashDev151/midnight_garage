# Sprint 199: the lever census

**Status: DESIGNED, implementing.** Workstream F steps 1 and 2 of the economy overhaul
brief. Read-only with respect to the game: this sprint changes no behaviour and moves no
value. Its output is a table, a one-page summary, and a kill list.

**Levers: NONE moved.** Deletions are lever changes too, so the kill list is a proposal,
not an edit.

## Why

`economy.json` carries 1,053 leaves across 44 top-level groups, plus 51 in
`partPricing.json`. At that scale nobody can hold the state in their head, and the
governance unit (per-value sign-off) outgrew the thing it governs. Directive 22 has since
moved to behaviour-first sign-off, which makes the census MORE useful, not less: to sign
behaviours you first have to know which levers actually shape a decision and which are
scenery.

## The vocabulary (use these terms in all census output)

- **Anchor**: a governed leaf. The census applies only to anchors; derived values are
  never edited.
- **Load-bearing**: shapes a decision a player actually makes. Test: name the decision.
  If none can be named, it is not load-bearing.
- **Texture**: changes feel, never a decision (reaction chances, wobble, display steps).
  Legitimate, frozen at defaults, exempt from sign-off ceremony.
- **Shadow price**: two levers pricing the same concern (`fearPremium` was one, killed in
  Sprint 98). There are more.
- **Dead**: nothing reads it, or another system fully masks it.
- **The wiggle test**: would a playtest notice this lever at plus or minus 50 per cent?
  No means texture.

## Reuse analysis (directive 16)

**Existing mechanisms reused:** `EconomyConfig`'s typed access is the greppable seam
(`context.economy.<key>` everywhere); `economyApprovalGate.test.ts`'s header is already a
de-facto lever changelog and is the provenance source; the brief's Workstream F supplies
the vocabulary above; the known-dead candidates are already recorded (`fearPremium`'s
three references inside the condemned `tools/balance`, one of which would throw on
contact).

**Genuinely new:** the trace tool. It is committed rather than run once, so "is this
lever dead" stays answerable and a newly dead lever gets caught instead of accumulating.
The alternative is doing this census again by hand in a year.

## Tasks

### A. The mechanical trace (a committed tool, not a script)

- A1. For every leaf in `economy.json` and `partPricing.json`, find its consuming
  function(s) in `packages/sim`, and in `packages/game` for display and copy levers.
  Resolve real property-access chains rather than raw text matching where the two differ;
  aliasing and destructuring must not produce false "dead" verdicts.
- A2. Accuracy checks the tool must pass before its output is trusted: a sample of
  known-consumed levers is found with the right consumer, and the known-dead
  `fearPremium` case is flagged. State the tool's confidence limits in its own output;
  an unverifiable verdict is reported as unknown, never as dead.
- A3. Output: the full table (leaf path, consumers, unread flag, mask or shadow
  candidate). Machine-readable, regenerable, not committed as stale data.

### B. Classification

- B1. Classify by GROUP first (44 groups), dropping to individual leaves only where a
  group is genuinely mixed. Each row or group gets: consumer, the player decision it
  serves or "none", the wiggle verdict, and the tier (anchor / texture / dead /
  shadow-of-X).
- B2. Deliverable that a person reads: a one-page summary. How many leaves are dead, how
  many are shadow prices, how many survive as anchors. The brief's acceptance test is
  that the surviving anchor count is measured in dozens, not hundreds, and that number is
  the output that matters.
- B3. The kill list: dead levers and shadow prices, named, with the evidence for each.
  Proposal only.

### C. The open question this census must answer

During the Sprint 202 tool-hire analysis one question was raised and deliberately left
open: **do the sensible-restore and no-free-lunch probes charge machine hire against the
flips they certify?** If they never did, the "fixing always pays" guarantee was being
measured without the largest cost a day-one player actually paid, and the probes were
certifying a margin nobody could realise. Answer it with evidence either way, and record
what follows. (Note the answer's blast radius shrank in Sprint 202: hire is no longer
mandatory. The question is about what the probes MEASURE, which still matters.)

## Definition of done

- The trace tool exists, is committed, passes its accuracy checks, and regenerates the
  table on demand.
- The one-page summary states the dead count, the shadow count, and the surviving anchor
  count.
- The kill list is on the maintainer's desk with evidence per entry, nothing deleted.
- Question C is answered with evidence.

## Exit

- **A (trace tool).** `tools/lever-census/traceLevers.cjs`, committed, run via
  `node tools/lever-census/traceLevers.cjs`. Uses the TypeScript compiler API syntactically
  (no type checker, no cross-file call graph): per file it resolves real alias chains for
  `economy`/`ECONOMY`/`partPricing` roots, including destructuring and reassignment, and
  classifies each of the 1,112 flattened leaves (1,061 `economy.json` + 51 `partPricing.json`)
  as `CONSUMED` (exact/descendant chain), `CONSUMED_VIA_GROUP` (named ancestor object handed
  off whole), `DYNAMIC` (non-literal index reaches it), `UNKNOWN` (only its group's siblings
  are confirmed live) or `DEAD_CANDIDATE`. The bare config root is deliberately excluded from
  being treated as leaf-level evidence (it is threaded through nearly every module and would
  otherwise "prove" every leaf, including a fabricated one, alive); a first draft also read
  `economy: EconomyConfig` type annotations as value-level usage until `ts.isTypeNode` and
  interface/type-alias bodies were explicitly skipped. `tools/lever-census/runAccuracyChecks.cjs`
  is the accuracy gate: 12 checks, all passing, covering known-consumer resolution, the
  `fearPremium` known-dead case (confirmed zero references outside the condemned
  `tools/balance`), the fabricated-leaf dead path, the group-liveness rescue path, and a
  regression guard against the type-node bug. Output (`tools/lever-census/output/leverTrace.json`)
  is gitignored and regenerated on demand, never committed as stale data.
- **B (classification and summary).** `docs/reviews/lever-census.md` states the dead count (1:
  `economy.AUCTION_WHOLESALE_FRACTION`, evidence and kill-list entry inside), the shadow count
  (0: `fearPremium` already killed and confirmed gone), and the anchor count (roughly 130 named
  lever clusters / ~221 leaves surviving the per-leaf wiggle test, against 191 physics/calibration
  leaves and 328 authored-catalogue leaves that are load-bearing but not independently
  sign-off-able). That is short of the brief's dozens-not-hundreds target for THIS first pass;
  the doc states plainly that closing the remaining gap is the maintainer's own texture and
  measured-behaviour calls on the borderline items, not a call this sprint pre-empts.
- **C (machine hire question).** Answered no, with file:line evidence: the sensible-restore and
  no-free-lunch probes live in `packages/sim/tests/valueModelProbes.test.ts` (not
  `balanceProbes.ts`, which the sprint doc named but which holds a different, related probe
  set); repair cost there routes through `carCostToBandYen` (`packages/sim/src/bands.ts:256-280`),
  which never reads `economy.machineShopAssist.feeYenByGroup`. Machine hire is a separate daily
  running cost (`resolveHireMachineLine`, `packages/sim/src/jobs.ts:646-660`) charged only
  through the job-booking flow. The certified margin covers the always-available
  machineless-rate path (never a wall, per `jobs.ts`'s own comment), not the pay-to-hire path,
  which spends real cash the probes never subtract.
- Nothing moved: `economy.json`, `partPricing.json` and the approval gate's pinned hashes are
  untouched. Deletion of `AUCTION_WHOLESALE_FRACTION` is a proposal on the maintainer's desk,
  not an edit.
