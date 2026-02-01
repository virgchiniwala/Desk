"""Unit tests for parse_sentry_csv.

Covers:
- Status normalization and exact matching (regression: str.contains bug)
- new_errors computation from First Seen column
- Required-column and empty-file validation
- Mock metrics shape
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from parse_sentry_csv import _compute_new_errors, _mock_metrics, _normalize_status, parse_csv


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def simple_csv(tmp_path):
    """Minimal valid CSV with two rows."""
    content = "Title,Events,Status\nTypeError,100,resolved\nKeyError,50,unresolved\n"
    p = tmp_path / "simple.csv"
    p.write_text(content)
    return str(p)


@pytest.fixture()
def csv_with_first_seen(tmp_path):
    """CSV that includes a First Seen column for new_errors calculation."""
    now = datetime.now()
    recent = (now - timedelta(days=5)).strftime("%Y-%m-%d")
    old = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    content = (
        "Title,Events,Status,First Seen\n"
        f"TypeError,100,resolved,{old}\n"
        f"KeyError,50,unresolved,{recent}\n"
        f"ValueError,30,unresolved,{recent}\n"
    )
    p = tmp_path / "first_seen.csv"
    p.write_text(content)
    return str(p)


@pytest.fixture()
def csv_tricky_status(tmp_path):
    """Status values that would break a naive str.contains('resolved') check.

    resolved  → 100 events
    unresolved → 80 events  (contains 'resolved' as substring)
    RESOLVED  → 20 events   (case variant)
    Unresolved → 10 events  (case variant)
    """
    content = (
        "Title,Events,Status\n"
        "Err1,100,resolved\n"
        "Err2,80,unresolved\n"
        "Err3,20,RESOLVED\n"
        "Err4,10,Unresolved\n"
    )
    p = tmp_path / "tricky.csv"
    p.write_text(content)
    return str(p)


# ---------------------------------------------------------------------------
# _normalize_status
# ---------------------------------------------------------------------------


class TestNormalizeStatus:
    def test_lowercases(self):
        assert _normalize_status("Resolved") == "resolved"

    def test_strips_whitespace(self):
        assert _normalize_status("  unresolved  ") == "unresolved"

    def test_already_normalized(self):
        assert _normalize_status("resolved") == "resolved"


# ---------------------------------------------------------------------------
# _compute_new_errors
# ---------------------------------------------------------------------------


class TestComputeNewErrors:
    def test_counts_only_recent_rows(self):
        now = datetime.now()
        df = pd.DataFrame(
            {
                "First Seen": [
                    (now - timedelta(days=3)).isoformat(),   # recent ✓
                    (now - timedelta(days=30)).isoformat(),  # old   ✗
                    (now - timedelta(days=10)).isoformat(),  # recent ✓
                ]
            }
        )
        assert _compute_new_errors(df, window_days=14) == 2

    def test_returns_none_when_column_missing(self):
        df = pd.DataFrame({"Events": [10, 20]})
        assert _compute_new_errors(df) is None

    def test_handles_unparseable_dates_gracefully(self):
        df = pd.DataFrame({"First Seen": ["not-a-date", "also-bad"]})
        # All dates coerce to NaT; NaT >= cutoff is False → count is 0
        assert _compute_new_errors(df) == 0


# ---------------------------------------------------------------------------
# parse_csv — happy path
# ---------------------------------------------------------------------------


class TestParseCsvHappyPath:
    def test_basic_totals(self, simple_csv):
        result = parse_csv(simple_csv)
        assert result["total_errors"] == 150
        assert result["resolved_count"] == 100
        assert result["unresolved_count"] == 50
        assert result["error_types"] == 2

    def test_new_errors_included_when_first_seen_present(self, csv_with_first_seen):
        result = parse_csv(csv_with_first_seen)
        assert "new_errors" in result
        assert result["new_errors"] == 2  # only the two recent rows

    def test_new_errors_omitted_when_first_seen_absent(self, simple_csv):
        result = parse_csv(simple_csv)
        assert "new_errors" not in result

    def test_top_errors_capped_at_five(self, tmp_path):
        rows = "\n".join(f"Err{i},{i * 10},unresolved" for i in range(1, 10))
        p = tmp_path / "many.csv"
        p.write_text(f"Title,Events,Status\n{rows}\n")
        result = parse_csv(str(p))
        assert len(result["top_errors"]) == 5


# ---------------------------------------------------------------------------
# parse_csv — regression: exact status matching
# ---------------------------------------------------------------------------


class TestParseCsvStatusRegression:
    """Regression suite for the str.contains('resolved') bug.

    The old code matched 'unresolved' rows as resolved because
    'unresolved'.contains('resolved') is True.  Fixed to use exact
    equality on the normalized status column.
    """

    def test_resolved_and_unresolved_counted_separately(self, csv_tricky_status):
        result = parse_csv(csv_tricky_status)
        # resolved:   Err1 (100) + Err3 (20) = 120
        assert result["resolved_count"] == 120
        # unresolved: Err2 (80)  + Err4 (10) = 90
        assert result["unresolved_count"] == 90


# ---------------------------------------------------------------------------
# parse_csv — error handling (input validation)
# ---------------------------------------------------------------------------


class TestParseCsvValidation:
    def test_raises_on_missing_file(self):
        with pytest.raises(FileNotFoundError, match="CSV not found"):
            parse_csv("/nonexistent/path.csv")

    def test_raises_on_missing_required_columns(self, tmp_path):
        p = tmp_path / "bad_cols.csv"
        p.write_text("Name,Count\nfoo,10\n")
        with pytest.raises(ValueError, match="Missing required columns"):
            parse_csv(str(p))

    def test_raises_on_empty_data(self, tmp_path):
        p = tmp_path / "empty_data.csv"
        p.write_text("Title,Events,Status\n")  # header only
        with pytest.raises(ValueError, match="no data rows"):
            parse_csv(str(p))

    def test_raises_on_malformed_file(self, tmp_path):
        p = tmp_path / "garbage.csv"
        p.write_bytes(b"\x00\x01\x02 not a csv at all \xff\xfe")
        with pytest.raises(ValueError):
            parse_csv(str(p))


# ---------------------------------------------------------------------------
# _mock_metrics — shape contract
# ---------------------------------------------------------------------------


class TestMockMetrics:
    REQUIRED_FIELDS = {
        "total_errors",
        "resolved_count",
        "unresolved_count",
        "error_types",
        "new_errors",
        "top_errors",
    }

    def test_has_all_required_fields(self):
        assert self.REQUIRED_FIELDS <= set(_mock_metrics().keys())

    def test_top_errors_has_five_entries(self):
        assert len(_mock_metrics()["top_errors"]) == 5
