#!/usr/bin/env bash
set -euo pipefail

# run.sh - Execute Desk job phase with validation
# Usage: ./ralph/run.sh JOB-ID --phase PHASE

usage() {
    echo "Usage: $0 JOB-ID --phase PHASE"
    echo "  PHASE: One of RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE"
    exit 1
}

validate_phase() {
    local phase="$1"
    case "$phase" in
        RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE)
            return 0
            ;;
        *)
            echo "ERROR: Invalid phase. Must be one of: RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE"
            exit 1
            ;;
    esac
}

check_job_exists() {
    local job_dir="$1"
    if [ ! -d "$job_dir" ]; then
        echo "ERROR: Job directory not found: $job_dir"
        exit 1
    fi
}

check_artifacts() {
    local job_dir="$1"
    local required_files=("meta.json" "plan.md" "progress.md" "session-handoff.md")

    for file in "${required_files[@]}"; do
        if [ ! -f "$job_dir/$file" ]; then
            echo "ERROR: Required artifact missing: $job_dir/$file"
            exit 1
        fi
    done
}

get_allowed_paths() {
    local meta_file="$1"
    local job_id="$2"

    # Default: only jobs/<JOB_ID>/
    local default_path="jobs/$job_id/"

    # Check if elevated
    local elevated=$(jq -r '.elevated // false' "$meta_file")

    if [ "$elevated" = "true" ]; then
        # Extract additional allowed paths from meta.json
        jq -r '.allowedPaths[]' "$meta_file"
    else
        echo "$default_path"
    fi
}

check_unauthorized_writes() {
    local job_id="$1"
    local allowed_paths=("$@")
    shift

    echo "🔍 Checking for unauthorized writes..."

    # Get all changed files (staged, unstaged, and untracked)
    local changed_files=$(git status --porcelain | awk '{print $2}')

    if [ -z "$changed_files" ]; then
        echo "✅ No changes detected"
        return 0
    fi

    local unauthorized=()

    while IFS= read -r file; do
        local authorized=false

        for allowed in "${allowed_paths[@]}"; do
            if [[ "$file" == "$allowed"* ]]; then
                authorized=true
                break
            fi
        done

        if [ "$authorized" = false ]; then
            unauthorized+=("$file")
        fi
    done <<< "$changed_files"

    if [ ${#unauthorized[@]} -gt 0 ]; then
        echo "❌ ERROR: Unauthorized writes detected:"
        printf '%s\n' "${unauthorized[@]}"
        echo ""
        echo "Allowed write paths:"
        printf '%s\n' "${allowed_paths[@]}"
        exit 2
    fi

    echo "✅ All writes within allowed paths"
}

main() {
    if [ $# -lt 3 ]; then
        usage
    fi

    local job_id="$1"
    local phase_flag="$2"
    local phase="$3"
    local job_dir="jobs/$job_id"
    local meta_file="$job_dir/meta.json"

    # Validate inputs
    if [ "$phase_flag" != "--phase" ]; then
        usage
    fi

    validate_phase "$phase"
    check_job_exists "$job_dir"
    check_artifacts "$job_dir"

    # Get allowed paths
    local allowed_paths=($(get_allowed_paths "$meta_file" "$job_id"))

    echo "🚀 Running $job_id — Phase: $phase"
    echo "📂 Allowed write paths:"
    printf '  - %s\n' "${allowed_paths[@]}"
    echo ""

    # Update meta.json with current phase
    jq --arg phase "$phase" '.phase = $phase' "$meta_file" > "$meta_file.tmp"
    mv "$meta_file.tmp" "$meta_file"

    echo "✅ Phase validation complete"
    echo "⚠️  Execute your phase work now"
    echo ""
    echo "When complete, run postflight check:"
    echo "  ./ralph/run.sh $job_id --phase $phase --postflight"
}

postflight() {
    local job_id="$1"
    local phase="$2"
    local job_dir="jobs/$job_id"
    local meta_file="$job_dir/meta.json"

    # Get allowed paths
    local allowed_paths=($(get_allowed_paths "$meta_file" "$job_id"))

    # Check for unauthorized writes
    check_unauthorized_writes "$job_id" "${allowed_paths[@]}"

    # Commit changes
    echo "📝 Committing changes..."
    git add .
    git commit -m "Desk: $job_id — $phase — checkpoint"

    echo "✅ Phase $phase complete for $job_id"
}

# Check for postflight flag
if [ $# -eq 4 ] && [ "$4" = "--postflight" ]; then
    postflight "$1" "$3"
else
    main "$@"
fi
