# TODO

Deliberately deferred items that are **not** tied to any specific future sprint number, so they
won't surface again just by reading `docs/sprints/sprintXX.md` in order. Check this file
separately when planning a new sprint. (Deferrals that already have a sprint number attached live
in their sprint docs instead and aren't duplicated here.)

**This file holds only what's still open.** Once an item is fully resolved, it's removed outright -
the sprint doc (`docs/sprints/sprintNN.md`) or the commit that picked it up is the permanent
historical record; this file doesn't re-narrate it. (Last full pass: 2026-08-13, covering sprints
182 to 197 and marking the entries the economy overhaul brief,
`docs/reviews/economy-overhaul-brief.md`, now owns; the previous pass was 2026-07-11. See `git log`
for every sprint's commit hash.)

## Playtest status

The playtest happened 2026-07-11 (raw notes: `docs/playtest-notes/playtest-notes-2026-07-11.md`). Its triage
produced the Loop Rework arc, Sprints 25-31 (`docs/sprints/sprint_archive/sprint25.md` onward), which now
carries every finding; per this file's policy those items live there, not here. The one item left
from the old checklist, exporting a real session log (`SaveMenu.vue` -> "Export session log"), is
folded into the recorded-play entry under Standing concerns: they are one request, and the brief
now owns both.

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

- [ ] **Labour needs to become more valuable (maintainer note, 2026-08-13).** Surplus labour
  currently makes "one more End Day click" the answer to everything, so the cash-versus-labour
  choice created by the Sprint 202 machine-gate conversion (machine-less work at a labour
  premium, hire buys it back) has no teeth yet: a player with empty days always chooses labour.
  Give the player real reasons to prefer spending cash - things competing for the same day's
  points, or days that are expensive to spend. Design conversation, no sprint attached.

- [ ] **SUPERSEDED AS A TASK by the economy overhaul brief
  (`docs/reviews/economy-overhaul-brief.md`), workstream A.** The harness is not rewritten: it is
  replaced by scripted deterministic golden careers, which have no decision policy and so cannot
  drift into unrealistic play. Everything below stays as history, because it is the evidence that
  shaped workstream A and the reason policy bots are explicitly out of scope there. Read it as the
  case against the instrument, not as work waiting to be done.

  **THE BOT HARNESS NEEDS A FULL REWORK - it does not simulate real gameplay, and its
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
- [ ] **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream A2: the recorded-play idea and the old "export the session log" checklist item are one
  request, and the brief owns it.** A recorded session is the source material for the first golden
  career script, not the input to a derived bot ruleset. **Its only remaining dependency is the
  maintainer playing a session and exporting the log** (`SaveMenu.vue` -> "Export session log");
  nothing else in workstream A can start from real play until that file exists.

  The original framing, kept because the capture half is what shipped (user-proposed 2026-07-09):
  parse real play sessions into per-archetype statistical rulesets - rates and biases ("bids X%
  below book," "does these repairs, buys that part"), not literal replay, and **phase-aware** (a
  career can drift mid-run). Capture infrastructure (v0) shipped in Sprint 24 - a Dexie
  `sessionEvents` table, a `gameStore.ts` hook on every player action, a JSON export button - but it
  is capture only, and the derived-ruleset half is what workstream A replaces with a hand-authored
  script.
- [ ] **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream A: this is a bot-derived finding and it dies with the harness it was measured on.**
  Nothing here is a task once golden careers replace policy bots. Kept as history because it is one
  of the four measurements that condemned the instrument.

  **Handyman and Cautious Restorer have no realistic route to reputation, so Sprint 43's
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

- [ ] **MILEAGE IS INERT BELOW 60,000 KM, and that was accepted knowingly as a quick fix
  (maintainer, 2026-08-07).** Their words: *"We implement this fix. We note it in TODO to be fixed
  better later. This is a quick and dirty, but implement it."*

  The curve was flattened to 1.0 across 0 to 60,000 km because it used to peak at **1.05**, which
  meant a low-mileage car was worth **more than book**, and *"mileage on a car can never ADD value.
  Low mileage can only subtract less."* Flattening the top was the smallest correct fix: it moved
  only cars that were being given something and left the tuned high-mileage end untouched.

  **What it costs: an 8,000 km car and a 55,000 km car now price identically.** At the opening
  campaign year that is roughly three quarters of the auction board with no mileage signal at all,
  falling to about a third by the late game.

  **What a better answer would do**: keep book value as the ceiling, and still let genuinely low
  mileage be worth something, by declining gently across the band rather than sitting flat. The
  shape considered and set aside was 1.00 at 30,000 km falling to about 0.95 at 60,000 before
  rejoining the current curve. It was set aside because it reaches further down the population,
  cutting every car between 30,000 and 60,000 that the flat version spares, and that is a bigger
  economy move than the defect warranted at the time.

  Whatever replaces it, the schema now refuses a multiplier above 1.0, so the original defect cannot
  return.

- [ ] **THE RACE PARTS SHOP: scarcity as the gate, not tools (maintainer, 2026-08-07).** Their idea,
  recorded in their words: *"We remove all race parts from the normal parts shop, and create a new
  race specific shop. But a flaky one. Not every part is available for purchase every day, and not
  in unlimited quantities. We have a new race block that just came in, we only have two, so you
  better decide if you want one now, might be months before we get another shipment. This also fits
  in world: you don't go to your local back alley automotive parts store to buy bargain bin spark
  plugs AND full GT3 grade carbon parts. Different people sell these. So stock, street, sport parts
  available from day 1, race parts when you unlock the race shop."*

  **Why this matters beyond flavour: scarcity is a better gate on race parts than a tool tier is.**
  The signed grade rule (race needs its line at rung 2) is the current answer and stays; this would
  sit on top of it and carry most of the weight. A part you cannot get is a decision. A part you can
  buy but not fit is only a message.

  Mechanisms that already exist and would carry it: the classifieds listing window
  (`machineListing`, a gap of 4 to 8 days and a 3-day window) is exactly the "one thing at a time,
  sometimes" shape, and it now handles both tool rungs and shops through a `kind` discriminated
  union. Unlocking the vendor is a story mission, which is the shape the channel unlocks already
  use.

  Open when it is picked up: whether stock is per-SKU or per-shipment, whether a missed part returns
  at the same price, and whether the race shop is a room, a phone call or a place on the map.

- [ ] **The pre-push gate flaked once and could not be diagnosed.** On the tool-ladder push it
  reported `Test Files 1 failed (205), Tests 2 failed (4207)` and the hook's output was truncated
  before the failure block, so the file was never named. Two subsequent full `pnpm test:coverage`
  runs passed clean at 4207, and the push then went through.

  **Nothing was changed to make it pass**, which is the only reason this is a note rather than a
  fix: re-running until green is not a diagnosis. The suspicion is a timeout under load (the suite
  runs about 350 seconds, and `packages/sim/vitest.config.ts` already carries a raised
  `testTimeout` from when the roster doubled), but that is a guess.

  If it recurs, capture the failure block before anything else: `pnpm test:coverage` piped through
  a filter that keeps `FAIL` and the assertion lines, rather than the tail, which is what lost it
  the first time.

- [ ] **Should a tool purchase need reputation at all? (maintainer, 2026-08-07, deferred by them.)**
  Ruling the same day: tools are gated by money and never by scene standing, *"anyone can buy a
  tool. Doesn't mean you are good with it. The market decides."* Every tier 2 additionally requires
  `local` reputation and every tier 3 requires `known` (`toolLines.json`), which is overall
  reputation rather than scene standing, so it survived the ruling. Their instruction: *"keep normal
  rep gate for now, add note to investigate later."*

  The question when it is picked up: a reputation floor on a purchase is pacing, not fiction. A
  shop with the cash and no name can buy a lift in the real world. If the floor goes, tool pacing
  rests entirely on price and on the classifieds listing window, and both would want re-checking.

- [ ] **`economy.machining.operations` has outgrown its name.** It now holds three entries that are
  not machining: **corner weighting** (scales under an assembled car), **show fitment** (rolling
  arches and stretching tyres) and **underglow** (neon tubes wired off the ignition). All three are
  `performedOn: 'fitted-part'`, done on a built car rather than at a machine, and they appear on the
  car's own screen rather than in the machine shop.

- [ ] **The roll cage SKU does not exist.** Sprint 197 authored the lever that makes a cage a real
  decision rather than a strict upgrade (a daily-drivers handling `upper` of 0.60, measured: 0 of 48
  shipped cars cross it stock, 24 of 48 do once built, and 20 of those drop from `delighted` to
  `satisfied`). The part itself is content and was never written. Nothing else blocks it.

  The array is really "operations a shop can perform", and machining is one kind. Renaming it
  touches the schema, the content block, the approval hash, and every reader; it is churn on its
  own and belongs in whatever change next has reason to be in that block.

- [ ] **THE ART IS THE INTERFACE. CONFIRMED AS THE GOAL (maintainer, 2026-08-08).** Ruled on the
  description below: a room stops being a backdrop with a menu beside it and becomes the thing you
  operate. Click the lathe to machine, click the car on the ramp to open it, click the shelf to
  reach your parts.

  **This binds every future room sprint.** Any text panel built between now and then is work that
  this decision throws away, so a room sprint should either build toward it or build as little
  chrome as it can get away with.

  **The mechanism already exists one screen away and needs no new art plumbing.**
  `OverworldScreen.vue` hit-tests raw DOM `click` and `pointermove` against placement boxes through
  `overworldNav.ts`'s `locationAt(x, y)`, with a hover highlight drawn as a `Graphics` overlay
  outside the built scene, and a three-way `route | inert | action` result so a refusal can say why.
  `GARAGE_PLACEMENTS` already stores fixture centres and `garageFixtureSize` already gives sizes;
  `rooms.ts`'s own module doc calls them "the things a screen would hit-test against later".

  So the shape is a `garageRoomNav.ts` mirroring `overworldNav.ts`. What does NOT exist: any
  interactivity in the Pixi layer at all (zero matches for `eventMode`, `interactive`, `hitArea`,
  `pointerdown` across `packages/game/src/pixi`), and any live state in a room's art (the workshop
  floor's cars are hardcoded sample content).

- [ ] **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream C: this folds into the donor-lot and scrapyard design work.** It is the same question
  at a less extreme end - what a car's damage should look like when it is coherent rather than
  uniform - and workstream C has to answer it anyway to author the four donor routes. Do not scope
  it separately; the reasoning below is the input to that design doc.

  **A ROUGH CAR SHOULD BE ROUGH IN A WAY THAT MAKES SENSE, NOT UNIFORMLY ROUGH (maintainer,
  2026-08-08).** Their words: *"To an extent but not perfectly. You won't have scrap internals and a
  mint block. You won't have perfect dampers and junk springs. What is broken should make logical
  sense together. Also should not have all or 95 per cent of slots at the same quality likely, need
  variation."*

  **Measured today: 5.9 per cent of generated lots arrive with 25 or more of 28 slots at poor or
  scrap**, and a real seed reproduces a car with 26 of 28 at `poor` and nothing else anywhere. The
  cause is structural rather than tuned: `poor` spans a 25-point condition window and `worn` spans
  30, so once `conditionBaseline + jitter` lands inside one window every slot buckets identically,
  and `spendDamageBudget` then drops roughly ten more by one band each.

  **Two properties are wanted and the generator has neither:**
  1. **Correlation within a subsystem.** Internals and block should move together; dampers and
     springs should move together. Today every slot's jitter is drawn independently
     (`rng.int(jitterMin, jitterMax)` per slot in `generateAuctionCarInstance`), so nothing ties a
     subsystem to itself.
  2. **Variation across the car.** A flat wall of one band should be rare rather than routine. The
     zero-sum `patternConditionSwingPercent` (plus or minus 7) is the only spreading force and it is
     far too small against a 25-point band window.

  The damage pattern already knows which area of the car was hurt (`patternOffsetByPartId`), so the
  correlation half has somewhere honest to hang. Any fix moves `partsGeneration` levers and needs
  them signed by name under directive 22.

- [ ] **EVERY RENDERED ROOM IN THE GARAGE IS DECORATION (maintainer, 2026-08-06).** Their words:
  *"you have already drawn placeholder art for it. That does nothing right now. Note it for later.
  Goes for ALL rendered screens in the garage. They do nothing."*

  `GarageInteriorScreen` draws six rooms and `packages/game/src/pixi/garage/rooms.ts` carries nine
  scenes, and the art is a backdrop in every one of them. Nothing in a room is clickable as an
  object: each room offers a panel of text buttons that route elsewhere, and the workshop floor's
  cars are hardcoded sample content (`rooms.ts`) rather than live state. `warehouse-derelict` art
  ships and is never rendered at all.

  **This is a whole-garage question, not a per-room one**, and it wants deciding once: whether a
  room's art becomes the interface (click the machine, click the car on the ramp, click the shelf)
  or stays a backdrop behind a text panel. Every room sprint until then should assume the answer is
  coming and avoid building UI that would be thrown away by it.

- [ ] **Four independent implementations of repair-or-replace cost, and consolidating them is a real
  refactor (maintainer, 2026-08-06: "okay. real refactoring needed").** The rule is: walk the parts,
  `canRepair` ? `planPartRepair` : `stockReplacementPriceYenByClass`, accumulate cost and labour.
  It is written at `bands.ts` (`carCostToBandYen`, `groupCostToMintYen`), `plays.ts:161/170/175`,
  `balanceProbes.ts:431/487` and `serviceJobs.ts:270`.

  **They currently agree, and nothing asserts that they do**, which is the failure mode sprint 188
  was written for. It was deliberately left out of that sprint because it is not a copy deletion:
  three of the four are whole-car planners that also account labour, fit fresh parts and mutate a
  car, and **they disagree on labour on purpose** (`bands.ts` adds none, `serviceJobs.ts` adds
  install labour, `plays.ts` adds remove plus install). So the shared thing is the per-part
  decision and the two price atoms, not the loop around them.

  **No guard rule was added for it**, precisely so it would not drag an unscoped refactor into a
  consolidation sprint. Add one in the same change that lands the shared function.

- [ ] **`rollingWindowShareCap` (1.5) rewards having sold anything, not concentration (recorded by
  sprint186.md, deliberately not fixed there).** The word-of-mouth share term is
  `1 + share * (cap - 1)` where `share` is this scene's recent matched deliveries over every
  scene's, so a single matched delivery with nothing else inside the 14-day window takes the FULL
  cap. Since sprint 182 made a matched delivery genuinely rare (arrival-stage match rates now 0.0%
  to 4.5% per scene), the diluting case (a second scene also landing a matched sale in the same
  fortnight) is the unusual one, and a number meant to price deliberate single-scene focus now
  prices having sold at all.

  **This needs a mechanism, not a value**, which is why sprint 186 retuned the thresholds around it
  and left it alone: a smaller cap would only shrink a reward that is still being handed out for
  the wrong thing. The shape that would fix it is a minimum-delivery floor before the share term
  engages at all, so the cap prices sustained concentration rather than a single sale. That is a
  design question for the maintainer, not a retune.

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
  content question and a good one: **engine swaps, drift suspension, lift kits, NOS, race body
  panels, and underglow** (underglow has since shipped in sprint 197 as a `machining.operations`
  entry gating on the body and trim shop, so it is no longer waiting on this; the rest still is).

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

- [ ] **The whole-car "Replace" affordance on `CarDetailScreen` is dead for `bodywork`.** It still
  renders (`replaceInPlace` is true for the three shell carriers, `gameStore.ts`), but no SKU
  reachable in ordinary play can satisfy it: every aftermarket body SKU is zone-scoped and refused
  for the whole-car slot by `partFitsCar`, and the four stock carriers are delisted from the parts
  market (`isDelisted`, `PartsMarketScreen.vue`). The zone pipeline is the only live path to
  changing a panel. Left in place rather than removed, because whether the carrier should keep a
  whole-car affordance at all is the same decision as the one-way body kit entry below.

  The authenticity half of this entry is closed: `stocknessOf` (`derivedStats.ts:162-165`) now
  carries an explicit bodywork branch reading `panelsAreAllStock(car.zoneState)`, so a car wearing
  non-stock panels loses those 11 points.

- [ ] **GENERATION FITS ZONE-SCOPED PANELS INTO THE WHOLE-CAR `bodywork` CARRIER: about 5 per cent of
  lots are born wearing a part that cannot exist there (measured Sprint 191, flagged rather than
  fixed).** `indexAftermarketPartsByCarPartId` (`sim/context.ts`) indexes every non-stock SKU by
  `carPartId` WITHOUT excluding `zoneId` SKUs, which its sibling `indexStockPartsByCarPartId` does
  exclude, so `aftermarketPartByCarPartId[class].bodywork` resolves to whichever zone panel happens
  to come last in the file (a skirt kit, in shipped content). The generation aftermarket roll then
  fits it into the carrier slot. Measured on 600 generated lots: **32 of them**, e.g.
  `nissan-silvia-ks-s14` wearing `uncommon-frp-skirt-kit` as its whole body. `partFitsCar` refuses
  the same SKU on every path a player can take, so this is generation-only.

  **The one-line fix is obvious** (exclude `part.zoneId != null` from that index, exactly as the
  stock index does) **and it moves sim output**, which is why it was not taken in Sprint 191: the
  carrier falls back to the stock SKU, whose catalogue price is many times a skirt kit's, so the
  restoration bill and market value move on those cars, and the golden hashes with them. It wants
  its own change with the re-derivation done honestly. Sprint 191 closed the visible half only:
  `stylePercentOf` now reads the bodywork slot off the zones on a zone-model car, so those cars no
  longer collect style points from a body they are not wearing.

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

  **What is genuinely open is whether the work resumes.** A job whose machinery is not hired stays
  in `state.jobs` with `blockedReason: 'machine-line'` (`packages/sim/src/jobs.ts`). The day report
  now says so in plain words (Sprint 191 mapped all twelve `job-blocked` reasons to sentences in
  `dayLogFormat.ts`; this one reads "Work stopped: the machinery for that line is neither owned nor
  hired today"), so the player is told.

  **UNVERIFIED, because nobody has checked it: whether the job resumes if the machinery is hired
  again the next day, or whether it is wedged.** That answer decides whether this is a copy
  problem or a mechanic problem, and it should be established before anything is designed.

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
  `bodywork`/`paint`/`underbody` price through `bodyPartRepairBillYen` on every probe car exactly as
  they do on every generated one. The probes stopped reacting to the bodyshell price entirely (0 of
  26 probe bills move when `baseCostYen.bodywork` goes 28,000 to 140,000, matching 0 of 208 real
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
  money** (`bodyworkRepairBillYen`: beating and welding are labour and never yen), so taking a shell
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
  `baseCostYen.bodywork` 28,000 -> 140,000 were measured against it and move it by nothing: the count,
  the best case and the median gap are all identical before and after, because a strip's takings
  never include the body carriers (`bodywork` is `removable: false`, and a zone panel is not a slot)
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

- [ ] **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream F: this becomes a row in the lever census, and workstream H's basket inversion (9.9)
  proposes moving this exact ladder for a different reason.** Do not retune it in isolation; the
  measurement below is the census row's evidence.

  **`partPricing.classFactors` is now mis-calibrated against the tiers it prices, and that is
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
  no lever moves unlisted.
  **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream F:** this is a textbook dead lever and becomes a row on that census's kill list rather
  than something to bolt onto the next pace pass. A deletion is still a lever change (D7).
- [ ] **`spec.estimatedFields` is stale on several cars.** It still lists `fr` or `cd` as estimated
  where the value that landed is a panel reading. The roster's column is now copied straight from
  the spec book's own `est` list wherever the roster cell was blank, so the two agree on the newly
  built cars; the already-shipped ones still carry the older hand-written list. Fix them in the
  roster CSV and re-run `node scripts/generateCars.cjs`.
  (`zeroToHundredS`, the other half of this entry, was retired in Sprint 185: the generator does
  not emit it and the schema field is now unused by content.)
- [ ] **There is still no aero grade above `race`, and the headroom for it was opened
  deliberately** (`docs/design/systems/tuning-system.md` section 12, which records the gap;
  the acceptance target for the missing rung is in `docs/design/car-performance/README.md` 7g).
  The model has room above the top shipped grade and the part was simply never authored, so the
  top of the downforce ladder is unreachable with shipped content. It matters because
  mechanical grip tops out around 1.25 and the rest of the range is reached through aero: the
  missing rung is the missing top end of the whole grip scale.
- [ ] **Sprint 185 built the roster-to-content lineage; four things it surfaced are still open.**
  `scripts/importSpecBook.cjs` and `carSpecBookGuard.test.ts` are gone. `cars.json` is generated
  from the roster CSV by `scripts/generateCars.cjs` and guarded by
  `packages/content/tests/carsGeneratedFromRoster.test.ts`; `harnessReferenceTimes.json` is
  generated from the harness's own `lapsim-data.json` by
  `scripts/generateHarnessReferenceTimes.cjs`. What remains:

  **1. The Wagon R divergence, still deliberate.** The roster row reads `topSpeedKmh` 151 /
  `dragCd` 0.38 (no legal limiters ever existed) and `cars.json` reads 140 / 0.36, because syncing
  it moves the car's Hakone lap 0.0015 s outside the acceptance tolerance. Both the generator and
  the guard carry a NAMED exemption for exactly this one car and exactly these two fields; the
  entries come out together in the pass that re-validates the performance model, alongside the
  280 PS gentlemen's-agreement question below.

  **2. Four gaisha cars are authored but held back.** BMW M3 (E36), Lancia Delta HF Integrale Evo,
  Ferrari F355 Berlinetta and Lamborghini Countach LP5000 QV are complete roster rows with ids,
  tags, parody names and reconciled physics, but `builtInContent` is `no`. GDD 4.5 sources a gaisha
  only through the (unbuilt) Import Broker, and nothing in the sim reads `origin` yet, so shipping
  them today would put them in ordinary auction catalogues.
  `auctions.test.ts`'s own tripwire says so by name. They ship by flipping one column each once
  the Import Broker lands, or sooner if the maintainer rules that a gaisha may appear at auction.

  **3. The VW Golf GTI 16V (Mk2) is held back for one missing string.** Its roster row is complete
  except `parodyName`; the approved parody brand is VeeDub and the spec book's own id
  `vw-golf-gti-mk2-16v` is waiting for it. It is also gaisha, so item 2 covers it too.

  **4. Three shipped cars have no harness reference at all.** The Toyota Corolla AE91, the Suzuki
  Jimny JA11 and the Toyota Land Cruiser 70 LJ71 have no spec-book entry, so the calibration
  harness has never computed a lap for them and there is no known answer to check the shipped
  physics against. `harnessAcceptance.test.ts` names all three explicitly, in a list checked in
  both directions. They join the fixture when they join the spec book and the harness runs again.

- [ ] **The story-mission set is meant to roughly double, and most of the new ones are unlock
  events (maintainer sketch, 2026-08-06).** Ten missions ship today, paying 335 reputation between
  them. Against the rebalanced ladder (0 / 140 / 450 / 1150 / 2900) that is 11.5 per cent of a whole
  campaign and carries a player about three quarters of the way to `known`, which is the intended
  shape: missions are the early spine and then stop mattering. **The ladder was sized expecting this
  list to grow**, so adding these does not want a re-tune on its own.

  The sketch, unplanned and unscoped, recorded so it is not lost:

  - the tutorial story (exists)
  - **free ads unlock**, deliberately very early: *"fix up an Acty for a newspaper stand"*
  - regional auction unlock (exists)
  - premium auction unlock (exists)
  - weekend meets unlock (exists, `low-and-loud`)
  - tuner magazine unlock (exists, `street-power-street-manners`)
  - **dealer network unlock**
  - **collector network unlock**
  - **gaisha unlock**, which is the Import Broker and is what the five held-back gaisha cars wait on
  - **a handful of authored specific build requests, for worldbuilding rather than for unlocking
    anything**

  Note how many are CHANNEL unlocks: that is the same list the selling-channel ladder entry above
  asks for, so the two should be scoped together rather than separately. Each new mission is copy
  written to the "lived in Japan in 1995" bar, and its `reputationReward` is a directive 22 lever.

- [ ] **Authenticity is measurably the weakest of the five stats, and it just lost its only direct
  payoff (measured 2026-08-06).** Two figures, both taken against shipped content:

  | stat | share of buyer attention | weighted by the money those buyers move |
  | --- | ---: | ---: |
  | handling | 23.9% | 25.1% |
  | power | 23.5% | 24.6% |
  | reliability | 23.9% | 22.1% |
  | style | 19.1% | 20.3% |
  | **authenticity** | **9.6%** | **7.9%** |

  Only two of six buyers care at all: the Collector, whose champion it is, and Daily Drivers at
  importance 0.2. Every other stat is wanted by five or six.

  **Weighting by money makes it worse rather than better, which is the counterintuitive part.** The
  natural defence is that collectors are few but rich. Measured, the Collector is the
  second-CHEAPEST buyer in the game at a mean 1,832,917 yen against the Show Crowd's 2,496,932,
  because a Collector can only take a STOCK car (any build destroys the authenticity their gate
  reads) and the stock roster skews cheap, while the built-car scenes take the expensive metal.

  **And sprint 184 removed its compensation.** Concours was the one place authenticity paid the
  player directly, independent of who was buying; it now reaches them only through one archetype's
  taste. So a stat with its own design doc, its own derivation and a sprint arc behind it is doing
  under a tenth of the work.

  It is also the only stat that is effectively BINARY: 100 while stock, collapsing the moment
  anything is fitted. The other four move continuously with build quality, so a player can trade
  against them; authenticity you either keep or spend. Worth a look after the current arc, and the
  likely question is whether the Collector's market should reach further up the price ladder.

- [ ] **Age overrides care in generation, so a surviving classic can arrive as a wreck (maintainer,
  2026-08-06).** Their words on the reasoning that produced it: *"this logic is naive. how many hard
  driven poorly taken care of 2000GTs do you think there is?"*

  Found when the 53-car roster put two genuine classics into the flagship pool: a 1969 Toyota 2000GT
  and a 1970 Skyline Hakosuka. The collector network draws 70 per cent of its lots from that pool,
  and its project-grade rate went ABOVE premium's, 26.6 against 24.6 per cent, inverting a gradient
  the design leans on.

  **The care profile is not the problem: `careProfileByCulture` already reads `kyusha: cherished`.**
  The problem is that damage scales with age and mileage hard enough to outrun it, so a thirty-year-
  old car generates rough whatever its profile says. That is backwards for exactly this class of
  car: **a 2000GT that survived to 1995 survived BECAUSE somebody looked after it.** Survivorship is
  the whole reason a 1969 car is still on the road, and the model currently has it the other way up.

  **What is suspended meanwhile**: `auctions.test.ts`'s "the project-grade rate falls from the local
  yard to the collector network" no longer asserts the premium-over-collector rung. The other two
  rungs still hold and are still asserted, and the test carries a comment pointing here. Restore it
  in the same change that fixes the model.

  Any fix moves `partsGeneration.damageGrades` or the mileage curve, so the values need signing
  under directive 22 by name.

- [ ] **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream E, which may remove reputation as a player-visible mechanic entirely.** There is no
  point establishing whether a monotonic ladder has tension until the gate census says whether the
  ladder survives at all. **`reputation.tierThresholds` stays tabled until that memo lands**: do not
  tune a ladder that may be about to die. The reasoning below is an input to the memo.

  **INVESTIGATE: after sprint 184 nothing in the game can ever lower reputation (maintainer,
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
  `docs/sprints/sprint_archive/sprint184.md`: sales never fall because the buyer chose the car, but breaking a
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
- [ ] Split `gameStore` into domain stores (`useGarageStore` / `useAuctionStore` behind the current
  surface) - it's a fine façade now, but trending toward a god-store. `useStaffStore` landed in
  Sprint 82 (decision 6, `stores/staffStore.ts`): it owns the Staff Office view and the
  hire/dismiss/reassign actions, reading/writing the persisted staff data through `gameStore`'s
  exposed `gameState`/`dayLog`/`context`/`logSessionEvent`. The remaining garage/auction slices
  follow the same delegating-store pattern when they land.
- [ ] **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream A: bot-derived, and it dies with the harness replacement.** A scripted golden career
  fills whatever slot the script says it fills, so there is no policy left to teach.

  **No bot proactively fills a MISSING car-part slot, or weighs one as worse than merely worn
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
  retired when the derived carriers landed. `bodywork` (11 points) and `underbody` (1) were the same
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
  a set of body panels is currently the only modification in the game a player cannot undo. Two
  candidate fixes, neither taken: list the stock `bodywork`/`underbody` SKU in the parts market (it is
  delisted by `isDelisted`, `PartsMarketScreen.vue`, and now carries a coherent shell price), or
  harvest the replaced carrier into inventory. The second resells at `usedPartSaleValueYen`, so
  it is an economy question rather than a UI one.

- [ ] **`collector-network` never unlocks, so the top auction tier is unreachable in a real career.**
  An auction tier opens only when a delivered story mission names it through `unlocksAuctionTier`
  (`isAuctionTierUnlocked`, `catalogs.ts:29-40`), and `storyMissions.json` carries exactly two such
  missions: `regional` at 45 reputation and `premium` at 240. Nothing names `collector-network`, so
  it can never open, whatever the player does. A live content gap rather than a design question, and
  it is the mechanical half of the progression-map entry further down (which records that the
  collector persona Kurogane and the mission the-quiet-crate are written and were held out
  deliberately, because unlocking an empty tier is worse than the silence).

- [ ] **`statWeights.authenticity` sums to 99 across 28 slots in content, while three design docs
  say 29 slots summing to 100.** Measured on `parts-taxonomy.json`: 28 entries, 21 of them carrying
  an authenticity weight, totalling 99. `docs/carstats/authenticity.md`,
  `machining-sku-scoping.md` and `desirability-system.md` all state the other figure. Nothing is
  broken in play, because `stocknessOf` divides by the weight it actually finds, but the next person
  to reason about authenticity will trip on it. Pick a side and make the docs match content.

- [ ] **`StandingScreen.vue:62` still reads "Needs tier 3 of the tool line this operation uses".**
  `OPERATION_GATE_COPY`'s `tool-tier` string was written before the tool ladder rework changed what
  that gate means, so the copy now names the wrong thing to the player. A copy fix, but it needs
  someone to state what the gate says today before the sentence can be rewritten.

- [ ] **Two of sprint 185's four deliberately-failing tests were resolved and nobody recorded how.**
  Both were left red on purpose as measurements. The Honda Today tied the core-loop law in
  `plays.test.ts` and now sits in a `RATE_ORDER_EXEMPT` set (`plays.test.ts:129`); the Datsun 510
  overshot the aftermarket grip ladder at x1.509 against a 1.48 cap in `aftermarketPhysics.test.ts`
  and the cap is now year-dependent, 1.55 below 1975 and 1.48 above (`aftermarketPhysics.test.ts:254`).
  The suite has been green since sprint 188, so both were fixed in passing by whoever hit them. Each
  is a bound the game is measured against; **reconstruct why the exemption and the wider cap are
  correct before anyone trusts either bound again**, and record the answer where the bound lives.

- [ ] **`fearPremium` has three live references left in the condemned Python harness.** It was
  retired from the game in sprint 98 (the cause-weighted odds already carried the fear), but
  `tools/balance/src/balance/data.py:84`, `report.py:345` and `report.py:476` still name it, and
  `report.py:476` subscripts a manifest key no current export carries, so it would raise on contact.
  Dead code inside code that is itself condemned (directive 21), which is why it is a note rather
  than a fix: it comes out with whatever finally settles the harness's fate.

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

- [ ] **The three `matchedOnly` listing channels may be a trap rather than a gradient, and it wants
  measuring rather than tuning (found sprint 194, still open at sprint 197).** At the seed the
  economy bench was driven on, **no freshly generated lot matched any buyer's taste on any roster
  model**, so `tunerMagazine`, `weekendMeet` and `collectorNetwork` could not produce an offer on an
  unbuilt car at all: each listing burned an `offersSeen` tick and paid nothing. That is consistent
  with the champion gate's intent, that a car should need work before a scene wants it, but burning
  staleness against a structurally impossible sale is a trap rather than a gradient.
  **One seed is not a measurement**, and the bench is now the instrument that can settle it. Take
  the match rate across many seeds and models first; nobody should touch a value on the strength of
  the observation above.

- [ ] **`valuation.expectationByTier.flagship.beyondDiscount` is a placeholder and must NOT be
  pruned as dead code (maintainer, 2026-07-30).** It is 1.3, the return on work done BEYOND a car's
  expected condition band. A flagship's expected band is `mint` and `billAboveYen` is
  `billToMintYen - billToExpectedBandYen`, so on a flagship that subtraction is always zero and the
  1.3 multiplies nothing. It reads like a live knob and currently does nothing at all. It is a
  placeholder because `mint` is the top REPAIR band, so nothing can sit above it today, while
  machining is precisely a route to a part that exceeds its own original specification. Whoever
  makes `billAboveYen` reachable for a flagship owns turning this live; until then the value stays
  where it is, recorded here so nobody prunes it.

- [ ] **Does the reputation ladder still have tension now that nothing can lower it?** RULED and
  built 2026-08-06 (`docs/sprints/sprint_archive/sprint184.md`, progression bible fifth amendment): reputation is
  fully monotonic. A disappointed buyer pays nothing rather than taking anything away, the lemon
  penalty is gone with the lemon predicate, and `SERVICE_JOB_FAILURE_REP_MULTIPLIER` went with it,
  so **handing a customer's car back unfinished now earns nothing rather than costing anything.**
  The consequence was accepted deliberately, not discovered: **there is no longer any act a player
  can commit that costs reputation.** Strictly compliant with progression law 6 (no decay, no
  upkeep treadmill), and it removes the only downward pressure the progression system had. Two
  questions for play, not for arithmetic: whether the ladder still reads as something you can fail
  at, and whether monotonic reputation reads as generous or as weightless. The alternative is
  designed and deliberately not built - **(b) sales never fall because the buyer chose the car, but
  breaking a commitment you accepted still does** - and needs a fresh ruling before anyone
  implements it.

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

- [ ] **ACCEPTED, not open: `internals` and `block` still climb into better value per yen at the
  street rung, worst 1.335x (maintainer decision 2026-07-30).** Recorded so it is not re-reported as
  a defect. Arc rule 5 forbids the race rung being a better buy per horsepower than the street rung;
  on those two slots it still is, and the maintainer accepted the residue rather than author more
  price ladders, because a street rung is still cheaper in absolute yen. The fix, if it is ever
  wanted, is the treatment `ignitionEcu`, `forcedInduction` and `camsTiming` each received: give the
  slot its own `partPricing.gradeFactors` entry rather than the default ladder.

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

- [ ] **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream E.** The census reassigns every gate reputation currently holds before any decision to
  kill it, which subsumes route 1 below outright and makes route 2 a question about scene standing
  instead. Kept because the back-alley playstyle argument is the strongest statement in the repo of
  what the axis is FOR, and the memo has to answer it.

  **Reputation is a ratchet, so losing it costs almost nothing (maintainer, 2026-07-29).**
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
- [ ] **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream A: the purpose-built bot this asks for will never be built.**
  **Invariant #6 (first-timer resale speed)** - "first-timer buyers keep sub-¥500k Commons
  sellable within 7 days at book value or better" has no bot modelling first-timer-specific selling
  behaviour; `competentPolicyStrategy` (Sprint 23) sells via the generic clean/concours faucet, not
  this. If the invariant is still wanted, it becomes a curve assertion on a golden career, or a
  closed-form probe, not a strategy.
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
- [ ] **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream C, which answers the maintainer call this entry asks for: donors become a real
  generatable lot species sold through the scrapyard, and their value is realised by harvesting
  parts into the player's own builds rather than selling them for cash (D2).**

  **One correction the brief's own reasoning needs, because the measurement it leans on does not
  exist yet.** The brief calls the crossover "already measured per model by
  `teardown.donorBreakEvenBillRatio` and `computeDonorBalanceProbe`". It is not.
  `donorBreakEvenBillRatio` is a **hand-typed global 0.45** (`economy.json`), read only by
  `exportCareers.ts` in the condemned Python harness, and `computeDonorBalanceProbe`
  (`balanceProbes.ts`) never reads it: it builds an all-mint clean car through `buildCleanProbeCar`
  and asks whether a GOOD car is worth more parted, which is a different question. **The crossover
  instrument workstream C wants as its generation target has to be BUILT, not read.**

  **Donor-flow (strip everything, sell it all, scrap the shell) versus full-car repair-and-flip
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

- [ ] **Per-engine machining headroom: still wanted, still unbuilt, and now a sprint of its own.**
  The objection it came from is closed (the maintainer ruled for a flat rise in
  `powerFraction.forced` on 2026-08-02 and accepted the cars it inflates; sprint 168 landed all 96
  catalogue fractions against
  `docs/design/systems/machining-performance-table.md`). **What survives is the feature, not the
  objection.** Per-engine headroom is the mechanism that would make the legendary blocks legendary
  the way they were in life: a block that can be bored, decked and filled has more of it than one
  that cannot, and that is a property of the engine rather than of the part bolted to it. It needs
  authoring for all 94 roster rows under directive 24, which is why it is not a condition on
  anything else.

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

- [ ] **SUPERSEDED by the economy overhaul brief (`docs/reviews/economy-overhaul-brief.md`),
  workstream C, which is the scrapyard plus the donor-lot species and which answers three of the
  five blocking decisions below.** The brief's first task is a design doc that extends or supersedes
  `scrapyard.md`, so the reasoning here is the input to that pass rather than a separate scope. Note
  the correction recorded on the donor-flow entry above: the per-model crossover the brief treats as
  measured does not exist and has to be built.

  **The scrapyard (解体屋) is DESIGNED IN FULL and NOT IMPLEMENTED. The design of
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
- [ ] **RULING (Sprint 111): owned-car diagnosis stays workup-only and is not to be re-opened
  casually.** The routed, minute-budgeted tests are the yard's time game; at home the full afternoon
  is honest, so there is no routed diagnosis mode for owned cars. Recorded so the question does not
  resurface without cause.
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

- [ ] **The tutorial teaches on a car a 1995 campaign can no longer offer (surfaced by sprint 196).**
  The auction age floor means a model is not catalogued until `yearFrom <= currentYear - 3`. The
  Wagon R's window opens in 1993, so it becomes eligible at 1996, and the calendar only reaches 1997
  with reputation: a player therefore learns on a car they cannot buy until reputation tier 2. The
  tutorial itself is unaffected, since `buildTutorialLot` is RNG-free and never goes through the
  catalogue. But "here is how to fix one of these" followed by never meeting one is a content
  question, not a mechanical one, and it belongs to the maintainer: change the taught car, change
  the floor, or accept it.

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
