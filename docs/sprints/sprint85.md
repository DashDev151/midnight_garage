# Sprint 85 - Honesty fixes: the phantom part, unfailable story missions, the open machine shop

First sprint of the 2026-07-18 playtest arc (see `docs/playtest_notes/playtest-notes-2026-07-18.md`
for the full triage; this sprint covers items 6, 7, 14, 15, 16, 18, 20 and the v1 of 21).
All sim-side. The UI face-lift (86), the assembly model (87), the diagram-as-page (88) and the
Yuki tutorial (89) follow.

## Reuse analysis (directive 16)

**New mechanisms (genuinely new):**

- A reject/decline action for radial job offers (no decline mechanic exists anywhere today).
- Machine-shop assist: a cash fee that substitutes for an unowned tier-2 machine on gated
  operations (maintainer ruling 2026-07-18: renting access replaces the hard wall).
- Reputation-conditioned rarity weighting in auction model selection (today's pick is uniform).
- A per-offer lifetime roll (today a flat constant).

**Existing mechanisms to reuse (no parallel systems):**

- `resolveRemovePart` / `vacatedBaseline` (`packages/sim/src/jobs.ts`): the bug fix DELETES a
  stale branch; the Sprint 79 baseline machinery is correct and untouched.
- `removeMachineGateGroup` (`jobs.ts:347-354`): the assist keys off the SAME gate predicate;
  no second gating concept.
- The car ledger: assist fees post through the existing repair/parts ledger path so mission
  budget caps see them (no new accounting).
- `serviceJobOffers` expiry filter (`advanceDay.ts:302-303`): unchanged; only the stamped
  lifetime varies.
- The seeded RNG streams already threaded through offer generation and catalog generation.
- Content law: every new number is an `economy.json` key.
- The story-mission record/state machine (`missions.ts`): fields are REMOVED, none added.

## Decisions

1. **The phantom-mint fix (playtest 15/16/20).** `resolveRemovePart`
   (`packages/sim/src/jobs.ts:437-449, 456-462`) still carries the pre-Sprint-79 Sprint 32
   branch: removing an aftermarket-grade part backfills a synthesised mint OEM stock instance
   while stamping `vacatedBaseline` in the same update, violating the schema contract
   (`packages/content/src/carInstance.ts:19-27, 34-37`). Fix: delete the
   `isStock`/`freshStockInstance`/`stockCatalogPart` branch; removal ALWAYS writes
   `installed: null` plus the baseline from the genuinely removed instance. Update the stale
   docstring (`jobs.ts:356-368`) and the two stale call-site comments
   (`CarDetailScreen.vue:540-543`, `gameStore.ts:2762-2766`).
   **Directive 17 case (a), stated for the record:** `jobs.test.ts:1109-1141` ("removing an
   aftermarket part... reverts the slot to a fresh mint stock instance") pins semantics that
   Sprint 79 deliberately redefined; it is rewritten to assert the new contract (slot empties,
   baseline carries the removed instance's identity). Two regression tests are added:
   (a) removing an aftermarket part leaves the slot empty, baseline = the removed part's
   `{partId, band, genuinePeriod}`, and the part lands in inventory;
   (b) the full playtest chain: aftermarket part removed, then a new mint stock part of the
   stock SKU installed into the vacancy is charged FULL install labour (the free-refit
   equivalence must not fire; `refitLaborSlotsFor` is correct and untouched).

2. **Story missions become unfailable (playtest 18, maintainer ruling).** Remove
   `deadlineDays`, `lapseReputationPenalty` and `reofferDays` from
   `packages/content/data/storyMissions.json` and the Zod schema; remove the lapse and
   reoffer passes from `advanceStoryMissions` (`missions.ts:61-85`) and the `dueOnDay`
   stamping from `resolveAcceptMission` (`missions.ts:117`); drop the mission `deadline`
   requirement row, the offered-card "{n} days once accepted" chip and the active-mission
   days-left chip (`ServiceJobsScreen.vue:114-115, 131-137`); drop the `mission-lapsed` /
   reoffer day-log entries (`dayLogFormat.ts:163, 170`) and their event types. Story
   missions are offered, accepted, delivered; nothing else. The budget cap and requirements
   remain the whole challenge. Radial jobs keep their deadlines untouched. Directive 19:
   schema change = Dexie version bump only, no migration, no compat branch.

3. **Offer lifetime becomes a content knob (playtest 6).** Replace
   `SERVICE_JOB_EXPIRY_DAYS = 10` (`packages/sim/src/constants.ts:24`) with
   `economy.serviceJobs.offerLifetimeDaysRange: [3, 8]`, rolled uniformly per offer via the
   existing offer-generation RNG at both call sites (`advanceDay.ts:341-350`,
   `newGame.ts:68-77`). Uniform over 3..8 gives a 5.5-day mean (maintainer asked ~5, range
   3-8, varied; uniform satisfies that without a weights table).

4. **Reject on radial offers (playtest 7).** New sim resolver `resolveRejectServiceJobOffer`
   (removes the offer by id; no reputation effect and NO day-log entry, a declined offer
   leaves no trace), a
   `rejectServiceJobOffer` store action, and a functional Decline button on the offer card
   next to Accept. Zero penalty by design: it is exactly as if the offer never existed.
   Visual styling of both buttons is Sprint 86's card restructure; this sprint only adds the
   working control. Button label: `Decline` (swept, final).

5. **Reputation-weighted early auction pool (playtest 14).** Model selection in
   `generateAuctionCatalog` (`auctions.ts:773`) changes from uniform over eligible models to
   weighted, with per-model weight = `economy.auction.rarityWeightsByReputation[repTier][rarity]`
   defaulting to 1 when absent. Content ships one entry:
   `{"unknown": {"shitbox": 3}}`: at *unknown* reputation a Local Yard lot draws shitbox
   models at 3x weight (24:4, six-to-one odds vs a third of the board today); from *local*
   onward every weight is the implicit 1 and behaviour is exactly today's. No day timers.

6. **Machine-shop assist v1 (playtest 21, maintainer ruling 2026-07-18).** Until the player
   owns the relevant tier-2 machine, gated operations remain possible at a fee: everything
   is workable from day one, ownership buys margin. Mechanism:
   - Where `removeMachineGateGroup` blocks a removal today (`jobs.ts:428-431`), the action
     is instead allowed with a cash fee added to the operation:
     `economy.machineShopAssist.feeYenByGroup = {"engine": 15000, "drivetrain": 18000}`.
   - The install side must be symmetric: verify whether installing a buried engine/drivetrain
     part is machine-gated today (discovery indicates it is NOT, an inconsistency); add the
     same gate there, satisfied by ownership OR the fee. You cannot lower an engine in
     without a crane either.
   - The fee posts to the car's ledger through the existing repair-cost path, so service-job
     billing and mission budget caps see it honestly.
   - UI (minimal this sprint): the remove/install affordance shows the fee when it applies,
     caption `machine shop assist +{¥fee}` (swept, final); the blocked reason for these
     cases disappears since they are no longer blocked.
   - Coherence probe additions (Vitest, closed-form): (a) each assist fee is > 0 and
     `fee x probeAmortisationOps <= machine price` with
     `economy.machineShopAssist.probeAmortisationOps = 40` (non-strict by orchestrator
     amendment at implementation: the engine fee sits exactly on the boundary,
     15,000 x 40 = 600,000 = the crane's price, which reads as "the crane pays for
     itself inside forty engine jobs", an acceptable and even quotable payback
     statement; owning beats renting beyond the horizon, renting beats nothing);
     (b) the existing story-mission
     satisfiability probes stay green with fees included in their recipes where a gated
     operation appears.
   - The tier-2/3 purchase gates (price, reputation, listing) are UNTOUCHED this sprint;
     with rental in place they pace ownership, not capability. Revisit only if the
     progression bible needs amending, which is not this sprint.

7. **Save schema.** One Dexie version bump covers decisions 2 and 6 (removed mission fields,
   no new persisted state for assist since fees are transactional). No migration, no
   golden-save test, no compat branch (directive 19).

## Definition of done

- [x] Removing any part, any grade, leaves the slot empty with a correct vacated baseline;
      the phantom-mint spawn is gone; both regression tests pass.
- [x] The stale Sprint 32 test is rewritten to the Sprint 79 contract (directive 17 case (a)
      recorded above).
- [x] Story missions cannot lapse: no deadline fields in content or schema, no lapse/reoffer
      code paths, no deadline UI on mission cards, save version bumped.
- [x] Radial offer lifetimes roll 3-8 days from `economy.json`; the hard-coded constant is
      gone.
- [x] Decline removes an offer with zero side effects.
- [x] At *unknown* reputation the Local Yard draw is shitbox-weighted 3:1 per model; at
      *local* and above, identical to today (seeded test).
- [x] Machine-gated removals AND installs are possible without the machine at the content
      fee, posted to the ledger; owning the machine removes the fee; coherence probes green.
- [x] Narrowest relevant Vitest projects run once, green; pre-push gate is the full
      evidence (directive 20).

## Task breakdown

**Claude-implementable (all of it):** the seven decisions above.
**User-only:** none. Commit approval as usual.

## Exit

All seven decisions landed (implementation by subagent, orchestrator-policed). The record:

- **Directive 17 rulings, all case (a)** (implementation intentionally changed what is
  correct): the Sprint 32 removal test (rewritten to the empty-slot contract); the
  provenance backfill-origin describe (the backfill birth-site no longer exists; removed);
  the missions lapse/reoffer suite (mechanism removed; replaced with an unfailable-contract
  test); the ServiceJobsScreen lapse e2e (rewritten to "never lapses"); two buried-slot
  machine-gate refusal tests (hard wall became a fee; rewritten to charge and verify it);
  the flat `expiresOnDay` assertion (per-offer roll); two golden-master hashes re-pinned
  (RNG stream and record shape changed by decisions 2/3/5).
- **Orchestrator rulings at sign-off:** (1) the save version bump landed in
  `saveCodec.ts` (`SAVE_VERSION` 38 to 39), not `saveDb.ts`: the Dexie table structure is
  unchanged and its version is deliberately independent of save content; the doc's wording
  was imprecise, the implementer's reading is the repo's actual pattern. (2) Probe (a)
  made non-strict, recorded inline at decision 6. (3) `lapsedCopy` swept out by the
  orchestrator (schema, all eight missions, four test references): dead flavour tied to
  removed semantics is exactly the residue directive 19 warns about.
- **Copy sweep:** `Decline`, `machine shop assist +{fee}` and the shortened
  `Mission accepted` day-log line approved as final; no other player-facing strings were
  added; the tool-tier blocked captions are gone with their cases.
- **Narrow evidence (each run once):** sim project 49 files / 934 tests green after the
  two golden re-pins; touched game files 5 files / 165 tests green; content project
  10 files / 85 tests green after the `lapsedCopy` sweep; `missions.test.ts` 24 green.
- **Full evidence:** this commit reached origin through the pre-push gate (typecheck,
  lint, format, coverage-gated suite); per directive 20 no separate manual full pass was
  run.
