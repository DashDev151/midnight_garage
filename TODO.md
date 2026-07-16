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

- [ ] **THE BOT HARNESS NEEDS A FULL REWORK - it does not simulate real gameplay, and its
  career-derived numbers should not be trusted as design evidence** (maintainer verdict,
  2026-07-15: *"basically right now we know that the entire Sim part with the bots is kinda
  useless. This needs a full rework to ACTUALLY SIMULATE REAL GAMEPLAY"*). This supersedes and
  consolidates the three separate entries that used to sit here (the standing harness-vs-real-play
  doubt restated since 2026-07-08, the no-aftermarket gap, and the days-to-`local` bot-patience
  finding). The doubt is no longer a doubt - it is measured, repeatedly, from four independent
  directions:

  1. **Rep rate is 5x off, and the gate that measures it is now statistically hollow.** The maintainer's own session reached 32 rep and the `local` rung by
     **day 6** (~5 rep/day). The `competent-policy` probe earns ~**1 rep/day**, p50 **day 16**.
     Consequence: days-to-`local` - one of only NINE hard-gated invariants, and the flagship
     "is progression paced right" check since Sprint 23 - has been answering *"how long does this
     bot take"* for its entire life. The reputation ladder was then scaled to that answer, so it
     collapsed under real play (the old `local` at 15 falls on day 3 for a real player). Sprint 69
     re-bases the band around the bot's rate because the probe is the only thing measuring it -
     an honest workaround for a broken instrument, not a fix.

     **Sprint 69 made this worse, measurably.** With `local` at 60 the probe reaches it in only
     **362/1000** careers inside the 100-day horizon (was 942/1000), and `days_to_tier` counts
     ONLY the seeds that arrived - so the gated p50 (now 69 days) is the median of the **fastest
     third**, not of a typical career. The true all-careers median is past the horizon and cannot
     be observed at all. The statistic understates the real pace, and gets less meaningful the
     harder the ladder gets. Two things follow, neither decided: (a) the reach COUNT is now a more
     honest gate than the percentile, and (b) the 100-day window may need to grow to measure the
     upper rungs (`respected`/`legend`) at all - flagged for the maintainer in `sprint69.md`
     decision 6.
  2. **No bot installs an aftermarket part - ever.** Across 9 strategies x 1000 careers, every
     owned car carries a ZERO aftermarket premium. Sprint 60's foundation law (economy-bible Law 5)
     scales exactly that premium term, and the harness run came back **byte-for-byte identical** to
     Sprint 59's. The harness is structurally blind to the entire aftermarket half of the economy:
     installed-part value, the foundation law, build coherence, buyer taste on modified cars.
  3. **Bots never make mistakes, so whole mechanics go untested.** The Sprint 68 provenance bug
     (buy a part, fit it to a customer's car, remove it, and the game confiscates it as the
     customer's) survived every harness run ever done, because no bot has ever mis-bought a part.
     Same for the grace/double-parking slot, rejecting an offer, or planning work and not
     confirming it.
  4. **Bots can't reach the content they're meant to test.** Handyman 0/30 and Cautious Restorer
     2/200 seeds ever clear a tool tier; post-Sprint-59 `competent-policy` - the bot built
     specifically to climb - affords **zero** tool upgrades in 100 days. Large parts of the
     progression system are simply never exercised.
  5. **Every bot restores every car to mint, always** (found Sprint 66). `bots/bandHelpers.ts`
     hardcodes `targetBand: 'mint'`, and every strategy's done-check is
     `isGroupAtLeast(car, id, 'mint', ...)`. No bot has ever chosen a repair depth - the single
     most consequential decision the game asks of a player. This stopped being merely unrealistic
     in Sprint 66: economy-bible Law 1's tier-expectation amendment makes a mint restore
     deliberately unprofitable on a cheap car, so the bots now execute the exact play the economy
     is designed to punish. Their day-100 cash curves went sharply negative (Flipper Y-106,183
     against Y300,000 starting cash) while the bot-free coherence table proves the SAME cars clear
     +9.6% to +34.5% of clean value on the sensible play. That gap is the clearest measurement of
     this defect yet produced: the economy is fine and the bots cannot play it. **Do not tune the
     economy against these curves** - a rewritten bot must pick a target band per car.
  6. **Sprint 71's teardown mechanic permanently stalls `competent-policy` after its first car**
     (found running this sprint's gate). Measured directly (`runCareer.test.ts`, this exact
     harness): 0/100 seeds ever gain a single reputation point in 100 days (was 45/100 at the
     Sprint 69 ladder). `competentPolicyStrategy` (`bots/competentPolicy.ts`) still treats every
     component group as on-car-repairable; step 4 claims the sole starting service bay for the
     first below-mint group it finds, but Sprint 71 moved bolt-on/buried repair to the bench
     (`planGroupRepair` now excludes those slots entirely, `bands.ts`), so a bolt-on/buried group
     can never reach mint through this bot's only repair path. Step 4b's stall-detection never
     rescues it either: `carsGettingJobsToday.add(car.id)` runs unconditionally, even when the
     queued repair plan was empty, so the bay is never freed. With `MAX_CONCURRENT_CARS = 1` the
     one bay and the one car are wedged together for the rest of the career, and since the same
     bay also gates step 6's service-job work, reputation gain stops entirely, not just the
     clean/concours sale path. Same shape as finding 5 (a bot cannot make a decision the new
     mechanic requires - here, when to uninstall/bench-repair/reinstall), not a defect in the
     teardown mechanic itself: a human player uses the new loop freely (`CarDetailScreen.vue`'s
     "Take it off"). The `runCareer.test.ts` assertion was rewritten to the honestly-measured
     value (0), not loosened to force a pass. Deferred to the rework below rather than patched ad
     hoc in Sprint 71: teaching a bot the teardown loop is exactly the "per-car target-band
     choice" sophistication finding 5 already says a rewritten bot needs.
     **CI impact, confirmed by running the real 1000-career harness (`pnpm balance:run` +
     `python -m balance.cli check`) at the end of Sprint 71:** the same stall reproduces at full
     scale - 0/1000 seeds, `p50=None` - so `balance.cli check`'s hard-gated "Days-to-`local`"
     invariant now FAILS (was passing pre-Sprint-71). This was NOT silently patched: `invariants.py`
     is untouched, and demoting an already-hard-gated CI check to informational is a maintainer
     call (the file's own precedent for the three checks already informational: "kept
     informational... since no maintainer has signed off on hard-gating them yet" - the converse,
     UN-gating one, deserves the same sign-off), not something to decide inside the sprint that
     exposed the gap. Flagged in `sprint71.md`'s Exit for explicit maintainer attention: `balance`
     CI will show red on this one line until either the bot-harness rework lands or the maintainer
     explicitly demotes this specific check.

  **What survives the rework, and must not be thrown away.** The distinction matters: the harness
  has two halves and only one is broken.
  - **Bot-derived (unreliable):** every days-to-tier figure, every per-strategy cash curve, the
    auction win-price tails, the buyout share. Treat these as bot statistics, not design
    statistics.
  - **Closed-form and sound (bot-free):** `computeRosterCoherence`'s Law 1/2/3/4 checks call the
    real sim functions against deliberately-constructed worst-case cars - no bots, no RNG, no
    careers. Same for the `valueModelProbes` acceptance families and the golden-master
    determinism hashes. These are the checks that actually caught things, and they should be
    where more verification goes, not less.

  **The epistemics problem, which any rework must answer first** (maintainer discussion,
  2026-07-15, prompted by *"not a single test has ever picked something up that improved the
  economy balancing or gameplay experience"*). That observation is correct, and it generalises
  past the tests: **a bot is a test wearing a costume.** Both encode a strategy someone already
  wrote down, so both can only ever report how well that guess plays. Neither can surprise you.
  Of 1096 tests, the 19 in `valueModelProbes.test.ts` do real economic reasoning; everything else
  is a regression net (worth keeping - it buys velocity, not insight - but it is not an
  instrument). Every genuine discovery in 66 sprints came from something that RENDERED NUMBERS TO
  A HUMAN: the maintainer's playtests, and `report.md`'s ten-row coherence table (Sprint 55's
  frenzy finding and Sprint 66's entire diminishing-returns law both came from one read of it).
  The suite is not too big; it is lopsided - ~98% "is it still what we said", ~2% "what is it
  actually", and one report page carrying the whole discovery load.

  So **"smarter bots" is the wrong target.** It would spend the effort and return a better-dressed
  mirror. Sprint 66 is the proof: the bots went Y106k negative and told us nothing the ten
  closed-form rows had not already said better.

  **What a real rework should build instead: a DECISION REPORT** (unscoped - needs its own design
  pass, not a sprint bolt-on). Not a simulated player, but an enumeration of the choices the game
  actually puts in front of one, each scored closed-form: day 1, Y300k, here are the eight lots on
  the board; here is the best play on each, what it returns, and how long it takes. The question
  that matters then becomes directly measurable - **what is the spread between the best choice and
  the worst?** A spread near zero means the decision is fake and the day is filler. If a shitbox
  and a Supra both answer "just fix it up", the tier system is decoration. This is the same
  instrument that has worked twice already (the coherence table), pointed at gameplay instead of
  at prices; it has no bots in it so it cannot inherit their blindness, and it would have caught
  the mint-kei problem on day one rather than fifteen sprints in.

  **If bots survive at all**, they need to resemble a person's *decision rate and decision mix*,
  not just decision *legality*: a builder/tuner archetype that installs aftermarket (coherently AND
  incoherently, so Law 5 is stressed); a per-car target-band choice rather than hardcoded mint
  (finding 5); rep-earning calibrated to a measured human rate rather than emergent patience;
  error injection (mis-buys, wrong-grade fits, forgotten hand-backs); archetypes that can actually
  reach the mid-game content they exist to test. The **recorded-play idea** below is the most
  promising route to calibrating any of that against reality rather than against another guess -
  it is now a prerequisite for trusting bot output again, not a nice-to-have. Until this lands,
  every economy/pacing decision should lean on closed-form probes plus maintainer playtest, and
  treat "N invariants pass" as evidence
  the mechanism doesn't crash - never evidence the game is paced right or is fun.
- [ ] **Recorded-play idea** (user-proposed 2026-07-09): parse real play sessions into per-archetype
  statistical rulesets - rates and biases ("bids X% below book," "does these repairs, buys that
  part"), not literal replay, and **phase-aware** (a career can drift mid-run; today's bots don't).
  Capture infrastructure (v0) shipped in Sprint 24 - a Dexie `sessionEvents` table, a `gameStore.ts`
  hook on every player action, a JSON export button - but it's capture only. Still unscoped: how
  many real sessions before a derived rate is trustworthy, how phase-drift gets detected/encoded,
  and how a derived ruleset plugs into the existing `(state, context) => DayActions` bot shape.
  Blocked on there being real play data to parse - the next playtest (above) is the first session
  this can actually capture.
- [ ] **Handyman and Cautious Restorer have no realistic route to reputation, so Sprint 43's
  tool-tier reputation gate (tiers 2/3 need `local`/`known`, maintainer decision 2026-07-13) locks
  them out of upgrading ANY tool line, not just the higher ones.** Measured directly
  (`runCareer.test.ts`, this exact harness): Handyman 0/30 seeds ever clear tier 2 on any of the six
  lines (100-day careers); Cautious Restorer 2/200. Root cause: neither bot runs service jobs, and
  neither bot's sales reliably clear the clean/concours quality bar - the only two ways reputation
  accrues - so a bot with a cash-only identity has nothing to spend toward the gate no matter how
  much cash it has. Maintainer-confirmed (2026-07-13): this is the simulation exposing a bot playing
  the game in an unintended way, not a design defect in the reputation gate itself, and the two
  `runCareer.test.ts` assertions were rewritten to the honestly-measured (near-total lockout)
  reality rather than loosened to force a pass. Deferred here rather than fixed in Sprint 43: give
  Handyman/Cautious Restorer some route to reputation (an occasional service job, or a repair
  target that reliably clears clean/concours) so their tool-upgrade behavior actually exercises the
  new gate instead of just proving it exists.
  **Update (Sprint 59, the earned-yen retune, 2026-07-14): the lockout now extends to
  competent-policy too** - the one bot built specifically to climb the reputation ladder.
  Measured directly (same harness): 0/100 seeds ever clear a tool-tier upgrade within 100 days,
  down from 14/100 pre-Sprint-59 (itself already down from 48/100 pre-Sprint-52). Root cause is
  cash pressure, not reputation: competent-policy clears reputation gates easily (day-100 median
  202 points, `local` by p50=12 days), but Sprint 59's starting-cash cut (Y1.5M -> Y300k) plus the
  tightened service-job margins leave it without the Y600k-900k a tier-2 tool line costs within the
  100-day window even though its day-100 median cash (Y643,697) would clear it later. The
  `runCareer.test.ts` assertion was rewritten to the honestly-measured value (near-zero), not
  loosened to force a pass. Worth a maintainer look alongside the Handyman/Cautious-Restorer item
  above - a single future bot-tuning/pacing pass could address all three at once (e.g. per-bot tool-
  upgrade eagerness, or checking the 100-day harness window itself is long enough to see a slower-
  but-real tool-upgrade loop through).

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
  / missing). **Scheduled: rides in Sprint 75** (`docs/sprints/sprint75.md`, decision 1).
- [ ] Split `gameStore` into domain stores (`useGarageStore` / `useAuctionStore` / `useStaffStore`
  behind the current surface) once staff/events land - it's a fine façade now, but trending toward a
  god-store.
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
- [ ] **Invariant #6 (first-timer resale speed)** - "first-timer buyers keep sub-¥500k Commons
  sellable within 7 days at book value or better" has no bot modeling first-timer-specific selling
  behavior; `competentPolicyStrategy` (Sprint 23) sells via the generic clean/concours faucet, not
  this. Needs a purpose-built bot or harness variant if this specific invariant is ever wanted.
- [ ] Forced-loan interest rate and repayment cadence (GDD 6.6 says "painful," doesn't specify how
  painful) - open question for the spreadsheet pass. (The parts-pricing-curve question that used to
  sit here moved into Sprint 28's catalog work.)
- [ ] **Law 6 (the wage law) genuinely fails on the shitbox tier once the full teardown chain is
  honestly priced (found Sprint 72, decision 6).** Before Sprint 72, `computeModelCoherence`'s wage
  probe undercounted a bolt-on/buried repair's teardown labour (Sprint 71's disclosed gap); pricing
  it honestly (deduped once per shared blocker across the whole restoration, not once per part
  behind it - see `coherence.ts`) drops `honda-city-e-aa`/`suzuki-wagon-r-ct21s` to a real
  `wageMarginYen` of -Y20,725 (0.39x rent), while common/uncommon/rare all clear a large positive
  margin. Root cause, not a bug: a shitbox's cheap parts return too little repair gain
  (`repairGainYen` scales with part price) to outearn the rent the teardown labour burns (labour is
  value-blind). `invariants.py`'s Law 6 check is split accordingly - common/uncommon/rare stays
  hard-gated, the shitbox tier is measured and disclosed, not silently loosened (same treatment in
  `valueModelProbes.test.ts`). Maintainer call needed: soften the teardown labour premium, raise
  `marketRepairDiscount`, or accept that not every shitbox repair job is worth a player's day.

## Planned systems (designed, not yet scheduled)

The 2026-07-15 design pass fixed the arc order and the same-day delegation scoped it into
sprint docs end to end. **The arc: Sprint 70 provenance (landed) -> 71 teardown (landed) -> 72
outcome jobs (landed) -> 73 diagnosis I (landed) -> 74-75 diagnosis II/III -> 76-78 story
missions** (`docs/sprints/sprint70.md` through `sprint78.md`; sprint70.md's/sprint71.md's/
sprint72.md's/sprint73.md's own Exit sections are the permanent record of each rework itself -
the component-removal-and-repair-hierarchy entry that used to sit here is fully landed and
removed, per this file's policy). Each
later system consumes verbs the earlier one builds (provenance answers ownership on every part
verb; the component arc supplies uninstall-reveals-truth and the shared outcome-predicate module;
diagnosis makes commissions a gamble instead of a shopping list). Entries below stay until their
sprints land.

- [ ] **Diagnosis - the detective game** (`docs/design/diagnosis-spec.md`, now v2, 2026-07-15;
  v1's pay-to-reveal design was rejected as loot-box shaped and is recorded dead in the spec).
  Symptoms are free and public; every symptom has an open weighted cause table; inspection is a
  1-slot per-house visit with an hour budget spent running tests that eliminate causes. **The
  pricing law: the room prices the symptom, the player prices the cause** - rivals never see test
  results; sleeper and trap factories both authored; a closed-form blind-buy guardrail keeps the
  edge skill, not arbitrage. Defaults for all dials are decided in the spec. Repeals Sprint 27's
  pre-bid transparency law; this SUPERSEDES the 2026-07-11 pause on hidden defects (the pause
  demanded a design that beats transparency by creating real decisions and pricing information
  coherently - this is that design, and the maintainer directed the sprint planning 2026-07-15).
  Depends on the component hierarchy (uninstall-reveals-truth). **Scoped: Sprints 73-75.**
  **Sprint 73 (diagnosis I) landed the symptom/cause content, generation, the fear-priced
  `sheetGuideValueYen` seam, the blind-buy guardrail, and the read-only lot-card disclosure - no
  inspection verb yet (Sprint 74) and `remainingCauseIds` never narrows from its full list yet.**

- [ ] **Story missions - outcome-based build commissions** (`docs/design/story-builds-spec.md`
  v2 with the 2026-07-15 rulings). A customer names an OUTCOME, not a car. **Maintainer rulings: first
  proper progression addition (Hall of Legends deferred behind it); v1.0 is a HAND-AUTHORED
  campaign with recurring named characters, procedural commissions deferred to endgame
  replayability.** Consumes the shared `Requirement` module from the component arc. Depends on
  diagnosis. Roadmap: Phase 4, beside the commissions line. **Scoped: Sprints 76-78.**

- [ ] **"Drive My Car" test-drive mode** (`docs/design/drive-mode-spec.md` v2, 2026-07-12).
  Drive a finished build before flipping it. **Post-launch, by the maintainer's standing
  2026-07-08 sign-off** (optional, zero gameplay weight - which is what keeps it inside the
  no-reflex-input hard rule rather than an exception to it; do not flag it as a rules violation).
  Slip-angle physics in `packages/sim`, Mode 7 chase cam in Pixi; a technical review found the
  architecture sound. Binding constraint before it ever enters a sprint, from the spec itself:
  **stat-linked, not twitch-linked.** Roadmap: Phase 7, post-launch.

- [ ] **Skill / XP progression** - learn-by-doing growth for staff *and* the player character; skill
  *optimizes* (efficiency/quality), never *unlocks* tiers (tools + rep do that). Staff skill lands
  with the staff system, still unscheduled; player-character skill is new v1.0 scope, slotted
  against the service-jobs feature. Full design: `docs/design/skill-progression.md`.
  **Update (Sprint 39, Progression Rework arc close-out, 2026-07-12):** the "tools + rep do that"
  half this item already deferred to is now BUILT (tool tiers, Sprint 36; reputation unchanged) -
  `skill-progression.md` has been reconciled against `docs/design/progression-bible.md` (the
  canonical progression rules now); its still-open "staff/player skill optimizes efficiency and
  quality" scope is genuinely distinct from specialty (Sprint 38, identity/access, earned not
  optimized) and remains unbuilt/unscheduled, this item stays open for exactly that scope.

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
- [ ] Salvage & restore parts mechanic - maintainer said they'll expand on this separately; parked
  until that expansion exists, don't design it unprompted.
- [ ] **The game needs a JDM-specific hook - flagged by the maintainer 2026-07-15, to be scoped
  in a separate session; do not design unprompted.** The concern, verbatim in spirit: the current
  repair/component systems are mechanically generic - swap the car roster for European cars and
  the game plays identically, which risks the love-letter-to-90s-JDM identity reading as a reskin.
  Needs a mechanical, narrative, or cultural element that ties the core experience to the setting.
  Seed observation from the design pass (an input for that session, not a design): the cheapest
  carriers are content rather than mechanics - diagnosis symptom/cause tables keyed to signature
  engine families, period parts culture, and the story-mission cast.

## User-only tasks (air-gapped / purchases / accounts / legal)

- [ ] Buy Aseprite; (optional, whenever convenient) draw a real car sprite to replace the
  programmatic placeholder from the Sprint 00 art spike.
- [ ] Trademark search on the final title ("Midnight Garage" vs. alternates in the GDD); register a
  domain if the search comes back clean.
