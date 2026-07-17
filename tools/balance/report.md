# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y50,446 | Y111,811 | Y240,000 | 1.0 | 0.0 |
| balanced-player | 40 | Y9,551 | Y67,418 | Y127,057 | 1.0 | 0.0 |
| balanced-player | 70 | Y-90,449 | Y-32,582 | Y27,057 | 1.0 | 0.0 |
| balanced-player | 100 | Y-170,449 | Y-112,582 | Y-52,943 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y26,079 | Y78,848 | Y144,481 | 1.0 | 0.0 |
| cautious-restorer | 40 | Y-13,921 | Y38,678 | Y102,045 | 1.0 | 0.0 |
| cautious-restorer | 70 | Y-113,921 | Y-61,322 | Y2,045 | 1.0 | 0.0 |
| cautious-restorer | 100 | Y-193,921 | Y-141,322 | Y-77,955 | 1.0 | 0.0 |
| competent-policy | 25 | Y75,820 | Y152,606 | Y267,731 | 1.0 | 0.0 |
| competent-policy | 40 | Y33,775 | Y97,393 | Y228,118 | 1.0 | 0.0 |
| competent-policy | 70 | Y-66,225 | Y-4,848 | Y134,177 | 1.0 | 0.0 |
| competent-policy | 100 | Y-146,225 | Y-84,848 | Y75,899 | 1.0 | 0.0 |
| flipper | 25 | Y43,191 | Y96,077 | Y175,716 | 1.0 | 0.0 |
| flipper | 40 | Y5,674 | Y57,965 | Y135,708 | 1.0 | 0.0 |
| flipper | 70 | Y-94,326 | Y-39,141 | Y45,943 | 1.0 | 0.0 |
| flipper | 100 | Y-174,326 | Y-119,141 | Y-31,960 | 1.0 | 0.0 |
| handyman | 25 | Y43,312 | Y105,212 | Y191,732 | 1.0 | 0.0 |
| handyman | 40 | Y2,815 | Y59,002 | Y113,616 | 1.0 | 0.0 |
| handyman | 70 | Y-97,185 | Y-40,998 | Y13,616 | 1.0 | 0.0 |
| handyman | 100 | Y-177,185 | Y-120,998 | Y-66,384 | 1.0 | 0.0 |
| investor | 25 | Y18,065 | Y80,439 | Y162,713 | 1.0 | 0.0 |
| investor | 40 | Y-22,249 | Y34,560 | Y89,060 | 1.0 | 0.0 |
| investor | 70 | Y-122,249 | Y-65,440 | Y-10,940 | 1.0 | 0.0 |
| investor | 100 | Y-202,249 | Y-145,440 | Y-90,940 | 1.0 | 0.0 |
| passive-grinder | 25 | Y240,000 | Y240,000 | Y240,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y200,000 | Y200,000 | Y200,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y100,000 | Y100,000 | Y100,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y20,000 | Y20,000 | Y20,000 | 0.0 | 0.0 |
| random | 25 | Y44,548 | Y100,181 | Y166,546 | 1.0 | 0.0 |
| random | 40 | Y4,620 | Y56,186 | Y111,199 | 1.0 | 0.0 |
| random | 70 | Y-95,380 | Y-43,814 | Y11,199 | 1.0 | 0.0 |
| random | 100 | Y-175,380 | Y-123,814 | Y-68,801 | 1.0 | 0.0 |
| service-grinder | 25 | Y240,000 | Y254,517 | Y285,259 | 0.0 | 0.0 |
| service-grinder | 40 | Y200,000 | Y226,474 | Y264,581 | 0.0 | 0.0 |
| service-grinder | 70 | Y114,180 | Y151,328 | Y195,703 | 0.0 | 0.0 |
| service-grinder | 100 | Y55,054 | Y99,215 | Y142,030 | 0.0 | 0.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 0/1000 | - | - | - |
| known | 0/1000 | - | - | - |
| respected | 0/1000 | - | - | - |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 6.0 |
| flipper | engine | 0.0 |
| handyman | engine | 0.0 |
| investor | engine | 0.0 |
| passive-grinder | engine | 0.0 |
| random | engine | 0.0 |
| service-grinder | body | 12.0 |

## Roster coherence (Sprint 55, economy-bible.md law 4)

Per-model closed-form facts at the worst plausible roll (post Law-2 generation guard): clean value, the softened worst-case restoration bill and its ratio to clean value (must stay <= `maxBillFraction`), the flip margin buying at reserve + fully restoring TO MINT + selling at guide would clear (must stay positive), and the full consumable-replacement share of book value (must stay under the content cap).

Read **Sensible margin** first (Sprint 66). Since Law 1 gained a per-tier expectation band, a full mint restore is no longer the play the economy asks for on a cheap car - the market barely discounts a worn kei, so you pay near clean value for one and the mint bill burns the margin. **Sensible margin** is the real core loop: buy rough (every slot `poor`) at reserve, repair up to the tier's expectation band and not a yen past, sell at the resulting guide. **Mint flip** stays gated as Law 2's literal claim (full restoration must always be *capable* of profit), but on the shitbox tier it correctly collapses.

**Wage** (Law 6) is the value a repair returns over its own cost, less the rent accrued over the labour it takes, on a rough-but-fixable car at a fresh shop's tier-1 tools. It must stay positive on common/uncommon/rare models (gated); on the shitbox tier it is honestly negative once the full teardown chain is priced (Sprint 72), a disclosed gap, not a gate. The **xRent** ratio is the tuning dial: it is invariant to the target band (cost and labour both scale with grade count), and falls down the roster because repair labour is value-blind while the margin scales with part price.

| Model | Class | Clean value | Worst bill | Ratio | Sensible margin | Mint flip | Wage | xRent | Consumables share |
|---|---|---|---|---|---|---|---|---|---|
| honda-beat-pp1 | shitbox | Y360,000 | Y93,010 | 25.8% | Y124,309 (34.5%) | Y100,155 | Y-9,772 | 0.57x | 3.0% |
| honda-city-e-aa | shitbox | Y135,000 | Y66,840 | 49.5% | Y34,309 (25.4%) | Y3,202 | Y-9,772 | 0.57x | 8.1% |
| honda-city-turbo-ii-aa | shitbox | Y315,000 | Y99,760 | 31.7% | Y105,364 (33.4%) | Y78,510 | Y-9,600 | 0.60x | 3.5% |
| honda-civic-sir2-eg6 | common | Y487,500 | Y267,200 | 54.8% | Y92,995 (19.1%) | Y124,348 | Y69,838 | 3.01x | 8.9% |
| honda-crx-sir-ef8 | common | Y420,000 | Y104,600 | 24.9% | Y27,520 (6.6%) | Y113,608 | Y69,838 | 3.01x | 10.4% |
| honda-prelude-si-vtec-bb4 | common | Y600,000 | Y267,200 | 44.5% | Y150,808 (25.1%) | Y169,348 | Y69,838 | 3.01x | 7.2% |
| mazda-rx7-fd3s | rare | Y2,400,000 | Y997,000 | 41.5% | Y787,800 (32.8%) | Y860,300 | Y377,429 | 8.77x | 4.5% |
| mazda-savanna-rx7-fc3s | uncommon | Y1,350,000 | Y638,080 | 47.3% | Y360,723 (26.7%) | Y443,475 | Y145,570 | 5.02x | 5.2% |
| nissan-180sx-rps13 | uncommon | Y825,000 | Y456,320 | 55.3% | Y79,418 (9.6%) | Y251,651 | Y145,570 | 5.02x | 8.4% |
| nissan-cefiro-a31 | uncommon | Y825,000 | Y456,320 | 55.3% | Y79,418 (9.6%) | Y251,651 | Y145,570 | 5.02x | 8.4% |
| nissan-fairlady-z-z32 | rare | Y2,175,000 | Y997,000 | 45.8% | Y697,800 (32.1%) | Y770,300 | Y377,429 | 8.77x | 5.0% |
| nissan-silvia-ks-s14 | uncommon | Y1,125,000 | Y638,080 | 56.7% | Y270,723 (24.1%) | Y353,475 | Y145,570 | 5.02x | 6.2% |
| nissan-silvia-s13 | uncommon | Y825,000 | Y456,320 | 55.3% | Y79,418 (9.6%) | Y251,651 | Y145,570 | 5.02x | 8.4% |
| nissan-skyline-gtr-bnr32 | rare | Y2,700,000 | Y997,000 | 36.9% | Y907,800 (33.6%) | Y980,300 | Y377,429 | 8.77x | 4.0% |
| nissan-sunny-b12 | shitbox | Y135,000 | Y66,840 | 49.5% | Y34,309 (25.4%) | Y3,202 | Y-9,772 | 0.57x | 8.1% |
| subaru-impreza-wrx-sti-gc8 | uncommon | Y1,350,000 | Y638,080 | 47.3% | Y360,723 (26.7%) | Y443,475 | Y145,570 | 5.02x | 5.2% |
| suzuki-alto-works-ha21s | shitbox | Y255,000 | Y99,760 | 39.1% | Y81,364 (31.9%) | Y54,510 | Y-9,600 | 0.60x | 4.3% |
| suzuki-wagon-r-ct21s | shitbox | Y165,000 | Y93,010 | 56.4% | Y46,309 (28.1%) | Y22,155 | Y-9,772 | 0.57x | 6.6% |
| toyota-aristo-30v-jzs147 | rare | Y2,100,000 | Y997,000 | 47.5% | Y667,800 (31.8%) | Y740,300 | Y377,429 | 8.77x | 5.2% |
| toyota-carina-at150 | shitbox | Y150,000 | Y66,840 | 44.6% | Y40,309 (26.9%) | Y9,202 | Y-9,772 | 0.57x | 7.2% |
| toyota-chaser-tourer-v-jzx90 | uncommon | Y1,200,000 | Y638,080 | 53.2% | Y300,723 (25.1%) | Y383,475 | Y145,570 | 5.02x | 5.8% |
| toyota-mr2-sw20 | uncommon | Y1,050,000 | Y456,320 | 43.5% | Y240,723 (22.9%) | Y341,651 | Y145,570 | 5.02x | 6.6% |
| toyota-sera-exy10 | shitbox | Y337,500 | Y93,010 | 27.6% | Y115,309 (34.2%) | Y91,155 | Y-9,772 | 0.57x | 3.2% |
| toyota-sprinter-trueno-ae86 | uncommon | Y1,050,000 | Y594,880 | 56.7% | Y250,515 (23.9%) | Y330,387 | Y132,598 | 4.81x | 6.6% |
| toyota-supra-rz-jza80 | rare | Y3,150,000 | Y997,000 | 31.7% | Y1,087,800 (34.5%) | Y1,160,300 | Y377,429 | 8.77x | 3.5% |

## Diagnosis

**No bot inspects a lot, tears a car down, or installs a part** (the standing harness verdict, `TODO.md`) - every figure in this section is closed-form, not bot-derived: `computeSymptomCoherence`/`computeDonorCoherence` call the real sim functions directly against a representative probe car, and the three end-to-end flows in `packages/sim/tests/diagnosisFlows.test.ts` (Sprint 75 decision 3 - the donor flow, the sleeper flow, and the blind-buy flow) exercise the full buy/diagnose/repair/sell pipeline deterministically, seed-free. No bot statistic anywhere in this report covers diagnosis, teardown, or the donor economy.

### Symptom coherence (Sprint 73 decision 6, the blind-buy guardrail)

Per symptom x fitment tier, on a clean representative car: the apparent (room-shown) value, the honest expected true value, the fear-priced sheet value the room actually charges (`fearPremium` 1.10), and the blind-buy edge (`expectedTrueValueYen - sheetGuideValueYen`) - buying with no test run at all must never be a losing bet on average, and never a windfall either. **Causes** lists each cause's own edge if it turns out true (positive = the car is worth more than the sheet charged; negative = less) - every symptom must show at least one of each, on every tier.

| Symptom | Tier | Apparent | Expected true | Sheet guide | Blind-buy EV | Causes |
|---|---|---|---|---|---|---|
| clunk-over-bumps | common | Y682,500 | Y676,128 | Y675,491 | Y637 | tired-bushes +4,249; blown-dampers -2,871; steering-play -1,351 |
| clunk-over-bumps | rare | Y3,360,000 | Y3,340,763 | Y3,338,839 | Y1,924 | tired-bushes +12,161; blown-dampers -8,089; steering-play -3,589 |
| clunk-over-bumps | shitbox | Y189,000 | Y188,116 | Y188,027 | Y88 | tired-bushes +733; blown-dampers -522; steering-play -292 |
| clunk-over-bumps | uncommon | Y1,470,000 | Y1,458,595 | Y1,457,455 | Y1,140 | tired-bushes +7,361; blown-dampers -4,927; steering-play -2,239 |
| crunch-into-second | common | Y682,500 | Y650,600 | Y647,410 | Y3,190 | worn-synchros +9,790; chewed-gearset -6,710 |
| crunch-into-second | rare | Y3,360,000 | Y3,261,000 | Y3,251,100 | Y9,900 | worn-synchros +26,400; chewed-gearset -14,850 |
| crunch-into-second | shitbox | Y189,000 | Y185,150 | Y184,765 | Y385 | worn-synchros +2,035; chewed-gearset -2,090 |
| crunch-into-second | uncommon | Y1,470,000 | Y1,411,920 | Y1,406,112 | Y5,808 | worn-synchros +16,368; chewed-gearset -10,032 |
| damp-passenger-footwell | common | Y682,500 | Y665,426 | Y663,719 | Y1,707 | heater-matrix-weep +15,561; rotten-bulkhead-seam -30,619 |
| damp-passenger-footwell | rare | Y3,360,000 | Y3,308,775 | Y3,303,653 | Y5,123 | heater-matrix-weep +45,848; rotten-bulkhead-seam -89,902 |
| damp-passenger-footwell | shitbox | Y189,000 | Y186,562 | Y186,318 | Y244 | heater-matrix-weep +2,402; rotten-bulkhead-seam -4,793 |
| damp-passenger-footwell | uncommon | Y1,470,000 | Y1,439,558 | Y1,436,514 | Y3,044 | heater-matrix-weep +27,438; rotten-bulkhead-seam -53,874 |
| diff-whine | common | Y682,500 | Y666,550 | Y664,955 | Y1,595 | worn-diff-bearings +4,895; chewed-ring-pinion -3,355 |
| diff-whine | rare | Y3,360,000 | Y3,310,500 | Y3,305,550 | Y4,950 | worn-diff-bearings +13,200; chewed-ring-pinion -7,425 |
| diff-whine | shitbox | Y189,000 | Y187,068 | Y186,875 | Y193 | worn-diff-bearings +1,021; chewed-ring-pinion -1,049 |
| diff-whine | uncommon | Y1,470,000 | Y1,440,960 | Y1,438,056 | Y2,904 | worn-diff-bearings +8,184; chewed-ring-pinion -5,016 |
| exhaust-rasp | common | Y682,500 | Y675,250 | Y674,525 | Y725 | blown-flex-joint +2,225; cracked-manifold -1,525 |
| exhaust-rasp | rare | Y3,360,000 | Y3,337,500 | Y3,335,250 | Y2,250 | blown-flex-joint +6,000; cracked-manifold -3,375 |
| exhaust-rasp | shitbox | Y189,000 | Y188,118 | Y188,030 | Y88 | blown-flex-joint +466; cracked-manifold -479 |
| exhaust-rasp | uncommon | Y1,470,000 | Y1,456,800 | Y1,455,480 | Y1,320 | blown-flex-joint +3,720; cracked-manifold -2,280 |
| non-starter | common | Y682,500 | Y668,798 | Y667,428 | Y1,370 | flat-battery +10,472; fuel-pump +8,232; seized-engine -45,728 |
| non-starter | rare | Y3,360,000 | Y3,318,675 | Y3,314,543 | Y4,133 | flat-battery +30,458; fuel-pump +25,208; seized-engine -134,542 |
| non-starter | shitbox | Y189,000 | Y187,090 | Y186,898 | Y191 | flat-battery +1,702; fuel-pump +1,067; seized-engine -7,098 |
| non-starter | uncommon | Y1,470,000 | Y1,445,491 | Y1,443,040 | Y2,451 | flat-battery +18,320; fuel-pump +14,864; seized-engine -80,560 |
| overheats-in-traffic | common | Y682,500 | Y673,212 | Y672,283 | Y929 | fan-switch +5,617; tired-radiator +4,897; early-head-gasket -16,383 |
| overheats-in-traffic | rare | Y3,360,000 | Y3,331,950 | Y3,329,145 | Y2,805 | fan-switch +15,855; tired-radiator +15,105; early-head-gasket -47,895 |
| overheats-in-traffic | shitbox | Y189,000 | Y187,713 | Y187,584 | Y129 | fan-switch +1,016; tired-radiator +611; early-head-gasket -2,609 |
| overheats-in-traffic | uncommon | Y1,470,000 | Y1,453,373 | Y1,451,710 | Y1,663 | fan-switch +9,650; tired-radiator +8,882; early-head-gasket -28,750 |
| pulls-under-braking | common | Y682,500 | Y672,822 | Y671,854 | Y968 | glazed-pads -1,354; seized-calliper +3,806 |
| pulls-under-braking | rare | Y3,360,000 | Y3,334,388 | Y3,331,826 | Y2,561 | glazed-pads -1,826; seized-calliper +7,924 |
| pulls-under-braking | shitbox | Y189,000 | Y188,094 | Y188,004 | Y91 | glazed-pads +196; seized-calliper -39 |
| pulls-under-braking | uncommon | Y1,470,000 | Y1,453,997 | Y1,452,396 | Y1,600 | glazed-pads -1,596; seized-calliper +5,508 |
| quarter-panel-filler | common | Y682,500 | Y665,320 | Y663,602 | Y1,718 | panel-respray +12,458; structural-rail-repair -30,502 |
| quarter-panel-filler | rare | Y3,360,000 | Y3,307,688 | Y3,302,456 | Y5,231 | panel-respray +36,544; structural-rail-repair -88,706 |
| quarter-panel-filler | shitbox | Y189,000 | Y186,711 | Y186,482 | Y229 | panel-respray +1,958; structural-rail-repair -4,957 |
| quarter-panel-filler | uncommon | Y1,470,000 | Y1,439,088 | Y1,435,997 | Y3,091 | panel-respray +21,907; structural-rail-repair -53,357 |
| sagging-spring | common | Y682,500 | Y678,650 | Y678,265 | Y385 | sagging-springs +1,015; broken-spring -1,085 |
| sagging-spring | rare | Y3,360,000 | Y3,347,925 | Y3,346,718 | Y1,208 | sagging-springs +2,783; broken-spring -2,467 |
| sagging-spring | shitbox | Y189,000 | Y188,563 | Y188,519 | Y44 | sagging-springs +201; broken-spring -324 |
| sagging-spring | uncommon | Y1,470,000 | Y1,462,944 | Y1,462,238 | Y706 | sagging-springs +1,714; broken-spring -1,646 |
| smokes-on-startup | common | Y682,500 | Y659,395 | Y657,085 | Y2,311 | valve-seals +9,316; tired-rings -8,784; head-gasket -1,184 |
| smokes-on-startup | rare | Y3,360,000 | Y3,288,938 | Y3,281,831 | Y7,106 | valve-seals +25,669; tired-rings -23,081; head-gasket -581 |
| smokes-on-startup | shitbox | Y189,000 | Y186,074 | Y185,781 | Y293 | valve-seals +1,819; tired-rings -1,956; head-gasket -806 |
| smokes-on-startup | uncommon | Y1,470,000 | Y1,428,168 | Y1,423,985 | Y4,183 | valve-seals +15,775; tired-rings -14,465; head-gasket -1,025 |
| tick-at-idle | common | Y682,500 | Y660,970 | Y658,817 | Y2,153 | lifter-tick +7,583; rod-knock -10,517 |
| tick-at-idle | rare | Y3,360,000 | Y3,292,875 | Y3,286,163 | Y6,713 | lifter-tick +21,338; rod-knock -27,412 |
| tick-at-idle | shitbox | Y189,000 | Y186,468 | Y186,214 | Y253 | lifter-tick +1,386; rod-knock -2,389 |
| tick-at-idle | uncommon | Y1,470,000 | Y1,430,688 | Y1,426,757 | Y3,931 | lifter-tick +13,003; rod-knock -17,237 |
| wheel-vibration | common | Y682,500 | Y659,220 | Y656,892 | Y2,328 | worn-tyres -7,392; buckled-rim +14,208; worn-driveshaft +14,208 |
| wheel-vibration | rare | Y3,360,000 | Y3,299,438 | Y3,293,381 | Y6,056 | worn-tyres -15,881; buckled-rim +32,869; worn-driveshaft +32,869 |
| wheel-vibration | shitbox | Y189,000 | Y187,014 | Y186,815 | Y199 | worn-tyres -15; buckled-rim +460; worn-driveshaft +460 |
| wheel-vibration | uncommon | Y1,470,000 | Y1,431,888 | Y1,428,077 | Y3,811 | worn-tyres -10,877; buckled-rim +21,763; worn-driveshaft +21,763 |
| wont-idle | common | Y682,500 | Y676,215 | Y675,587 | Y629 | vacuum-leak +3,464; tired-ecu -686; worn-cams -4,486 |
| wont-idle | rare | Y3,360,000 | Y3,340,875 | Y3,338,963 | Y1,913 | vacuum-leak +9,788; tired-ecu -1,462; worn-cams -12,712 |
| wont-idle | shitbox | Y189,000 | Y188,158 | Y188,074 | Y84 | vacuum-leak +622; tired-ecu -224; worn-cams -799 |
| wont-idle | uncommon | Y1,470,000 | Y1,458,696 | Y1,457,566 | Y1,130 | vacuum-leak +5,954; tired-ecu -1,006; worn-cams -7,726 |

### Donor coherence (Sprint 71 decision 8, the teardown game)

Whole-car sale value against parting out the same clean car (haircut `economy.teardown.usedPartSaleFraction`, plus scrapping the stripped shell). **Whole must always beat parted** - a clean car should never be worth more destroyed for parts. **Parting wins?** measures the SEPARATE worst-case-car question: does stripping the worst plausible generatable roll's still-good parts (better than `poor`) beat that same model's sensible-repair margin - disclosed against a 45% bill-to-clean break-even, not force-gated to it.

| Model | Whole sale | Parted yield | Strip labour | Bill/clean | Parting wins? |
|---|---|---|---|---|---|
| honda-beat-pp1 | Y504,000 | Y149,235 | 0 slots | 25.8% | no |
| honda-city-e-aa | Y189,000 | Y134,235 | 0 slots | 49.5% | yes |
| honda-city-turbo-ii-aa | Y441,000 | Y158,610 | 0 slots | 31.7% | no |
| honda-civic-sir2-eg6 | Y682,500 | Y533,000 | 0 slots | 54.8% | yes |
| honda-crx-sir-ef8 | Y588,000 | Y528,500 | 0 slots | 24.9% | yes |
| honda-prelude-si-vtec-bb4 | Y840,000 | Y540,500 | 0 slots | 44.5% | yes |
| mazda-rx7-fd3s | Y3,360,000 | Y1,535,000 | 0 slots | 41.5% | no |
| mazda-savanna-rx7-fc3s | Y1,890,000 | Y970,000 | 0 slots | 47.3% | no |
| nissan-180sx-rps13 | Y1,155,000 | Y935,000 | 0 slots | 55.3% | yes |
| nissan-cefiro-a31 | Y1,155,000 | Y935,000 | 0 slots | 55.3% | yes |
| nissan-fairlady-z-z32 | Y3,045,000 | Y1,520,000 | 0 slots | 45.8% | no |
| nissan-silvia-ks-s14 | Y1,575,000 | Y955,000 | 0 slots | 56.7% | no |
| nissan-silvia-s13 | Y1,155,000 | Y935,000 | 0 slots | 55.3% | yes |
| nissan-skyline-gtr-bnr32 | Y3,780,000 | Y1,555,000 | 0 slots | 36.9% | no |
| nissan-sunny-b12 | Y189,000 | Y134,235 | 0 slots | 49.5% | yes |
| subaru-impreza-wrx-sti-gc8 | Y1,890,000 | Y970,000 | 0 slots | 47.3% | no |
| suzuki-alto-works-ha21s | Y357,000 | Y154,610 | 0 slots | 39.1% | no |
| suzuki-wagon-r-ct21s | Y231,000 | Y136,235 | 0 slots | 56.4% | no |
| toyota-aristo-30v-jzs147 | Y2,940,000 | Y1,515,000 | 0 slots | 47.5% | no |
| toyota-carina-at150 | Y210,000 | Y135,235 | 0 slots | 44.6% | yes |
| toyota-chaser-tourer-v-jzx90 | Y1,680,000 | Y960,000 | 0 slots | 53.2% | no |
| toyota-mr2-sw20 | Y1,470,000 | Y950,000 | 0 slots | 43.5% | yes |
| toyota-sera-exy10 | Y472,500 | Y147,735 | 0 slots | 27.6% | no |
| toyota-sprinter-trueno-ae86 | Y1,470,000 | Y870,800 | 0 slots | 56.7% | no |
| toyota-supra-rz-jza80 | Y4,410,000 | Y1,585,000 | 0 slots | 31.7% | no |

## Story missions

**No bot accepts, grades, or delivers a story mission** - every number below is shipped content, proved satisfiable by a real build recipe in `packages/sim/tests/storyMissionProbes.test.ts` (Sprint 78 decision 1: every threshold/budget/payout is a fixed formula against that recipe's own measured stats, locked by the same test so content and probe can never drift). No bot statistic anywhere in this report covers the campaign.

| Mission | Persona | Gate (rep) | Deadline (days) | Payout | Budget | Requirements |
|---|---|---|---|---|---|---|
| four-wheels | Yuki | 0 | 15 | Y207,000 | Y175,000 | roadworthy |
| wont-strand-her | Okada-san | 30 | 15 | Y218,000 | Y185,000 | reliability >= 54 |
| first-proper-car | Yuki | 60 | 15 | Y489,000 | Y414,000 | first-timer >= 0.97x; reliability >= 54 |
| make-it-pull | Gen | 120 | 20 | Y847,000 | Y717,000 | power >= 191 |
| the-column-clock | Kaori | 200 | 20 | Y1,485,000 | Y1,257,000 | kirifuri <= 83.1s |
| low-and-loud | Daisuke | 320 | 20 | Y1,692,000 | Y1,432,000 | stancer >= 1x; style >= 55 |
| street-power-street-manners | Gen | 500 | 25 | Y1,552,000 | Y1,313,000 | power >= 235; reliability >= 48; tuner >= 0.99x |
| under-one-fifteen | Kaori | 800 | 25 | Y3,496,000 | Y2,958,000 | kirifuri <= 71.8s |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 3.6% | 10%-25% |
| mid | 19.4% | 50%-100% |
| frenzy | 76.9% | 5%-15% |

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

## Invariants enforced (Sprint 23 decision 7, Sprint 55 decision 2, Sprint 79 demotion)

`balance.cli check` hard-gates 6 checks against this data, all roster-coherence checks (economy-bible.md law 4, Sprints 55, 66, and 72) that read `coherence.csv` - closed-form model arithmetic with no bot in the loop: every model's worst-case bill-to-clean ratio <= `maxBillFraction` (law 2), every model's flip margin at the worst roll is positive (law 1), every model's SENSIBLE-play margin is positive (law 1 as amended, Sprint 66), every COMMON/UNCOMMON/RARE model's repair wage beats the rent over the labour it takes (law 6, Sprint 66; the shitbox tier is measured separately below, Sprint 72), every model's full consumable-replacement share of book value <= the content cap (law 3), and the service-job payout margin floor clears the profitability invariant's required coverage (law 4 - the full per-template/per-model proof is `serviceJobPayout.test.ts`, already gated in the standard test suite). 9 more are measured and reported but NOT gated - see `invariants.py`'s module docstring for their full history. Sprint 79 (maintainer sign-off 2026-07-16) demoted 5 of those 9 (days-to-`local`, the buyout-share ceiling, and the 3 legacy Sprint 03/09 checks): all five read bot-career CSVs (`careers.csv`, `auctionWins.csv`, `acquisitions.csv`), and the bots do not faithfully simulate the post-arc game (no inspection, no teardown, no build-to-spec) - a bot-derived pass or fail is not design evidence either way (`TODO.md`'s bot-harness entry). The remaining 4 were already informational before Sprint 79 and read BADLY, deliberately: as of Sprint 66 most strategies lose money (Flipper is well below its own starting cash) and the auction tail is frenzy-dominant. Do not tune the economy against any of these 9 figures. They measure BOT behaviour, and the bots restore every car to mint - which economy-bible law 1, as amended in Sprint 66, now correctly punishes on a cheap car. The closed-form coherence table above is bot-free and proves the same cars clear a healthy margin on the play the economy actually asks for. The bots needing a rework to play the real game is a known, recorded defect (`TODO.md`), not an economy failure - see `docs/sprints/sprint66.md`'s Exit. The Law 6 shitbox figure (Sprint 72): honestly pricing a non-surface repair's own refit labour surfaces a genuine shitbox-tier loss (cheap parts return too little repair gain to outearn the rent the labour burns) - narrowed but not closed by Sprint 79's free removal, measured and disclosed, not silently loosened, pending a maintainer economy-tuning decision (`TODO.md`).
