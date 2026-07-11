# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y1,310,927 | Y1,655,273 | Y2,037,906 | 0.0 | 0.0 |
| balanced-player | 40 | Y1,476,811 | Y1,829,496 | Y2,193,205 | 0.0 | 0.0 |
| balanced-player | 70 | Y1,393,628 | Y1,836,484 | Y2,309,532 | 0.0 | 0.0 |
| balanced-player | 100 | Y1,831,503 | Y2,321,118 | Y2,824,710 | 0.0 | 2.0 |
| cautious-restorer | 25 | Y87,000 | Y287,468 | Y441,000 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y47,000 | Y242,500 | Y385,000 | 2.0 | 0.0 |
| cautious-restorer | 70 | Y-53,000 | Y138,000 | Y265,000 | 2.0 | 0.0 |
| cautious-restorer | 100 | Y-133,000 | Y57,572 | Y180,000 | 2.0 | 0.0 |
| competent-policy | 25 | Y49,173 | Y237,594 | Y633,964 | 1.0 | 24.0 |
| competent-policy | 40 | Y11,107 | Y113,629 | Y545,265 | 1.0 | 40.0 |
| competent-policy | 70 | Y-85,651 | Y-6,024 | Y328,346 | 1.0 | 48.0 |
| competent-policy | 100 | Y-164,850 | Y-81,453 | Y116,274 | 1.0 | 8.0 |
| flipper | 25 | Y1,415,885 | Y1,629,323 | Y1,772,379 | 0.0 | 0.0 |
| flipper | 40 | Y1,443,325 | Y1,682,884 | Y1,824,212 | 0.0 | 0.0 |
| flipper | 70 | Y1,395,775 | Y1,729,354 | Y1,891,020 | 0.0 | 2.0 |
| flipper | 100 | Y1,441,637 | Y1,827,286 | Y2,063,057 | 0.0 | 2.0 |
| handyman | 25 | Y474,000 | Y514,090 | Y602,000 | 2.0 | 0.0 |
| handyman | 40 | Y430,000 | Y470,000 | Y558,000 | 2.0 | 0.0 |
| handyman | 70 | Y324,306 | Y364,862 | Y396,000 | 2.0 | 0.0 |
| handyman | 100 | Y244,000 | Y284,000 | Y310,000 | 2.0 | 0.0 |
| investor | 25 | Y492,900 | Y741,742 | Y913,500 | 2.0 | 0.0 |
| investor | 40 | Y93,500 | Y352,400 | Y521,000 | 2.0 | 0.0 |
| investor | 70 | Y-75,600 | Y-51,030 | Y-25,000 | 2.0 | 0.0 |
| investor | 100 | Y-155,600 | Y-131,030 | Y-105,000 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y712,000 | Y977,108 | Y1,204,000 | 3.0 | 0.0 |
| random | 40 | Y668,000 | Y926,000 | Y1,137,104 | 3.0 | 0.0 |
| random | 70 | Y551,324 | Y814,000 | Y1,026,000 | 3.0 | 0.0 |
| random | 100 | Y469,130 | Y732,098 | Y944,166 | 3.0 | 0.0 |
| service-grinder | 25 | Y128,680 | Y574,826 | Y914,239 | 0.0 | 40.0 |
| service-grinder | 40 | Y53,768 | Y471,419 | Y795,178 | 0.0 | 56.0 |
| service-grinder | 70 | Y-35,395 | Y239,266 | Y541,853 | 0.0 | 72.0 |
| service-grinder | 100 | Y-113,270 | Y41,582 | Y310,117 | 0.0 | 88.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [15, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 985/1000 | 11 | 16 | 27 |
| known | 581/1000 | 30 | 44 | 65 |
| respected | 75/1000 | 67 | 90 | 100 |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 48.1% | 10%-25% |
| mid | 50.8% | 50%-100% |
| frenzy | 1.0% | 5%-15% |

## Buyout vs. bid (external review 2026-07, finding 2)

Share of successful auction acquisitions made via instant buyout vs. a won competitive bid, per strategy. A strategy near 100% buyout means the bidding screen is effectively dead for it and `AUCTION_BUYOUT_PREMIUM` (currently a 25% premium over the value anchor, Sprint 20) is cheap enough that certainty always wins. Bots never buy out as of Sprint 20 (buyout is a player-impatience valve only), so this section's bot-side numbers are expected to read as 0% buyout going forward - kept for the player-side telemetry hook and as a regression check that bots really have stopped buying out.

| Strategy | Bid | Buyout |
|---|---|---|
| balanced-player | 100.0% | 0.0% |
| cautious-restorer | 100.0% | 0.0% |
| competent-policy | 100.0% | 0.0% |
| flipper | 100.0% | 0.0% |
| handyman | 100.0% | 0.0% |
| investor | 100.0% | 0.0% |
| random | 100.0% | 0.0% |

## Invariants enforced (Sprint 23 decision 7)

`balance.cli check` hard-gates 5 checks against this data: days-to-`local` p50 in [15, 35] (competent-policy probe), buyout share of acquisitions < 30%, and the 3 legacy Sprint 03/09 checks (Passive Grinder solvency, Flipper-vs-Passive separation, sanity floor). 3 more are measured and reported but NOT gated - real measurement showed every active strategy's day-100 cash below Passive Grinder's, Flipper below its own starting cash, and the auction frenzy tail outside its target band; see `invariants.py`'s module docstring for the full disclosure rather than a silently loosened band.
