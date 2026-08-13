# Playtest notes, 2026-08-13, session 3 (first pass on the Sprint 202 build)

**Maintainer feedback on the direct-work build, given as quick-fix requests then upgraded
by the maintainer to a planned sprint.** The prevailing diagnosis, in their words: clutter
and DRY violations; the UI can have exactly the same features with half of the mess.
Findings 1-4 and 6 are design work for Sprint 203; finding 5 was an economy sanity
question, answered from the value model (no change requested): value is clean minus 1.3x
the remaining bill, so partial repair always pays per yen and full restoration to the band
is the intended maximum, with no threshold cliff.

## Findings

1. **The zone condition panel (Sprint 202 D3) failed its purpose.** A wall of text,
   hard to read, and the condition still is not visible ON the car diagram. The player's
   actual questions, in order: what is the body condition as a whole; which panels drag
   it down; what is wrong with those panels; and above all WHAT DO I DO to raise it. The
   last answer exists in the sim (the pipeline knows each zone's next stage) and the UI
   hides it. Wanted: icons/colour on the diagram, a glanceable hierarchy, the required
   action front and centre.
2. **Bodywork labour costs far too much.** Panel beating, prep, primer and paint labour
   all come down. (Lever change; behaviour-first governance applies.)
3. **Messy strings everywhere.** Long internal-note sentences served to the player,
   buried under info buttons, off-voice. Rule: a long explanatory sentence in the UI is a
   UX design failure. Move reference prose to a properly written compendium; the UI keeps
   short, in-voice lines only.
4. **The repair flow fights the player.** Placing a part on the workbench then hunting
   for the right repair button; buttons that are long combined strings; buttons that
   move. Rules: the repair/recondition control always looks the same and lives in the
   same place; use drag and drop (drag a part from inventory onto the workbench); and the
   parts list duplicated under the workbench is a DRY violation, the inventory tab is the
   list.
5. Economy sanity question, answered above; no task.
6. **The body panel fix box, especially paint, is messy and convoluted.** Long ugly
   buttons, wrapped text, a large colour palette that still requires buying the paint
   separately. Select the physical paint tin from inventory instead.

## Triage

Findings 1-4 and 6 become Sprint 203 (`docs/sprints/sprint203.md`): a UI consolidation
sprint with one lever task (body-stage labour, values chosen under behaviour-first
governance at implementation). Nothing implemented ahead of the sprint doc.
