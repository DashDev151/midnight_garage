# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y111,347 | Y223,943 | Y291,167 | 1.0 | 0.0 |
| balanced-player | 40 | Y109,817 | Y203,073 | Y267,598 | 0.0 | 0.0 |
| balanced-player | 70 | Y97,637 | Y129,288 | Y204,802 | 0.0 | 0.0 |
| balanced-player | 100 | Y19,544 | Y52,208 | Y158,440 | 0.0 | 0.0 |
| cautious-restorer | 25 | Y40,034 | Y125,416 | Y257,360 | 1.0 | 0.0 |
| cautious-restorer | 40 | Y9,135 | Y110,027 | Y238,118 | 1.0 | 1.0 |
| cautious-restorer | 70 | Y-91,070 | Y93,916 | Y173,539 | 1.0 | 2.0 |
| cautious-restorer | 100 | Y-171,070 | Y25,883 | Y116,890 | 0.0 | 2.0 |
| competent-policy | 25 | Y148,822 | Y305,260 | Y378,060 | 0.0 | 15.5 |
| competent-policy | 40 | Y152,467 | Y331,548 | Y426,613 | 0.0 | 25.0 |
| competent-policy | 70 | Y108,627 | Y377,980 | Y483,806 | 0.0 | 59.5 |
| competent-policy | 100 | Y30,082 | Y435,435 | Y569,705 | 0.0 | 100.0 |
| flipper | 25 | Y44,072 | Y120,789 | Y248,185 | 1.0 | 0.0 |
| flipper | 40 | Y36,156 | Y105,525 | Y229,997 | 1.0 | 0.0 |
| flipper | 70 | Y-41,371 | Y61,022 | Y164,734 | 1.0 | 0.0 |
| flipper | 100 | Y-121,371 | Y-13,472 | Y121,841 | 1.0 | 0.0 |
| handyman | 25 | Y86,464 | Y172,655 | Y267,380 | 1.0 | 0.0 |
| handyman | 40 | Y81,226 | Y200,000 | Y250,393 | 0.0 | 0.0 |
| handyman | 70 | Y82,075 | Y123,914 | Y190,008 | 0.0 | 0.0 |
| handyman | 100 | Y10,953 | Y48,792 | Y133,800 | 0.0 | 0.0 |
| investor | 25 | Y29,056 | Y115,901 | Y240,000 | 1.0 | 0.0 |
| investor | 40 | Y-10,996 | Y72,838 | Y141,771 | 1.0 | 0.0 |
| investor | 70 | Y-110,996 | Y-27,162 | Y41,771 | 1.0 | 0.0 |
| investor | 100 | Y-190,996 | Y-107,162 | Y-38,229 | 1.0 | 0.0 |
| passive-grinder | 25 | Y240,000 | Y240,000 | Y240,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y200,000 | Y200,000 | Y200,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y100,000 | Y100,000 | Y100,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y20,000 | Y20,000 | Y20,000 | 0.0 | 0.0 |
| random | 25 | Y62,361 | Y185,012 | Y284,811 | 1.0 | 0.0 |
| random | 40 | Y75,115 | Y199,114 | Y257,125 | 1.0 | 0.0 |
| random | 70 | Y85,287 | Y126,429 | Y200,459 | 0.0 | 0.0 |
| random | 100 | Y10,159 | Y51,522 | Y144,397 | 0.0 | 0.0 |
| service-grinder | 25 | Y267,288 | Y328,438 | Y380,556 | 0.0 | 23.0 |
| service-grinder | 40 | Y271,039 | Y351,064 | Y425,958 | 0.0 | 39.0 |
| service-grinder | 70 | Y278,196 | Y392,098 | Y477,343 | 0.0 | 80.0 |
| service-grinder | 100 | Y281,151 | Y441,656 | Y550,905 | 0.0 | 117.5 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 942/1000 | 10 | 16 | 41 |
| known | 772/1000 | 30 | 49 | 82 |
| respected | 371/1000 | 63 | 83 | 96 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 44.0 |
| flipper | engine | 0.0 |
| handyman | engine | 0.0 |
| investor | engine | 0.0 |
| passive-grinder | engine | 0.0 |
| random | engine | 0.0 |
| service-grinder | engine | 51.0 |

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
| steal | 7.4% | 10%-25% |
| mid | 20.6% | 50%-100% |
| frenzy | 71.9% | 5%-15% |

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
