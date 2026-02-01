#!/usr/bin/env python3
"""Mock version of generate_slide_updates — returns canned updates without hitting the API.

Usage:
    python generate_slide_updates_mock.py <template_analysis> <metrics_json> --output <updates_json>
"""

import argparse
import json
from pathlib import Path


def mock_updates() -> list[dict]:
    """Return canned slide updates for testing the pipeline."""
    return [
        {
            "slide_index": 0,
            "type": "text",
            "shape": "Title 1",
            "old_text": "Sprint Review — [SPRINT]",
            "new_text": "Sprint Review — Sprint 42",
        },
        {
            "slide_index": 1,
            "type": "text",
            "shape": "Subtitle 2",
            "old_text": "[DATE]",
            "new_text": "February 2, 2026",
        },
        {
            "slide_index": 2,
            "type": "table",
            "shape": "Table 3",
            "row": 1,
            "col": 1,
            "old_text": "[TOTAL]",
            "new_text": "847",
        },
        {
            "slide_index": 2,
            "type": "table",
            "shape": "Table 3",
            "row": 2,
            "col": 1,
            "old_text": "[RESOLVED]",
            "new_text": "612",
        },
        {
            "slide_index": 2,
            "type": "table",
            "shape": "Table 3",
            "row": 3,
            "col": 1,
            "old_text": "[UNRESOLVED]",
            "new_text": "235",
        },
    ]


def main():
    parser = argparse.ArgumentParser(description="Mock slide update generator (no API calls)")
    parser.add_argument("template_analysis", help="Path to template analysis JSON (ignored)")
    parser.add_argument("metrics", help="Path to metrics JSON (ignored)")
    parser.add_argument("--output", "-o", help="Write updates JSON to file (default: stdout)")
    args = parser.parse_args()

    updates = mock_updates()
    output = json.dumps(updates, indent=2)

    if args.output:
        Path(args.output).write_text(output)
    else:
        print(output)


if __name__ == "__main__":
    main()
