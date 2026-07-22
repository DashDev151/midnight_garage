# Sprint 114: The selling rework I (channels and characters)

**Date:** drafted 2026-07-22. Design approved same day (`docs/design/selling-rework.md`).
**LEVERS LOCKED (maintainer, 2026-07-22, per CLAUDE.md directive 22):** the maintainer set
the final values in session: every ratio in the channel table raised uniformly by five
points from the reviewed draft ("raise EVERY number in the Entire selling network by 5
points... lock it in"). The table below is the locked list; implementation cleared, phased
around the concurrently-running hygiene sweeps (content first, sim and game as their
packages free up).

**One-line goal:** selling gains decisions: where you list decides who shows up; who shows up
is readable; the read prices the hold.

## Reuse analysis (directive 16)

**Reused:** the daily offer draw (`drawDailyOffers`, gains a channel filter, no second offer
system); `valuateCarForBuyer` and the persona/taste content (the read surfaces what already
computes); the for-sale listing state (gains one channel field); the event log (mismatch
presentation is log lines, no new UI surface); `saleReputationDeltaFor` (the matched bonus is
one more term in the existing family); the venue-name display seam (the tier label the
auction screens already render).

**Genuinely new:** the `sellingChannels` content block; the channel picker on the Sell
section; persona want-lines (copy, orchestrator-authored personally); the matched-sale
word-of-mouth term with its diegetic sale-close copy; the per-save venue-name roll.

## 1. Mechanics (as approved in the design doc)

1. Listing a car now includes choosing a channel (default: shop front). The channel sets the
   fee, the offer cadence, which personas can arrive, and how much of the taste band the
   arriving pool can express. Re-listing on another channel pays that channel's fee.
2. Mismatch is taught visibly: a wrong-for-channel listing draws no-show/lowball log lines,
   never a hidden penalty.
3. Buyer offers name their persona and its want (one authored line per persona family): the
   want IS the taste ceiling, surfaced. Holding out becomes an informed, rent-priced bet.
4. A matched sale (car fits the buyer's visible want) adds a small word-of-mouth reputation
   term, revealed ONLY in sale-close copy (progression bible Law 4; arithmetic on the
   Standing screen only).
5. Venue names: each auction tier rolls one name per save from its pool (content JSON, the
   approved pools in the design doc), stored on the save, displayed wherever the tier label
   renders. Dexie bump, no migration.

## 2. Out of scope

Haggling (permanently); the one-shot counter (deferred, not in this sprint); any change to
`marketValueYen` or the offer-spread constants; the trade network buying anything the player
did not list.

## 3. THE LEVER LIST (directive 22: each value requires explicit maintainer approval)

New `economy.json` block `sellingChannels`, starting values:

One knob per channel decides how good a buyer can appear: the TASTE CEILING (buyers roll
taste 0.88-1.12 of value; the ceiling caps the roll for that channel's pool; the low end
never moves). The channel ORDERING LAW (maintainer, 2026-07-22, after two corrections): the
free shop front is the WORST typical outcome by design; every other channel beats it in its
lane on PRICE; channels are compared on price and outcome only, never on time saved. Trade
network carries no fee (the band is the fee, one visible number) and pays near-value:
dealers buying easy stock. Typical realisations under the values below: shop front ~0.90 of
value (the honest floor, with a rare lottery top just under value), ads paper ~0.93 on
cheap metal, trade 0.90-0.97 certain, magazine/meet the only road past 1.0.

| Lever | Proposed value |
|---|---|
| shopFront.feeYen | 0 |
| shopFront.offerChanceFactor | 0.7 |
| shopFront.tasteCeiling | 1.00 (the worst channel by design: never above value) |
| freeAdsPaper.feeYen | 1,500 |
| freeAdsPaper.offerChanceFactor | 1.5 for shitbox/common, 0.5 for uncommon+ |
| freeAdsPaper.tasteCeiling | 1.05 |
| tunerMagazine.feeYen | 12,000 |
| tunerMagazine.offerChanceFactor | 0.6 (slow, monthly-flavoured) |
| tunerMagazine.tasteCeiling | 1.17, matched (sporting/modified) cars only; mismatch draws ~no offers |
| tradeNetwork.feeYen | 0 (the band is the fee) |
| tradeNetwork.offerChanceFactor | 3.0 (near-immediate) |
| tradeNetwork.priceBand | fixed 0.95-1.02 of value, no taste roll |
| weekendMeet.feeYen | 3,000 |
| weekendMeet.offerChanceFactor | one strong draw on the next End Day only |
| weekendMeet.tasteCeiling | 1.17, matched personas only |
| matchedSaleRepBonus | +1 (beside cleanSaleBonus +2 / concoursSaleBonus +4) |

Plus non-lever content: `venueNames.json` (the four approved pools), persona want-lines
(copy). The approval-gate guard test re-pins in the same change as this doc's approval.

## Tasks (sequenced after the hygiene batch commits)

- [ ] Content: `sellingChannels` schema + block; `venueNames.json` + roll-at-newGame +
      display seam; want-line fields on personas (copy authored by the orchestrator).
- [ ] Sim: channel field on listings; channel-aware offer draw + mismatch lines; matched
      bonus term; probes (channel determinism, mismatch honesty, bonus law-compliance).
- [ ] Game: channel picker on the Sell section; persona want surfacing on offers;
      sale-close word-of-mouth copy (orchestrator-authored).
- [ ] Orchestrator: copy, verification, Exit.

## Exit

(To be filled from real verification output.)
