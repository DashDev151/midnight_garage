# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y58,003 | Y120,654 | Y200,520 | 1.0 | 0.0 |
| balanced-player | 40 | Y18,003 | Y78,284 | Y131,481 | 1.0 | 0.0 |
| balanced-player | 70 | Y-81,997 | Y-21,716 | Y31,481 | 1.0 | 0.0 |
| balanced-player | 100 | Y-161,997 | Y-101,716 | Y-48,519 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y20,232 | Y85,254 | Y147,829 | 1.0 | 0.0 |
| cautious-restorer | 40 | Y-19,768 | Y45,046 | Y105,433 | 1.0 | 0.0 |
| cautious-restorer | 70 | Y-119,768 | Y-54,954 | Y5,433 | 1.0 | 0.0 |
| cautious-restorer | 100 | Y-199,768 | Y-134,954 | Y-74,567 | 1.0 | 0.0 |
| competent-policy | 25 | Y61,607 | Y140,506 | Y261,014 | 1.0 | 0.0 |
| competent-policy | 40 | Y21,878 | Y92,608 | Y200,000 | 1.0 | 0.0 |
| competent-policy | 70 | Y-78,122 | Y-7,604 | Y77,179 | 1.0 | 0.0 |
| competent-policy | 100 | Y-158,122 | Y-87,604 | Y-1,791 | 1.0 | 0.0 |
| flipper | 25 | Y36,946 | Y92,681 | Y172,493 | 1.0 | 0.0 |
| flipper | 40 | Y554 | Y57,986 | Y136,818 | 1.0 | 0.0 |
| flipper | 70 | Y-99,446 | Y-36,118 | Y55,432 | 1.0 | 0.0 |
| flipper | 100 | Y-179,446 | Y-116,118 | Y-13,454 | 1.0 | 0.0 |
| handyman | 25 | Y44,924 | Y113,724 | Y173,654 | 1.0 | 0.0 |
| handyman | 40 | Y4,924 | Y71,670 | Y120,710 | 1.0 | 0.0 |
| handyman | 70 | Y-95,076 | Y-28,330 | Y20,710 | 1.0 | 0.0 |
| handyman | 100 | Y-175,076 | Y-108,330 | Y-59,290 | 1.0 | 0.0 |
| investor | 25 | Y17,669 | Y88,938 | Y150,499 | 1.0 | 0.0 |
| investor | 40 | Y-22,331 | Y46,577 | Y95,738 | 1.0 | 0.0 |
| investor | 70 | Y-122,331 | Y-53,423 | Y-4,262 | 1.0 | 0.0 |
| investor | 100 | Y-202,331 | Y-133,423 | Y-84,262 | 1.0 | 0.0 |
| passive-grinder | 25 | Y240,000 | Y240,000 | Y240,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y200,000 | Y200,000 | Y200,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y100,000 | Y100,000 | Y100,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y20,000 | Y20,000 | Y20,000 | 0.0 | 0.0 |
| random | 25 | Y41,446 | Y108,762 | Y164,307 | 1.0 | 0.0 |
| random | 40 | Y1,446 | Y68,228 | Y117,988 | 1.0 | 0.0 |
| random | 70 | Y-98,554 | Y-31,772 | Y17,988 | 1.0 | 0.0 |
| random | 100 | Y-178,554 | Y-111,772 | Y-62,012 | 1.0 | 0.0 |
| service-grinder | 25 | Y240,000 | Y254,898 | Y288,010 | 0.0 | 0.0 |
| service-grinder | 40 | Y200,000 | Y227,148 | Y268,552 | 0.0 | 0.0 |
| service-grinder | 70 | Y114,967 | Y157,291 | Y200,313 | 0.0 | 0.0 |
| service-grinder | 100 | Y62,338 | Y106,226 | Y151,700 | 0.0 | 0.0 |

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
| competent-policy | engine | 4.0 |
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
| honda-city-e-aa | shitbox | Y135,000 | Y66,840 | 49.5% | Y34,309 (25.4%) | Y3,202 | Y-9,772 | 0.57x | 8.1% |
| honda-civic-sir2-eg6 | common | Y487,500 | Y267,200 | 54.8% | Y92,995 (19.1%) | Y124,348 | Y69,838 | 3.01x | 8.9% |
| mazda-rx7-fd3s | rare | Y2,400,000 | Y997,000 | 41.5% | Y787,800 (32.8%) | Y860,300 | Y377,429 | 8.77x | 4.5% |
| mazda-savanna-rx7-fc3s | uncommon | Y1,350,000 | Y638,080 | 47.3% | Y360,723 (26.7%) | Y443,475 | Y145,570 | 5.02x | 5.2% |
| nissan-180sx-rps13 | uncommon | Y825,000 | Y456,320 | 55.3% | Y79,418 (9.6%) | Y251,651 | Y145,570 | 5.02x | 8.4% |
| nissan-silvia-ks-s14 | uncommon | Y1,125,000 | Y638,080 | 56.7% | Y270,723 (24.1%) | Y353,475 | Y145,570 | 5.02x | 6.2% |
| suzuki-wagon-r-ct21s | shitbox | Y165,000 | Y93,010 | 56.4% | Y46,309 (28.1%) | Y22,155 | Y-9,772 | 0.57x | 6.6% |
| toyota-chaser-tourer-v-jzx90 | uncommon | Y1,200,000 | Y638,080 | 53.2% | Y300,723 (25.1%) | Y383,475 | Y145,570 | 5.02x | 5.8% |
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
| smokes-on-startup | common | Y682,500 | Y659,395 | Y657,085 | Y2,311 | valve-seals +9,316; tired-rings -8,784; head-gasket -1,184 |
| smokes-on-startup | rare | Y3,360,000 | Y3,288,938 | Y3,281,831 | Y7,106 | valve-seals +25,669; tired-rings -23,081; head-gasket -581 |
| smokes-on-startup | shitbox | Y189,000 | Y186,074 | Y185,781 | Y293 | valve-seals +1,819; tired-rings -1,956; head-gasket -806 |
| smokes-on-startup | uncommon | Y1,470,000 | Y1,428,168 | Y1,423,985 | Y4,183 | valve-seals +15,775; tired-rings -14,465; head-gasket -1,025 |
| tick-at-idle | common | Y682,500 | Y660,970 | Y658,817 | Y2,153 | lifter-tick +7,583; rod-knock -10,517 |
| tick-at-idle | rare | Y3,360,000 | Y3,292,875 | Y3,286,163 | Y6,713 | lifter-tick +21,338; rod-knock -27,412 |
| tick-at-idle | shitbox | Y189,000 | Y186,468 | Y186,214 | Y253 | lifter-tick +1,386; rod-knock -2,389 |
| tick-at-idle | uncommon | Y1,470,000 | Y1,430,688 | Y1,426,757 | Y3,931 | lifter-tick +13,003; rod-knock -17,237 |
| wont-idle | common | Y682,500 | Y676,215 | Y675,587 | Y629 | vacuum-leak +3,464; tired-ecu -686; worn-cams -4,486 |
| wont-idle | rare | Y3,360,000 | Y3,340,875 | Y3,338,963 | Y1,913 | vacuum-leak +9,788; tired-ecu -1,462; worn-cams -12,712 |
| wont-idle | shitbox | Y189,000 | Y188,158 | Y188,074 | Y84 | vacuum-leak +622; tired-ecu -224; worn-cams -799 |
| wont-idle | uncommon | Y1,470,000 | Y1,458,696 | Y1,457,566 | Y1,130 | vacuum-leak +5,954; tired-ecu -1,006; worn-cams -7,726 |

### Donor coherence (Sprint 71 decision 8, the teardown game)

Whole-car sale value against parting out the same clean car (haircut `economy.teardown.usedPartSaleFraction`, plus scrapping the stripped shell). **Whole must always beat parted** - a clean car should never be worth more destroyed for parts. **Parting wins?** measures the SEPARATE worst-case-car question: does stripping the worst plausible generatable roll's still-good parts (better than `poor`) beat that same model's sensible-repair margin - disclosed against a 45% bill-to-clean break-even, not force-gated to it.

| Model | Whole sale | Parted yield | Strip labour | Bill/clean | Parting wins? |
|---|---|---|---|---|---|
| honda-city-e-aa | Y189,000 | Y134,235 | 0 slots | 49.5% | yes |
| honda-civic-sir2-eg6 | Y682,500 | Y533,000 | 0 slots | 54.8% | yes |
| mazda-rx7-fd3s | Y3,360,000 | Y1,535,000 | 0 slots | 41.5% | no |
| mazda-savanna-rx7-fc3s | Y1,890,000 | Y970,000 | 0 slots | 47.3% | no |
| nissan-180sx-rps13 | Y1,155,000 | Y935,000 | 0 slots | 55.3% | yes |
| nissan-silvia-ks-s14 | Y1,575,000 | Y955,000 | 0 slots | 56.7% | no |
| suzuki-wagon-r-ct21s | Y231,000 | Y136,235 | 0 slots | 56.4% | no |
| toyota-chaser-tourer-v-jzx90 | Y1,680,000 | Y960,000 | 0 slots | 53.2% | no |
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
| steal | 4.4% | 10%-25% |
| mid | 20.5% | 50%-100% |
| frenzy | 75.1% | 5%-15% |

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
