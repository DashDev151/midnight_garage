# Sprint 232: the tutorial retrace, the copy sweep, and the arc exit

**Status:** Planned
**Arc:** `repair-refactor-arc.md` sprint 9 of 9. Depends on all prior sprints.
**Scope:** verification and finish work. No new mechanics. Two tasks in this sprint are
explicitly NOT delegable to implementation agents (marked FABLE), per standing maintainer
rulings on tutorial sign-off and copy quality.

## Reuse analysis (directive 16)

Nothing new. This sprint verifies what shipped: the tutorial's scripted flow against the
new screens, the copy surface against the quality bar, the cost sheet against the till,
and the arc's own paperwork.

## Tasks

1. **Tutorial retrace (FABLE, personally traced, then agent-implemented fixes).** Walk
   every step of `tutorialSteps.json` and the scripted service job against the shipped
   UI: any step whose trigger or copy references the old repair surface (repair buttons,
   the workbench station, band-target clicks, machine-assist fees, the classifieds) is
   re-authored to the new flow (job cards, bench, trolley, hire panel). The trace is
   recorded step by step in this doc's Exit: step id, trigger verified against which
   data-test, verdict. No step is signed off that was not personally traced. The
   `tutorialProbe.test.ts` economics pins are re-derived if the taught flow's costs
   moved.
2. **Copy sweep (FABLE).** Personal pass over every player-facing string this arc added:
   workbench.json recipe copy and tool labels, the 228-230 locked copy, day-log lines,
   refusal notes, gate captions. Bar: the "lived in Japan in 1995" credibility test,
   Vimes-mechanic voice, British spelling, no cheese. Fixes land as normal edits with
   their tests' copy assertions updated in the same change.
3. **Financial reconciliation.** Play a scripted day in dev that: hires a line, hires the
   lift, runs a service, a rebuild (with parts bill), and a customer job payout; verify
   the OfficeScreen cost sheet reconciles to the till to the yen (hire fees under running
   costs, parts under the car's ledger, payout under income). Any discrepancy is a
   STOP-and-report defect.
4. **Day-report read-through.** One played day's log read end to end: aggregation lines
   render, no orphaned event kinds, no formatter branch throws on the new events.
5. **Arc paperwork.**
   - Tick any retirement-checklist stragglers in `repair-refactor-arc.md`.
   - Strike section A row 4 in `sprint_archive/sprint193.md` (closed by construction,
     sprint 225) and remove its line from TODO.md's archived-but-open list entry.
   - Lever ledger: status line updated to "R1 shipped in full, awaiting playtest".
   - CLAUDE.md: update the one-line current state (arc complete, next work = the
     maintainer's playtest of the new loop). Nothing else in CLAUDE.md moves.
   - TODO.md: add any items deliberately deferred during the arc (each sprint's Exit is
     the source; known candidates: the spec's board-tool ART pass once real art exists,
     and the old `repairMachineNoteFor` copy if any note survived in a dusty corner).
6. **Playtest handoff note (FABLE, short).** A one-page section at the end of this doc
   listing what to feel for, straight from the lever ledger's felt-behaviour column:
   the service/rebuild/restore rhythm, the one-hire-a-day planning pressure, slog pain at
   x3, the lift's daily lightness, tyre fitting's new cost, mint behind the shop door,
   and the quote margins on hire-priced customer jobs.

## Checks

Whatever each fix touches, narrowest first, once. The pre-push gate is the arc's final
evidence at commit time.

## Exit

(Fill on completion: the full tutorial trace table, the copy-sweep change list, the
reconciliation figures, and the handoff note.)
