# External review — 2026-07-08

An outside review of the project through Sprint 07. Findings in the reviewer's priority order, each
with disposition and where it's tracked. Update the status column as items land.

| # | Finding | Priority | Status | Owner sprint / deadline |
|---|---|---|---|---|
| 1 | Balance harness not in CI | High | Tracked (user previously deferred CI wiring) | **Before Phase 5 (Sprint 19)** |
| 2 | Buyout premium needs a leash + telemetry | High | Tracked; partial (see below) | Before Fun Gate (Sprint 08) tuning |
| 3 | `DEFAULT_SEED=1` → identical careers | High | **Addressed now** (randomized default) | Done Sprint 07 follow-up |
| 4 | Cautious Restorer = restoration under-rewarded (design signal) | Med | Documented as a design signal | **Fun Gate interviews (Sprint 08)** |
| 5a | `gameStore` trending toward a god-store | Low | Tracked | Sprint 13+ (staff/events) |
| 5b | Golden master covers only the job loop | Low | **Addressed now** (added acquisition→sale golden) | Done Sprint 07 follow-up |

## 1. Balance harness not in CI (High)

The harness (`pnpm balance:run` + `python -m balance.cli check`) only runs locally; `report.md` is
committed by hand and `ci.yml` has no Python step. A content PR can silently break the economy.
**Recommended:** a CI job path-filtered to `packages/sim/**` and `packages/content/data/**` that runs
`balance:run` + the invariants and uploads `report.md` as an artifact — **in place before Phase 5's
content waves**, or it won't protect the roster work when it matters most.

**Disposition:** valid and important. Note the tension: the maintainer *deliberately deferred* CI
wiring in Sprint 03 ("run it locally first"). This review is the trigger to **revisit that deferral
before Phase 5**. Not wired now (respecting the standing decision); tracked in `TODO.md` with the
Phase-5 deadline and the reviewer's path-filter/artifact specifics.

## 2. Buyout premium needs a leash + telemetry (High)

`AUCTION_BUYOUT_PREMIUM = 1.1` (10% over book) may make instant certainty too cheap and hollow out
the bidding game (the GDD's intended auction tension). **Recommended:** add a harness report column
for *fraction of acquisitions via buyout vs. won bids*; if flipper bots converge on always-buyout,
the bidding screen is dead and the constant must hurt more.

**Disposition:** legitimate balance risk. Context: buyout was a maintainer-requested feature, not an
accidental GDD deviation — but "too cheap" is a real concern. **Blocker to measuring it:** the
harness bots currently only *bid* (`bidsOnLots`), never buy out, so today's buyout-fraction is 0 by
construction. To get the telemetry the reviewer wants, a bot must model the buyout decision (bid vs.
buy-out-if-cheap). Tracked in `TODO.md`: (a) teach a bot to consider buyout, (b) add the
buyout-vs-bid column to the balance report, (c) tune `AUCTION_BUYOUT_PREMIUM` up if convergence
appears. Target: the Fun Gate tuning pass. Also flagged in `docs/economy-v0.md`.

## 3. `DEFAULT_SEED = 1` → identical careers (High) — ADDRESSED

Every fresh game used seed 1, so all players got the same lots and hidden issues (walkthroughs
trivialize the hunt). **Fixed:** a new career now takes a random seed by default; an explicit seed is
still accepted for dev/challenge/tests (and the balance harness + golden masters are unaffected —
they always pass explicit seeds). See the Sprint 07 follow-up.

## 4. Cautious Restorer: restoration may be under-rewarded (Med) — a design signal

The harness finding that full restoration doesn't complete profitable cycles in 100 days is **not
just a harness note** — it may mean restoration is under-rewarded, which strikes at the game's core
fantasy (hunt → *restore* → sell/enshrine). **Carry this explicitly into Fun Gate interviews:** do
players *want* to restore, and does the payoff feel worth it? Documented as a design question in
`docs/economy-v0.md` and to be added to the Sprint 08 (Fun Gate) interview script.

## 5a. `gameStore` god-store (Low)

Fine now, but when staff/events land (Sprint 13+), consider splitting domain stores (garage,
auctions, staff, ...) behind the current façade rather than one growing store. Tracked in `TODO.md`.

## 5b. Golden master coverage (Low) — ADDRESSED

The Sprint 02 golden master scripts only the job loop (repair + install on a pre-owned car) + idle
days. The money path (auction win → handover/lemon rule → sale) was covered by unit + store tests
but not by a deterministic replay hash. **Fixed:** added a second golden-master career that wins a
lot at auction and sells the car, pinned by hash, so a regression in the acquisition/sale path trips
the hash — not just the unit tests.
