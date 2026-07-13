# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y916,377 | Y1,319,280 | Y1,579,970 | 1.0 | 0.0 |
| balanced-player | 40 | Y938,005 | Y1,301,065 | Y1,567,930 | 1.0 | 0.0 |
| balanced-player | 70 | Y811,290 | Y1,186,737 | Y1,522,730 | 1.0 | 0.0 |
| balanced-player | 100 | Y769,109 | Y1,190,658 | Y1,533,532 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y693,583 | Y1,137,428 | Y1,394,633 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y653,112 | Y1,073,732 | Y1,366,623 | 2.0 | 2.0 |
| cautious-restorer | 70 | Y559,071 | Y923,662 | Y1,215,382 | 2.0 | 2.0 |
| cautious-restorer | 100 | Y459,447 | Y820,956 | Y1,133,443 | 2.0 | 2.0 |
| competent-policy | 25 | Y666,243 | Y1,354,092 | Y1,631,297 | 1.0 | 18.0 |
| competent-policy | 40 | Y532,116 | Y1,307,946 | Y1,718,361 | 0.0 | 41.0 |
| competent-policy | 70 | Y605,151 | Y1,406,325 | Y1,885,657 | 0.0 | 105.0 |
| competent-policy | 100 | Y637,972 | Y1,545,884 | Y2,094,201 | 0.0 | 174.5 |
| flipper | 25 | Y1,173,102 | Y1,281,624 | Y1,415,963 | 1.0 | 0.0 |
| flipper | 40 | Y1,113,708 | Y1,231,446 | Y1,374,352 | 1.0 | 0.0 |
| flipper | 70 | Y946,325 | Y1,109,321 | Y1,306,758 | 1.0 | 0.0 |
| flipper | 100 | Y830,523 | Y1,039,448 | Y1,265,270 | 1.0 | 0.0 |
| handyman | 25 | Y757,484 | Y1,155,650 | Y1,414,995 | 2.0 | 0.0 |
| handyman | 40 | Y707,537 | Y1,106,159 | Y1,386,180 | 2.0 | 0.0 |
| handyman | 70 | Y570,698 | Y955,798 | Y1,245,495 | 2.0 | 0.0 |
| handyman | 100 | Y498,300 | Y827,623 | Y1,159,255 | 2.0 | 0.0 |
| investor | 25 | Y677,105 | Y1,064,620 | Y1,291,941 | 2.0 | 0.0 |
| investor | 40 | Y621,932 | Y994,857 | Y1,243,156 | 2.0 | 0.0 |
| investor | 70 | Y517,813 | Y888,522 | Y1,140,198 | 2.0 | 0.0 |
| investor | 100 | Y437,813 | Y808,522 | Y1,060,198 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y618,153 | Y1,069,929 | Y1,432,681 | 2.0 | 0.0 |
| random | 40 | Y594,592 | Y1,040,472 | Y1,382,987 | 2.0 | 0.0 |
| random | 70 | Y508,021 | Y902,390 | Y1,247,350 | 3.0 | 0.0 |
| random | 100 | Y430,563 | Y779,880 | Y1,166,998 | 3.0 | 0.0 |
| service-grinder | 25 | Y953,236 | Y1,600,086 | Y1,638,958 | 0.0 | 43.0 |
| service-grinder | 40 | Y453,247 | Y988,925 | Y1,520,302 | 0.0 | 83.5 |
| service-grinder | 70 | Y315,460 | Y599,552 | Y937,313 | 0.0 | 185.0 |
| service-grinder | 100 | Y305,455 | Y559,899 | Y907,191 | 0.0 | 294.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 868/1000 | 10 | 13 | 29 |
| known | 763/1000 | 27 | 40 | 62 |
| respected | 700/1000 | 57 | 69 | 88 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 57.0 |
| flipper | engine | 0.0 |
| handyman | engine | 0.0 |
| investor | engine | 0.0 |
| passive-grinder | engine | 0.0 |
| random | engine | 0.0 |
| service-grinder | suspension | 100.0 |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 20.0% | 10%-25% |
| mid | 49.2% | 50%-100% |
| frenzy | 30.8% | 5%-15% |

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

`balance.cli check` hard-gates 5 checks against this data: days-to-`local` p50 in [10, 35] (competent-policy probe), buyout share of acquisitions < 30%, and the 3 legacy Sprint 03/09 checks (Passive Grinder solvency, Flipper-vs-Passive separation, sanity floor). 3 more are measured and reported but NOT gated - real measurement showed every active strategy's day-100 cash below Passive Grinder's, Flipper below its own starting cash, and the auction frenzy tail outside its target band; see `invariants.py`'s module docstring for the full disclosure rather than a silently loosened band.
