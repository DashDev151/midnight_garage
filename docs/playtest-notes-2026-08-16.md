# Playtest notes, 2026-08-16 (maintainer session, triage pending)

**A second session the same day (log `midnight-garage-session-day3.json`) ended with the
maintainer STOPPING the playtest: too many structural defects to continue. Its notes are
in the second section below and take priority.**

Raw notes from the maintainer's playtest of the post-Sprint-205 build. Captured verbatim
in intent; triage and sprint planning follow separately. Item 0 was fixed immediately as
a playtest blocker; nothing else has been actioned yet.

## 0. BLOCKER (fixed first, same day): the Warehouse

The workbench shipped with no way to get items onto it: the inventory could not be opened
from the workbench at all, and the existing side-panel inventory was rudimentary. Ruling:
**one inventory implementation across the entire game**, named the **Warehouse**.

- A floating UI element (same family as the End Day button and the top info card): a
  button on the right side of the screen that opens a collapsible/expandable drawer.
- Lists everything in inventory, with proper filtering and sorting.
- Interactive: items can be **dragged** from the drawer to any part of the game where
  that makes sense (workbench for repairs, machining bench for machining, etc.).
- DRY: this is the only inventory surface in the game; all other inventory panels die.
- Fantasy: a clipboard holding a paper warehouse inventory list.

## 1. The newsstand job needs elevating

- It reads like just another radial job. It needs to be richer and more involved.
- Wants a fleshed-out (but still minor) character for the stand owner.
- Must NOT appear on day 1: roughly day 5, or a few days after the tutorial mission
  completes.
- The tasks must be authored, and the repair itself made interesting: a cool little job,
  easy, but somewhat more interesting than a normal radial job.

## 2. Timestamps unreliable

The maintainer made notes throughout, so session timestamps do not reflect real
playtime. A separate clean run is needed for pacing measurement.

## 3. Diagnosis / inspection needs resolution

The system has promise but is not being used correctly. When elimination narrows the
fault to one remaining candidate, the game must SAY so: "Must be the X then, that means
Y, and that's good/bad." The player finishes a diagnosis holding an answer and the game
does nothing with it.

- 3.1. A found fault (e.g. jumped timing chain) must relate to actual parts on the
  service diagram. What does it mean mechanically, and where does the player see it?
- 3.2. A major fault found pre-bid gives no guidance: should the player walk away, or
  bid lower? The consequence is not made clear.
- 3.3. "Car is worth 145k, the room says 154k": what should the player DO with that?
  The spread's meaning is never stated.

## 4. Day-one selling channels

On day one, ONLY the Shop Front should be visible as a selling outlet. Free ads unlocks
shortly after (newsstand) but is not shown yet. Trade network, collector network, car
meet and tuner magazine should not appear on the UI at all until relevant: the player
should not know they exist. (This also resolves Sprint 205's open Law 4 question:
absent, not present-but-locked, is the ruling.)

## 5. Part dependency diagram has holes

Dampers could be removed before springs; springs and dampers before the wheels.
Suspension removal ordering is wrong and the dependency graph needs work.

## 6. Body panels: SCRAP vs MISSING

Panels that are absent are being shown as SCRAP when they should show MISSING.

## 7. The Cafe (wanted ASAP)

A physical location on the overworld. Once a day the player can go in and buy coffee
(later, stronger products) to replenish a portion of the labour bar. Once per day.

---

## Session 2 (day-3 log): the playtest was STOPPED here

### S2-1. Radial job pay must price the labour it demands

A "repair cams and timing" radial job constitutes a full engine pull: a very large
labour spend for a Y14,000 payout. Ruling: a job must know how much labour completing
it actually takes and price accordingly, via a single fair labour-to-yen conversion
rate used EVERYWHERE. More labour, more yen.

### S2-2. Drag is half-implemented

- Drag from Warehouse to workbench works; drag BACK from a station to the Warehouse
  must also work.
- Fitting parts back onto a benched assembly: drag them on.
- Fitting parts onto the car: drag from the Warehouse onto the service diagram
  (careful interplay between rendering frameworks).

### S2-3. Duplicate customer parts shown in the Warehouse (visual bug)

Customer parts appeared twice in the list; removing one removed both, so a single
instance was being RENDERED twice, not generated twice. Root-cause before fixing.

### S2-4. The newsstand job is lacklustre (repeat of note 1, stronger)

Stock radial job in all but name. Needs: a character, copy, a story, and
COMMUNICATION: what was unlocked, what the Free Ads channel is, how it compares to
the shop front (better/worse, when), what the Trade Sheet is, where to get it, how it
works.

### S2-5. Auction houses become physical overworld locations

Every auction house is a place on the map. The top-bar auction panel/tab is removed:
the overworld is the ONLY way in. Day one, only the Local yard is accessible; the
regional, premium and collector rooms exist on the map but are not yet accessible.
Auction schedules need rethinking against the new 5-day calendar.

### S2-6. The Office is a physical room in the garage

One room holding all the admin tools, rudimentary blocks for now: the calendar, the
phone, Standings, Rep (corkboard idea), the Listing Channels, and the cash register
(financial summaries).

### S2-7. Replace still exists (fifth repetition of the ruling)

The wheel assembly still offers Replace. THE RULING: replace/swap is never one
action. It is always two: remove a part (it goes to the Warehouse), then install a
part from the Warehouse. The Warehouse is always the staging point. Sweep the ENTIRE
codebase for any remaining single-action swap and kill it.

### S2-8. The body system is rejected as built

- 9 labour to fit one body panel reads as far too much.
- The "Install panel" button with a long priced string violates the standing ruling
  against massive strings in buttons, and does not work like every other install.
- Weld is greyed with no explanation of why or what to do.
- The pipeline (prep/beat/weld/fill/prime/paint) is pointless if a panel can simply
  be repaired to fine on the workbench: two systems for the same job.
- Body panel work must happen in the DEDICATED body shop room and only there.
- The whole body panel implementation needs a complete rethink, and the previous
  "simplification" made it more convoluted.

### Standing instruction

The maintainer stopped playing: the game is unplayable until these are fixed. Fix
pass has one chance; triage, verify against code, design properly, then build.

---

## Session 3 (day-5 log): aborted; bug-fix and playability pass ordered

Nothing from this session is measurement. Every note below must be addressed before
the next playtest.

### S3-1. The garage page becomes a rendered pixel-art room (LATER, critical design)

Not a right-now item. The maintainer will provide a design. Recorded as critical
future design work; no build until then.

### S3-2. The bay/room pairing must read as pairs (DRY)

Body bay AND a "Body and paint" station both sit on the garage page with no visible
relationship. If the mechanics are pairs (Service bay + Workbench; Body bay + Body
shop), the garage must display them as pairs, and the body shop is a physical room
to the side where ALL body work happens.

### S3-3. Beat took a poor panel straight to MINT

Not prepped, not primed, not painted, reads Mint. The zone band must not read mint
while the surface/finish work is outstanding; structure and finish are different
facts and the display must carry both.

### S3-4. What is removing a panel FOR?

If no repair ever requires removal, is it only for replacement? Answer and make the
affordance say so.

### S3-5. Refusals must be visible and specific in the body section

The player never sees the log stream. A refused action (e.g. fill-and-sand without
material) needs on-screen, specific feedback: you can't, and why.

### S3-6. Interior is incoherent

Dash and seats: where are they repaired? Ruling: interior components are repaired
INSIDE the body shop; interior becomes a full coherent concept of its own there.

### S3-7. BUG: removing the Dash removed the Skirts; dash/seats unselectable after

Also ruled: Interior and Aero are currently linked to the Service bay; they belong
to the Body bay.

### S3-8. Build shopping checklist

A way to mark what parts a build still needs. NOT a new system; a seamless
integration into existing systems.

### S3-9. Warehouse: pin-open button

Top right of the drawer. Working between warehouse and workbench keeps closing it.

### S3-10. Warehouse: condition slicer

scrap / poor / worn / fine / mint.

### S3-11. Engine refit cost 72 labour (BIGGEST ISSUE)

Refit charged 72 without the crane; another job with one changed part charged 18.
Cause is almost certainly per-changed-member labour. Ruling: fitting an engine takes
the same labour regardless of how many members changed; assembly refit becomes a set
figure.

### S3-12. Install ordering must respect the graph downward

The exhaust was refitted, then had to come off again for the gearbox; same with the
driveline. Ruling: a part must NOT be fittable while a required part beneath it is
missing. No wheels without brakes.

### S3-13. BUG: interior parts invisible in the Warehouse

Removed seats; count says 3 parts, list shows none. Plus: where interior gets fixed
is nowhere near clear (see S3-6).

### S3-14. Skirts fit through their own special button (DRY)

"Fit OEM skirts" works differently from fitting any other part. Panel fitting must
go through the same fit flow as everything else.

### S3-15. The zone's remaining work is invisible

After beat/weld, nothing says what the panel still needs (prep? primer? paint?),
what its current state is, or what is missing. The pipeline position must be
legible at a glance.

### S3-D1. The flip made Y14k in five days (DEEP: financial forensics)

Intensive labour, minimal parts spend, and the whole flip cleared about one small
repair job's payout. The maintainer orders a careful pass through the financials to
understand exactly where the margin went.

### S3-D2. The repair loop is not fun (DEEP: design)

Even granting art, audio and juice to come, the strip-repair-reassemble mechanics
risk monotony. Ordered: deep expert design thinking on making the core repair loop
engaging.
