#!/usr/bin/env python3
"""Build or update a PowerPoint deck from a template + slide updates JSON.

Usage:
    python build_pptx.py <template_path> <updates_json> --output <output_path>
"""

import argparse
import json
import sys
from pathlib import Path

from pptx import Presentation


def replace_text_preserve_format(text_frame, old_text: str, new_text: str) -> bool:
    """Replace text in a text frame while preserving run-level formatting.

    Handles the python-pptx footgun where ``shape.text = x`` destroys all
    formatting by replacing every run with a single default-formatted run.

    When old_text spans multiple runs, the replacement is rebuilt using the
    formatting of the first matching run.

    Returns True if a replacement was made.
    """
    for para in text_frame.paragraphs:
        full_text = "".join(run.text for run in para.runs)
        if old_text not in full_text:
            continue

        # Fast path: single run contains the entire match
        if len(para.runs) == 1:
            para.runs[0].text = full_text.replace(old_text, new_text)
            return True

        # Multi-run match: locate the span, rebuild using first run's format
        accumulated = ""
        for i, run in enumerate(para.runs):
            for j, ch in enumerate(run.text):
                accumulated += ch
                if accumulated.endswith(old_text):
                    # Found the end of the match — now find the start
                    start_pos = len(accumulated) - len(old_text)
                    pos = 0
                    start_run_idx = 0
                    start_char_idx = 0
                    for k, r in enumerate(para.runs):
                        if pos + len(r.text) > start_pos:
                            start_run_idx = k
                            start_char_idx = start_pos - pos
                            break
                        pos += len(r.text)

                    end_run_idx = i
                    end_char_idx = j + 1

                    # Insert new_text into the start run, clear the rest
                    para.runs[start_run_idx].text = (
                        para.runs[start_run_idx].text[:start_char_idx] + new_text
                    )
                    for m in range(start_run_idx + 1, end_run_idx + 1):
                        if m == end_run_idx:
                            para.runs[m].text = para.runs[m].text[end_char_idx:]
                        else:
                            para.runs[m].text = ""

                    return True

    return False


def _apply_text_update(slide, update: dict) -> bool:
    """Apply a single text update to a slide. Returns True if applied."""
    shape_name = update.get("shape")
    old_text = update.get("old_text")
    new_text = update.get("new_text")

    if not all([shape_name, old_text is not None, new_text is not None]):
        return False

    for shape in slide.shapes:
        if shape.name != shape_name:
            continue
        if not shape.has_text_frame:
            continue
        if replace_text_preserve_format(shape.text_frame, old_text, new_text):
            return True

    return False


def _apply_table_update(slide, update: dict) -> bool:
    """Apply a table cell update. Returns True if applied."""
    shape_name = update.get("shape")
    row = update.get("row")
    col = update.get("col")
    new_text = update.get("new_text")

    if not all([shape_name, row is not None, col is not None, new_text is not None]):
        return False

    for shape in slide.shapes:
        if shape.name != shape_name:
            continue
        if not shape.has_table:
            continue
        table = shape.table
        if row >= len(table.rows) or col >= len(table.columns):
            continue
        cell = table.cell(row, col)
        if cell.text_frame.paragraphs:
            replace_text_preserve_format(cell.text_frame, cell.text, new_text)
        return True

    return False


def apply_updates(pptx_path: str, updates: list[dict], output_path: str) -> dict:
    """Apply a list of slide updates to a template PPTX.

    Returns a summary dict with applied/skipped counts.

    Raises:
        FileNotFoundError: If template doesn't exist.
        ValueError: If updates is empty or malformed.
    """
    path = Path(pptx_path)
    if not path.exists():
        raise FileNotFoundError(f"Template not found: {pptx_path}")

    if not updates:
        raise ValueError("No updates provided")

    prs = Presentation(str(path))
    applied = 0
    skipped = 0
    errors = []

    for update in updates:
        slide_idx = update.get("slide_index")
        if slide_idx is None or slide_idx >= len(prs.slides):
            skipped += 1
            errors.append(f"Invalid slide_index: {slide_idx}")
            continue

        slide = prs.slides[slide_idx]
        update_type = update.get("type", "text")

        try:
            if update_type == "text":
                if _apply_text_update(slide, update):
                    applied += 1
                else:
                    skipped += 1
                    errors.append(
                        f"Slide {slide_idx}: shape '{update.get('shape')}' not found or no match"
                    )
            elif update_type == "table":
                if _apply_table_update(slide, update):
                    applied += 1
                else:
                    skipped += 1
                    errors.append(f"Slide {slide_idx}: table update failed")
            else:
                skipped += 1
                errors.append(f"Unknown update type: {update_type}")
        except Exception as e:
            skipped += 1
            errors.append(f"Slide {slide_idx}: {e}")

    prs.save(output_path)

    return {
        "applied": applied,
        "skipped": skipped,
        "errors": errors,
        "output": output_path,
    }


def build_pptx(template_path: str, updates_json_path: str, output_path: str) -> dict:
    """Entry point: load updates JSON and apply to template.

    Raises:
        FileNotFoundError: If template or updates JSON not found.
        ValueError: If updates JSON is malformed.
    """
    updates_path = Path(updates_json_path)
    if not updates_path.exists():
        raise FileNotFoundError(f"Updates JSON not found: {updates_json_path}")

    try:
        updates = json.loads(updates_path.read_text())
    except json.JSONDecodeError as e:
        raise ValueError(f"Malformed updates JSON: {e}") from e

    if not isinstance(updates, list):
        raise ValueError("Updates JSON must be a list of update objects")

    return apply_updates(template_path, updates, output_path)


def main():
    parser = argparse.ArgumentParser(description="Apply slide updates to a PPTX template")
    parser.add_argument("template", help="Path to template PPTX")
    parser.add_argument("updates", help="Path to updates JSON file")
    parser.add_argument("--output", "-o", required=True, help="Output PPTX path")
    args = parser.parse_args()

    try:
        result = build_pptx(args.template, args.updates, args.output)
        print(json.dumps(result, indent=2))
    except (FileNotFoundError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
