# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y1,112,195 | Y1,479,790 | Y1,736,953 | 1.0 | 0.0 |
| balanced-player | 40 | Y1,263,836 | Y1,596,810 | Y1,864,484 | 1.0 | 0.0 |
| balanced-player | 70 | Y1,399,530 | Y1,737,054 | Y2,047,234 | 1.0 | 0.0 |
| balanced-player | 100 | Y1,567,764 | Y1,929,588 | Y2,280,461 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y834,706 | Y1,203,622 | Y1,474,305 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y804,767 | Y1,191,716 | Y1,509,381 | 2.0 | 1.0 |
| cautious-restorer | 70 | Y772,610 | Y1,163,334 | Y1,530,556 | 2.0 | 2.0 |
| cautious-restorer | 100 | Y697,936 | Y1,120,306 | Y1,549,399 | 2.0 | 2.0 |
| competent-policy | 25 | Y1,002,761 | Y1,472,588 | Y1,654,974 | 1.0 | 16.0 |
| competent-policy | 40 | Y865,091 | Y1,518,197 | Y1,795,794 | 1.0 | 30.0 |
| competent-policy | 70 | Y891,895 | Y1,740,508 | Y2,130,374 | 0.0 | 52.5 |
| competent-policy | 100 | Y892,253 | Y1,871,647 | Y2,484,003 | 0.0 | 100.5 |
| flipper | 25 | Y1,266,744 | Y1,397,440 | Y1,535,876 | 1.0 | 0.0 |
| flipper | 40 | Y1,311,634 | Y1,450,840 | Y1,594,127 | 1.0 | 0.0 |
| flipper | 70 | Y1,342,390 | Y1,490,929 | Y1,651,635 | 1.0 | 0.0 |
| flipper | 100 | Y1,402,306 | Y1,579,076 | Y1,742,350 | 1.0 | 0.0 |
| handyman | 25 | Y890,255 | Y1,248,081 | Y1,528,047 | 2.0 | 0.0 |
| handyman | 40 | Y948,212 | Y1,293,066 | Y1,578,621 | 2.0 | 0.0 |
| handyman | 70 | Y999,227 | Y1,346,476 | Y1,659,239 | 2.0 | 0.0 |
| handyman | 100 | Y1,006,349 | Y1,396,324 | Y1,746,058 | 2.0 | 0.0 |
| investor | 25 | Y740,722 | Y1,099,298 | Y1,274,038 | 2.0 | 0.0 |
| investor | 40 | Y698,500 | Y1,049,542 | Y1,229,391 | 2.0 | 0.0 |
| investor | 70 | Y598,500 | Y949,542 | Y1,129,391 | 2.0 | 0.0 |
| investor | 100 | Y518,500 | Y869,542 | Y1,049,391 | 2.0 | 0.0 |
| passive-grinder | 25 | Y1,440,000 | Y1,440,000 | Y1,440,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,400,000 | Y1,400,000 | Y1,400,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,300,000 | Y1,300,000 | Y1,300,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,220,000 | Y1,220,000 | Y1,220,000 | 0.0 | 0.0 |
| random | 25 | Y773,113 | Y1,182,760 | Y1,531,876 | 2.0 | 0.0 |
| random | 40 | Y850,587 | Y1,243,624 | Y1,604,119 | 2.0 | 0.0 |
| random | 70 | Y911,119 | Y1,361,604 | Y1,734,502 | 3.0 | 0.0 |
| random | 100 | Y923,987 | Y1,438,817 | Y1,864,009 | 3.0 | 0.0 |
| service-grinder | 25 | Y1,572,226 | Y1,631,952 | Y1,675,786 | 0.0 | 43.0 |
| service-grinder | 40 | Y1,594,377 | Y1,709,274 | Y1,771,259 | 0.0 | 73.0 |
| service-grinder | 70 | Y986,726 | Y1,753,822 | Y1,904,844 | 0.0 | 132.0 |
| service-grinder | 100 | Y929,611 | Y1,556,782 | Y2,051,804 | 0.0 | 196.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 904/1000 | 10 | 13 | 34 |
| known | 686/1000 | 27 | 44 | 77 |
| respected | 479/1000 | 58 | 75 | 93 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 40.0 |
| flipper | engine | 0.0 |
| handyman | engine | 0.0 |
| investor | engine | 0.0 |
| passive-grinder | engine | 0.0 |
| random | engine | 0.0 |
| service-grinder | engine | 64.0 |

## Roster coherence (Sprint 55, economy-bible.md law 4)

Per-model closed-form facts at the worst plausible roll (post Law-2 generation guard): clean value, the softened worst-case restoration bill and its ratio to clean value (must stay <= `maxBillFraction`), the flip margin buying at reserve + fully restoring + selling at guide would clear (must stay positive), and the full consumable-replacement share of book value (must stay under the content cap).

| Model | Class | Clean value | Worst bill | Ratio | Flip margin | Consumables share |
|---|---|---|---|---|---|---|
| honda-city-e-aa | shitbox | Y135,000 | Y93,010 | 68.9% | Y30,296 | 8.1% |
| honda-civic-sir2-eg6 | common | Y487,500 | Y267,200 | 54.8% | Y136,870 | 8.9% |
| mazda-rx7-fd3s | rare | Y2,400,000 | Y997,000 | 41.5% | Y801,200 | 4.5% |
| mazda-savanna-rx7-fc3s | uncommon | Y1,350,000 | Y638,080 | 47.3% | Y419,768 | 5.2% |
| nissan-180sx-rps13 | uncommon | Y825,000 | Y456,320 | 55.3% | Y229,972 | 8.4% |
| nissan-silvia-ks-s14 | uncommon | Y1,125,000 | Y638,080 | 56.7% | Y307,268 | 6.2% |
| suzuki-wagon-r-ct21s | shitbox | Y165,000 | Y93,010 | 56.4% | Y45,296 | 6.6% |
| toyota-chaser-tourer-v-jzx90 | uncommon | Y1,200,000 | Y638,080 | 53.2% | Y344,768 | 5.8% |
| toyota-sprinter-trueno-ae86 | uncommon | Y1,050,000 | Y594,880 | 56.7% | Y287,048 | 6.6% |
| toyota-supra-rz-jza80 | rare | Y3,150,000 | Y997,000 | 31.7% | Y1,176,200 | 3.5% |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 11.7% | 10%-25% |
| mid | 75.7% | 50%-100% |
| frenzy | 12.6% | 5%-15% |

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

## Invariants enforced (Sprint 23 decision 7, Sprint 55 decision 2)

`balance.cli check` hard-gates 9 checks against this data: days-to-`local` p50 in [10, 35] (competent-policy probe), buyout share of acquisitions < 30%, the 3 legacy Sprint 03/09 checks (Passive Grinder solvency, Flipper-vs-Passive separation, sanity floor), and 4 Sprint 55 roster-coherence checks (economy-bible.md law 4): every model's worst-case bill-to-clean ratio <= `maxBillFraction` (law 2), every model's flip margin at the worst roll is positive (law 1), every model's full consumable-replacement share of book value <= the content cap (law 3), and the service-job payout margin floor clears the profitability invariant's required coverage (law 4 - the full per-template/per-model proof is `serviceJobPayout.test.ts`, already gated in the standard test suite). 3 more are measured and reported but NOT gated (kept informational rather than promoted, since no maintainer has signed off on hard-gating them yet) - see `invariants.py`'s module docstring for their history. As of the Sprint 55 retune, all 3 read differently than that history describes: most active strategies now beat Passive Grinder's day-100 cash, Flipper now clears its own starting cash, and the auction win-price tails now sit inside their target band - see this report's own tables above for the current real numbers.
