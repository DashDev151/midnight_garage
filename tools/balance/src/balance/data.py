"""Loads the sim's exported careers CSV, using the manifest's explicit
schema rather than polars' type inference (Sprint 03 decision 1's
refinement - the one real thing raw CSV loses versus Parquet).
"""

import json
from pathlib import Path

import polars as pl

_DTYPES = {"string": pl.Utf8, "int64": pl.Int64}


def load_careers(data_dir: Path) -> pl.DataFrame:
    manifest = json.loads((data_dir / "careers.manifest.json").read_text(encoding="utf-8"))
    schema = {col["name"]: _DTYPES[col["type"]] for col in manifest["columns"]}
    return pl.read_csv(data_dir / "careers.csv", schema=schema)
