#!/usr/bin/env bash
set -euo pipefail

# run.sh - Execute Desk job phase with validation
# Usage: ./ralph/run.sh JOB-ID --phase PHASE [--exec "COMMAND"] [--postflight] [--skip-postflight]

usage() {
    echo "Usage: $0 JOB-ID --phase PHASE [OPTIONS]"
    echo "  PHASE: One of RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE"
    echo ""
    echo "Options:"
    echo "  --exec \"COMMAND\"      Execute command in jobs/JOB-ID/ directory"
    echo "  --postflight          Run postflight only (backward compat)"
    echo "  --skip-postflight     Skip postflight (requires elevated=true)"
    exit 1
}

validate_phase() {
    local phase="$1"
    case "$phase" in
        RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE)
            return 0
            ;;
        *)
            echo "❌ ERROR: Invalid phase. Must be one of: RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE"
            echo "Provided: $phase"
            exit 1
            ;;
    esac
}

check_job_exists() {
    local job_dir="$1"
    if [ ! -d "$job_dir" ]; then
        echo "❌ ERROR: Job directory not found: $job_dir"
        exit 1
    fi
}

check_artifacts() {
    local job_dir="$1"
    local required_files=("meta.json" "plan.md" "progress.md" "session-handoff.md")

    for file in "${required_files[@]}"; do
        if [ ! -f "$job_dir/$file" ]; then
            echo "❌ ERROR: Required artifact missing: $job_dir/$file"
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
    shift
    local allowed_paths=("$@")

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
        printf '  %s\n' "${unauthorized[@]}"
        echo ""
        echo "Allowed write paths:"
        printf '  - %s\n' "${allowed_paths[@]}"
        echo ""
        echo "ERROR: Write path validation failed"
        echo "No commit created"
        exit 2
    fi

    echo "✅ All writes within allowed paths"
}

run_preflight() {
    local job_id="$1"
    local phase="$2"
    local job_dir="jobs/$job_id"
    local meta_file="$job_dir/meta.json"

    validate_phase "$phase"
    check_job_exists "$job_dir"
    check_artifacts "$job_dir"

    # Get allowed paths
    local allowed_paths=($(get_allowed_paths "$meta_file" "$job_id"))

    # Check if elevated
    local elevated=$(jq -r '.elevated // false' "$meta_file")

    echo "🚀 Running $job_id — Phase: $phase"
    echo "📂 Allowed write paths:"
    printf '  - %s\n' "${allowed_paths[@]}"
    if [ "$elevated" = "true" ]; then
        echo "🔓 Elevated permissions: true"
    fi
    echo ""

    # Update meta.json with current phase
    jq --arg phase "$phase" '.phase = $phase' "$meta_file" > "$meta_file.tmp"
    mv "$meta_file.tmp" "$meta_file"

    echo "✅ Preflight validation complete"
}

run_exec() {
    local job_id="$1"
    local exec_cmd="$2"
    local job_dir="jobs/$job_id"

    echo ""
    echo "🔄 Executing in $job_dir: $exec_cmd"

    # Execute command in job directory with login shell
    if (cd "$job_dir" && bash -lc "$exec_cmd"); then
        echo "✅ Exec completed successfully"
        return 0
    else
        local exit_code=$?
        echo ""
        echo "❌ Exec failed with exit code $exit_code"
        echo ""
        echo "ERROR: Exec command failed"
        echo "Skipping postflight and commit"
        exit 3
    fi
}

run_postflight() {
    local job_id="$1"
    local job_dir="jobs/$job_id"
    local meta_file="$job_dir/meta.json"

    echo ""

    # Get allowed paths
    local allowed_paths=($(get_allowed_paths "$meta_file" "$job_id"))

    # Check for unauthorized writes
    check_unauthorized_writes "$job_id" "${allowed_paths[@]}"
}

commit_changes() {
    local job_id="$1"
    local phase="$2"

    echo ""
    echo "📝 Committing changes..."
    git add .
    git commit -m "Desk: $job_id — $phase — checkpoint"

    echo ""
    echo "✅ Phase $phase complete for $job_id"
}

parse_args() {
    JOB_ID=""
    PHASE=""
    EXEC_COMMAND=""
    POSTFLIGHT_ONLY=false
    SKIP_POSTFLIGHT=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --phase)
                if [ -z "${2:-}" ]; then
                    echo "❌ ERROR: --phase requires an argument"
                    exit 1
                fi
                PHASE="$2"
                shift 2
                ;;
            --exec)
                if [ -z "${2:-}" ]; then
                    echo "❌ ERROR: --exec requires an argument"
                    exit 1
                fi
                EXEC_COMMAND="$2"
                shift 2
                ;;
            --postflight)
                POSTFLIGHT_ONLY=true
                shift
                ;;
            --skip-postflight)
                SKIP_POSTFLIGHT=true
                shift
                ;;
            *)
                if [ -z "$JOB_ID" ]; then
                    JOB_ID="$1"
                    shift
                else
                    echo "❌ ERROR: Unexpected argument: $1"
                    usage
                fi
                ;;
        esac
    done

    # Validate required arguments
    if [ -z "$JOB_ID" ]; then
        echo "❌ ERROR: JOB-ID is required"
        usage
    fi

    if [ -z "$PHASE" ]; then
        echo "❌ ERROR: --phase is required"
        usage
    fi
}

validate_flags() {
    local job_id="$1"
    local meta_file="jobs/$job_id/meta.json"

    # Validate flag combinations
    if [ "$POSTFLIGHT_ONLY" = true ] && [ -n "$EXEC_COMMAND" ]; then
        echo "❌ ERROR: --postflight cannot be used with --exec"
        echo "These modes are mutually exclusive"
        exit 1
    fi

    if [ "$POSTFLIGHT_ONLY" = true ] && [ "$SKIP_POSTFLIGHT" = true ]; then
        echo "❌ ERROR: --postflight and --skip-postflight are mutually exclusive"
        exit 1
    fi

    # Check elevation for --skip-postflight
    if [ "$SKIP_POSTFLIGHT" = true ]; then
        if [ -f "$meta_file" ]; then
            local elevated=$(jq -r '.elevated // false' "$meta_file")
            if [ "$elevated" != "true" ]; then
                echo "❌ ERROR: --skip-postflight requires elevated=true in meta.json"
                echo "Job $job_id elevated status: false"
                echo "Permission denied"
                exit 2
            fi
        fi
    fi
}

main() {
    # Parse arguments
    parse_args "$@"

    # Validate flags
    validate_flags "$JOB_ID"

    # Handle postflight-only mode (backward compatibility)
    if [ "$POSTFLIGHT_ONLY" = true ]; then
        echo "🔍 Running postflight for $JOB_ID — Phase: $PHASE"
        echo ""
        run_postflight "$JOB_ID"
        commit_changes "$JOB_ID" "$PHASE"
        exit 0
    fi

    # Standard mode: preflight -> exec -> postflight -> commit
    run_preflight "$JOB_ID" "$PHASE"

    # Execute command if provided
    if [ -n "$EXEC_COMMAND" ]; then
        run_exec "$JOB_ID" "$EXEC_COMMAND"
    else
        echo ""
        echo "⚠️  No --exec command provided"
    fi

    # Run postflight and commit (unless skipped)
    if [ "$SKIP_POSTFLIGHT" = false ]; then
        run_postflight "$JOB_ID"
        commit_changes "$JOB_ID" "$PHASE"
    else
        echo ""
        echo "⚠️  Skipping postflight (--skip-postflight enabled)"
        echo "⚠️  No commit created"
    fi

    exit 0
}

main "$@"
