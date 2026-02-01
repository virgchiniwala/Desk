#!/usr/bin/env python3
"""Parse Sentry CSV exports into structured metrics for deck generation.

Usage:
    python parse_sentry_csv.py <csv_path> [--mock] [--output <json_path>]
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

from typing import Optional

import pandas as pd


def _normalize_status(status: str) -> str:
    """Normalize Sentry status strings."""
    return status.strip().lower()


def _compute_new_errors(df: pd.DataFrame, window_days: int = 14) -> Optional[int]:
    """Count errors first seen within the last `window_days`.

    Returns None if 'First Seen' column is missing or unparseable.
    """
    if "First Seen" not in df.columns:
        return None

    cutoff = datetime.now() - timedelta(days=window_days)

    try:
        first_seen = pd.to_datetime(df["First Seen"], errors="coerce")
        return int((first_seen >= cutoff).sum())
    except Exception:
        return None


def parse_csv(csv_path: str) -> dict:
    """Parse a Sentry CSV export into structured metrics.

    Raises:
        FileNotFoundError: If csv_path does not exist.
        ValueError: If required columns are missing or data is malformed.
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    try:
        df = pd.read_csv(path)
    except Exception as e:
        raise ValueError(f"Failed to parse CSV: {e}") from e

    # Validate required columns
    required = {"Events", "Status"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    if df.empty:
        raise ValueError("CSV contains no data rows")

    # Normalize status for exact matching
    df["_status"] = df["Status"].apply(_normalize_status)

    total_errors = int(df["Events"].sum())
    resolved_count = int(df.loc[df["_status"] == "resolved", "Events"].sum())
    unresolved_count = int(df.loc[df["_status"] == "unresolved", "Events"].sum())
    error_types = len(df)
    new_errors = _compute_new_errors(df)

    # Top error types by event count
    if "Title" in df.columns:
        top_errors = (
            df.nlargest(5, "Events")[["Title", "Events", "Status"]]
            .rename(columns={"Events": "count"})
            .to_dict(orient="records")
        )
    else:
        top_errors = (
            df.nlargest(5, "Events")[["Events", "Status"]]
            .rename(columns={"Events": "count"})
            .to_dict(orient="records")
        )

    result = {
        "total_errors": total_errors,
        "resolved_count": resolved_count,
        "unresolved_count": unresolved_count,
        "error_types": error_types,
        "top_errors": top_errors,
    }

    if new_errors is not None:
        result["new_errors"] = new_errors

    return result


def _mock_metrics() -> dict:
    """Return canned metrics for development/testing."""
    return {
        "total_errors": 847,
        "resolved_count": 612,
        "unresolved_count": 235,
        "error_types": 23,
        "new_errors": 18,
        "top_errors": [
            {"title": "TypeError: Cannot read property 'map'", "count": 142, "status": "unresolved"},
            {"title": "NetworkError: timeout after 30s", "count": 98, "status": "unresolved"},
            {"title": "ValueError: invalid date format", "count": 76, "status": "resolved"},
            {"title": "KeyError: 'user_id' missing", "count": 54, "status": "resolved"},
            {"title": "MemoryError: allocation failed", "count": 41, "status": "unresolved"},
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Parse Sentry CSV into structured metrics")
    parser.add_argument("csv_path", nargs="?", help="Path to Sentry CSV export")
    parser.add_argument("--mock", action="store_true", help="Return mock data (dev/testing)")
    parser.add_argument("--output", "-o", help="Write JSON output to file (default: stdout)")
    args = parser.parse_args()

    if args.mock:
        metrics = _mock_metrics()
    else:
        if not args.csv_path:
            parser.error("csv_path is required unless --mock is used")
        metrics = parse_csv(args.csv_path)

    output = json.dumps(metrics, indent=2)
    if args.output:
        Path(args.output).write_text(output)
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
