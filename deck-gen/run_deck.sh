#!/usr/bin/env bash
# run_deck.sh — End-to-end deck generation pipeline
#
# Usage:
#   ./run_deck.sh --type sprint_review --csv <sentry.csv> [--mock] [--output <output.pptx>]
#
# Stages:
#   1. Select + analyze template
#   2. Parse metrics (CSV or mock)
#   3. Generate slide updates (API or mock)
#   4. Build updated PPTX
#   5. Validate output

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="${SCRIPT_DIR}/run_$(date +%Y%m%d_%H%M%S)"

# Defaults
TEMPLATE_TYPE="sprint_review"
TEMPLATES_PATH="${SCRIPT_DIR}/templates"
MOCK=false
OUTPUT=""

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --type)       TEMPLATE_TYPE="$2"; shift 2 ;;
        --csv)        CSV_PATH="$2";      shift 2 ;;
        --mock)       MOCK=true;          shift   ;;
        --output|-o)  OUTPUT="$2";        shift 2 ;;
        -h|--help)
            echo "Usage: $0 --type <sprint_review|exec_review> [--csv <path>] [--mock] [--output <path>]"
            exit 0
            ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# Validate
if [[ "$MOCK" == false && -z "${CSV_PATH:-}" ]]; then
    echo "Error: --csv is required unless --mock is used" >&2
    exit 1
fi

OUTPUT="${OUTPUT:-${SCRIPT_DIR}/deck_${TEMPLATE_TYPE}_$(date +%Y%m%d_%H%M%S).pptx}"

# Create isolated work dir
mkdir -p "$WORK_DIR"
trap "echo 'Work dir: $WORK_DIR'" EXIT

echo "=== Deck Generation Pipeline ===" >&2
echo "  Type:     $TEMPLATE_TYPE" >&2
echo "  Mock:     $MOCK" >&2
echo "  Output:   $OUTPUT" >&2
echo "" >&2

# Stage 1: Template selection + analysis
echo "[1/5] Selecting template..." >&2
python3 "${SCRIPT_DIR}/scripts/template_selector.py" \
    --type "$TEMPLATE_TYPE" \
    --templates-path "$TEMPLATES_PATH" \
    -o "${WORK_DIR}/template_analysis.json"

# Stage 2: Parse metrics
echo "[2/5] Parsing metrics..." >&2
if [[ "$MOCK" == true ]]; then
    python3 "${SCRIPT_DIR}/scripts/parse_sentry_csv.py" --mock -o "${WORK_DIR}/metrics.json"
else
    python3 "${SCRIPT_DIR}/scripts/parse_sentry_csv.py" "$CSV_PATH" -o "${WORK_DIR}/metrics.json"
fi

# Stage 3: Generate slide updates
echo "[3/5] Generating slide updates..." >&2
if [[ "$MOCK" == true ]]; then
    python3 "${SCRIPT_DIR}/scripts/generate_slide_updates_mock.py" \
        "${WORK_DIR}/template_analysis.json" \
        "${WORK_DIR}/metrics.json" \
        -o "${WORK_DIR}/updates.json"
else
    python3 "${SCRIPT_DIR}/scripts/generate_slide_updates.py" \
        "${WORK_DIR}/template_analysis.json" \
        "${WORK_DIR}/metrics.json" \
        -o "${WORK_DIR}/updates.json"
fi

# Stage 4: Build PPTX
echo "[4/5] Building deck..." >&2
TEMPLATE_PATH=$(python3 -c "import json; print(json.load(open('${WORK_DIR}/template_analysis.json'))['template_path'])")
python3 "${SCRIPT_DIR}/scripts/build_pptx.py" \
    "$TEMPLATE_PATH" \
    "${WORK_DIR}/updates.json" \
    -o "$OUTPUT"

# Stage 5: Validate
echo "[5/5] Validating..." >&2
python3 "${SCRIPT_DIR}/scripts/validate_pptx.py" \
    "$OUTPUT" \
    --updates "${WORK_DIR}/updates.json"

echo "" >&2
echo "✅ Done: $OUTPUT" >&2
