# Playtest notes, 2026-08-13, session 2 (first open-play career, days 1-4)

**Session:** first full multi-day session ever recorded. Played on the Sprint 201 build
(tutorial off, one garage). Log archived at
`docs/playtest-notes/sessions/2026-08-13-day4-open-play.json`; the export contains TWO
careers interleaved (see finding 6): the new career is events 41-215. Maintainer verdict:
"big improvement in terms of playability... but I'm 4 days in and 100k in the hole."
Complaints: tool hire uneconomic at the entry tier; body panel condition hard to see; a
restored kei refused by the four-wheels mission with "one slot below" (suspected empty
forced-induction slot); no feedback on fitment order (brakes blocked by wheels, diff
blocked by driveline). Every finding below is code-verified, file:line in the trace
reports.

## The session in numbers

Bought the kei at ¥38,360 (after four diagnostic tests on the water leak). Near-total
teardown; ~10 bench reconditions to worn (¥0 hire, the bench is ungated); chassis repair;
all nine panels off and back on; three parts replaced. Listed day 3, sold day 4 via
accepted offer. Three service jobs completed paid. Fitment struggle visible in the raw
log: brakes staged and confirmed 4 times before the wheel assembly came off; differential
staged 5 times across two days, resolved by removing the fresh driveline and refitting it.

## Findings

### 1. The hole is the hire bill (economy finding; directive 22: no lever moved)

Machine hire is per line, per day (`machineShopAssist.feeYenByGroup`): engine ¥15,000,
drivetrain ¥18,000, body ¥14,000, interior ¥7,000, suspension ¥5,000, wheels ¥3,000. The
day-1 shop owns all six tool lines at tier 1 and zero machines, and gated slots (block,
gearbox, chassis, dampers, dashGauges, tyres bench-fit, panel installs...) need the
machine for install/remove/repair. A full kei restore therefore pays a MINIMUM of about
¥109,000 in hire (teardown ¥33k, chassis ¥14k, reassembly ¥62k), against roughly ¥8,400
of actual repair work (recondition = 10% of part price; entry classFactor 0.14 makes kei
parts cheap) and a ¥38,360 car. The reported feeling is arithmetically real: hire ran
~13x the repair spend and ~2.8x the car. The maintainer's -¥100k over four days is almost
exactly the hire bill: the flip itself (car + parts + repairs vs sale + three jobs)
roughly washed.

The structural shape: hire fees are FLAT per line while repair value scales with tier
(classFactors 0.14 to 0.90), so the same ¥15,000 engine day is 6.4x heavier at entry than
at flagship relative to the values it unlocks. Tier-2 machine purchases are unreachable on
day 1 by construction (rep gate `local` plus a listing window plus ¥150k-900k each).

**Open verification item:** whether the sensible-restore / no-free-lunch probes charge
machine hire against the flips they certify. If they do not, the "fixing always pays"
guarantee is currently measured without the largest real cost a day-1 player pays. To be
answered inside Workstream F's census, before any envelope is drafted.

**No lever is proposed here.** The named lever family for the eventual (post-instrument,
D12) conversation: `machineShopAssist.feeYenByGroup`, its per-day-per-line charging model,
and the tier-2 gating. The behaviour question for an envelope, in felt units: what should
the tool bill on a first kei flip cost relative to the flip's margin?

### 2. The four-wheels refusal was paint, and the game knew and did not say

Not the forced-induction slot: `isPartMissing` explicitly exempts an empty FI slot on an
NA model (`bands.ts:170-174`), the only exempt slot. The near-certain culprit: every
freshly installed panel is left at bare-metal finish (`planInstallPanel`,
`bodyPipeline.ts:1063-1079`), and the derived paint band takes the worst zone finish, so
reinstalling all nine panels yields paint = `poor`: exactly "1 slot below worn"
(`requirements.ts:247-250`). The check is diegetically correct (the car was in bare
metal); the failure is legibility, twice over: the refusal line does not name the failing
slot (the partId is in hand at the code site and discarded; the naming precedent exists in
`noLapTimeReason` in the same file), and zone/paint state is not clearly visible
(maintainer complaint 2 is the same defect).

### 3. Fitment order: staged blind, refused silently, erased anyway

`blockedBy` order rules are content (`parts-taxonomy.json`: brakes blocked by rims,
differential by driveline) enforced only at confirm (`installFitGate`, `jobs.ts:1145`).
Staging does not check them (`stageAction` gate list omits `occupiedBlockers`), the
blocked confirm charges nothing, creates no job, and unconditionally clears ALL staged
work (`stagedWork.ts:757`), which produced the stage-confirm-nothing-restage loop. The
refusal reason IS emitted with player copy ("something has to come off first to reach
it") but its only renderer is the collapsed event-log drawer. The symmetric feature
already exists for removals ("Take off X, Y first" on the button); installs never got it.

### 4. Body panel condition visibility

Maintainer complaint, upheld by finding 2 (the invisible bare-metal state cost the mission
delivery). Zone condition and finish need a first-class readable surface on the car
screen.

### 5. Session-log capture gaps (Sprint 198 intake)

Machine hire is the only recurring cash outflow not session-logged (`hireMachineLine`
pushes to dayLog only; every neighbouring cash action logs). `acceptOffer` carries no
price, `completeServiceJob` no payout, `checkoutCart` no contents. Reconfirms the Sprint
198 design decision: money truth comes from the sim's DayLog stream, never the UI event
log; the session log is the action script only.

### 6. The session table never resets

`clearSessionEvents` has zero call sites; a new career appends to the previous career's
events (this export interleaves the abandoned tutorial career, events 1-40, with the new
one). Natural fix site: `newGame()` (`gameStore.ts:5127`). Also worth stamping exports
with a career identifier.

## Triage

Findings 2, 3, 4, 6 are legibility/UI and capture fixes with zero lever content: proposed
as Sprint 202. Finding 1 is an economy finding: recorded here and in the lever census
intake; no value moves before the instruments baseline (D12). Finding 5 folds into Sprint
198 task 198.8. Events 41-215 of the archived log are clean golden-career source material
for Sprint 200 once 198's converter exists: G1 is substantially delivered by this session.
