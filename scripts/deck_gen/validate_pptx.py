#!/usr/bin/env python3
"""
Validate that generated PowerPoint is valid and openable.

Usage:
    python validate_pptx.py <pptx_path>
"""

from pptx import Presentation
import sys
import os

def validate_pptx(pptx_path):
    """
    Check that generated .pptx is valid:
    - Can be opened
    - Has expected slide count
    - No corrupt shapes
    - Contains content
    """
    if not os.path.exists(pptx_path):
        return False, f"File not found: {pptx_path}"
    
    try:
        prs = Presentation(pptx_path)
        
        checks = {
            'can_open': True,
            'slide_count': len(prs.slides),
            'has_content': any(len(slide.shapes) > 0 for slide in prs.slides),
            'file_size': os.path.getsize(pptx_path)
        }
        
        # Basic validation
        if checks['slide_count'] == 0:
            return False, "Deck has no slides"
        
        if not checks['has_content']:
            return False, "Slides have no content"
        
        if checks['file_size'] < 1000:  # Less than 1KB is suspicious
            return False, f"File size too small ({checks['file_size']} bytes)"
        
        # Try to access each slide (catches some corruption)
        for idx, slide in enumerate(prs.slides):
            _ = len(slide.shapes)  # Force evaluation
        
        return True, f"✅ Valid PowerPoint with {checks['slide_count']} slides ({checks['file_size']:,} bytes)"
        
    except Exception as e:
        return False, f"Invalid PowerPoint: {e}"

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python validate_pptx.py <pptx_path>")
        sys.exit(1)
    
    pptx_path = sys.argv[1]
    
    print(f"🔍 Validating: {pptx_path}")
    
    valid, message = validate_pptx(pptx_path)
    
    print(message)
    
    sys.exit(0 if valid else 1)
