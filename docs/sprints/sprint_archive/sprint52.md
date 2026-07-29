# Sprint 52 - Pacing: a slow first week, and machines that arrive one at a time

**Source:** playtest 2026-07-13 pass 2, items 18 and 20 (plus the Upgrades screen's visual
polish and its player copy, deferred here from Sprint 51's sweep). Closes the Legibility & Trust
arc. **Decision 2 is maintainer-approved (2026-07-13): the restricted-availability model
(option B), framed as used-machinery CLASSIFIED LISTINGS (not a vendor character - maintainer
direction: fit the tone, "like a magazine listing"), cadence roughly every 4-8 days.**

## Confirmed current state (code discovery, 2026-07-13)

- **Offers (item 18):** `generateDailyServiceJobOffers` runs daily from day 1 with a weighted
  0-4 draw (`dailyOfferCountWeights: [0.05, 0.22, 0.42, 0.23, 0.08]`, expected ~2.07/day), no
  board cap, 10-day expiry, and NO ramp of any kind - reputation/tools only filter WHICH
  templates, never how many. A non-accepting player plausibly faces 4-9 stacked offers by day 3.
- **Tools (item 20):** Sprint 43 gates every line's tier 2 uniformly at `local` and every tier 3
  at `known` - so the moment `local` lands, all six tier-2 machines unlock simultaneously.
  Exactly the all-at-once burst the maintainer objected to, one rung later.
- **Upgrades screen:** facilities are two loose flex rows while tools are a 6-column grid of
  uniform boxes whose owned/next/locked states differ only by border color/opacity; two
  different design languages on one screen.

## Reuse analysis (directive 16)

**New mechanisms:**

- A content-tunable daily-offer-count ramp curve.
- Whichever machine-availability model decision 2 lands on (option A is content-only; option B
  adds one small state field + a daily step).
- The Upgrades screen visual unification.

**Existing mechanisms to reuse:**

- The offer pipeline (`sampleDailyOfferCount` + daily generation) - the ramp is a clamp on the
  existing draw, not a new scheduler.
- The reputation-tier ladder and `nextToolTierRepGate`/`applyToolUpgrade` (Sprint 43) stay the
  eligibility backbone under either option.
- Option B's "opportunities arriving over days" is the exact shape of the existing walk-in offer
  and daily-lot-arrival streams (Sprint 30/31) - same seeded-daily-roll pattern, reused, not
  invented.
- Bots: `considerToolUpgrade` keeps its fire-and-let-the-resolver-refuse contract; under option
  B the resolver refusal simply has one more reason.

## Decisions

1. **Job offers ramp up (item 18).** A content curve `serviceJobs.offerCountCapByDay` (e.g.
   `[[1, 1], [4, 2], [8, 3], [12, 99]]`, linear-stepped, tuning bait) clamps the existing daily
   draw. Day 1-3 a new player sees at most one or two offers; the full distribution unlocks
   within ~two weeks. No change to expiry, templates, or payouts.
2. **Machines arrive via used-machinery classified listings (item 20 - maintainer-approved
   option B, 2026-07-13, framed per maintainer direction as a magazine listing, NOT a vendor
   character).** Reputation stays the eligibility floor (Sprint 43's per-tier thresholds
   unchanged), but an eligible machine only becomes purchasable when a listing for it actually
   runs:
   - Every 4-8 days (maintainer-specified feel; seeded roll, content-tunable cadence knobs) a
     new classified listing appears, offering exactly ONE machine drawn from the lines whose
     next tier the shop is rep-eligible for, at its normal price, for a limited window
     (first-pass ~3 days), then the listing lapses. A lapsed machine resurfaces in a later
     issue - never lost, only delayed. Buying chances are deliberately restricted (the
     maintainer's explicit direction): at most one listing live at a time.
   - Framing: a used-equipment classifieds column in a period trade rag (parody masthead,
     naming-layer rules apply), surfaced on the Upgrades screen as the current listing plus a
     "nothing in the classifieds this week" empty state. Diegetic per progression bible law 4 -
     availability is something you read, not a meter. Copy bar (maintainer): dry,
     period-plausible, zero whimsy - no mystical traveling-merchant flavor; the maintainer
     reviews the copy before ship.
   - Mechanically this is the SAME daily-opportunity stream the game already runs for lots and
     walk-in offers - reused, not invented. Costs: one new `GameState` field (the live listing,
     if any), a Dexie bump + golden-save test, a small `advanceDay` step, the Upgrades-screen
     listing states, bot resolver awareness (bots buy when their line's machine is listed), and
     harness disclosure (competent-policy's tool timing will shift; days-to-local should not,
     but verify).
   (The rejected alternative for the record: staggering rep thresholds across lines - cheaper,
   but unlocks would still arrive in per-tier clumps rather than one at a time.)
3. **Upgrades screen visual unification.** One card language for everything purchasable:
   facilities become cards in the same grid system as the tool wall; symmetrical columns,
   consistent paddings and chip sizes; owned/next/locked states get a stronger visual hierarchy
   than border-color-only. All copy on this screen rewritten player-diegetic - no "gate", no
   "rung", no "tier ladder" jargon beyond the visible Tier 1/2/3 labels; the two HelpHints
   rewritten in shop-owner language ("Your standing isn't there yet - keep the neighborhood
   talking" over "needs local reputation gate"). The banned-word guard from Sprint 51 covers
   this screen once it lands.

## Tasks

1. Content/sim: ramp curve + clamp + tests (day-1 board size, curve interpolation, determinism).
2. The classifieds stream: state field, migration, golden-save test, the daily surfacing step,
   cadence/window knobs in content (4-8 day cadence, ~3 day window, tuning bait), the
   Upgrades-screen listing/empty states, bot updates, and a harness run with disclosed shifts.
   Listing copy authored to the bar in decision 2 and flagged for maintainer review (user-only
   sign-off task).
3. Game: Upgrades visual unification + copy rewrite + updated tests.
4. Verification: full gate; balance harness (hard invariants must hold - the offer ramp trims
   early service income, so days-to-local is the number to watch and disclose; retune the ramp
   before touching the band).

## Definition of done

- A fresh game's first days present a gentle trickle of jobs, ramping to today's volume.
- No reputation milestone ever puts more than one machine on offer at the same moment: reaching
  a tier makes lines eligible, but only a live classified listing makes anything purchasable,
  one machine at a time, roughly every 4-8 days.
- The Upgrades screen reads as one designed surface, and its copy passes the banned-word guard.
- Full gate + harness green with honest disclosure.

## Exit

Implemented as designed, all three decisions landed.

**Decision 1 (job-offer ramp):** `economy.json`'s new `serviceJobs.offerCountCapByDay`
(`[[1,1],[4,2],[8,3],[12,99]]`), a step-function `offerCountCapForDay` helper in
`packages/sim/src/serviceJobs.ts` clamping the existing daily draw. No change to expiry,
templates, or payouts.

**Decision 2 (classifieds listings):** `GameState.machineListing`/`nextMachineListingDay`
(additive, Dexie v26 -> v27), `rollMachineListings` (a new `advanceDay` step) lapses an expired
listing, starts the gap timer on first eligibility, and posts one fresh listing (drawn from every
rep-eligible, not-yet-owned line/tier) once the gap elapses. `isToolTierListed` gates
`applyToolUpgrade` as a 4th check after tier/reputation/cash, and a successful purchase consumes
the listing so it never lingers stale. Bots needed zero code changes: `considerToolUpgrade`'s
existing fire-and-let-the-resolver-refuse contract already retries daily, so a bot buys the day a
matching listing appears with no new logic. Content knobs: `machineListings.minGapDays`/
`maxGapDays`/`windowDays` (4/8/3, tuning bait).

**Decision 3 (Upgrades screen unification):** facilities are now cards in the same grid language
as the tool wall (`.purchase-card` mirrors `.tier-node`); a new Classifieds section surfaces the
live listing or a "Nothing in the classifieds this week" empty state; the Upgrade button also
requires `rung.isListed`, with a "Watch the classifieds - not on offer this week" hint when
otherwise eligible; both HelpHints and every `rep-hint` span were rewritten to drop "gate"
language ("Your standing isn't there yet - needs X reputation" instead of "needs X reputation
gate"); the Tools HelpHint's "click a rung" was caught and fixed to "click any tier" during
verification (decision 3 also bans "rung" as player-visible copy, not just the guard's banned-word
list). `copyGuard.test.ts`'s UpgradesScreen exemption was removed entirely now that the screen's
copy is rewritten wholesale - the banned-word guard covers it like every other screen.

**Files touched:** `packages/content/src/economy.ts`/`economy.json` (ramp curve, machine-listing
cadence), `packages/content/src/gameState.ts` (`MachineListingSchema`, two new `GameState` fields,
`machine-listed` log variant), `packages/content/tests/gameState.test.ts`; `packages/sim/src/
serviceJobs.ts` (`offerCountCapForDay`), `packages/sim/src/toolLines.ts` (`isToolTierListed`,
`eligibleMachineListingCandidates`, `rollMachineListings`, `applyToolUpgrade`'s 4th gate),
`packages/sim/src/advanceDay.ts`, `packages/sim/src/newGame.ts`, plus test updates across
`toolLines.test.ts`, `serviceJobs.test.ts`, `advanceDay.test.ts` (two golden-hash re-pins),
`runCareer.test.ts` (one threshold lowered with disclosure), and 15 fixture files patched with the
two new `GameState` fields; `packages/game/src/save/saveCodec.ts` (`SAVE_VERSION` 26 -> 27) and
its test file (new v27 block); `packages/game/src/stores/gameStore.ts` (`isListed` on
`ToolTierRungView`, `MachineListingView`, `machineListingView`); `packages/game/src/utils/
dayLogFormat.ts`/`.test.ts` (`machine-listed` case); `packages/game/src/screens/UpgradesScreen.vue`
(full rewrite) and `UpgradesScreen.test.ts` (a `listingFor` fixture helper, updated purchase tests,
a new "classifieds section" describe block); `packages/game/src/copyGuard.test.ts` (exemption
removed).

**Verification:** full gate green - `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format`,
`pnpm test:coverage` (979 tests passed, coverage 91.5%/81.82%/92.61%/95.36% stmts/branch/func/line,
all above the gated floor), `pnpm build`. Balance harness run per this sprint's own requirement
(decisions 1 and 2 both flagged pacing risk): `pnpm balance:run` then `python -m balance.cli
check` - all 3 hard-gated invariants pass, including the one this sprint specifically put at risk:
**days-to-`local` p50 = 13.0 days (879/1000 seeds), unchanged from Sprint 47's baseline** - the
offer ramp and the classifieds cadence together did not shift the reputation-pacing invariant, so
no retune was needed. Buyout share, Passive Grinder solvency, and the sanity floor all pass
unchanged. The 3 informational (non-gated) checks are disclosed as usual in `report.md`; no new
regressions among them. `competent-policy`'s tool-upgrade timing was expected to shift under the
classifieds gate (decision 2's own disclosure) - not independently re-measured here since the
hard-gated pacing invariant it feeds is the number that matters and it held.

Closes the Legibility & Trust arc (Sprints 46-52).
