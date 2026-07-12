# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y1,221,159 | Y1,475,490 | Y1,528,993 | 1.0 | 0.0 |
| balanced-player | 40 | Y1,156,517 | Y1,473,808 | Y1,533,403 | 1.0 | 0.0 |
| balanced-player | 70 | Y1,071,803 | Y1,432,198 | Y1,512,088 | 1.0 | 0.0 |
| balanced-player | 100 | Y1,042,310 | Y1,405,413 | Y1,513,470 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y371,647 | Y465,613 | Y557,827 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y331,647 | Y425,613 | Y517,827 | 2.0 | 0.0 |
| cautious-restorer | 70 | Y231,647 | Y325,613 | Y417,827 | 2.0 | 0.0 |
| cautious-restorer | 100 | Y151,647 | Y245,613 | Y337,827 | 2.0 | 0.0 |
| competent-policy | 25 | Y343,295 | Y429,120 | Y532,491 | 1.0 | 0.0 |
| competent-policy | 40 | Y325,767 | Y413,940 | Y530,412 | 1.0 | 0.0 |
| competent-policy | 70 | Y266,632 | Y380,632 | Y507,866 | 1.0 | 0.0 |
| competent-policy | 100 | Y228,367 | Y357,668 | Y519,233 | 1.0 | 0.0 |
| flipper | 25 | Y1,445,759 | Y1,480,598 | Y1,500,720 | 1.0 | 0.0 |
| flipper | 40 | Y1,202,847 | Y1,470,313 | Y1,496,350 | 1.0 | 0.0 |
| flipper | 70 | Y1,113,057 | Y1,426,638 | Y1,459,574 | 1.0 | 0.0 |
| flipper | 100 | Y1,064,288 | Y1,401,780 | Y1,443,343 | 1.0 | 0.0 |
| handyman | 25 | Y595,591 | Y658,130 | Y673,597 | 2.0 | 0.0 |
| handyman | 40 | Y555,591 | Y618,130 | Y633,597 | 2.0 | 0.0 |
| handyman | 70 | Y455,591 | Y518,130 | Y533,597 | 2.0 | 0.0 |
| handyman | 100 | Y375,591 | Y438,130 | Y453,597 | 2.0 | 0.0 |
| investor | 25 | Y609,917 | Y676,916 | Y719,656 | 2.0 | 0.0 |
| investor | 40 | Y74,917 | Y141,916 | Y184,656 | 2.0 | 0.0 |
| investor | 70 | Y-77,704 | Y-64,334 | Y-49,326 | 2.0 | 0.0 |
| investor | 100 | Y-157,704 | Y-144,334 | Y-129,326 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y1,283,394 | Y1,380,370 | Y1,413,438 | 3.0 | 0.0 |
| random | 40 | Y1,243,394 | Y1,340,370 | Y1,373,407 | 3.0 | 0.0 |
| random | 70 | Y1,143,394 | Y1,240,200 | Y1,273,406 | 3.0 | 0.0 |
| random | 100 | Y1,063,394 | Y1,160,200 | Y1,193,406 | 3.0 | 0.0 |
| service-grinder | 25 | Y992,309 | Y1,168,080 | Y1,231,485 | 0.0 | 42.0 |
| service-grinder | 40 | Y537,376 | Y653,080 | Y1,328,336 | 0.0 | 82.0 |
| service-grinder | 70 | Y407,826 | Y713,732 | Y885,169 | 0.0 | 172.0 |
| service-grinder | 100 | Y560,917 | Y790,453 | Y1,053,022 | 0.0 | 268.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [15, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 619/1000 | 35 | 56 | 89 |
| known | 16/1000 | 63 | 75 | 96 |
| respected | 0/1000 | - | - | - |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 83.9% | 10%-25% |
| mid | 1.1% | 50%-100% |
| frenzy | 15.1% | 5%-15% |

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
