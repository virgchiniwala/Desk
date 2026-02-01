#!/usr/bin/env python3
"""Validate a generated PowerPoint deck.

Checks basic structural validity of the PPTX file.

Usage:
    python validate_pptx.py <pptx_path>
"""

import argparse
import json
import sys
from pathlib import Path

from pptx import Presentation


def validate_structure(pptx_path: str) -> dict:
    """Validate basic structural integrity of a PPTX file.

    Returns a dict with 'valid' bool, slide count, shape counts, and any issues.
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

    issues = []
    slides_info = []
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


def validate_pptx(pptx_path: str) -> dict:
    """Run validation checks on a generated deck."""
    report = {"structure": validate_structure(pptx_path)}

    if not report["structure"]["valid"]:
        report["overall"] = {"valid": False, "reason": "Structural validation failed"}
    else:
        report["overall"] = {"valid": True}

    return report


def main():
    parser = argparse.ArgumentParser(description="Validate a generated PowerPoint deck")
    parser.add_argument("pptx_path", help="Path to the PPTX to validate")
    args = parser.parse_args()

    report = validate_pptx(args.pptx_path)
    print(json.dumps(report, indent=2))

    if not report["overall"]["valid"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
