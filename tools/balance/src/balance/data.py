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


def load_auction_wins(data_dir: Path) -> pl.DataFrame:
    """Sprint 20 (auction rework II): one row per lot a bot bid on and lost,
    or won, with the hammer price as a fraction of the lot's own
    anchorValueYen (the best-interested-buyer valuation) and its bucket."""
    return _load(data_dir, "auctionWins.manifest.json", "auctionWins.csv")


def load_acquisitions(data_dir: Path) -> pl.DataFrame:
    """External review 2026-07 finding 2: one row per successful auction
    acquisition, tagged by channel (bid vs. buyout)."""
    return _load(data_dir, "acquisitions.manifest.json", "acquisitions.csv")
