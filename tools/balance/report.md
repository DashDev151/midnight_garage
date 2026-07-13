# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y912,630 | Y1,318,238 | Y1,575,782 | 1.0 | 0.0 |
| balanced-player | 40 | Y936,399 | Y1,298,651 | Y1,567,930 | 1.0 | 0.0 |
| balanced-player | 70 | Y809,069 | Y1,187,546 | Y1,522,730 | 1.0 | 0.0 |
| balanced-player | 100 | Y772,841 | Y1,189,142 | Y1,529,979 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y693,583 | Y1,137,632 | Y1,395,710 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y653,112 | Y1,075,400 | Y1,366,623 | 2.0 | 2.0 |
| cautious-restorer | 70 | Y559,964 | Y925,593 | Y1,218,963 | 2.0 | 2.0 |
| cautious-restorer | 100 | Y461,221 | Y834,988 | Y1,139,516 | 2.0 | 2.0 |
| competent-policy | 25 | Y951,450 | Y1,431,842 | Y1,635,005 | 1.0 | 18.0 |
| competent-policy | 40 | Y847,071 | Y1,474,962 | Y1,727,945 | 0.0 | 40.0 |
| competent-policy | 70 | Y849,872 | Y1,666,346 | Y1,911,410 | 0.0 | 86.0 |
| competent-policy | 100 | Y845,323 | Y1,770,799 | Y2,131,182 | 0.0 | 145.0 |
| flipper | 25 | Y1,173,909 | Y1,282,640 | Y1,414,527 | 1.0 | 0.0 |
| flipper | 40 | Y1,112,922 | Y1,230,272 | Y1,375,386 | 1.0 | 0.0 |
| flipper | 70 | Y945,858 | Y1,109,286 | Y1,303,840 | 1.0 | 0.0 |
| flipper | 100 | Y830,575 | Y1,038,746 | Y1,266,959 | 1.0 | 0.0 |
| handyman | 25 | Y757,484 | Y1,156,962 | Y1,424,215 | 2.0 | 0.0 |
| handyman | 40 | Y706,786 | Y1,108,154 | Y1,390,010 | 2.0 | 0.0 |
| handyman | 70 | Y570,698 | Y956,326 | Y1,245,842 | 2.0 | 0.0 |
| handyman | 100 | Y501,645 | Y827,623 | Y1,164,553 | 2.0 | 0.0 |
| investor | 25 | Y677,105 | Y1,064,620 | Y1,291,941 | 2.0 | 0.0 |
| investor | 40 | Y621,932 | Y994,857 | Y1,243,156 | 2.0 | 0.0 |
| investor | 70 | Y517,813 | Y888,522 | Y1,140,198 | 2.0 | 0.0 |
| investor | 100 | Y437,813 | Y808,522 | Y1,060,198 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y621,387 | Y1,077,682 | Y1,427,127 | 2.0 | 0.0 |
| random | 40 | Y596,357 | Y1,040,472 | Y1,382,987 | 2.0 | 0.0 |
| random | 70 | Y505,453 | Y904,740 | Y1,249,347 | 3.0 | 0.0 |
| random | 100 | Y435,662 | Y782,456 | Y1,172,604 | 3.0 | 0.0 |
| service-grinder | 25 | Y1,580,271 | Y1,617,834 | Y1,648,762 | 0.0 | 43.0 |
| service-grinder | 40 | Y1,620,908 | Y1,686,904 | Y1,729,448 | 0.0 | 73.0 |
| service-grinder | 70 | Y918,243 | Y1,748,018 | Y1,841,149 | 0.0 | 131.0 |
| service-grinder | 100 | Y876,613 | Y1,554,494 | Y1,962,258 | 0.0 | 193.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 879/1000 | 10 | 13 | 28 |
| known | 748/1000 | 27 | 40 | 66 |
| respected | 627/1000 | 57 | 72 | 92 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 49.0 |
| flipper | engine | 0.0 |
| handyman | engine | 0.0 |
| investor | engine | 0.0 |
| passive-grinder | engine | 0.0 |
| random | engine | 0.0 |
| service-grinder | engine | 64.0 |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 19.9% | 10%-25% |
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
