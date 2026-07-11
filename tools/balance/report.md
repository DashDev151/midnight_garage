# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y458,975 | Y785,120 | Y1,317,425 | 0.0 | 0.0 |
| balanced-player | 40 | Y364,541 | Y669,072 | Y1,148,174 | 0.0 | 0.0 |
| balanced-player | 70 | Y228,822 | Y557,600 | Y1,068,366 | 0.0 | 0.0 |
| balanced-player | 100 | Y149,254 | Y534,996 | Y1,171,627 | 0.0 | 0.0 |
| cautious-restorer | 25 | Y1,894 | Y93,000 | Y251,000 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y-38,106 | Y13,000 | Y171,000 | 2.0 | 0.0 |
| cautious-restorer | 70 | Y-138,106 | Y-87,000 | Y-9,000 | 2.0 | 0.0 |
| cautious-restorer | 100 | Y-218,106 | Y-167,000 | Y-89,000 | 2.0 | 0.0 |
| competent-policy | 25 | Y136,204 | Y187,163 | Y409,054 | 1.0 | 8.0 |
| competent-policy | 40 | Y113,572 | Y176,166 | Y373,166 | 1.0 | 16.0 |
| competent-policy | 70 | Y48,839 | Y120,362 | Y299,400 | 1.0 | 40.0 |
| competent-policy | 100 | Y20,595 | Y101,299 | Y252,863 | 1.0 | 64.0 |
| flipper | 25 | Y444,967 | Y741,680 | Y1,215,751 | 0.0 | 0.0 |
| flipper | 40 | Y360,341 | Y623,686 | Y988,776 | 0.0 | 0.0 |
| flipper | 70 | Y158,824 | Y445,318 | Y702,574 | 0.0 | 0.0 |
| flipper | 100 | Y22,280 | Y274,837 | Y555,910 | 0.0 | 0.0 |
| handyman | 25 | Y30,000 | Y133,558 | Y262,000 | 2.0 | 0.0 |
| handyman | 40 | Y-10,000 | Y92,738 | Y222,000 | 2.0 | 0.0 |
| handyman | 70 | Y-110,000 | Y-7,262 | Y122,000 | 2.0 | 0.0 |
| handyman | 100 | Y-190,000 | Y-87,262 | Y42,000 | 2.0 | 0.0 |
| investor | 25 | Y3,000 | Y48,000 | Y548,000 | 2.0 | 0.0 |
| investor | 40 | Y-37,000 | Y-3,104 | Y155,074 | 2.0 | 0.0 |
| investor | 70 | Y-137,000 | Y-103,104 | Y-42,000 | 2.0 | 0.0 |
| investor | 100 | Y-217,000 | Y-183,104 | Y-122,000 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y418,428 | Y806,000 | Y1,112,000 | 3.0 | 0.0 |
| random | 40 | Y342,883 | Y713,838 | Y1,028,000 | 3.0 | 0.0 |
| random | 70 | Y150,428 | Y532,572 | Y844,000 | 3.0 | 0.0 |
| random | 100 | Y-10,000 | Y351,896 | Y668,000 | 3.0 | 0.0 |
| service-grinder | 25 | Y1,045,650 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| service-grinder | 40 | Y684,075 | Y1,100,357 | Y1,400,000 | 0.0 | 0.0 |
| service-grinder | 70 | Y316,259 | Y952,158 | Y1,300,000 | 0.0 | 16.0 |
| service-grinder | 100 | Y217,341 | Y641,728 | Y1,220,000 | 0.0 | 40.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [15, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 983/1000 | 18 | 30 | 57 |
| known | 652/1000 | 53 | 73 | 94 |
| respected | 22/1000 | 83 | 94 | 99 |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 10.7% | 10%-25% |
| mid | 68.7% | 50%-100% |
| frenzy | 20.6% | 5%-15% |

## Buyout vs. bid (external review 2026-07, finding 2)

Share of successful auction acquisitions made via instant buyout vs. a won competitive bid, per strategy. A strategy near 100% buyout means the bidding screen is effectively dead for it and `AUCTION_BUYOUT_PREMIUM` (currently a 25% premium over the value anchor, Sprint 20) is cheap enough that certainty always wins. Bots never buy out as of Sprint 20 (buyout is a player-impatience valve only), so this section's bot-side numbers are expected to read as 0% buyout going forward — kept for the player-side telemetry hook and as a regression check that bots really have stopped buying out.

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
