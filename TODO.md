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

     **Resolved (Sprint 79, maintainer sign-off 2026-07-16): the demotion this finding asked for has
     happened.** Days-to-`local` (invariant 3), the buyout-share ceiling (invariant 5), and the 3
     legacy Sprint 03/09 checks (invariant 6) are all now `[INFO, not gated]` in `invariants.py` -
     `balance.cli check` exits 0 again. This is explicitly a demotion of bot-DERIVED checks only;
     the 6 closed-form coherence checks (Law 1/2/3/4/6-non-shitbox) that read `coherence.csv`, not
     bot careers, stay hard-gated and are unaffected. The bot harness itself is untouched by this -
     it still does not simulate real gameplay, and the rework below remains exactly as needed.

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

- [ ] **CRITICAL: full-codebase comment sweep - directive 10 is violated wholesale
  (maintainer, 2026-07-19).** Comments across every package carry process narrative:
  sprint numbers, decision numbers, playtest item numbers, dates, "amended same day",
  ruling attributions. Directive 10 explicitly forbids this, and the volume of comments
  is itself a violation: most code should carry none. The sweep's contract: every comment
  either states a real present-tense constraint or non-obvious behaviour with all
  provenance stripped, or is deleted; history lives in `git log` and `docs/sprints/`
  only. Scope is large (sim, game, content, tests) - orchestrator sets the style
  contract and spot-audits, agents execute file-by-file. Strongly consider landing a
  guard test alongside (mirroring the em-dash guard) that fails on `Sprint \d`,
  `playtest`, `decision \d`, or ISO dates inside comments under `packages/`, so the
  pattern cannot creep back.

- [ ] **The bench swap path bypasses the fitment law (found 2026-07-19, answering "what if
  the player buys the wrong-class tyres").** `partFitsCar` (economy-bible law 3: "a
  kei-class part physically cannot go on a sports car") is enforced on the on-car install
  path (`installablePartsForPart`, ReplaceDrawer dims non-fitting parts) but neither
  `benchSwapCandidates` (CarDetailScreen) nor `resolveSwapAssemblyMember` /
  `resolveRefitAssembly` (sim/assemblies.ts) checks it - a wrong-class part gets a live
  Fit button at the bench and rides the refit onto the car. Largely mitigated since: the
  bench now fits through the Replace drawer, whose fit-check dims non-fitting parts and
  makes them click-inert, and the walkthrough teaches the fits-this-vehicle filter with
  fitment-checked conditions. What remains open is the RESOLVER:
  `resolveSwapAssemblyMember` itself still accepts a wrong-class part, so only the UI
  stands between a mod/dev path and a law violation. Fix when next in the assembly code:
  the swap resolver refuses exactly as the on-car path does.

- [ ] **`chassis` sits in the `drivetrain` component group (pre-existing taxonomy), surfaced
  by Sprint 93's repair-ceiling caption.** A chassis repair now reads "The Transmission bench
  reaches mint", which is nonsensical (you weld/straighten a chassis, you do not press it on a
  gearbox bench). The caption is correct for the grouping; the GROUPING is the wart. Moving
  chassis to `body` would name the MIG welder (sensible) but ripples through everything that
  groups by component (marketValue, coherence repair planning, specialty rep, the service
  diagram layout, the tool line it draws its tier-2 from). A deliberate content-taxonomy pass,
  not a one-liner; do it when touching component grouping, and re-run the coherence probes.
  Also revisit the bench-recondition control's analogous (captionless) fine-cap at tier-1
  (Sprint 93 scoped the caption to the on-car "+" only).
- [ ] **LAUNCH-BLOCKING: replace the placeholder part sprites with commissioned art (Sprint 88,
  decision 4).** The 29 part + 3 assembly service-diagram sprites in
  `packages/game/src/components/partSprites.ts` are development placeholders, explicitly
  commissioned as such by the maintainer (playtest item 12) and authored to
  `docs/design/part-sprite-placeholders.md`. Under the art bible's no-AI-assets law they must NOT
  appear in any public build, screenshot, devlog or marketing material; commissioned pixel art
  replaces them before launch. The template + rasteriser API (`PART_SPRITE_TEMPLATES`,
  `PART_SPRITE_GRID`, `partSpriteDataUrl`) stays; only the template pixel data is swapped.
- [ ] **Specialty (Sprint 38, the progression bible's horizontal axis) earns from service-job work
  only, never from sales.** A deliberate scope line, not an oversight: attributing a SALE'S
  reputation-quality delta to "the disciplines the player actually improved on that car" would
  need real per-car work provenance (which groups were genuinely repaired/installed by the player
  vs. bought-in-good-condition or inherited from a prior owner) that the sim does not track today.
  Wiring sales into specialty without that provenance would reward buying good cars over building
  them, the opposite of what specialty is supposed to mean. Worth revisiting once (or if) the sim
  tracks real per-car work provenance; until then, `resolveServiceJob` stays the only specialty
  source (`serviceJobs.ts`).
- [ ] Split `gameStore` into domain stores (`useGarageStore` / `useAuctionStore` behind the current
  surface) - it's a fine façade now, but trending toward a god-store. `useStaffStore` landed in
  Sprint 82 (decision 6, `stores/staffStore.ts`): it owns the Staff Office view and the
  hire/dismiss/reassign actions, reading/writing the persisted staff data through `gameStore`'s
  exposed `gameState`/`dayLog`/`context`/`logSessionEvent`. The remaining garage/auction slices
  follow the same delegating-store pattern when they land.
- [x] **RESOLVED: the main-chunk build warning limit is calibrated, not deferred (orchestrator
  ruling 2026-07-17, Sprint 82 sweep).** Sprint 82 landed the one clean dynamic-import split it
  asked for: `save/saveDb.ts` imports Dexie dynamically (`import('dexie')` inside `getDb`), moving
  Dexie (~95kB) into its own chunk with zero consumer/test changes (`getDb` is a no-op without
  IndexedDB, so tests never load it). That cut the main chunk 611.65 -> 516.72kB. No clean
  dynamic-import split can go further: measured empirically, additionally code-splitting the
  ENTIRE save codec AND all four result modals only reached 500.98kB - the residual is the eager
  vue+content+sim+framework floor (~500kB), unsplittable without making the content/sim graph lazy
  (a large refactor). The orchestrator ruled: `build.chunkSizeWarningLimit` set to 600 in
  `packages/game/vite.config.ts`, calibrated just above the measured ~500kB floor so a real
  regression still warns. No vendor `manualChunks` split.
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

## Open balance/economy questions

- [ ] **Invariant #6 (first-timer resale speed)** - "first-timer buyers keep sub-¥500k Commons
  sellable within 7 days at book value or better" has no bot modeling first-timer-specific selling
  behavior; `competentPolicyStrategy` (Sprint 23) sells via the generic clean/concours faucet, not
  this. Needs a purpose-built bot or harness variant if this specific invariant is ever wanted.
- [ ] Forced-loan interest rate and repayment cadence (GDD 6.6 says "painful," doesn't specify how
  painful) - open question for the spreadsheet pass. (The parts-pricing-curve question that used to
  sit here moved into Sprint 28's catalog work.)
- [ ] **Law 6 (the wage law) genuinely fails on the shitbox tier once the full teardown chain is
  honestly priced (found Sprint 72, decision 6; re-measured Sprint 79).** Before Sprint 72,
  `computeModelCoherence`'s wage probe undercounted a bolt-on/buried repair's teardown labour
  (Sprint 71's disclosed gap); pricing it honestly (deduped once per shared blocker across the
  whole restoration, not once per part behind it - see `coherence.ts`) dropped
  `honda-city-e-aa`/`suzuki-wagon-r-ct21s` to a real `wageMarginYen` of -Y20,725 (0.39x rent), while
  common/uncommon/rare all clear a large positive margin. Root cause, not a bug: a shitbox's cheap
  parts return too little repair gain (`repairGainYen` scales with part price) to outearn the rent
  the teardown labour burns (labour is value-blind). **Sprint 79 (the equivalence-priced labour
  model) narrows the gap without closing it**: removal and blocker refits are now free, so the
  deficit is purely the repaired part's own refit labour - re-measured at -Y9,772 (0.57x rent) for
  both models, roughly half the prior loss but still negative. `invariants.py`'s Law 6 check stays
  split accordingly - common/uncommon/rare hard-gated, the shitbox tier measured and disclosed, not
  silently loosened (same treatment in `valueModelProbes.test.ts`). Maintainer call needed: raise
  `marketRepairDiscount`, or accept that not every shitbox repair job is worth a player's day.
- [ ] **Donor-flow (strip everything, sell it all, scrap the shell) versus full-car repair-and-flip
  (found Sprint 75, decision 3's integration tests; re-measured Sprint 79 after free removal).**
  Sprint 75 measured `nissan-180sx-rps13` (a rough, uniformly-`worn` car carrying `non-starter`):
  repairing just the diagnosed defect is profitable for the `flat-battery` sleeper and a genuine
  loss for the `seized-engine` corpse - the "worth fixing vs not" claim holds cleanly - but stripping
  never overtook repair-and-flip in absolute yen at any severity tested, because haircutting ~28
  largely-`worn` parts at 45% off cost more than the single catastrophic repair saved, once teardown
  labour was honestly priced (the same shape as the Law 6 shitbox finding above, the other side of
  the teardown economy). **Sprint 79 (the equivalence-priced labour model) removes that labour cost
  entirely** - `computeDonorCoherence`'s `stripLaborSlots` is now 0 for every roster model, since
  removal is free. Re-measured on the worst-case rolled car per model (`ModelDonorCoherenceRow.
  partedYieldOfWorstCaseYen` against that model's own `sensibleFlipMarginYen`): parting now WINS on
  three roster models' worst-case corpse - `honda-city-e-aa` (49.5% bill/clean), `honda-civic-
  sir2-eg6` (54.8%), and `nissan-180sx-rps13` itself (55.3%, the exact model Sprint 75 found never
  crossed over) - while seven others (including both rare-tier RX7s and the Supra, whose bill/clean
  ratio is only 31.7%) still favour repair. The crossover is not a single ratio (`coherence.test.ts`
  disclosed this from the start): the lowest ratio at which parting wins (49.5%) sits comfortably
  above the 0.20 decision gate this sprint's own doc set (`sprint79.md` decision 3) - buy-strip-sell
  is not threatening moderately-damaged cars, only genuine corpses, so `usedPartSaleFraction` (0.55)
  is NOT touched. Maintainer call needed: is a three-model donor loop the intended shape for v1.0,
  or does `usedPartSaleFraction`/the donor mechanic want a deliberate design pass now that it is
  reachable (rather than remaining a theoretical, never-quite-triggering mechanic).

## Planned systems (designed, not yet scheduled)

- [ ] **The cohesion pass: the game must look like the game before outside playtesting
  (maintainer amendment to the art bible, 2026-07-22).** A cohesive, if unpolished, art pass
  gates the first outside playtest; a mixed placeholder surface poisons the feedback. Zero
  spend stands: maintainer-made art and free licensed assets only. Scope when the arc opens:
  the layer model from the 2026-07-22 art-direction session (world = pixel canvas islands,
  object = bitmap diegetic controls, document = pixel-styled HTML cast as paper), the
  corner/border retrofit of the DOM UI (square/stepped corners, nine-slice frames), the
  palette decision (CC-29 extension vs Apollo subset, parked earlier), the navigation tab
  object (cassette rack retired; candidates in the art bible's open calls), and the font
  pairing rollout below. The interim font pairing (DotGothic16 display + M PLUS Rounded 1c
  reading) already landed 2026-07-22. The full required-asset inventory, the animation
  doctrine (proposed, awaiting sign-off), and the eight blocking decisions live in
  `docs/design/art-catalogue.md` (drafted 2026-07-22); its P1 column is this pass's scope.
- [ ] **Reading-face rollout: audit every long-form reading surface onto `--mg-font-reading`.**
  The token and both faces landed 2026-07-22 with the tutorial walkthrough as the proving
  ground. Still to sweep once the maintainer approves the pairing: dialogue/mission copy,
  symptom checklist result lines, event log, help/explainer text, and any copy sized below
  1rem; labels, numbers, headers, and button text stay on the pixel face at on-grid sizes.
- [ ] **Accessibility suite v2: reduced motion and colour-independent severity cues.** V1 has
  landed with the live room's promotion: an in-room auto-bid toggle places rung-one bids up to
  a player-set ceiling (defaulting to their own estimated value) without ever jumping, so
  reactions stay reader-triggered; a persisted fuse-length preset (standard/relaxed/unhurried)
  scales the per-bid clock. Still open and unscoped: reduced motion, and colour-independent
  severity cues (band chips currently lean on colour alone).
- [ ] **The Master Inspector staff trait - the diagnosis opt-out as an economy choice
  (maintainer-proposed 2026-07-21).** A hireable character who "can find any issue and has no
  interest in fixing any of them" (final copy at the content bar): while employed, the player
  can send them to inspect lots instead of reading the trees personally; they walk the optimal
  route within the visit's minute budget and the trail fills in with the same result lines, so
  the flavour still plays, the player just does not choose. The opt-out therefore costs a staff
  slot and wages on an otherwise-lacklustre hire rather than a settings toggle: engaged players
  keep their edge for free, disengaged players buy theirs. Implementation note: the
  best-route walker in diagnosisRouteProbes is effectively this character's brain already;
  staff traits already touch inspection (auction-rat's extra minutes), so this is a trait plus
  one resolver, not a new system. RULED v1.0 (maintainer, 2026-07-21), not post-launch.
- [x] **RULING (Sprint 111, 2026-07-22 playtest): owned-car diagnosis stays workup-only, closed,
  not to be re-opened casually.** The routed diagnostic tests (a yard visit's minute-budget
  route) are the yard's time game; at home, on a car the player already owns, the full afternoon
  is honest, so the workup screen's full manual diagnosis stays the only owned-car path - no
  routed/time-limited diagnosis mode for owned cars. Recorded here so the question does not
  resurface without cause; `sprint111.md` item 2 is the workup gate fix (hide/disable once every
  symptom is resolved) that shipped alongside this ruling.
- [ ] **Next-day delivery of auction wins (maintainer-proposed, 2026-07-22 playtest, floated as
  the alternative to express parts delivery; needs its own design pass before any sprint).** A
  car won at auction would arrive the morning after the hammer rather than settling straight into
  `ownedCars`, mirroring the "commit now, land later" shape parts delivery already uses
  (`resolveBuyPart`'s standard/express split). Sim-wide ripples, not a one-liner: the room's
  settle flow (`settleAuctionHammer`), where/how a won-but-undelivered car is held and displayed
  before it lands, and the tutorial's scripted-lot flow (which currently settles the tutorial car
  immediately). Scope questions for the design pass: does an in-transit car block the bay/slot
  it will eventually occupy; does an express option exist for cars the way it does for parts, or
  is next-day the only speed; how it reads on the car list before delivery.

- [ ] **Auction Guarantors** (`docs/design/auction-guarantors.md`, maintainer-authored,
  filed 2026-07-19): story-mission guarantors replace the passive rep gate on
  regional/premium/collector-network. Maintainer ruling: implement AFTER the economy
  legibility arc (Sprints 98-101) completes. Needs three personas and three missions
  written (orchestrator-personal copy under the tone/content bars), the
  `unlocksAuctionTier` reward field, and the stocked-on-unlock check in `catalogs.ts`.

- [ ] **Overworld town map as navigation (maintainer-proposed, 2026-07-19 playtest item 5;
  needs its own design pass before any sprint).** Standing maintainer want ("I still think we
  need a kind of overworld map"): instead of, or alongside, the top tabs, a representational
  map of the town - your garage, the auction houses, the parts shop, the staff centre - as
  the way you go places. Presentation/navigation rework, not a new mechanic, so arguably
  outside the GDD v1.0 feature freeze, but it touches the art bible's diegetic-UI law and
  needs asset decisions (hand-made pixel art only; no AI assets ever). Scope questions for
  the design pass: is the map the home screen or a layer over the tabs; does End Day live on
  it; how do locked venues/buildings read before unlock. The Sprint 95 tutorial rebuild
  deliberately teaches "the tabs are the rest of town", which a map would later make literal.

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
