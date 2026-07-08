# Economy v0 — Draft Targets

*Sprint 00 deliverable. These are design targets, not tuned values: every number here is a
hypothesis for the Sprint 3 balance harness to validate and for `packages/content` JSON to encode.
Sources: GDD sections 6 and 9, roadmap risk R4. All currency is yen.*

## Starting position (day 1)

| Item | Value | Rationale |
|---|---|---|
| Starting cash | ¥1,200,000 | Enough for one shitbox flip plus ~4 weeks of rent buffer |
| Weekly rent | ¥90,000 | Real pressure: uncovered by service jobs alone after ~5 weeks |
| Player labor slots | 2/day (14/week) | GDD 3.2 base |
| Starting equipment | Basic tools | Gates jobs to Act 1 tier |

## Book value by rarity tier (1995 baseline)

Auction prices drift around book value; the sliding-scale lemon rule (GDD 6.5) keys variance to
discount from these numbers.

| Tier | Book value range | Typical flip margin target |
|---|---|---|
| Shitbox | ¥80,000 – ¥400,000 | +¥100k – ¥200k after parts/labor |
| Common | ¥300,000 – ¥1,200,000 | 25 – 40% |
| Uncommon | ¥800,000 – ¥2,500,000 | 25 – 40% |
| Rare | ¥2,000,000 – ¥6,000,000 | 20 – 35%, higher variance |
| Gaisha | ¥3,000,000 – ¥15,000,000 | Condition/provenance premium, low volume |
| Legend | ¥5,000,000 – ¥40,000,000+ | Not flipped; enshrined (2000GT beyond scale) |

## Recurring costs

| Cost | Value | Cadence |
|---|---|---|
| Rent | ¥90,000 (Portside start) | Weekly |
| Staff wage, 1 wrench | ¥45,000 | Weekly |
| Staff wage, 3 wrenches | ¥85,000 | Weekly |
| Staff wage, 5 wrenches | ¥140,000 | Weekly |
| Auction transport | ¥8,000 local / ¥25,000 regional | Per car |
| Inspection travel fee | ¥3,000 local / ¥10,000 regional | Per inspection |
| Missed rent/wages penalty | Forced loan at 15%/month after 2 misses | GDD 6.6 |

## Income sources (Act 1 scale)

| Source | Value | Notes |
|---|---|---|
| Oil change service job | ¥12,000, 1 slot | Tutorial-tier work |
| Clutch job | ¥35,000, 2 slots | |
| Shaken prep | ¥45,000, 3 slots | |
| First shitbox flip | ~¥150,000 profit | GDD 9.0 signature moment: covers rent |
| Service bay (passive, staffed) | ¥15,000 – ¥60,000/day | Scales with staff skill + shop rep, Act 2+ |
| Commission (Act 2 example) | Budget ¥900,000, payout ¥200k – ¥400k + rep | Score vs. brief |

## Labor-slot costs (representative jobs)

| Job | Slots |
|---|---|
| Auction inspection | 1 |
| Coilover / bolt-on install | 1 |
| Dyno session | 1 |
| Engine rebuild | 6 |
| Engine swap (with mounting kit) | 10 – 14 |
| Full Legend restoration | 25 – 40 |
| 1000hp Act 4 build | ~40 |

## Act pacing targets (harness invariants, Sprint 3)

These become hard assertions in `tools/balance`; a failed assertion fails the build.

1. A competent flipper bot reaches Act 2 (Local -> Known) by **day 25 +/- 10**.
2. Rent pressure is real until the first staff hire: median cash buffer stays under 6 weeks of
   fixed costs through Act 1.
3. Act 3 (Respected) by **day 70 +/- 15** for flipper and event-chaser strategies.
4. No bot strategy (pure flipper / service grinder / event chaser) out-earns another by more
   than **3x** at day 100.
5. A fair-price uninspected purchase never loses more than **50% of purchase price** to hidden
   issues (sliding-scale lemon cap).
6. First-timer buyers keep sub-¥500k Commons sellable within 7 days at book value or better.

## Open questions for the spreadsheet pass

- Interest rate and repayment cadence on the forced loan (GDD 6.6 says painful; how painful).
- Parts pricing curve per grade (Stock/Street/Sport/Race) relative to car book value.
- ~~Market heat amplitude~~ **First-pass answer landed in Sprint 02:** weekly demand-index drift
  is a seeded +/-4 random walk per model (`MARKET_HEAT_WEEKLY_DRIFT_RANGE` in
  `packages/sim/src/constants.ts`), floored at 0. Event-driven spikes (the GDD's +40%
  movie-premiere example) are still unbuilt — that's a later events-system sprint, not this
  weekly-drift baseline.
