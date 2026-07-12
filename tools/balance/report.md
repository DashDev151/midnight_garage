# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y28,201 | Y193,842 | Y578,557 | 1.0 | 0.0 |
| balanced-player | 40 | Y-11,799 | Y134,988 | Y390,267 | 1.0 | 0.0 |
| balanced-player | 70 | Y-111,799 | Y31,359 | Y290,918 | 1.0 | 0.0 |
| balanced-player | 100 | Y-191,799 | Y-48,641 | Y226,914 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y-18,675 | Y85,626 | Y312,800 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y-58,675 | Y33,825 | Y250,170 | 2.0 | 0.0 |
| cautious-restorer | 70 | Y-158,675 | Y-66,375 | Y147,552 | 2.0 | 0.0 |
| cautious-restorer | 100 | Y-238,675 | Y-146,375 | Y67,552 | 2.0 | 0.0 |
| competent-policy | 25 | Y8,351 | Y365,006 | Y1,528,589 | 0.0 | 33.0 |
| competent-policy | 40 | Y-29,890 | Y384,565 | Y1,555,461 | 0.0 | 69.0 |
| competent-policy | 70 | Y-129,890 | Y458,269 | Y1,649,748 | 0.0 | 158.0 |
| competent-policy | 100 | Y-209,890 | Y521,628 | Y1,784,636 | 0.0 | 224.0 |
| flipper | 25 | Y17,268 | Y155,506 | Y362,478 | 2.0 | 0.0 |
| flipper | 40 | Y-16,406 | Y103,479 | Y301,549 | 1.0 | 0.0 |
| flipper | 70 | Y-116,406 | Y43,628 | Y243,290 | 1.0 | 0.0 |
| flipper | 100 | Y-196,406 | Y15,442 | Y207,154 | 1.0 | 0.0 |
| handyman | 25 | Y-60,000 | Y9,065 | Y242,173 | 2.0 | 0.0 |
| handyman | 40 | Y-100,000 | Y-30,935 | Y198,350 | 2.0 | 0.0 |
| handyman | 70 | Y-200,000 | Y-130,935 | Y98,350 | 2.0 | 0.0 |
| handyman | 100 | Y-280,000 | Y-210,935 | Y18,350 | 2.0 | 0.0 |
| investor | 25 | Y383,000 | Y645,750 | Y703,900 | 2.0 | 0.0 |
| investor | 40 | Y8,888 | Y110,750 | Y168,900 | 2.0 | 0.0 |
| investor | 70 | Y-93,800 | Y-70,658 | Y-50,843 | 2.0 | 0.0 |
| investor | 100 | Y-173,800 | Y-150,658 | Y-130,843 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y-8,479 | Y142,377 | Y354,630 | 2.0 | 0.0 |
| random | 40 | Y-48,479 | Y86,802 | Y261,300 | 2.0 | 0.0 |
| random | 70 | Y-148,479 | Y-13,198 | Y160,397 | 2.0 | 0.0 |
| random | 100 | Y-228,479 | Y-93,198 | Y80,397 | 2.0 | 0.0 |
| service-grinder | 25 | Y684,597 | Y1,280,474 | Y1,548,914 | 0.0 | 51.0 |
| service-grinder | 40 | Y224,846 | Y573,852 | Y980,277 | 0.0 | 97.0 |
| service-grinder | 70 | Y149,128 | Y324,398 | Y580,465 | 0.0 | 200.0 |
| service-grinder | 100 | Y195,817 | Y382,851 | Y554,988 | 0.0 | 279.5 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 862/1000 | 8 | 12 | 21 |
| known | 747/1000 | 24 | 30 | 37 |
| respected | 729/1000 | 50 | 55 | 63 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 76.0 |
| flipper | engine | 0.0 |
| handyman | engine | 0.0 |
| investor | engine | 0.0 |
| passive-grinder | engine | 0.0 |
| random | engine | 0.0 |
| service-grinder | suspension | 91.0 |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 61.4% | 10%-25% |
| mid | 7.1% | 50%-100% |
| frenzy | 31.5% | 5%-15% |

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
