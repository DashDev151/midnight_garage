# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) |
|---|---|---|---|---|---|
| balanced-player | 25 | Y994,519 | Y1,823,916 | Y2,761,919 | 1.0 |
| balanced-player | 40 | Y1,655,194 | Y2,784,986 | Y3,936,571 | 1.0 |
| balanced-player | 70 | Y3,551,750 | Y4,831,332 | Y6,315,586 | 1.0 |
| balanced-player | 100 | Y6,330,860 | Y7,974,520 | Y9,598,403 | 1.0 |
| cautious-restorer | 25 | Y103,191 | Y187,274 | Y1,050,000 | 1.0 |
| cautious-restorer | 40 | Y-87,588 | Y-37,726 | Y780,000 | 1.0 |
| cautious-restorer | 70 | Y-537,588 | Y-487,726 | Y150,000 | 1.0 |
| cautious-restorer | 100 | Y-897,588 | Y-847,726 | Y-270,000 | 1.0 |
| flipper | 25 | Y1,157,922 | Y1,266,172 | Y1,372,309 | 1.0 |
| flipper | 40 | Y1,064,361 | Y1,202,866 | Y1,347,282 | 1.0 |
| flipper | 70 | Y922,493 | Y1,088,014 | Y1,274,661 | 0.0 |
| flipper | 100 | Y564,957 | Y820,475 | Y1,073,144 | 1.0 |
| passive-grinder | 25 | Y1,230,000 | Y1,230,000 | Y1,230,000 | 0.0 |
| passive-grinder | 40 | Y1,050,000 | Y1,050,000 | Y1,050,000 | 0.0 |
| passive-grinder | 70 | Y600,000 | Y600,000 | Y600,000 | 0.0 |
| passive-grinder | 100 | Y240,000 | Y240,000 | Y240,000 | 0.0 |
| random | 25 | Y467,366 | Y774,774 | Y1,154,865 | 3.0 |
| random | 40 | Y392,121 | Y806,328 | Y1,274,859 | 3.0 |
| random | 70 | Y350,305 | Y732,639 | Y1,305,859 | 3.0 |
| random | 100 | Y494,137 | Y989,688 | Y1,915,987 | 3.0 |
| service-grinder | 25 | Y1,371,000 | Y1,425,000 | Y1,459,000 | 0.0 |
| service-grinder | 40 | Y1,324,000 | Y1,399,000 | Y1,454,000 | 0.0 |
| service-grinder | 70 | Y1,155,000 | Y1,250,000 | Y1,322,000 | 0.0 |
| service-grinder | 100 | Y1,092,000 | Y1,202,000 | Y1,283,000 | 0.0 |

## Auction calibration (Sprint 10 decision 4f)

Win price as a fraction of [reserve, buyout], bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). Target: steal/frenzy 5-10% each, mid the majority.

| Bucket | Share | Target |
|---|---|---|
| steal | 8.2% | 5%-10% |
| mid | 91.8% | 80%-90% |
| frenzy | 0.0% | 5%-10% |

Average rival field size: 6.2 contenders (target 3-9, see `auctionFieldSizes.manifest.json`).
