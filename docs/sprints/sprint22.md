# Sprint 22 — Hidden issues and inspection: the information game

*Source: maintainer finding, 2026-07-10 ("the whole inspect car and hidden issues like apex seals
etc.. do fuckin nothing... we need to rethink how we do this implementation") — third sprint of the
foundational-economy arc. The 2026-07-10 review verified the complaint: `repairCostBaseYen` is dead
data; an applied issue is indistinguishable from ordinary low condition; nothing persists after
purchase (`CarDetailScreen.vue` never mentions issues); and the handover rule actively *punishes*
inspecting (inspected lots take full rolled severity, blind at-book buys average half — an
inversion). Status: **designed, not yet implemented. Depends on Sprints 20 + 21** (open bidding with
a wholesale anchor; `marketValueYen` with its declared-but-zero `issuePenaltyYen` seam).*

## Goal

Hidden issues become the reason cars are cheap, and inspection becomes buying an information edge:
the assembled dealers price a lot at *average* model risk ("everyone knows these rust"), the
inspected player knows the *actual* car. Owned, an issue is a named, persistent, individually priced
defect (finally using `repairCostBaseYen`) that must be fixed through its own job — repainting a car
does not fix its apex seals. This is where the buy-side skill and the profit spread of the whole
economy live.

## Reuse analysis (directive 15)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Issue catalog | `HiddenIssueSchema` (`id, componentId, severityMin, severityMax, hintText, repairCostBaseYen`) + `hidden-issues.json` + per-model `hiddenIssueWeights` | Unchanged content. `repairCostBaseYen` finally gets read. |
| Issue rolling | `generateAuctionCarInstance`'s weighted issue draw (`auctions.ts`) | Same draw; it now also rolls the severity (see Design) instead of deferring it to handover. |
| Inspection action | `resolveInspectLot` + `AUCTION_TRAVEL_FEE_YEN` | Same action, same fee, same instant-resolver shape — what it *reveals* gets richer. |
| Repair job system | `Job`/`findOrCreateJob`/`repairJobGate` (equipment + consumables at creation, `jobs.ts:180-240`)/`applyAvailableLaborToJob`/`completeJob` | Issue-fixing is a new job **kind** through the same lifecycle, gates, labor and bay rules — NOT a parallel system (directive 15; the Sprint 08 lesson). |
| Staged work | `StagedActionSchema` + `stagedCarWork` + `confirmStagedWork` (Sprint 18) | Fixing an issue is staged/confirmed exactly like repair/install. |
| Value plumbing | `marketValueYen`'s `issuePenaltyYen` seam (Sprint 21, hardcoded 0) | This sprint fills the seam in — no call-site changes. |
| Auction pricing | Sprint 20's `demandCeilingYen`/buyout via `anchorValueYen(lot)` | Lots get the *risk-average* discount by adjusting the anchor for lots only (see Design) — the room/turnout mechanics are untouched. |
| Quality/lemon reputation | `saleReputationDeltaFor` (Sprint 15) | Extended: unrepaired issues block quality and can trigger lemon. |
| Day feedback | `DayLogEntry` union + `dayLogFormat.ts` + `JobCompleteModal.vue` | Discovery beats and "issue fixed" moments ride the existing pipeline. |
| Save machinery | `SAVE_VERSION` + `MIGRATIONS` + golden saves | Bump 13 -> 14. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **Issues as persistent state on owned cars** (`severityPercent`, `repaired`). Today an issue
   evaporates into a condition subtraction at handover; nothing represents "this car has bad apex
   seals" after purchase.
2. **Effective condition** — `min(condition, 100 - unrepaired severity)` for the affected component.
   Nothing expresses "cosmetically restored but mechanically compromised", which is the entire
   difference between detailing and fixing.
3. **Risk-average lot pricing** — a model-level expected-issue discount on the auction anchor.
   Nothing prices what *everyone* knows about a model separately from what *the player* knows about
   the instance; that gap IS the information edge.
4. **The `fix-issue` job kind** — a repair with a real per-issue cash cost. Existing kinds
   (`repair-zone`, `install-part`) only cost consumables/labor.

### Deleted outright

`resolveHandoverCondition`'s sliding-scale variance rule (`auctions.ts:256-311`) and the
`applyIssueSeverity` condition mutation — including the inspection-punishes-you inversion. Handover
becomes: reveal issues, log a discovery beat if uninspected, never mutate condition.

## Decisions (first-pass numbers in economy.json, openly tunable)

1. **Severity is rolled at car generation** — a NEW `rng.int(severityMin, severityMax)` call added
   inside `generateAuctionCarInstance`'s issue-draw loop (today severity is rolled at handover,
   from a separate lot-seeded rng in `bidding.ts`'s `handoverRng`). Inserting a draw shifts every
   subsequent roll in the shared catalog rng — accepted, goldens re-pin at sprint end. Stored on
   the instance, fixed forever. No handover re-roll, no discount-scaled variance.
2. **Effective condition rule:** `effective(componentId) = min(condition, 100 - maxUnrepairedSeverityOnComponent)`.
   The instance stores only `issueId`, so resolving an issue's component needs the catalog: every
   helper and consumer gains an `issuesById` parameter (from `SimContext.hiddenIssuesById`).
   Consumers: `computeDerivedStats`, `conditionFactor` (marketValue), `averageConditionPercent` /
   `saleReputationDeltaFor`, CarDetail display — grep their callers at implementation time
   (`valuation.ts`, `selling.ts`, `gameStore.ts` confirmed) and record the full list in the Exit,
   the same way Sprint 21 enumerates `valuateCarForBuyer`'s callers. Raw `condition` remains what
   repair-zone jobs set. UI split, explicitly: CarDetail's per-component bar DISPLAYS effective
   condition (with the raw number as subtext when they differ — "100 cosmetic / 60 effective —
   apex seals"); the repair-button visibility check STAYS on raw `condition < 100` (a zone repair
   is still possible and still does what it says).
3. **Issue repair cost:** `issueRepairCostYen = Math.round(repairCostBaseYen x severityPercent /
   50 / 1000) x 1000` (nearest Y1,000, computed inline — no rounding helper exists; a severity-50
   roll costs exactly the base, a 25 costs half). Charged at job creation through `repairJobGate`'s
   existing cash path, *in addition to* the component equipment's consumables; same
   silent-refusal-when-unaffordable behavior. NOTE: `repairJobGate` today opens with
   `if (spec.kind !== 'repair-zone') return { ok: true, state }` — restructure it to branch per
   kind (repair-zone as today; fix-issue with the costs above; install-part stays a no-op here,
   Sprint 24 adds its fit guard separately). Labor: 1 slot if severity < 30, 2 if < 60, else 3.
   Requires the component's equipment (same gate as repair-zone).
4. **Owned/sale-side penalty:** `marketValueYen` stays **issue-blind** (that separation is what
   makes decision 5 implementable). A new wrapper carries the truth:
   `issueAdjustedValueYen(model, car, heatPercent, partsById, issuesById, economy) =
   max(0.1 x bookValueYen, marketValueYen(...) - sum(unrepaired: issueRepairCostYen x
   ISSUE_PENALTY_MULTIPLIER(1.3)))` — a known unfixed defect scares buyers more than the repair
   costs, so fixing before selling is profitable by construction. `valuateCarForBuyer` re-bases
   from `marketValueYen` to `issueAdjustedValueYen` (one line in `valuation.ts`, plus threading
   `issuesById` from `SimContext` through its callers — reuse the caller list Sprint 21's Exit
   records). Sale channels therefore see the truth (issues are always revealed post-purchase —
   Japanese auction sheets disclose; there is no concealment mechanic).
5. **Lot-side (uninspected, buy-side) pricing:** the auction anchor for a lot becomes
   `marketValueYen(visible car — issue-blind by construction, see decision 4) x
   (1 - modelRiskDiscount(model))` where
   `modelRiskDiscount = sum over model.hiddenIssueWeights: weight x avgIssueRepairFraction x
   RISK_DISCOUNT_WEIGHT(0.9)`, with `avgIssueRepairFraction = mean issueRepairCostYen of that
   component's catalog issues at midpoint severity / bookValueYen`, capped at
   MAX_RISK_DISCOUNT(0.25). Dealers price the average; the actual rolled issues never move the
   board. Player inspection is private knowledge — the board price basis never changes.
6. **Reputation:** any unrepaired issue blocks the quality-sale bonus; an unrepaired issue with
   severity >= 40 triggers the lemon penalty (extends `saleReputationDeltaFor`; lemon still takes
   precedence).
7. **Discovery beat:** buying uninspected -> `issues-discovered` log entry on handover day listing
   each issue by name; day report renders it prominently ("The RX-7's apex seals are shot — Y180,000
   to put right"). Inspecting beforehand -> no surprise, the same facts were on the auction screen.

## Design

### Schema (SAVE_VERSION 13 -> 14)

`CarInstance.hiddenIssues[]` entries gain `severityPercent: number` (int 0-100) and
`repaired: boolean` (default false). Migration for v13 saves — ONE pure rule, no catalog access
(`MIGRATIONS` in `saveCodec.ts` are pure structural transforms that import no content data, and
must stay that way): EVERY existing `hiddenIssues` entry — on owned cars, active-lot cars, AND
`activeServiceJobs[].car` (a third population generated through the same
`generateAuctionCarInstance`) — gets `severityPercent: 0, repaired: true`. Owned cars already paid
their severity at handover under the old rule (unrepaired would punish twice); the handful of
in-flight lot/service cars in a save simply carry no live issues — the next weekly catalog brings
freshly rolled ones. Golden-save test covers all three populations in the same commit.

`JobSchema.kind` union gains `'fix-issue'`; `JobSchema` gains optional `issueId: string`.
`StagedActionSchema` mirrors both.

### Sim changes

- `auctions.ts`: severity rolled in `generateAuctionCarInstance`; `resolveHandoverCondition`
  replaced by `revealIssuesAtHandover(lot, wasInspected)` -> marks `revealed: true`, returns the log
  entries (discovery beat only when `!wasInspected && issues.length > 0`), never touches condition.
  Update BOTH call sites in `bidding.ts`: `resolveDueAuctionLot`'s player-win path and
  `resolveBuyoutInstant`.
- New `packages/sim/src/issues.ts`: `maxUnrepairedSeverity(car, componentId, issuesById)`,
  `effectiveComponentCondition(car, componentId, issuesById)`, `issueRepairCostYen(issue,
  severityPercent, economy)`, `issuePenaltyYen(car, issuesById, economy)`, `modelRiskDiscount(model,
  issuesById, economy)` — `issuesById` everywhere because the instance stores only `issueId`
  (componentId lives on the catalog entry).
- `jobs.ts`: `fix-issue` job kind — gate = component equipment + consumables + issue cost;
  completion sets that issue `repaired: true` (does NOT change `condition`); `job-completed` log
  gains the issue name for the modal.
- `marketValue.ts`: `issueAdjustedValueYen` added; `valuation.ts` re-based onto it with
  `issuesById` threaded through (decision 4).
- `actions.ts`: `NewJobSpecSchema.kind` gains `'fix-issue'` + optional `issueId` — this schema (not
  the content `JobSchema` alone) is what `repairJobGate`/`createJob` actually consume; `createJob`
  copies `issueId` through onto the `Job`.
- `stagedWork.ts`: `confirmStagedWork` gains a third branch mapping staged fix-issue actions to the
  new spec with decision 3's severity-band labor (its current repair/install mapping is a two-way
  ternary with no third arm).
- Sprint 20 anchor: lots wrap the anchor with `x (1 - modelRiskDiscount)`.
- `carCondition.ts`: `averageConditionPercent`/`saleReputationDeltaFor` switch to effective
  condition + decision 6's rules.
- `derivedStats.ts`: reads effective condition.

### Game changes

- `CarDetailScreen.vue`: an Issues section on owned cars — name, hint text, severity band word
  (minor < 30 / serious < 60 / severe), exact fix cost, staged Fix action through the existing
  stage-and-confirm flow; fixed issues shown struck through ("Apex seals — replaced").
- `AuctionScreen.vue`: inspected lot -> issues listed with severity band + fix-cost estimate;
  uninspected -> the existing hint-free state. Show the model's *reputation* for issues ("these are
  known for rust") derived from `hiddenIssueWeights` — public knowledge, matching decision 5.
- `dayLogFormat.ts` + `DayReport.vue`: `issues-discovered` beat; `JobCompleteModal` covers fix jobs.
- `gameStore.ts`: staged fix-issue plumbing (mirror repair's existing store path), issues view data.

### Bots (instruments only — minimal)

- `cautiousRestorer`: creates fix-issue jobs for unrepaired issues the same way it repairs zones,
  AND its listing gate (`isRestored`, step 5) additionally requires zero unrepaired issues —
  staging fixes without gating the listing would still list lemons ("fully restore" now includes
  issues, enforced at the gate, not just attempted).
- The shared `acquireLot` helper (`buyoutHelpers.ts`, post-Sprint-20 form): refuse a lot whose
  inspected car carries an unrepaired severity >= 60 issue — ONE edit in the shared helper all
  bidding bots call, not per-bot copies. No other bot intelligence added.

## Task breakdown

### Content (`packages/content`)

- [ ] Schema changes above (`carInstance.ts`, `job.ts`, `stagedWork.ts`); `economy.json` gains
  `issues` block: `penaltyMultiplier` 1.3, `riskDiscountWeight` 0.9, `maxRiskDiscount` 0.25,
  `severityBands` [30, 60], `laborSlotsByBand` [1, 2, 3], `costDivisor` 50.

### Sim (`packages/sim`)

- [ ] `issues.ts` (new) per Design, with worked examples in doc comments (severity 50 -> exactly
  `repairCostBaseYen`).
- [ ] `auctions.ts`: generation severity roll; handover replacement (+ both `bidding.ts` call
  sites); delete the variance rule.
- [ ] `actions.ts`: `NewJobSpecSchema` kind + `issueId` per Design.
- [ ] `jobs.ts`: `fix-issue` kind end to end (restructured gate, cost, labor bands, completion
  effect, log); `createJob` copies `issueId`.
- [ ] `stagedWork.ts`: `confirmStagedWork` third branch per Design.
- [ ] `marketValue.ts`: `issueAdjustedValueYen`; `valuation.ts` re-base + `issuesById` threading
  (callers per Sprint 21's Exit list); Sprint 20 anchor risk discount.
- [ ] `carCondition.ts` + `derivedStats.ts` -> effective condition (`issuesById` param; enumerate
  their callers in the Exit); decision 6 reputation rules.
- [ ] Bots per above (shared-helper filter + cautiousRestorer gate).

### Game (`packages/game`)

- [ ] `gameStore.ts` staged fix-issue + issues view data; `CarDetailScreen.vue` Issues section;
  `AuctionScreen.vue` inspected-issue display + model risk line; `dayLogFormat.ts`/`DayReport.vue`
  discovery beat; `JobCompleteModal.vue` fix-job copy.

### Testing

- [ ] Unit: effective condition (repair-zone to 100 with unrepaired severity 40 -> effective 60);
  fix-issue lifecycle (gate refuses without equipment/cash; completion flips `repaired`, condition
  untouched); cost worked example; migration both cases; quality blocked / lemon triggered per
  decision 6.
- [ ] **Information-value probe (acceptance):** on a generated population of high-risk-model lots,
  policy A (inspect every lot, buy only if no severity >= 40 issue, at Sprint 20 patient-bidder
  prices) beats policy B (buy the same lots blind) on median realized margin (sale at
  `marketValueYen` after full restore + fixes) by more than the total inspection fees paid.
  Inspecting must literally pay for itself where risk is real.
- [ ] **Risk-discount probe:** hammer prices on high-risk models sit measurably below equal-value
  low-risk models by ~the model risk discount.
- [ ] Golden masters re-pinned once; goldens + migration in the same commit as the schema change.

## Claude-implementable vs user-only

**Claude-implementable:** all of the above, plus `pnpm balance:run` telemetry re-run.

**User-only:** feel-pass on the discovery beat and Issues UI in the browser; tune of the
severity-band words and Japanese-flavored copy; veto on decision 4's "penalty exceeds repair cost"
principle if it plays badly.

## Definition of done

All checks green; both probes pass as tests; the inversion is gone (a test asserts inspected and
uninspected handovers produce identical condition); a car with a fixed issue shows the full story on
CarDetail (discovered -> staged -> fixed) via the existing flows; Exit written with measured probe
numbers.

## Exit

*(to be written at implementation end)*
