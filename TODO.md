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

- [ ] **`four-wheels` no longer covers its own taught build: one lever, one number, ten seconds.**
  Measured fresh through `tutorialProbe` after the 2026-07-28 teardown retune: the taught build
  spends **134,912** against Yuki's **135,000**, leaving **88 yen** of designed profit, and the one
  sanctioned player mistake (sport rubber instead of stock, +3,100) puts it at **138,012**, over the
  cap by 3,012. `tutorialProbe` is consequently RED and was left red rather than moving a lever
  nobody signed. The cause is not a cost blow-out: cheaper parts made the scripted lot's
  restoration bill smaller, which made the car itself dearer, and the reserve rose from about
  104,000 to **112,832** while every part on the build got cheaper. This mission sits deliberately
  off the generic formula, so the fix is a hand-set number under the standing rule for this lever
  ("keep the margin as it was"). **142,000 would restore both properties**: the mistake absorbed
  with 3,988 to spare and a designed profit of 7,088, inside the (0, 15,000] band the probe
  asserts. **Maintainer call: bump `four-wheels` payout/budget 135,000 -> 142,000, or a different
  figure?**

- [ ] **The instant-buyout premium is now larger than any restoration can repay, on 24 of 26 cars.**
  `AUCTION_BUYOUT_PREMIUM` is 1.25, so buying a lot outright costs about 24% over its anchor value.
  Once the parts basket became a sensible fraction of book (2026-07-28), the value a full mint
  restoration can add fell with it, and on the Supra the median generated lot carries a
  276,520-yen bill whose restoration adds about 359,000 of value against a 574,000-yen premium.
  Measured across the roster as median (restored value - buyout price - bill) as a share of book:
  positive only on the City E (+3.0%) and the Sunny (+3.2%), and negative everywhere else, worst at
  the BNR32 (-15.1%) and the Supra (-14.1%). `valueModelProbes`'s full-flip probe is consequently
  RED and was left red: it asserts that this exact route profits most of the time, and it no longer
  does. Nothing is broken for a player who BIDS - the four-play ranking buys at the reserve and
  every model pays handsomely - so the honest reading is that the buy-it-now button is now a
  strictly losing acquisition rather than an impatience tax with a way back. **Maintainer call: is
  a buyout that no amount of work repays the intended shape, or does `AUCTION_BUYOUT_PREMIUM` want
  to come down?**

- [ ] **The aftermarket power ladder is ADDITIVE and class-invariant, so it cannot express a ratio
  target at all. Nothing was changed; the decision is open.** Sprint 130 measured it through the real
  sim rather than by summing the catalogue: a maximal LEGAL build adds a flat **+200 PS** to any car,
  because every engine slot's `statModifiers.power` is identical across all four fitment classes.
  Against a signed target of x1.80 that lands at x1.62 (Supra, Aristo), x1.71 (GT-R, Fairlady Z,
  Chaser), x1.80 (Impreza), x2.27 (180SX), x3.41 (Carina) and **x4.64 (Wagon R)**. Scaling the
  figures down would miss 1.80 on every car except the one it was scaled against; hitting it needs
  `statModifiers.power` to scale with the car's own stock power, which is a new mechanism rather than
  a retune, and Sprint 130 was explicitly told to use the existing path. The full table is in that
  sprint's Exit. **Maintainer call: is a flat +200 the intended shape, or does power want a
  proportional path?**

  Riding on the same decision: **`street-power-street-manners`'s power floor is a PROVISIONAL 180.**
  It was 235, authored against a 180SX believed to make 205 PS stock; the measured figure is 157, and
  180 is 235 scaled by the same 0.766 that car's own power moved by, so it preserves the designed
  difficulty but is a scaling rather than a design decision. Sprint 130 did NOT re-base it, because
  the ladder it is measured against did not move: the mission's own probe build (sport
  intake/exhaust/ECU/turbo) reaches 214 PS, +34 over the bar, exactly as it did before. It is the one
  mission threshold in the campaign that is NOT a `floor90(measured)` pin, and `storyMissionProbes`
  asserts it as a hand-set floor accordingly.
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
  **Re-measured Sprint 133 (the re-tier): 14 of 26 models now favour parting, up from 11.** The
  re-tier was expected to shrink this and did the opposite, for the reason the classFactors item
  above sets out: eight cars got a dearer parts basket against an unchanged book value, and the
  parted yield scales with part prices while the whole-car value does not. `usedPartSaleFraction`
  is still untouched. The lever to decide first is the class ladder, not this fraction.

## Planned systems (designed, not yet scheduled)

- [ ] **The scrapyard (解体屋), maintainer-proposed 2026-07-28. Captured in full at
  `docs/design/systems/scrapyard.md`; read that before scoping.** A new venue selling used
  parts and half-stripped wrecks, buying scrap and poor parts for weight money, and taking
  the shell so `scrapShell` becomes a transaction with a counterparty rather than an
  abstract payout. Its point is an outlet where luck and digging beat paying full retail.

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
  express looks-versus-truth. Five open questions are listed at the doc's end; none is
  answered.

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

- [ ] **"Drive My Car" test-drive mode** (`docs/design/parked/drive-mode-spec.md` v2, 2026-07-12).
  Drive a finished build before flipping it. **Post-launch, by the maintainer's standing
  2026-07-08 sign-off** (optional, zero gameplay weight - which is what keeps it inside the
  no-reflex-input hard rule rather than an exception to it; do not flag it as a rules violation).
  Slip-angle physics in `packages/sim`, Mode 7 chase cam in Pixi; a technical review found the
  architecture sound. Binding constraint before it ever enters a sprint, from the spec itself:
  **stat-linked, not twitch-linked.** Roadmap: Phase 7, post-launch.

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
