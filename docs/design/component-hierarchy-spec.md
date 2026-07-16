# Component removal and repair hierarchy - the teardown game

*Feature spec, v1 (2026-07-15). Status: NOT scoped into a sprint. Origin: maintainer scoping
notes 2026-07-15 ("Component Removal & Repair Hierarchy System"), expanded the same day per the
maintainer's instruction ("these are just a starting point for you to properly expand"). This
system REORDERS the planned arc: it lands after the parts-provenance rework and BEFORE diagnosis
and story missions, because both of those now build on its verbs.*

---

## The fantasy is the spec

You do not fix a clutch by pointing at it. You drop the exhaust, pull the box, and there it is,
on the bench, in your hands, and it is worse than you hoped. The car sits on stands with its
driveline out while the rent ticks. That is what working on cars is, and the game currently skips
it: every part is repaired in place, in isolation, as if the car were a menu.

## What changes

### 1. Repair moves to the bench

A part is no longer repaired while installed (with a deliberate exception for surface-class
parts, below). The flow becomes:

1. **Uninstall** the part (blockers permitting). It leaves the car and enters the player's
   inventory, carrying its provenance. The slot reads as missing (the Sprint 32 missing-slot
   machinery already prices and displays this).
2. **Repair on the bench** from inventory: the existing band-lift economy, gated by the existing
   tool tiers for that part category (the gate relocates, it does not change).
3. **Reinstall** the part, or any compatible replacement: the existing install machinery.

Any route to a working slot is legitimate: repair the original, buy a replacement, fit a better
part. Reassembling a car with a still-broken part is also legitimate; the sale machinery already
prices bands honestly.

### 2. The dependency hierarchy (data-driven)

Every part slot carries a `blockedBy` list in the parts taxonomy content: the slots that must be
empty before it can be uninstalled. Validation happens at the uninstall action, with the blocker
list shown to the player as the reason ("the gearbox is in the way").

Decisions, recorded:

- **Slot granularity.** The hierarchy operates on the EXISTING car part slots. The fiction may
  say "clutch" and "piston seals"; the mechanics stay on slots. Sub-part slots would multiply
  content, UI, and save surface for no decision the player actually feels.
- **Strictly linear, no OR-paths.** `blockedBy` is a flat list, all entries required (AND). One
  chain per part, maximum depth 2 in authored content. Multiple valid removal paths add solver
  complexity with no fun payoff at this granularity.
- **Three depth classes**, assigned per slot in content:

  | Class | Remove / install labour | Repair location | Intended slots |
  | --- | --- | --- | --- |
  | surface | 0 / 0 | in place (unchanged) | body, interior |
  | bolt-on | 1 / 1 slots | bench | brakes, suspension, electrics, tyres |
  | buried | 2 / 2 slots | bench | engine, transmission |

  Exact slot-to-class and `blockedBy` assignments bind to the real `ALL_CAR_PART_IDS` in the
  sprint doc; the canonical example chain is: transmission is buried and blocked by a bolt-on
  driveline/exhaust-adjacent slot, so the full clutch-fiction job costs the blocker off, the box
  off, the bench repair, the box on, the blocker on. Deep work is expensive because of the
  teardown, not the part. That is the point.

  **Amendment (Sprint 79, maintainer directive 2026-07-16).** The table's "Remove / install
  labour" column above (1/1 bolt-on, 2/2 buried) double-charged deep work: reaching `internals`
  cost 8 remove slots plus 8 install slots before any repair began. This amends the law the
  paragraph above states: **removal and like-for-like reassembly are now free at every depth
  class; labour prices only the IMPROVEMENT to a slot** (a repair, a replacement, an upgrade),
  never the logistics of reaching it. A `CarPartState.vacatedBaseline` (stamped on uninstall,
  cleared by any install into the slot) is what lets a matching refit skip install labour too -
  putting the car back together exactly as it was found costs nothing; a repaired, replaced, or
  upgraded part still costs the full class-based labour. Deep work is now expensive in proportion
  to the value added on the bench, never the teardown itself. See `docs/sprints/sprint79.md`'s
  Exit for the full before/after economics.
- **Machine gate.** Buried-class removal requires the appropriate garage machine (lift or crane)
  if one exists in the machine catalogue; bind to real machine ids at sprint scoping, and add no
  new machine if none fits. This is the "machinery tech tree realignment" from the scoping notes:
  the tool tiers keep gating bench repairs per category exactly as they gate repairs today, and
  machines gate access to buried slots.

### 3. Jobs become outcome-based

The job system stops prescribing actions and starts specifying end states:

- Old: "Repair the coilovers to fine condition" (an action the player must perform).
- New: "Coilovers must be in fine condition" (a predicate on the delivered car).

Each task becomes a condition predicate on a slot: `{ slot, minBand }`, plus a minimum part grade
where the task is an upgrade ("fit sport suspension" means grade at least sport AND band at least
fine). Completion checks evaluate the car's end state; the route (repair original, buy new,
cannibalise another car) is the player's business.

**This is the same predicate family as story builds.** One shared `Requirement` module serves
service jobs and story missions; the missions feature (story-builds-spec.md) inherits it instead
of building its own. Build it once, here.

**Customer parts go home, by provenance.** At job close-out, every inventory part whose
provenance records the customer's car as origin returns with the customer automatically (a log
line lists them). Selling a customer-origin part while its job is active is blocked at the sale
action. This retires the entire inference chain (Sprint 35 `customerJobId`, Sprint 61/68
`baselineInstalledPartIds`): outcome-based completion removes its task-tracking master, and
provenance removes its ownership master. Delete the mechanism.

## The parts donor (maintainer, 2026-07-15)

A consequence promoted to a design goal: buy a car cheap at auction BECAUSE it has a fatal part,
and rather than salvage it, strip it to the shell for parts. The verbs above already allow it
(uninstall, inventory, provenance); the fear discount already prices it (a seized-engine
non-starter hammers near scrap, and the healthy gearbox, suspension, brakes and interior are what
you are really bidding on); diagnosis makes it a skill play (an uninspected donor may hide more
than its fatal symptom, so the yard hour is what tells you what you are buying).

What it needs to work without eating the game:

- **The donor law (two-sided, closed-form).** Parting out must beat repairing only on
  fatally-broken cars, and selling whole must beat stripping on healthy ones. If the parts-sum
  ever exceeds a healthy car's whole value, buy-strip-sell becomes the optimal loop for every car
  and the restore game dies. Two new coherence probes, same instrument as the flip-margin rows:
  a *donor check* (fatal-cause anchor car cleared as a donor beats its repair route) and a
  *whole-beats-parted check* (every clean anchor car sold whole beats its strip route).
- **The used-part haircut is the tuning lever.** Pulled parts sell well below their in-car value
  contribution (content-tunable fraction by band and grade). Labour does the rest: a full strip is
  the sum of every removal chain plus days of rent plus the occupied bay.
- **Shell disposal.** A stripped carcass must not squat in a bay forever: a `scrap the shell`
  action pays a flat tier-keyed yen value from content and frees the bay. Always available on an
  owned car whose remaining parts the player accepts losing; the log line lists what went with it.
- **Provenance makes the pile readable.** Every pulled part records its donor ("pulled from the
  '89 donor, day 34"), which is the parts-inventory story the provenance rework promises.

Synergies, recorded: the existing `TODO.md` item "generated cars should sometimes arrive with
aftermarket parts already installed" gains value here (a crashed donor wearing race rims is
treasure) and should ride in this arc if scope allows; story missions gain a beat where the
cheapest route to a needed part is a whole donor car rather than the parts market. The parked
"salvage & restore parts" idea (maintainer's, separate expansion) is adjacent but stays parked.

## Economy consequences (must land in the same arc, not later)

- **Teardown labour enters the repair cost model.** The coherence table's repair labour and
  sensible-flip columns must include removal and reinstall slots; economy Law 1's margins are
  recalibrated against the new totals. Slot labour is time, not yen, so the cash effect arrives
  through rent-during-repair and wage-law margins, both already modelled in `coherence.ts`.
- **Service-job payouts price the teardown.** `deriveServiceJobPayoutYen` and the Law 6 wage
  probes must count the full chain (blockers off, part off, bench work, reinstalls), or deep jobs
  silently violate the wage law.
- **Harness disclosure.** No bot can plan a teardown (standing harness verdict in `TODO.md`);
  every bot-derived figure that touches repairs is disclosed as unreliable in the sprint doc, and
  verification leans on the closed-form probes.

## How it feeds the other planned systems

- **Diagnosis (diagnosis-spec.md, v2).** Uninstalling a part reveals its true condition: the part
  is in your hands. This REPLACES v2's "blind repair discovers truth mid-job" rule and its
  charge-then-refund awkwardness. The reveal now happens before the repair decision, with the
  labour already sunk: you pulled the box expecting synchros and found a chewed gearset, and now
  you choose repair, replace, or reassemble and sell honest. Auction-yard tests stay the cheap way
  to know before you own; the owned-car workup (1 slot, no teardown) stays the intermediate; the
  bench is the ground truth you pay slots to reach. Depth makes the information game price itself:
  tests on buried-slot symptoms are worth the most because reaching those slots costs the most.
- **Story missions (story-builds-spec.md).** Consume the shared `Requirement` predicates; no new
  grading machinery.
- **Parts provenance (TODO.md, maintainer-scoped).** Hard prerequisite. Every verb here consults
  origin (uninstall records it, close-out reads it, sale checks it). The provenance record should
  therefore carry at least: origin car id (or purchase channel), and acquisition day.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- The install machinery and fitment checks (part install flow): reinstall is the same verb.
- The Sprint 32 missing-slot model: a mid-teardown car is representable today, including its
  sale-price consequences. No new "disassembled" state.
- The band-lift repair economy and tool-tier gates: unchanged, relocated to inventory parts.
- The parts inventory and `PartCard` UI: bench repair is a new action on an existing surface (the
  full inventory UX pass stays a separate item, per the scoping notes).
- `coherence.ts` and the wage/flip probes: extended columns, same instrument.
- The provenance system (Sprint 70): consulted, not duplicated.

**Genuinely new:**

1. `blockedBy` + depth class + remove/install labour fields in the parts taxonomy content.
2. The uninstall verb (validation, labour, inventory entry, truth reveal hook for diagnosis).
3. Bench repair as an inventory action.
4. The outcome-predicate module (shared with story missions) and the job-completion rework.
5. The customer-part return rule at close-out and the active-job sale block.

## What this retires

- Repair-in-place for bolt-on and buried slots.
- `baselineInstalledPartIds` and `isCustomersOwnPart`, entirely (both masters replaced).
- Task-action tracking in service jobs (replaced by end-state predicates).

## Deliberately out of scope (recorded from the maintainer's notes)

- Per-part repair minigames / repair method variance: the bench uses the existing repair
  mechanic; variance is a future hook, scoped separately.
- The inventory management UX pass.
- The JDM-identity concern (the game reading as setting-agnostic): real, flagged, and parked in
  `TODO.md` for a separate session per the maintainer's note. Observation recorded there: the
  cheapest carriers are content, not mechanics (symptom/cause tables keyed to signature engines,
  period parts culture, the mission cast).

## Open questions from the scoping notes, resolved

1. **Do partially-disassembled states persist across save/load?** Yes. A teardown is ordinary
   state (empty slots plus inventory parts); it can span days, and rent ticking across a long
   teardown is intended pressure. A one-sitting rule would be a real-time constraint the game
   does not have.
2. **Multiple valid removal paths?** No. Flat AND list, strictly linear, v1.

## Definition of done

- Bolt-on and buried parts are repairable only from inventory; surface parts unchanged; the
  uninstall action validates `blockedBy` and shows blockers as the reason when refused.
- Depth classes, labour costs, `blockedBy` chains, and machine gates live in `packages/content`.
- Service-job tasks are end-state predicates via the shared `Requirement` module; the baseline
  snapshot mechanism is deleted; customer-origin parts return at close-out and cannot be sold
  mid-job.
- Coherence table and wage probes include teardown labour; Law 1 and Law 6 hold on the new
  totals; payout derivation prices the full chain.
- The donor law holds closed-form: the donor check and the whole-beats-parted check pass on the
  anchor inventory; the used-part haircut and shell scrap values live in content; scrapping a
  shell frees the bay and logs what was lost.
- Uninstall reveals the part's true condition (the diagnosis hook), behind a single exported
  function so diagnosis lands on it without rework.
- No em dashes, no decorative Unicode, yen throughout, all tunables in content.
