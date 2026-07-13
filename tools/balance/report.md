# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y852,020 | Y1,251,905 | Y1,534,887 | 1.0 | 0.0 |
| balanced-player | 40 | Y763,255 | Y1,198,992 | Y1,524,704 | 1.0 | 0.0 |
| balanced-player | 70 | Y592,530 | Y1,028,018 | Y1,400,357 | 1.0 | 0.0 |
| balanced-player | 100 | Y445,925 | Y887,406 | Y1,348,111 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y579,874 | Y990,616 | Y1,295,455 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y495,654 | Y870,510 | Y1,205,880 | 2.0 | 2.0 |
| cautious-restorer | 70 | Y320,470 | Y667,894 | Y1,025,866 | 2.0 | 2.0 |
| cautious-restorer | 100 | Y200,863 | Y524,096 | Y931,057 | 2.0 | 2.0 |
| competent-policy | 25 | Y530,756 | Y1,398,172 | Y1,587,980 | 0.0 | 26.0 |
| competent-policy | 40 | Y442,680 | Y1,361,950 | Y1,646,991 | 0.0 | 52.0 |
| competent-policy | 70 | Y473,345 | Y1,489,734 | Y1,748,405 | 0.0 | 127.0 |
| competent-policy | 100 | Y560,837 | Y1,519,846 | Y1,886,452 | 0.0 | 194.0 |
| flipper | 25 | Y1,118,014 | Y1,237,602 | Y1,378,307 | 1.0 | 0.0 |
| flipper | 40 | Y1,008,808 | Y1,142,038 | Y1,307,365 | 1.0 | 0.0 |
| flipper | 70 | Y785,124 | Y984,190 | Y1,171,808 | 1.0 | 0.0 |
| flipper | 100 | Y593,776 | Y824,170 | Y1,068,728 | 1.0 | 0.0 |
| handyman | 25 | Y672,987 | Y1,082,229 | Y1,386,088 | 1.0 | 0.0 |
| handyman | 40 | Y564,211 | Y972,883 | Y1,318,976 | 1.0 | 0.0 |
| handyman | 70 | Y382,409 | Y721,034 | Y1,105,870 | 1.0 | 0.0 |
| handyman | 100 | Y155,188 | Y546,665 | Y948,341 | 1.0 | 0.0 |
| investor | 25 | Y594,125 | Y980,555 | Y1,271,450 | 2.0 | 0.0 |
| investor | 40 | Y523,415 | Y891,054 | Y1,217,031 | 2.0 | 0.0 |
| investor | 70 | Y422,050 | Y783,908 | Y1,116,218 | 2.0 | 0.0 |
| investor | 100 | Y342,050 | Y702,734 | Y1,036,218 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y550,962 | Y998,622 | Y1,415,148 | 2.0 | 0.0 |
| random | 40 | Y480,835 | Y913,070 | Y1,304,885 | 2.0 | 0.0 |
| random | 70 | Y372,495 | Y718,592 | Y1,149,090 | 2.0 | 0.0 |
| random | 100 | Y187,946 | Y547,004 | Y974,093 | 2.0 | 0.0 |
| service-grinder | 25 | Y935,414 | Y1,554,819 | Y1,590,854 | 0.0 | 43.0 |
| service-grinder | 40 | Y353,146 | Y760,460 | Y1,378,363 | 0.0 | 84.0 |
| service-grinder | 70 | Y246,792 | Y459,694 | Y780,666 | 0.0 | 185.0 |
| service-grinder | 100 | Y184,960 | Y453,420 | Y693,197 | 0.0 | 287.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 934/1000 | 10 | 12 | 25 |
| known | 855/1000 | 27 | 33 | 57 |
| respected | 820/1000 | 56 | 64 | 84 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 65.0 |
| flipper | engine | 0.0 |
| handyman | engine | 0.0 |
| investor | engine | 0.0 |
| passive-grinder | engine | 0.0 |
| random | engine | 0.0 |
| service-grinder | suspension | 95.5 |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 7.9% | 10%-25% |
| mid | 57.1% | 50%-100% |
| frenzy | 35.1% | 5%-15% |

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
