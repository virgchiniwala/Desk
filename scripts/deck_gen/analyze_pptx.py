#!/usr/bin/env python3
"""
Analyze PowerPoint deck structure.

Usage:
    python analyze_pptx.py <pptx_path> <output_json_path>

Output JSON structure:
{
    "slide_count": int,
    "slides": [
        {
            "index": int,
            "title": str,
            "tables": [[[cell, cell], [cell, cell]], ...],
            "text_boxes": [{"text": str, "shape_id": int}, ...],
            "has_chart": bool
        },
        ...
    ]
}
"""

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
import json
import sys
import os

def analyze_deck(pptx_path):
    """
    Extract structure from PowerPoint deck.
    
    Returns metadata about:
    - Slide titles
    - Tables on each slide (with data)
    - Text boxes containing numbers (candidates for updates)
    - Charts presence
    """
    prs = Presentation(pptx_path)
    
    structure = {
        'slide_count': len(prs.slides),
        'slides': [],
        'metadata': {
            'filename': os.path.basename(pptx_path),
            'has_master': prs.slide_master is not None
        }
    }
    
    for idx, slide in enumerate(prs.slides):
        slide_info = {
            'index': idx,
            'title': get_slide_title(slide),
            'tables': extract_tables(slide),
            'text_boxes': extract_text_boxes(slide),
            'has_chart': has_chart(slide),
            'shape_count': len(slide.shapes)
        }
        structure['slides'].append(slide_info)
    
    return structure

def get_slide_title(slide):
    """Extract title from slide."""
    if slide.shapes.title:
        return slide.shapes.title.text
    return "(No title)"

def extract_tables(slide):
    """
    Find all tables on slide and extract their data.
    
    Returns list of tables, each table is a 2D list of cell values.
    """
    tables = []
    
    for shape in slide.shapes:
        if shape.shape_type == MSO_SHAPE_TYPE.TABLE:
            table_data = []
            table = shape.table
            
            for row in table.rows:
                row_data = [cell.text.strip() for cell in row.cells]
                table_data.append(row_data)
            
            tables.append({
                'shape_id': shape.shape_id,
                'rows': len(table.rows),
                'cols': len(table.columns),
                'data': table_data
            })
    
    return tables

def extract_text_boxes(slide):
    """
    Find text boxes that might contain metrics.
    
    Focuses on text containing numbers (likely metrics to update).
    """
    text_boxes = []
    
    for shape in slide.shapes:
        # Skip tables and charts
        if shape.shape_type in [MSO_SHAPE_TYPE.TABLE, MSO_SHAPE_TYPE.CHART]:
            continue
        
        if hasattr(shape, "text") and shape.text:
            text = shape.text.strip()
            
            # Only include if contains numbers (likely a metric)
            if any(char.isdigit() for char in text):
                text_boxes.append({
                    'shape_id': shape.shape_id,
                    'text': text,
                    'has_number': True
                })
    
    return text_boxes

def has_chart(slide):
    """Check if slide contains charts."""
    for shape in slide.shapes:
        if shape.shape_type == MSO_SHAPE_TYPE.CHART:
            return True
    return False

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python analyze_pptx.py <pptx_path> <output_json_path>")
        sys.exit(1)
    
    pptx_path = sys.argv[1]
    output_path = sys.argv[2]
    
    if not os.path.exists(pptx_path):
        print(f"❌ Error: File not found: {pptx_path}")
        sys.exit(1)
    
    print(f"📊 Analyzing PowerPoint: {pptx_path}")
    
    try:
        structure = analyze_deck(pptx_path)
        
        # Save structure to JSON
        with open(output_path, 'w') as f:
            json.dump(structure, f, indent=2)
        
        print(f"✅ Analyzed {structure['slide_count']} slides")
        
        # Summary
        total_tables = sum(len(s['tables']) for s in structure['slides'])
        total_text_boxes = sum(len(s['text_boxes']) for s in structure['slides'])
        slides_with_charts = sum(1 for s in structure['slides'] if s['has_chart'])
        
        print(f"   - {total_tables} tables found")
        print(f"   - {total_text_boxes} text boxes with numbers")
        print(f"   - {slides_with_charts} slides with charts")
        print(f"📁 Saved structure to: {output_path}")
        
    except Exception as e:
        print(f"❌ Error analyzing deck: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
