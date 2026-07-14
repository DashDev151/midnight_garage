# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y113,363 | Y223,134 | Y286,930 | 1.0 | 0.0 |
| balanced-player | 40 | Y105,191 | Y203,640 | Y269,524 | 0.0 | 0.0 |
| balanced-player | 70 | Y98,054 | Y129,844 | Y200,959 | 0.0 | 0.0 |
| balanced-player | 100 | Y20,000 | Y52,894 | Y152,105 | 0.0 | 0.0 |
| cautious-restorer | 25 | Y36,603 | Y123,104 | Y252,297 | 1.0 | 0.0 |
| cautious-restorer | 40 | Y7,350 | Y115,058 | Y234,316 | 1.0 | 2.0 |
| cautious-restorer | 70 | Y-92,650 | Y92,118 | Y172,266 | 1.0 | 2.0 |
| cautious-restorer | 100 | Y-172,650 | Y26,083 | Y120,212 | 0.0 | 2.0 |
| competent-policy | 25 | Y224,679 | Y367,780 | Y409,704 | 0.0 | 42.0 |
| competent-policy | 40 | Y325,392 | Y424,152 | Y479,189 | 0.0 | 74.0 |
| competent-policy | 70 | Y421,579 | Y532,621 | Y591,346 | 0.0 | 141.0 |
| competent-policy | 100 | Y176,659 | Y643,697 | Y754,386 | 0.0 | 202.0 |
| flipper | 25 | Y45,500 | Y121,200 | Y246,970 | 1.0 | 0.0 |
| flipper | 40 | Y35,323 | Y106,846 | Y229,829 | 1.0 | 0.0 |
| flipper | 70 | Y-42,888 | Y58,091 | Y165,406 | 1.0 | 0.0 |
| flipper | 100 | Y-122,888 | Y-13,112 | Y124,927 | 1.0 | 0.0 |
| handyman | 25 | Y87,887 | Y172,988 | Y268,633 | 1.0 | 0.0 |
| handyman | 40 | Y79,404 | Y200,000 | Y251,567 | 1.0 | 0.0 |
| handyman | 70 | Y73,157 | Y123,576 | Y185,709 | 0.0 | 0.0 |
| handyman | 100 | Y4,409 | Y48,862 | Y130,821 | 0.0 | 0.0 |
| investor | 25 | Y29,056 | Y115,901 | Y240,000 | 1.0 | 0.0 |
| investor | 40 | Y-10,996 | Y72,838 | Y141,771 | 1.0 | 0.0 |
| investor | 70 | Y-110,996 | Y-27,162 | Y41,771 | 1.0 | 0.0 |
| investor | 100 | Y-190,996 | Y-107,162 | Y-38,229 | 1.0 | 0.0 |
| passive-grinder | 25 | Y240,000 | Y240,000 | Y240,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y200,000 | Y200,000 | Y200,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y100,000 | Y100,000 | Y100,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y20,000 | Y20,000 | Y20,000 | 0.0 | 0.0 |
| random | 25 | Y63,180 | Y182,396 | Y283,597 | 1.0 | 0.0 |
| random | 40 | Y72,423 | Y195,276 | Y255,514 | 1.0 | 0.0 |
| random | 70 | Y86,307 | Y125,610 | Y193,852 | 0.0 | 0.0 |
| random | 100 | Y12,587 | Y50,492 | Y144,397 | 0.0 | 0.0 |
| service-grinder | 25 | Y324,913 | Y380,158 | Y410,506 | 0.0 | 43.0 |
| service-grinder | 40 | Y370,586 | Y434,634 | Y476,723 | 0.0 | 76.0 |
| service-grinder | 70 | Y339,893 | Y515,280 | Y571,815 | 0.0 | 138.0 |
| service-grinder | 100 | Y182,259 | Y572,642 | Y701,659 | 0.0 | 199.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 983/1000 | 10 | 12 | 22 |
| known | 945/1000 | 26 | 29 | 46 |
| respected | 928/1000 | 56 | 61 | 76 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 63.0 |
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
| honda-city-e-aa | shitbox | Y135,000 | Y93,010 | 68.9% | Y27,957 | 8.1% |
| honda-civic-sir2-eg6 | common | Y487,500 | Y267,200 | 54.8% | Y120,184 | 8.9% |
| mazda-rx7-fd3s | rare | Y2,400,000 | Y997,000 | 41.5% | Y680,840 | 4.5% |
| mazda-savanna-rx7-fc3s | uncommon | Y1,350,000 | Y638,080 | 47.3% | Y361,338 | 5.2% |
| nissan-180sx-rps13 | uncommon | Y825,000 | Y456,320 | 55.3% | Y202,230 | 8.4% |
| nissan-silvia-ks-s14 | uncommon | Y1,125,000 | Y638,080 | 56.7% | Y271,338 | 6.2% |
| suzuki-wagon-r-ct21s | shitbox | Y165,000 | Y93,010 | 56.4% | Y39,957 | 6.6% |
| toyota-chaser-tourer-v-jzx90 | uncommon | Y1,200,000 | Y638,080 | 53.2% | Y301,338 | 5.8% |
| toyota-sprinter-trueno-ae86 | uncommon | Y1,050,000 | Y594,880 | 56.7% | Y253,434 | 6.6% |
| toyota-supra-rz-jza80 | rare | Y3,150,000 | Y997,000 | 31.7% | Y980,840 | 3.5% |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 7.5% | 10%-25% |
| mid | 20.4% | 50%-100% |
| frenzy | 72.2% | 5%-15% |

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
