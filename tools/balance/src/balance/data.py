"""Loads the sim's exported careers CSV, using the manifest's explicit
schema rather than polars' type inference (Sprint 03 decision 1's
refinement - the one real thing raw CSV loses versus Parquet).
"""

import json
from pathlib import Path

import polars as pl

_DTYPES = {"string": pl.Utf8, "int64": pl.Int64, "float64": pl.Float64}


def _load(data_dir: Path, manifest_name: str, csv_name: str) -> pl.DataFrame:
    manifest = json.loads((data_dir / manifest_name).read_text(encoding="utf-8"))
    schema = {col["name"]: _DTYPES[col["type"]] for col in manifest["columns"]}
    return pl.read_csv(data_dir / csv_name, schema=schema)


def load_careers(data_dir: Path) -> pl.DataFrame:
    return _load(data_dir, "careers.manifest.json", "careers.csv")


def load_careers_manifest(data_dir: Path) -> dict:
    """Sprint 23: `startingCashYen`/`weeklyRentYen` live here, sourced from the
    same `economy.json` the export actually ran with, so a Python-side check
    validates against the real run instead of a second, drift-prone copy of
    the same numbers hardcoded in this package."""
    return json.loads((data_dir / "careers.manifest.json").read_text(encoding="utf-8"))


def load_auction_wins(data_dir: Path) -> pl.DataFrame:
    """Sprint 20 (auction rework II): one row per lot a bot bid on and lost,
    or won, with the hammer price as a fraction of the lot's own
    anchorValueYen (the best-interested-buyer valuation) and its bucket."""
    return _load(data_dir, "auctionWins.manifest.json", "auctionWins.csv")


def load_acquisitions(data_dir: Path) -> pl.DataFrame:
    """External review 2026-07 finding 2: one row per successful auction
    acquisition, tagged by channel (bid vs. buyout)."""
    return _load(data_dir, "acquisitions.manifest.json", "acquisitions.csv")


def load_coherence(data_dir: Path) -> pl.DataFrame:
    """Sprint 55 (economy-bible.md law 4): one row per roster model, the
    closed-form Law 1/Law 2/Law 3 facts `computeRosterCoherence` derives by
    calling the real sim value/generation-guard functions directly - no
    seeded careers involved, so this is the same on every run against
    unchanged content."""
    return _load(data_dir, "coherence.manifest.json", "coherence.csv")


def load_coherence_manifest(data_dir: Path) -> dict:
    """`maxBillFraction`/`payoutMarginMin`/`payoutRequiredCoverage` live here,
    sourced from the same `economy.json` the export actually ran with
    (Sprint 23's own "validate against the real run" precedent)."""
    return json.loads((data_dir / "coherence.manifest.json").read_text(encoding="utf-8"))
