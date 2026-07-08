"""Balance harness CLI.

Reads the CSV the sim's `pnpm balance:run` exports (careers.csv +
careers.manifest.json), renders a markdown report, and checks the
pacing invariants - a failed invariant fails the build.
"""

import argparse
import sys

from balance.invariants import main as invariants_main
from balance.report import main as report_main


def main() -> int:
    parser = argparse.ArgumentParser(prog="balance", description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("report", help="Render the markdown balance report.")
    subparsers.add_parser("check", help="Check balance invariants; exits non-zero on failure.")

    args, remaining = parser.parse_known_args()

    if args.command == "report":
        return report_main(remaining)
    if args.command == "check":
        return invariants_main(remaining)
    return 1


if __name__ == "__main__":
    sys.exit(main())
