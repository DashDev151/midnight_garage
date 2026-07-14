# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y986,780 | Y1,386,737 | Y1,618,640 | 1.0 | 0.0 |
| balanced-player | 40 | Y1,010,624 | Y1,400,897 | Y1,651,367 | 1.0 | 0.0 |
| balanced-player | 70 | Y1,023,542 | Y1,378,434 | Y1,664,363 | 1.0 | 0.0 |
| balanced-player | 100 | Y1,124,194 | Y1,454,340 | Y1,751,281 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y751,281 | Y1,180,368 | Y1,440,447 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y726,113 | Y1,128,315 | Y1,419,943 | 2.0 | 2.0 |
| cautious-restorer | 70 | Y636,119 | Y1,038,551 | Y1,347,992 | 2.0 | 2.0 |
| cautious-restorer | 100 | Y562,894 | Y977,146 | Y1,320,726 | 2.0 | 2.0 |
| competent-policy | 25 | Y931,691 | Y1,528,408 | Y1,658,424 | 0.0 | 26.0 |
| competent-policy | 40 | Y800,895 | Y1,615,536 | Y1,785,131 | 0.0 | 43.0 |
| competent-policy | 70 | Y906,814 | Y1,822,198 | Y2,013,092 | 0.0 | 104.0 |
| competent-policy | 100 | Y893,051 | Y1,986,381 | Y2,319,628 | 0.0 | 156.0 |
| flipper | 25 | Y1,190,353 | Y1,326,086 | Y1,455,947 | 1.0 | 0.0 |
| flipper | 40 | Y1,182,338 | Y1,334,258 | Y1,479,515 | 1.0 | 0.0 |
| flipper | 70 | Y1,151,433 | Y1,304,534 | Y1,455,515 | 1.0 | 0.0 |
| flipper | 100 | Y1,154,456 | Y1,317,295 | Y1,492,225 | 1.0 | 0.0 |
| handyman | 25 | Y796,520 | Y1,225,658 | Y1,467,901 | 1.0 | 0.0 |
| handyman | 40 | Y821,158 | Y1,205,540 | Y1,464,921 | 2.0 | 0.0 |
| handyman | 70 | Y740,445 | Y1,110,476 | Y1,385,981 | 2.0 | 0.0 |
| handyman | 100 | Y722,311 | Y1,086,811 | Y1,397,246 | 2.0 | 0.0 |
| investor | 25 | Y634,582 | Y1,053,568 | Y1,278,621 | 2.0 | 0.0 |
| investor | 40 | Y567,296 | Y969,678 | Y1,208,820 | 2.0 | 0.0 |
| investor | 70 | Y461,244 | Y862,638 | Y1,100,552 | 2.0 | 0.0 |
| investor | 100 | Y381,244 | Y782,638 | Y1,020,552 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y633,251 | Y1,118,053 | Y1,468,955 | 2.0 | 0.0 |
| random | 40 | Y667,193 | Y1,101,845 | Y1,440,149 | 2.0 | 0.0 |
| random | 70 | Y641,373 | Y1,050,270 | Y1,416,958 | 3.0 | 0.0 |
| random | 100 | Y583,427 | Y1,022,936 | Y1,446,667 | 3.0 | 0.0 |
| service-grinder | 25 | Y1,572,226 | Y1,631,826 | Y1,675,025 | 0.0 | 43.0 |
| service-grinder | 40 | Y1,600,880 | Y1,709,776 | Y1,770,856 | 0.0 | 73.0 |
| service-grinder | 70 | Y993,420 | Y1,774,982 | Y1,906,577 | 0.0 | 131.0 |
| service-grinder | 100 | Y937,177 | Y1,565,248 | Y2,057,955 | 0.0 | 193.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 915/1000 | 10 | 12 | 27 |
| known | 797/1000 | 27 | 35 | 63 |
| respected | 681/1000 | 56 | 69 | 90 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 53.0 |
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
| steal | 6.5% | 10%-25% |
| mid | 58.2% | 50%-100% |
| frenzy | 35.3% | 5%-15% |

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
