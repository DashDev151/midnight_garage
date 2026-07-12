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
- [ ] **Component tests that `mount()` many times per file without `unmount()`ing between tests risk
  a Pinia cross-test leak** (found and fixed in `CarDetailScreen.test.ts` during Sprint 28):
  `getActivePinia()` prefers an injected pinia from the current Vue injection context over the
  module-level "active" one `setActivePinia` sets, so a component left mounted from a prior test
  can leak its store's state into the next test (confirmed via direct reference-identity checks,
  not a guess). Sprint 28 fixed only the one file it broke (tracking every `mountAt`-produced
  wrapper and unmounting it in `afterEach`); no repo-wide audit of other multi-mount test files was
  done - worth a sweep if this class of flake ever surfaces elsewhere.

## Open balance/economy questions

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
