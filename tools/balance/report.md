# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y1,196,882 | Y1,502,576 | Y1,569,319 | 1.0 | 0.0 |
| balanced-player | 40 | Y1,156,320 | Y1,513,032 | Y1,596,406 | 1.0 | 0.0 |
| balanced-player | 70 | Y1,123,429 | Y1,490,846 | Y1,608,953 | 1.0 | 0.0 |
| balanced-player | 100 | Y1,114,430 | Y1,454,004 | Y1,622,814 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y393,556 | Y475,074 | Y564,706 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y353,556 | Y435,074 | Y524,706 | 2.0 | 0.0 |
| cautious-restorer | 70 | Y253,556 | Y335,074 | Y424,706 | 2.0 | 0.0 |
| cautious-restorer | 100 | Y173,556 | Y255,074 | Y344,706 | 2.0 | 0.0 |
| competent-policy | 25 | Y351,544 | Y430,935 | Y533,623 | 1.0 | 0.0 |
| competent-policy | 40 | Y332,945 | Y419,814 | Y533,102 | 1.0 | 0.0 |
| competent-policy | 70 | Y281,680 | Y384,716 | Y510,584 | 1.0 | 0.0 |
| competent-policy | 100 | Y240,424 | Y366,022 | Y519,761 | 1.0 | 0.0 |
| flipper | 25 | Y1,450,737 | Y1,489,926 | Y1,512,886 | 1.0 | 0.0 |
| flipper | 40 | Y1,203,415 | Y1,483,217 | Y1,509,950 | 1.0 | 0.0 |
| flipper | 70 | Y1,115,310 | Y1,442,982 | Y1,478,048 | 1.0 | 0.0 |
| flipper | 100 | Y1,085,586 | Y1,418,469 | Y1,460,970 | 1.0 | 0.0 |
| handyman | 25 | Y589,600 | Y654,392 | Y673,264 | 2.0 | 0.0 |
| handyman | 40 | Y549,600 | Y614,392 | Y633,264 | 2.0 | 0.0 |
| handyman | 70 | Y449,600 | Y514,392 | Y533,264 | 2.0 | 0.0 |
| handyman | 100 | Y369,600 | Y434,392 | Y453,264 | 2.0 | 0.0 |
| investor | 25 | Y586,838 | Y644,317 | Y663,873 | 2.0 | 0.0 |
| investor | 40 | Y51,838 | Y109,317 | Y128,873 | 2.0 | 0.0 |
| investor | 70 | Y-88,593 | Y-69,821 | Y-52,248 | 2.0 | 0.0 |
| investor | 100 | Y-168,593 | Y-149,821 | Y-132,248 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y1,294,513 | Y1,385,157 | Y1,413,399 | 3.0 | 0.0 |
| random | 40 | Y1,254,513 | Y1,345,157 | Y1,373,399 | 3.0 | 0.0 |
| random | 70 | Y1,154,513 | Y1,245,157 | Y1,273,399 | 3.0 | 0.0 |
| random | 100 | Y1,074,513 | Y1,165,157 | Y1,193,399 | 3.0 | 0.0 |
| service-grinder | 25 | Y992,309 | Y1,168,080 | Y1,231,485 | 0.0 | 42.0 |
| service-grinder | 40 | Y537,376 | Y653,080 | Y1,328,336 | 0.0 | 82.0 |
| service-grinder | 70 | Y407,826 | Y713,732 | Y885,169 | 0.0 | 172.0 |
| service-grinder | 100 | Y560,917 | Y790,453 | Y1,053,022 | 0.0 | 268.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [15, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 627/1000 | 35 | 55 | 89 |
| known | 25/1000 | 60 | 73 | 92 |
| respected | 0/1000 | - | - | - |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 91.7% | 10%-25% |
| mid | 1.1% | 50%-100% |
| frenzy | 7.2% | 5%-15% |

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
