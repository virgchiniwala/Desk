#!/usr/bin/env python3
"""
Select and apply appropriate deck template based on purpose.

Usage:
    python template_selector.py <purpose> <templates_dir> <output_path>
    
Purpose types:
    - sprint_review: Tactical, metrics-focused, team-facing
    - exec_review: Strategic, trends-focused, leadership-facing
"""

import sys
import os
import json
from pathlib import Path

# Template configurations
TEMPLATES = {
    'sprint_review': {
        'name': 'Sprint Review Template',
        'focus': 'tactical',
        'audience': 'team',
        'sections': [
            'Sprint Summary',
            'Metrics & KPIs',
            'Completed Work',
            'Blockers & Issues',
            'Next Sprint Plan'
        ],
        'tone': 'detailed and operational',
        'filename': 'sprint_review_template.pptx'
    },
    'exec_review': {
        'name': 'Executive Review Template',
        'focus': 'strategic',
        'audience': 'leadership',
        'sections': [
            'Executive Summary',
            'Key Trends',
            'Business Impact',
            'Strategic Risks',
            'Recommendations'
        ],
        'tone': 'high-level and strategic',
        'filename': 'exec_review_template.pptx'
    }
}

def get_template_config(purpose):
    """Get template configuration for given purpose."""
    if purpose not in TEMPLATES:
        available = ', '.join(TEMPLATES.keys())
        raise ValueError(f"Unknown purpose '{purpose}'. Available: {available}")
    
    return TEMPLATES[purpose]

def generate_llm_instructions(purpose, config):
    """Generate LLM instructions based on template purpose."""
    
    instructions = f"""You are transforming raw data into a {config['name']}.

## Audience & Purpose
- **Audience:** {config['audience']}
- **Focus:** {config['focus']}
- **Tone:** {config['tone']}

## Required Sections
{chr(10).join(f"- {section}" for section in config['sections'])}

## Transformation Guidelines

"""
    
    if purpose == 'sprint_review':
        instructions += """
### Sprint Review Focus:
1. **Metrics are central** - Show specific numbers, percentages, trends
2. **Be detailed** - Teams need operational context
3. **Highlight blockers** - Call out issues that need immediate attention
4. **Action items** - Clear next steps for each area
5. **Compare to last sprint** - Show progress/regression

### Data Handling:
- Include all error counts and types
- Show resolution rates
- List top 5-10 issues with details
- Calculate sprint-over-sprint changes
- Flag new vs recurring issues
"""
    
    elif purpose == 'exec_review':
        instructions += """
### Executive Review Focus:
1. **Start with impact** - Business consequences, not technical details
2. **Show trends** - Month-over-month, quarter-over-quarter
3. **Be concise** - Executives need the "so what", not the "what"
4. **Strategic framing** - How does this affect goals/OKRs?
5. **Actionable insights** - What decisions need to be made?

### Data Handling:
- Aggregate to high-level trends
- Focus on top 3 issues only
- Show business impact (uptime, revenue, user experience)
- Compare to goals/benchmarks
- Provide clear recommendations
"""
    
    instructions += """

## Output Format
Generate slide content that matches the template structure. Each section should be:
- Clear and scannable
- Data-driven where possible
- Appropriate to audience level
- Formatted for slides (not paragraphs)
"""
    
    return instructions

def save_instructions(purpose, output_path):
    """Save LLM instructions to file."""
    config = get_template_config(purpose)
    instructions = generate_llm_instructions(purpose, config)
    
    output = {
        'purpose': purpose,
        'template_name': config['name'],
        'template_file': config['filename'],
        'focus': config['focus'],
        'audience': config['audience'],
        'sections': config['sections'],
        'llm_instructions': instructions
    }
    
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    return output

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python template_selector.py <purpose> <templates_dir> <output_path>")
        print("\nAvailable purposes:")
        for purpose, config in TEMPLATES.items():
            print(f"  - {purpose}: {config['name']}")
        sys.exit(1)
    
    purpose = sys.argv[1]
    templates_dir = sys.argv[2]
    output_path = sys.argv[3]
    
    try:
        result = save_instructions(purpose, output_path)
        
        print(f"✅ Template configuration saved")
        print(f"   Purpose: {result['purpose']}")
        print(f"   Template: {result['template_name']}")
        print(f"   Focus: {result['focus']}")
        print(f"   Audience: {result['audience']}")
        print(f"📁 Saved to: {output_path}")
        
        # Check if template file exists
        template_path = os.path.join(templates_dir, result['template_file'])
        if os.path.exists(template_path):
            print(f"✅ Template file found: {template_path}")
        else:
            print(f"⚠️  Template file not found: {template_path}")
            print(f"   Using previous deck as fallback")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
