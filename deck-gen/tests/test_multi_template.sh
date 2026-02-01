#!/usr/bin/env bash
# Integration smoke test — runs the pipeline end-to-end in mock mode
# for each template type. Uses mock scripts only — no API tokens burned.
#
# Usage: ./tests/test_multi_template.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DECK_DIR="${SCRIPT_DIR}/.."
PASS=0
FAIL=0

run_test() {
    local template_type="$1"
    echo -n "  Testing $template_type... "

    local output="${SCRIPT_DIR}/output_${template_type}.pptx"

    if "${DECK_DIR}/run_deck.sh" --type "$template_type" --mock --output "$output" 2>/dev/null; then
        if [[ -f "$output" ]]; then
            echo "✅ PASS"
            PASS=$((PASS + 1))
            rm -f "$output"
        else
            echo "❌ FAIL (output not created)"
            FAIL=$((FAIL + 1))
        fi
    else
        echo "❌ FAIL (pipeline error)"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Deck Gen Integration Tests ==="
run_test "sprint_review"
run_test "exec_review"
echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
