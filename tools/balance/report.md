# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) |
|---|---|---|---|---|---|
| balanced-player | 25 | Y187,738 | Y499,678 | Y830,363 | 0.0 |
| balanced-player | 40 | Y113,069 | Y406,350 | Y719,192 | 0.0 |
| balanced-player | 70 | Y-307,348 | Y154,252 | Y537,049 | 0.0 |
| balanced-player | 100 | Y-667,348 | Y-133,082 | Y391,965 | 0.0 |
| cautious-restorer | 25 | Y111,246 | Y212,690 | Y1,050,000 | 1.0 |
| cautious-restorer | 40 | Y-86,122 | Y-12,310 | Y780,000 | 1.0 |
| cautious-restorer | 70 | Y-536,122 | Y-462,310 | Y150,000 | 1.0 |
| cautious-restorer | 100 | Y-896,122 | Y-822,310 | Y-270,000 | 1.0 |
| flipper | 25 | Y205,503 | Y502,812 | Y872,028 | 0.0 |
| flipper | 40 | Y140,438 | Y429,334 | Y808,344 | 0.0 |
| flipper | 70 | Y-293,646 | Y99,579 | Y555,957 | 0.0 |
| flipper | 100 | Y-653,646 | Y-256,650 | Y508,613 | 0.0 |
| handyman | 25 | Y-428,447 | Y-161,940 | Y136,606 | 2.0 |
| handyman | 40 | Y-608,447 | Y-341,940 | Y-43,394 | 2.0 |
| handyman | 70 | Y-1,058,447 | Y-791,940 | Y-493,394 | 2.0 |
| handyman | 100 | Y-1,418,447 | Y-1,151,940 | Y-853,394 | 2.0 |
| investor | 25 | Y-224,695 | Y-75,836 | Y26,855 | 2.0 |
| investor | 40 | Y-404,695 | Y-255,836 | Y-153,145 | 2.0 |
| investor | 70 | Y-854,695 | Y-705,836 | Y-603,145 | 2.0 |
| investor | 100 | Y-1,214,695 | Y-1,065,836 | Y-963,145 | 2.0 |
| passive-grinder | 25 | Y1,230,000 | Y1,230,000 | Y1,230,000 | 0.0 |
| passive-grinder | 40 | Y1,050,000 | Y1,050,000 | Y1,050,000 | 0.0 |
| passive-grinder | 70 | Y600,000 | Y600,000 | Y600,000 | 0.0 |
| passive-grinder | 100 | Y240,000 | Y240,000 | Y240,000 | 0.0 |
| random | 25 | Y-249,993 | Y-129,714 | Y131,525 | 3.0 |
| random | 40 | Y-429,993 | Y-309,714 | Y-97,023 | 3.0 |
| random | 70 | Y-879,993 | Y-759,714 | Y-547,023 | 3.0 |
| random | 100 | Y-1,239,993 | Y-1,119,714 | Y-907,023 | 3.0 |
| service-grinder | 25 | Y622 | Y216,602 | Y534,472 | 0.0 |
| service-grinder | 40 | Y-177,363 | Y59,499 | Y362,873 | 0.0 |
| service-grinder | 70 | Y-625,871 | Y-375,260 | Y-48,795 | 0.0 |
| service-grinder | 100 | Y-983,993 | Y-735,080 | Y-390,802 | 0.0 |

## Auction calibration (Sprint 10 decision 4f)

Win price as a fraction of [reserve, buyout], bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). Target: steal/frenzy 5-10% each, mid the majority.

| Bucket | Share | Target |
|---|---|---|
| steal | 7.0% | 5%-10% |
| mid | 93.0% | 80%-90% |
| frenzy | 0.0% | 5%-10% |

Average rival field size: 6.2 contenders (target 3-9, see `auctionFieldSizes.manifest.json`).

## Buyout vs. bid (external review 2026-07, finding 2)

Share of successful auction acquisitions made via instant buyout vs. a won competitive bid, per strategy. A strategy near 100% buyout means the bidding screen is effectively dead for it and `AUCTION_BUYOUT_PREMIUM` (currently a 10% premium over book) is cheap enough that certainty always wins.

| Strategy | Bid | Buyout |
|---|---|---|
| balanced-player | 99.3% | 0.7% |
| cautious-restorer | 94.7% | 5.3% |
| flipper | 99.3% | 0.7% |
| handyman | 98.7% | 1.3% |
| investor | 99.0% | 1.0% |
| random | 99.0% | 1.0% |
