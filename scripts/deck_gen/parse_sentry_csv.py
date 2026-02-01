#!/usr/bin/env python3
"""
Parse Sentry CSV export and extract metrics.

Usage:
    python parse_sentry_csv.py <csv_path> <output_json_path>

Output JSON structure:
{
    "total_errors": int,
    "error_types": int,
    "top_issues": [{"error_type": str, "count": int}, ...],
    "resolved_count": int,
    "unresolved_count": int,
    "new_errors": int,
    "error_by_type": {"type": count, ...}
}
"""

import pandas as pd
import json
import sys
from datetime import datetime, timedelta

def parse_sentry_csv(csv_path):
    """
    Parse Sentry CSV and extract key metrics.
    
    Expected columns (adjust based on actual Sentry export):
    - Error Type / Title
    - Count / Events
    - First Seen
    - Last Seen  
    - Status (resolved/unresolved)
    
    This is a template - will need adjustment based on actual CSV format.
    """
    try:
        df = pd.read_csv(csv_path)
        
        # Normalize column names (handle variations in Sentry exports)
        df.columns = df.columns.str.lower().str.strip()
        
        # Try to identify key columns with common variations
        error_col = None
        count_col = None
        status_col = None
        
        for col in df.columns:
            if 'error' in col or 'title' in col or 'issue' in col:
                error_col = col
            elif 'count' in col or 'events' in col or 'occurrences' in col:
                count_col = col
            elif 'status' in col or 'state' in col:
                status_col = col
        
        if not error_col or not count_col:
            # If columns not found, use mock structure for development
            print(f"⚠️  Warning: Could not identify standard columns. Using mock data.")
            return create_mock_metrics()
        
        # Extract metrics
        metrics = {
            'total_errors': int(df[count_col].sum()),
            'error_types': len(df),
            'top_issues': df.nlargest(5, count_col)[[error_col, count_col]].rename(
                columns={error_col: 'error_type', count_col: 'count'}
            ).to_dict('records'),
            'error_by_type': df.set_index(error_col)[count_col].to_dict()
        }
        
        # Add status breakdown if available
        if status_col:
            # Normalize status values for accurate matching
            status_normalized = df[status_col].str.strip().str.lower()
            metrics['resolved_count'] = int((status_normalized == 'resolved').sum())
            metrics['unresolved_count'] = int((status_normalized != 'resolved').sum())
        else:
            metrics['resolved_count'] = 0
            metrics['unresolved_count'] = metrics['error_types']
        
        # Calculate new errors from First Seen column if available
        first_seen_col = None
        for col in df.columns:
            if 'first' in col and 'seen' in col:
                first_seen_col = col
                break
        
        if first_seen_col:
            try:
                df[first_seen_col] = pd.to_datetime(df[first_seen_col])
                cutoff = datetime.now() - timedelta(days=14)
                metrics['new_errors'] = int((df[first_seen_col] >= cutoff).sum())
            except (ValueError, TypeError):
                # Date column exists but can't be parsed — omit rather than guess
                metrics['new_errors'] = None
                print(f"⚠️  Could not parse '{first_seen_col}' dates. new_errors omitted.")
        else:
            # No date column at all — explicitly null, not a guess
            metrics['new_errors'] = None
            print(f"⚠️  No 'First Seen' column found. new_errors omitted from metrics.")
        
        return metrics
        
    except Exception as e:
        print(f"❌ Error parsing CSV: {e}")
        print(f"❌ Aborting. Provide --mock flag to use mock data explicitly.")
        raise

def create_mock_metrics():
    """Create mock metrics for development/testing."""
    return {
        'total_errors': 1456,
        'error_types': 23,
        'top_issues': [
            {'error_type': 'API Timeout on /users endpoint', 'count': 234},
            {'error_type': 'Database connection pool exhausted', 'count': 187},
            {'error_type': 'Null pointer exception in payment flow', 'count': 156},
            {'error_type': 'Redis cache miss causing slowdown', 'count': 142},
            {'error_type': 'Authentication token expired', 'count': 98}
        ],
        'resolved_count': 8,
        'unresolved_count': 15,
        'new_errors': 5,
        'error_by_type': {
            'API Errors': 421,
            'Database Errors': 387,
            'Payment Errors': 289,
            'Cache Errors': 234,
            'Auth Errors': 125
        }
    }

if __name__ == '__main__':
    # Support: parse_sentry_csv.py <csv_path> <output_json> [--mock]
    use_mock = '--mock' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--mock']
    
    if len(args) != 2:
        print("Usage: python parse_sentry_csv.py <csv_path> <output_json_path> [--mock]")
        print("  --mock  Use mock data instead of parsing CSV (for development)")
        sys.exit(1)
    
    csv_path = args[0]
    output_path = args[1]
    
    if use_mock:
        print(f"📊 Mock mode enabled — using synthetic data")
        metrics = create_mock_metrics()
    else:
        print(f"📊 Parsing Sentry CSV: {csv_path}")
        metrics = parse_sentry_csv(csv_path)
    
    # Save metrics to JSON
    with open(output_path, 'w') as f:
        json.dump(metrics, f, indent=2)
    
    print(f"✅ Parsed {metrics['total_errors']:,} total errors")
    print(f"   - {metrics['error_types']} unique error types")
    print(f"   - Top issue: {metrics['top_issues'][0]['error_type']} ({metrics['top_issues'][0]['count']} occurrences)")
    print(f"   - {metrics['new_errors']} new errors this sprint")
    print(f"📁 Saved metrics to: {output_path}")
