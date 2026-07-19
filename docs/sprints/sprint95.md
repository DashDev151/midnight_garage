# Sprint 95: The tutorial actually guides (playtest 2026-07-19, items 1-4, 6-11)

> **Same-day corrections (playtest items 16-17), superseding the script blocks below
> where they differ:** the maintainer caught the engine step glossing the removal
> blockers and a false labour claim, both verified against the resolvers. (a) The engine
> step now teaches the true path: Take it off on the Intake, Exhaust and Cooling (free,
> `resolveRemoveAssembly` refuses while any is on the car), then Remove assembly, the
> bench repair, Refit assembly; its labour line attributes correctly (removal is always 0
> labour, Sprint 79; the repair and the repaired head's own refit are the drain). (b) A
> new step 9 `reassemble` (completion: new condition `scriptedCarWhole`, no missing part
> via `isPartMissing`) guides the button-up, so the machine can never march a
> part-missing car to delivery - the probe never caught this because it grades a
> fabricated complete car. (c) Per item 17 the wheel step's shop line teaches the full
> market trip (Parts tab, department, slot, Add to cart, Checkout) with a spotlight
> CHAIN (line anchors may be a list tried in DOM order: slot card, department card, nav
> tab) instead of the scrapped deep-link button. The walkthrough is 11 steps. The
> shipped `tutorialSteps.json` is canonical for the final copy.
> Trace-method lesson recorded: verify each button's refusal conditions and each claim's
> cost attribution, not just triggers and anchors.

**Date:** 2026-07-19
**Source:** `docs/playtest_notes/playtest-notes-2026-07-19.md` (items 1, 2, 3, 4, 6, 7, 8, 9, 10, 11; item 13 is the method rule this sprint is executed under). Item 5 (overworld map) is deliberately out of scope: it goes to `TODO.md` for its own design pass. Item 12 (diagram condition visibility) is Sprint 96.

**Maintainer verdict being fixed:** the Sprint 89 walkthrough half-guides. It names concepts without saying where to go or why, goes completely silent between placing the bid and owning the car, and reads like aphorisms rather than help. The bar: explicit, accurate, motivated guidance at every step of the first loop, personally traced by the orchestrator (no delegated sign-off).

## Reuse analysis (directive 16)

**Existing mechanisms reused (the backbone; none of these are rebuilt):**

- The state-derived step machine in `TutorialOverlay.vue`: first step in order whose completion
  is unmet wins; delivered-mission jump to the terminal step; no stored index. This survives
  unchanged as the engine; only its condition vocabulary grows.
- `TutorialLineSchema.showWhen` conditional lines (already proven by the post-inspection
  reveal line) for sub-state guidance inside a step.
- Token interpolation (`{payout}`, `{budgetCap}`, `{model}`, `{part}`) in the overlay.
- The spotlight mechanism (`anchorTestId` + `.tutorial-spotlight` pulse) - extended, not
  replaced (per-line override and wrong-screen nav fallback below).
- `TUTORIAL_LOT` recipe, `buildTutorialLot`, `ensureTutorialLot` injection, and every scripted
  bidding pin (`bidding.ts` rival pin, expiry backstop, guaranteed win at reserve): untouched.
- The `four-wheels` mission lifecycle as the progression spine (offered day 1, accept, deliver).
- `assignToShop` / `moveCarToSlot` / the garage drag-drop for the new into-the-bay step.
- `generateAuctionCatalog`'s eligible-pool filter (extended with one predicate, not forked).
- `generateDailyServiceJobOffers` (gated at its call sites, not forked).
- Save codec versioning: schema addition = version bump only (directive 19, no migration).
- Test base: `TutorialOverlay.test.ts` is rewritten against the new script (directive 17
  case (a): the implementation intentionally changes what is correct); `tutorialProbe.test.ts`
  and `storyMissionProbes.test.ts` are untouched (the lot, mission and economics do not move).

**Genuinely new mechanisms:**

1. `acknowledged` completion kind + persisted `tutorialAcknowledgedSteps: string[]` on
   `GameState` (a "Got it" button for purely informational steps).
2. `anyOf` completion composition, so a player who skips ahead (bids without inspecting,
   buys-now without bidding) can never strand the machine on a stale step.
3. Six new condition kinds: `lotBidPlaced`, `scriptedCarInServiceBay`,
   `inspectionVisitActive`, `assemblyOnBench(assemblyId)`, `partInInventory(carPartId)`,
   `partOnOrder(carPartId)` (the last four for `showWhen` only).
4. Per-line `anchorTestId` override (last visible line with an anchor wins the spotlight).
5. Wrong-screen nav fallback: when the current route is not the step's `anchorScreen`, the
   spotlight lands on that screen's nav link instead, so the walkthrough always points at
   something clickable.
6. Draggable overlay (pointer-drag on the header, clamped to the viewport, session-scoped
   position in the ui store).
7. Tutorial-model exclusion in random catalogue generation while the tutorial is active.
8. Radial-offer gate: no service-job offers while the tutorial is active and Yuki's job is
   undelivered.
9. Auction tier display labels (the screen currently renders the raw enum slug "local-yard").
10. Inspect-button restyle + `data-test` anchor.

## Decisions

1. **Script restructure: 6 steps become 10** (`welcome`, `accept`, `find`, `bid`, `close`,
   `bay`, `wheel`, `engine`, `deliver`, `done`). The machine stays state-derived. Full script
   below; the copy in this doc IS the deliverable and is orchestrator-authored (playtest
   item 13). The two lines the maintainer ordered cut ("that is the budget and the pay both",
   "This first one is about learning the work, not the money.") die with the rewrite, and no
   instruction line may be a bare aphorism: every directive carries where to click and why.
2. **Completion monotonicity law:** once the player reaches a later stage, every earlier
   step's completion must read true forever. Implemented with `anyOf`: `find` completes on
   inspected OR bid OR owned; `bid` on bid OR owned. A step whose condition can honestly
   regress (`bay`: the player can drag the car back out of the bay) is allowed to reappear,
   because its guidance is then accurate again.
3. **`acknowledged` steps:** the overlay shows a "Got it" button only for steps whose
   completion kind is `acknowledged`; clicking records the step id in
   `gameState.tutorialAcknowledgedSteps` (persisted; SAVE_VERSION bump, no migration per
   directive 19).
4. **Radial gate (item 11):** `generateDailyServiceJobOffers` produces nothing while
   `tutorialStatus === 'active'` and `four-wheels` is not `delivered`. Skipping the tutorial
   lifts the gate at the next generation point (the following End Day); the board is
   intentionally Yuki-only until then. Non-tutorial careers (absent status) are unaffected.
   Ordering trap: `createInitialGameState` seeds day-1 offers before `installTutorial` sets
   the flag - the implementation must gate the day-1 batch too (set the status before the
   day-1 generation, or generate the batch through the same gate).
   `ServiceJobsScreen.test.ts`'s fit-filter test assumes a day-1 offer exists; it is
   rearranged (directive 17 case (a)) to skip the tutorial and advance a day first.
5. **No second Wagon R (item 7):** while `tutorialStatus === 'active'`,
   `generateAuctionCatalog` excludes `TUTORIAL_LOT.modelId` from the eligible pool (day-1
   batch and daily arrivals both). Confirmed real risk: shitbox weight 3 at `unknown`
   reputation, 3 random local-yard lots on day 1, no existing dedupe. After done/skipped the
   model spawns freely. Sim test: across seeded careers with the tutorial active, no
   non-scripted lot ever carries the tutorial model id.
6. **Tier display labels (item 6):** the auction screen renders `{{ group.tier }}` raw. Add a
   display map - `local-yard` "Local Yard", `regional` "Regional", `premium` "Premium",
   `collector-network` "Collector Network" - used by the tier headings, so the walkthrough
   can name a place the screen actually shows.
7. **Inspect prominence (item 8):** `.inspect-visit` moves from ghost-dim to a visible
   secondary control: amber (`--mg-neon-violet`) text + border on panel background, small
   size retained (it must not compete with the violet bid CTA), and gains
   `data-test="inspect-visit-{tier}"` so the `find` step can spotlight it. The two-step
   forfeit confirm behaviour is unchanged.
8. **Draggable overlay (item 9):** drag by the overlay header; position clamped to the
   viewport; stored in the ui store for the session (not saved to disk; a reload snaps back
   to the bottom-left default, which is fine).
9. **Spotlight always points somewhere (items 1, 6, 10):** per-line `anchorTestId` override
   plus the nav fallback (new mechanism 5). Nav links gain `data-test="nav-{route}"`. When
   the player is on the wrong screen, the tab itself pulses; on the right screen, the
   control does. New anchors added where none exist: the End Day button, the first service
   bay slot, the scripted lot's stethoscope test button.
10. **Out of scope:** the overworld map (TODO.md, own design pass), the car-screen UX fixes
    (Sprint 96: diagram condition tint, the bench dead-end), any change to lot pricing,
    mission economics, or the step machine's selection algorithm.
11. **Cross-dependency:** step 7's "press Shop for tyres" line names Sprint 96's bench
    empty-state control; the two sprints land together (same arc, one gate).

## The script (the deliverable; content of `tutorialSteps.json` after this sprint)

Voice (maintainer tone directive, 2026-07-19, playtest item 14): the tutorial sets the tone
of the whole game: lighthearted and wholesome, a cosy management sim with a genuinely
challenging economy underneath. A warm friend at your shoulder while you open your own
place: "we" and "let us" phrasing, reassurance at every waiting moment (nothing more we can
do tonight, and that is fine), small era-true creature comforts (the yard's vending
machine), pride in craft, challenge framed as judgement rather than stress. Still plain,
concrete, motive first; never cheesy or twee (the content quality bar stands). Persona
lines stay in Yuki's voice. British spelling; no em dashes; numbers via tokens where they
exist.

**Step 1 `welcome`** - anchorScreen `garage`, anchor `day-value`, completion `acknowledged`:

- "Here it is: your own garage. One service bay for working on cars, parking for keeping
  them, a little cash in the till, and the labour bar up top: your working day. Spanner
  work drains it; a night's sleep (press End Day) refills it."
- "The tabs along the top are the rest of town: the job board, the auction rooms, the parts
  shop. We will visit each one when it matters."
- [Got it]

**Step 2 `accept`** - anchorScreen `jobs`, anchor `mission-accept`, completion `missionActive`:

- "Start on the Jobs tab: the job board. Your first customer is already waiting there.
  Yuki, a student who has been saving all year: {payout}, and she needs four wheels that
  will pass inspection."
- "She will hand you the whole envelope and trust you with it. Build her something
  roadworthy for less, and whatever is left over is your pay: every job in this trade
  works like that."
- "Accept the job when you are ready. There is no deadline; she is happy to wait."

**Step 3 `find`** - anchorScreen `auctions`, anchor `inspect-visit-local-yard`, completion
`anyOf(lotInspected, lotBidPlaced, scriptedCarOwned)`:

- "Now the Auctions tab. There are several auction rooms in town, but a young garage starts
  in one: the Local Yard. Cheap cars and quick hammers, and exactly the right hunting
  ground for Yuki's budget."
- "There is a {model} on the block that could be just right for her. Nothing glamorous, but
  read its sheet: it lists an engine tick, and the room has priced that noise as if it were
  the worst thing it could be. If the tick is minor, that is a bargain wearing a scary
  label."
- "Only one way to find out. Press Inspect here: a small fee and a little labour buys us an
  hour in the yard with the cars. Grab a coffee from the vending machine on the way in; the
  truth is worth more than the fee."
- (showWhen `inspectionVisitActive`, anchor: the scripted lot's stethoscope test button)
  "You have the hour. Put the stethoscope on that tick; fifteen minutes tells us whether it
  lives at the top of the engine, which is cheap to put right, or the bottom, in which case
  we tip our hat and walk away."

**Step 4 `bid`** - anchorScreen `auctions`, anchor `bid-tutorial-lot`, completion
`anyOf(lotBidPlaced, scriptedCarOwned)`:

- "Just lifters: the cheap kind of tick, the kind a quiet afternoon and a set of shims can
  cure. The room is still scared of it, and their fear is our discount."
- "Bid the reserve, the least the seller will take. Nobody else is chasing this car today,
  so there is no need for the buy-now; that button is for people in a hurry, and we are not
  in a hurry."

**Step 5 `close`** - anchorScreen `garage`, anchor: the End Day button, completion
`scriptedCarOwned`:

- "Your bid is in, and auction rooms settle overnight. Press End Day and get some rest; if
  nobody outbids you by close, she hammers to you at your price."
- "The morning report will tell you how it went. Fingers crossed."

**Step 6 `bay`** - anchorScreen `garage`, anchor: the first service bay slot, completion
`scriptedCarInServiceBay`:

- (yuki) "It has a certain something. Under the dirt."
- "The {model} is yours, and she is sitting in parking looking sorry for herself. Tools
  only reach a car in the service bay: drag her across (or open her and press Move to
  service bay) and let us get a proper look."

**Step 7 `wheel`** - anchorScreen `car`, anchor `remove-assembly-wheelAssembly`, completion
`partBandAtLeast(tyres, fine)`. This step's copy walks the REAL click path measured in the
2026-07-19 playtest (notes item 13), naming every button; two lines reveal as the sub-state
advances:

- "Open her from the bay. The big picture of the car is the service diagram: point at the
  wheels and click, and the panel underneath shows what you can do there."
- "Start at the ground. Her tyres are scrap, and scrap tyres fail a roadworthy all on their
  own. Tyres come off with the wheels: press Remove assembly (taking things apart is free,
  and quietly one of life's pleasures), and the wheels land on the bench below."
- (showWhen `assemblyOnBench(wheelAssembly)`, anchor: the Tyres bench block - the panel's
  Shop button does not exist until the block is clicked, so the spotlight lands on the
  block) "Click the Tyres block on the bench; if the shelf is empty, press Shop for tyres.
  In the shop, press Add to cart on the plain stock tyres (sport rubber is lovely, and
  entirely not in her budget), then Checkout: standard delivery lands tomorrow morning."
  (Conditional phrasing on purpose: the line stays visible while the assembly is benched,
  including after the tyres arrive, so it must never read as a false statement.)
- (showWhen `partOnOrder(tyres)`, anchor: End Day) "Tyres ordered. Nothing more we can do
  tonight, and that is fine: press End Day, and they will be on the shelf with the
  morning."
- (showWhen `partInInventory(tyres)`, anchor: the Tyres bench block) "Morning: your tyres
  are in. Click the Tyres block on the bench and press Fit; the small fee is the fitting
  shop's machine doing the pressing (one day you will own one, and the fee disappears).
  Then press Refit assembly and the wheels go back on, better than she has had in years."

**Step 8 `engine`** - anchorScreen `car`, anchor `part-action-panel`, completion
`partBandAtLeast(headValvetrain, fine)`:

- "Now for that tick. It lives in the {part}, deep in the engine: click the engine on the
  diagram and press Remove assembly. No crane of your own yet, so the machine shop next
  door lends its arm for a fee, out and back in."
- (yuki) "My uncle had an engine crane once. He also had a roof. Long story."
- (showWhen `assemblyOnBench(engineAssembly)`, anchor: the Head bench block, same
  block-not-panel rule as the wheel step) "Click the Head on the bench and press the
  Repair button; its price and labour are written on it. When the work is done, press
  Refit assembly and she goes back together."
- "All of this drains the labour bar, because good work takes hours. If it runs dry before
  you are done, no matter: press End Day, and the morning brings a fresh one."

**Step 9 `deliver`** - anchorScreen `jobs`, anchor `mission-deliver`, completion
`missionDelivered`:

- "Back to the Jobs tab. Pick the {model} on her card; when every requirement reads green
  and the spend sits inside her envelope, press Show them the car. Go on: she has waited
  long enough."

**Step 10 `done`** - anchorScreen `garage`, anchor `day-value`, terminal (`never`):

- "That is the walkthrough done, and your first happy customer on the road. From tomorrow
  the job board starts filling; do good work and the town will find its way to your door."

Skip-confirm copy is unchanged ("Skip for good? Yuki's job stays; the guidance does not come
back.").

## Tasks

**Claude-implementable:**

- [x] `packages/content/src/tutorial.ts`: new condition kinds (`acknowledged`, `lotBidPlaced`,
      `scriptedCarInServiceBay`, `inspectionVisitActive`, `assemblyOnBench`,
      `partInInventory`, `partOnOrder`), one-level `anyOf` composition, optional per-line
      `anchorTestId` (orchestrator-authored, with the schema landed first so the tree
      stayed consistent for the parallel agents).
- [x] `packages/content/src/gameState.ts`: `tutorialAcknowledgedSteps?: string[]`;
      SAVE_VERSION 42 -> 43, no migration (directive 19); the six codec canary pins
      re-pinned (case (a): the bump is the intended change).
- [x] `packages/content/data/tutorialSteps.json`: the script above, verbatim
      (orchestrator-authored, including the 2026-07-19 tone-directive warm pass).
- [x] `TutorialOverlay.vue`: `conditionMet` extensions, "Got it" button, last-visible-line
      anchor override, DOM-presence fallback chain (anchor -> nav tab; car ->
      service-slot-0 -> nav-garage), header pointer-drag with viewport clamping (+ session
      position in the ui store).
- [x] `gameStore`: `acknowledgeTutorialStep(stepId)` action (dedupes, session-logged).
- [x] Sim: `excludedAuctionModelIds` predicate threaded through `generateAuctionCatalog`
      (day-1 batch and daily arrivals both); `radialOffersGated` at both offer-generation
      call sites. Ordering trap solved by passing the tutorial intent into
      `createInitialGameState` (`NewGameOptions.tutorial`), so day 1 generates through the
      same gates as every later day; a post-hoc purge was rejected because it could not
      un-generate a duplicate lot without visibly thinning the board.
      `packages/sim/tests/tutorialIsolation.test.ts`: 9 tests, including a 30-seed sweep
      (no unscripted tutorial-model lot while active) and a 30-seed non-tutorial control
      proving the model does roll without the gate.
- [x] `AuctionScreen.vue`: tier display labels (`utils/auctionTierLabels.ts`);
      inspect-visit restyled to the amber light tier (the `inspect-visit-{tier}` data-test
      already existed from Sprint 74; the stethoscope anchor `run-test-{lotId}-0-{testId}`
      likewise already existed).
- [x] `App.vue` nav links: `data-test="nav-{route}"`. `GarageScreen.vue`:
      `service-slot-{i}` anchors (End Day already carried `data-test="end-day"`).
- [x] Tests: `TutorialOverlay.test.ts` rewritten to the new script, 12 tests (Got-it
      persistence, anyOf skip-ahead, showWhen reveals including `partOnOrder`, last-line
      anchor override, nav fallback, drag); `ServiceJobsScreen.test.ts`,
      `CarDetailScreen.test.ts`, `EndDayButton.test.ts`, `gameStore.jobs.test.ts`,
      `PartsMarketScreen.test.ts` rearranged for the gated day 1 (all case (a), none
      loosened; the day-1-board test now asserts the stronger gated behaviour).

**User-only:**

- [ ] Playtest the rebuilt walkthrough end to end (the arc's real exit).

## Exit

- [x] **Orchestrator's step-by-step trace** (run twice: against the spec before
      implementation, which caught four holes - the cart steps, the waiting evening, two
      panel-internal anchors that do not exist until their block is clicked, and the
      Pick-a-car dropdown - and against the implemented machine after, which caught the
      "shelf is empty" phrasing hazard):
      1. `welcome` - garage, box shows Got it; clicking it writes the acknowledgement.
      2. `accept` - anchor `mission-accept` absent off the jobs screen, so `nav-jobs`
         pulses; the board is Yuki-only (radial gate); Accept flips the mission active.
      3. `find` - `nav-auctions` pulses en route; on screen the amber Inspect button
         (existing `inspect-visit-local-yard`) pulses; the visit flips
         `inspectionVisitActive`, revealing the stethoscope line anchored on the real
         `run-test-tutorial-lot-0-stethoscope` control; the narrowed symptom completes the
         step. Skipping straight to a bid or buy-now also completes it (`anyOf`).
      4. `bid` - `bid-tutorial-lot` pulses; placing the bid sets `playerHasBid`.
      5. `close` - `end-day` exists on every gameplay screen, so it pulses wherever the
         player stands; the overnight resolution is a guaranteed win at reserve (scripted
         rival pin + expiry backstop, untouched); the WIN card lands in the day report.
      6. `bay` - car in parking; `service-slot-0` pulses (or `nav-garage` off-screen);
         drag, or the car screen's Move to service bay button, flips `serviceBayCarIds`.
      7. `wheel` - benching the wheels reveals the shop line (anchored on the Tyres bench
         block, which exists; the panel's Shop button does not until clicked); the order
         reveals the End-Day waiting line (`partOnOrder`); arrival reveals the Fit line
         (`partInInventory`, non-scrap, mirroring the swap-candidate rule); the refit puts
         mint tyres on the car and completes `partBandAtLeast`.
      8. `engine` - engine benched reveals the Head line (anchored on the bench block);
         recondition to fine + refit completes the step; the labour line covers the
         run-dry day boundary.
      9. `deliver` - `nav-jobs` then `mission-deliver`; the line names the Pick-a-car
         dropdown; delivery jumps the machine to the terminal step.
      10. `done` - Finish sets `tutorialStatus: 'done'`; radial offers resume next day,
          which is exactly what the closing line promises.
- [x] Narrow test evidence, each run once at its final state: content guards
      (schemas/integrity/noEmDash/spellingGuard) 47 passed; `TutorialOverlay.test.ts`
      12 passed; `tutorialIsolation.test.ts` + `tutorialProbe.test.ts` 13 passed;
      the five screen-side files 122 passed; the rearranged game files 84 passed. The
      pre-push hook on this commit's push is the full gate (directive 20).
- [x] Copy swept personally against the content quality bar and the tone directive
      (playtest item 14); no em dashes; British spelling; the four copy-string test pins
      broken by the warm pass were updated to the new strings (case (a)).
