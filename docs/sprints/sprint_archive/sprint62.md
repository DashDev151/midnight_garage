# Sprint 62 - The standing view: reputation and specialty on the shop wall

**Source:** playtest 2026-07-14 pass 2, item 17: every job raises rep and specialty, but
there is nowhere to SEE the current granular numbers - "one rep card is not enough."

## Confirmed current state (code discovery, 2026-07-14)

- Reputation surfaces today as: the tier word + shop title in the garage header
  (`GarageScreen.vue:99-105`), the tier word on the Upgrades header (`UpgradesScreen.vue:55`)
  and per-rung gate words (`:172-173`), and - notably - the RAW `reputationPoints` number
  already shown on `ServiceJobsScreen.vue:25`.
- Specialty surfaces only as per-job deltas in `JobCompleteModal` (Sprint 57) and the derived
  shop title; `specialtyView` (all six disciplines + points) is ALREADY COMPUTED in the store
  (`gameStore.ts:1659-1667`) with a comment saying players never see it.
- Thresholds: reputation tiers in `packages/sim/src/constants.ts:132-138` (unknown 0,
  local 15, known 50, respected 120, legend 300); technique threshold 120 per discipline in
  `techniques.json`.
- `docs/design/progression-bible.md` Law 4 bans meters/bars/toasts/floating numbers ("sim
  numbers dev-console only"); Law 5 requires every unlock be a named real thing; banned
  vocabulary includes "XP", "mastery meter", "levels".

## Reuse analysis (directive 16)

**New mechanisms:** one screen + route, and a recorded progression-bible amendment.

**Existing mechanisms to reuse:** `specialtyView` (built, unused by any screen), `shopTitleName`,
`techniques` content (named unlocks), `componentLabel`, the reputation tier thresholds
(exported from sim), `HelpHint` for the header explainer. No new state, no save change -
everything is a pure function of existing state, exactly like Sprint 39's title.

## Decisions

1. **A Standing screen.** New route (`/standing`), entered diegetically: the shop-title line
   in the garage header becomes the link (the wall where the shop's name hangs), plus the
   rep line on the jobs screen. No new nav tab (the nav is full, and Sprint 65 is about to
   remove one).
2. **Words and tables, not meters.** Contents:
   - Reputation: the named tier, the exact points, and the next tier by NAME with its
     threshold in prose ("Known around the ward at 50 - you're at 31").
   - Specialty: the six disciplines by display name, exact points each, and the named
     technique earned at 120 (shown by its real name whether earned or not - Law 5).
   - The current shop title and, in words, what moves it.
   No bars, no percentages, no toasts - the numbers appear on this one dedicated view only.
3. **Progression-bible amendment (recorded).** Law 4 amends from "sim numbers dev-console
   only" to permit exact reputation/specialty points on this single dedicated view, per the
   maintainer's explicit 2026-07-14 request; the ban on ambient meters/bars/floating numbers
   everywhere else stands. Banned vocabulary untouched - the copy says "standing" and
   "specialty", never "mastery" or "XP". (`ServiceJobsScreen`'s existing raw points chip
   becomes a link to the view, so the number lives in one place.)

## Tasks

**Claude:**

1. Game: `StandingScreen.vue` + route; garage-header and jobs-screen entry links; read
   `specialtyView`/`shopTitleName`/thresholds (export the sim threshold table if not already
   exported); component tests (tier + points render; next threshold named; all six
   disciplines with technique names; links navigate).
2. Docs: progression-bible Law 4 amendment recorded with date and rationale.
3. Full gate; no balance harness (pure UI over existing derived state).

**User-only (maintainer):**

- Approving this sprint doc is the recorded approval the bible amendment requires.

## Definition of done

- One view shows granular reputation (points + named next tier) and all six specialty
  disciplines (points + named technique), reachable from the garage header and jobs screen.
- Bible amendment recorded; banned vocabulary absent from the copy; full gate green.

## Exit

Implemented and committed.

**The Standing screen (decisions 1-2).** New `StandingScreen.vue` at route `/standing`, a pure
renderer over one new store computed `standingView` (`gameStore.ts`) - reputation (the named tier,
exact points, and the named next tier with its threshold, or a "top of the ladder" line at
legend), all six specialty disciplines (display name, exact points, and each discipline's named
tier-4 technique shown whether earned or not - progression bible law 5), and the derived shop
title in prose. Words and tables only: no bars, no percentages, no toasts, no live overlay. The
screen is reached diegetically - the garage-header reputation line and the jobs-screen rep figure
both became links to it (`data-test="standing-link"`), so the granular numbers live in exactly one
place, pulled up on demand.

**No new state.** `standingView` is a pure function of `reputationTier`/`reputationPoints`,
`specialty`, the `techniques` content, and the `REPUTATION_TIER_THRESHOLDS` table - the same
"derive, don't store" shape Sprint 39's shop title established. No schema change, no save bump, no
migration.

**The bible amendment (decision 3).** Progression bible Law 4 amended (recorded in the doc with
the date and rationale; this sprint's approval is the required maintainer approval): a single
dedicated, pull-not-push standing screen MAY show exact reputation/specialty points and the named
next threshold; the ban on ambient meters/bars/toasts/floating numbers on gameplay screens is
otherwise unchanged. Banned vocabulary is untouched and absent from the copy (a `StandingScreen`
test asserts "xp"/"mastery"/"level"/"prestige" never appear).

**Testing.** New `StandingScreen.test.ts` (tier + exact points render; the next tier is named with
its threshold; the top tier shows "nowhere higher" instead; all six disciplines render with points
and a named technique; an earned technique flips to "Earned" once the discipline clears 120; banned
vocabulary absent). New link-presence tests on `GarageScreen.test.ts` and `ServiceJobsScreen.test.ts`
(the rep line is a RouterLink to `standing`).

**Verification.** Full gate green: `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format`,
`pnpm test:coverage` (1065 tests, 80 files; coverage 91.55%/82.14%/92.98%/95.36%, all above the
ratchet floor), `pnpm build` (the `StandingScreen` lazy chunk emits cleanly). No balance harness
run - this is pure UI over existing derived state, zero sim or economic surface touched.

**Definition of done, checked against the sprint doc:**
- One view shows granular reputation (points + named next tier) and all six specialty disciplines
  (points + named technique), reachable from the garage header and jobs screen - yes.
- Bible amendment recorded; banned vocabulary absent from the copy; full gate green - yes.
