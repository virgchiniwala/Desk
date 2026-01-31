# How to Use Desk Deck Generation

## Quick Start (Manual)

```bash
cd scripts/deck_gen
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sk-ant-..."

# 1. Dump your Sentry CSV export here
cp ~/Downloads/sentry_export.csv ./input_sentry.csv

# 2. Copy your previous deck here  
cp ~/Documents/sprint_11_deck.pptx ./input_previous_deck.pptx

# 3. Run the pipeline
python3 run_deck.sh sprint_review input_sentry.csv input_previous_deck.pptx 12 "Jan 18 - Jan 31, 2026"

# 4. Pick up your new deck
open output/sprint_review_sprint_12.pptx
```

## Two Deck Types

### Sprint Review (every 2 weeks)
```bash
python3 run_deck.sh sprint_review sentry.csv prev_deck.pptx 12 "Jan 18 - Jan 31"
```
- Tactical, team-facing
- All metrics, blockers, resolution status
- Top 5-10 issues with details
- Next sprint plan

### Exec Review (monthly)
```bash
python3 run_deck.sh exec_review sentry.csv prev_deck.pptx 12 "Jan 18 - Jan 31"
```
- Strategic, leadership-facing
- High-level trends only
- Top 3 issues, business impact
- Recommendations

## Same data. Different stories. Different audiences.

## What It Does

1. **Parses** your Sentry CSV → extracts metrics
2. **Reads** your previous deck → understands structure
3. **Selects** template based on purpose → sets tone/detail level
4. **Generates** updates via LLM → reshapes data for audience
5. **Builds** new .pptx → preserves your design, updates numbers
6. **Validates** output → confirms it opens correctly

## Output

- Fully editable PowerPoint
- Same design/layout as previous deck
- Updated numbers and narrative
- Ready to present or tweak
