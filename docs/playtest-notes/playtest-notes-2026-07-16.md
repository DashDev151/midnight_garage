# Playtest notes - 2026-07-16 (post-Sprint-78 arc review)

Maintainer playtest against the committed Sprint 78 build, alongside the big-picture review of the
Sprint 70-78 arc that produced Sprint 79's ruling set (the equivalence-priced labour model, the
grip spread nerf, the balance-gate demotion). One finding from the session itself, seeded here per
the standing triage workflow rather than left to rot in chat history.

## The one finding

**Brakes can be removed without pulling the wheel.** `brakePadsDiscs` and `brakeCalipersLines`
carried no `blockedBy` entry in the shipped parts taxonomy - a real slot in front of both in any
actual car (the wheel/rim assembly), missing from the dependency graph the teardown game otherwise
models honestly for the rest of the car (engine internals behind the head, the clutch behind the
gearbox, the gearbox behind the driveline). Structurally the same class of gap the component-
hierarchy arc exists to close, just missed on first pass.

## Actioned

**Sprint 79 decision 8** added `"blockedBy": ["rims"]` to both `brakePadsDiscs` and
`brakeCalipersLines` in `packages/content/data/parts-taxonomy.json`, then swept the remaining 27
slots for the same class of omission. No other slot carried an equally unambiguous case (a
component physically inaccessible without pulling a specific, identifiable other part first) - see
`docs/sprints/sprint79.md`'s Exit for the sweep's own reasoning, including what was considered and
deliberately left alone.
