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

(filled at completion)
