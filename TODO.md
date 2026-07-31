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

- [ ] **The balance probes and real generation use two different cost models for the same three
  parts (found 2026-07-30, while making the probes read live data).** Real generation
  (`generateAuctionCarInstance`) unconditionally rolls a `zoneState`, and that is what prices
  `panels`, `paint` and `underbody`, through `bodyPartRepairBillYen`'s flat materials cost. The
  probe cars in `packages/sim/src/balanceProbes.ts` carry no `zoneState`, so those same three parts
  price through the generic per-part formula (`costToBandYen`, scaled by catalogue part price)
  instead.

  **This is not a missing field, it is two cost models for one thing**, and it predates the
  probe refactor rather than being caused by it. It matters because these probes are the economy
  bible's Law 1 to Law 4 guards: to whatever extent the two models disagree, the guards are
  validating a car the game does not generate.

  Verified before stopping: synthesising a `zoneState` on the probes WOULD move `worstBillYen`,
  `repairCostYen` and `sensibleFlipMarginYen`, and `computeModelBalanceProbe`'s `planGroupRepair`
  loop would need zone-pipeline-aware repair-cost logic it does not have today, because
  `planGroupRepair` deliberately skips zone-backed parts. So closing this is a real change to
  the probes' arithmetic, not a field addition, and every Law figure would need re-deriving.
  A doc comment in `balanceProbes.ts` flags it at the site.

- [ ] **The duplicate-formula ban (Sprint 143's G3 guard,
  `packages/content/tests/duplicateFormulaBan.test.ts`) found three pre-existing hand copies of
  the clean-value formula (`bookValueYen * mileageFactor(...)`) outside `marketValue.ts`, not
  one.** The guard as written exempts only `marketValue.ts`; left red on purpose rather than
  quietly exempted, per the sprint's own instruction to report a guard's real findings rather than
  paper over them.
  - `packages/sim/src/auctions.ts:810` (`enforceMaxBillFraction`'s `cleanValue`, the Law 2
    generation-guard ceiling) and `packages/sim/src/balanceProbes.ts:317`
    (`computeModelBalanceProbe`'s `cleanValueYen`) are genuine re-derivations with no parity
    test tying them to `marketValueYen` - the exact drift risk directive 16 exists to prevent,
    and the one `balanceProbes.ts`'s own file doc comment claims never happens ("never a
    re-derivation of their formulas").
  - `packages/sim/src/valueLedger.ts:69-70` (`valueLedgerFor`'s `mileageAdjusted`) is a weaker
    case: its own doc comment states it is "built from the same atoms the value formula itself
    consumes... never a second value computation," and `valueLedger.test.ts` pins its total to
    `marketValueYen` to the yen on every roster model, so drift cannot land silently the way it
    can in the other two.
  Needs a maintainer call: extend the guard's exemption list (at least for `valueLedger.ts`,
  given its parity test), or extract a shared exported `cleanValueYen` helper from
  `marketValue.ts` that all three call instead of each computing it by hand.

- [ ] **Two roster CSV columns are owed under directive 24, and neither blocks the tuning arc.**
  `rarity` holds 26 of 94: it is a spawn-rate lever, so the missing 68 need signing under
  directive 22 as well as authoring. `flavour` holds **0 of 94**, deliberately: ninety-four
  flavour lines written in one pass would be filler, and the copy bar does not allow filler, so
  they are written per car by hand against the "lived in Japan in 1995" test. Both block authoring
  a car into `cars.json`, which `scope` already governs, and nothing else.
  (`aeroCeiling` is the same shape but has a home: `sprint140.md` Task 0. `styleBase` was the same
  shape and landed early, in `sprint145.md`, pulled forward of Sprint 140 because Sprint 146's
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
  `partPricing.classFactors`, `partsGeneration.minWorkBillFractionByTier`, the three
  `partsGeneration.zoneStates` severity tables and `diagnosis.symptomChanceByTier`, so all six
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
     optional. `partPricing.classFactors`, `minWorkBillFractionByTier`, `symptomChanceByTier` and
     the three `zoneStates` weight tables each need a fifth row too. Directive 22 sign-off needed
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
- [ ] **RESOLVED IN PART (sprint145.md): `styleBase` gives every car its own car-level style
  input, but stock style still tops out at 20, so the upper 80 per cent of the axis remains
  reachable only through bolt-on parts.** The retired flat `styleCap` (20 for every stock car,
  a Countach and a Wagon R scoring level) is gone; `CarModel.spec.styleBase` now differentiates
  every car, authored 4 to 20 for all 94 roster rows. That range is a deliberate restraint, not
  an oversight: rescaling those 94 judged values is authoring work, and the right time to do it
  is with the appraisal screen in front of a reviewer and a stancer buyer actually shopping, not
  as a wiring change. Landing the mechanism first means the eventual retune is one column in a
  spreadsheet rather than a code change. Revisit once the appraisal screen exists.
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

## Open balance/economy questions

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
  **Re-measured Sprint 133 (the re-tier): 14 of 26 models now favour parting, up from 11.** The
  re-tier was expected to shrink this and did the opposite, for the reason the classFactors item
  above sets out: eight cars got a dearer parts basket against an unchanged book value, and the
  parted yield scales with part prices while the whole-car value does not. `usedPartSaleFraction`
  is still untouched. The lever to decide first is the class ladder, not this fraction.

## Planned systems (designed, not yet scheduled)

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
  outright, not moved) - see `docs/sprints/sprint135.md` and `docs/sprints/sprint136.md`'s own
  Exits for what landed and what each moved. **Sprint 137 (the forced-induction return curve) is
  implemented and ready for review, not yet committed**: see `docs/sprints/sprint137.md`'s own
  Exit for what landed and the one genuine open finding (a pre-existing cross-category value-per-
  yen defect, unrelated to this sprint's own two levers, recorded separately above under "Open
  balance/economy questions"). 134 needed nothing.

  Blocking decisions, all recorded in the doc. Constraint A (section 17): the
  forced-induction return curve must not ship before the support ratios, because increasing
  returns on its own is a new dominant strategy. **Constraint B is resolved and the resolution
  changed the arc's shape (maintainer, 2026-07-29): cohesion reaches value through
  RELIABILITY**, not through a separate buyer-selection path. Reliability becomes the build's
  coherence times its condition, and because reliability is already 57 per cent of a
  first-timer's taste and zero per cent of a stancer's, buyer selection falls out of the
  existing valuation code with nothing built for it. Sprint 138 now measures a running system
  rather than a hypothesis, and sprint 139 shrank to the question of whether building well also
  deserves a premium, which may be answered "no" and closed unbuilt. And section 7b's
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

  **So machining is where the ceiling is meant to rise, and it has to rise SELECTIVELY.** A flat
  machining multiplier is the wrong shape: at x2.4 the Supra reads a correct 778 PS and the GT-R
  672, but the 13B lands at 612, the 3S-GTE at 586 and the EJ20 at 600, all well past what those
  engines really did. **Raising `powerFraction.forced` to close the gap is therefore explicitly
  the wrong lever and must not be proposed as the fix**, since it corrects two cars and inflates
  five. What machining needs is **per-engine headroom**: a block that can be bored, decked and
  filled has more of it than one that cannot, and that is a property of the engine rather than of
  the part bolted to it. It is also the mechanism that finally makes the legendary blocks
  legendary in the game the way they were in life. Decide the shape of that headroom when
  machining is scoped, and push it high enough that a fully machined 2JZ reads credibly (800 plus)
  without widening a fraction that applies to everything.

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
  different engines. Riding with it: aspiration is stored twice and the two are unguarded
  (`hasForcedInduction` reads the `Turbo`/`Supercharged` tags, never `spec.aspiration`), and
  a swap changes aspiration, so that duplicate has to be collapsed rather than worked
  around. Step 1 of the doc's build order (author the engines as content, point
  `spec.engineCode` at them) is zero behaviour change, independently shippable, and worth
  doing whether or not swaps are ever built, because it also gives the tuning system the
  per-engine response character it needs. Four open questions remain: donor car or engines
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

- [ ] **The progression map is drafted (`docs/design/progression-map.md`, 2026-07-22): the
  factual board for the mid-game design session, holes ranked.** Headliners: the
  collector-network auction tier has no unlocking guarantor mission yet (Sprint 115 shipped
  guarantor unlocks for regional/premium; the collector persona Kurogane and mission
  the-quiet-crate are written, byte-verbatim, in `docs/sprints/sprint115.md` section 5, but
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
