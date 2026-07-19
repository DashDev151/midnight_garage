# Sprint 97: The office phone (playtest 2026-07-19, item 15)

**Date:** 2026-07-19
**Source:** `docs/playtest_notes/playtest-notes-2026-07-19.md` item 15. Maintainer ruling:
the "job board" fiction dies; customer work arrives through the shop's office phone.

The mechanics already were the phone fiction: accept an offer and the car arrives the next
morning, which is a call-back-and-book, not a claimed notice. This sprint is a pure
reframe: copy and labels only, no mechanics, no route/id changes.

## Reuse analysis (directive 16)

**Existing mechanisms reused (everything):** the offer lifecycle, expiry, accept/decline
resolvers, story-mission cards, the day-report entry, the walkthrough machine. No state,
schema, or sim change of any kind.

**Genuinely new:** nothing mechanical. New player-facing fiction only.

## Decisions

1. **The fiction (maintainer refinement mid-sprint):** radial offers are LIVE calls, not
   answering-machine messages - customers ring the shop through the day; accepting =
   booking the drop-off on the call; declining = politely turning the work down (still
   zero-penalty); story customers are walk-ins, present in person (the tutorial
   introduces Yuki exactly that way).
2. **Labels:** nav tab "Jobs" -> "Phone"; screen title "Service jobs" -> "The phone";
   board heading "Job board" -> "Calls"; Accept -> "Book it in" (Decline stays: it is
   the honest verb for turning down work, and its zero-penalty semantics are established).
3. **Internal names do not move:** the `jobs` route name, `nav-jobs` and every other
   data-test, store/sim identifiers, and code comments keep their current spelling -
   renaming working identifiers for a fiction change is churn for zero player value (the
   same rule as save-schema field spellings, CLAUDE.md directive 18).
4. **Term collision flagged, not acted on:** the Staff Office also renders a heading "The
   job board" (candidate hiring). Different room, same stale term - left for the
   maintainer's call (a period-true frame there would be replies to a help-wanted ad).
5. **Future hook recorded, not built:** fleet/company work arriving by fax.

## Tasks

**Claude-implementable (orchestrator-personal: identity copy):**

- [x] `App.vue`: nav label "Phone".
- [x] `ServiceJobsScreen.vue`: title "The phone", help hint rewritten (also fixing its
      stale "hand it back from the car's page" claim - Complete Job lives on this screen),
      "Messages" heading, empty-state line ("Nothing on the machine this morning..."),
      Accept relabelled "Book it in".
- [x] `dayLogFormat.ts`: "Messages on the machine: N".
- [x] `CarDetailScreen.vue` service banner: both "job board" references now name the
      Phone tab.
- [x] `tutorialSteps.json`: welcome/accept/deliver/done lines re-anchored (Yuki introduced
      as the walk-in kind; "from tomorrow the phone starts ringing").
- [x] Tests: no copy pins broke (the overlay pins quote lines this sweep left intact).

**User-only:**

- [ ] Judge the fiction live in the playtest.

## Exit

- [x] Narrow test evidence, one run: content guards + `TutorialOverlay.test.ts` +
      `ServiceJobsScreen.test.ts` + `dayLogFormat.test.ts`, 78 passed, 0 failed. The
      pre-push hook on this commit's push is the full gate.
- [x] Copy swept personally; no em dashes; British spelling; tone directive (item 14)
      respected throughout.
