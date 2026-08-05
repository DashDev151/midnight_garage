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

The playtest happened 2026-07-11 (raw notes: `docs/playtest-notes/playtest-notes-2026-07-11.md`). Its triage
produced the Loop Rework arc, Sprints 25-31 (`docs/sprints/sprint_archive/sprint25.md` onward), which now
carries every finding; per this file's policy those items live there, not here. Still open from
the old checklist:

- [ ] **Export the session log** (`SaveMenu.vue` -> "Export session log") from a real session -
  the first artifact for the recorded-play idea below. Not confirmed done during the 2026-07-11
  session.

## Roster data

- [ ] **MG-074, the Z33 Fairlady Z, carries `yearFrom` 1994 for a car launched in 2002.** Found
  while authoring `yearTo` across all 94 rows; its `yearTo` was authored at 2008 so the production
  window is at least coherent, but the start year is a decade early. The row is not built
  (`builtInContent: no`), so nothing generates from it today and no shipped figure is affected.
  Correcting it is a roster decision, not an implementation one, which is why it sits here rather
  than in the sprint that found it.

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
  - **Closed-form and sound (bot-free):** `computeRosterBalanceProbe`'s Law 1/2/3/4 checks call the
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

  **The "decision report" idea that used to sit here is DEAD. Do not re-propose it.** It was
  designed out in full on 2026-07-26 (`docs/design/archive/decision-report.md`, kept only so the question
  stays shut) and the maintainer killed it on sight: *"you do not understand the game well enough
  to build this. this is the broken bot system all over again."* Correct, and the reason is this
  file's own sentence: a bot is a test wearing a costume, and **a scoring function is the same
  object**. Enumerating "the plays available on a lot" and ranking them by yen per labour-day
  hard-codes three guesses (which plays exist, what a play is worth, and that spread means
  interest) made by someone who has not played the game. The output would look authoritative and
  would then be used to move economy levers. A wrong instrument is worse than none, because it is
  trusted.

  **The standing conclusion: do not replace the bot harness with another instrument.** Build
  measurement only where there is a defined right answer (arithmetic coherence, physics against
  measured telemetry). Whether the game's decisions are interesting is a judgement call, and it
  comes from the maintainer playing it.

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

- [ ] **THE TOOL LADDER HAS A DEAD RUNG: tier 2 and tier 3 both reach mint (found 2026-08-04).**
  `economy.repairBandCeilingByTier` is `{1: "fine", 2: "mint", 3: "mint"}`, so **tier 3 buys no
  quality over tier 2**. Everything tier 3 adds is elsewhere: labour per band step
  (`energyPerBandStepByToolTier` 5 / 4 / 3) and two capability unlocks (NA-to-turbo conversion via
  `toolCeilings.naToTurboConversionEngineTier`, and machining via `machining.minEngineToolTier`).

  **This blocks a ruling the scene-standing arc needs.** The maintainer's intended ladder is
  `tier 1 < tier 1 + craft < tier 2 < tier 2 + craft < tier 3 < tier 3 + craft`, and that cannot
  exist while two rungs tie on reach. Sprint 180's craft operations are additive on top of whatever
  band the tools reached, which is the right shape, but it only produces a real ladder if the tools
  themselves make one.

  **The maintainer's answer, 2026-08-04: tier 3's claim moves off reach entirely.** Tier 3 is the
  tier that unlocks **the cool non-standard work** rather than a better finish. Two of those already
  exist and are already tier-3 gated: **NA-to-turbo conversion** and **machining**. The rest is a
  content question and a good one: **engine swaps, drift suspension, lift kits, NOS, widebody, and
  underglow** (which was cut in the zone-model sprint precisely because it had no home, and this is
  the home).

  **So the ladder is two-dimensional, not one.** Reach goes `tier 1 < tier 2 = tier 3`; capability
  goes `tier 1 = tier 2 < tier 3`. That is coherent and it is why the rung is not actually dead: it
  is differentiated by what it can DO, not by how well it finishes. **What still needs doing is
  making that explicit and stocking it**, because at present tier 3 offers exactly two unlocks and
  reads thin next to the jump from tier 1 to tier 2.

  **Craft operations remain additive on top of whatever band the tools reached** (sprint 180), so
  they never substitute for a tier.

  **Designed in full: `docs/design/systems/tier-three-unlocks.md`.** Tier 3 stops claiming reach
  and claims capability, the tool lines already name their own unlocks, and the one thing that must
  be built first is a general capability gate (there is none today: `requiredTags` gates on the CAR's
  tags and no SKU uses it, while machining, NA-to-turbo and the body line each gate bespokely).



- [ ] **REGRESSION INTRODUCED BY THE ZONE MODEL: a modified body no longer costs authenticity
  (found by the implementing agent 2026-08-03, flagged rather than fixed).** Every aftermarket
  panel SKU now carries a `zoneId` and is fitted through `pipeline-install-panel`, which updates
  the ZONE's condition. `stocknessOf` reads `car.parts.panels.installed.grade`, which never leaves
  `stock` because the four remaining carrier SKUs are all stock. **So a car with a full carbon body
  reads as perfectly original on the `panels` slot, worth 11 of authenticity's 100 points.**

  Before the zone model, `frp-sport-panel-kit` and its siblings were `panels` SKUs fitted to the
  carrier, so a body kit cost those points. This is a behaviour change, not a pre-existing gap, and
  it works directly against the project's own stated principle that a body kit is a body part and a
  modified body loses its authenticity.

  **The root cause is that the `panels` carrier has become vestigial.** It holds exactly four SKUs,
  all stock, none with a `zoneId`. Every one of the 144 zone-scoped panel SKUs is correctly refused
  for the whole-car slot by `partFitsCar`. So the carrier can neither be upgraded nor lose its
  originality, and it has two visible symptoms:

  1. **Authenticity never moves**, as above.
  2. **The whole-car "Replace" affordance on `CarDetailScreen` is permanently non-functional.** It
     still renders, but no SKU reachable in ordinary play can satisfy it. The zone pipeline is the
     only live path to changing a panel. Left in place rather than removed, because whether the
     carrier should keep a whole-car affordance at all is part of the same decision.

  **The consistent fix is probably to derive the carrier's grade from the fitted zone panels
  exactly as its BAND already derives from them**, so any non-stock zone panel makes the carrier
  non-stock. That is a real decision about a core stat with more than one defensible answer (worst
  governs, any-non-stock, or a `stocknessOf` special case reading zones directly), which is why it
  was not invented unreviewed. `paint` is unaffected: its whole-car ladder is untouched.

- [ ] **`docs/carstats/` needs a re-measure: Sprint 166 moved three of the things it measured.**
  Those five documents are a measurement snapshot, and the sprint they produced changed the code
  under parts of it. Closed by the sprint, so read as history until re-measured: `handling.md`
  finding 3 and its `spec.aeroCeiling` row (a fitted aero part added to the factory figure rather
  than replacing it, so no wing lowers downforce and the winged rows of the bounds table are all
  larger); `power.md` finding 2 and section 2f's `spec.aspiration` bullet (`hasForcedInduction`
  reads the aspiration now, and the tag is a display facet); and `reliability.md` finding 4 (the
  dyno's four figures reconcile). Every other figure in the five is untouched: all 26 shipped cars
  read exactly what they read before on every stat and every course. Re-measuring is a
  run-the-numbers pass, not a design question, which is why it sits here rather than in a sprint.

- [ ] **THE TUTORIAL COPY NEEDS A REVIEW PASS: the scripted car is no longer scruffy (maintainer
  note, 2026-07-31, flagged for later and deliberately NOT rewritten at the time).** The expected
  condition band for `entry` cars moved to `fine`, so `tutorialLot.json`'s Wagon R was re-authored
  from `baseBand: worn` to `baseBand: fine` with four honest-wear items and the two taught faults.
  It now arrives mostly presentable. Any line in `tutorialSteps.json` (or the surrounding screens)
  that describes it as scruffy, rough, a wreck or a shed is therefore false, and so is the
  `provenanceNote` if it reads that way. This is a copy pass against the current car, not a
  mechanics change; the economics are already pinned by `tutorialProbe.test.ts`.

- [ ] **CONFIRMED DEFECT, its own change: `lastDayReport` is the overnight tick, not the day
  (deliberately out of scope for Sprint 157, which verified it).** `endDay` calls `advanceDay` with
  an EMPTY action batch, so `lastDayReport.entries` holds only what the day-boundary tick itself
  produced, and `cashDeltaYen` is the overnight delta alone. Everything the player actually did
  that day - every purchase, sale, repair, part bought, fee paid - resolved instantly through the
  store and never reaches the report they read the next morning. It already needed a hand-rolled
  patch in `gameStore.ts` to put machine hire back in, which is the shape of a workaround rather
  than a fix. The end-of-day report is the game's main mirror on a day's play and it is currently
  showing about a tenth of it. The fix is a session-scoped per-day log the store appends to and
  `endDay` reads, NOT a change to `advanceDay`'s contract, and it is unverified in play.

- [ ] **OPEN QUESTION the maintainer already flagged: the shipped auction cadence may have too
  few overlaps, and the early game feels it hardest (raised 2026-07-31, ruled "ships as tabled
  for now").** With the signed table, a day-1 player has only `local-yard` unlocked, and it sits
  on days 1, 3, 5 and 7 - so three days in every seven have NO auction at all for a new career.
  That is the shape the cadence was signed with, and the maintainer said at the time they like
  more than one room per day. Worth revisiting once someone has played a week of it; any change
  is a lever move under directive 22 (`auction.cadenceByTier`, by name and value).

- [ ] **CONFIRMED BUG, needs a design decision: every kei generates as a wreck (maintainer,
  2026-07-31).** Their ruling: *"agreed. this is VERY broken and needs to be fixed. real bug."*
  It bites hardest where it can least afford to, since the cheapest cars are the ones a day-one
  shop can reach, so the first cars a player ever meets are all corpses.

  **The constraint any fix has to satisfy, in their words:** *"Need to ground in reality. Some
  cars should legitimately look like that, but it should be the exception."* A wreck is something
  the game should still be able to produce; it should be rare.

  **Two candidate directions were floated and NOT chosen between**: balance a car's tier on *"how
  much labour they take to fix"*, or on *"how much money (scaled to their price of course)"*.
  Their own closing note: *"i dont know how to fix it, but its broken."* So this is an open design
  problem, not a queued task.

  Whichever direction wins moves tier-keyed generation levers
  (`partsGeneration.damageGrades` and the three `partsGeneration.zoneStates` severity
  tables are the ones that decide how rough a lot arrives), so every value needs signing under
  directive 22 by name before any implementation.

- [ ] **The daily expiry of machine-shop hire is INTENDED DESIGN, not a bug (maintainer,
  2026-07-31). What may still be a defect is what the game does when the work does not finish.**
  An earlier finding reported the overnight expiry as a defect. The maintainer challenged it and
  the reasoning stands: hiring an engine crane for a day, not finishing, and having to hire it
  again is *"an incentive to plan work properly to get it done in a day, otherwise pay extra"*.
  Recorded here so it is not re-reported as a bug.

  **What is genuinely open is the silent failure.** A job whose machinery is not hired stays in
  `state.jobs` with `blockedReason: 'machine-line'` (`packages/sim/src/jobs.ts`) and nothing tells
  the player in any usable form. The sim does emit a `job-blocked` day-log event carrying that
  same reason, and `packages/game/src/utils/dayLogFormat.ts` renders it as
  `Job <id> blocked (machine-line)`: a raw job id and a raw reason token, which is a developer
  line rather than something a player can act on.

  **UNVERIFIED, because nobody has checked it: whether the job resumes if the machinery is hired
  again the next day, or whether it is wedged.** That answer decides whether this is a copy
  problem or a mechanic problem, and it should be established before anything is designed.

  **Terminology, maintainer instruction of 2026-07-31:** do not write "machine line" or "hire the
  line" in prose anywhere. It is ambiguous. Name the machinery (engine crane, and so on) or say
  "machine-shop hire". The codebase's `machineShopAssist` naming may stay as it is; this binds
  writing, not identifiers. **DONE for prose (Sprint 150):** `packages/sim/src/workedExampleDoc.ts`
  was corrected in the renderer and `worked-example-two-cars.md` regenerated from it, and every
  source comment under `packages/*/src` was swept. **Still outstanding: the `blockedReason`
  VALUE is still the string `machine-line`**, which is an identifier and may stay, but
  `dayLogFormat.ts` renders it raw to the player (see the silent-failure paragraph above) - that
  raw token is the one place the banned phrasing still reaches a human, and it is a copy fix
  waiting on the design decision above rather than a separate task.

- [ ] **`sale-value-system.md` §4 states `relistRecovery` as a fraction of "fresh", which does not
  survive contact with the counter it describes (found 2026-07-31, Sprint 147).** Fresh is
  `offersSeen = 0` and 0.70 of 0 is 0, so the prose has no arithmetic reading. Sprint 147 ruled it
  on the lever's name (a recovery of 0.70 recovers seventy per cent of freshness, so
  `newOffersSeen = round(oldOffersSeen * (1 - relistRecovery))`) and the shipped code and tests
  follow that ruling. **Amend §4 to state the formula rather than the fraction** next time that
  document is touched, so the design of record and the implementation stop disagreeing on their
  face. No code change: this is a docs correction only.

- [ ] **The probes now measure the live model, and it says five gates are false (Sprint 160).**
  The two-cost-models defect is closed: `buildUniformBandCar` carries a `zoneState`, so
  `panels`/`paint`/`underbody` price through `bodyPartRepairBillYen` on every probe car exactly as
  they do on every generated one. The probes stopped reacting to the bodyshell price entirely (0 of
  26 probe bills move when `baseCostYen.panels` goes 28,000 to 140,000, matching 0 of 208 real
  generated cars; before the re-base it was 26 of 26), which was the point.

  **What the live model then says, and what needs a decision:**

  - `balanceProbes.test.ts`, "parting out the worst generatable car never beats repairing it" -
    fails on `honda-city-e-aa` (parted 29,425 against a sensible repair margin of 16,923) and
    `nissan-sunny-b12` (30,425 against 17,141). Identical at 28,000 and at 140,000: the shell
    price is no longer part of this question.
  - `plays.test.ts`, four failures. Repair-to-mint now out-earns repair-to-expectation on six
    entry/everyday cars (Wagon R, Carina, Sunny, Alto Works, City Turbo II, Sera) despite
    `beyondDiscount` 0.4/0.8; the yen-per-labour-point ordering inverts on the two keis above; and
    the cheapest entry car strips as found for a 5,667 profit against a floor of zero.

  Two mechanisms, both real rather than probe artefacts. **A body restoration is materials-only
  money** (`panelsRepairBillYen`: beating and welding are labour and never yen), so taking a shell
  from poor to mint costs a few thousand yen on any car, which is what makes over-restoring pay.
  And **the Law 2 softening pass has finer granularity on the zone model** (a zone improves one
  step at a time rather than a whole part), so the probe car lands nearer the ceiling instead of
  overshooting past it: the rough Honda City's guide falls 37,400 to 34,978 and its buy price with
  it, which is what lifts stripping above zero.

  Nothing was weakened to make these pass, per the sprint brief. The numbers are a question for the
  maintainer, not a lever to pull.

  **Superseded in part by Sprint 161**, which fixed the body bill to charge for distance rather than
  a threshold: both gates above are green again, the four `plays.test.ts` failures resolved on their
  merits, and the donor invariant was re-based onto real generated lots. What survives is the entry
  in the next item.

- [ ] **`honda-city-e-aa` still strips as found for a profit on 3.75% of its lots, and the zone
  panel price does not close it (measured, Sprint 162).** 15 of 400 real lots, best case ¥7,543,
  against a median ¥50,958 more for repairing the same lot; strip never beats repair on any lot, so
  this is a wrong SIGN rather than a wrong ranking. `baseCostYen.zonePanel` 6,000 -> 30,000 and
  `baseCostYen.panels` 28,000 -> 140,000 were measured against it and move it by nothing: the count,
  the best case and the median gap are all identical before and after, because a strip's takings
  never include the body carriers (`panels` is `removable: false`, and a zone panel is not a slot)
  and the buy price moves only on the handful of lots carrying a forced panel. Only 10 of the 400
  lots see any movement at all. The candidate lever named by Sprint 161 that has NOT been measured
  is `teardown.usedPartSaleFraction` (0.3). It is approval-gated under directive 22 and nothing was
  tried, per Sprint 162's own stop rule.

- [ ] **Two roster CSV columns are owed under directive 24, and neither blocks the tuning arc.**
  `rarity` holds 26 of 94: it is a spawn-rate lever, so the missing 68 need signing under
  directive 22 as well as authoring. `flavour` holds **0 of 94**, deliberately: ninety-four
  flavour lines written in one pass would be filler, and the copy bar does not allow filler, so
  they are written per car by hand against the "lived in Japan in 1995" test. Both block authoring
  a car into `cars.json`, which `scope` already governs, and nothing else.
  (`aeroCeiling` is the same shape but has a home: `sprint140.md` Task 0. `styleBase` was the same
  shape and landed early, in `docs/sprints/sprint_archive/sprint145.md`, pulled forward of Sprint 140 because Sprint 146's
  buyer targets on style could not be authored while every stock car scored the same.)

- [ ] **Apply the roster's tier assignments to `cars.json`: 13 of the 26 shipped cars are on the
  wrong tier.** The roster CSV is the single source of truth and `midnight-garage-roster.md`
  section 5 lists every disagreement with content.
  **`rosterCsvGuard.test.ts` now pins those 13 as an exact set**, so a fourteenth fails and so does
  fixing one without recording it. The list and the constant go together when this lands.

  **Sequencing worth deciding before Sprint 135 runs, because it is nearly free then and expensive
  later:** Sprint 135 already re-derives every price and valuation pin in the repo. The tier change
  moves six more tier-keyed tables and re-derives the same pins. **Landing them in one pass costs
  one re-derivation; landing them apart costs two.** The catch is that the tier change wants the
  `classFactors` recalibration below decided first, so it is not free either. Worth ten seconds of
  maintainer thought before 135 opens; **not worth blocking the arc on indefinitely.** The
  defect it fixes: `entry` and `everyday` did not form two price bands, they **alternated** down
  one ladder (City E 130k entry, Sunny 150k everyday, Wagon R 230k entry, Carina 250k everyday,
  and so on), and the Beat sat in `entry` at 580,000 above four `enthusiast` cars.

  **This is not a cosmetic relabel.** `tier` keys `valuation.expectationByTier`,
  `partPricing.classFactors`, the three
  `partsGeneration.zoneStates` severity tables and `diagnosis.symptomChanceByTier`, so all five
  move for every car listed. Expect wide movement in valuation and mission-payout pins, every one
  re-derived from a real run (directive 17 case (a)).

  Two things ride with it:
  1. **Only two flagship cars would remain authored** (Supra RZ, GT-R BNR32) against an auction
     draw that gives collector-network rooms a 70 per cent flagship appetite and premium rooms 25
     per cent. **The fix is authoring more flagship cars, not re-tiering cheaper ones upward.**
  2. **The Sunny is scope `Eventually` and is already built.** Either promote its scope or accept
     that scope and shipped state have drifted for one car.

- [ ] **Price research for the nine STAND-IN car prices** (roster v2.3 section 4). Nissan March
  (K10) 180,000; Toyota Corolla 1.5 SE (AE91) 200,000; Mazda Familia 1.5 (BG) 220,000; Honda
  Civic 1.5 (EF3) 240,000; Suzuki Jimny (JA11) 390,000; Mitsubishi Delica Star Wagon (P35W)
  520,000; Nissan Safari (Y60) 660,000; Toyota Land Cruiser 70 (LJ71) 700,000; Mitsubishi Pajero
  Evolution (V55W) 2,500,000.

  **These nine are not evidence and must not be treated as such.** Every other figure in the
  roster carries a dated period observation, a bracketed interpolation between two, or a
  recorded override. These were chosen to read correctly against their neighbours and nothing
  more. They are marked **(TBC)** in both roster tables and must keep that mark until sourced.
  **Do not author any of them into `cars.json` first.**

  The same archived-dealer method that priced the other 85 applies unchanged. The 1998 Kyushu
  calibration page is the obvious start for the four ordinary cars, since it prices exactly that
  class at exactly that money. The five cross-country vehicles need their own sweep, and the
  Pajero Evolution is the one most likely to move: a limited-run homologation special does not
  depreciate like a Land Cruiser, and 2,500,000 is a guess at half its 1997 list rather than an
  observation.

- [ ] **The `everyday` tier is named for ordinary cars and is mostly performance variants**
  (maintainer, 2026-07-29). Of its 16 cars, the CR-X SiR, Prelude Si VTEC, S13 K's, MR2 SC,
  Familia GT-R, Beat, Cefiro, Cappuccino, Civic SiR-II, Glanza V, 510 SSS, AZ-1, Laurel Club S
  and Copen are all sporting grades; the plain metal all sits in `entry`. So the tier reads as
  "the cheap end of fun" rather than "everyday", and the label and the contents disagree.
  Three ways out, none of them urgent: rename the tier; move the ordinary cars up into it and
  let `entry` be keis and near-scrap only; or accept the name as a price band and stop reading
  it as a description. **Renaming is a content field change across `cars.json`, six economy
  tables and every tier-keyed copy string, so it is not a cheap fix.**

- [ ] **The roster is still thin at the bottom** (maintainer, 2026-07-29). After v2.1 it is
  entry 17, everyday 16, enthusiast 26, flagship 30, so the two tiers a player spends the early
  and middle game in hold 33 cars against 56 above them. The four new entry cars closed part of
  the gap and did not close it. **More ordinary cheap cars and more mid-money cars, not more
  halo metal.**

- [ ] **The Legend system is designed in outline and is not built.** GDD 9.2 and roster section 7
  name the ten cars, the Hall of Legends art direction and the Zero Legend, but nothing exists in
  code: no enshrinement, no Hall, no acquisition route, no Collector's Quarter lead. **The AZ-1 is
  the first Legend the player acquires (maintainer, 2026-07-29)**, which is the one fixed point in
  the order and the thing that makes the rest scopeable: it sets what "reaching your first Legend"
  costs, since the AZ-1 is an `everyday`-tier kei at ¥720,000 rather than halo money. Scope it
  before any Legend car is authored, or the cars arrive with nowhere to go.

- [ ] **A fifth parts-fitment class for the exotics, deferred (maintainer decision 2026-07-28,
  reversed from "implement" the same day).** The period parts research is the case for it: the
  dearest class at 2.5x checks out for JDM flagships (its stock internals lands on the real
  Y200,000 S20 conrod set) but undercooks the exotics, where parts money was another animal
  entirely. Sprint 132 deleted the inert `classFactors.legend: 4.0` key rather than leave a dead
  lever reading as a live one; the design survives here.

  Sprint 133 changed what this item is asking for, and the change matters. Tier, rarity and origin
  are now three separate fields, so the exotics are no longer identified by a tier value at all:
  they are `origin: 'gaisha'` cars, and rarity says nothing about what their parts cost. A fifth
  class would therefore be a fifth TIER, keyed off market position like the other four, not a
  special case bolted onto scarcity or sourcing.

  Two things ride with it whenever it is picked up, and neither is optional:
  1. **Three new economy levers, unapproved.** `expectationForCar` reads
     `economy.valuation.expectationByTier[fitmentClass]` and **throws** on a missing class, so a
     fifth block carrying `band`, `beyondDiscount` and `aftermarketReturn` is mandatory, not
     optional. `partPricing.classFactors`, `symptomChanceByTier` and
     the three `zoneStates` weight tables each need a fifth row too (`partsGeneration.damageGrades`
     does not: it is keyed by damage grade, not by fitment class). Directive 22 sign-off needed
     on every specific value. Note the classFactors item above: that ladder wants re-signing
     against the current four before a fifth is added to it.
  2. **The class count is load-bearing.** The catalogue is 118 SKUs per class; adding a fifth means
     `resolvePartsCatalog` must generate them rather than needing them hand-authored, and
     `stockReplacementPricesByClass` must resolve for every part in the new class. Verify before
     committing to it.

- [ ] **`partPricing.classFactors` is now mis-calibrated against the tiers it prices, and that is
  the single lever behind both open coherence failures (measured Sprint 133).** The ladder
  (0.25 / 1.0 / 1.6 / 2.5) was set when the cheapest class spanned Y130,000 to Y580,000 and meant
  "cheap car". After the re-tier the cheapest class means "kei-sized components" and holds five
  cars, while the 1.0x class inherited the Y150,000-Y620,000 saloons that used to be charged 0.25x.
  Eight of the 26 cars therefore got a dearer parts basket against an unchanged book value (Sunny,
  Carina and Sera at 4.00x; CR-X, Prelude, MR2 AW11 and Civic EG6 at 1.60x; Impreza at 1.56x), two
  got a cheaper one (Aristo 0.64x, Cefiro 0.63x), and sixteen did not move. That is why the donor
  law went from 11 failing models to 14 and Law 3's consumables share from 6 to 9, against a sprint
  expectation that both would shrink. The re-tier is not the defect; it made the real one legible.
  Directive 22 lever, needs specific values signed.

- [ ] **The gaisha-never-at-auction rule (GDD 4.5) currently has no implementation.** It used to
  live in `auctionTierForRarity`, which returned `null` for the `gaisha` tier value. Sprint 133
  moved sourcing onto `CarModel.origin`, and nothing reads that field yet, so the guarantee now
  rests entirely on every shipped car being `jdm` (asserted in `auctions.test.ts`). The Import
  Broker owns the real exclusion when it lands; until then, adding a gaisha car to `cars.json`
  would put it straight into a regular auction catalogue. (The rarity half of that old function
  now lives in `canAppearAtAuctionTier`, which still carries no origin rule.)

- [ ] **Switch the roster back to JDM variants (maintainer decision 2026-07-28).** During the
  calibration arc the roster was forced onto Forza's exact variants, names and years, because the
  measured figures had to describe the car Forza actually simulates. That constraint has served its
  purpose and the maintainer wants the original JDM roster back.

  **A `specMarket` column lands with this pass (maintainer, 2026-07-30):** `jdm`, `us` or `euro`,
  saying which market's figures a row's spec block describes. It exists because the siblings put
  two rows for one car side by side and nothing else distinguishes them at a glance. **It is not
  `origin`, and the two must not be merged.** `origin` is a game mechanic (it carries the
  gaisha-never-at-auction rule, GDD 4.5) and holds only `jdm` and `gaisha`; putting `us` in it
  would either leak a car into the wrong auction pool or throw. The maintainer's own framing of
  why they are different axes: a car being Japanese does not make it JDM, and a US-spec Silvia is
  Japanese and not JDM. `rosterCsvGuard.test.ts`'s column expectations move with the new column.

  **This is only safe because of the ratio bridge, and that is the whole point.** The model does not
  carry absolute acceleration or absolute power; it carries `rLaunch` as a fraction of the car's own
  grip and `rPower` as a fraction of its own crank figure, and `mu` is a coefficient that is
  mass-independent to first order. So a variant swap changes power, weight, year and name, and the
  measured COEFFICIENTS travel across unchanged and rescale themselves. Before Sprint 128 this
  swap would have invalidated every figure.

  One real decision per car, and it must be taken deliberately rather than defaulted: **`dragCd` is
  currently back-solved FROM measured top speed.** On a variant swap the body is the same but the
  power is not, so the honest move is to invert it, keep `cd` as the body property and let top speed
  follow from the JDM power. That changes which of the two is input and which is derived, for those
  cars only. Also per car: whether the JDM variant runs the same tyres and aero as the Forza one,
  since `mu` and `dfC` do not travel if it does not.

  Scale: of the 26 shipped cars, 16 have a year that differs from our JDM intent and 9 a power
  figure. The guard test pinning `cars.json` to the spec book has to move with it or it will fight
  the change.

  **Three specific power figures to settle in that pass, all surfaced by the Sprint 135 sign-off
  (2026-07-29).** The Supra RZ and the Aristo 3.0V are both authored at **324 PS**, which is the
  export 2JZ-GTE figure; the JDM cars advertised **280** under the manufacturers' agreement,
  exactly as the BNR32 and the Z32 in `cars.json` already do. **The roster is running two
  conventions at once for the same era and has to pick one:** advertised throughout, which is the
  era-authentic reading and what a 1995 brochure actually said, or measured throughout, which
  would move the RB26 and the Z32 up to roughly 320. The **Prelude Si VTEC** is the same defect
  from the other direction: 162 PS from 2157 cc is the mild spec rather than the 200 PS H22A the
  Si VTEC badge implies, and it is the sole reason that car derives as `lazy-na` under Sprint
  135's signed threshold of 80.0. **All of these feed `powerRatio` and therefore the calibrated
  lap harness**, so changing one is a car-performance re-validation rather than a content typo
  fix. The advertised-versus-measured choice also decides how much of the machining headroom
  above is needed, since a multiplier on 280 and a multiplier on 320 are two different ceilings.

  **Five rows carry export or Forza-panel data under a JDM name, itemised here for that pass
  (identified 2026-07-29).** None of them is a figure to overwrite in place. The measured block on
  each row was measured on the variant the row currently names, and that calibration is permanent,
  so the JDM car lands as its own **sibling row** with its own measurements rather than by editing
  these. Current populated figure first, correct JDM figure second.

  - **MG-021 Honda Prelude Si VTEC (BB4)** (built): 162 PS populated, the JDM H22A is 200 PS. The
    row's own `engineCode` already reads H22A, so it contradicts itself today.
  - **MG-022 Nissan Silvia (S13)** (built): 175 PS populated, which is the CA18DET; the row says
    SR20DET, which is 205 PS.
  - **MG-036 Nissan 180SX (RPS13)** (built): 157 PS populated, which is the United States KA24DE
    240SX; the JDM car is 205 PS.
  - **MG-019 Eunos Roadster (NA6CE)** (not built): the populated 1840 cc / 130 PS / 1057 kg block
    is the NA8C, not the 1.6 NA6CE the row names, which is 120 PS.
  - **MG-056 Toyota Chaser Tourer V (JZX100)** (not built): `yearFrom` 1991 populated, but the
    JZX100 is a 1996 car, and its 362 Nm is the earlier JZX90 non-VVT-i figure.

  These are blocked only on sequencing, not on any open question: every figure above is settled,
  and the pass waited purely so it would not collide with Sprint 135 running against the current
  numbers. Each of the five still needs the per-car `dragCd` decision this entry already describes,
  because a sibling on the same body with different power cannot inherit a `cd` that was
  back-solved from the other variant's top speed.

- [ ] **The high-speed traction release is deferred, with its number rather than a shrug.** The
  harness hands a traction-limited car back its power shortfall above 161 km/h (`tractionShare` /
  `paccAt` in `lapsim-report.cjs`, documented in `formulas.md` section 9); the shipped port
  deliberately leaves it out. It fires on 3 of the 85 research cars, on NONE of the 26 shipped
  ones, and moves no lap on any course by half a per cent. Build it when something needs it: a car
  with a great deal of torque against very little grip, which is what an aftermarket-power sprint
  can create out of a car that had neither.
- [ ] **`pace.agilityReferenceMassKg` is now read by nothing.** The direction-change term lost its
  mass factor in the physics port, so the constant that normalised it has no consumer. It was NOT
  deleted with the other superseded pace levers because it was not on the approved lever list, and
  no lever moves unlisted. It wants signing off in whichever pass next touches the pace block.
- [ ] **Two dead fields on `spec`, both surfaced by the Sprint 127 import, neither swept in
  silently.** `zeroToHundredS` has no consumer anywhere in `packages/`: nothing reads it, and the
  measured `zeroTo97S` now supersedes it as a calibration figure. Delete it or give it a display,
  but do not leave it as data nobody reads. `estimatedFields` is now stale on several cars: it
  still lists `fr` or `cd` as estimated where the value that landed is a panel reading, and the
  spec book's own `est` list disagrees with ours on seven cars. Copy it from the book in whatever
  pass decides the first one.
- [ ] **There is still no aero grade above `race`, and the headroom for it was opened
  deliberately** (`docs/design/systems/tuning-system.md` section 12, which records the gap;
  the acceptance target for the missing rung is in `docs/design/car-performance/README.md` 7g).
  The model has room above the top shipped grade and the part was simply never authored, so the
  top of the downforce ladder is unreachable with shipped content. It matters because
  mechanical grip tops out around 1.25 and the rest of the range is reached through aero: the
  missing rung is the missing top end of the whole grip scale.
- [ ] **The per-car aero ceiling does not exist, so any car can take any aero grade**
  (`docs/design/systems/tuning-system.md` section 12). Aero stays ONE package slot rather than
  splitting into wing, splitter and diffuser, because the physics carries a single
  `downforceCoeff` and cannot model front-against-rear balance, so that half is settled. The
  ceiling is the open half: an FD, a Supra or a Countach has real aerodynamic potential and a
  genuine aftermarket behind it, a Wagon R does not, and bolting a GT wing to one should look
  silly and do very little. One number per car expresses it, and it is what stops every car in
  the game eventually becoming a GT3 car. It is step 8 of that doc's build order, so check
  whether the tuning sprints already cover it before scoping it separately.
- [ ] **INVESTIGATE: after sprint 184 nothing in the game can ever lower reputation (maintainer,
  2026-08-05, accepted for now).** The fifth amendment to `progression-bible.md` makes reputation
  monotonic: a disappointed buyer pays nothing rather than taking anything away. The maintainer took
  the fully-monotonic reading deliberately, over the alternative that kept a penalty for breaking an
  accepted commitment. **The consequence, recorded so it is not discovered by accident: there is no
  longer any act a player can commit that costs reputation.** The lemon penalty
  (`reputation.lemonSalePenalty`, -8) goes with the lemon predicate, and
  `SERVICE_JOB_FAILURE_REP_MULTIPLIER` (2x the job's base for handing a job back unfinished or
  overdue) goes with it under the same reading.

  This is strictly compliant with law 6 (no decay, no upkeep treadmill) and it removes the only
  downward pressure the progression system had. **What needs establishing in play is whether the
  ladder still has any tension without it**: whether a player who accepts every job and finishes
  none is meaningfully worse off, and whether "reputation only ever rises" reads as generous or as
  weightless. The alternative already drafted, if it turns out to be wanted, is in
  `docs/sprints/sprint184.md`: sales never fall because the buyer chose the car, but breaking a
  commitment the player accepted still does.

- [ ] **Selling channels need a systematic unlock ladder; on day one only the shop floor should be
  open (maintainer, 2026-08-05).** Today `isSellingChannelUnlocked` (`sim/selling.ts`) opens every
  channel that no story mission claims, so a channel is available unless something takes it away.
  Two missions claim two channels (`low-and-loud` opens `weekendMeet`, `street-power-street-manners`
  opens `tunerMagazine`), which leaves `freeAdsPaper`, `tradeNetwork` and - the one that prompted
  this - **`collectorNetwork` open from the first day**, despite the design framing it as a
  members' club. Sprint 176 recorded that as a deliberate decision at the time; the maintainer has
  now reversed it.

  **What is wanted is a real ladder rather than more per-channel exceptions**: the shop floor open
  at the start, everything else earned, and the rule stated once. Whether the earning is by
  reputation tier, by story mission, by scene standing, or a mix, is the open question - scene
  standing is the obvious candidate for the Collector Network specifically, since it is a
  crowd-specific channel and standing is now the crowd-specific ladder. Note the current
  implementation's inversion is deliberate and documented (a channel is open unless claimed, so
  Law 1's floor lives in content); reversing it means the default becomes closed and every open
  channel names what opens it.

- [ ] **INVESTIGATE: touge should read MECHANICAL grip and racer EFFECTIVE grip (maintainer,
  2026-08-05, deferred as out of scope).** Handling is one number today: effective lateral g at
  200 km/h, downforce included (`gripToDisplay`, `statFormulas.grip.displayCurve`). That is a
  circuit metric. A touge car never sees 200 km/h and cannot use downforce in a second-gear
  hairpin, so a wing currently pays the touge crowd exactly as it pays a racer, which is wrong in
  the fiction and makes the two archetypes read as one ranked ladder rather than two different
  wants.

  **Both quantities already exist**: `gripToDisplay` takes the downforce coefficient as a separate
  argument, so passing zero yields the mechanical-only figure. The work is deciding whether this
  becomes a second derived stat, a per-buyer flag naming which figure that archetype reads, or
  something else, and then what it does to every handling target.

  **The measurement that prompted it, decomposed. Silvia S14, mint, only the named slots moving
  grade** (effective lateral g at the display curve's 200 km/h reference):

  | grade | mechanical grip only | + matched support | + aero | all 29 slots |
  | --- | --- | --- | --- | --- |
  | stock | 0.94 | 0.94 | 0.94 | 0.94 |
  | street | 0.96 | 0.98 | 1.00 | 1.00 |
  | sport | 1.00 | 1.05 | 1.12 | 1.12 |
  | race | 1.14 | 1.31 | 1.56 | 1.56 |

  Three findings, and the first two are the spacing problem:

  1. **The mechanical grip parts are nearly inert below race.** All four of `tyres`, `dampers`,
     `springs` and `antiRollBars` at street grade buy **0.02 g**; at sport, 0.06 g; only at race
     do they buy 0.20 g.
  2. **Aero is the largest single contributor and it sits inside `GRIP_SLOTS`.** One race aero
     part on an otherwise stock car reads **1.05 g** against a stock 0.94, so +0.11 g from a
     single part - more than all four mechanical grip parts deliver at sport grade (+0.06 g).
     (Fitting race brakes, steering and chassis alongside it reaches 1.17 g, but that is five race
     parts, not one.) Its contribution scales with what the car already has: added to a full race
     mechanical-plus-support build it is worth **0.25 g** of the 0.44 g step from sport to race.
  3. **`chassisSupport` amplifies rather than gates.** Its loss is a fraction of the GAIN
     (`lossByGrade` 0 / 0.10 / 0.20 / 0.35), so at street unsupported-versus-supported is 0.98
     against 1.00 and at race it is 1.29 against 1.56. Support is nearly free to ignore below race
     and decisive at race, which is correct by construction but leaves the lower rungs with no
     decision in them.

  **Measured mechanical ceiling: 1.31 g** for this car (every mechanical grip slot plus support at
  race, no aero), which confirms the ~1.25 figure the tuning notes carry.

  Against that, the touge handling target of 0.75 asks for **1.32 g**, which is why no car short of
  a full race build with aero satisfies it. (The tuner's handling target is 0.55, or 1.10 g; 0.70 is
  its IMPORTANCE, which is what makes handling its champion stat rather than power.) **Lowering the
  targets is the separate, cheaper half** and does not need this investigation.

  **Re-spacing the grade ladder is the other half, and the maintainer set its constraints
  (2026-08-05):**

  1. **The physics calibration is not touched, at all.** `computeGrip`, `aeroGripMultiplier`, the
     display curve, the lap model and every car's measured `lateralG97`/`lateralG193` were measured
     against the Forza physics engine and stay exactly as they are. What moves is the per-SKU
     `physicalModifiers.grip` authoring from Sprint 130, which CLAUDE.md already records as
     PROVISIONAL: what a street damper delivers is a design choice, not a measurement.
  2. **The race total does not move.** 1.56 g on the S14 is the ceiling and it stays.
  3. **Street and sport rise**, so the ladder is not flat until race.
  4. **Aero is re-calibrated against the new street and sport values**, so it stays proportionate
     rather than dominating the ladder.

  A directive 22 lever sweep across the suspension and aero catalogue; every value needs signing
  by name.
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
  `docs/design/art/part-sprite-placeholders.md`. Under the art bible's no-AI-assets law they must NOT
  appear in any public build, screenshot, devlog or marketing material; commissioned pixel art
  replaces them before launch. The template + rasteriser API (`PART_SPRITE_TEMPLATES`,
  `PART_SPRITE_GRID`, `partSpriteDataUrl`) stays; only the template pixel data is swapped.
  The three 80x45 workshop view backdrops in
  `packages/game/src/components/workshopViewSprites.ts` (body, engine bay, underside) are the
  same class of asset on the same terms, behind the same API shape
  (`WORKSHOP_VIEW_SPRITE_TEMPLATES`, `WORKSHOP_VIEW_SPRITE_GRID`, `workshopViewDataUrl`), and
  are replaced in the same pass.
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

- [ ] **`paint` can never read as non-original, so 11 of authenticity's 100 points are unloseable
  and a resprayed car still scores as wearing its factory colour.** The authenticity derivation
  (`stocknessOf`, `packages/sim/src/derivedStats.ts`) asks each slot whether its fitted part is
  `grade: 'stock'`, and `parts.json` ships no non-stock `paint` SKU: its twelve finish SKUs were
  retired when the derived carriers landed. `panels` (11 points) and `underbody` (1) were the same
  shape and are fixed - Sprint 163 gave both a real aftermarket ladder - so what is left is the
  colour half alone. The weight is NOT dead either way: the same column drives authenticity's
  condition factor, where rough paint bites hardest of anything on the list. Two routes, neither
  chosen: bring the finish ladder back as `paint` SKUs (respray, two-tone, pearl), or a per-zone
  refinished flag set when the player paints and rolled at generation, read by `stocknessOf`
  instead of the carrier part's grade. `packages/sim/tests/authenticity.test.ts` pins what is left
  and fails the moment a non-stock `paint` SKU is added. Wanted, and deliberately deferred: the
  colour a car wears should read on its originality, and neither route is chosen yet.

- [ ] **A body kit is one-way: nothing sells the factory bodywork back (Sprint 163).** A body
  value carrier is `removable: false`, so fitting a kit REPLACES what is there and the part coming
  off is discarded rather than harvested - the shell never lands in the parts bin, which is what
  that flag has always meant. Every other slot keeps its stock part through a remove-then-fit, so
  a widebody is currently the only modification in the game a player cannot undo. Two candidate
  fixes, neither taken: list the stock `panels`/`underbody` SKU in the parts market (it is
  delisted by `isDelisted`, `PartsMarketScreen.vue`, and now carries a coherent shell price), or
  harvest the replaced carrier into inventory. The second resells at `usedPartSaleValueYen`, so
  it is an economy question rather than a UI one.

- [ ] **The `underbody` style ladder does not climb with its grades (surfaced Sprint 163).** Neon
  underglow is the street rung and the loudest thing on the slot at 8 style points, the
  skirt-and-splitter kit is the sport rung at the same 8, and the race flat floor is the quietest
  at 6. Every other style-bearing slot sells showiness up the same ladder it sells capability, and
  `style.test.ts` guards that; `underbody` is now an explicit exception in it. Either the three
  values are re-authored to climb (a directive-22 sign-off, since `statModifiers.style` reaches
  sale value through buyer taste), or the exception is accepted as a real statement that an
  underside dress ladder measures function rather than volume - in which case the guard's carve-out
  is the record of that ruling and this entry goes.

- [ ] **`diagnosis.symptomChanceByTier` is coupled to how rough generated cars are, through the Law
  2 veto in `applySymptoms`, so the two must be re-measured together whenever either moves.** See
  the "Design decisions awaiting maintainer direction" entry on the same coupling for the open
  design question (should the veto soften a symptom instead of dropping it) and `sprint154.md`'s
  Exit ("Amendment: the veto-coupling lever, closed") for the fix and the numbers. The input is now
  raised so the effective, post-veto rate matches the signed intent, but that gap is not fixed by
  construction: a car generation change (a care-profile edit, a zone-severity table, a
  `maxBillFraction` change) shifts how much the veto eats and reopens it. `auctions.test.ts`'s
  symptom-rate guard will catch a drift past 0.05, but landing tight on the signed value again needs
  the same measure-then-set pass this fix used, not a re-tune by feel.

  **It reopened one sprint later, exactly as predicted, and by a route the entry above did not
  list.** Sprint 155's damage patterns weight the symptom DRAW rather than how rough a car is, and
  that alone moved survival from about 0.92 to 0.958-0.980, because the symptoms a pattern favours
  survive the veto more often than the ones it does not. All four inputs were re-derived
  (`signed / measured survival`, measured at 1500 seeds per shipped model) and are recorded in
  `sprint155.md`'s Exit. Widen the trigger accordingly: **anything that changes WHICH symptoms are
  drawn reopens this gap too, not only anything that changes how rough cars are.**

## Open balance/economy questions

- [ ] **REMAINING FROM sprint175.md: inputs 1 and 2 of the maintainer's four-input power-expectation
  model are still unimplemented.** `docs/sprints/sprint175.md` built inputs 3 (the player's own
  best build, as a climbing chain) and 4 (per-scene appetite, which already existed as authored
  relative targets) and raised `statFormulas.powerNormalizationCeiling` 300 to 600 so ordinary
  appetite means sensible PS numbers again. Two inputs remain open:

  1. **What the player can reliably BUY - car availability times PART availability.** Cars are
     already access-gated (auction room unlocks); **parts are not gated at all today**, so only
     half of this input exists even if the car half were wired in. Whether parts get gated at all
     is its own decision, not a value (`sprint175.md`'s Levers section, item 3).
  2. **Hand-authored jobs**, keyed on something not yet decided.

  `GameState.powerExpectationChain` and `currentPowerExpectationBarPs` (valuation.ts) exist and are
  proved by sprint175's tests, but nothing reads them yet - the intended consumer is a later arc
  sprint (word-of-mouth or scene commissions, `scene-standing-arc.md`).

- [ ] **BLOCKING, NEEDS A MAINTAINER LEVER DECISION: the unimproved instant flip became
  profitable on the top two tiers when style became a real number (Sprint 152, 2026-07-31).**
  Nothing was tuned to chase it, because every candidate lever is outside what that sprint was
  authorised to touch (directive 22). `valueModelProbes.test.ts`'s unimproved-flip guard fails on
  three of its four tiers and **those three failures are in the tree**:

  | tier | median flip margin | share of flips profitable | verdict |
  | --- | ---: | ---: | --- |
  | `entry` | below -1% | - | **passes** |
  | `everyday` | **-0.99%** | 42.3% | fails a -1% bar by a hair |
  | `enthusiast` | **+0.19%** | 51.5% | fails |
  | `flagship` | **+1.05%** | 65.0% | fails |

  **The cause is arithmetic, not a defect.** Median stock style by tier went 7 -> 24 (`entry`),
  13 -> 53 (`everyday`), 15 -> 64 (`enthusiast`), 17 -> 74 (`flagship`). Buyer style targets are
  stancer 65, hobbyist 55, collector 50, tuner 45. Under the old 4-to-20 scale no stock car
  cleared any of them, so an untouched car's taste multiplier was always below 1; now a mint stock
  flagship clears all four. The guard's own comment ("a walk-in never pays over the taste-free
  market read for an untouched car") was true only because of that, and is now false.

  **The structural asymmetry underneath it is the real question.** `marketValueYen` takes no stats
  at all (a locked ruling: a car is never worth more because it is faster), so the BUY side does
  not price beauty, while the sell side does, through buyer taste. Style just became the largest
  taste term on an untouched car. Candidate levers, none of them pulled and none of them signed:
  `liquidity.qualityFresh`, `valuation.tasteSpread`, the auction buyout premium, or the six buyer
  `statTargets.style` values. **`statFormulas.styleSaturationPoints` cannot fix it and is not a
  candidate:** an unimproved car has fitted style points near zero, so its `reach` is near zero
  and the saturation lever has no leverage on a stock car by construction.

  `desirability-system.md` section 6 predicted exactly this ("buyer style targets were authored
  against the old scale and should be re-checked against the new one"). The re-check is above.

- [ ] **CORRECTED FINDING: "the money is in the buying, not the fixing" was WRONG. The
  fixing-is-always-profitable law is NOT broken (2026-07-31).** The original finding combined
  repair spend with modification spend and reported the sum as though it were one play. Repair on
  its own clears the bar comfortably. Decomposed from the two-car worked example's own figures for
  the Wagon R:

  | play | spent | value gained | result |
  | --- | ---: | ---: | --- |
  | repair to the expected band | ¥17,450 (¥7,780 repair charges + ¥9,670 repair parts) | ¥26,761 (¥184,284 to ¥211,045) | **+¥9,311, a 1.53x return** |
  | modification | ¥19,580 | ¥6,579 (¥211,045 to ¥217,624) | **-¥13,001** |
  | the two summed | ¥37,030 | ¥33,340 | -¥3,690, the misleading number originally reported |

  **Repair beat the 1.3 `marketRepairDiscount` for two real reasons**, both worth remembering
  whenever that lever is next argued about: body-pipeline materials are flat-priced while the bill
  they clear scales with the car, and lifting the brake pads and calipers raised
  `foundationFactor`, which multiplies the aftermarket premium already sitting on the car (its
  `aftermarket` ledger line rose ¥4,029 to ¥8,954).

  **What survives is weaker, and it is a question about PROPORTION rather than a broken law.**
  Repair earned ¥9,311, while buying at the auction reserve rather than the desk buyout earned
  ¥73,714 for no work at all. So fixing pays, and it is about 11 per cent of that car's profit.
  The acquisition channel that produces the rest lives outside `packages/sim`
  (`packages/game/src/screens/auctionRoom.ts` decides where a live room clears) and has never been
  balance-tested. Whether that split is the intended shape is the open question. The economy
  bible's core-loop law is not in question and this item must not be read as reopening it.

- [ ] **APPROVED TO DESIGN, NO VALUE SIGNED: raise the shop front's taste ceiling, conservatively
  (maintainer, 2026-07-31).** `sellingChannels.shopFront.tasteCeiling` is 1.0, so the forecourt
  can never return more than the market value of the car however well it suits whoever walks in.
  The maintainer likes raising it, with four constraints that all bind any design:
  - The shop front *"should not be the best way to sell your cars, it should just be the first
    way"*.
  - Raise the cap *"concervatively"*.
  - They like the idea that *"all types of buyers can be seen in the shop"*, which is a change to
    who appears rather than to the ceiling, and may be the better half of the answer.
  - It must not overlap too much with the dealer network (`tradeNetwork`), which is the fast,
    taste-blind, flat-`priceBand` exit (0.95 to 1.02) and has to keep a reason to exist.

  **No value is signed.** The design comes back with its number for sign-off under directive 22.
  Sits under the listing-avenues ruling, `sale-value-system.md` section 6.

- [ ] **The tuner magazine and the weekend meet need reworking into different buyer bases
  (maintainer, 2026-07-31, agreed and unsigned).** Their words: *"they need to serve different
  buyer bases. too much overlap."* **This is a buyer-base differentiation, not a fee adjustment**,
  and a change that only moves `feeYen` has not addressed it.

  The overlap is exact rather than approximate: both channels carry `tasteCeiling` 1.17 and both
  are `matchedOnly`, so they draw the same buyers and price them identically. The worked example
  lands on the same yen twice, ¥240,184 on the Wagon R and ¥542,568 on the S13, with the two
  differing only in fee (¥12,000 against ¥3,000) and cadence (`offerChanceFactor` 0.6 against one
  draw on the next end day). On those numbers the magazine is the meet with a bigger bill.

  Unsigned. It sits under the listing-avenues ruling in `sale-value-system.md` section 6, whose
  general-versus-specific axis is exactly what would tell these two apart.

- [ ] **A starting shop CAN finish a car. The language correction matters, and the intent behind
  it is an open question (maintainer, 2026-07-31).** The framing *"a starting shop can't finish a
  car"* was rejected as inaccurate and should not be repeated: it can.

  **The design target, in their words:** hiring in all the machinery to do the job properly
  *"should destroy a lot of the margin"*, so the player faces a real choice. *"hire in the tools,
  fix the car properly, make less money and more reputation. or dont hire in all of the tools, do
  a half assed job on the repair, make slightly more money and slightly less rep."*

  **Open: whether that trade-off exists in the game today.** It has not been measured, and it has
  two independent halves. Are the hire fees heavy enough to eat a meaningful part of the margin?
  And does the shallower repair actually cost reputation, rather than merely being permitted? If
  either half is missing then the choice is not a choice, and which half is missing decides what
  the fix is.

- [ ] **What replacing a worn performance part with a stock one is worth: OPEN, with the
  maintainer's own split to be worked through rather than assumed (2026-07-31).** Two scenarios,
  and they behave differently:
  1. **You are left with nothing.** Consumables such as brake pads and clutch, and any part in
     `scrap` condition that cannot be repaired. The old part is gone and only the new one counts.
  2. **You are left with the old part.** A `poor` aftermarket sport camshaft replaced by a `fine`
     stock one, for instance. The removed part goes to inventory and *"has value and needs to be
     factored in. it can be reconditioned and used in subsequent builds."* Any analysis that
     prices this swap without counting what came off the car is wrong.

  **Their open question, recorded as theirs:** *"maybe replacing brake pads shouldnt be that
  profitable even though they are better condition. there are other reasons to do it, like
  reliability."*

- [ ] **The retention floor barely bites, so on retention alone almost every incoherent build is
  now BETTER off than under the old flat rate (measured at the end of Sprint 144).** Retention is
  `retentionFloor + (retentionCeiling - retentionFloor) * coherenceFactor`, which at 0.30 and
  1.10 crosses the retired flat `partsRetention` of 0.55 at a coherence of only **0.3125**.

  So a bare race turbo with nothing supporting it, which the support readout calls `dangerous`
  at a coherence of 0.605, retains **0.784** where it used to retain 0.55.

  **This is not a defect and Sprint 144 is correct as built**, because Stage C's discount did not
  exist before and takes 13.8 per cent off that same car's staged value, so the two together
  still punish it. But if the intent was for RETENTION ITSELF to express "these parts are worth
  less because they were fitted badly", it currently only says that about a catastrophe.

  Three ways out if it wants changing, none of them signed: drop `retentionFloor` well below
  0.30; make the curve non-linear so it falls away fast below the adequate knee; or accept it
  and let Stage C carry the whole penalty, in which case the floor is a formality and should be
  described as one.

- [x] **ACCEPTED, not open: two slots still climb into better value per yen, worst 1.335x
  (maintainer decision 2026-07-30).** Measured across all 288 cases in
  `partPricing.test.ts` at the end of Sprint 135: 52 exceed parity, on `internals/street`,
  `camsTiming/street`, `block/street` and a boundary `block/sport`. On those the race rung is a
  better buy per horsepower than the street rung, so climbing the ladder improves value per yen,
  which is what arc rule 5 forbids. It is the same defect the ECU carried at 2.89x before Sprint
  135's lever 5, at less than half the magnitude.

  **The maintainer has accepted it rather than pursue further price ladders.** The reasoning
  on the record: the residue is a large improvement on what shipped before, and a street rung is
  still cheaper in absolute yen, so a player short of cash still buys one. The fix, if it is ever
  wanted, is the treatment `ignitionEcu` received: give the remaining slot its own
  `partPricing.gradeFactors` entry rather than the default ladder.

  `forcedInduction/street` was in the same measured set and was NOT part of this acceptance.
  **Resolved by Sprint 137**: `forcedInduction` now carries its own `partPricing.gradeFactors`
  ladder (1 / 1.30 / 2.93 / 6.50), derived to track its own increasing power curve exactly, so its
  24 cases sit at or within rounding noise of parity.

  **`camsTiming/street` resolved by Sprint 137's amendment (2026-07-30, the same pass that fixed
  the cross-category defect below).** `camsTiming` now carries its own ladder too (stock 1, street
  1.3, sport 2.75, race 4.5), signed alongside a `baseCostYen` rise (30000 -> 50000) to correct the
  cross-category defect; the new ladder also clears its street rung of the within-ladder residue
  (its 12 `street` cases dropped out entirely rather than merely shrinking). The catalogue-wide
  residue count fell 51 -> 39 of 288 cases as a result. `internals` and `block` are unaffected and
  are now the only two slots still carrying the residue this entry accepts.

- [x] **RESOLVED (Sprint 137 amendment, maintainer 2026-07-30): the cross-category dominance defect
  is fixed for `camsTiming`, and the test it was measured with is now a margin ceiling rather than a
  no-repeat-winner rule.** First measured in Sprint 137: `camsTiming` won every rung (street/sport/
  race) for both NA characters, and `exhaust` won every rung for `forced`, on all four fitment
  classes.

  **The maintainer ruled the original assertion (the winning slot must differ across rungs) wrong
  outright**: "Something needs to be the best value. Something needs to be on top. Fact. The point
  is that one part does not dominate the rest." A single winner per rung is inevitable arithmetic,
  not a defect on its own; what matters is the MARGIN by which it wins. `packages/content/tests/
  partPricing.test.ts`'s "Sprint 137 acceptance 2b" describe block now asserts the leading slot's
  power-per-yen lead over the next-best slot stays at or under 25 per cent, per rung, per engine
  character, per fitment class, and passes.

  **`camsTiming`'s dominance is fixed by the same price correction that resolved the row above**
  (`baseCostYen` 30000 -> 50000, plus its own new grade ladder): it no longer wins every rung for
  either NA character. **`exhaust` still wins every rung for `forced`** (unaffected: this
  amendment's levers never touch `exhaust` or `forced`), but its lead over the next-best slot
  (`intake`) tops out at 18.0 per cent (`everyday`/sport) - inside the new 25 per cent ceiling, so
  it is not the dominance defect the maintainer's ruling names, and is left as-is.

- [ ] **INVESTIGATE: should support parts scale the MAGNITUDE of a power part's gain, and not
  only its reliability? Deferred, not decided (maintainer, 2026-07-30).**

  What ships after Sprint 136: support ratios feed reliability and nothing else. Fuelling and
  cooling are pure enablers carrying zero power gain, so a race turbo on a stock fuel system
  delivers its full percentage and the car simply becomes a grenade.

  **Reality does it the other way round, and the maintainer noticed.** An under-fuelled big turbo
  has two real outcomes: the tuner dials the boost back and the car makes less power, or it runs
  lean and holes a piston. The game models only the second.

  **The reason it was built that way is arc rule 8's ban on a second power path, and that is a
  simplicity argument rather than a design one.** Recorded as such on the maintainer's own
  objection, so nobody later reads the ban as evidence the question was settled on merit.

  Four things to weigh whenever this is picked up, and the third is the one that could kill it:
  1. It would make enabler parts feel necessary rather than merely prudent, which is the strongest
     case for it. Today an enabler buys only insurance.
  2. Delivered power would then have two determinants, so every power question needs both
     answered, and the readout in `sprint140.md` task 4 stops being a single honest percentage.
  3. **It MIGHT restore the one-correct-build-order defect this whole arc exists to remove, and
     the maintainer's counter is that it might not (2026-07-30).** The worry: if support gates
     power, fuelling becomes the correct first purchase on every car every time, which is exactly
     the solved-puzzle shape the tuning system was written to break. The counter, and it is the
     stronger argument: **that only follows if the player is maximising.** Against a target, say a
     mission wanting a specific extra output, the cheapest route to the number may well be a
     bigger unsupported turbo rather than a smaller supported one, so the choice stays live and
     situational. Which of the two holds is a question about the actual price and power rankings
     across the slots, so **measure it before arguing it**: build the cheapest route to a handful
     of power targets under both models and see whether the order is fixed or not. Note this
     interacts with the deferred course-character job work, which is what puts targets in front of
     the player at all rather than leaving them to maximise in the abstract.
  4. It removes the back-alley playstyle's best toy. Today you can build a grenade and sell it to
     a stancer, who weights reliability at zero. If power is capped instead, there is no grenade,
     only a slow car, and a playstyle the maintainer explicitly wants becomes strictly worse
     rather than differently good.

  **Do not open this without first deciding which real-world outcome to model**, boost dialled
  back or engine let go, because the two produce opposite mechanics and the current design is a
  coherent expression of the second.

- [ ] **Reputation is a ratchet, so losing it costs almost nothing (maintainer, 2026-07-29).**
  Gaining reputation unlocks content: auction houses, workshop tool tiers, mission access.
  **Those unlocks never close again**, so once a player has opened everything, tanking their
  standing is close to free. Reputation stops mattering the moment the last thing is unlocked.

  This blocks a playstyle the maintainer explicitly wants to allow: *"I actually do want to
  give the player the freedom to sell shitty builds, gain a bunch of cash, and tank their rep.
  Dodgy back alley mechanic simulator style... it should be a legitimate though inefficient
  and weird way to play the game, but I want to allow it."* The trade that makes that work is
  **cash now against access later**, and the ratchet means the second half does not exist, so
  the dodgy path is not inefficient, it is simply free.

  Two routes, and the second is recommended (full reasoning in
  `docs/design/systems/tuning-system.md` section 8):
  1. **Unlocks can be lost.** Coherent, but confiscating a tool the player paid for reads as
     arbitrary.
  2. **Reputation gates the FLOW of opportunity rather than the door.** A well-regarded garage
     gets better cars consigned, better jobs offered, better buyers walking in, and gets them
     more often; a disreputable one gets fewer and worse. Nothing is taken away, and the
     back-alley playstyle becomes **self-consistent rather than punished**: you sell rubbish,
     rubbish comes to you, and you make thin money fast. That is an identity for a shop, not a
     penalty box.

  **Design principle this rests on, worth applying more widely:** the reason there must not be
  one correct build order is the reason there must not be one correct way to run a garage.
  Anti-dominance applies to business models too, and a playstyle that is merely inefficient
  should stay available rather than being tuned out of existence.

  Needs its own design pass. The tuning system's reputation effect will be weak until it lands,
  and that should be stated in the sprint rather than compensated for by inflating numbers.

- [ ] **`street-power-street-manners`'s power floor is still a hand-set PROVISIONAL 180**, not a
  `floor90(measured)` pin like every other mission threshold. It no longer rides on the power-ladder
  shape decision - proportional power shipped, replacing the old flat additive ladder
  (`docs/design/systems/tuning-system.md`) - but that sprint's approved lever list did not include
  re-basing this floor, so it stayed untouched on purpose. The mission's own probe build (sport
  intake/exhaust/ignitionEcu/forcedInduction on a 180SX) clears it with real margin under the new
  formula too; whether 180 is still the right number for the mission's designed difficulty is worth
  a maintainer look whenever mission thresholds are next revisited.
- [ ] **Invariant #6 (first-timer resale speed)** - "first-timer buyers keep sub-¥500k Commons
  sellable within 7 days at book value or better" has no bot modeling first-timer-specific selling
  behavior; `competentPolicyStrategy` (Sprint 23) sells via the generic clean/concours faucet, not
  this. Needs a purpose-built bot or harness variant if this specific invariant is ever wanted.
- [ ] Forced-loan interest rate and repayment cadence (GDD 6.6 says "painful," doesn't specify how
  painful) - open question for the spreadsheet pass. (The parts-pricing-curve question that used to
  sit here moved into Sprint 28's catalog work.)
- [ ] **Law 6 (the wage law) genuinely fails on the shitbox tier once the full teardown chain is
  honestly priced (found Sprint 72, decision 6; re-measured Sprint 79).** Before Sprint 72,
  `computeModelBalanceProbe`'s wage probe undercounted a bolt-on/buried repair's teardown labour
  (Sprint 71's disclosed gap); pricing it honestly (deduped once per shared blocker across the
  whole restoration, not once per part behind it - see `balanceProbes.ts`) dropped
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
  entirely** - `computeDonorBalanceProbe`'s `stripLaborSlots` is now 0 for every roster model, since
  removal is free. Re-measured on the worst-case rolled car per model (`ModelDonorBalanceProbeRow.
  partedYieldOfWorstCaseYen` against that model's own `sensibleFlipMarginYen`): parting now WINS on
  three roster models' worst-case corpse - `honda-city-e-aa` (49.5% bill/clean), `honda-civic-
  sir2-eg6` (54.8%), and `nissan-180sx-rps13` itself (55.3%, the exact model Sprint 75 found never
  crossed over) - while seven others (including both rare-tier RX7s and the Supra, whose bill/clean
  ratio is only 31.7%) still favour repair. The crossover is not a single ratio
  (`packages/sim/tests/balanceProbes.test.ts` disclosed this from the start): the lowest ratio at which parting wins (49.5%) sits comfortably
  above the 0.20 decision gate this sprint's own doc set (`sprint79.md` decision 3) - buy-strip-sell
  is not threatening moderately-damaged cars, only genuine corpses, so `usedPartSaleFraction` (0.55)
  is NOT touched. Maintainer call needed: is a three-model donor loop the intended shape for v1.0,
  or does `usedPartSaleFraction`/the donor mechanic want a deliberate design pass now that it is
  reachable (rather than remaining a theoretical, never-quite-triggering mechanic).
  **Re-measured Sprint 133 (the re-tier): 14 of 26 models now favour parting, up from 11.** The
  re-tier was expected to shrink this and did the opposite, for the reason the classFactors item
  above sets out: eight cars got a dearer parts basket against an unchanged book value, and the
  parted yield scales with part prices while the whole-car value does not. `usedPartSaleFraction`
  is still untouched. The lever to decide first is the class ladder, not this fraction.

## Planned systems (designed, not yet scheduled)

- [ ] **Bank loans: wanted, unplanned, and outside v1.0 until that changes (maintainer 2026-08-04).**
  The bank stands on the overworld map already, drawn and inert. What it is for is settled in
  principle: **take out a loan, pay it back with interest.**

  It is deferred because it is a genuine new mechanic rather than a re-presentation of an existing
  one, so it is a real exception to the v1.0 feature freeze and should be taken deliberately.
  It also changes the shape of the early game outright: starting cash stops being a constraint and
  becomes a choice, and a player gains the ability to dig a hole they cannot climb out of, which
  wants designing rather than discovering.

- [ ] **The 37 parody colour names are unswept, and that is fine for now (maintainer 2026-08-04:
  "proper copy sweep comes much later").** They ship as proposals. The paint palette dev screen
  shows each parody name beside its real one, which is the right way to judge them when the time
  comes. Least confident: Fairground Yellow, Biscuit Brown, Chamois Yellow, and Shoreline Blue for
  Bayside Blue.

- [ ] **Cosmetic lighting, if it ever earns a slot (underglow cut 2026-08-03).** The Underglow Kit
  was the `underbody` slot's street SKU, and `underbody` was deleted and merged into `chassis` when
  the body zone model was rebuilt: once skirts became their own zone and the splitter and flat
  floor were recognised as duplicates of `aero`'s Lip Kit and Race Aero Kit, underseal and
  underglow were all that remained, which is not a slot. Underglow is pure style with no home now.

  **If it comes back it needs a reason beyond nostalgia**: a slot of its own, or a place inside
  `aero` as style-without-downforce, plus a decision about whether it reads at all in a game with
  no night. It was cut rather than rehoused precisely so that decision gets made deliberately.

- [ ] **Machining as a fifth play in the plays ranking (carried out of Sprint 168).** The ranking
  reads what a car needs and what it is worth, and machining is invisible to it, so a player is
  never told that boring the block is the best thing they could do to this car today. It cannot be
  added until the ranking can read what the shop OWNS, because a machining play is only available
  to a shop with the machine, unlike the four plays that are always possible. Worth checking
  against playtest evidence before building: a ranking heuristic is worth nothing until it is known
  whether the current ranking actually misleads.

- [ ] **Weight reduction: stripping a car down, and sprung against unsprung mass (maintainer,
  raised while designing machining, explicitly NOT part of that sprint).** Power-to-weight should
  be something a player can attack from the weight side rather than only the power side. Four
  strands, none built:
  - **Physical stripping.** Remove seats, sound deadening, trim, the spare, and the car gets
    lighter. The game already models a slot as present or missing (`isPartMissing`), but **missing
    does not currently mean lighter**: a removed part contributes nothing to condition and nothing
    to mass either. That gap is the whole feature in miniature.
  - **Lighter parts.** `physicalModifiers.mass` already exists and already works (a mint race
    exhaust saves about 0.69 per cent of kerb weight), so the ladder is partly authored. What is
    missing is coverage and intent rather than mechanism.
  - **Machining removes metal, so it removes weight.** Knife-edging a crank, lightening a
    flywheel and skimming a head all take material off. The machining baseline table's own
    flywheel row ("no change to peak power, faster rev pickup") has no home in a `powerFraction`
    and is really a mass and inertia entry, which is what surfaced this.
  - **Sprung against unsprung mass.** A kilo off a wheel is worth more than a kilo off a boot
    lid, and the performance model currently knows only kerb weight. Whether that distinction
    earns its complexity is an open question, not a decision.

  **What it collides with, so nobody starts it blind**: the performance model is LOCKED and
  validated to about 2 per cent, and mass is an input to it, so any change here is a change to
  calibrated physics rather than to a display. Stripping a car also has to answer to authenticity
  (a stripped interior is a modified car), to value (an interior-less car is worth less to most
  buyers and more to a track buyer), and to the sale verdict, which reads missing slots today.

- [ ] **The tuning system is DESIGNED, REVIEWED and PARTIALLY IMPLEMENTED (sprints 135 and 136
  landed), and it is the ACTIVE ARC: sprints are being written for it separately, so it is not a
  parked idea. The design of record is `docs/design/systems/tuning-system.md`.** It is the whole
  design for what an aftermarket part does, how a build holds together and what that is worth:
  proportional power in place of the flat additive ladder (BUILT, sprint 135), an
  engine-response character derived from induction and specific output (BUILT, sprint 135),
  per-subsystem support ratios whose weakest link is the headline, feeding reliability as
  condition plus coherence off a per-car `spec.reliabilityBase` (BUILT, sprint 136) - cohesion
  reaches value through reliability rather than a separate buyer-selection path or a multiplier,
  which is what makes a build's cohesion, not just its parts list, worth something. It matters
  because the system it replaces was solved in the wrong way: there was one correct build order,
  it never varied, and the same +16 PS ECU applied to a naturally aspirated Beat and a
  twin-turbo Supra alike (fixed by sprint 135); a build could also make power it could not hold
  together for free (fixed by sprint 136).

  **Status: sprints 135 and 136 are SIGNED AND BUILT.** 135 landed proportional power replacing
  the flat additive ladder, an engine-response character per car, and the per-slot price ladder;
  136 landed the per-subsystem support ratios, the coherence curve, and reliability rebuilt as
  condition plus coherence off a per-car `spec.reliabilityBase` (`reliabilityCap` retired
  outright, not moved) - see `docs/sprints/sprint_archive/sprint135.md` and `docs/sprints/sprint_archive/sprint136.md`'s own
  Exits for what landed and what each moved. **Sprint 137 (the forced-induction return curve) is
  SIGNED, BUILT AND COMMITTED too**, along with its `camsTiming` price amendment: see
  `docs/sprints/sprint_archive/sprint137.md`'s own Exit for what landed. Its one genuine open
  finding (a pre-existing cross-category value-per-yen defect, unrelated to that sprint's own two
  levers) was closed by the same amendment and is recorded above under "Open balance/economy
  questions". 134 needed nothing. **138 and 139 were closed unbuilt, superseded by the sale value
  system.** **Sprint 142 (grade sensitivity) is SIGNED AND BUILT**: an installed SKU's own
  advantage now fades on a curve keyed to its GRADE, so a race damper at `poor` delivers less than
  a street damper at `mint`, and its second half reviewed the four provisional condition-to-physics
  curves and left them exactly where they are, with the reasoning and the measurements in
  `docs/sprints/sprint142.md`'s Exit. **Sprint 141 (the dyno screen) is SIGNED AND BUILT**:
  measurement only, on the maintainer's ruling, with the rolling road a hire-or-own workshop tool
  and the screen reporting engine character, power as built, all five support ratios and the
  reliability split, every figure the sim's own. What remains of the tuning arc is 140
  (`aeroCeiling` and the handling deletion), still in `docs/sprints/`.

- [ ] **The dyno's boost-against-reliability slider is DEFERRED, not dead** (GDD 5.4 as amended by
  `docs/sprints/sprint141.md`). Sprint 136 made reliability the output of build coherence, so both
  ends of the axis exist and it is a genuinely good trade: turn it up, make more power, watch
  cylinder pressure go red and the car become something only a stancer will buy. What is missing is
  the INPUT - power comes from discrete SKUs and there is no continuous boost variable to slide, so
  it is a real scope addition rather than a screen. Its natural home is the engine-swaps arc, where
  aspiration becomes a thing rather than a tag. The GDD's other named axis, camber against tyre
  wear, is dropped outright and will not return: nothing degrades with use, so it has no time in
  which to operate.

- [ ] **The rolling road ships on the plainest treatment its own law allows, and the art is
  outstanding** (`docs/sprints/sprint141.md`, task 2). The dyno screen is a printed strip read top
  to bottom, in the panel language every other screen uses, because the pixel-art rolling road the
  art bible's diegetic law asks for does not exist yet. Nothing about the numbers changes when it
  does; this is a skin over a finished readout.

  Blocking decisions, all recorded in the doc. Constraint A (section 17): the
  forced-induction return curve must not ship before the support ratios, because increasing
  returns on its own is a new dominant strategy. That constraint was honoured; 137 ran behind
  136's hard gate. **Constraint B is resolved and the resolution
  changed the arc's shape (maintainer, 2026-07-29): cohesion reaches value through
  RELIABILITY**, not through a separate buyer-selection path. Reliability becomes the build's
  coherence times its condition, and because reliability is already 57 per cent of a
  first-timer's taste and zero per cent of a stancer's, buyer selection falls out of the
  existing valuation code with nothing built for it. Sprints 138 and 139 were closed unbuilt on
  the strength of that, rather than run. And section 7b's
  reputation half is descoped outright because reputation is a ratchet, which is the entry
  under "Open balance/economy questions" above: until that lands, the tuning system's
  reputation effect is knowingly inert and the sprint should say so rather than inflate
  numbers to compensate. Every unsigned number in the doc remains a proposal, directive 22.

- [ ] **Machining, the third upgrade avenue, is DESIGNED and deliberately OUT OF SCOPE of
  the system that designed it: `docs/design/systems/tuning-system.md` section 4.** Modifying
  a part you already own so it exceeds its own original spec, which is what real tuning
  largely is: boring and stroking for capacity, porting and polishing for flow, skimming for
  compression, balancing and blueprinting, lightening a flywheel. None of those is a part you
  buy. It matters because repair can never beat stock and fitting aftermarket destroys
  authenticity, so machining is the only route that makes a car better while keeping it
  original, which finally gives the numbers-matching build a performance path rather than a
  sentimental one. It is also the purpose tool tier 3 lacks: `repairBandCeilingByTier` is
  `{1: fine, 2: mint, 3: mint}`, so tier 3 today buys nothing at all over tier 2.

  **A lever is already sitting in `economy.json` waiting for this, and it must NOT be deleted as
  dead code (maintainer, 2026-07-30).** `valuation.expectationByTier.flagship.beyondDiscount` is
  1.3, the return on work done BEYOND a car's expected condition band. A flagship's expected band
  is `mint`, and `billAboveYen` is computed as `billToMintYen - billToExpectedBandYen`, so for a
  flagship that subtraction is always zero and the 1.3 multiplies nothing. It reads like a live
  knob and currently does nothing at all.

  **It is a placeholder, not a mistake.** `mint` is the top REPAIR band, so nothing can sit above
  it today, but machining is precisely a route to a part that exceeds its own original
  specification, which is an above-mint state. When machining lands, that lever becomes live and
  flagships gain the one thing their expectation currently forbids: somewhere to spend past
  perfect. Whoever picks machining up owns making `billAboveYen` reachable for a flagship; until
  then the value stays where it is, recorded here so nobody prunes it.

  It is an acquisition path, not a new axis (section 4b): one SKU in one slot, no third
  property on a part, no second condition model, no new job system, and deterministic by
  design (you pay, you wait, you get the part; machining risk is the first thing a future
  reader will try to invent and the game has no random catastrophic loss anywhere). It is the
  player's own facility, unlocked in the late-middle game, and explicitly NOT
  `machineShopAssist`, which is basic tool hire and priced as such. The constraint on the
  tuning sprints is negative: they must not foreclose it, so capacity increases must not be
  expressed as aftermarket SKUs pretending to be replacements, and no upgrade path may assume
  authenticity is always destroyed. Blocking decision: **where machining physically happens**,
  which is the workshop-topology entry below and wants at least an outline answer before the
  systems arc finishes.

  **Machining also owns the top of the power ladder, and that is now a signed constraint rather
  than an aspiration (maintainer, 2026-07-29, at the Sprint 135 sign-off).** The approved power
  fractions cap a parts-only build at **x1.43** high-strung NA, **x1.57** lazy NA and **x1.95**
  forced. Measured against the real world that is correct for most of the roster (SR20DET 341,
  13B-REW 497, EJ20 488, 1JZ 546, VG30DETT 546, all inside their real built bands) and **low for
  exactly two engines**: the **RB26 at 546 PS** against a real 600 to 800, and the **2JZ at 632**
  against 700 to 900. Both reasons are real and neither is a bug in Sprint 135. The 280 PS those
  cars advertise is the manufacturers' agreement rather than a measurement, so the multiplier is
  applied to a political number (the JDM-variants entry above owns that half); and the RB26 and
  the 2JZ are the two deliberately over-engineered iron sixes, which is exactly why tuners chose
  them, and one forced multiplier cannot say so.

  **RULED 2026-08-02, and this half of the entry is closed.** The objection above argued that
  raising `powerFraction.forced` corrects two engines and inflates five, and asked for per-engine
  headroom instead. **The maintainer ruled for the flat rise and accepted the cars it inflates**,
  with the figures recorded in `docs/design/systems/machining-performance-table.md`: the Supra
  reads 745 at race and 842 fully machined and the GT-R 644 and 728, which is what the target was
  set on, while the FD reads 586, the Impreza 575 and the SW20 561. Those three are accepted rather
  than left open. **`powerFraction.forced` is no longer forbidden**, and `docs/sprints/sprint168.md`
  moves it.

  **The rise landed.** Sprint 168 moved all 96 catalogue fractions to the table. The first attempt
  made street and sport a uniform rescale of race, which broke four pricing probes (a street ECU at
  2.1 times the power per yen of anything else on a boosted car); the investigation in
  `docs/design/systems/turbo-price-blast-radius.md` established that no price ladder can fix that,
  because one `forcedInduction` sheet entry serves three engine characters. The shipped answer keeps
  each slot's own grade shape and pins the turbo's column to its ladder's ratios, which fixes it with
  **no price movement at all**: the four probes measure 1.137 (bound 1.35), 0.641 (0.50), 0.141
  (0.25) and 0.003 (0.005).

  **What survives is the feature, not the objection.** Per-engine headroom is still the mechanism
  that would make the legendary blocks legendary the way they were in life, and it is still worth
  building: a block that can be bored, decked and filled has more of it than one that cannot, and
  that is a property of the engine rather than of the part bolted to it. It needs authoring for all
  94 roster rows under directive 24, so it is a sprint of its own rather than a condition on
  machining.

- [ ] **Course-character build variety is deferred out of the tuning system, and it is job
  and copy design rather than physics** (`docs/design/systems/tuning-system.md`, the deferral
  list at the head of the doc and section 13). Clients who want a Wangan car, a touge beast, a
  track toy or a reliable runabout, so a build is aimed at a job instead of maximised in the
  abstract. It is what gives the trade-off parts of section 3a their point: a client wanting a
  reliable runabout does not want race cams in it.

  **Not merely flavour.** Section 13 records that suspension's value is course-dependent and
  that until this work exists suspension will read as the boring purchase no matter what its
  numbers are, "and no amount of retuning its numbers fixes that. That is a reason to schedule
  the job work, not to inflate suspension." So this is what makes an entire upgrade line feel
  worth buying, and it is the honest alternative to retuning that line.

- [ ] **Engine swaps are FROZEN v1.0 SCOPE, not a post-launch idea, and NOTHING OF THEM
  EXISTS IN CODE. GDD 5.3 calls them "the marquee deep mechanic" and GDD 5.4 pairs them
  with a dyno session; `dyno` appears exactly once in `packages/`, as a word inside a
  mission string. Designed but not implemented; the design of record is
  `docs/design/systems/engine-swaps.md`.** Any engine into any platform if you source a
  mounting kit, tanking authenticity and unlocking a power ceiling, with the GDD's own
  tension as the point: restore the numbers-matching engine, or drop in the big turbo lump.
  Its value beyond that is the 公認 (kōnin) re-approval step, which is friction that is not
  money and cannot be reskinned to any other setting, so it is a direct answer to the
  standing "the game would play identically with a European roster" concern further down
  this file. Being frozen v1.0 scope rather than a nice-to-have changes its priority
  relative to everything else in this section.

  The blocker is a schema question before it is a design question: **an engine is not an
  object in this codebase.** It is a handful of optional scalars on the immutable
  `CarModel.spec` plus a tag, the physics reads only `stockPowerPs`, and there is nowhere to
  record a swap at all, since engine identity lives on shared content while `CarInstance`
  carries only parts and condition. Two cars of the same model cannot currently have
  different engines. Riding with it: aspiration is stored twice, on `spec.aspiration` and on
  the induction tag (`hasForcedInduction` reads the required `spec.aspiration`, and
  `integrity.test.ts` holds the tag in agreement with it), and a swap changes aspiration, so
  that duplicate has to be collapsed rather than worked around. Step 1 of the doc's build
  order (author the engines as content, point `spec.engineCode` at them) is zero behaviour
  change, independently shippable, and worth doing whether or not swaps are ever built,
  because it also gives the tuning system the per-engine response character it needs. Four
  open questions remain: donor car or engines
  bought outright, whether the original lump can be kept and refitted, how many engines get
  authored for v1.0, and whether a swapped engine arrives with a condition of its own.

  **Per-engine PART PRICING rides on the same step 1, and is deferred to this arc (maintainer,
  2026-07-29).** A race turbo system on a 2JZ and one on a 13B-REW are different objects,
  installed differently, and should not cost the same. Today they can only differ by the car's
  tier: `resolvePartPriceYen` reads `partPricing.classFactors[fitmentClass]`, and
  `partPricing.overrides` is keyed per SKU while SKUs vary only by fitment class, so **there is
  nowhere to hang a per-engine price at all.** The FD and the Supra already differ 2.25x by tier
  (enthusiast 0.4 against flagship 0.9), which covers the gap crudely and is why this is not
  urgent. It becomes cheap the moment an engine is a content object with an id, because the
  override map can then be keyed by it. **Do not build a per-car price multiplier as a
  workaround**: that is a parallel mechanism for something step 1 gives away for free.

- [ ] **The scrapyard (解体屋) is DESIGNED IN FULL and NOT IMPLEMENTED. The design of
  record is `docs/design/systems/scrapyard.md`; read it before scoping and do not
  re-design from scratch.** A new venue selling used parts and half-stripped wrecks,
  buying scrap and poor parts for weight money, and taking the shell so `scrapShell`
  becomes a transaction with a counterparty rather than an abstract payout. Its point is
  an outlet where luck and digging beat paying full retail.

  Three reasons it earns its place, from the doc: it gives the parts economy a **supply
  side** (today the only way to obtain a part is to buy it new); it gives the teardown loop
  the **subject it lacks** (a car nobody would repair, bought for the four good parts on
  it); and it gives `poor` and `scrap` parts an honest exit instead of silting up the
  warehouse at 3 per cent of new.

  **The design risk is the whole design:** a yard that reliably sells the part you want at
  half price destroys the parts economy settled on 2026-07-28. It has to be unreliable in a
  way the player can work with. The maintainer's floated puzzle mechanic fits exactly, and
  is **not a new system**: the inspection game is already a routing problem under a time
  budget, and a yard visit is the same mechanic asking "which of these is worth taking
  home" instead of "what is wrong with this car". `apparentBandByPartId` already exists to
  express looks-versus-truth.

  The doc's section 9 carries a three-phase build order and phases 1 and 2 are separately
  shippable: phase 1 is the venue with rotating loose parts and the scrap/shell buy-back
  (small, and it closes the supply-side and warehouse-clutter gaps on its own), phase 2 is
  wrecks and the damage archetypes, phase 3 is the timed routing puzzle and only if phase 2
  proves too easy. Blocking decisions, all five open at the doc's end and none answered:
  whether the yard is a gated venue or always available (the doc's read is always
  available, since it is where a poor player shops); whether the yard buys whole cars,
  which would put a price floor under the entire market; how a yard part interacts with the
  provenance rework already owed above; whether a misjudged wreck can be sold back; and
  whether reputation reaches the yard at all. Every number in it is an unapproved economy
  lever, directive 22, and the one hard arithmetic constraint is that the yard's buy-sell
  spread stays positive or the player loops parts between yard and shop for free.

- [ ] **Workshop topology and the physical UI is a PROBLEM STATEMENT, not a design, and
  nothing in it is decided: `docs/design/systems/workshop-topology.md`.** The game has views
  of a car but no model of a place. The maintainer's questions, raised 2026-07-29: what
  should it look like to remove an engine, what should it feel like to bore a block, where
  does repairing actually happen, what are the physical steps of taking a part to a
  workstation and reconditioning it, and where is the workstation. The shipped workshop views
  answer "what is wrong with this vehicle", which is a different question from "where am I
  standing and what can I do here".

  **Urgent rather than cosmetic, because four separately designed features all need the same
  missing thing.** Machining, the dyno, engine swaps and the scrapyard each invent a physical
  act with nowhere to perform it. Building any of them without a shared topology means each
  grows its own screen for physically similar work, which is exactly the failure directive 16
  exists to prevent and the one that caused the Sprint 08 service-jobs rework.

  It also carries **the maintainer's verdict that the current car diagram is bad and needs
  redesigning.** The document deliberately does not diagnose it, on the grounds that the
  person who has looked at it is the one who should say what is wrong with it.

  **Sequencing: this arc runs AFTER the systems arc, by the maintainer's steer**, since the
  systems decide which acts exist and designing screens for mechanics that then change shape
  is waste. **But two things want deciding before the systems arc finishes, because they are
  cheap now and expensive later:** where machining physically happens, since
  `tuning-system.md` 4c hangs tool tier 3 on it, and whether parts have a location, because
  that is new state and adding it later means a schema change everywhere that touches
  inventory.

- [ ] **A proper calendar (maintainer request, 2026-07-29). Not designed; the shape below is
  specified and the rest is open.** The structure asked for: **7 days a week, 4 weeks a month, 4
  months (seasons) a year, and every year rolls the calendar over.** Explicitly tunable later if
  it turns out too slow. **What it buys is seasonal and timed events**, which is the reason to do
  it at all rather than an incidental benefit.

  **Half of it already exists implicitly and that half must be reused, not rebuilt** (directive
  16). The sim runs on a day counter and already treats every 7 days as a week: weekly rent and
  staff wages in `finances.ts`, the weekly job-ad refresh at `advanceDay.ts` step 7d, and the
  weekly market-heat update in `marketHeat.ts`. **So the week is real and only the month, the
  season and the year are missing**, along with a displayed date anywhere in the UI. A calendar
  that introduces a second notion of "week" alongside the existing one is the failure mode to
  avoid.

  Open, and none of it decided: whether the year is a real year (the game sits in a period band
  of 1995 to 2005, so a rolling year could carry the setting forward, which is a large tonal
  decision rather than a clock one); whether seasons change anything mechanically (auction
  catalogues, buyer appetite, which cars sell) or are pure flavour to begin with; whether a
  16-day season is long enough for an event to be felt; and what a date looks like on screen
  under the art bible's diegetic law, which for 1990s Japan probably means a wall calendar rather
  than a status bar. **Nothing in the tuning arc depends on it and nothing in it depends on the
  tuning arc**, so it can be scoped whenever.

- [ ] **Selling parts has no friction: it is instant, free and unlimited (maintainer ruling
  2026-07-28: LOW priority, and a middle ground rather than heavy friction).** `resolveSellPart`
  costs 0 action points and converts any non-scrap part to cash immediately. Once the prices
  were fixed this stopped being urgent, because part-out is now loss-making on every car in
  the game and the arbitrage it was propping up is gone.

  What selling parts should serve, in the maintainer's words: emergency cash when the player
  needs quick turnover and has the inventory; clearing the warehouse of parts they do not
  need; recouping something on bad parts they never intend to fix; and letting a player who
  wants to roleplay a parts shop do so. **Heavy friction would defeat all four.** So the
  question is what a middle ground looks like, not how to punish it. Revisit alongside the
  scrapyard, since the yard is the natural home for the "clear the warehouse" and "bad parts"
  cases and may absorb most of the need on its own.

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
  `docs/design/art/art-catalogue.md` (drafted 2026-07-22); its P1 column is this pass's scope.
- [ ] **Reading-face rollout: SPARING, by maintainer order (2026-07-22).** The pairing is
  approved but the pixel face is the game's voice: the reading face applies only where
  legibility genuinely demands it (long-form paragraphs below 16px: settings explainers,
  skip/confirm copy, help bodies). EXPLICITLY STAYS PIXEL: all diagnosis text (symptom
  checklist, result lines, trail), card lines, event log, labels, numbers, headers, buttons.
- [ ] **Accessibility suite v2: reduced motion and colour-independent severity cues.** V1 has
  landed with the live room's promotion: an in-room auto-bid toggle places rung-one bids up to
  a player-set ceiling (defaulting to their own estimated value) without ever jumping, so
  reactions stay reader-triggered; a persisted fuse-length preset (standard/relaxed/unhurried)
  scales the per-bid clock. Still open and unscoped: reduced motion, and colour-independent
  severity cues (band chips currently lean on colour alone).
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

- [ ] **"Drive My Car" test-drive mode is DESIGNED and NOT IMPLEMENTED. The current design
  of record is `docs/design/systems/drive-mode-plan.md`; the older parked spec it builds on
  is `docs/design/parked/drive-mode-spec.md` v2, whose blocked items the plan supersedes.**
  Drive a finished build before flipping it: slip-angle physics with a friction circle in
  `packages/sim`, a Mode 7 chase cam in Pixi, reading `CarBlock` rather than carrying a
  second set of car parameters. It matters more cheaply than it used to, because the
  expensive half was paid for by other work: the performance model landed LOCKED in Sprints
  127 to 131, so a clean lap landing within a few per cent of the lap time the economy sim
  already shows the player is a real definition of done rather than an unfalsifiable "does
  it feel right". **Post-launch, by the maintainer's standing 2026-07-08 sign-off**
  (optional, zero gameplay weight - which is what keeps it inside the no-reflex-input hard
  rule rather than an exception to it; do not flag it as a rules violation), and the plan
  hardens that into a rule: the moment a lap time affects money, reputation or progression
  it becomes a violation, so a lap time may be displayed and remembered but never spent.
  Binding constraint before it ever enters a sprint, from the spec itself: **stat-linked,
  not twitch-linked**, which the plan answers with assists that scale with the build rather
  than with weaker physics. Roadmap: Phase 7, post-launch, against a maintainer ask of
  2026-07-28 to start properly working on the driving aspect now; that timing is unresolved.

  **The largest unresolved cost is a rear-view car sprite, and it is an art decision that
  must be settled before a sprint opens rather than during.** The art bible locks two sprite
  angle classes per car and no more (a 96x48 side master and a front-facing oblique scene
  sprite) and records that a third angle class was considered and rejected on cost. A chase
  camera needs a third. The plan's section 5 lists the options without choosing: author a
  third class for a small subset of cars only, use a generic silhouette, or place the camera
  somewhere that reuses an existing angle. The no-AI-assets law is absolute, so this is
  hand-made pixel art or nothing. Smaller open questions in the plan's section 7: which
  course ships first (its instinct is Misaki, where the acceptance test is sharpest), and
  whether a personal best is stored, which edges toward the mode meaning something.

- [ ] **Skill / XP progression** - learn-by-doing growth for staff *and* the player character; skill
  *optimizes* (efficiency/quality), never *unlocks* tiers (tools + rep do that). Staff skill lands
  with the staff system, still unscheduled; player-character skill is new v1.0 scope, slotted
  against the service-jobs feature. Full design: `docs/design/parked/skill-progression.md`.
  **Update (Sprint 39, Progression Rework arc close-out, 2026-07-12):** the "tools + rep do that"
  half this item already deferred to is now BUILT (tool tiers, Sprint 36; reputation unchanged) -
  `skill-progression.md` has been reconciled against `docs/design/progression-bible.md` (the
  canonical progression rules now); its still-open "staff/player skill optimizes efficiency and
  quality" scope is genuinely distinct from specialty (Sprint 38, identity/access, earned not
  optimized) and remains unbuilt/unscheduled, this item stays open for exactly that scope.

- [ ] **Generated modified cars never wear the migrated body kits (Sprint 119 scope line).**
  The widened aero-and-body-kit family carries multiple SKUs per grade after the Sprint 119
  migration (Lip Kit + Lightweight Body Kit + Underglow Kit at street, etc.), but car
  generation still rolls exactly one canonical SKU per grade (Lip Kit / GT Wing / Race Aero
  Kit); the migrated kits are market-purchasable only. A later modified-cars pass should
  teach generation to pick among a grade's kit SKUs so auction lots can wear them.

## Design decisions awaiting maintainer direction

- [ ] **Why can the player not just plug a scanner in? The game has no answer and needs one
  (maintainer 2026-08-04).** Every diagnostic test in the game is physical and pre-electronic:
  revs-and-listen, the stethoscope, a coolant check, a compression test, oil pressure, a rag over
  the tailpipe. That is a 1980s workshop, and the setting is not.

  **"It is 1995" does not cover it.** OBD2 was mandatory in the US from 1996 and Japan ran JOBD from
  the early 2000s, and **47 of the 94 roster cars are still in production in 1996 or later**, with
  five running to 2010: the R35, the LFA, the RX-8, the Copen, the Z33. A shop working on a 2009 GT-R
  that reads faults by ear is not period-authentic, it is an anachronism pointing the wrong way.

  **Three candidate justifications, none yet chosen:**

  1. **Cost and access.** A factory scan tool in period was dealer equipment, expensive and often
     marque-specific. A backstreet shop genuinely worked by ear and gauge. True, and it explains
     day one, but it does not survive the player becoming a well-equipped shop.
  2. **The generic reader is nearly useless.** A cheap code reader gives a code, not a cause: a
     misfire code names the cylinder and tells you nothing about why. That is honest and it protects
     the mechanic, since diagnosis is about narrowing causes rather than reading a number.
  3. **Make it a tool, which is the strongest answer.** A diagnostic scanner as an engine-line tool
     purchase that narrows the candidate list on cars new enough to carry a port, and does nothing
     at all on the older half of the roster. That turns the anachronism into a mechanic: **the era
     of the car decides whether your best equipment can help you**, which is a genuinely good reason
     to own both a stethoscope and a scanner, and it gives the tool ladder something else worth
     buying.

  Option 3 also earns its keep against the roster's own spread rather than fighting it, and would
  pair with the decade the game is meant to move through.


- [ ] **The 37 parody colour names have not been swept against the copy bar (Sprint 169, deferred
  to the playtest by maintainer instruction 2026-08-03).** Every one in `paintAliases.json` is a
  proposal, not a ruling. They are player-facing text on cars a player already loves, so the bar is
  "worth reading", not "legally distinct". The paint palette dev screen shows the parody and real
  name together, which is the right way to judge them. Least confident: **Fairground Yellow** and
  **Biscuit Brown** (both risk being twee), **Chamois Yellow** (garage-correct but obscure), and
  **Shoreline Blue** for Bayside Blue, which may read as a dodge rather than a parody. `Wangan
  Blue` is the named alternative there, and the game already uses Wangan as a culture name.

- [ ] **Nobody has seen the paint work render (Sprints 169-170, deferred to the playtest).**
  Neither the 34 colour ramps, nor the paint stage's new colour-and-finish picker, nor how 34
  swatches read grouped into nine families. Correctness is established by types and tests only.
  Two specific things to look at: the **five closest pairs** in the palette, which is where the
  merge came nearest to failing (`cyan`/`blue-pale`, `beige`/`white-ivory`, `red-deep`/`maroon`,
  `green-sage`/`grey-mid`, and the three silvers) - if any pair is indistinguishable on a sprite
  they should merge; and whether the four physical dial curves' PROVISIONAL ramps read at all at
  the sprite's four tones.

- [ ] **`tierDelta.grand` is unset as factory rubber for the supercars.** Carried out of the
  tuning arc and never scheduled. It is a per-tier value, not a per-car one, so it does not fall
  under directive 24's whole-roster rule, but it is an economy lever and needs naming and signing
  before anyone implements it.

- [ ] **The reputation system wants a fresh look once the sale-value arc lands (maintainer
  instruction, 2026-07-31, raised while ruling on the instant-flip guard).** Settling the guard's
  bound (`valueModelProbes.test.ts`, the unimproved-flip probe), the maintainer named reputation
  loss on some sales, alongside the opportunity cost of not building a car already owned, as one
  of the real forces that stop a player flipping every car. That is a live claim about what
  reputation does today, made in passing while deciding something else, and reputation itself has
  not been re-examined against it. Two items already open here bear on whether it holds and
  should be read alongside this one rather than restated: reputation is a ratchet, so losing it is
  close to free once a shop has everything unlocked (Open balance/economy questions); and a sale
  carries no reputation-quality provenance today, since specialty earns from service-job work only
  (Open engineering). Worth a dedicated look once the sale-value arc is settled, not before.

- [ ] **The progression map is drafted (`docs/design/progression-map.md`, 2026-07-22): the
  factual board for the mid-game design session, holes ranked.** Headliners: the
  collector-network auction tier has no unlocking guarantor mission yet (Sprint 115 shipped
  guarantor unlocks for regional/premium; the collector persona Kurogane and mission
  the-quiet-crate are written, byte-verbatim, in `docs/sprints/sprint_archive/sprint115.md` section 5, but
  held out deliberately - unlocking an empty tier is worse than the silence, and zero
  legend-rarity cars exist in content yet for it to hold); the `legend` rep rung (1,400)
  gates nothing but staff stat rolls; three of five staff traits are hireable but
  mechanically inert (ex-pro-driver, night-owl, gaisha-fluent); gaisha cars are unreachable
  by any channel (no Import Broker exists). The session's questions are listed at the map's
  end; no design was done in it.

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
- [ ] **RESOLVED for now, one open design question remains: the effective symptom rate had drifted
  below its signed `diagnosis.symptomChanceByTier` on every fitment class** (`applySymptoms` drops a
  symptom outright if it would breach the Law 2 ceiling, and Sprint 154's care profiles left cars
  closer to that ceiling on every class, so the veto ate more of the roll silently).
  `diagnosis.symptomChanceByTier` was raised (2026-07-31, R4) so the effective, post-veto rate lands
  back on the signed intent; full numbers and reasoning in `sprint154.md`'s Exit ("Amendment: the
  veto-coupling lever, closed") and the Open engineering entry above on the standing hazard this
  leaves. **Still open:** whether the veto should soften a symptom instead of dropping it outright is
  a design question, not answered by this fix - raising the input closes the immediate drift without
  touching the veto's own behaviour.
- [ ] **The game needs a JDM-specific hook - flagged by the maintainer 2026-07-15, to be scoped
  in a separate session; do not design unprompted.** The concern, verbatim in spirit: the current
  repair/component systems are mechanically generic - swap the car roster for European cars and
  the game plays identically, which risks the love-letter-to-90s-JDM identity reading as a reskin.
  Needs a mechanical, narrative, or cultural element that ties the core experience to the setting.
  Seed observation from the design pass (an input for that session, not a design): the cheapest
  carriers are content rather than mechanics - diagnosis symptom/cause tables keyed to signature
  engine families, period parts culture, and the story-mission cast.

## User-only tasks (air-gapped / purchases / accounts / legal)

- [ ] **Capture more car fingerprints** (the stats-panel readings, no driving needed; protocol in
  `docs/design/car-performance/forza-telemetry.md`). 59 of the 85 roster cars are fully measured, 4
  are half measured and 22 are predicted by regression. Every fingerprint improves that car AND,
  through the regression, every car that will never be measured. Highest value first: any car that
  already has a driven lap but no fingerprint, because the expensive reading is already spent.
- [ ] Buy Aseprite; (optional, whenever convenient) draw a real car sprite to replace the
  programmatic placeholder from the Sprint 00 art spike.
- [ ] Trademark search on the final title ("Midnight Garage" vs. alternates in the GDD); register a
  domain if the search comes back clean.
