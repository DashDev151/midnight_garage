# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y1,377,500 | Y1,451,357 | Y1,543,269 | 0.0 | 0.0 |
| balanced-player | 40 | Y1,332,596 | Y1,412,538 | Y1,522,884 | 0.0 | 0.0 |
| balanced-player | 70 | Y1,141,846 | Y1,329,120 | Y1,456,626 | 0.0 | 1.0 |
| balanced-player | 100 | Y1,032,056 | Y1,279,218 | Y1,414,602 | 0.0 | 2.0 |
| cautious-restorer | 25 | Y367,160 | Y461,418 | Y583,000 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y327,010 | Y418,453 | Y533,810 | 2.0 | 0.0 |
| cautious-restorer | 70 | Y227,010 | Y316,625 | Y428,530 | 2.0 | 0.0 |
| cautious-restorer | 100 | Y147,010 | Y235,350 | Y348,530 | 2.0 | 0.0 |
| competent-policy | 25 | Y418,713 | Y619,967 | Y1,456,881 | 0.0 | 54.0 |
| competent-policy | 40 | Y303,505 | Y588,530 | Y1,153,614 | 0.0 | 102.0 |
| competent-policy | 70 | Y46,217 | Y428,928 | Y1,010,596 | 0.0 | 189.0 |
| competent-policy | 100 | Y4,928 | Y250,110 | Y1,296,865 | 0.0 | 261.5 |
| flipper | 25 | Y1,440,000 | Y1,450,567 | Y1,459,916 | 0.0 | 0.0 |
| flipper | 40 | Y1,400,000 | Y1,410,735 | Y1,420,310 | 0.0 | 0.0 |
| flipper | 70 | Y1,300,000 | Y1,318,310 | Y1,328,933 | 0.0 | 0.0 |
| flipper | 100 | Y946,456 | Y1,254,450 | Y1,271,181 | 0.0 | 0.0 |
| handyman | 25 | Y618,500 | Y669,330 | Y690,000 | 1.0 | 0.0 |
| handyman | 40 | Y578,410 | Y629,000 | Y641,090 | 1.0 | 0.0 |
| handyman | 70 | Y477,050 | Y520,505 | Y539,440 | 2.0 | 0.0 |
| handyman | 100 | Y396,940 | Y440,130 | Y452,370 | 2.0 | 0.0 |
| investor | 25 | Y817,980 | Y1,012,335 | Y1,246,200 | 2.0 | 0.0 |
| investor | 40 | Y420,300 | Y622,088 | Y859,520 | 2.0 | 0.0 |
| investor | 70 | Y-37,700 | Y-16,296 | Y66,520 | 2.0 | 0.0 |
| investor | 100 | Y-117,700 | Y-96,296 | Y-58,190 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y1,206,518 | Y1,369,268 | Y1,431,090 | 2.0 | 0.0 |
| random | 40 | Y1,157,800 | Y1,317,155 | Y1,370,440 | 2.0 | 0.0 |
| random | 70 | Y1,044,275 | Y1,207,630 | Y1,263,090 | 3.0 | 0.0 |
| random | 100 | Y960,270 | Y1,125,502 | Y1,177,990 | 3.0 | 0.0 |
| service-grinder | 25 | Y1,011,917 | Y1,163,846 | Y1,234,430 | 0.0 | 42.0 |
| service-grinder | 40 | Y530,241 | Y665,232 | Y1,333,940 | 0.0 | 81.0 |
| service-grinder | 70 | Y381,029 | Y713,326 | Y910,527 | 0.0 | 171.0 |
| service-grinder | 100 | Y539,231 | Y726,579 | Y1,055,137 | 0.0 | 266.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [15, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 1000/1000 | 10 | 11 | 12 |
| known | 1000/1000 | 20 | 24 | 37 |
| respected | 989/1000 | 41 | 45 | 65 |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 19.5% | 10%-25% |
| mid | 65.3% | 50%-100% |
| frenzy | 15.2% | 5%-15% |

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
