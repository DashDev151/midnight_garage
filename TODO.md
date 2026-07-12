# TODO

Deliberately deferred items that are **not** tied to any specific future sprint number, so they
won't surface again just by reading `docs/sprints/sprintXX.md` in order. Check this file
separately when planning a new sprint. (Deferrals that already have a sprint number attached live
in their sprint docs instead and aren't duplicated here.)

**This file holds only what's still open.** Once an item is fully resolved, it's removed outright -
the sprint doc (`docs/sprints/sprintNN.md`) or the commit that picked it up is the permanent
historical record; this file doesn't re-narrate it. (Last full pass: 2026-07-11, after the
foundational-economy arc - Sprints 20-24 - landed; see `git log` for every sprint's commit hash.)

## Playtest status

The playtest happened 2026-07-11 (raw notes: `docs/playtest-notes-2026-07-11.md`). Its triage
produced the Loop Rework arc, Sprints 25-31 (`docs/sprints/sprint25.md` onward), which now
carries every finding; per this file's policy those items live there, not here. Still open from
the old checklist:

- [ ] **Export the session log** (`SaveMenu.vue` -> "Export session log") from a real session -
  the first artifact for the recorded-play idea below. Not confirmed done during the 2026-07-11
  session.

## Standing concerns

Not single tasks - revisit when related work comes up, don't treat either as resolved by "checks
pass."

- [ ] **Whether the balance harness (bots + invariants) actually reflects real gameplay is still an
  open doubt**, restated increasingly sharply since 2026-07-08: bots may behave consistently with
  each other without resembling how a real player plays. Sprint 23's fresh harness run sharpened
  this further - every active strategy underperforms a do-nothing baseline at day 100 under current
  mechanics (see `tools/balance/src/balance/invariants.py`'s module docstring for the numbers) - a
  genuine finding about the economy's pacing/cost curve, not yet resolved. "N invariants pass" is
  evidence the mechanism works, never evidence the game is fun or the bots are realistic.
- [ ] **Recorded-play idea** (user-proposed 2026-07-09): parse real play sessions into per-archetype
  statistical rulesets - rates and biases ("bids X% below book," "does these repairs, buys that
  part"), not literal replay, and **phase-aware** (a career can drift mid-run; today's bots don't).
  Capture infrastructure (v0) shipped in Sprint 24 - a Dexie `sessionEvents` table, a `gameStore.ts`
  hook on every player action, a JSON export button - but it's capture only. Still unscoped: how
  many real sessions before a derived rate is trustworthy, how phase-drift gets detected/encoded,
  and how a derived ruleset plugs into the existing `(state, context) => DayActions` bot shape.
  Blocked on there being real play data to parse - the next playtest (above) is the first session
  this can actually capture.

## Open engineering

- [ ] **Specialty (Sprint 38, the progression bible's horizontal axis) earns from service-job work
  only, never from sales.** A deliberate scope line, not an oversight: attributing a SALE'S
  reputation-quality delta to "the disciplines the player actually improved on that car" would
  need real per-car work provenance (which groups were genuinely repaired/installed by the player
  vs. bought-in-good-condition or inherited from a prior owner) that the sim does not track today.
  Wiring sales into specialty without that provenance would reward buying good cars over building
  them, the opposite of what specialty is supposed to mean. Worth revisiting once (or if) the sim
  tracks real per-car work provenance; until then, `resolveServiceJob` stays the only specialty
  source (`serviceJobs.ts`).
- [ ] **Generated cars (auction lots AND service-job customer cars) should sometimes arrive with
  AFTERMARKET parts already installed, not only stock + missing/worn (maintainer note, 2026-07-12,
  for the playtest pass).** e.g. a customer brings in a car that already has street brakes needing
  repair, or an EG6 shows up at auction with race rims (a Volk TE37 equivalent) already fitted.
  Today's generation (Sprint 32) only fills slots with generic STOCK parts at a rolled band, plus a
  small missing-slot chance; it never rolls a pre-installed street/sport/race part. Add a small,
  content-tunable per-slot chance at generation for an aftermarket grade to be pre-fitted (at a
  rolled condition band), so the world has genuinely-modified cars to buy and repair, not just
  stock ones. Composes cleanly with the existing value math (`installedPartsValueYen` already
  prices aftermarket) and the missing-slot roll (a slot is then one of: stock / aftermarket / worn
  / missing).
- [ ] **`stepCostYen` (the per-grade repair cost in the parts taxonomy) is stock-calibrated and does
  not scale with a part's value (surfaced during the Sprint 34 double-count fix).** The restoration
  bill (`bands.ts` `costToMintYen` -> `carCostToMintYen`) charges `gradesBetween(band,'mint') *
  stepCostYen` to repair ANY part in a slot, whether it is a Y5k stock part or a Y300k race turbo.
  Since Sprint 34 made the bill the single place condition is priced (aftermarket parts no longer
  band-discounted in `installedPartsValueYen`), this means wear on an EXPENSIVE aftermarket part is
  cheap to fix relative to the value it restores, so restoring high-value mods is disproportionately
  profitable. Structurally the de-dup is correct (condition counted once); the magnitude is the open
  question: should `stepCostYen` (or the restoration cost generally) scale with the installed part's
  price/grade rather than being a flat per-slot stock number? A content/calibration decision for the
  balance pass, not a bug. Only bites once the player mods a car or pre-installed aftermarket parts
  (above) land; generated cars are all stock today so it is dormant.
- [ ] **A customer-owned part (Sprint 35) can escape close-out reconciliation by being installed on
  the player's OWN car.** Sell and scrap are gated on `customerJobId`, but install is not, so a
  player could pull a customer's part, install it on their own car (it leaves `partInventory`), and
  keep it past the service job's close-out (which only filters `partInventory`). Edge case, requires
  deliberate action; flagged during Sprint 35 and left ungated to avoid scope creep. Fix by gating
  install of a `customerJobId`-tagged part to only the owning customer's car (or blocking it
  outright), if the ethic matters enough to close.
- [ ] Split `gameStore` into domain stores (`useGarageStore` / `useAuctionStore` / `useStaffStore`
  behind the current surface) once staff/events land - it's a fine façade now, but trending toward a
  god-store.
- [ ] **A service-job offer that fails the equipment gate is generated, then surfaced-then-blocked at
  accept, rather than never generated at all.** Present since Sprint 13, unaffected in kind by
  Sprint 29's move to multi-task templates (`resolveAcceptServiceJob`, `serviceJobs.ts`, still
  refuses accept if ANY repair task's group is unequipped, same shape as before, just checked across
  a whole task list now instead of one `work`). The maintainer's own read (recorded since Sprint 13):
  arguably a repair-touching offer shouldn't be generated at all when the player can't act on it,
  rather than shown then blocked. Still the simpler, shipped behavior; not revisited this sprint.
- [ ] **Bots' "predict a same-tick `partInstanceId` for a queued install job" pattern is structurally
  broken** (found during Sprint 29, tracing why `competentPolicyStrategy`'s reputation faucet had
  gone to zero after the multi-task service-job rewrite). `advanceDay` resolves `createJobs` (step 1)
  BEFORE `buyParts` (step 1b), so a job queued the same tick as the part purchase it depends on
  always fails `installFitGate` (the part genuinely isn't in `state.partInventory` yet when the gate
  checks) - `investor.ts`'s own doc comment describes the id-prediction trick but never actually
  verifies the same-tick job succeeds, and it doesn't; nothing caught this because no existing test
  checked Investor's install jobs actually land. Sprint 29's own new
  `bots/serviceJobHelpers.ts::queueServiceJobTasks` fixes this for service-job installs (buy this
  tick, install a LATER tick once the purchase is genuinely in inventory) - `investor.ts` itself was
  left untouched (out of Sprint 29's file scope) and still has the original bug, silently wasting
  cash buying parts every tick that never get installed. Worth fixing in `investor.ts` directly
  (same split-across-two-ticks approach) next time that file is touched; also worth re-running the
  balance harness's Investor payback-curve numbers once fixed, since they were measured against the
  broken behavior all along.
- [ ] **`investor.ts`'s part-selection is not slot-precise (found during Sprint 32).** It picks the
  cheapest catalog part addressed to a needy GROUP, not the specific empty `CarPartId` within it -
  on a multi-part group with only one open slot, this can pick a part whose own slot is already
  occupied. `installFitGate` correctly refuses this now (Sprint 32 fixed a real gap where it used
  to create a job that silently got stuck instead), so it's a clean no-op rather than a stuck
  career, but Investor still wastes ticks failing to install productively on such a car. Worth
  fixing by resolving the actual empty `CarPartId` within the chosen group first (mirroring
  `worstGroup`'s own per-part-aware pattern), not just the cheapest catalog part addressed to the
  group as a whole.
- [ ] **No bot proactively fills a MISSING car-part slot, or weighs one as worse than merely worn
  (Sprint 32, the stock-baseline/missing-slot model).** `isGroupAtLeast` (every bot's "is this
  group good enough" check, `bots/bandHelpers.ts`) silently excludes a missing part from
  consideration - a group with a missing part can read as "fully mint" to a bot even though
  `saleReputationDeltaFor` (the real sale-quality math) will price the eventual sale as a lemon.
  Not confirmed to structurally stall any bot in spot-checks (a `runCareer.test.ts` failure
  initially suspected to be this traced to unrelated content repricing instead - see
  `sprint32.md`'s Exit), but the gap is real: a bot can genuinely believe a car is sale-ready when
  it isn't. Needs either a bot-side "is anything missing" check before declaring a car restored,
  or an install-focused fill-the-gap step alongside the existing repair step.
- [ ] **Component tests that `mount()` many times per file without `unmount()`ing between tests risk
  a Pinia cross-test leak** (found and fixed in `CarDetailScreen.test.ts` during Sprint 28):
  `getActivePinia()` prefers an injected pinia from the current Vue injection context over the
  module-level "active" one `setActivePinia` sets, so a component left mounted from a prior test
  can leak its store's state into the next test (confirmed via direct reference-identity checks,
  not a guess). Sprint 28 fixed only the one file it broke (tracking every `mountAt`-produced
  wrapper and unmounting it in `afterEach`); no repo-wide audit of other multi-mount test files was
  done - worth a sweep if this class of flake ever surfaces elsewhere.

## Open balance/economy questions

- [ ] **Sprint 32 stock-baseline regression: competent-policy's reputation climb badly stalled;
  days-to-`local` hard invariant FAILS (maintainer chose document-and-defer to a later balancing
  pass, 2026-07-12).** After the stock-baseline/missing-slot model landed, the harness shows
  days-to-`local` p50 jumped ~23 -> 55 (band is [10,35]) and only 627/1000 careers reach `local`
  at all (was ~1000/1000) - roughly a third never reach the 2nd reputation tier in 100 days.
  Competent-policy's day100 CASH is fine/up (Y367k), so it makes money but stops earning
  reputation. Not yet root-caused; leading candidates: (a) the missing-slot mechanic on generated
  service-job/auction cars combined with NO bot handling missing slots (see the two Open-engineering
  items below: `isGroupAtLeast` excludes missing slots, no bot fills them) - the probe accepts/works
  cars it cannot complete, fails jobs, and reputation floors; (b) the catalog reprice (Sprint 32
  decision 1) shifting Sprint 29's DERIVED service-job payout/cost math so the accept-threshold
  rejects more jobs. This is a real progression problem (37% never reaching tier 2), NOT a pacing
  nudge, so it needs a bot-behavior/economy fix, not a band widen; the invariant is deliberately
  left FAILING (not silently retuned or downgraded to informational) so the next balance pass can't
  miss it. Also: `runCareer.test.ts`'s competent-policy day-100 assertion was LOOSENED
  (`finalSnapshot > 0` -> `some snapshot > 0`) to keep the suite green through this - that loosening
  is a symptom of this regression and must be RESTORED once it is fixed.
  **Update (Sprint 33):** a real, separate structural bug in this same neighborhood was found and
  fixed - the bot-facing `DayActions` pipeline had no way to remove a part before installing a
  replacement (Sprint 32's stock-baseline model fills every slot by default, so an install task's
  target is normally occupied), silently zeroing out every bot's install-based reputation faucet;
  fixed with a new `removeParts` DayAction (`actions.ts`/`advanceDay.ts`) that
  `serviceJobHelpers.ts`'s `queueServiceJobTasks` now queues first, mirroring the player's own
  required Remove-then-Replace two-step. `serviceGrinderStrategy` also now accepts install-only
  jobs, not just repair-only (Sprint 33 decision 9 leaves only the tire machine ownable at
  `unknown` reputation, closing the repair-only bootstrap path decision 9's own text names
  Replace-only work as the intended replacement for). Neither fix touches the days-to-`local`
  PACING question above - that's still open, and Sprint 33 ALSO changed the generation-condition
  curve and labor throughput, both of which move the same numbers - a fresh harness run against
  the full Sprint 33 diff is needed before this invariant can be re-assessed, not a re-derivation
  of the numbers above.
- [ ] **Sprint 30 living-auction tuning: the board is a fire sale at first-pass numbers
  (maintainer chose commit-as-is, tune in playtest, 2026-07-12).** Mechanics shipped and all hard
  invariants pass, but the balance harness shows 94% of auction wins are cheap "steals" (target
  ~10%, was 20% in Sprint 29) and Flipper is now a NET LOSS vs the do-nothing baseline
  (-Y115,178 below passive, was +Y34k above). Three compounding, all-JSON-tunable causes:
  staggered arrivals flood the board (92,990 acquisitions vs 21k, oversupply drags heat/sale
  prices), the new bidder interest is too weak to contest lots, and age/mileage depresses this
  old roster's values. Levers: `AUCTION_DAILY_SPAWN_RATE` (down), `auctionInterest.perCohortBidChance`
  / `turnoutBandWeights` (up), `ageFactorCurve`/`mileageFactorCurve` shapes. Also revisit the
  invented `cohortValuationSpreadByTurnout` + `eligible^2/bidderCount` damping (see `sprint30.md`
  Exit). Telemetry columns (`bidEvents`, `daysOpen`) now in `auctionWins.csv`; the Python report
  section to render them is a small unwired follow-up. This is the sprint's own user-only
  "playtest an auction week, tune curves in JSON" task, now with the measured starting point.
  **Update (2026-07-12 auction fix, commit after Sprint 32):** the two real BUGS this playtest
  also exposed are now fixed (the anti-snipe "leading then instantly outbid and closed" bug, and
  the invisible/black-box close), and a first-pass contest re-tune moved the fire sale the right
  way (auction steal tail 94% -> 84%, frenzy 6% -> 15%; `AUCTION_WHOLESALE_FRACTION` 0.75 -> 0.85,
  `perCohortBidChance` up, `turnoutBandWeights` toward packed, `maxIncrementsPerNight` 2 -> 3,
  `AUCTION_QUIET_DAYS_TO_HAMMER` 2 -> 3). Steals are STILL too high (84%), so the JSON contest
  calibration above remains open; the mechanic bugs are done.
- [ ] **INVESTIGATION: live in-room auction bidding (the "Option A" redesign, deferred 2026-07-12).**
  The maintainer took the targeted Option B fix (above) for now but is not sold on the current
  async, overnight-resolved auction model even debugged: bidding is inherently slow (one
  bid-exchange per in-game day, dragged over days). The proposed alternative is a live, on-screen
  bidding round entered on demand per lot: price opens at reserve, the player and the rolled
  dealer cohorts alternate raising with every bid VISIBLE, the player chooses Raise (increment or
  jump) or Pass after each dealer counter, and it resolves win/lose in ONE sitting - transparent,
  fast, no black box, no snipe (the round only ends on the player's Pass or the room going quiet),
  still turn-based/no-reflex. To test whether it feels right BEFORE committing to the full rework
  (which would rip out the overnight bidder process, change the lot shape + a save migration,
  resolve skipped lots offscreen, retune, etc.), build a STRIPPED throwaway demo first: one live
  bidding-round screen on a sample lot, coexisting with the current system, no saves/board/tuning
  touched. Decide from the demo. See the 2026-07-12 chat design write-up.
- [ ] **Model-independent part restoration costs make cheap cars not restore-worthy (Sprint 27,
  flag-and-tune-later per maintainer).** `restorationBill` (`carCostToMintYen`, all 29 real parts)
  is priced from `parts-taxonomy.json`'s flat, model-independent step costs, so a realistically-
  worn car's bill (~Y400k-1.4M) routinely dwarfs a shitbox/common car's own Y180k-650k book value
  while being a small fraction of a premium car's Y2-6M. The Sprint 27 auction-seizure symptom
  (worn cars priced below a static book-value reserve) is FIXED - reserve was rebased onto the
  guide value (`sprint27.md` Exit follow-up, Sprint 30 decision 2 pulled forward) - but the deeper
  structural point remains: a cheap car whose restoration bill exceeds its own clean value is
  genuinely not worth restoring under the current taxonomy. The maintainer chose to flag this and
  tune later (via `hassleFactor`/`floorFraction`, or eventually model-scaled restoration costs)
  rather than restructure the frozen taxonomy now. Not blocking; a real balance call for the
  harness pass.
- [ ] **Invariant #6 (first-timer resale speed)** - "first-timer buyers keep sub-¥500k Commons
  sellable within 7 days at book value or better" has no bot modeling first-timer-specific selling
  behavior; `competentPolicyStrategy` (Sprint 23) sells via the generic clean/concours faucet, not
  this. Needs a purpose-built bot or harness variant if this specific invariant is ever wanted.
- [ ] Forced-loan interest rate and repayment cadence (GDD 6.6 says "painful," doesn't specify how
  painful) - open question for the spreadsheet pass. (The parts-pricing-curve question that used to
  sit here moved into Sprint 28's catalog work.)

## Planned systems (designed, not yet scheduled)

- [ ] **Skill / XP progression** - learn-by-doing growth for staff *and* the player character; skill
  *optimizes* (efficiency/quality), never *unlocks* tiers (tools + rep do that). Staff skill lands
  with the staff system, still unscheduled; player-character skill is new v1.0 scope, slotted
  against the service-jobs feature. Full design: `docs/design/skill-progression.md`.
- [ ] **In-inventory part-recondition mechanic** (Sprint 33 note 5c, maintainer-flagged future
  addition, explicitly deferred out of Sprint 33). A way to recondition/repair a damaged
  `PartInstance` sitting in inventory so it's reusable in a later build, instead of a worn part
  only ever being reinstallable at whatever band it already carries. Not designed yet.

## Design decisions awaiting maintainer direction

- [ ] **Naming Layer parody-flag default is undecided.** GDD explicitly defers whether the game
  ships with real brand names or parody names by default to closer to release. Revisit once a
  release date is in sight.
- [ ] **The recurring cast (landlord, bazaar auntie, the Rival) has no actual character design** -
  GDD only ever gives roles, never names. Needs real character design (names, personality, at
  minimum) - the maintainer's call on direction and timing, not something to invent unprompted.
- [ ] **Hall of Legends acquisition cadence isn't specified.** GDD names it the explicit v1.0 win
  condition (10 Legend cars, Enshrine mechanic) but only 1 of 10 ever had an acquisition trigger
  written down, and acquisition order across all 10 is explicitly undecided
  (`midnight-garage-roster.md`). Direction given: surface Legend-acquisition chances at regular
  intervals across a run (Blacklist/NFS-Most-Wanted style "always chasing the next car," not an
  endgame dump), gated by some combination of rep/skill/staff/money - but which combination gates
  each of the 10, and the actual story-lead writing/delivery, are still undesigned. Depends on the
  cast character-design item above for who delivers the leads.
- [ ] Real main/pause menu (Continue / Settings / New Game / Load Game) - explicitly lower priority
  ("at some stage").
- [ ] Salvage & restore parts mechanic - maintainer said they'll expand on this separately; parked
  until that expansion exists, don't design it unprompted.
- [ ] **Hidden defects / inspection information game: PAUSED (maintainer, 2026-07-11).** Removed
  from the game in Sprint 26 after the playtest verdict (fix costs uncorrelated with car value;
  inspection purely epistemic with no legible market meaning). Full pre-bid transparency
  (Sprint 27) is the baseline now. The feature may return only with a design that demonstrably
  beats transparency: it must create real decisions (not "the car is secretly a band worse"),
  answer exactly when and what the player sees pre-bid, and price the information coherently.
  Do not reintroduce casually.

## User-only tasks (air-gapped / purchases / accounts / legal)

- [ ] Buy Aseprite; (optional, whenever convenient) draw a real car sprite to replace the
  programmatic placeholder from the Sprint 00 art spike.
- [ ] Trademark search on the final title ("Midnight Garage" vs. alternates in the GDD); register a
  domain if the search comes back clean.
