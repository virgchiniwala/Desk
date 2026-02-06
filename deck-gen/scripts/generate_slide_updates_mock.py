#!/usr/bin/env python3
"""Deterministic slide update generator (no API calls).

Usage:
    python generate_slide_updates_mock.py <template_analysis> <metrics_json> --output <updates_json>
"""

import argparse
import json
from pathlib import Path


def _pick_metric_strings(metrics: dict) -> list[str]:
    total = metrics.get("total_errors")
    unresolved = metrics.get("unresolved_count")
    resolved = metrics.get("resolved_count")
    error_types = metrics.get("error_types")

    values = []
    if total is not None:
        values.append(f"Total errors: {total:,}")
    if unresolved is not None:
        values.append(f"Unresolved issues: {unresolved:,}")
    if resolved is not None:
        values.append(f"Resolved issues: {resolved:,}")
    if error_types is not None:
        values.append(f"Error types: {error_types:,}")
    return values or ["Sentry metrics updated"]


def deterministic_updates(template_analysis: dict, metrics: dict) -> list[dict]:
    """Generate best-effort updates using existing shape contents.

    Strategy:
    - Update first text-bearing shapes with metric summaries.
    - Update first numeric-looking table cells with metric values.
    """
    updates = []
    metric_strings = _pick_metric_strings(metrics)
    metric_numbers = [
        str(metrics.get("total_errors", "")),
        str(metrics.get("unresolved_count", "")),
        str(metrics.get("resolved_count", "")),
        str(metrics.get("error_types", "")),
    ]
    metric_numbers = [n for n in metric_numbers if n]

    text_index = 0
    number_index = 0

    for slide in template_analysis.get("slides", []):
        slide_index = slide.get("index")
        for shape in slide.get("shapes", []):
            if shape.get("has_text") and text_index < len(metric_strings):
                old_text = shape.get("text", "").strip()
                if not old_text:
                    continue
                updates.append(
                    {
                        "slide_index": slide_index,
                        "type": "text",
                        "shape": shape.get("name"),
                        "old_text": old_text,
                        "new_text": metric_strings[text_index],
                    }
                )
                text_index += 1
                if text_index >= len(metric_strings):
                    break

            if shape.get("has_table") and number_index < len(metric_numbers):
                for cell in shape.get("cells", []):
                    old_text = str(cell.get("text", "")).strip()
                    if not old_text:
                        continue
                    updates.append(
                        {
                            "slide_index": slide_index,
                            "type": "table",
                            "shape": shape.get("name"),
                            "row": cell.get("row"),
                            "col": cell.get("col"),
                            "old_text": old_text,
                            "new_text": metric_numbers[number_index],
                        }
                    )
                    number_index += 1
                    if number_index >= len(metric_numbers):
                        break

            if text_index >= len(metric_strings) and number_index >= len(metric_numbers):
                break
        if text_index >= len(metric_strings) and number_index >= len(metric_numbers):
            break

    return updates


def main():
    parser = argparse.ArgumentParser(description="Mock slide update generator (no API calls)")
    parser.add_argument("template_analysis", help="Path to template analysis JSON")
    parser.add_argument("metrics", help="Path to metrics JSON")
    parser.add_argument("--output", "-o", help="Write updates JSON to file (default: stdout)")
    args = parser.parse_args()

    template_analysis = json.loads(Path(args.template_analysis).read_text())
    metrics = json.loads(Path(args.metrics).read_text())
    updates = deterministic_updates(template_analysis, metrics)
    output = json.dumps(updates, indent=2)

    if args.output:
        Path(args.output).write_text(output)
    else:
        print(output)


if __name__ == "__main__":
    main()
