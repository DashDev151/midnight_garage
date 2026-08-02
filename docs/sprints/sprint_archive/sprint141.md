# Sprint 141: the dyno screen

**Status: RULED ON AND READY TO BUILD.** Its only dependency is met: Sprint 136 shipped
2026-07-30, and its support ratios are the thing this screen displays. Eighth of nine in the
tuning overhaul arc, and the last of it left to build.

Design reference: `docs/design/systems/tuning-system.md` section 14, and GDD 5.4.

## What this sprint builds

**The dyno sells precision, not the existence of a problem.**

Sprint 136 already shipped the always-on warning: a player who fits a big turbo and lists the
car without ever running a dyno is still told something does not add up. This screen replaces
that vagueness with numbers.

| | before the dyno | after a dyno session |
| --- | --- | --- |
| That something does not add up | **always visible** (Sprint 136) | unchanged |
| What it already cost you in reliability | **already applied** (Sprint 136) | unchanged |
| Engine response character | hidden | **shown** |
| Actual power as built | claimed | **measured** |
| Support ratios, by subsystem | hidden | **shown, with the shortfall named** |

**The dyno never changes the car**, and after Sprint 136 that is worth stating twice: the
reliability cost of an incoherent build is applied whether or not the player ever pays for a
session. The dyno buys knowledge, not outcomes.

You do not know how an engine responds to tuning until you put it on the rollers. That is
true in life and it is what makes the screen worth a labour slot.

## The GDD conflict, which the maintainer must settle before this sprint opens

**GDD 5.4 specifies the dyno as a tuning screen with "2-3 sliders, e.g. Boost versus
Reliability, Camber: Grip versus Tyre wear/Style". One of those axes now exists, one never
will, and the difference is what the maintainer is settling.**

- **Boost versus reliability is now a REAL trade** (changed 2026-07-29). An earlier draft of
  this doc said reliability was not a stat a slider could trade against. **That was true then
  and is false now.** Sprint 136 makes reliability the output of the build's coherence: more
  boost raises cylinder-pressure demand, the support ratio falls, reliability falls with it, and
  every buyer weights reliability. **The GDD's own example axis is the one the model actually
  carries.** What is still missing is not the axis but the *input*: power comes from discrete
  SKUs and there is no continuous boost variable to slide. A slider therefore still needs a new
  mechanic, but it is now a mechanic with something real on both ends.
- **Tyre wear does not exist and cannot.** Design section 9: nothing in the game degrades with
  use, because the player never lives with the car. A Grip-versus-Tyre-wear slider has no time
  in which to operate. **This half of the conflict is not resolvable and never will be.**

Design section 14 specifies the dyno as a **measurement** screen and says nothing about
sliders. **The GDD is canonical for mechanics**, so this is a genuine conflict between two
canonical documents and CLAUDE.md's rule is to flag it rather than pick a side.

**Three honest options, for the maintainer:**

1. **Measurement only.** Ship section 14's screen. The dyno tells you what you have built.
   Amend GDD 5.4 to drop the tyre-wear axis outright and to record that the boost axis is
   deferred rather than dead, recording the amendment in the GDD as bible changes require.
2. **Measurement plus one real slider.** Boost against reliability, exactly as GDD 5.4 named
   it: turn it up, make more power, watch cylinder pressure go red and the car become something
   only a stancer will buy. **It is honest, it is a genuinely good slider, and it needs a
   continuous boost input the model does not have**, so it is a real scope addition rather than
   a screen.
3. **Defer the slider** to whenever a continuous boost input exists (the natural home is the
   engine-swaps arc, where aspiration becomes a thing rather than a tag), and ship measurement
   now.

### The ruling (maintainer, 2026-08-02): OPTION 1, measurement only

**Dyno v1 is measurement only, with tuning features a possible later expansion.** The tasks below
were written for this option and stand as written.

The GDD amendment that follows from it, recorded here as its authority: **the tyre-wear axis is
dropped outright**, because nothing in the game degrades with use and that axis has no time in
which to operate; **the boost-against-reliability axis is deferred, not dead**, because Sprint 136
made reliability the output of build coherence, so the axis is real and only the continuous boost
input is missing.

## Reuse analysis (directive 16)

### Genuinely new

- **One screen**, and the job that opens it.

### Existing mechanisms reused, unchanged

- **`supportRatios` and `supportVerdict`** (Sprint 136). The screen displays them; it must
  not recompute them or apply a second interpretation.
- **`engineCharacterOf` and `specificOutputOf`** (Sprint 135), both exported for exactly this.
- **`computeDerivedStats`** for actual power as built.
- **The existing job and labour system.** GDD 5.4 says one labour slot. **Reuse the real job
  system. Directive 16 exists because a parallel job system was built once already**, and the
  Sprint 08 service-jobs rework is the standing warning.
- **The facilities system**, if the dyno is a facility rather than a hire.

### Must NOT be built

- **A second job system.**
- **A second support derivation, or any recomputation of the numbers Sprint 136 owns.**
- **A tuning slider that writes a value nothing reads.**

## The levers (APPROVED, directive 22, maintainer 2026-08-02)

**The dyno is a workshop tool**, presented alongside the six existing tool lines and behaving like
them: hire a portable dyno in per session, or pay once to own one and use it without limit
thereafter.

| lever | value |
| --- | ---: |
| hire, per session | **15,000 yen** |
| buy outright | **750,000 yen** |
| reputation to buy | **`known`** |

Break-even is 50 sessions, so hiring is correct early and owning pays off once a player dynos most
of what they build. A session costs a labour slot either way: a labour slot is the player's own
time, and a free measurement would make Sprint 136's always-on warning pointless because the
player would simply dyno everything.

**Structurally separate, visually identical.** `toolLines.json` and
`machineShopAssist.feeYenByGroup` are both keyed by `ComponentId`, the six part groups. A dyno is
not a component group and nothing is repaired in it, so adding it to that enum would ripple through
the parts taxonomy and every repair path to buy nothing. It therefore lives in its own small record
while **appearing in the menus as one more entry beside the six lines**, bought and hired the same
way. The player should not be able to tell the difference; only the schema knows.

**It must NOT be the player's own machine shop.** That is design section 4's avenue 3, it is
what gives tool tier 3 its missing purpose, and it is a separate feature with its own TODO
entry. Conflating the two forecloses it.

## Task breakdown

Written for option 1 above.

### Task 1: the job

A dyno session as a job in the existing job system: one labour slot, the Lever 1 fee, and it
produces a result recorded on the car instance. **Whether the result persists** (the car
remembers it was dynoed) or the screen simply computes on demand is a save-schema question:
pre-launch, per directive 19, that is a Dexie version bump and nothing else.

### Task 2: the screen

Shows, for the car as built:

1. **Engine response character**, in words, with its specific output in PS per equivalent
   litre. The rotary equivalency must be visible rather than silently applied, or a player
   with an RX-7 will think the number is wrong.
2. **Actual power as built**, against the car's stock figure.
3. **All five support ratios**, by subsystem, with the minimum marked and the shortfall named.
4. **The reliability the build is carrying**, and how much of it the coherence shortfall
   accounts for as against condition. **This is the screen's most useful single line**: it is
   the one place a player can see that the number they are being offered less money for is the
   build rather than the wear.

The art bible's diegetic-UI law binds: this is a rolling road in a workshop, not a dashboard.
Every control is an in-world object with a real pressed or active state. **If the art does
not exist, ship the plainest treatment that obeys the law and record the dependency**; do not
invent a modern-UI panel.

### Task 3: tests

1. **The screen's numbers are the sim's numbers.** The displayed support ratios equal
   `supportRatios(...)` exactly, and the displayed power equals `computeDerivedStats(...)`
   exactly. This is the test that prevents a second interpretation drifting in.
2. **A stock car reads 1.0 on every subsystem** and shows no shortfall.
3. **The dyno costs one labour slot** and cannot be run without one.
4. **The always-on warning from Sprint 136 is unchanged** by whether a dyno has been run. The
   dyno adds precision; it must not be the thing that makes the problem appear.
5. **The car's reliability, and therefore its price, is identical before and after a dyno
   session.** Strict equality, on a car with a collapsed build. The dyno sells knowledge and
   must never sell an outcome.
6. **The condition and coherence split shown adds back to the reliability the sim reports.**
7. **A rotary's displayed specific output is the equivalent-litre figure**, labelled as such.

### Task 4: checks

```text
pnpm test --project sim
pnpm test --project game
```

**Auction-demo warning (2026-07-30, standing rule across this arc):** if this sprint moves any part
price or bill threshold, `enforceMinWorkBill` (`packages/sim/src/auctions.ts` ~370-413) draws a
different number of PRNG steps and reshuffles every later lot in a seeded catalogue -
`packages/game/src/screens/auctionRoom.test.ts`, `auctionRoomDemo.test.ts` and
`AuctionRoomDemoScreen.test.ts` must be re-derived from a fresh seeded run, and
`pnpm test --project game` must be run before this sprint is called done.

## Hard constraints

- **The GDD conflict is settled before implementation starts.**
- **No second job system, no second support derivation.**
- **No slider that writes a value nothing reads.**
- **No reflex input.** A dyno session is decision-paced; there is no timing element and no
  bar to stop.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [x] The GDD 5.4 conflict settled by the maintainer, the decision recorded here, and the GDD
      amended if option 1 or 3 was chosen.
- [x] Levers 1 and 2 signed and recorded.
- [x] A dyno session runs through the existing job system, costing one labour slot.
- [x] The screen shows character, specific output, actual power, all five ratios, and the
      reliability split between condition and coherence.
- [x] Displayed numbers provably identical to the sim's.
- [x] The Sprint 136 warning, the car's reliability and its price are all unaffected by whether
      a dyno has been run.
- [x] Checks run once each, output shown.

## Exit

**BUILT 2026-08-02, ready for review.** Option 1 as ruled: measurement only, no slider, no
adjustment, no outcome the player can dial.

### What landed

**The rolling road is a workshop tool that is not a tool line.** `ToolLinesSchema` and
`machineShopAssist.feeYenByGroup` are both keyed by `ComponentId` and exhaustive over the six part
groups, so a dyno cannot go in either without widening the parts taxonomy for nothing. It carries
its own `economy.json` block (the three signed values) and its own `GameState.dyno` record: an
`owned` flag, a `hirePaidDay` day stamp (`machineHirePaidDayByGroup`'s shape with one entry instead
of six), and `sessionCarId`, the car on the rollers. In the menus it is one more entry beside the
six: a seventh column in the Upgrades tool wall bought with the same button under the same
reputation gate, and a seventh row in the car page's Machine hire panel with the same In-house and
Hired today chips. Only the schema knows the difference.

**A session is a job in the existing job system**, built the way `resolveReconditionLabor` is: a
real `Job` in `state.jobs`, one labour slot spent through `applyAvailableLaborToJob`, completed
through `completeJob`, logged as `job-created`/`job-completed`. No second job system, and no second
support derivation: `dynoReadingFor` calls `supportRatios`, `supportVerdict` and
`computeDerivedStats` and projects what they return.

**The reliability split is one derivation, not two.** `reliabilityBreakdownOf` (derivedStats.ts) is
extracted from `computeDerivedStats`, which now reads it: the stat and the sheet cannot disagree
because there is one formula. It returns the car's own `reliabilityBase` plus the three independent
things taking it below there, and `reliability + conditionLoss + coherenceLoss + intensityLoss`
equals the base exactly, which is what makes the screen's most useful line honest.

**The equivalency is visible.** `effectiveDisplacementCcOf` is extracted so the rotary's 1.8x and
the rotary test live in exactly one place; the sheet reports both capacities and says why, so an
FD owner reads 2.4 litres equivalent rather than a figure that looks wrong.

### One decision the doc left open, and how it was taken

**The reading derives live from the car on the rollers rather than freezing a snapshot.** Task 1
offered either. Live derivation makes "the display cannot drift" structural (the screen calls the
sim) instead of asserted, and it avoids persisting a dozen derived numbers. What keeps it honest is
the framing: one car is on the rollers at a time (the single-nullable-field shape `machineListing`
and `inspectionVisit` already use), and `advanceDay` takes it off at the day boundary exactly as it
clears an inspection visit. A session therefore covers the day it was paid for, and a build changed
while the car is still strapped down reads new numbers, which is what a car sitting on a set of
rollers should do.

**The hire is day-stamped, not per-operation**, matching a machine line's hire exactly: a second
session the same day rides the same fee. Break-even against the 750,000 purchase is therefore 50
days on which the shop dynos anything, rather than 50 sessions.

**Running a session does not navigate.** The row turns into a link to the sheet instead. A
programmatic push out of the car page races the screen's own "this car is gone, go to the garage"
watcher, and nothing should yank a player off a car mid-job.

### Tests, with directive 17 cases

New: `packages/sim/tests/dyno.test.ts` (18) and `packages/game/src/stores/gameStore.dyno.test.ts`
(10) and `packages/game/src/screens/DynoScreen.test.ts` (5). The central one is pinned hardest: on a
collapsed build (bare race turbo, worn, `dangerous`), the car object across a session is
`toBe`-identical, and stats, market value and the Sprint 136 warning are all unchanged. The
coherence cost is charged to a car that has never seen a dyno.

Three existing pins moved, all **case (a)**, none loosened:

1. `advanceDay.test.ts`'s acquisition-to-sale hash, `d280dc4d` -> `4dcee9b0`. A pure shape change,
   measured rather than assumed: `createInitialGameState` now seeds `dyno`, and this is the one
   script that starts from a real new career. Strip the key back out of the final state and the
   hash is exactly `d280dc4d`, so no roll, cash figure or derived stat moved. The 30-day master
   holds unchanged because it builds its own state literal.
2. `UpgradesScreen.test.ts`'s tool-wall counts, 6 columns / 18 nodes -> 7 / 19. The sprint
   deliberately adds a seventh entry; the count is re-asserted alongside a new test that buys the
   dyno through the wall and checks its reputation gate.
3. `saveCodec.test.ts`'s six "SAVE_VERSION is current" canaries, 54 -> 55. `GameState` gained
   `dyno` and `JobKind` gained `dyno-session`; additive and genuinely optional, so a Dexie/version
   bump and nothing else (directive 19).

`schemas.test.ts`'s economy key list and `economyApprovalGate.test.ts`'s hash are re-pinned in the
same change as the recorded approval of the three levers, per directive 22.

### Checks

```text
pnpm typecheck            content Done, sim Done, game Done
pnpm test --project content   27 files, 581 tests passed
pnpm test --project sim       81 files, 2100 tests passed
pnpm test --project game      65 files, 872 tests passed
```

No part price or bill threshold moved, so the standing auction-demo warning does not apply;
`pnpm test --project game` was run regardless and the three fixture files pass untouched.

### Outstanding

**The pixel-art rolling road does not exist.** The screen ships the plainest treatment that obeys
the diegetic law: a printed strip off the shop's own machine, read top to bottom, no gauges and no
dashboard, in the panel language every other screen uses. Recorded in `TODO.md`. Nothing about the
numbers changes when the art arrives.
