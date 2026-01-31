#!/usr/bin/env python3
"""
Generate mock slide updates (for testing without API key).
This simulates what the LLM would produce.
"""

import json
import sys
import os

def generate_mock_updates(metrics, deck_structure, sprint_number, date_range, template_config):
    """Generate realistic mock slide updates."""
    
    purpose = template_config.get('purpose', 'sprint_review') if template_config else 'sprint_review'
    
    # Determine update style based on purpose
    if purpose == 'sprint_review':
        # Tactical, detailed updates
        updates = {
            'slides': [
                {
                    'slide_index': 0,
                    'updates': [
                        {
                            'type': 'title',
                            'old_text': 'Sprint 11 Review',
                            'new_text': f'Sprint {sprint_number} Review'
                        },
                        {
                            'type': 'text_box',
                            'shape_id': 101,
                            'old_text': 'Jan 4 - Jan 17, 2026',
                            'new_text': date_range
                        }
                    ]
                },
                {
                    'slide_index': 1,
                    'updates': [
                        {
                            'type': 'text_box',
                            'shape_id': 201,
                            'old_text': 'Total errors: 1,115',
                            'new_text': f"Total errors: {metrics['total_errors']:,} (↓12% from last sprint)"
                        },
                        {
                            'type': 'text_box',
                            'shape_id': 202,
                            'old_text': 'Critical issues: 7',
                            'new_text': f"Critical issues: {metrics['unresolved_count']}"
                        }
                    ]
                },
                {
                    'slide_index': 2,
                    'updates': [
                        {
                            'type': 'table',
                            'table_index': 0,
                            'row_updates': [
                                {'row_index': 1, 'col_index': 1, 'old_text': '421', 'new_text': '234'},
                                {'row_index': 1, 'col_index': 2, 'old_text': '389', 'new_text': '421'},
                                {'row_index': 5, 'col_index': 1, 'old_text': '1,115', 'new_text': '981'},
                                {'row_index': 5, 'col_index': 2, 'old_text': '1,267', 'new_text': '1,115'}
                            ]
                        }
                    ]
                },
                {
                    'slide_index': 3,
                    'updates': [
                        {
                            'type': 'text_box',
                            'shape_id': 401,
                            'old_text': '1. API Gateway timeout (312 errors)',
                            'new_text': f"1. {metrics['top_issues'][0]['error_type']} ({metrics['top_issues'][0]['count']} errors)"
                        },
                        {
                            'type': 'text_box',
                            'shape_id': 402,
                            'old_text': '2. DB pool exhaustion (256 errors)',
                            'new_text': f"2. {metrics['top_issues'][1]['error_type']} ({metrics['top_issues'][1]['count']} errors)"
                        },
                        {
                            'type': 'text_box',
                            'shape_id': 403,
                            'old_text': '3. Payment processor timeout (198 errors)',
                            'new_text': f"3. {metrics['top_issues'][2]['error_type']} ({metrics['top_issues'][2]['count']} errors)"
                        }
                    ]
                },
                {
                    'slide_index': 4,
                    'updates': [
                        {
                            'type': 'text_box',
                            'shape_id': 501,
                            'old_text': 'Resolved: 5 issues',
                            'new_text': f"Resolved: {metrics['resolved_count']} issues"
                        },
                        {
                            'type': 'text_box',
                            'shape_id': 503,
                            'old_text': 'Unresolved: 7 issues',
                            'new_text': f"Unresolved: {metrics['unresolved_count']} issues"
                        }
                    ]
                }
            ]
        }
    else:  # exec_review
        # Strategic, high-level updates
        updates = {
            'slides': [
                {
                    'slide_index': 0,
                    'updates': [
                        {
                            'type': 'title',
                            'old_text': 'Sprint 11 Review',
                            'new_text': f'Executive Review - Sprint {sprint_number}'
                        }
                    ]
                },
                {
                    'slide_index': 1,
                    'updates': [
                        {
                            'type': 'text_box',
                            'shape_id': 201,
                            'old_text': 'Total errors: 1,115',
                            'new_text': f"System stability improving: {metrics['total_errors']:,} errors (12% reduction)"
                        },
                        {
                            'type': 'text_box',
                            'shape_id': 202,
                            'old_text': 'Critical issues: 7',
                            'new_text': f"Strategic risk: {metrics['unresolved_count']} critical issues require attention"
                        }
                    ]
                }
            ]
        }
    
    return updates

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: python generate_slide_updates_mock.py <metrics_json> <structure_json> <output_json> [--sprint-num NUM] [--date-range RANGE] [--template-config PATH]")
        sys.exit(1)
    
    metrics_path = sys.argv[1]
    structure_path = sys.argv[2]
    output_path = sys.argv[3]
    
    # Parse optional arguments
    sprint_num = "12"
    date_range = "Jan 18 - Jan 31, 2026"
    template_config_path = None
    
    i = 4
    while i < len(sys.argv):
        if sys.argv[i] == '--sprint-num' and i + 1 < len(sys.argv):
            sprint_num = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == '--date-range' and i + 1 < len(sys.argv):
            date_range = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == '--template-config' and i + 1 < len(sys.argv):
            template_config_path = sys.argv[i + 1]
            i += 2
        else:
            i += 1
    
    with open(metrics_path) as f:
        metrics = json.load(f)
    
    with open(structure_path) as f:
        deck_structure = json.load(f)
    
    template_config = None
    if template_config_path and os.path.exists(template_config_path):
        with open(template_config_path) as f:
            template_config = json.load(f)
        print(f"📋 Using template: {template_config.get('template_name', 'unknown')}")
    
    updates = generate_mock_updates(metrics, deck_structure, sprint_num, date_range, template_config)
    
    with open(output_path, 'w') as f:
        json.dump(updates, f, indent=2)
    
    print(f"✅ Generated mock updates for {len(updates['slides'])} slides")
    print(f"📁 Saved to: {output_path}")
