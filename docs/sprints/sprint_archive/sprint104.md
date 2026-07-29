# Sprint 104: The buying decision, made legible (auction demo III)

**Date:** 2026-07-20
**Source:** maintainer orders, 2026-07-20: rivals should have a lower ceiling so there is a
way to make money; the inspection should tell the player whether a car is under- or
overvalued, worth chasing or worth skipping because "it looks like a better deal than what
it actually is." After a data check, the maintainer chose the BLEND: rivals clear about
10% under the fair value, keeping a modest baseline margin while leaving room for genuine
traps.

**Goal:** turn the demo into a feel-complete prototype of the whole buying decision, so the
maintainer can feel a real margin and a real knowledge edge before either is committed to
the live economy. Two demo-local changes: rivals that clear ~10% under the fair value, and
an inspection that reveals the car's true worth with a plain verdict and a walk-away number.

## The data that set the model (why fair-odds, not pessimistic)

A probe over 417 symptomatic local-yard lots found that a single-part doubt drags a car at
most ~11% below its fair value (median under 1%). So a "trap" (a car the room bids up past
its true worth) can only exist if the wholesale discount is SMALLER than that downside
swing: an 18% cushion swallows every overvaluation and no trap survives (0 traps at 18%
under). Trap counts at a fair-odds read, by discount: 18% under -> 0 traps; 10% under -> 1;
5% under -> 2; 3% under (the live economy) -> 10. Fat steals (worth >= 1.2x the read)
number 9 at every discount.

Two consequences, both baked into this design:

1. **Fair-odds read, not pessimistic.** A pessimistic read (the room assuming the bad end)
   ALSO erases traps, because it lowers the read toward the very floor a trap needs to sit
   below. To keep a trap alive under a 10% cushion the read must be the fair value, exactly
   what the live economy already prices (`sheetGuideValueYen`). Inspection then reveals the
   truth above OR below it. This supersedes the earlier "pessimistic, not worst" choice,
   which the data showed cannot coexist with traps.
2. **Profit is a knowledge game with a thin cushion.** At 10% under, ordinary cars carry a
   modest margin, the steals pay well (upside is uncapped: best/mean up to 2.23x), and the
   single deepest lot is a genuine, if thin, trap. Making traps bite harder is a separate
   lever (how hard a doubt moves value), not touched here.

## The demo-first split (read this first)

Both changes are demo-local this sprint. Nothing touches the live economy, `economy.json`,
or any golden hash:

- **The wholesale ceiling is a live-economy change with a blast radius.** Lowering
  `AUCTION_WHOLESALE_FRACTION` (0.97 today) to ~0.90 across the board moves the `advanceDay`
  golden hashes and shifts the closed-form coherence and satisfiability probes (the only
  economic gate in force, directive 21 forbids bot careers). That is the Sprint 100 rework's
  job, tuned to whatever this demo settles. The demo uses its own local fraction.
- **The inspection verdict rides an existing mechanic (directive 16).** The diagnosis
  system already carries each symptom's rolled true cause and already narrows a player's
  read toward it (`playerEstimateYen`). This sprint does NOT build a second diagnosis
  engine. The demo abstracts the ACT of inspecting to one click standing in for a full
  inspection visit, and derives the read and the revealed truth from the real estimator.
  The read is `sheetGuideValueYen` itself, so the demo now prices exactly like the live
  game; the only economic deltas are the wholesale discount and the verdict legibility.

So: feel it here; commit the wholesale ceiling and the verdict into the live buying
experience in the Sprint 100 rework once the feel is right.

## Reuse analysis (directive 16)

**Existing mechanisms reused:**

- The Sprint 103 room machine wholesale: lobby, `enterRoom`/`tick` time-event model,
  temperaments, hesitation, fuse, drops, seeded per-run streams. The clock loop is untouched.
- The value seams for every number on screen: `sheetGuideValueYen` (the fair-odds read, the
  headline and the basis every rival bids off), the revealed truth (the estimator with the
  symptom resolved to its actual rolled cause), `bidIncrementYen`, the reserve fraction. No
  new valuation maths, only a choice of which causes to price.
- The diagnosis model's own truth: symptoms carry a rolled true cause; narrowing
  `remainingCauseIds` to it and pricing through the real estimator yields the true worth.
  The demo reads that, it does not reimplement it.
- The palette: `--mg-success` green for a better-than-feared verdict and the leader chip;
  amber for the board and a fair verdict; `--mg-danger` for a trap verdict, the fuse dying,
  and a bid past the walk-away.

**Genuinely new (all demo-local):**

1. Rival ceilings centred on `DEMO_WHOLESALE_FRACTION x roomReadYen`, so a normal room
   clears ~10% under the fair read and a good buy has real margin.
2. The inspection reveal: one action flips a lot from the read to the car's true worth, a
   three-band verdict, and a walk-away number.
3. Lot selection: from a fixed-seed catalogue, pick one clear steal (true worth well above
   the read) and the single genuine trap (true worth below what the room will clear).

## Design

### The room's read: the fair value

`roomReadYen = Math.round(sheetGuideValueYen(lot.car, model, state, context))`, the same
odds-priced value the live auction sheet shows. The whole room bids off it; none of the
rivals inspect. The truth can land above it (a steal) or below it (a trap).

### Lever 1: rivals clear at wholesale

```text
ceilingYen = round(roomReadYen * DEMO_WHOLESALE_FRACTION * bellNormal(1, wobbleSpread))
```

`DEMO_WHOLESALE_FRACTION` default 0.90 (rivals clear ~10% under the read). On a steal that
leaves fat margin; on the trap the room clears above the true worth (it overpays), which is
why the informed player walks. The single dial controls the whole feel; expose it loud.

### Lever 2: inspect to reveal, then the verdict

One `Take a closer look` action (the demo stand-in for a full inspection visit) reveals:

- `trueValueYen` - the car's true worth, from the real estimator with the symptom resolved
  to its actual rolled cause. May sit above or below the read.
- the verdict, from `gap = trueValueYen - roomReadYen`:
  - **better than feared** when `gap >= roomReadYen * VERDICT_BAND_FRACTION` - worth chasing.
  - **worse than it looks** when `gap <= -roomReadYen * VERDICT_BAND_FRACTION` - the room
    will overpay, let it.
  - **about right** otherwise - no edge either way.
- `walkAwayYen = round(trueValueYen * (1 - TARGET_MARGIN_FRACTION))` - the most the player
  can pay and keep the target margin. Once the next rung passes it, the bid control shows
  it in `--mg-danger` and says the player is past their number. On the trap the walk-away
  sits well below where the room is bidding, so the "let the room have it" call is legible
  even though the raw overpay is thin (the data caps how bad a doubt can be).

### The two lots

From a fixed-seed local-yard catalogue (widen N until both exist), by the ratio
`trueValueYen / roomReadYen`:

- **the steal:** the highest ratio - worth well more than the read. A genuine bargain.
- **the trap:** the lowest ratio, required to satisfy `trueValueYen < roomReadYen *
  DEMO_WHOLESALE_FRACTION` so the room genuinely clears above the true worth. At a
  fair-odds read and a 10% discount the data yields a single qualifying lot; that is the
  demo's trap. If none qualifies, widen N; if still none, report (do not fake one).

Keep the thin/packed turnout contrast: the trap in a packed room, so a crowd visibly tempts
the player to chase it.

### The epilogue

- won: the flip result against the true worth (clear profit, or a loss if the player chased
  the trap or overpaid past the walk-away).
- let a trap go: the reassurance that letting the room overpay was right.
- let a steal go: the gentle sting of a bargain missed.

### Copy (locked verbatim; cosy, British)

- Pre-inspection headline: `The room reckons {yen}.`
- Pre-inspection doubt note: `There's a doubt on it, and nobody's looked closely yet.`
- Inspect control: `Take a closer look`
- Reveal line: `Up close, it's really worth about {yen}.`
- Verdict better than feared: `Better than the room fears. Worth chasing to about {yen}.`
- Verdict about right: `About what the room reckons. Fair money, no edge either way.`
- Verdict worse than it looks: `Worse than it looks. Let the room overpay for this one.`
- Bid past the walk-away (caption under the bid control, only after inspecting): `Past your number.`
- Epilogue, won at a profit: `You flip it for {yen}. {yen} clear.`
- Epilogue, won at a loss: `You flip it for {yen}. {yen} down, one to learn from.`
- Epilogue, let a trap go: `You let it go. The room can overpay for that one.`
- Epilogue, let a steal go: `You let it go. Someone got a bargain there.`
- Epilogue, no-sale before any bid: unchanged from Sprint 103 (`Nobody moves. The lot rolls back.`).
- All Sprint 103 room-beat lines (opens/raises/drops/hammer/let-go-to-leader) unchanged.

## Decisions

1. **Demo-local, both changes.** No live-economy or golden-hash change this sprint; the
   Sprint 100 rework commits the wholesale ceiling and the verdict, tuned to this demo.
2. **Fair-odds read (`sheetGuideValueYen`).** The room prices the live-economy fair value,
   so inspection reveals the truth either side and a trap can exist under the 10% cushion.
   The earlier "pessimistic, not worst" idea is dropped: the data showed it erases traps.
3. **The REAL diagnosis, reused (directive 16), no fake reveal.** The demo drives the
   actual mechanic: a demo-local one-lot state carrying a full `inspectionVisit`, narrowed
   by the real `runDiagnosticTest`, its checklist from the shared `symptomChecklistForCar`
   getter (extracted into one `SymptomChecklist.vue` used by both the auction board and the
   demo), the player's number moving via `playerEstimateYen` as causes fall away. A first
   pass shipped a fake one-click "Take a closer look" reveal beside the real diagnosis and
   was rejected outright; it is deleted. Inspection is decision-paced (its own phase, no
   clock); only the bidding is timed.
4. **Three verdict bands.** Better than feared / about right / worse than it looks. Band
   width (`VERDICT_BAND_FRACTION`) is one dial.
5. **The walk-away is the "spend more?" answer.** A live marker: the bid control turns when
   the next rung passes it.
6. **The trap is real but thin, by the data.** The single deepest lot is the trap; the raw
   overpay is small because a doubt moves value by at most ~11%. Punchier traps need the
   symptom-severity lever, out of scope here and flagged for the maintainer.

## Tasks

**Claude-implementable:**

- [x] Machine: `DEMO_WHOLESALE_FRACTION` (0.90), `TARGET_MARGIN_FRACTION`,
      `VERDICT_BAND_FRACTION` in the constants block; the fair-odds `roomReadYen`
      (`sheetGuideValueYen`); rival ceilings on the wholesale centre; lot selection (steal
      highest ratio, trap lowest ratio and below the wholesale clearing); per-lot
      `roomReadYen`, `trueValueYen`, `walkAwayYen`, three-band verdict; an `inspect(room)`
      transition; the epilogue. All Sprint 103 timing logic intact.
- [x] Screen: pre-inspection headline + doubt note + `Take a closer look`; post-inspection
      reveal + three-band verdict (green/amber/danger) + walk-away; the live "past your
      number" marker; the epilogue in the outcome strip. Silhouette row, chip, fuse unchanged.
- [x] Tests: machine pins for the two selected lots (cars + four numbers + verdict), the
      trap sitting below the wholesale clearing, the wholesale-rebased ceilings, the
      walk-away arithmetic, the inspect transition, the three verdict branches, and the
      epilogue branches; screen tests on fake timers for the reveal, each verdict text, the
      past-your-number marker, and the epilogue.
- [x] sprint99.md / sprint103.md pointers updated to name this as the current demo.

**User-only:**

- [ ] Play both lots; tune `DEMO_WHOLESALE_FRACTION` and the band width; rule on the feel,
      on whether traps need to bite harder (symptom severity), and on committing into the
      Sprint 100 rework.

## Exit

- [x] Model corrected to fair-odds read (`sheetGuideValueYen`) + 0.90 wholesale after the
      data probe showed an 18% cushion (and any pessimistic read) erases every trap. The
      demo now prices exactly like the live economy; the only economic deltas are the
      wholesale discount and the verdict legibility, both demo-local, no golden hash moved.
- [x] The two lots, from the fixed-seed catalogue at N=400 (real cars, real numbers):
      - **Steal (thin room), Honda City E**, doubt `wheel-vibration` (true cause the cheap
        buckled rim, not the worn driveshaft the room fears): read 67,040, true 148,733
        (ratio 2.22), walk-away 126,423, verdict `better`. The player who looks can outbid
        the whole room (rival ceilings ~69k-77k) up to 126k and still clear a large profit.
      - **Trap (packed room), Honda CR-X SiR**, doubt `damp-passenger-footwell` (true cause
        the rotten bulkhead seam, the worse of two): read 252,041, true 224,415 (ratio
        0.89), walk-away 190,753, verdict `worse`. true 224,415 < 0.90 x read = 226,837, so
        the room overpays by construction.
- [x] The trap bites harder than a centre-clearing estimate suggested: in the seeded run-0
      the packed room's six dealers bid each other UP past the read to a hammer of 256,225
      (Ogata), an overpay of 31,810 (~14%) over the 224,415 true worth. The walk-away
      (190,753) sits far below that, so "let the room have it" is legible and correct. The
      raw loss is real, not the thin sliver the naive centre-clearing figure implied.
- [x] Personally traced (orchestrator, this sitting): machine and screen read; the read is
      `Math.round(sheetGuideValueYen(...))`; `verdictFor` is the three-band gap test;
      selection is steal=max ratio, trap=min ratio among room-overpays lots; wholesale 0.90;
      all locked copy verbatim in machine and template (headline "The room reckons", the
      three verdicts, the reveal, the epilogue branches); all Sprint 103 timing/hesitation/
      fuse/drop logic untouched. Hygiene sweep of all four files: no em dash, no sprint/date/
      playtest/maintainer reference in code.
- [x] Evidence, narrowest once (agent's single final run): `auctionRoomDemo.test.ts` +
      `AuctionRoomDemoScreen.test.ts`, Test Files 2 passed, Tests 31 passed. Machine stays
      coverage-included, screen excluded; router/DevConsole/vitest.config untouched.
      Uncommitted pending maintainer word, alongside the Sprint 99/102/103 batch.
- [x] Standing flag for Sprint 100: committing the 0.90 wholesale to the live economy moves
      golden hashes and the coherence probes; and traps only bite as hard as doubts move
      value (median under 1%, so most lots have little edge). Making inspection matter across
      more lots is the symptom-severity lever, out of scope here, recorded for the maintainer.
- [x] Inspection reworked from fake to real. The first pass shipped a one-click "Take a
      closer look" that teleported to the true value; the maintainer rejected it (use the
      EXISTING mechanic, not a stand-in). Rebuilt: the checklist was extracted into a shared
      `SymptomChecklist.vue` (auction board's own tests, 38, pass unedited), the demo runs
      the real `runDiagnosticTest` over demo-local state, and the player's number moves live
      via `playerEstimateYen`. Worked example: the steal (Honda City E, wheel-vibration)
      starts at "You reckon 67,040", and once tests resolve the doubt to the buckled rim it
      reads "You reckon 148,733" with the better-than-feared verdict; the trap (CR-X, damp
      footwell) resolves to "You reckon 224,415" with the worse-than-it-looks verdict.
      Three phases: lobby, inspect (no clock), room (timed). 69 tests green across the three
      touched test files. The store's `symptomChecklistForCar` was made public (additive,
      game-package only) to enable the reuse.
