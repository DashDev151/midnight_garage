# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y1,041,410 | Y1,399,293 | Y1,638,841 | 1.0 | 0.0 |
| balanced-player | 40 | Y1,078,731 | Y1,453,846 | Y1,689,984 | 1.0 | 0.0 |
| balanced-player | 70 | Y1,107,427 | Y1,466,446 | Y1,759,270 | 1.0 | 0.0 |
| balanced-player | 100 | Y1,245,374 | Y1,591,740 | Y1,912,549 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y781,070 | Y1,186,972 | Y1,467,532 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y788,381 | Y1,187,786 | Y1,472,687 | 2.0 | 2.0 |
| cautious-restorer | 70 | Y722,595 | Y1,121,034 | Y1,456,688 | 2.0 | 2.0 |
| cautious-restorer | 100 | Y639,767 | Y1,064,228 | Y1,470,220 | 2.0 | 2.0 |
| competent-policy | 25 | Y982,778 | Y1,545,726 | Y1,666,101 | 0.0 | 26.0 |
| competent-policy | 40 | Y799,778 | Y1,630,199 | Y1,803,205 | 0.0 | 43.0 |
| competent-policy | 70 | Y959,397 | Y1,870,632 | Y2,139,676 | 0.0 | 98.0 |
| competent-policy | 100 | Y951,217 | Y2,046,852 | Y2,437,085 | 0.0 | 153.0 |
| flipper | 25 | Y1,202,528 | Y1,335,405 | Y1,460,474 | 1.0 | 0.0 |
| flipper | 40 | Y1,206,863 | Y1,348,984 | Y1,487,817 | 1.0 | 0.0 |
| flipper | 70 | Y1,159,974 | Y1,319,635 | Y1,466,434 | 1.0 | 0.0 |
| flipper | 100 | Y1,174,528 | Y1,331,581 | Y1,503,820 | 1.0 | 0.0 |
| handyman | 25 | Y847,660 | Y1,246,447 | Y1,489,242 | 1.0 | 0.0 |
| handyman | 40 | Y898,225 | Y1,267,108 | Y1,552,544 | 1.0 | 0.0 |
| handyman | 70 | Y916,427 | Y1,249,552 | Y1,546,949 | 2.0 | 0.0 |
| handyman | 100 | Y944,492 | Y1,281,496 | Y1,605,927 | 2.0 | 0.0 |
| investor | 25 | Y663,018 | Y1,066,840 | Y1,278,163 | 2.0 | 0.0 |
| investor | 40 | Y595,575 | Y1,000,398 | Y1,216,274 | 2.0 | 0.0 |
| investor | 70 | Y487,040 | Y897,234 | Y1,114,180 | 2.0 | 0.0 |
| investor | 100 | Y407,040 | Y816,088 | Y1,033,611 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y686,063 | Y1,157,258 | Y1,515,415 | 2.0 | 0.0 |
| random | 40 | Y763,187 | Y1,185,930 | Y1,537,706 | 2.0 | 0.0 |
| random | 70 | Y788,798 | Y1,226,578 | Y1,618,012 | 2.0 | 0.0 |
| random | 100 | Y858,573 | Y1,287,638 | Y1,705,471 | 2.0 | 0.0 |
| service-grinder | 25 | Y1,572,226 | Y1,631,952 | Y1,675,786 | 0.0 | 43.0 |
| service-grinder | 40 | Y1,594,377 | Y1,709,274 | Y1,771,259 | 0.0 | 73.0 |
| service-grinder | 70 | Y986,726 | Y1,753,822 | Y1,904,844 | 0.0 | 132.0 |
| service-grinder | 100 | Y929,611 | Y1,556,782 | Y2,051,804 | 0.0 | 196.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 940/1000 | 10 | 12 | 27 |
| known | 819/1000 | 27 | 37 | 65 |
| respected | 674/1000 | 57 | 71 | 91 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 52.0 |
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
| steal | 7.3% | 10%-25% |
| mid | 56.6% | 50%-100% |
| frenzy | 36.1% | 5%-15% |

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
