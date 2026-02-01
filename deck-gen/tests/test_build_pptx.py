"""Unit tests for build_pptx.

Covers:
- replace_text_preserve_format (single-run, multi-run, no-match)
- _apply_text_update / _apply_table_update dispatch
- apply_updates counting + error accumulation
- build_pptx entry-point validation (missing files, malformed JSON)
"""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from build_pptx import (
    _apply_table_update,
    _apply_text_update,
    apply_updates,
    build_pptx,
    replace_text_preserve_format,
)


# ---------------------------------------------------------------------------
# Mock helpers — thin wrappers that mimic python-pptx object shapes
# ---------------------------------------------------------------------------


def _run(text: str):
    r = MagicMock()
    r.text = text
    return r


def _para(runs: list):
    p = MagicMock()
    p.runs = runs
    return p


def _text_frame(paragraphs: list):
    tf = MagicMock()
    tf.paragraphs = paragraphs
    return tf


def _shape(name: str, *, text_frame=None, table=None):
    s = MagicMock()
    s.name = name
    s.has_text_frame = text_frame is not None
    s.has_table = table is not None
    if text_frame:
        s.text_frame = text_frame
    if table:
        s.table = table
    return s


# ---------------------------------------------------------------------------
# replace_text_preserve_format
# ---------------------------------------------------------------------------


class TestReplaceTextPreserveFormat:
    def test_single_run_replacement(self):
        r = _run("Hello World")
        tf = _text_frame([_para([r])])

        assert replace_text_preserve_format(tf, "World", "Friday") is True
        assert r.text == "Hello Friday"

    def test_no_match_returns_false_and_leaves_text_untouched(self):
        r = _run("Hello World")
        tf = _text_frame([_para([r])])

        assert replace_text_preserve_format(tf, "Missing", "X") is False
        assert r.text == "Hello World"

    def test_matches_in_second_paragraph(self):
        r1 = _run("First paragraph")
        r2 = _run("Target: [VALUE]")
        tf = _text_frame([_para([r1]), _para([r2])])

        assert replace_text_preserve_format(tf, "[VALUE]", "42") is True
        assert r1.text == "First paragraph"  # untouched
        assert r2.text == "Target: 42"

    def test_empty_text_frame_returns_false(self):
        tf = _text_frame([])
        assert replace_text_preserve_format(tf, "x", "y") is False

    def test_partial_match_does_not_replace(self):
        r = _run("partially matching text")
        tf = _text_frame([_para([r])])

        # "match" is a substring but we're looking for exact "MATCH"
        assert replace_text_preserve_format(tf, "MATCH", "NEW") is False
        assert r.text == "partially matching text"


# ---------------------------------------------------------------------------
# _apply_text_update
# ---------------------------------------------------------------------------


class TestApplyTextUpdate:
    def _slide_with_shape(self, shape_name, text):
        r = _run(text)
        tf = _text_frame([_para([r])])
        shape = _shape(shape_name, text_frame=tf)
        slide = MagicMock()
        slide.shapes = [shape]
        return slide, r

    def test_applies_when_shape_and_text_match(self):
        slide, r = self._slide_with_shape("Title 1", "Sprint [N]")
        update = {"shape": "Title 1", "old_text": "[N]", "new_text": "42"}

        assert _apply_text_update(slide, update) is True
        assert r.text == "Sprint 42"

    def test_returns_false_for_wrong_shape_name(self):
        slide, r = self._slide_with_shape("Title 1", "Sprint [N]")
        update = {"shape": "Other", "old_text": "[N]", "new_text": "42"}

        assert _apply_text_update(slide, update) is False
        assert r.text == "Sprint [N]"  # unchanged

    def test_returns_false_on_missing_fields(self):
        slide = MagicMock()
        slide.shapes = []
        assert _apply_text_update(slide, {}) is False
        assert _apply_text_update(slide, {"shape": "X"}) is False
        assert _apply_text_update(slide, {"shape": "X", "old_text": "a"}) is False


# ---------------------------------------------------------------------------
# _apply_table_update
# ---------------------------------------------------------------------------


class TestApplyTableUpdate:
    def _slide_with_table(self, shape_name, rows, cols, cell_text="[TOTAL]"):
        cell = MagicMock()
        run = _run(cell_text)
        cell.text_frame = _text_frame([_para([run])])
        cell.text = cell_text

        table = MagicMock()
        table.rows = [MagicMock() for _ in range(rows)]
        table.columns = [MagicMock() for _ in range(cols)]
        table.cell.return_value = cell

        shape = _shape(shape_name, table=table)
        slide = MagicMock()
        slide.shapes = [shape]
        return slide

    def test_applies_valid_table_update(self):
        slide = self._slide_with_table("Table 3", rows=3, cols=2)
        update = {"shape": "Table 3", "row": 1, "col": 0, "new_text": "847"}

        assert _apply_table_update(slide, update) is True

    def test_returns_false_for_out_of_bounds_row(self):
        slide = self._slide_with_table("Table 3", rows=2, cols=2)
        update = {"shape": "Table 3", "row": 99, "col": 0, "new_text": "x"}

        assert _apply_table_update(slide, update) is False

    def test_returns_false_on_missing_fields(self):
        slide = MagicMock()
        slide.shapes = []
        assert _apply_table_update(slide, {}) is False
        assert _apply_table_update(slide, {"shape": "T", "row": 0}) is False


# ---------------------------------------------------------------------------
# apply_updates — counting + error paths
# ---------------------------------------------------------------------------


class TestApplyUpdates:
    @patch("build_pptx.Presentation")
    def test_tracks_applied_and_skipped(self, MockPrs, tmp_path):
        # Slide 0 has a matchable shape; slide 1 is empty
        r = _run("old value")
        tf = _text_frame([_para([r])])
        shape = _shape("Title 1", text_frame=tf)

        slide0 = MagicMock()
        slide0.shapes = [shape]
        slide1 = MagicMock()
        slide1.shapes = []

        prs = MagicMock()
        prs.slides = [slide0, slide1]
        MockPrs.return_value = prs

        template = tmp_path / "template.pptx"
        template.write_bytes(b"fake")

        updates = [
            # ✓ matches
            {"slide_index": 0, "type": "text", "shape": "Title 1", "old_text": "old value", "new_text": "new value"},
            # ✗ shape missing on slide 1
            {"slide_index": 1, "type": "text", "shape": "Missing", "old_text": "x", "new_text": "y"},
            # ✗ slide index out of range
            {"slide_index": 99, "type": "text", "shape": "X", "old_text": "a", "new_text": "b"},
        ]

        result = apply_updates(str(template), updates, str(tmp_path / "out.pptx"))

        assert result["applied"] == 1
        assert result["skipped"] == 2
        assert len(result["errors"]) == 2

    def test_raises_on_missing_template(self, tmp_path):
        with pytest.raises(FileNotFoundError, match="Template not found"):
            apply_updates("/nonexistent.pptx", [{"slide_index": 0}], str(tmp_path / "out.pptx"))

    def test_raises_on_empty_updates(self, tmp_path):
        template = tmp_path / "t.pptx"
        template.write_bytes(b"fake")
        with pytest.raises(ValueError, match="No updates"):
            apply_updates(str(template), [], str(tmp_path / "out.pptx"))


# ---------------------------------------------------------------------------
# build_pptx — entry-point validation
# ---------------------------------------------------------------------------


class TestBuildPptxEntryPoint:
    def test_raises_on_missing_updates_file(self, tmp_path):
        template = tmp_path / "t.pptx"
        template.write_bytes(b"fake")
        with pytest.raises(FileNotFoundError, match="Updates JSON not found"):
            build_pptx(str(template), "/nonexistent.json", str(tmp_path / "out.pptx"))

    def test_raises_on_malformed_json(self, tmp_path):
        template = tmp_path / "t.pptx"
        template.write_bytes(b"fake")
        bad = tmp_path / "bad.json"
        bad.write_text("not json {{{")
        with pytest.raises(ValueError, match="Malformed updates JSON"):
            build_pptx(str(template), str(bad), str(tmp_path / "out.pptx"))

    def test_raises_when_updates_is_not_a_list(self, tmp_path):
        template = tmp_path / "t.pptx"
        template.write_bytes(b"fake")
        obj = tmp_path / "obj.json"
        obj.write_text('{"key": "value"}')
        with pytest.raises(ValueError, match="must be a list"):
            build_pptx(str(template), str(obj), str(tmp_path / "out.pptx"))
