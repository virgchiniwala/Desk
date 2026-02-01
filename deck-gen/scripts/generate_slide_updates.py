#!/usr/bin/env python3
"""Generate slide update instructions via Claude API.

Usage:
    python generate_slide_updates.py <template_analysis> <metrics_json> --output <updates_json>
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import anthropic


def _strip_json_fence(text: str) -> str:
    """Strip markdown JSON code fences from LLM response.

    Handles both:
        ```json
        [...]
        ```
    and:
        ```
        [...]
        ```
    """
    stripped = text.strip()
    if stripped.startswith("```"):
        # Remove opening fence line (possibly with language tag like "json")
        lines = stripped.split("\n", 1)
        stripped = lines[1] if len(lines) > 1 else ""
        # Remove closing fence
        if stripped.endswith("```"):
            stripped = stripped[:-3].strip()
    return stripped


def _build_prompt(template_analysis: dict, metrics: dict) -> str:
    """Build the prompt for slide update generation."""
    return (
        "You are generating slide update instructions for a PowerPoint sprint review deck.\n\n"
        f"Template analysis (shapes and current text):\n{json.dumps(template_analysis, indent=2)}\n\n"
        f"Current metrics to incorporate:\n{json.dumps(metrics, indent=2)}\n\n"
        "Generate a JSON array of update objects. Each object must have:\n"
        '- "slide_index": 0-based slide number\n'
        '- "type": "text" or "table"\n'
        '- "shape": exact shape name from the template analysis\n'
        '- "old_text": the current text to replace\n'
        '- "new_text": the replacement text\n'
        "For table updates, also include:\n"
        '- "row": 0-based row index\n'
        '- "col": 0-based column index\n\n'
        "Return ONLY the JSON array. No explanation, no markdown fences.\n"
    )


def generate_slide_updates(template_analysis_path: str, metrics_path: str) -> list[dict]:
    """Generate slide updates by calling Claude with template + metrics context.

    Raises:
        FileNotFoundError: If input files don't exist.
        ValueError: If API response is not valid JSON or not a list.
        anthropic.APIError: If API call fails after retries.
    """
    # Validate inputs
    for p in [template_analysis_path, metrics_path]:
        if not Path(p).exists():
            raise FileNotFoundError(f"File not found: {p}")

    template_analysis = json.loads(Path(template_analysis_path).read_text())
    metrics = json.loads(Path(metrics_path).read_text())

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError("ANTHROPIC_API_KEY is not set")

    client = anthropic.Anthropic(api_key=api_key)
    prompt = _build_prompt(template_analysis, metrics)

    print("Calling Claude API...", file=sys.stderr)
    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_response = message.content[0].text

    # Parse response
    json_text = _strip_json_fence(raw_response)
    try:
        updates = json.loads(json_text)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"API response is not valid JSON: {e}\nRaw: {raw_response[:500]}"
        ) from e

    if not isinstance(updates, list):
        raise ValueError(f"Expected a JSON array of updates, got: {type(updates).__name__}")

    return updates


def main():
    parser = argparse.ArgumentParser(description="Generate slide updates via Claude API")
    parser.add_argument("template_analysis", help="Path to template analysis JSON")
    parser.add_argument("metrics", help="Path to metrics JSON")
    parser.add_argument("--output", "-o", help="Write updates JSON to file (default: stdout)")
    args = parser.parse_args()

    try:
        updates = generate_slide_updates(args.template_analysis, args.metrics)
        output = json.dumps(updates, indent=2)

        if args.output:
            Path(args.output).write_text(output)
            print(f"Generated {len(updates)} updates → {args.output}", file=sys.stderr)
        else:
            print(output)
    except (FileNotFoundError, ValueError, EnvironmentError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
