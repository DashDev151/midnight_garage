# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y1,157,480 | Y1,492,390 | Y1,581,015 | 0.0 | 0.0 |
| balanced-player | 40 | Y1,186,987 | Y1,546,446 | Y1,652,769 | 0.0 | 2.0 |
| balanced-player | 70 | Y1,167,555 | Y1,614,076 | Y1,748,507 | 0.0 | 4.0 |
| balanced-player | 100 | Y998,399 | Y1,657,789 | Y1,841,753 | 0.0 | 4.0 |
| cautious-restorer | 25 | Y392,873 | Y473,138 | Y562,748 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y352,873 | Y433,138 | Y522,748 | 2.0 | 0.0 |
| cautious-restorer | 70 | Y252,873 | Y333,138 | Y422,748 | 2.0 | 0.0 |
| cautious-restorer | 100 | Y172,873 | Y253,138 | Y342,748 | 2.0 | 0.0 |
| competent-policy | 25 | Y396,483 | Y501,902 | Y617,544 | 1.0 | 20.0 |
| competent-policy | 40 | Y438,884 | Y582,308 | Y695,903 | 1.0 | 52.0 |
| competent-policy | 70 | Y20,169 | Y254,564 | Y725,799 | 1.0 | 126.0 |
| competent-policy | 100 | Y-38,607 | Y79,192 | Y259,027 | 1.0 | 134.0 |
| flipper | 25 | Y1,143,263 | Y1,494,796 | Y1,517,279 | 0.0 | 2.0 |
| flipper | 40 | Y1,102,210 | Y1,480,239 | Y1,510,400 | 0.0 | 2.0 |
| flipper | 70 | Y714,141 | Y1,413,939 | Y1,473,078 | 0.0 | 4.0 |
| flipper | 100 | Y663,890 | Y1,104,822 | Y1,448,882 | 0.0 | 4.0 |
| handyman | 25 | Y601,675 | Y657,713 | Y676,119 | 2.0 | 0.0 |
| handyman | 40 | Y561,675 | Y617,713 | Y636,119 | 2.0 | 0.0 |
| handyman | 70 | Y461,675 | Y517,713 | Y536,119 | 2.0 | 0.0 |
| handyman | 100 | Y381,675 | Y437,713 | Y456,119 | 2.0 | 0.0 |
| investor | 25 | Y769,278 | Y874,235 | Y894,994 | 2.0 | 0.0 |
| investor | 40 | Y381,160 | Y487,823 | Y508,541 | 2.0 | 0.0 |
| investor | 70 | Y-42,404 | Y-30,424 | Y-19,145 | 2.0 | 0.0 |
| investor | 100 | Y-122,404 | Y-110,424 | Y-99,145 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y1,310,553 | Y1,392,052 | Y1,417,844 | 3.0 | 0.0 |
| random | 40 | Y1,270,553 | Y1,352,052 | Y1,377,844 | 3.0 | 0.0 |
| random | 70 | Y1,170,553 | Y1,252,052 | Y1,277,844 | 3.0 | 0.0 |
| random | 100 | Y1,090,553 | Y1,172,052 | Y1,197,844 | 3.0 | 0.0 |
| service-grinder | 25 | Y1,011,191 | Y1,163,644 | Y1,240,684 | 0.0 | 42.0 |
| service-grinder | 40 | Y534,442 | Y670,314 | Y1,331,353 | 0.0 | 81.0 |
| service-grinder | 70 | Y414,357 | Y728,128 | Y908,349 | 0.0 | 171.0 |
| service-grinder | 100 | Y534,115 | Y731,108 | Y1,051,896 | 0.0 | 267.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [15, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 999/1000 | 11 | 23 | 27 |
| known | 997/1000 | 29 | 40 | 45 |
| respected | 915/1000 | 57 | 67 | 75 |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 93.9% | 10%-25% |
| mid | 1.0% | 50%-100% |
| frenzy | 5.1% | 5%-15% |

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
