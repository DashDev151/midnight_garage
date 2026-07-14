# Sprint 61 - Honest job offers: the baseline part, coherent flavour, class chips, and the fit filter

**Source:** playtest 2026-07-14 pass 2, items 10, 14, 15, plus the maintainer's direct
correction on discovery (2026-07-14): "just keep track of the original part and what was
installed" - the root fix for item 14, replacing the slot-clearing validator hack.

## Confirmed current state (code discovery, 2026-07-14)

- **Item 14's root cause is the install-completion definition.** `isServiceTaskDone` counts
  an install task done when the slot holds any part of `minGrade` or better - so a customer
  car arriving with stock tyres would read "already done" for a stock-tyre install. Sprint
  40's `forceTasksOutstanding` (`serviceJobs.ts:462-492`) therefore CLEARS the slot
  (`installed: null`) to keep the task outstanding - manufacturing a missing part. Flavour
  is then picked blind to the car (`rng.pick(flavorPool)`, `serviceJobs.ts:608`;
  `flavorPool` is plain strings, `serviceJob.ts:64-83`), so "tyres need balancing" lands on
  a car with no tyres. Service cars otherwise roll with a ZERO missing-slot chance (Sprint
  47 decision 7, `serviceJobs.ts:576-580`) - every missing part on a customer car is
  validator-made.
- **The "keep the original part" half already exists.** Sprint 35 tags a pulled customer
  part (`customerJobId`), locks it from sale, and reconciles it at close-out.
- **Fit filter:** `vehicleOptions` reads `carsDetailed` = owned cars only
  (`gameStore.ts:928`). `ServiceJob` carries the full `car` and `arrivesOnDay`; the offer
  and in-shop views expose only a `carName` string - the model is looked up and discarded
  (`gameStore.ts:688`).
- **Class data:** `LotDetail` already carries `model` (so `model.tier` is reachable);
  `fitmentClassForTier` + `PART_FITMENT_CLASS_DISPLAY_NAMES` exist and are used only by
  `PartsMarketScreen`.

## Reuse analysis (directive 16)

**New mechanisms:** a per-job baseline snapshot of install-task slots (one schema field), a
small class chip (pure display), extended fit-filter options.

**Existing mechanisms to reuse:** Sprint 35's customer-part tagging and close-out
reconciliation (which every install job will now exercise, since the original part gets
pulled instead of never existing); Sprint 40's validation for repair tasks (unchanged);
the player's existing Remove -> Replace two-step; `fitmentClassForTier` and its display
names; the Dexie bump + golden-save pattern.

## Decisions

1. **Baseline-tracked installs (the maintainer's direction).** `ServiceJob` gains
   `baselineInstalledPartIds: Record<CarPartId, string | null>`, snapshotted at offer
   creation for the job's install-task slots. An install task is done when the slot's
   current part id DIFFERS from the baseline id AND meets `minGrade`. Reinstalling the
   customer's own pulled part does not count (same id). `forceTasksOutstanding` stops
   clearing slots for install tasks; instead it rolls the ORIGINAL part down to a low
   condition band (poor or scrap - present, not missing) so the customer's complaint is
   real. "Vibration at speed, tyres need balancing" is now true by construction.
2. **Save migration.** `SAVE_VERSION` bump. In-flight jobs in old saves get
   `baselineInstalledPartIds` absent/null, meaning legacy completion semantics for that job
   only (done = part of `minGrade` present) - no live save breaks mid-job. New offers always
   snapshot. Golden-save tests both ways.
3. **Flavour sanity closes at the root.** With baselines, the missing-part contradiction
   class dies structurally. Remaining risk is tone-level severity, handled by one authoring
   review pass over the 32 templates' install flavour lines. A tagged-flavour schema was
   considered and rejected: unnecessary complexity once the root cause is gone.
4. **Class chips (item 15).** A small muted chip rendering
   `PART_FITMENT_CLASS_DISPLAY_NAMES[fitmentClassForTier(model.tier)]` ("Kei & Compact",
   "Sports", ...) on the auction lot card and on both job cards (offer + in-shop). The job
   views gain a `fitmentClass` field (the model stops being discarded at
   `gameStore.ts:688`). These names are exactly the parts catalogue's class names - the chip
   answers "which class of parts do I buy for this?" directly.
5. **Fit filter includes customer cars (item 10).** `vehicleOptions` gains entries from
   `activeServiceJobs` - labelled with the customer context and arrival state ("arrives
   day N" / "in the shop") - selecting one sets the class filter exactly like an owned car.
   This serves the core loop: accept the job, order the right-class parts, car and parts
   arrive together tomorrow.

## Tasks

**Claude:**

1. Content: `ServiceJob` schema field; sim: baseline snapshot at generation, new
   `isServiceTaskDone` install semantics, `forceTasksOutstanding` rework (roll-down instead
   of clear); sim tests (new-part-required, own-part-reinstall rejected, minGrade still
   enforced, legacy-null semantics).
2. Flavour authoring review pass over install templates; content test keeps validating
   every template still generates outstanding work.
3. Game: job views gain `fitmentClass`; chips on auction + job cards; fit-filter options
   extended; component tests (chip renders; filter lists an inbound customer car and sets
   the class).
4. Save: Dexie bump + golden-save tests (legacy job decodes and stays completable; new job
   round-trips its baseline).
5. Full gate; balance harness + invariant check (install-completion semantics change bot
   behaviour, and days-to-`local` rides the service-job loop - this is a sim change, not
   display); disclose in the Exit.

**User-only (maintainer):**

- None beyond review.

## Definition of done

- No customer car can present a complaint its own state contradicts; install jobs require a
  genuinely new part; the customer's original part flows through the Sprint 35
  reconciliation.
- Auction lots and job cards show the car's class; the fit filter serves inbound customer
  cars.
- Dexie migration + golden saves green; full gate green; harness hard gates pass.

## Exit

Implemented and committed.

**Baseline-tracked installs (decisions 1-2).** `ServiceJob` gains
`baselineInstalledPartIds: Record<carPartId, string | null>` (default `{}`), snapshotted at offer
generation for each install-task slot - the `PartInstance.id` the customer's car arrived with.
`isServiceTaskDone` gained an optional baseline parameter: an install task is done only when the
slot holds a part of `minGrade`-or-better whose instance id DIFFERS from the baseline (an absent
baseline entry falls back to the pre-Sprint-61 "any qualifying part present is done" semantics, so
a legacy in-flight job never breaks). `forceTasksOutstanding` stops clearing install slots (Sprint
40's hack that manufactured missing parts); instead it rolls the customer's ORIGINAL part down to
a neglected band (poor/scrap) so the complaint is honest while the part stays present, and that
original id becomes the baseline. Threaded through the two other callers that operate on a job:
the bot helper (`serviceJobHelpers.ts`) and the game store's per-task `done` view. `SAVE_VERSION`
29 -> 30, additive (no migration function; the schema default handles legacy saves), with two new
golden-save tests (a pre-v30 job decodes with an empty baseline; a v30 job round-trips a real
captured baseline).

**Flavour sanity (decision 3).** With the root cause gone, the missing-part contradiction class
is structurally impossible - every install slot now holds a present, neglected part. Reviewed all
25 install-template flavour pools: every line is framed as an upgrade or wear ("clutch is
slipping", "pads down to metal", "tyres are bald", "shredded a tyre", "stock gearbox can't take
it") - none imply a genuinely absent part, so with the present-but-worn car they are all honest as
written. No content edit was needed; the review is the deliverable.

**Class chips (decision 4).** `ServiceJobOfferView`, `ServiceJobView`, and `LotDetail` each gained
a `fitmentClass` field (the model, previously looked up and discarded, is now read for it). A
small muted chip renders `game.fitmentClassLabel(...)` ("Kei & Compact", "Sports", ...) on the
auction lot card and on both job cards (offer + in-shop), answering "which class of parts do I buy
for this?" directly.

**The fit filter (decision 5).** A new store getter `partsFitVehicleOptions` returns every owned
car PLUS every accepted customer service-job car - including an inbound one that hasn't arrived
yet, labelled "(customer, arrives day N)" / "(customer, in the shop)". `PartsMarketScreen`'s
"fits this vehicle" filter reads it, so the core loop (accept the job, order the right-class
parts, both arrive next morning) now works.

**Testing.** Sim: rewrote the one stale `forceTasksOutstanding` test that asserted the old
clear-to-empty behavior (directive 17, stale case - it now asserts the original part is kept,
degraded, and its id is the baseline); added a dedicated baseline-semantics describe block
(new-part-required, own-part-reinstall rejected, minGrade still enforced under the baseline,
legacy-null fallback). Nine raw `ServiceJob` test literals across sim and game needed the new
field (mechanical fixture fallout of a required schema field). Game: a new ServiceJobsScreen test
(the class chip renders the display name, not the raw enum) and a new PartsMarketScreen test (the
fit filter lists an inbound customer car and selecting it sets the class filter). Save: the six
`SAVE_VERSION` canary assertions and their titles bumped to 30/Sprint 61, plus the two new
golden-save tests.

**Verification.** Full gate green: `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format`
(three touched files auto-formatted), `pnpm test:coverage` (1059 tests, 79 files; coverage
91.50%/82.05%/92.91%/95.33%, all above the ratchet floor), `pnpm build`. Balance harness re-run
(this IS a sim behavioural change): all 9 hard gates pass. Days-to-`local` p50 moved 12 -> 16,
still comfortably inside the hard-gated [10,35] band, so no maintainer band-move was needed - an
expected, disclosed consequence: an install job now takes an extra tick (the bot does
remove -> buy -> install onto the present original part, instead of buy -> install onto the empty
slot Sprint 40 manufactured), so the service-job-driven reputation loop runs slightly slower.
Service-grinder and competent-policy day-100 median cash dropped accordingly (441k/435k, down from
572k/643k in Sprint 60) - fewer install jobs cleared per career, the direct effect of the
more-honest, one-more-step install semantics; every other invariant holds unchanged. No golden
career hash moved (the scripted-career fixtures' own day-1 boards aren't affected in a
hash-visible way).

**Definition of done, checked against the sprint doc:**
- No customer car can present a complaint its own state contradicts; install jobs require a
  genuinely new part; the customer's original part flows through the Sprint 35 reconciliation -
  yes.
- Auction lots and job cards show the car's class; the fit filter serves inbound customer cars -
  yes.
- Dexie migration + golden saves green; full gate green; harness hard gates pass - yes.
