# PowerPoint Deck Generation

Automated generation of sprint decks from Sentry data + previous deck template.

## Overview

This pipeline takes:
- **Input 1:** Sentry CSV export (error metrics)
- **Input 2:** Previous sprint's PowerPoint deck (.pptx)

And produces:
- **Output:** New PowerPoint deck with updated numbers (fully editable)

## Pipeline

```
Sentry CSV ────┐
               ├──▶ LLM Analysis ──▶ Build New .pptx
Previous Deck ─┘
```

### Scripts

1. **parse_sentry_csv.py** - Extract metrics from Sentry export
2. **analyze_pptx.py** - Parse structure of previous deck
3. **generate_slide_updates.py** - Use LLM to create content updates
4. **build_pptx.py** - Apply updates to create new deck
5. **validate_pptx.py** - Verify output is valid

## Setup

### Install Dependencies

```bash
cd scripts/deck_gen
pip install -r requirements.txt
```

### Environment Variables

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Usage

### Manual Execution

```bash
# 1. Parse Sentry data
python parse_sentry_csv.py sentry_export.csv metrics.json

# 2. Analyze previous deck
python analyze_pptx.py sprint_11_deck.pptx structure.json

# 3. Generate updates (requires ANTHROPIC_API_KEY)
python generate_slide_updates.py \
  metrics.json \
  structure.json \
  updates.json \
  --sprint-num 12 \
  --date-range "Jan 18 - Jan 31, 2026"

# 4. Build new deck
python build_pptx.py \
  sprint_11_deck.pptx \
  updates.json \
  sprint_12_deck.pptx

# 5. Validate
python validate_pptx.py sprint_12_deck.pptx
```

### Via Desk Workflow

```bash
# Create job from workflow
cd ../..
./ralph/new-job.sh SENTRY-001 "Sprint 12 Deck Generation"

# Copy inputs
cp ~/Downloads/sentry_export.csv jobs/SENTRY-001/inputs/sentry_csv
cp ~/Documents/sprint_11_deck.pptx jobs/SENTRY-001/inputs/previous_deck

# Enqueue workflow tasks
# (This will be automated via UI)
./ralph/enqueue.sh SENTRY-001 PARSE \
  --exec "python scripts/deck_gen/parse_sentry_csv.py ..."

# Worker will execute all tasks automatically
```

## Sentry CSV Format

Expected columns (flexible):
- **Error Type** / Title / Issue name
- **Count** / Events / Occurrences
- **Status** (optional) - resolved/unresolved
- **First Seen** (optional) - for detecting new errors
- **Last Seen** (optional)

The parser will auto-detect column names with common variations.

## Deck Structure Assumptions

The pipeline works best when:
- Previous deck has consistent structure (slides in same order)
- Metric slides contain tables or text boxes with numbers
- Slide titles indicate content (e.g., "Error Trends", "Top Issues")

The LLM will:
- Update sprint number/dates everywhere
- Replace metric values in tables
- Calculate percentage changes
- Update "Top Issues" lists
- Preserve all formatting and design

## Customization

### Adjust LLM Instructions

Edit `generate_slide_updates.py` prompt to:
- Change how metrics are formatted
- Add/remove slide sections
- Adjust calculation logic
- Include additional context

### Extend Metrics

Edit `parse_sentry_csv.py` to extract:
- Additional error attributes
- Custom groupings
- Time-based trends
- Resolution patterns

## Limitations

1. **Charts:** Charts are not updated automatically (python-pptx limitation)
   - Charts can be regenerated but requires chart data XML manipulation
   - Workaround: Use tables instead of embedded charts

2. **Complex Layouts:** Heavily customized slides may need manual review
   - LLM does its best to preserve formatting
   - Test with your actual deck template

3. **Non-standard CSV:** If Sentry export format changes significantly
   - Parser has fallback to mock data
   - Update column detection logic in `parse_sentry_csv.py`

## Troubleshooting

### "ANTHROPIC_API_KEY not set"
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### "Column not found in CSV"
- Check CSV column names
- Update column detection in `parse_sentry_csv.py`
- Or use mock data mode for testing

### "Invalid PowerPoint"
- Ensure previous deck is valid .pptx (not .ppt or corrupted)
- Try opening/saving in PowerPoint first
- Check error in validate_pptx.py output

### "LLM response not valid JSON"
- Check ANTHROPIC_API_KEY is valid
- Review LLM prompt in `generate_slide_updates.py`
- May need to adjust prompt for edge cases

## Future Enhancements

- [ ] Chart data updates (requires chart XML manipulation)
- [ ] Sentry API connector (auto-fetch data, no manual export)
- [ ] Google Slides output format
- [ ] Multi-source data (Sentry + Amplitude + Sheets)
- [ ] Workflow templates (save common configurations)
- [ ] Preview mode (show updates before applying)
- [ ] Comparison view (side-by-side old vs new)

## Example Output

**Input:**
- sentry_export.csv (234 errors, 23 unique types)
- sprint_11_deck.pptx (6 slides)

**Process:**
- LLM analyzes data and generates 47 updates across 5 slides
- Title slide: Sprint 11 → Sprint 12
- Metrics slide: 1,234 → 1,456 errors (+18%)
- Top issues table: Updated with current top 5
- Summary: Generated from trend analysis

**Output:**
- sprint_12_deck.pptx (fully editable, same design, updated numbers)

## License

Part of Desk Platform - See parent repository LICENSE.
