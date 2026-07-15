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

- [ ] **The auction provenance pool violates the content law** (deferred from Sprint 66, which
  planned to move it and did not). `PROVENANCE_POOL` in `packages/sim/src/auctions.ts` is authored
  player-facing copy (`"barn find, no history at all"`) living in code, keyed by
  `(ageBand, upkeepTier)`. It belongs in `packages/content` as `provenance.json` with a schema and
  a content test asserting every `(ageBand, upkeepTier)` cell has at least 2 lines. Sprint 66 kept
  its diff on the economy and left this behind; nothing depends on the move, it is purely the
  content law going unenforced on one constant.

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

## Next up (scheduled, NOT designed)

- [ ] **PARTS PROVENANCE, GROUND UP - a real system, replacing the ad hoc ownership rules**
  (maintainer directive, 2026-07-15). **Scheduled: immediately after Sprint 69.** *Not designed -
  the maintainer scopes this sprint. This entry records the diagnosis and the intent only.*

  **What is wrong today.** A `PartInstance` does not know where it came from. It is born with
  `{ id, partId, band, genuinePeriod }` and nothing else. Ownership - "is this part mine or the
  customer's" - is therefore never a fact the part carries; it is **inferred, after the event, from
  side channels**. Every bug in this area traces to that one absence, and every fix so far has been
  a patch on the previous patch:

  1. **Sprint 35** invented `customerJobId`: a mutable tag stamped onto a part at REMOVAL time,
     decided by **where the car happened to be parked** (`resolveRemovePart`'s owned-car branch vs.
     its service-job branch). Where a car is parked is not who owns a part.
  2. **Sprint 61** added `ServiceJob.baselineInstalledPartIds`: a separate snapshot, on a different
     object, recording which instance sat in each INSTALL-TASK slot at generation - built to answer
     a different question ("has a genuinely new part been fitted yet?", for `isServiceTaskDone`).
  3. **Sprint 68** discovered the Sprint 35 tag meant the game **confiscated parts the player had
     bought** (fit a part to a customer's car, pull it back off, and close-out took it), and fixed
     it by making the tag consult the Sprint 61 snapshot - patching one side channel with another.
  4. **Sprint 68 again, hours later:** that fix was itself wrong. The snapshot only covered
     install-task slots, so "no baseline for this slot" was read as "the player must have fitted
     it" - meaning on any job carrying an install task, the player could pull the customer's
     **engine** (a slot no task touches) and keep it. One theft traded for its mirror image, with a
     test asserting the wrong behaviour and confident wrong reasoning attached to it. Patched again
     by making the snapshot total over the car.

  Four passes, three mechanisms (`customerJobId`, `baselineInstalledPartIds`, `isCustomersOwnPart`),
  and the question is still answered by inference. The shape of the problem is visible in the
  numbers: a part can be born at exactly **four** sites (`auctions.ts`'s `stockInstanceFor`,
  `jobs.ts`'s removal-replacement stock instance, and two in `parts.ts`), **none** of which records
  an origin - while provenance is currently read or written across **nine** files
  (`jobs.ts`, `parts.ts`, `serviceJobs.ts`, `gameStore.ts`, `saveCodec.ts`, `PartCard.vue`, plus
  tests). Four places know the truth and throw it away; nine places try to reconstruct it.

  **What the maintainer wants built.** Provenance as a real, ground-up system rather than ad hoc
  rules:
  - **A part is linked to its car at spawn.** When a car is generated, every part on it is
    recorded as having come from that car - whoever owns the car, player or customer, no distinction
    at birth.
  - **Tracked centrally, and consulted by EVERY action** that touches a part (remove, install,
    scrap, sell, recondition, service-job close-out), rather than each resolver re-deriving
    ownership from whatever is nearest to hand.
  - **"Where did this come from" is answerable for any part in inventory, exactly.** A player should
    be able to look at a part and know its history - which car it was pulled from, or that it was
    bought.

  **The maintainer's framing, kept verbatim because it is the whole point:** *"We needed it from the
  start, not ad hoc rules to try and patch it... Doing this properly ground up eliminates all janky
  behaviour that you are trying to bandaid."*

  **Two notes for whoever scopes it.** (a) Directive 19 (no save backwards compatibility before
  launch) makes the schema change cheap - a version bump, no migration, no golden-save test, and no
  legacy-compat branch. This was materially more expensive a week ago. (b) `baselineInstalledPartIds`
  currently serves TWO masters - ownership (Sprint 68) and install-task completion (Sprint 61,
  `isServiceTaskDone`). A real origin record answers both, so the rework should expect to retire it
  entirely rather than leave it serving one caller.

## Planned systems (designed, not yet scheduled)

- [ ] **Story builds - outcome-based build commissions** (`docs/design/story-builds-spec.md`,
  2026-07-15). A customer names an OUTCOME, not a car. Spec'd, not scoped. **Blocked on one
  maintainer scope call before it can become a sprint:** does it extend the already-shipped
  `commissions`/service-job surface (in-GDD, canonical), or is it new enough surface to need an
  `IDEAS.md` entry plus a GDD amendment first? The v1.0 GDD feature set is frozen, so that call
  decides whether this is v1.0 at all. Roadmap: Phase 4, beside the commissions line.

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
