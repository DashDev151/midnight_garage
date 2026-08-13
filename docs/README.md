# docs

Everything written down about *Ran When Parked*. Four kinds of document live here and they are not
interchangeable:

| Kind | Where | What it means |
|---|---|---|
| **Bible** | `design/` root | Law. Amending one needs explicit maintainer approval, recorded in the file with a date. |
| **Spec** | `design/systems/`, `design/car-performance/`, `design/art/` | Describes something that is built or is being built. Consult before touching that system. |
| **Parked** | `design/parked/` | Designed properly, deliberately not scheduled. Do not start one unprompted. |
| **Record** | `sprints/`, `playtest-notes/`, `reviews/`, any `archive/` | History. Accurate about its own moment, never about today. |

**If a document contradicts the code, the code wins and the document is a bug**, except for the
bibles, where the reverse is true: a deviation from a bible is a bug in the code.

## The bibles

Listed in `CLAUDE.md` as well, because they are the ones worth loading before a design question.

- `design/midnight-garage-gdd.md` - the game. **Feature set frozen for v1.0**; new ideas go to
  `IDEAS.md` (the post-launch parking lot), never into the GDD.
- `design/midnight-garage-roadmap.md` - the plan, phases P0 to P7, plus the risk register. The
  highest-drift bible: it plans around 27 sprints and the repo is well past that.
- `design/midnight-garage-roster.md` - the car roster and its scope tiers.
- `design/art-direction.md` - palette, pixel discipline, the diegetic-UI law, audio. **No
  AI-generated assets ship or appear in public materials.** Development placeholders are exempt.
- `design/progression-bible.md` - reputation, specialty, tool tiers.
- `design/economy-bible.md` - car value, repair cost, parts pricing. The most-referenced document in
  the repo; shipped code and the balance harness both cite it by name.

`design/progression-map.md` sits beside them and is neither a bible nor a spec: it is a factual
readout of the career timeline, drafted to feed a mid-game design session that has not happened yet.
It decays with every sprint. Read the date before trusting a number in it.

## The systems

`design/systems/` holds the design of record for things that exist in the game. Each one names the
sprints that built it.

## The car performance model

`design/car-performance/` is the whole of how a car's physical behaviour is modelled: what is
measured, how it becomes grip, braking, acceleration and lap time, and how accurate that is against
real driven times. **Start at that folder's own README**, which is the canonical model document; the
other files there are its data, its harness, and the arc's historical working notes.

## Working practice

- A sprint's own `sprintNN.md` Exit is that sprint's permanent record. Nothing re-narrates it,
  including `CLAUDE.md`.
- **`sprints/` holds only live sprints; `sprints/sprint_archive/` holds finished ones.** A sprint
  moves to the archive when it is genuinely done: either everything in it shipped and its Exit
  records nothing still open, or it was deliberately closed unbuilt. A sprint whose Exit leaves
  real work outstanding, or that carries an approved design nothing has built yet, stays in
  `sprints/` however long ago it ran, because the archive is history and history is never a
  mandate. Move with `git mv`, and fix every reference to the old path in the same change.
  A sprint doc's own header status line says which of these it is; keep it true.
- **An arc index follows its arc, not its sprints.** It stays in `sprints/` while the arc is running,
  even as the individual sprints it indexes archive underneath it, and it moves to the archive when
  the arc completes. A lever ledger is the same, except that ratification is what completes it: a
  ledger stays live until the maintainer has signed it, however long ago its sprints ran. So
  `tuning-arc.md`, `scene-standing-arc.md` and `sale-value-arc-lever-ledger.md` (R3, ratified) are
  archived, and `generation-arc-lever-ledger.md` (R4) is not, because it is still awaiting review.
  This supersedes the earlier rule that named the two indexes as permanently live, which was written
  while both arcs were still running and outlived them.
- `TODO.md` at the repo root carries deferred items with no sprint number attached. Check it when
  planning, and remove from it when something lands.
- Archived documents keep a banner saying what superseded them. They are never deleted, and they are
  never quoted as current.
