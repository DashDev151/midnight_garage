"""Renders the balance report: per-strategy cash/car-count distributions
at checkpoint days, as a markdown table - answers "what does day 40 look
like for a flipper?" with real numbers (Sprint 03 DoD).
"""

import argparse
import sys
from pathlib import Path

import polars as pl

from balance.data import load_careers

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
        )
        .sort(["strategy", "day"])
    )


def render_markdown(summary: pl.DataFrame) -> str:
    lines = [
        "# Midnight Garage - Balance Report",
        "",
        "One row per strategy per checkpoint day, across every seeded career "
        "(see `careers.manifest.json` for the run size).",
        "",
        "| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) |",
        "|---|---|---|---|---|---|",
    ]
    for row in summary.iter_rows(named=True):
        lines.append(
            f"| {row['strategy']} | {row['day']} "
            f"| Y{row['cashYen_p10']:,.0f} | Y{row['cashYen_median']:,.0f} | Y{row['cashYen_p90']:,.0f} "
            f"| {row['carsOwned_median']:.1f} |"
        )
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="tools/balance/data")
    parser.add_argument("--out", default="tools/balance/report.md")
    args = parser.parse_args(argv)

    df = load_careers(Path(args.data_dir))
    report = render_markdown(summarize(df))
    Path(args.out).write_text(report, encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
