# Sprint 107: The room reacts (live-auction bidding dynamics)

**Date:** 2026-07-21
**Source:** maintainer design discussion, 2026-07-21. The live room's economics work but the
bidding is call-and-response against a silent number. The agreed rework: the room REACTS to
how the player bids - big jumps can scare it quiet or get called, habitual last-second
bidding earns a price response, dealers sometimes feud among themselves - and the player
gets real bid sizing instead of one fixed rung. Framing agreed explicitly: **we are faking
it, not simulating it** - every reaction is a seeded adjustment to the one clearing price,
plus authored theatre. All chances start conservative and are tunable from one block.

**One-line goal:** make the room feel alive and responsive through rare, legible, seeded
reactions layered on the single-clearing-price machine, with zero return to per-dealer
simulation.

**Sequencing:** independent of the diagnosis arc; lands between the slice (106) and the
authoring sweep (108) so the room improves for the next playtest while the slice verdict
settles.

## Reuse analysis (directive 16)

**Existing mechanisms reused (the machine survives whole):**

- The single clearing price (`clearingFractionFor`, drawn once per room) stays the one
  economic truth. Every reaction below is an adjustment to `clearingYen` or pure
  presentation; dealers remain flavour with no wallets, ceilings, or temperaments.
- `ROOM_TUNING` stays the single tuning block; reactions are one nested object inside it.
- The seeded stream + draw-order law (`enterRoom`, `scheduleRoomBid`, `tick`): reactions
  draw from the same stream at documented instants, so a room still replays identically
  from (entry, runIndex, action timeline).
- The fuse, the rung/step model (`stepBelowYen`/`stepAboveYen`), `nextRungYen`, the
  past-your-number marker: unchanged; bid sizing generalises the rung count, nothing else.
- `DemoLearned` carries what the player knows into the room; it gains one boolean.
- The room log is the theatre channel; drop lines and epilogues already live there.
- The machine test harness (stubbed rng, synthetic times): every reaction gets pinned the
  same way.

**Genuinely new:**

1. Player bid sizing: raise options in rungs (one tunable array).
2. A `reactions` block in `ROOM_TUNING` (all chances and magnitudes).
3. Four seeded reaction events: the scare, the call, the goad (rare, past the read), and
   the snipe tax.
4. One presentational event: the dealer feud burst.
5. Authored theatre copy per event.

## Design

### 1. Player bid sizing

The raise control becomes three options (one tunable array, e.g.
`playerRaiseOptionsRungs: [1, 4, 8]`): one rung, a firm bid, a statement bid, each labelled
with its yen result. The past-your-number danger state applies per option (any option whose
landing price tops the player's number shows danger). "Let it go" is unchanged. A raise of
`jumpRungs` (default 4) or more rungs above the current rung counts as a **jump** and can
trigger reactions.

### 2. The reactions block (starting values, all conservative, all tunable)

```ts
reactions: {
  jumpRungs: 4,             // a raise this many rungs up reads as a jump
  scareChance: 0.15,        // jump: the room loses its stomach
  scareLeftRungs: 2,        //   ...and has at most this many rungs left in it
  callChance: 0.12,         // jump: a rival answers with a jump of their own
  callRungs: 3,             //   ...this many rungs on top
  goadChance: 0.03,         // RARE: an inspected player's jump convinces the room it is missing something
  goadMaxLift: 1.06,        //   ...the goaded ceiling, as a fraction of the room read; once per room
  snipeWindowMs: 800,       // a player bid this late in the fuse reads as a snipe
  snipesBeforeTax: 2,       // snipes tolerated before the room gets irritated
  snipeTaxChance: 0.15,     // each later room response may then take two rungs at once
  snipeTaxRungs: 2,
  feudChance: 0.08,         // a wide board-to-clearing gap may play out as a dealer feud
  feudMinGapRungs: 6,
  feudRungs: 4,             // raises exchanged in the burst
  feudDelayMs: { min: 400, max: 1100 },
}
```

### 3. The four reactions (seeded adjustments to one number)

**The scare.** On a jump, chance `scareChance`: the room's stomach drops -
`clearingYen = min(clearingYen, boardYen + scareLeftRungs * step)`. The floor will counter
at most a rung or two more, then fold. Copy: the jump goes quiet through the row.

**The call.** Failing the scare, chance `callChance` (and only if the answering price still
fits under the clearing price): the next room response is a counter-jump of `callRungs`
rungs rather than one. No cap moves; it is tempo and nerve, not new money. Copy: the rival
does not blink.

**The goad (the rare sanctioned cap-break).** The standing law is that the room never bids
past its own read - the bots do not know what the player knows. Maintainer-approved
exception, deliberately rare: if the player has visibly inspected this lot
(`learned.inspected`, any test run on it) and opens with a jump, chance `goadChance` that
the room concludes "he knows something I don't" and lifts its ceiling:
`clearingYen = max(clearingYen, round(roomReadYen * lift))`, lift drawn in
(1, `goadMaxLift`], at most once per room. The player's actual number is NEVER an input -
the room reacts to the behaviour (inspected + jumped), not the knowledge, so nothing leaks.
Copy: a look passes down the row; somebody saw you under that car.

**The snipe tax.** Bids landed inside the last `snipeWindowMs` of the fuse count as snipes.
After `snipesBeforeTax`, each subsequent room response has `snipeTaxChance` to take
`snipeTaxRungs` rungs at once, still capped by the clearing price. **Price, not speed:**
the `bidDelayMs` band is untouched - punishing camping with shorter timers would demand
reflexes, and the teeth belong in the price. Copy: the clerk's patience thins; a dealer
bids like they mean to end it.

### 4. The feud (pure presentation)

When a room response is due and the gap between board and clearing is at least
`feudMinGapRungs` rungs, chance `feudChance`: the next `feudRungs` raises play out as a
rapid exchange between two named dealers on the short `feudDelayMs` band, with feud copy.
The rungs, the cap, and the destination are identical to the normal climb - it is the same
truth, paced as drama. The fuse still resets per raise and the player can bid at any point;
nothing about the player's own window shrinks (decision-paced law respected).

### 5. Determinism, knowledge, and the cap laws

- Every draw comes off the room's one stream at a documented instant (reaction draws happen
  inside the action handler that triggers them, in fixed order: goad, then scare, then
  call). Same entry, run index, and action timeline = same room, always.
- `DemoLearned` gains `inspected: boolean` (the demo sets it when any test ran on the lot;
  at promotion the live lot's `runTestIds` is the same signal for free).
- Cap law, tested: **without the goad, the room never pays past its read** (clearing stays
  under `clearMax` x read as today; scare only lowers, call never raises the cap, the tax
  respects it). The goad is the only path above the read, requires inspected + jump, fires
  at most once, and is bounded by `goadMaxLift`.

### 6. Copy

Every reaction line is authored theatre (era band 1995-2005, content bar, personally swept
by the orchestrator). Reaction copy is the entire player-facing explanation - no meters, no
mood bars, diegetic only (art-direction law).

## Decisions

1. **Fake it, do not simulate it** (maintainer framing): one clearing price, seeded
   adjustments, authored theatre. Per-dealer economics stay deleted.
2. **The goad is the sanctioned rare break** of the never-past-the-read law: behavioural
   trigger only (inspected + jump), never the player's number; once per room; bounded;
   ~3% to start.
3. **Snipe punishment is price, not speed.** Timer pressure stays constant; camping costs
   rungs, not reflexes.
4. **Feuds are theatre** over the identical climb - the game only SEEMS to have deeper
   systems, which is the point.
5. **All chances conservative and centralised** in `ROOM_TUNING.reactions`; the maintainer
   tunes one block.
6. **Content-law note for the promotion:** `ROOM_TUNING` (including reactions) is code-side
   while the room is a dev demo; the Sprint 100 promotion must carry the whole block into
   `packages/content` JSON per the content law.

## Tasks

**Claude-implementable:**

- [x] Machine: `playerBid` takes a rung count; raise options array; jump detection.
- [x] Machine: the scare, the call, the goad (with `inspected` on `DemoLearned` and the
      once-per-room latch), the snipe counter and tax; draw order documented in the module
      comment.
- [x] Machine: the feud burst (pacing + attribution only).
- [x] UI: three raise options with yen labels and per-option past-number danger; demo
      screen passes `inspected`.
- [x] Copy: theatre lines per event (scare, call, goad, snipe tax, feud), swept personally.
- [x] Tests: stubbed-rng pins per reaction; the cap-law guarantee suite (no goad -> never
      past the read; goad preconditions, once, bound; delays untouched by the tax; feud
      changes pacing only).
- [ ] Docs: `docs/design/live-auction.md` gains the reactions section with the odds table.

**User-only:**

- [ ] Playtest: do the reactions read at these rarities, or vanish? Tune the block.

## Exit

- [x] Machine shipped: `ROOM_TUNING.reactions` (all conservative starting chances) plus
      `playerRaiseOptionsRungs [1, 4, 8]`; `playerBid(room, nowMs, rungs = 1)` with jump
      detection at `jumpRungs`; scare / call / goad / snipe tax implemented as seeded
      adjustments to the one clearing price; feud as pure pacing (single-rung raises,
      alternating attribution, feud delay band, same destination). Draw-order law
      extended and documented in the module.
- [x] One deviation caught in orchestrator review and fixed: the first implementation
      gated feud starts on player jumps (a staging-compat artefact), which contradicted
      the design (rival-versus-rival drama needs no player). Un-gated: the
      feud-eligibility draw runs on every scheduled room raise; the machine pins that
      legitimately moved were re-derived from real deterministic runs. The re-pinned
      packed-war test is the proof: with zero player bids the room's own climb ignites a
      feud and the hammer goes to a different dealer at the same clearing price.
- [x] The goad is the only path past the read, and it is proven: a seeded multi-room
      guarantee test asserts no room-attributed bid ever lands above the room read
      without it; the goad itself requires an inspected room and a jump, fires at most
      once, and is bounded by `goadMaxLift` x the read. The player's number is never an
      input anywhere.
- [x] Snipe tax is price, not speed: the taxed response takes extra rungs, the delay band
      is untouched (asserted).
- [x] UI shipped: reserve bid when nobody has bid; otherwise one button per raise option
      with its landing price ("Raise to ¥X"), per-option danger past the player's number
      (verified straddle in tests: rung 8 danger while rungs 1/4 stay primary);
      `inspected` derived from the lot's actual `runTestIds` at seat time.
- [x] Copy: all five theatre lines authored by the orchestrator and verified verbatim in
      the shipped machine (5/5 grep-exact).
- [x] Evidence: machine + screen tests 44 passed; full game project 50 files / 627
      passed; `pnpm typecheck` clean. Uncommitted, pending maintainer word; the pre-push
      hook is the full gate.
- [ ] Open: the `live-auction.md` reactions section (with the odds table) lands with the
      post-playtest tuning pass, so the design of record captures the tuned numbers, not
      the pre-playtest starts.
