#!/usr/bin/env python3
"""
Use LLM to generate slide content updates.

Usage:
    python generate_slide_updates.py <metrics_json> <structure_json> <output_json> [--sprint-num NUM] [--date-range RANGE]

Requires ANTHROPIC_API_KEY environment variable.
"""

import json
import sys
import os
from anthropic import Anthropic

def generate_updates(metrics, deck_structure, sprint_number=None, date_range=None):
    """
    Call LLM to generate slide content updates.
    
    The LLM receives:
    - Current metrics from Sentry CSV
    - Previous deck structure (slides, tables, text)
    - Sprint context (number, date range)
    
    Returns structured updates for each slide.
    """
    
    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")
    
    client = Anthropic(api_key=api_key)
    
    # Build context
    context = {
        'sprint_number': sprint_number or '[TO BE FILLED]',
        'date_range': date_range or '[TO BE FILLED]',
        'metrics': metrics,
        'deck_structure': deck_structure
    }
    
    prompt = f"""You are updating a sprint deck with new Sentry error metrics.

## New Sprint Information
- Sprint Number: {context['sprint_number']}
- Date Range: {context['date_range']}

## Current Metrics (from Sentry CSV)
```json
{json.dumps(metrics, indent=2)}
```

## Previous Deck Structure
The deck has {deck_structure['slide_count']} slides:
```json
{json.dumps(deck_structure['slides'], indent=2)}
```

## Task
Generate updates for each slide. For each slide that needs updating:

1. Identify what needs to change (titles, numbers, tables)
2. Provide exact replacement text
3. Calculate trends/changes where relevant

## Output Format
Respond with ONLY valid JSON (no markdown, no explanation):

{{
  "slides": [
    {{
      "slide_index": 0,
      "updates": [
        {{
          "type": "title",
          "old_text": "Sprint 11 Review",
          "new_text": "Sprint {context['sprint_number']} Review"
        }},
        {{
          "type": "table",
          "table_index": 0,
          "row_updates": [
            {{
              "row_index": 1,
              "col_index": 1,
              "old_text": "1234",
              "new_text": "1456"
            }}
          ]
        }},
        {{
          "type": "text_box",
          "shape_id": 123,
          "old_text": "Total: 1,234 errors",
          "new_text": "Total: 1,456 errors (+18%)"
        }}
      ]
    }}
  ]
}}

Rules:
- Update ALL occurrences of old sprint number/dates
- Use metrics from the Sentry data for numbers
- Calculate percentage changes where previous values exist
- Keep formatting consistent (commas in numbers, etc.)
- Only include slides that need updates
"""
    
    print("🤖 Calling LLM to generate slide updates...")
    
    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=4096,
        temperature=0,  # Deterministic for data updates
        messages=[{"role": "user", "content": prompt}]
    )
    
    # Extract JSON from response
    response_text = response.content[0].text.strip()
    
    # Remove markdown code blocks if present
    if response_text.startswith('```'):
        lines = response_text.split('\n')
        response_text = '\n'.join(lines[1:-1] if lines[-1].strip() == '```' else lines[1:])
    
    try:
        updates = json.loads(response_text)
        return updates
    except json.JSONDecodeError as e:
        print(f"❌ LLM response was not valid JSON")
        print(f"Response: {response_text[:500]}...")
        raise e

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: python generate_slide_updates.py <metrics_json> <structure_json> <output_json> [--sprint-num NUM] [--date-range RANGE]")
        sys.exit(1)
    
    metrics_path = sys.argv[1]
    structure_path = sys.argv[2]
    output_path = sys.argv[3]
    
    # Parse optional arguments
    sprint_num = None
    date_range = None
    
    i = 4
    while i < len(sys.argv):
        if sys.argv[i] == '--sprint-num' and i + 1 < len(sys.argv):
            sprint_num = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == '--date-range' and i + 1 < len(sys.argv):
            date_range = sys.argv[i + 1]
            i += 2
        else:
            i += 1
    
    print(f"📊 Loading metrics from: {metrics_path}")
    print(f"📊 Loading deck structure from: {structure_path}")
    
    with open(metrics_path) as f:
        metrics = json.load(f)
    
    with open(structure_path) as f:
        deck_structure = json.load(f)
    
    updates = generate_updates(metrics, deck_structure, sprint_num, date_range)
    
    # Save updates
    with open(output_path, 'w') as f:
        json.dump(updates, f, indent=2)
    
    print(f"✅ Generated updates for {len(updates['slides'])} slides")
    print(f"📁 Saved updates to: {output_path}")
