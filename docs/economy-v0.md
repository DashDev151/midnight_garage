# Economy v0 - Draft Targets

*Sprint 00 deliverable. These are design targets, not tuned values: every number here is a
hypothesis for the Sprint 3 balance harness to validate and for `packages/content` JSON to encode.
Sources: GDD sections 6 and 9, roadmap risk R4. All currency is yen.*

## Starting position (day 1)

| Item | Value | Rationale |
|---|---|---|
| Starting cash | ~~¥1,200,000~~ **¥1,500,000** | **Corrected in Sprint 03** (implementation-time finding 3, `docs/sprints/sprint03.md`): 100 days of weekly rent alone is ¥1,260,000 - more than the original draft, leaving zero operating margin for *any* strategy regardless of how it played. The harness doing exactly its intended job. |
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

**Amended in Sprint 03 design** (see `docs/sprints/sprint03.md` decision 3): reputation-tier
progression (Act 2/Act 3 gates) has no mechanic granting it yet, and neither does a real
"event chaser" strategy (needs the events system). Rather than assert against mechanics that
don't exist, #1 and #3 below are proxy invariants until a rep-gain mechanic lands.

**Amended again once the harness actually ran** (see `tools/balance/src/balance/invariants.py`
and sprint03.md's implementation-time findings): #1's separation check moved from day 25 to day
100 - the full 1,000-seed run showed day 25 is too early for a population median to diverge from
Passive Grinder (auction catalogs only start appearing day 7). #4's roster grew to 5 bots
(Flipper / Cautious Restorer / Balanced Player / Random / Passive Grinder - the last two added
mid-sprint at user request); the strict "no strategy beats another by more than 3x" framing was
dropped in favor of a sanity floor plus honest, un-gated reporting of each bot's actual result -
Cautious Restorer's day100 median is currently negative (~-¥255,000), a genuine finding about
full-restoration strategies needing a longer time horizon than 100 days, not something to force
past with a stricter invariant.

1. ~~A competent flipper bot reaches Act 2 (Local -> Known) by day 25 +/- 10~~ **Proxy (day 100,
   not day 25 - see above):** a Flipper bot's day100 cash trajectory is clearly separated from a
   Passive Grinder's, proving real market participation.
2. Rent pressure is real until the first staff hire: median cash buffer stays under 6 weeks of
   fixed costs through Act 1.
3. ~~Act 3 (Respected) by day 70 +/- 15 for flipper and event-chaser strategies~~ **Proxy:** a
   Flipper bot's day100 median cash stays positive (GDD 6.6's forced-loan/debt-spiral mechanic
   isn't built yet, so this is the closest measurable solvency signal) - the real Act 1 gate.
4. ~~No bot strategy out-earns another by more than 3x at day 100~~ **Softened to a sanity
   floor** (no strategy's day100 median falls below -¥2,000,000, catching a runaway/catastrophic
   bug) once the 5-bot spread made "3x" meaningless with negative numbers in the mix. Cautious
   Restorer's negative result and Random's clearly-worst result are both reported, not gated.
5. A fair-price uninspected purchase never loses more than **50% of purchase price** to hidden
   issues (sliding-scale lemon cap). **Verified at the mechanism level** (`auctions.test.ts`'s
   `resolveHandoverCondition` tests assert the dampened-multiplier behavior directly) but not yet
   as a population-level harness invariant - no bot currently buys uninspected and reports the
   outcome in a way the CSV captures. A natural follow-up once a bot models that behavior.
6. First-timer buyers keep sub-¥500k Commons sellable within 7 days at book value or better. **Not
   yet checked** - no bot models first-timer-specific selling behavior this sprint. Flagged as
   still open rather than silently assumed passing.

## Design signals from the external review (2026-07)

- **Restoration may be under-rewarded - a core-fantasy risk, not just a harness note.** The Cautious
  Restorer bot's full-restoration cycles don't turn a profit inside 100 days (Sprint 03 finding 5).
  The review reframes this: if restoring a car doesn't pay, the game's central fantasy (hunt →
  *restore* → sell/enshrine) is undercut. **Carry into the Fun Gate (Sprint 08) interviews:** do
  players *want* to restore, and does the payoff feel worth the time? A candidate economy fix is
  raising the reward for a fully-restored, high-authenticity car (collector valuation), but validate
  the desire first, then tune.
- **Buyout premium (`AUCTION_BUYOUT_PREMIUM = 1.1`) - measured 2026-07-09, not obviously too cheap.**
  All 6 auction-bidding bots now consider buyout (`shouldBuyout`, `sim/bots/buyoutHelpers.ts`) against
  the lot's own expected-clearing estimate; the real harness shows buyout at only 0.7-5.3% of
  acquisitions depending on strategy - no convergence toward always-buyout. Not a final tuning verdict
  (a different buyout heuristic could read differently), but real telemetry now exists where none did.
  See `TODO.md` and `tools/balance/report.md`.

## Open questions for the spreadsheet pass

- Interest rate and repayment cadence on the forced loan (GDD 6.6 says painful; how painful).
- Parts pricing curve per grade (Stock/Street/Sport/Race) relative to car book value.
- ~~Market heat amplitude~~ **First-pass answer landed in Sprint 02:** weekly demand-index drift
  is a seeded +/-4 random walk per model (`MARKET_HEAT_WEEKLY_DRIFT_RANGE` in
  `packages/sim/src/constants.ts`), floored at 0. Event-driven spikes (the GDD's +40%
  movie-premiere example) are still unbuilt - that's a later events-system sprint, not this
  weekly-drift baseline.
