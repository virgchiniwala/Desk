#!/usr/bin/env python3
"""
Create mock data for testing deck generation pipeline.

Generates:
- Mock Sentry CSV with realistic error data
- Mock previous deck structure
- Sample raw data dump (as Vir would provide)
"""

import json
import csv
import sys
from datetime import datetime, timedelta

def create_mock_sentry_csv(output_path):
    """Create mock Sentry CSV export."""
    errors = [
        {
            'Error Type': 'API Timeout on /users endpoint',
            'Count': 234,
            'Status': 'unresolved',
            'First Seen': '2026-01-18',
            'Last Seen': '2026-01-30'
        },
        {
            'Error Type': 'Database connection pool exhausted',
            'Count': 187,
            'Status': 'unresolved',
            'First Seen': '2026-01-15',
            'Last Seen': '2026-01-30'
        },
        {
            'Error Type': 'Null pointer exception in payment flow',
            'Count': 156,
            'Status': 'resolved',
            'First Seen': '2026-01-10',
            'Last Seen': '2026-01-25'
        },
        {
            'Error Type': 'Redis cache miss causing slowdown',
            'Count': 142,
            'Status': 'unresolved',
            'First Seen': '2026-01-20',
            'Last Seen': '2026-01-30'
        },
        {
            'Error Type': 'Authentication token expired prematurely',
            'Count': 98,
            'Status': 'unresolved',
            'First Seen': '2026-01-22',
            'Last Seen': '2026-01-30'
        },
        {
            'Error Type': 'File upload size limit exceeded',
            'Count': 67,
            'Status': 'resolved',
            'First Seen': '2026-01-08',
            'Last Seen': '2026-01-28'
        },
        {
            'Error Type': 'Email service rate limit hit',
            'Count': 54,
            'Status': 'unresolved',
            'First Seen': '2026-01-25',
            'Last Seen': '2026-01-30'
        },
        {
            'Error Type': 'Search indexing timeout',
            'Count': 43,
            'Status': 'unresolved',
            'First Seen': '2026-01-19',
            'Last Seen': '2026-01-29'
        }
    ]
    
    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Error Type', 'Count', 'Status', 'First Seen', 'Last Seen'])
        writer.writeheader()
        writer.writerows(errors)
    
    print(f"✅ Created mock Sentry CSV: {output_path}")
    print(f"   {len(errors)} error types, {sum(e['Count'] for e in errors)} total errors")

def create_mock_raw_data(output_path):
    """Create mock raw data dump as Vir would provide."""
    raw_data = """# Sprint 12 Raw Data - Jan 18-31, 2026

## Sentry Metrics
- Total errors: 981 (down 12% from Sprint 11)
- New errors this sprint: 3
- Resolved errors: 2
- Critical issues: 5 unresolved

Top issues:
1. API timeout /users - 234 occurrences (backend bottleneck)
2. DB connection pool - 187 occurrences (scaling issue)
3. Redis cache miss - 142 occurrences (configuration problem)
4. Auth token expiry - 98 occurrences (session management bug)
5. Email rate limit - 54 occurrences (SendGrid quota hit)

## Other Notes
- Backend team deployed fix for payment null pointer (resolved 156 errors)
- File upload limit increased (resolved 67 errors)
- Auth token bug root cause identified, fix in progress
- Email service upgrade scheduled for Sprint 13

## Context
- Sprint focused on stability improvements
- Major backend refactor completed
- 2 production incidents (both resolved within SLA)
- Team velocity: 23 story points (target: 25)
"""
    
    with open(output_path, 'w') as f:
        f.write(raw_data)
    
    print(f"✅ Created mock raw data: {output_path}")

def create_mock_deck_structure(output_path):
    """Create mock deck structure (what analyze_pptx.py would produce)."""
    structure = {
        'slide_count': 6,
        'metadata': {
            'filename': 'sprint_11_deck.pptx',
            'has_master': True
        },
        'slides': [
            {
                'index': 0,
                'title': 'Sprint 11 Review',
                'tables': [],
                'text_boxes': [
                    {'shape_id': 101, 'text': 'Jan 4 - Jan 17, 2026', 'has_number': True}
                ],
                'has_chart': False,
                'shape_count': 5
            },
            {
                'index': 1,
                'title': 'Executive Summary',
                'tables': [],
                'text_boxes': [
                    {'shape_id': 201, 'text': 'Total errors: 1,115', 'has_number': True},
                    {'shape_id': 202, 'text': 'Critical issues: 7', 'has_number': True}
                ],
                'has_chart': False,
                'shape_count': 8
            },
            {
                'index': 2,
                'title': 'Error Trends',
                'tables': [
                    {
                        'shape_id': 301,
                        'rows': 6,
                        'cols': 3,
                        'data': [
                            ['Error Type', 'This Sprint', 'Last Sprint'],
                            ['API Errors', '421', '389'],
                            ['Database Errors', '387', '412'],
                            ['Payment Errors', '289', '245'],
                            ['Cache Errors', '234', '198'],
                            ['Total', '1,115', '1,267']
                        ]
                    }
                ],
                'text_boxes': [],
                'has_chart': False,
                'shape_count': 4
            },
            {
                'index': 3,
                'title': 'Top Issues',
                'tables': [],
                'text_boxes': [
                    {'shape_id': 401, 'text': '1. API Gateway timeout (312 errors)', 'has_number': True},
                    {'shape_id': 402, 'text': '2. DB pool exhaustion (256 errors)', 'has_number': True},
                    {'shape_id': 403, 'text': '3. Payment processor timeout (198 errors)', 'has_number': True}
                ],
                'has_chart': False,
                'shape_count': 10
            },
            {
                'index': 4,
                'title': 'Resolution Status',
                'tables': [],
                'text_boxes': [
                    {'shape_id': 501, 'text': 'Resolved: 5 issues', 'has_number': True},
                    {'shape_id': 502, 'text': 'In Progress: 3 issues', 'has_number': True},
                    {'shape_id': 503, 'text': 'Unresolved: 7 issues', 'has_number': True}
                ],
                'has_chart': False,
                'shape_count': 7
            },
            {
                'index': 5,
                'title': 'Next Steps',
                'tables': [],
                'text_boxes': [],
                'has_chart': False,
                'shape_count': 4
            }
        ]
    }
    
    with open(output_path, 'w') as f:
        json.dump(structure, f, indent=2)
    
    print(f"✅ Created mock deck structure: {output_path}")
    print(f"   {structure['slide_count']} slides")

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python create_mock_data.py <output_dir>")
        sys.exit(1)
    
    output_dir = sys.argv[1]
    
    import os
    os.makedirs(output_dir, exist_ok=True)
    
    # Create all mock files
    create_mock_sentry_csv(os.path.join(output_dir, 'sentry_export.csv'))
    create_mock_raw_data(os.path.join(output_dir, 'raw_data.txt'))
    create_mock_deck_structure(os.path.join(output_dir, 'deck_structure.json'))
    
    print(f"\n✅ All mock data created in: {output_dir}")
    print("\nNext steps:")
    print("1. Run template_selector.py to choose sprint_review or exec_review")
    print("2. Run parse_sentry_csv.py on sentry_export.csv")
    print("3. Run generate_slide_updates.py with template config")
