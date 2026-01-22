#!/usr/bin/env bash
set -euo pipefail

# worker.sh - Background worker for processing queued Desk jobs
# Usage: ./ralph/worker.sh [--loop-sleep N] [--lock-ttl-hours N]

LOOP_SLEEP_SEC=10
LOCK_TTL_HOURS=2

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --loop-sleep N      Sleep N seconds between queue scans (default: 10)"
    echo "  --lock-ttl-hours N  Lock timeout in hours (default: 2)"
    echo ""
    echo "Worker runs in infinite loop, processing queued jobs via ralph/run.sh"
    exit 1
}

log_worker() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")] $*"
}

preflight_checks() {
    log_worker "Running preflight checks..."

    # Check ralph/run.sh exists and is executable
    if [ ! -x "ralph/run.sh" ]; then
        echo "❌ FATAL: ralph/run.sh not found or not executable"
        echo "Worker cannot start without executor"
        exit 1
    fi
    log_worker "✅ ralph/run.sh found"

    # Check timeout command is available
    if ! command -v timeout >/dev/null 2>&1; then
        echo "❌ FATAL: timeout command not available"
        echo "Worker requires timeout to enforce time budgets"
        echo ""
        echo "Install timeout:"
        echo "  macOS: brew install coreutils"
        echo "  Linux: timeout is part of coreutils (usually pre-installed)"
        exit 1
    fi
    log_worker "✅ timeout command available"

    # Ensure queue directories exist
    mkdir -p ralph/queue/{pending,processing,completed,failed}
    log_worker "✅ Queue directories ready"
}

parse_queue_file() {
    local queue_file="$1"

    # Source the queue file to load variables
    # shellcheck disable=SC1090
    source "$queue_file"

    # Export variables for use in calling functions
    export QUEUE_ID JOB_ID PHASE EXEC_COMMAND
    export TIME_BUDGET_MIN RETRY_COUNT MAX_RETRIES CHECKPOINTABLE
}

acquire_lock() {
    local job_id="$1"
    local queue_id="$2"
    local lock_file="jobs/$job_id/tmp/worker.lock"

    # Ensure tmp directory exists
    mkdir -p "jobs/$job_id/tmp"

    # Check if lock exists
    if [ -f "$lock_file" ]; then
        # Read lock timestamp
        local lock_timestamp
        lock_timestamp=$(grep "^STARTED_AT=" "$lock_file" | cut -d= -f2)

        if [ -z "$lock_timestamp" ]; then
            log_worker "⚠️  Lock file exists but no timestamp, removing stale lock"
            rm -f "$lock_file"
        else
            # Calculate lock age in seconds
            local current_timestamp
            current_timestamp=$(date +%s)
            local lock_age=$((current_timestamp - lock_timestamp))
            local lock_ttl_sec=$((LOCK_TTL_HOURS * 3600))

            if [ "$lock_age" -gt "$lock_ttl_sec" ]; then
                log_worker "⚠️  Lock expired (age: ${lock_age}s, TTL: ${lock_ttl_sec}s), removing"
                rm -f "$lock_file"
            else
                log_worker "Job $job_id locked (age: ${lock_age}s, TTL: ${lock_ttl_sec}s), skipping"
                return 1
            fi
        fi
    fi

    # Create lock file
    cat > "$lock_file" <<EOF
QUEUE_ID=$queue_id
STARTED_AT=$(date +%s)
STARTED_AT_ISO=$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")
WORKER_PID=$$
HOSTNAME=$(hostname)
EOF

    log_worker "✅ Lock acquired for $job_id (PID: $$)"
    return 0
}

release_lock() {
    local job_id="$1"
    local lock_file="jobs/$job_id/tmp/worker.lock"

    if [ -f "$lock_file" ]; then
        rm -f "$lock_file"
        log_worker "✅ Lock released for $job_id"
    fi
}

execute_job() {
    local job_id="$1"
    local phase="$2"
    local exec_cmd="$3"
    local time_budget_min="$4"
    local log_file="jobs/$job_id/tmp/worker.log"

    # Ensure log directory exists
    mkdir -p "jobs/$job_id/tmp"

    # Calculate timeout in seconds
    local timeout_sec=$((time_budget_min * 60))

    # Log execution start
    {
        echo ""
        echo "================================================================================"
        echo "[$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")] Starting $job_id — $phase"
        echo "Exec: $exec_cmd"
        echo "Time budget: ${time_budget_min} minutes (${timeout_sec} seconds)"
        echo "================================================================================"
        echo ""
    } >> "$log_file"

    log_worker "Executing $job_id — $phase (timeout: ${timeout_sec}s)"

    # Execute with timeout
    if timeout "$timeout_sec" ./ralph/run.sh "$job_id" --phase "$phase" --exec "$exec_cmd" >> "$log_file" 2>&1; then
        EXIT_CODE=0
    else
        EXIT_CODE=$?
    fi

    # Log execution result
    {
        echo ""
        echo "================================================================================"
        echo "[$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")] Finished with exit code: $EXIT_CODE"
        echo "================================================================================"
        echo ""
    } >> "$log_file"

    return $EXIT_CODE
}

mark_needs_review() {
    local job_id="$1"
    local meta_file="jobs/$job_id/meta.json"

    # Only update if meta.json exists
    if [ ! -f "$meta_file" ]; then
        log_worker "⚠️  WARNING: meta.json not found for $job_id, cannot mark NEEDS_REVIEW"
        return
    fi

    # Minimal safe update: read, modify status field, write back
    # This uses a simple sed replacement to avoid jq dependency
    if grep -q '"status"' "$meta_file"; then
        # Replace existing status field
        sed 's/"status": *"[^"]*"/"status": "NEEDS_REVIEW"/' "$meta_file" > "$meta_file.tmp"
        mv "$meta_file.tmp" "$meta_file"
        log_worker "✅ Marked $job_id as NEEDS_REVIEW"
    else
        log_worker "⚠️  WARNING: status field not found in meta.json, cannot mark NEEDS_REVIEW"
    fi
}

handle_exit_code() {
    local exit_code="$1"
    local job_id="$2"
    local queue_file="$3"
    local checkpointable="$4"
    local retry_count="$5"
    local max_retries="$6"

    case $exit_code in
        0)
            # Success
            log_worker "SUCCESS: $job_id (exit $exit_code)"
            mv "$queue_file" "ralph/queue/completed/"
            ;;

        124)
            # Timeout
            if [ "$checkpointable" = "true" ]; then
                log_worker "TIMEOUT (checkpointed): $job_id (exit $exit_code)"

                # Increment retry count and re-enqueue
                local new_retry_count=$((retry_count + 1))
                local new_timestamp
                new_timestamp=$(date +%s)
                local new_queue_id="${new_timestamp}-${job_id}-${PHASE}"
                local new_queue_file="ralph/queue/pending/${new_queue_id}.queue"

                # Update retry count and re-enqueue
                sed "s/^RETRY_COUNT=.*/RETRY_COUNT=$new_retry_count/" "$queue_file" | \
                sed "s/^QUEUE_ID=.*/QUEUE_ID=$new_queue_id/" | \
                sed "s/^ENQUEUED_AT=.*/ENQUEUED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")/" | \
                sed "s/^ENQUEUED_BY=.*/ENQUEUED_BY=worker-retry/" \
                > "$new_queue_file"

                rm "$queue_file"
                log_worker "Re-enqueued as $new_queue_id (retry $new_retry_count)"
            else
                log_worker "TIMEOUT (non-checkpointable): $job_id (exit $exit_code)"
                mv "$queue_file" "ralph/queue/failed/"
                mark_needs_review "$job_id"
            fi
            ;;

        1|2|3)
            # Failure from ralph/run.sh
            log_worker "FAILED: $job_id (exit $exit_code)"

            # Check if we should retry
            if [ "$max_retries" -gt 0 ] && [ "$retry_count" -lt "$max_retries" ]; then
                log_worker "Retry $((retry_count + 1)) of $max_retries"

                # Re-enqueue with incremented retry count
                local new_retry_count=$((retry_count + 1))
                local new_timestamp
                new_timestamp=$(date +%s)
                local new_queue_id="${new_timestamp}-${job_id}-${PHASE}"
                local new_queue_file="ralph/queue/pending/${new_queue_id}.queue"

                sed "s/^RETRY_COUNT=.*/RETRY_COUNT=$new_retry_count/" "$queue_file" | \
                sed "s/^QUEUE_ID=.*/QUEUE_ID=$new_queue_id/" | \
                sed "s/^ENQUEUED_AT=.*/ENQUEUED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")/" | \
                sed "s/^ENQUEUED_BY=.*/ENQUEUED_BY=worker-retry/" \
                > "$new_queue_file"

                rm "$queue_file"
                log_worker "Re-enqueued as $new_queue_id"
            else
                mv "$queue_file" "ralph/queue/failed/"
                mark_needs_review "$job_id"
            fi
            ;;

        *)
            # Unknown error
            log_worker "UNKNOWN ERROR: $job_id (exit $exit_code)"
            mv "$queue_file" "ralph/queue/failed/"
            mark_needs_review "$job_id"
            ;;
    esac
}

process_queue() {
    # Get oldest pending item (lexicographic sort)
    local queue_file
    queue_file=$(find ralph/queue/pending -name "*.queue" -type f 2>/dev/null | sort | head -n1)

    if [ -z "$queue_file" ]; then
        # No items in queue
        return 0
    fi

    local queue_filename
    queue_filename=$(basename "$queue_file")
    log_worker "Found: $queue_filename"

    # Parse queue file
    parse_queue_file "$queue_file"

    # Validate job exists
    if [ ! -d "jobs/$JOB_ID" ]; then
        log_worker "ERROR: Job not found: $JOB_ID"
        mv "$queue_file" "ralph/queue/failed/"
        return 0
    fi

    # Try to acquire lock
    if ! acquire_lock "$JOB_ID" "$QUEUE_ID"; then
        # Lock held, skip this item
        return 0
    fi

    # Move to processing
    local processing_file="ralph/queue/processing/$queue_filename"
    mv "$queue_file" "$processing_file"
    queue_file="$processing_file"

    # Execute job
    if execute_job "$JOB_ID" "$PHASE" "$EXEC_COMMAND" "$TIME_BUDGET_MIN"; then
        EXIT_CODE=0
    else
        EXIT_CODE=$?
    fi

    # Handle exit code
    handle_exit_code "$EXIT_CODE" "$JOB_ID" "$queue_file" "$CHECKPOINTABLE" "$RETRY_COUNT" "$MAX_RETRIES"

    # Always release lock
    release_lock "$JOB_ID"
}

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --loop-sleep)
                if [ -z "${2:-}" ]; then
                    echo "❌ ERROR: --loop-sleep requires an argument"
                    exit 1
                fi
                LOOP_SLEEP_SEC="$2"
                shift 2
                ;;
            --lock-ttl-hours)
                if [ -z "${2:-}" ]; then
                    echo "❌ ERROR: --lock-ttl-hours requires an argument"
                    exit 1
                fi
                LOCK_TTL_HOURS="$2"
                shift 2
                ;;
            -h|--help)
                usage
                ;;
            *)
                echo "❌ ERROR: Unknown option: $1"
                usage
                ;;
        esac
    done

    # Run preflight checks
    preflight_checks

    log_worker "Worker started (PID: $$)"
    log_worker "Loop sleep: ${LOOP_SLEEP_SEC}s"
    log_worker "Lock TTL: ${LOCK_TTL_HOURS}h"
    echo ""

    # Main loop
    while true; do
        log_worker "Scanning queue..."
        process_queue

        log_worker "Sleeping ${LOOP_SLEEP_SEC}s..."
        sleep "$LOOP_SLEEP_SEC"
    done
}

main "$@"
