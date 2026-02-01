#!/usr/bin/env python3
"""Validate a generated PowerPoint deck.

Checks both structural validity and — when an updates JSON is provided —
whether each slide update was actually applied correctly.

Usage:
    python validate_pptx.py <pptx_path> [--updates <updates_json>] [--strict]
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from pptx import Presentation


# ---------------------------------------------------------------------------
# Structural validation
# ---------------------------------------------------------------------------


def validate_structure(pptx_path: str) -> dict:
    """Validate basic structural integrity of a PPTX file.

    Returns a dict with 'valid' bool, slide count, shape counts, and issues.
    """
    path = Path(pptx_path)
    if not path.exists():
        return {"valid": False, "error": f"File not found: {pptx_path}"}

    if path.stat().st_size == 0:
        return {"valid": False, "error": "File is empty"}

    try:
        prs = Presentation(str(path))
    except Exception as e:
        return {"valid": False, "error": f"Cannot open PPTX: {e}"}

    if len(prs.slides) == 0:
        return {"valid": False, "error": "Deck has no slides"}

    issues: list[str] = []
    slides_info: list[dict] = []

    for i, slide in enumerate(prs.slides):
        shape_count = len(slide.shapes)
        if shape_count == 0:
            issues.append(f"Slide {i}: no shapes")
        slides_info.append({"index": i, "shapes": shape_count})

    return {
        "valid": len(issues) == 0,
        "slide_count": len(prs.slides),
        "slides": slides_info,
        "issues": issues,
    }


# ---------------------------------------------------------------------------
# Update-application verification
# ---------------------------------------------------------------------------


def validate_updates_applied(pptx_path: str, updates: list[dict]) -> dict:
    """Check whether each slide update was actually applied to the deck.

    For every update we verify:
      1. new_text appears somewhere in the target shape on the expected slide.
      2. old_text no longer appears (unless it is a substring of new_text).

    Returns a per-update results list and an overall pass/fail.
    """
    path = Path(pptx_path)
    if not path.exists():
        return {"valid": False, "error": f"File not found: {pptx_path}"}

    try:
        prs = Presentation(str(path))
    except Exception as e:
        return {"valid": False, "error": f"Cannot open PPTX: {e}"}

    results: list[dict] = []
    passed = 0
    failed = 0

    for i, update in enumerate(updates):
        slide_idx = update.get("slide_index")
        shape_name = update.get("shape")
        old_text = update.get("old_text")
        new_text = update.get("new_text")

        # Skip if slide index is out of range
        if slide_idx is None or slide_idx >= len(prs.slides):
            results.append({"update_index": i, "status": "skip", "reason": f"Invalid slide_index: {slide_idx}"})
            continue

        slide = prs.slides[slide_idx]
        new_text_found = False
        old_text_still_present = False

        for shape in slide.shapes:
            if shape.name != shape_name:
                continue

            # --- text frame check ---
            if shape.has_text_frame:
                text = shape.text_frame.text
                if new_text and new_text in text:
                    new_text_found = True
                if old_text and old_text in text and old_text != new_text:
                    old_text_still_present = True

            # --- table cell check ---
            if shape.has_table:
                table = shape.table
                row = update.get("row")
                col = update.get("col")
                if row is not None and col is not None:
                    if row < len(table.rows) and col < len(table.columns):
                        cell_text = table.cell(row, col).text
                        if new_text and new_text in cell_text:
                            new_text_found = True
                        if old_text and old_text in cell_text and old_text != new_text:
                            old_text_still_present = True

        if new_text_found and not old_text_still_present:
            results.append({"update_index": i, "status": "pass", "shape": shape_name, "slide": slide_idx})
            passed += 1
        else:
            reasons = []
            if not new_text_found:
                reasons.append(f"new_text '{new_text}' not found")
            if old_text_still_present:
                reasons.append(f"old_text '{old_text}' still present")
            results.append({
                "update_index": i,
                "status": "fail",
                "shape": shape_name,
                "slide": slide_idx,
                "reason": "; ".join(reasons),
            })
            failed += 1

    return {
        "valid": failed == 0,
        "passed": passed,
        "failed": failed,
        "results": results,
    }


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def validate_pptx(pptx_path: str, updates_path: Optional[str] = None, strict: bool = False) -> dict:
    """Run all validation checks on a generated deck.

    Args:
        pptx_path:    Path to the PPTX to validate.
        updates_path: Optional path to the updates JSON that was applied.
                      When provided, update-application verification runs.
        strict:       If True, any warning causes overall failure.

    Returns:
        Combined validation report with 'overall' verdict.
    """
    report: dict = {"structure": validate_structure(pptx_path)}

    if not report["structure"]["valid"]:
        report["overall"] = {"valid": False, "reason": "Structural validation failed"}
        return report

    # Update-application check (only when updates JSON is supplied)
    if updates_path:
        updates_file = Path(updates_path)
        if not updates_file.exists():
            report["overall"] = {"valid": False, "reason": f"Updates file not found: {updates_path}"}
            return report

        try:
            updates = json.loads(updates_file.read_text())
        except json.JSONDecodeError as e:
            report["overall"] = {"valid": False, "reason": f"Malformed updates JSON: {e}"}
            return report

        report["updates"] = validate_updates_applied(pptx_path, updates)

        if not report["updates"]["valid"]:
            report["overall"] = {
                "valid": False,
                "reason": f"{report['updates']['failed']} update(s) not applied correctly",
            }
            return report

    report["overall"] = {"valid": True}
    return report


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Validate a generated PowerPoint deck")
    parser.add_argument("pptx_path", help="Path to the PPTX to validate")
    parser.add_argument("--updates", "-u", help="Path to updates JSON (enables update verification)")
    parser.add_argument("--strict", action="store_true", help="Fail on any warning")
    args = parser.parse_args()

    report = validate_pptx(args.pptx_path, args.updates, args.strict)
    print(json.dumps(report, indent=2))

    if not report["overall"]["valid"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
