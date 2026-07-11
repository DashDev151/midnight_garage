# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y1,343,620 | Y1,691,318 | Y2,029,856 | 0.0 | 0.0 |
| balanced-player | 40 | Y1,471,088 | Y1,923,478 | Y2,350,731 | 0.0 | 0.0 |
| balanced-player | 70 | Y1,719,721 | Y2,207,968 | Y2,715,818 | 0.0 | 0.0 |
| balanced-player | 100 | Y2,241,793 | Y2,732,832 | Y3,340,749 | 0.0 | 0.0 |
| cautious-restorer | 25 | Y606,000 | Y854,000 | Y990,000 | 2.0 | 0.0 |
| cautious-restorer | 40 | Y546,000 | Y757,000 | Y876,000 | 2.0 | 0.0 |
| cautious-restorer | 70 | Y458,000 | Y619,000 | Y780,000 | 2.0 | 0.0 |
| cautious-restorer | 100 | Y356,904 | Y513,000 | Y684,000 | 2.0 | 0.0 |
| flipper | 25 | Y1,350,693 | Y1,658,968 | Y1,861,660 | 0.0 | 0.0 |
| flipper | 40 | Y1,507,997 | Y1,832,742 | Y2,091,511 | 0.0 | 0.0 |
| flipper | 70 | Y1,680,279 | Y1,975,838 | Y2,295,350 | 0.0 | 0.0 |
| flipper | 100 | Y1,931,474 | Y2,268,176 | Y2,615,732 | 0.0 | 0.0 |
| handyman | 25 | Y418,000 | Y590,000 | Y678,000 | 2.0 | 0.0 |
| handyman | 40 | Y402,000 | Y574,000 | Y662,000 | 2.0 | 0.0 |
| handyman | 70 | Y402,000 | Y568,256 | Y628,000 | 2.0 | 0.0 |
| handyman | 100 | Y402,000 | Y564,000 | Y598,000 | 2.0 | 0.0 |
| investor | 25 | Y225,306 | Y602,496 | Y1,046,670 | 1.0 | 0.0 |
| investor | 40 | Y25,724 | Y172,612 | Y686,357 | 1.0 | 3.0 |
| investor | 70 | Y17,373 | Y58,543 | Y195,195 | 1.0 | 3.0 |
| investor | 100 | Y16,546 | Y56,106 | Y169,859 | 1.0 | 3.0 |
| passive-grinder | 25 | Y1,500,000 | Y1,500,000 | Y1,500,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y1,500,000 | Y1,500,000 | Y1,500,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y1,500,000 | Y1,500,000 | Y1,500,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y1,500,000 | Y1,500,000 | Y1,500,000 | 0.0 | 0.0 |
| random | 25 | Y692,000 | Y1,053,416 | Y1,314,161 | 2.0 | 0.0 |
| random | 40 | Y623,218 | Y940,000 | Y1,194,000 | 3.0 | 0.0 |
| random | 70 | Y534,000 | Y834,000 | Y1,086,000 | 3.0 | 0.0 |
| random | 100 | Y431,861 | Y734,000 | Y972,000 | 3.0 | 0.0 |
| service-grinder | 25 | Y1,160,631 | Y1,500,000 | Y1,500,000 | 0.0 | 0.0 |
| service-grinder | 40 | Y1,161,583 | Y1,500,000 | Y1,500,000 | 0.0 | 0.0 |
| service-grinder | 70 | Y1,162,948 | Y1,234,366 | Y1,500,000 | 0.0 | 1.0 |
| service-grinder | 100 | Y1,169,597 | Y1,232,530 | Y1,500,000 | 0.0 | 2.0 |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 85.4% | 10%-25% |
| mid | 14.6% | 50%-100% |
| frenzy | 0.0% | 5%-15% |

## Buyout vs. bid (external review 2026-07, finding 2)

Share of successful auction acquisitions made via instant buyout vs. a won competitive bid, per strategy. A strategy near 100% buyout means the bidding screen is effectively dead for it and `AUCTION_BUYOUT_PREMIUM` (currently a 25% premium over the value anchor, Sprint 20) is cheap enough that certainty always wins. Bots never buy out as of Sprint 20 (buyout is a player-impatience valve only), so this section's bot-side numbers are expected to read as 0% buyout going forward — kept for the player-side telemetry hook and as a regression check that bots really have stopped buying out.

| Strategy | Bid | Buyout |
|---|---|---|
| balanced-player | 100.0% | 0.0% |
| cautious-restorer | 100.0% | 0.0% |
| flipper | 100.0% | 0.0% |
| handyman | 100.0% | 0.0% |
| investor | 100.0% | 0.0% |
| random | 100.0% | 0.0% |
