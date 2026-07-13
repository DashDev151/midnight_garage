# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y406,565 | Y718,832 | Y1,010,692 | 1.0 | 0.0 |
| balanced-player | 40 | Y395,942 | Y654,240 | Y940,413 | 1.0 | 0.0 |
| balanced-player | 70 | Y266,322 | Y511,308 | Y807,949 | 1.0 | 0.0 |
| balanced-player | 100 | Y167,768 | Y414,014 | Y729,168 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y147,188 | Y283,676 | Y580,428 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y121,387 | Y255,559 | Y513,792 | 2.0 | 0.0 |
| cautious-restorer | 70 | Y21,076 | Y145,774 | Y373,112 | 2.0 | 0.0 |
| cautious-restorer | 100 | Y-53,920 | Y78,453 | Y291,712 | 2.0 | 0.0 |
| competent-policy | 25 | Y307,037 | Y578,230 | Y1,597,185 | 0.0 | 23.0 |
| competent-policy | 40 | Y266,996 | Y616,926 | Y1,667,664 | 0.0 | 49.0 |
| competent-policy | 70 | Y188,593 | Y785,666 | Y1,815,806 | 0.0 | 129.0 |
| competent-policy | 100 | Y108,593 | Y946,879 | Y2,001,155 | 0.0 | 200.0 |
| flipper | 25 | Y334,466 | Y472,332 | Y652,834 | 2.0 | 0.0 |
| flipper | 40 | Y291,153 | Y442,824 | Y610,161 | 2.0 | 0.0 |
| flipper | 70 | Y201,453 | Y358,404 | Y544,007 | 2.0 | 0.0 |
| flipper | 100 | Y169,932 | Y319,648 | Y509,883 | 1.0 | 0.0 |
| handyman | 25 | Y-60,000 | Y-12,679 | Y246,849 | 0.0 | 0.0 |
| handyman | 40 | Y-100,000 | Y-52,679 | Y189,839 | 0.0 | 0.0 |
| handyman | 70 | Y-200,000 | Y-152,679 | Y110,319 | 0.0 | 0.0 |
| handyman | 100 | Y-280,000 | Y-232,679 | Y38,321 | 0.0 | 0.0 |
| investor | 25 | Y563,134 | Y939,415 | Y1,195,844 | 2.0 | 0.0 |
| investor | 40 | Y517,993 | Y880,721 | Y1,148,383 | 2.0 | 0.0 |
| investor | 70 | Y417,993 | Y778,072 | Y1,044,837 | 2.0 | 0.0 |
| investor | 100 | Y337,993 | Y698,072 | Y964,837 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y220,151 | Y433,182 | Y824,064 | 2.0 | 0.0 |
| random | 40 | Y186,102 | Y367,506 | Y610,860 | 2.0 | 0.0 |
| random | 70 | Y88,960 | Y259,650 | Y501,484 | 2.0 | 0.0 |
| random | 100 | Y21,988 | Y175,954 | Y399,993 | 2.0 | 0.0 |
| service-grinder | 25 | Y924,255 | Y1,556,172 | Y1,610,506 | 0.0 | 43.0 |
| service-grinder | 40 | Y356,820 | Y737,922 | Y1,396,203 | 0.0 | 83.0 |
| service-grinder | 70 | Y258,507 | Y498,408 | Y809,384 | 0.0 | 180.0 |
| service-grinder | 100 | Y78,329 | Y494,340 | Y809,367 | 0.0 | 274.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 883/1000 | 10 | 13 | 27 |
| known | 818/1000 | 27 | 37 | 54 |
| respected | 795/1000 | 57 | 64 | 80 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 70.0 |
| flipper | engine | 0.0 |
| handyman | engine | 0.0 |
| investor | engine | 0.0 |
| passive-grinder | engine | 0.0 |
| random | engine | 0.0 |
| service-grinder | suspension | 92.0 |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 19.6% | 10%-25% |
| mid | 48.3% | 50%-100% |
| frenzy | 32.1% | 5%-15% |

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
