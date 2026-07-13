# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y356,694 | Y643,653 | Y1,064,727 | 1.0 | 0.0 |
| balanced-player | 40 | Y239,860 | Y516,728 | Y904,070 | 1.0 | 0.0 |
| balanced-player | 70 | Y66,212 | Y283,974 | Y675,030 | 0.0 | 0.0 |
| balanced-player | 100 | Y-19,928 | Y110,888 | Y466,044 | 0.0 | 0.0 |
| cautious-restorer | 25 | Y23,993 | Y203,644 | Y546,538 | 1.0 | 0.0 |
| cautious-restorer | 40 | Y-20,613 | Y137,150 | Y413,621 | 1.0 | 1.0 |
| cautious-restorer | 70 | Y-120,613 | Y7,555 | Y252,271 | 1.0 | 1.5 |
| cautious-restorer | 100 | Y-200,613 | Y-71,812 | Y159,157 | 1.0 | 1.0 |
| competent-policy | 25 | Y267,364 | Y886,455 | Y1,584,100 | 0.0 | 26.5 |
| competent-policy | 40 | Y244,873 | Y960,968 | Y1,643,080 | 0.0 | 53.0 |
| competent-policy | 70 | Y251,767 | Y1,218,124 | Y1,744,615 | 0.0 | 132.5 |
| competent-policy | 100 | Y222,570 | Y1,322,708 | Y1,881,800 | 0.0 | 206.0 |
| flipper | 25 | Y265,652 | Y390,254 | Y590,646 | 1.0 | 0.0 |
| flipper | 40 | Y147,416 | Y299,722 | Y489,929 | 1.0 | 0.0 |
| flipper | 70 | Y-22,182 | Y115,130 | Y340,961 | 1.0 | 0.0 |
| flipper | 100 | Y-102,182 | Y-7,306 | Y234,270 | 1.0 | 0.0 |
| handyman | 25 | Y-60,000 | Y-60,000 | Y179,680 | 0.0 | 0.0 |
| handyman | 40 | Y-100,000 | Y-100,000 | Y141,293 | 0.0 | 0.0 |
| handyman | 70 | Y-200,000 | Y-200,000 | Y33,863 | 0.0 | 0.0 |
| handyman | 100 | Y-280,000 | Y-280,000 | Y-46,137 | 0.0 | 0.0 |
| investor | 25 | Y594,125 | Y980,555 | Y1,271,450 | 2.0 | 0.0 |
| investor | 40 | Y523,415 | Y891,054 | Y1,217,031 | 2.0 | 0.0 |
| investor | 70 | Y422,050 | Y783,908 | Y1,116,218 | 2.0 | 0.0 |
| investor | 100 | Y342,050 | Y702,734 | Y1,036,218 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y172,390 | Y417,448 | Y864,361 | 2.0 | 0.0 |
| random | 40 | Y75,439 | Y283,886 | Y645,530 | 1.0 | 0.0 |
| random | 70 | Y-41,333 | Y141,558 | Y460,041 | 1.0 | 0.0 |
| random | 100 | Y-121,333 | Y40,457 | Y235,891 | 1.0 | 0.0 |
| service-grinder | 25 | Y935,414 | Y1,554,819 | Y1,590,854 | 0.0 | 43.0 |
| service-grinder | 40 | Y353,146 | Y760,460 | Y1,378,363 | 0.0 | 84.0 |
| service-grinder | 70 | Y246,792 | Y459,694 | Y780,666 | 0.0 | 185.0 |
| service-grinder | 100 | Y184,960 | Y453,420 | Y693,197 | 0.0 | 287.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 935/1000 | 10 | 12 | 25 |
| known | 855/1000 | 27 | 33 | 52 |
| respected | 842/1000 | 56 | 64 | 80 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 71.5 |
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
| steal | 8.8% | 10%-25% |
| mid | 56.3% | 50%-100% |
| frenzy | 34.9% | 5%-15% |

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
