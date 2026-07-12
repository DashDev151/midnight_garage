# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y1,191,929 | Y1,499,405 | Y1,565,297 | 1.0 | 0.0 |
| balanced-player | 40 | Y1,159,930 | Y1,507,428 | Y1,586,800 | 1.0 | 0.0 |
| balanced-player | 70 | Y1,113,060 | Y1,481,134 | Y1,590,430 | 1.0 | 0.0 |
| balanced-player | 100 | Y1,095,352 | Y1,439,028 | Y1,599,552 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y398,283 | Y477,668 | Y568,447 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y358,283 | Y437,668 | Y528,447 | 2.0 | 0.0 |
| cautious-restorer | 70 | Y258,283 | Y337,668 | Y428,447 | 2.0 | 0.0 |
| cautious-restorer | 100 | Y178,283 | Y257,668 | Y348,447 | 2.0 | 0.0 |
| competent-policy | 25 | Y352,475 | Y432,570 | Y534,644 | 1.0 | 0.0 |
| competent-policy | 40 | Y334,756 | Y420,444 | Y534,869 | 1.0 | 0.0 |
| competent-policy | 70 | Y283,915 | Y386,846 | Y512,072 | 1.0 | 0.0 |
| competent-policy | 100 | Y241,420 | Y367,164 | Y522,242 | 1.0 | 0.0 |
| flipper | 25 | Y1,446,833 | Y1,484,571 | Y1,505,209 | 1.0 | 0.0 |
| flipper | 40 | Y1,189,904 | Y1,473,241 | Y1,499,017 | 1.0 | 0.0 |
| flipper | 70 | Y1,098,744 | Y1,425,491 | Y1,459,611 | 1.0 | 0.0 |
| flipper | 100 | Y1,062,958 | Y1,396,342 | Y1,434,714 | 1.0 | 0.0 |
| handyman | 25 | Y598,979 | Y656,950 | Y676,113 | 2.0 | 0.0 |
| handyman | 40 | Y558,979 | Y616,950 | Y636,113 | 2.0 | 0.0 |
| handyman | 70 | Y458,979 | Y516,950 | Y536,113 | 2.0 | 0.0 |
| handyman | 100 | Y378,979 | Y436,950 | Y456,113 | 2.0 | 0.0 |
| investor | 25 | Y592,748 | Y646,346 | Y666,874 | 2.0 | 0.0 |
| investor | 40 | Y57,748 | Y111,346 | Y131,874 | 2.0 | 0.0 |
| investor | 70 | Y-86,842 | Y-67,447 | Y-50,865 | 2.0 | 0.0 |
| investor | 100 | Y-166,842 | Y-147,447 | Y-130,865 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y1,303,525 | Y1,390,994 | Y1,417,490 | 3.0 | 0.0 |
| random | 40 | Y1,263,525 | Y1,350,994 | Y1,377,490 | 3.0 | 0.0 |
| random | 70 | Y1,163,525 | Y1,250,994 | Y1,277,490 | 3.0 | 0.0 |
| random | 100 | Y1,083,525 | Y1,170,994 | Y1,197,490 | 3.0 | 0.0 |
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
| steal | 92.9% | 10%-25% |
| mid | 1.1% | 50%-100% |
| frenzy | 6.0% | 5%-15% |

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
