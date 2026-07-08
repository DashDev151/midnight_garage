"""Balance harness CLI.

Sprint 0 wiring stub. Sprint 3 fills in: read parquet emitted by the
headless sim's bot careers, compute pacing distributions with polars,
render a markdown report, and fail on invariant violations.
"""

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(prog="balance", description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    report = subparsers.add_parser("report", help="Render a balance report from sim run output.")
    report.add_argument("--runs", help="Path to a parquet file of simulated careers.")

    args = parser.parse_args()

    if args.command == "report":
        print("balance report: not implemented until Sprint 3 (harness wiring stub).")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
