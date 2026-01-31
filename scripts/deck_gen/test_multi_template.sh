#!/bin/bash
# Test multi-template deck generation pipeline

set -e

echo "🧪 Testing Multi-Template Deck Generation Pipeline"
echo "=================================================="
echo ""

# Setup test directory
TEST_DIR="test_output"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

echo "📁 Test directory: $TEST_DIR"
echo ""

# Step 1: Create mock data
echo "Step 1: Creating mock data..."
python3 create_mock_data.py "$TEST_DIR"
echo ""

# Step 2: Parse Sentry CSV
echo "Step 2: Parsing Sentry CSV..."
python3 parse_sentry_csv.py \
  "$TEST_DIR/sentry_export.csv" \
  "$TEST_DIR/metrics.json"
echo ""

# Step 3a: Test Sprint Review template
echo "Step 3a: Generating Sprint Review configuration..."
python3 template_selector.py \
  sprint_review \
  "$TEST_DIR" \
  "$TEST_DIR/sprint_review_config.json"
echo ""

echo "Step 3b: Generating slide updates for Sprint Review..."
python3 generate_slide_updates.py \
  "$TEST_DIR/metrics.json" \
  "$TEST_DIR/deck_structure.json" \
  "$TEST_DIR/sprint_review_updates.json" \
  --sprint-num 12 \
  --date-range "Jan 18 - Jan 31, 2026" \
  --template-config "$TEST_DIR/sprint_review_config.json"
echo ""

# Step 4a: Test Exec Review template  
echo "Step 4a: Generating Exec Review configuration..."
python3 template_selector.py \
  exec_review \
  "$TEST_DIR" \
  "$TEST_DIR/exec_review_config.json"
echo ""

echo "Step 4b: Generating slide updates for Exec Review..."
python3 generate_slide_updates.py \
  "$TEST_DIR/metrics.json" \
  "$TEST_DIR/deck_structure.json" \
  "$TEST_DIR/exec_review_updates.json" \
  --sprint-num 12 \
  --date-range "Jan 18 - Jan 31, 2026" \
  --template-config "$TEST_DIR/exec_review_config.json"
echo ""

# Summary
echo "✅ Pipeline test complete!"
echo ""
echo "Generated files:"
echo "  - Sprint Review config: $TEST_DIR/sprint_review_config.json"
echo "  - Sprint Review updates: $TEST_DIR/sprint_review_updates.json"
echo "  - Exec Review config: $TEST_DIR/exec_review_config.json"
echo "  - Exec Review updates: $TEST_DIR/exec_review_updates.json"
echo ""
echo "📊 Compare the two update files to see how purpose changes output"
echo ""

# Show difference in approach
echo "🔍 Quick comparison:"
echo ""
echo "Sprint Review sections:"
jq -r '.sections[]' "$TEST_DIR/sprint_review_config.json" | sed 's/^/  - /'
echo ""
echo "Exec Review sections:"
jq -r '.sections[]' "$TEST_DIR/exec_review_config.json" | sed 's/^/  - /'
echo ""

echo "💡 Next: Build actual .pptx files with build_pptx.py (requires real template files)"
