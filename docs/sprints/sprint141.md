# Sprint 141: the dyno screen

**Status: AWAITING SIGN-OFF AND ONE MAINTAINER RULING.** Opens after Sprint 136, whose
support ratios are the thing this screen displays. Eighth of nine in the tuning overhaul arc.

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

**This doc is written for option 1**, because it is the only one that needs no new mechanic,
and the tasks below change if another is chosen. **Do not implement until this is settled.**

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

## The levers (UNAPPROVED, directive 22)

### Lever 1: does a dyno session cost money as well as a labour slot?

Design 18 question 4 leaves this open. **Proposed: yes, a flat fee.** A labour slot is the
player's own time; a rolling road is somebody else's equipment, and a free measurement makes
the always-on warning from Sprint 136 pointless because the player would simply dyno
everything.

**Proposed value: to be set by the maintainer.** It should sit near a day of workshop
overhead so it reads as a real decision on a cheap car and as noise on an expensive one, but
**this doc proposes no figure**, because pricing sits under directive 22 and a number
invented here would be exactly the unlisted lever the directive bans.

### Lever 2: is the dyno a hire or a facility?

**Proposed: a hire, priced per session**, on the same footing as `machineShopAssist`, which
is basic tool hire and is scoped and priced as such.

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

## Hard constraints

- **The GDD conflict is settled before implementation starts.**
- **No second job system, no second support derivation.**
- **No slider that writes a value nothing reads.**
- **No reflex input.** A dyno session is decision-paced; there is no timing element and no
  bar to stop.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [ ] The GDD 5.4 conflict settled by the maintainer, the decision recorded here, and the GDD
      amended if option 1 or 3 was chosen.
- [ ] Levers 1 and 2 signed and recorded.
- [ ] A dyno session runs through the existing job system, costing one labour slot.
- [ ] The screen shows character, specific output, actual power, all five ratios, and the
      reliability split between condition and coherence.
- [ ] Displayed numbers provably identical to the sim's.
- [ ] The Sprint 136 warning, the car's reliability and its price are all unaffected by whether
      a dyno has been run.
- [ ] Checks run once each, output shown.

## Exit

_To be completed at the end of the sprint._
