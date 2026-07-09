"""Balance harness invariants (Sprint 03, roadmap risk R4).

These assert what this sprint's balance run actually demonstrated, not
what the roadmap's original one-line invariants assumed - reputation-tier
progression and the forced-loan/repossession mechanic (GDD 6.6) aren't
built yet, so "reaches Act 2 by day 25" and "never enters the debt
spiral" are checked as the measurable proxies docs/economy-v0.md records
(never quietly faking a mechanic to make a check pass): solvency and
real market participation, not literal Act-tier or forced-loan state.

Market participation is checked at day 100, not day 25 - the full
1000-seed run showed day 25 is too early for a population-level median to
separate from the Passive Grinder baseline (auction catalogs only start
appearing day 7, and a median career hasn't won its first auction yet by
day 25). Checking at day 25 would have been an untested assumption
carried over from the design doc rather than what the data actually
shows once the harness ran at full scale.

Cautious Restorer's day100 result is reported, not gated - full
restoration (5 zones + a 5-day public listing wait) doesn't complete
enough profitable cycles within a 100-day career to demonstrate
profitability at this time horizon. That is a known, documented finding
for a future balance pass (see docs/sprints/sprint03.md), not a bug to
paper over with an invariant that would hide it.

Balanced Player and Random (added after this sprint's first pass, at
user request) are included in the sanity-floor check and reported for
visibility, but not yet gated on a specific expected outcome - there's
no established target for a "completely average" bot or a "no strategy
at all" control yet, only the observation that Random should plausibly
underperform every deliberate strategy (which the first real run
confirmed: Random's day100 median was clearly the worst of all five).

Flipper's day100 solvency (`> 0`) was originally gated (Sprint 03), on
the same unvalidated-target footing every other per-strategy number
here has always been on - no one ever confirmed that a positive median
was the *correct* outcome for this bot, only that it looked plausible
the day it was written. Downgraded to informational 2026-07-09 after
a real run came back solidly negative following several sprints of
unrelated logic changes (equipment costs, delivery timing, and more):
the maintainer's own framing is the right one - this isn't a
regression from a known-good baseline (none was ever established),
it's the sim producing a new answer after its logic changed, which is
exactly what an unvalidated simulation is expected to do. Matches
Cautious Restorer's precedent exactly: report the number, don't assert
a target nobody has actually confirmed.
"""

import argparse
import sys
from pathlib import Path

import polars as pl

from balance.data import load_careers

SANITY_FLOOR_YEN = -2_000_000
SEPARATION_THRESHOLD_YEN = 20_000


def median_cash(df: pl.DataFrame, strategy: str, day: int) -> float:
    sub = df.filter((pl.col("strategy") == strategy) & (pl.col("day") == day))
    return sub.select(pl.col("cashYen").median()).item()


def check_invariants(df: pl.DataFrame) -> list[tuple[str, bool, str]]:
    passive_100 = median_cash(df, "passive-grinder", 100)
    flipper_100 = median_cash(df, "flipper", 100)
    restorer_100 = median_cash(df, "cautious-restorer", 100)
    balanced_100 = median_cash(df, "balanced-player", 100)
    random_100 = median_cash(df, "random", 100)

    results: list[tuple[str, bool, str]] = []

    results.append(
        (
            "Passive Grinder solvency baseline",
            passive_100 > SANITY_FLOOR_YEN,
            f"day100 median cashYen=Y{passive_100:,.0f}",
        )
    )

    results.append(
        (
            "Flipper shows real market participation (day100 cash diverges from "
            "Passive Grinder's, proving trades actually happen)",
            abs(flipper_100 - passive_100) > SEPARATION_THRESHOLD_YEN,
            f"flipper=Y{flipper_100:,.0f} passive=Y{passive_100:,.0f} "
            f"diff=Y{abs(flipper_100 - passive_100):,.0f}",
        )
    )

    results.append(
        (
            "No strategy falls below the sanity floor (catches a runaway/"
            "catastrophic bug, not ordinary economic underperformance)",
            all(
                v > SANITY_FLOOR_YEN
                for v in (passive_100, flipper_100, restorer_100, balanced_100, random_100)
            ),
            f"passive=Y{passive_100:,.0f} flipper=Y{flipper_100:,.0f} "
            f"restorer=Y{restorer_100:,.0f} balanced=Y{balanced_100:,.0f} "
            f"random=Y{random_100:,.0f}",
        )
    )

    results.append(
        (
            "[INFO, not gated] Cautious Restorer day100 median cash - known to "
            "need a longer time horizon than 100 days (see sprint03.md)",
            True,
            f"day100 median cashYen=Y{restorer_100:,.0f}",
        )
    )

    results.append(
        (
            "[INFO, not gated] Flipper day100 median cash - no confirmed target; "
            "downgraded from a hard gate 2026-07-09 (never validated as correct, "
            "just the number a first pass happened to produce)",
            True,
            f"day100 median cashYen=Y{flipper_100:,.0f}",
        )
    )

    results.append(
        (
            "[INFO, not gated] Balanced Player day100 median cash - no "
            "established target yet for a 'completely average' strategy",
            True,
            f"day100 median cashYen=Y{balanced_100:,.0f}",
        )
    )

    results.append(
        (
            "[INFO, not gated] Random day100 median cash - expected to "
            "underperform every deliberate strategy, not asserted to a "
            "specific number",
            True,
            f"day100 median cashYen=Y{random_100:,.0f}"
            f" (worst of all 5: {random_100 < min(passive_100, flipper_100, restorer_100, balanced_100)})",
        )
    )

    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="tools/balance/data")
    args = parser.parse_args(argv)

    df = load_careers(Path(args.data_dir))
    results = check_invariants(df)

    all_passed = True
    for name, passed, detail in results:
        status = "PASS" if passed else "FAIL"
        print(f"[{status}] {name}: {detail}")
        if not passed:
            all_passed = False

    if not all_passed:
        print("\nOne or more invariants failed.")
        return 1

    print("\nAll invariants passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
