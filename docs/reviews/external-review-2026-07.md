# External review - 2026-07-08

An outside review of the project through Sprint 07. Findings in the reviewer's priority order, each
with disposition and where it's tracked. Update the status column as items land.

| # | Finding | Priority | Status | Owner sprint / deadline |
|---|---|---|---|---|
| 1 | Balance harness not in CI | High | **Addressed 2026-07-09** (path-filtered CI job) | Done, ahead of the Phase 5 deadline |
| 2 | Buyout premium needs a leash + telemetry | High | **Addressed 2026-07-09** (measured: no convergence, 0.7-5.3%) | Done |
| 3 | `DEFAULT_SEED=1` → identical careers | High | **Addressed now** (randomized default) | Done Sprint 07 follow-up |
| 4 | Cautious Restorer = restoration under-rewarded (design signal) | Med | Documented as a design signal | **Fun Gate interviews (Sprint 08)** |
| 5a | `gameStore` trending toward a god-store | Low | Tracked | Sprint 13+ (staff/events) |
| 5b | Golden master covers only the job loop | Low | **Addressed now** (added acquisition→sale golden) | Done Sprint 07 follow-up |

## 1. Balance harness not in CI (High) - ADDRESSED

The harness (`pnpm balance:run` + `python -m balance.cli check`) only ran locally; `report.md` was
committed by hand and `ci.yml` had no Python step. A content PR could silently break the economy.
**Recommended:** a CI job path-filtered to `packages/sim/**` and `packages/content/data/**` that runs
`balance:run` + the invariants and uploads `report.md` as an artifact.

**Disposition:** **Fixed 2026-07-09**, well ahead of the Phase 5 deadline. A new `balance` job in
`.github/workflows/ci.yml` does exactly the recommended shape - path-filtered, runs the full harness +
invariant check, uploads `report.md`, and gates `deploy` (a skipped run, i.e. no relevant paths
changed, still counts as passing). **Immediately useful**: the very first real run under this job
showed Flipper's day100 cash solidly negative, a real data point worth having visibility into (see
`TODO.md` - not framed as a "regression," since no prior number was ever validated as the correct
target in the first place, just the sim producing a different answer after real logic changes).

## 2. Buyout premium needs a leash + telemetry (High) - ADDRESSED

`AUCTION_BUYOUT_PREMIUM = 1.1` (10% over book) may make instant certainty too cheap and hollow out
the bidding game (the GDD's intended auction tension). **Recommended:** add a harness report column
for *fraction of acquisitions via buyout vs. won bids*; if flipper bots converge on always-buyout,
the bidding screen is dead and the constant must hurt more.

**Disposition:** **Fixed 2026-07-09.** All 6 auction-bidding bots now run a shared `shouldBuyout`
decision (`sim/bots/buyoutHelpers.ts`) before queuing a bid - buy out only when the guaranteed price
is within a small tolerance of the lot's own shown "bid this high to win" estimate, not the bot's
personal bid ceiling. `report.py` renders the buyout-vs-bid share per strategy from a new
`acquisitions.csv`. **Measured, not assumed:** across the real 1000-career-per-strategy run, buyout
accounts for only 0.7-5.3% of acquisitions - no convergence toward always-buyout under this model, so
the premium doesn't look obviously too cheap. Not a final word (a different buyout heuristic could
behave differently), but a real data point answering the original concern, tracked in `TODO.md`.

## 3. `DEFAULT_SEED = 1` → identical careers (High) - ADDRESSED

Every fresh game used seed 1, so all players got the same lots and hidden issues (walkthroughs
trivialize the hunt). **Fixed:** a new career now takes a random seed by default; an explicit seed is
still accepted for dev/challenge/tests (and the balance harness + golden masters are unaffected -
they always pass explicit seeds). See the Sprint 07 follow-up.

## 4. Cautious Restorer: restoration may be under-rewarded (Med) - a design signal

The harness finding that full restoration doesn't complete profitable cycles in 100 days is **not
just a harness note** - it may mean restoration is under-rewarded, which strikes at the game's core
fantasy (hunt → *restore* → sell/enshrine). **Carry this explicitly into Fun Gate interviews:** do
players *want* to restore, and does the payoff feel worth it? Documented as a design question in
`docs/economy-v0.md` and to be added to the Sprint 08 (Fun Gate) interview script.

## 5a. `gameStore` god-store (Low)

Fine now, but when staff/events land (Sprint 13+), consider splitting domain stores (garage,
auctions, staff, ...) behind the current façade rather than one growing store. Tracked in `TODO.md`.

## 5b. Golden master coverage (Low) - ADDRESSED

The Sprint 02 golden master scripts only the job loop (repair + install on a pre-owned car) + idle
days. The money path (auction win → handover/lemon rule → sale) was covered by unit + store tests
but not by a deterministic replay hash. **Fixed:** added a second golden-master career that wins a
lot at auction and sells the car, pinned by hash, so a regression in the acquisition/sale path trips
the hash - not just the unit tests.
