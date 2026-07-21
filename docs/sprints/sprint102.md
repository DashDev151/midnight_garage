# Sprint 102: Every action carries a tunable labour cost

**Date:** 2026-07-20
**Source:** maintainer order, 2026-07-20: "I want to make sure EVERY action that the
player can do has a potential labour cost associated with it. And I want all of these
labour costs centralized in a single location in the config file... this includes the
current free actions like removals if I want to add costs to them. So fully configurable
system."

**Goal:** one config block (`economy.json` -> `energy.actionPoints`) holding a labour
figure for every physical player action; the sim reads costs only from there; every
action gates on the labour bar and spends when its figure is non-zero; **defaults equal
today's behaviour exactly**, so this sprint is a pure re-plumbing with a tuning surface,
verified by the golden masters not moving.

## Reuse analysis (directive 16)

**Existing mechanisms reused:**

- `economy.energy` is already the labour config home (`pointsPerLabour`,
  `basePoolPoints`, `energyPerGradeByTier`, `energyByClass`); `actionPoints` joins it -
  one location, as ordered.
- The gate/spend idiom already exists everywhere it matters: `laborAvailable` params
  and the `'no-labor-slot'` refusal are in place on removal paths ("stays for a future
  re-tune" was written into `resolveRemoveAssembly` for exactly this day); repairs,
  installs and recondition already gate and spend through the energy config.
- `refitLaborSlotsFor`'s equivalence rule stays the mechanism; its literal zero becomes
  the `refitUnchangedMember` knob.
- The loud-labour display idiom (price and labour written on the button) extends to the
  newly tunable actions, shown only when their figure is non-zero.
- Golden masters and the coherence/wage probes are the no-behaviour-change proof: at
  default values every hash and bound must hold untouched.

**Genuinely new:**

1. `energy.actionPoints` (schema-strict map, every key required) + audit-table row.
2. Gate + spend wiring on the actions that were hardcoded free.
3. Conditional labour captions for those actions when tuned above zero.

## The action inventory

Physical actions, each with its `actionPoints` key and its default (today's cost):

| Key | Action | Default |
|---|---|---|
| `removePart` | on-car "Take it off" | 0 |
| `removeAssembly` | pull an assembly to the bench | 0 |
| `refitAssembly` | the refit operation itself (per-member charges unchanged) | 0 |
| `refitUnchangedMember` | refitting a part exactly as it came off (equivalence rule, on-car and assembly member alike) | 0 |
| `benchFitMember` | fit a part into a benched assembly | 0 |
| `benchRemoveMember` | pull a member off a benched assembly | 0 |
| `benchBuildAssembly` | build an assembly from loose parts | 0 |
| `moveCar` | bay/parking moves (drag or button) | 0 |
| `scrapShell` | scrap a shell | 0 |
| `scrapPart` | scrap a part from the bin | 0 |
| `workup` | the owned-car full workup | 10 |
| `inspectionVisit` | starting a yard visit | 10 |

Already config-driven and unchanged: banded repair labour (`energyPerGradeByTier`),
install/refit-changed labour (`energyByClass`), bench recondition (same atoms).

**Classified non-physical, deliberately excluded** (no key; add on maintainer request):
bidding/buyout, buying parts and checkout, selling a part, accepting/rejecting sale
offers, accepting/declining calls, mission accept/grade/deliver, staff actions, tool
purchases, End Day. Diagnostic tests keep costing visit MINUTES, their own currency.

## Decisions

1. **Behaviour-neutral by construction.** Defaults reproduce today's costs exactly;
   `advanceDay` golden hashes, the tutorial probe, and the coherence/wage probes must
   pass UNCHANGED - any moved pin means a wiring mistake, not a re-derivation.
2. **Gate everywhere.** Any action whose figure is non-zero refuses on an empty bar with
   the existing `'no-labor-slot'` reason and spends `energySpentToday`. The wiring is
   live even while defaults are zero (a probe sets a non-zero value and asserts the
   gate fires, so the dials are proven connected, not decorative).
3. **The two knowledge actions come off `pointsPerLabour`.** Workup and inspection-visit
   costs move to their own keys (defaults 10, identical); their button labels read the
   action's own figure, so tuning one no longer tunes the other.
4. **Display law:** a tunable action shows "· N labour" on its control only when its
   figure is non-zero - free actions stay visually quiet, exactly as now.
5. **Copy dependency, flagged:** the walkthrough's "taking things apart is free" lines
   and the labour line in the engine step are TRUE AT DEFAULTS. If removal-family knobs
   are ever tuned above zero, the tutorial copy needs a pass in the same sitting - the
   sprint that tunes is the sprint that re-sweeps.
6. **Sprint 79's removal-free law is reframed, not repealed:** free removal becomes the
   shipped default of a knob rather than a structural fact. The bible's audit table
   records `energy.actionPoints`; the amendment log notes the reframing.

## Tasks

**Claude-implementable:**

- [ ] Content: `energy.actionPoints` schema (strict, all keys) + `economy.json` defaults.
- [ ] Sim: route the twelve actions through the map; gate+spend where non-zero;
      `refitLaborSlotsFor` equivalence zero becomes the knob; workup/visit read their
      keys.
- [ ] Game: store exposes the action figures; conditional "· N labour" captions on the
      affected controls; workup/inspect labels read their own keys.
- [ ] Tests: a dials-connected probe (set a knob non-zero in a context override, assert
      gate + spend on each action); golden masters and existing probes pass unchanged;
      schema/audit pins.
- [ ] economy-bible: audit row + amendment note (maintainer order 2026-07-20).

**User-only:**

- [ ] Tune at will; order the copy re-sweep when a removal-family knob leaves zero.

## Exit

- [x] Golden hashes byte-identical to pre-sprint: `advanceDay.test.ts` was not touched
      and passes with both hashes unchanged; tutorialProbe, coherence,
      valueModelProbes and storyMissionProbes all pass untouched. The sprint is
      behaviour-neutral at shipped tuning, as decision 1 demanded.
- [x] The dials-connected probe (`packages/sim/tests/actionPoints.test.ts`, 13 tests):
      all twelve keys proven to spend exactly their figure and to refuse on an
      insufficient bar, one key raised at a time; shipped defaults pinned (workup 10,
      inspectionVisit 10, the rest 0). Bots gate through the same figures
      (advanceDay's move/remove/scrap loops thread remaining labour).
- [x] Rider: `teardown.removeSlotsByClass` retired outright (schema, content, pins,
      doc references) - it was read by nothing once removal priced through
      `actionPoints.removePart`, and a dead knob beside a live one contradicts the
      single-location order. `teardown` keeps its two live anchors.
- [x] Narrow evidence once per file: 13 + 15 + 4 + 11 + 28 + 15 + 18 sim/content and
      53 + 38 + 19 + 8 game, plus the retirement ripple re-run (111 across four
      files) - all green. The pre-push hook on this batch's push is the full check.
      Uncommitted pending maintainer word.
