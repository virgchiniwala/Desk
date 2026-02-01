"""Unit tests for validate_pptx.

Covers:
- validate_structure: valid deck, empty file, corrupt file, empty slide
- validate_updates_applied: text + table updates detected / missed
- validate_pptx orchestrator: short-circuits on structural failure,
  invokes update checks when updates path is provided
"""

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from validate_pptx import validate_pptx, validate_structure, validate_updates_applied


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _tmp_pptx(content: bytes = b"fake pptx content"):
    """Create a temporary file with .pptx extension. Caller must unlink."""
    f = tempfile.NamedTemporaryFile(suffix=".pptx", delete=False)
    f.write(content)
    f.close()
    return f.name


def _shape(name: str, *, text=None, table_cells=None):
    """Build a mock shape.

    table_cells: {(row, col): "text", ...}
    """
    s = MagicMock()
    s.name = name
    s.has_text_frame = text is not None
    s.has_table = table_cells is not None

    if text is not None:
        tf = MagicMock()
        tf.text = text
        s.text_frame = tf

    if table_cells is not None:
        table = MagicMock()
        max_row = max((r for r, _ in table_cells), default=0) + 1
        max_col = max((c for _, c in table_cells), default=0) + 1
        table.rows = [MagicMock() for _ in range(max_row)]
        table.columns = [MagicMock() for _ in range(max_col)]

        def cell_fn(r, c):
            cell = MagicMock()
            cell.text = table_cells.get((r, c), "")
            return cell

        table.cell = cell_fn
        s.table = table

    return s


# ---------------------------------------------------------------------------
# validate_structure
# ---------------------------------------------------------------------------


class TestValidateStructure:
    @patch("validate_pptx.Presentation")
    def test_valid_single_slide(self, MockPrs):
        slide = MagicMock()
        slide.shapes = [MagicMock(), MagicMock()]
        prs = MagicMock()
        prs.slides = [slide]
        MockPrs.return_value = prs

        path = _tmp_pptx()
        try:
            result = validate_structure(path)
            assert result["valid"] is True
            assert result["slide_count"] == 1
            assert result["issues"] == []
        finally:
            os.unlink(path)

    def test_file_not_found(self):
        result = validate_structure("/does/not/exist.pptx")
        assert result["valid"] is False
        assert "not found" in result["error"]

    def test_empty_file(self, tmp_path):
        p = tmp_path / "empty.pptx"
        p.write_bytes(b"")
        result = validate_structure(str(p))
        assert result["valid"] is False
        assert "empty" in result["error"]

    @patch("validate_pptx.Presentation", side_effect=Exception("corrupt zip"))
    def test_corrupt_file(self, _MockPrs):
        path = _tmp_pptx(b"garbage data")
        try:
            result = validate_structure(path)
            assert result["valid"] is False
            assert "Cannot open" in result["error"]
        finally:
            os.unlink(path)

    @patch("validate_pptx.Presentation")
    def test_flags_empty_slide(self, MockPrs):
        slide = MagicMock()
        slide.shapes = []  # no shapes
        prs = MagicMock()
        prs.slides = [slide]
        MockPrs.return_value = prs

        path = _tmp_pptx()
        try:
            result = validate_structure(path)
            assert result["valid"] is False
            assert any("no shapes" in issue for issue in result["issues"])
        finally:
            os.unlink(path)


# ---------------------------------------------------------------------------
# validate_updates_applied
# ---------------------------------------------------------------------------


class TestValidateUpdatesApplied:
    @patch("validate_pptx.Presentation")
    def test_detects_applied_text_update(self, MockPrs):
        shape = _shape("Title 1", text="Sprint 42")
        slide = MagicMock()
        slide.shapes = [shape]
        prs = MagicMock()
        prs.slides = [slide]
        MockPrs.return_value = prs

        path = _tmp_pptx()
        updates = [
            {
                "slide_index": 0,
                "shape": "Title 1",
                "old_text": "Sprint [N]",
                "new_text": "Sprint 42",
            }
        ]
        try:
            result = validate_updates_applied(path, updates)
            assert result["valid"] is True
            assert result["passed"] == 1
            assert result["results"][0]["status"] == "pass"
        finally:
            os.unlink(path)

    @patch("validate_pptx.Presentation")
    def test_detects_unapplied_text_update(self, MockPrs):
        # Shape still has old_text, new_text is absent
        shape = _shape("Title 1", text="Sprint [N]")
        slide = MagicMock()
        slide.shapes = [shape]
        prs = MagicMock()
        prs.slides = [slide]
        MockPrs.return_value = prs

        path = _tmp_pptx()
        updates = [
            {
                "slide_index": 0,
                "shape": "Title 1",
                "old_text": "Sprint [N]",
                "new_text": "Sprint 42",
            }
        ]
        try:
            result = validate_updates_applied(path, updates)
            assert result["valid"] is False
            assert result["failed"] == 1
            assert "not found" in result["results"][0]["reason"]
        finally:
            os.unlink(path)

    @patch("validate_pptx.Presentation")
    def test_detects_applied_table_update(self, MockPrs):
        shape = _shape("Table 3", table_cells={(1, 0): "847"})
        slide = MagicMock()
        slide.shapes = [shape]
        prs = MagicMock()
        prs.slides = [slide]
        MockPrs.return_value = prs

        path = _tmp_pptx()
        updates = [
            {
                "slide_index": 0,
                "shape": "Table 3",
                "row": 1,
                "col": 0,
                "old_text": "[TOTAL]",
                "new_text": "847",
            }
        ]
        try:
            result = validate_updates_applied(path, updates)
            assert result["valid"] is True
            assert result["passed"] == 1
        finally:
            os.unlink(path)

    def test_returns_error_on_missing_file(self):
        result = validate_updates_applied("/nonexistent.pptx", [])
        assert result["valid"] is False
        assert "not found" in result["error"]


# ---------------------------------------------------------------------------
# validate_pptx — orchestrator
# ---------------------------------------------------------------------------


class TestValidatePptxOrchestrator:
    @patch("validate_pptx.validate_structure")
    def test_short_circuits_on_structural_failure(self, mock_struct):
        mock_struct.return_value = {"valid": False, "error": "No slides"}

        result = validate_pptx("/fake.pptx")
        assert result["overall"]["valid"] is False
        assert "Structural" in result["overall"]["reason"]

    @patch("validate_pptx.validate_updates_applied")
    @patch("validate_pptx.validate_structure")
    def test_runs_update_check_when_updates_path_given(self, mock_struct, mock_updates, tmp_path):
        mock_struct.return_value = {
            "valid": True,
            "slide_count": 2,
            "slides": [],
            "issues": [],
        }
        mock_updates.return_value = {"valid": True, "passed": 1, "failed": 0, "results": []}

        updates_file = tmp_path / "updates.json"
        updates_file.write_text('[{"slide_index": 0}]')

        result = validate_pptx("/fake.pptx", str(updates_file))
        assert result["overall"]["valid"] is True
        mock_updates.assert_called_once()

    @patch("validate_pptx.validate_structure")
    def test_missing_updates_file_is_an_error(self, mock_struct):
        mock_struct.return_value = {
            "valid": True,
            "slide_count": 1,
            "slides": [],
            "issues": [],
        }
        result = validate_pptx("/fake.pptx", "/nonexistent_updates.json")
        assert result["overall"]["valid"] is False
        assert "not found" in result["overall"]["reason"]
