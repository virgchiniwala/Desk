#!/usr/bin/env bash
set -euo pipefail

# enqueue.sh - Enqueue jobs into the background worker queue
# Usage: ./ralph/enqueue.sh <JOB_ID> <PHASE> [OPTIONS]

usage() {
    echo "Usage: $0 JOB-ID PHASE [OPTIONS]"
    echo ""
    echo "Arguments:"
    echo "  JOB-ID     Job identifier (required)"
    echo "  PHASE      One of RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE"
    echo ""
    echo "Options:"
    echo "  --exec \"CMD\"       Command to execute (required)"
    echo "  --time-min N       Time budget in minutes (default: 30)"
    echo "  --retries N        Max retry attempts (default: 0)"
    echo "  --checkpointable   Allow re-enqueue on timeout (default: false)"
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

validate_job_id() {
    local job_id="$1"

    # Check format (alphanumeric, hyphens, underscores)
    if ! [[ "$job_id" =~ ^[A-Za-z0-9_-]+$ ]]; then
        echo "❌ ERROR: Invalid JOB-ID format. Use alphanumeric, hyphens, and underscores only."
        echo "Provided: $job_id"
        exit 1
    fi

    # Check job directory exists
    if [ ! -d "jobs/$job_id" ]; then
        echo "❌ ERROR: Job directory not found: jobs/$job_id"
        exit 1
    fi
}

check_no_active_lock() {
    local job_id="$1"
    local lock_file="jobs/$job_id/tmp/worker.lock"

    if [ -f "$lock_file" ]; then
        echo "⚠️  WARNING: Lock file exists for $job_id"
        echo "Lock file: $lock_file"
        echo ""
        echo "If this is a stale lock, remove it with:"
        echo "  ./ralph/unlock-job.sh $job_id"
        echo ""
        echo "Continuing with enqueue (worker will handle lock check)..."
    fi
}

main() {
    # Parse arguments
    if [ $# -lt 2 ]; then
        usage
    fi

    JOB_ID="$1"
    PHASE="$2"
    shift 2

    # Default options
    EXEC_COMMAND=""
    TIME_BUDGET_MIN=30
    MAX_RETRIES=0
    CHECKPOINTABLE="false"

    # Parse options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --exec)
                if [ -z "${2:-}" ]; then
                    echo "❌ ERROR: --exec requires an argument"
                    exit 1
                fi
                EXEC_COMMAND="$2"
                shift 2
                ;;
            --time-min)
                if [ -z "${2:-}" ]; then
                    echo "❌ ERROR: --time-min requires an argument"
                    exit 1
                fi
                TIME_BUDGET_MIN="$2"
                shift 2
                ;;
            --retries)
                if [ -z "${2:-}" ]; then
                    echo "❌ ERROR: --retries requires an argument"
                    exit 1
                fi
                MAX_RETRIES="$2"
                shift 2
                ;;
            --checkpointable)
                CHECKPOINTABLE="true"
                shift
                ;;
            *)
                echo "❌ ERROR: Unknown option: $1"
                usage
                ;;
        esac
    done

    # Validation
    validate_job_id "$JOB_ID"
    validate_phase "$PHASE"

    if [ -z "$EXEC_COMMAND" ]; then
        echo "❌ ERROR: --exec is required"
        usage
    fi

    check_no_active_lock "$JOB_ID"

    # Ensure queue directory exists
    mkdir -p ralph/queue/pending

    # Generate queue ID (timestamp-jobid-phase)
    TIMESTAMP=$(date +%s)
    QUEUE_ID="${TIMESTAMP}-${JOB_ID}-${PHASE}"
    QUEUE_FILE="ralph/queue/pending/${QUEUE_ID}.queue"

    # Generate enqueue timestamp (ISO 8601)
    ENQUEUED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")
    ENQUEUED_BY="$(whoami)@$(hostname)"

    # Write queue item (bash-parseable KEY=VALUE format)
    cat > "$QUEUE_FILE" <<EOF
QUEUE_ID=$QUEUE_ID
JOB_ID=$JOB_ID
PHASE=$PHASE
EXEC_COMMAND=$EXEC_COMMAND
ENQUEUED_AT=$ENQUEUED_AT
ENQUEUED_BY=$ENQUEUED_BY
TIME_BUDGET_MIN=$TIME_BUDGET_MIN
RETRY_COUNT=0
MAX_RETRIES=$MAX_RETRIES
CHECKPOINTABLE=$CHECKPOINTABLE
EOF

    echo "✅ Job exists: $JOB_ID"
    echo "✅ Phase valid: $PHASE"
    echo "✅ Enqueued: $QUEUE_ID"
    echo "📍 Queue file: $QUEUE_FILE"
    echo ""
    echo "Worker will pick up this item when available."
}

main "$@"
