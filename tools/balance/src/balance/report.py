"""Renders the balance report: per-strategy cash/car-count distributions
at checkpoint days, as a markdown table - answers "what does day 40 look
like for a flipper?" with real numbers (Sprint 03 DoD).
"""

import argparse
import sys
from pathlib import Path

import polars as pl

from balance.data import load_acquisitions, load_auction_wins, load_careers

CHECKPOINT_DAYS = [25, 40, 70, 100]


def summarize(df: pl.DataFrame) -> pl.DataFrame:
    checkpoints = df.filter(pl.col("day").is_in(CHECKPOINT_DAYS))
    return (
        checkpoints.group_by(["strategy", "day"])
        .agg(
            pl.col("cashYen").median().alias("cashYen_median"),
            pl.col("cashYen").quantile(0.1).alias("cashYen_p10"),
            pl.col("cashYen").quantile(0.9).alias("cashYen_p90"),
            pl.col("carsOwned").median().alias("carsOwned_median"),
            pl.col("reputationPoints").median().alias("reputationPoints_median"),
        )
        .sort(["strategy", "day"])
    )


BUCKET_TARGETS = {"steal": (0.10, 0.25), "mid": (0.50, 1.00), "frenzy": (0.05, 0.15)}


def summarize_auction_wins(df: pl.DataFrame) -> pl.DataFrame:
    """Sprint 20 (auction rework II): bucket share of the hammer price as a
    fraction of the lot's own anchorValueYen — the wholesale-anchored
    clearing calibration target, checked against real bot play rather than
    only the unit-level formula tests."""
    total = df.height
    counts = df.group_by("bucket").agg(pl.len().alias("count")).sort("bucket")
    return counts.with_columns((pl.col("count") / total).alias("share")) if total else counts


def render_auction_section(bucket_summary: pl.DataFrame) -> list[str]:
    """Basis (Sprint 20): fraction = hammer price / anchorValueYen (the best
    interested buyer's valuation of the rolled car) — steal < 0.65, mid
    0.65-0.9, frenzy > 0.9. Replaces the Sprint 10 [reserve, buyout]-fraction
    basis, which stopped meaning anything once buyout re-pointed at the
    value anchor and reserve stopped bounding real outcomes."""
    lines = [
        "## Auction calibration (Sprint 20, auction rework II)",
        "",
        "Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot "
        "bid on and lost or won (see `auctionWins.manifest.json` for the run size). "
        "steal < 0.65, mid 0.65-0.9, frenzy > 0.9. "
        "Target: steal 10-25% (patient bidding beating buyout most of the time), "
        "mid the majority, frenzy 5-15%.",
        "",
        "| Bucket | Share | Target |",
        "|---|---|---|",
    ]
    shares = {row["bucket"]: row["share"] for row in bucket_summary.iter_rows(named=True)}
    for bucket, (lo, hi) in BUCKET_TARGETS.items():
        share = shares.get(bucket, 0.0)
        lines.append(f"| {bucket} | {share:.1%} | {lo:.0%}-{hi:.0%} |")
    lines.append("")
    return lines


def summarize_acquisitions(df: pl.DataFrame) -> pl.DataFrame:
    """External review 2026-07 finding 2: fraction of acquisitions made via
    instant buyout vs. a won competitive bid, per strategy — if a strategy
    converges on always-buyout, the bidding screen is dead for it and
    AUCTION_BUYOUT_PREMIUM needs to hurt more."""
    if df.height == 0:
        return df
    return (
        df.group_by(["strategy", "channel"])
        .agg(pl.len().alias("count"))
        .with_columns(
            (pl.col("count") / pl.col("count").sum().over("strategy")).alias("share"),
        )
        .sort(["strategy", "channel"])
    )


def render_acquisitions_section(acquisitions_summary: pl.DataFrame) -> list[str]:
    lines = [
        "## Buyout vs. bid (external review 2026-07, finding 2)",
        "",
        "Share of successful auction acquisitions made via instant buyout vs. a won "
        "competitive bid, per strategy. A strategy near 100% buyout means the bidding "
        "screen is effectively dead for it and `AUCTION_BUYOUT_PREMIUM` (currently a "
        "25% premium over the value anchor, Sprint 20) is cheap enough that certainty "
        "always wins. Bots never buy out as of Sprint 20 (buyout is a player-impatience "
        "valve only), so this section's bot-side numbers are expected to read as 0% "
        "buyout going forward — kept for the player-side telemetry hook and as a "
        "regression check that bots really have stopped buying out.",
        "",
        "| Strategy | Bid | Buyout |",
        "|---|---|---|",
    ]
    if acquisitions_summary.height == 0:
        lines.append("| *(no acquisitions this run)* | - | - |")
        lines.append("")
        return lines

    shares: dict[str, dict[str, float]] = {}
    for row in acquisitions_summary.iter_rows(named=True):
        shares.setdefault(row["strategy"], {})[row["channel"]] = row["share"]
    for strategy in sorted(shares):
        bid = shares[strategy].get("bid", 0.0)
        buyout = shares[strategy].get("buyout", 0.0)
        lines.append(f"| {strategy} | {bid:.1%} | {buyout:.1%} |")
    lines.append("")
    return lines


def render_markdown(
    summary: pl.DataFrame, auction_section: list[str], acquisitions_section: list[str]
) -> str:
    lines = [
        "# Midnight Garage - Balance Report",
        "",
        "One row per strategy per checkpoint day, across every seeded career "
        "(see `careers.manifest.json` for the run size).",
        "",
        "| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) "
        "| Reputation pts (median) |",
        "|---|---|---|---|---|---|---|",
    ]
    for row in summary.iter_rows(named=True):
        lines.append(
            f"| {row['strategy']} | {row['day']} "
            f"| Y{row['cashYen_p10']:,.0f} | Y{row['cashYen_median']:,.0f} | Y{row['cashYen_p90']:,.0f} "
            f"| {row['carsOwned_median']:.1f} | {row['reputationPoints_median']:.1f} |"
        )
    lines.append("")
    lines.extend(auction_section)
    lines.extend(acquisitions_section)
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="tools/balance/data")
    parser.add_argument("--out", default="tools/balance/report.md")
    args = parser.parse_args(argv)

    data_dir = Path(args.data_dir)
    df = load_careers(data_dir)
    auction_wins = load_auction_wins(data_dir)
    acquisitions = load_acquisitions(data_dir)

    auction_section = render_auction_section(summarize_auction_wins(auction_wins))
    acquisitions_section = render_acquisitions_section(summarize_acquisitions(acquisitions))
    report = render_markdown(summarize(df), auction_section, acquisitions_section)
    Path(args.out).write_text(report, encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
