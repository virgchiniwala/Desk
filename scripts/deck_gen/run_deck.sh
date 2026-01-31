#!/bin/bash
# Run the full deck generation pipeline
#
# Usage:
#   ./run_deck.sh <purpose> <sentry_csv> <previous_deck> <sprint_num> <date_range>
#
# Examples:
#   ./run_deck.sh sprint_review sentry.csv sprint_11.pptx 12 "Jan 18 - Jan 31, 2026"
#   ./run_deck.sh exec_review sentry.csv sprint_11.pptx 12 "Jan 18 - Jan 31, 2026"

set -euo pipefail

# Validate args
if [ $# -ne 5 ]; then
    echo "Usage: $0 <purpose> <sentry_csv> <previous_deck> <sprint_num> <date_range>"
    echo ""
    echo "Purpose: sprint_review | exec_review"
    echo ""
    echo "Examples:"
    echo "  $0 sprint_review sentry.csv sprint_11.pptx 12 \"Jan 18 - Jan 31, 2026\""
    echo "  $0 exec_review   sentry.csv sprint_11.pptx 12 \"Jan 18 - Jan 31, 2026\""
    exit 1
fi

PURPOSE="$1"
SENTRY_CSV="$2"
PREV_DECK="$3"
SPRINT_NUM="$4"
DATE_RANGE="$5"

# Validate purpose
if [[ "$PURPOSE" != "sprint_review" && "$PURPOSE" != "exec_review" ]]; then
    echo "❌ Invalid purpose: $PURPOSE"
    echo "   Must be: sprint_review | exec_review"
    exit 1
fi

# Validate inputs exist
if [ ! -f "$SENTRY_CSV" ]; then
    echo "❌ Sentry CSV not found: $SENTRY_CSV"
    exit 1
fi

if [ ! -f "$PREV_DECK" ]; then
    echo "❌ Previous deck not found: $PREV_DECK"
    exit 1
fi

# Setup working directory
WORK_DIR="run_$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="output"
mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

OUTPUT_FILE="${OUTPUT_DIR}/${PURPOSE}_sprint_${SPRINT_NUM}.pptx"

echo "============================================"
echo "  Desk Deck Generation"
echo "============================================"
echo "  Purpose:   $PURPOSE"
echo "  Sprint:    $SPRINT_NUM"
echo "  Dates:     $DATE_RANGE"
echo "  Input CSV: $SENTRY_CSV"
echo "  Input Deck: $PREV_DECK"
echo "  Output:    $OUTPUT_FILE"
echo "============================================"
echo ""

# Step 1: Parse Sentry CSV
echo "📊 [1/5] Parsing Sentry CSV..."
python3 parse_sentry_csv.py "$SENTRY_CSV" "$WORK_DIR/metrics.json"
echo ""

# Step 2: Analyze previous deck
echo "📊 [2/5] Analyzing previous deck..."
python3 analyze_pptx.py "$PREV_DECK" "$WORK_DIR/deck_structure.json"
echo ""

# Step 3: Select template
echo "📋 [3/5] Selecting template: $PURPOSE..."
python3 template_selector.py "$PURPOSE" "." "$WORK_DIR/template_config.json"
echo ""

# Step 4: Generate updates
echo "🤖 [4/5] Generating slide updates..."
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    echo "   Using live LLM (Anthropic)..."
    python3 generate_slide_updates.py \
        "$WORK_DIR/metrics.json" \
        "$WORK_DIR/deck_structure.json" \
        "$WORK_DIR/slide_updates.json" \
        --sprint-num "$SPRINT_NUM" \
        --date-range "$DATE_RANGE" \
        --template-config "$WORK_DIR/template_config.json"
else
    echo "   ⚠️  ANTHROPIC_API_KEY not set. Using mock mode."
    echo "   Set ANTHROPIC_API_KEY for live LLM generation."
    python3 generate_slide_updates_mock.py \
        "$WORK_DIR/metrics.json" \
        "$WORK_DIR/deck_structure.json" \
        "$WORK_DIR/slide_updates.json" \
        --sprint-num "$SPRINT_NUM" \
        --date-range "$DATE_RANGE" \
        --template-config "$WORK_DIR/template_config.json"
fi
echo ""

# Step 5: Build deck
echo "🏗️  [5/5] Building PowerPoint deck..."
python3 build_pptx.py \
    "$PREV_DECK" \
    "$WORK_DIR/slide_updates.json" \
    "$OUTPUT_FILE"
echo ""

# Validate
echo "🔍 Validating output..."
python3 validate_pptx.py "$OUTPUT_FILE"
echo ""

echo "============================================"
echo "  ✅ Done!"
echo "============================================"
echo "  Output: $OUTPUT_FILE"
echo "  Open:   open $OUTPUT_FILE"
echo "============================================"
