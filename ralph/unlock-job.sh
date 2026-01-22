#!/usr/bin/env bash
set -euo pipefail

# unlock-job.sh - Manually remove worker lock for a job
# Usage: ./ralph/unlock-job.sh <JOB_ID>

usage() {
    echo "Usage: $0 JOB-ID"
    echo ""
    echo "Manually removes the worker lock for a job."
    echo "Use this to recover from stuck or crashed worker processes."
    echo ""
    echo "⚠️  WARNING: Only use this if you're sure no worker is processing the job."
    exit 1
}

main() {
    if [ $# -ne 1 ]; then
        usage
    fi

    JOB_ID="$1"
    LOCK_FILE="jobs/$JOB_ID/tmp/worker.lock"

    # Check job exists
    if [ ! -d "jobs/$JOB_ID" ]; then
        echo "❌ ERROR: Job directory not found: jobs/$JOB_ID"
        exit 1
    fi

    # Check if lock exists
    if [ ! -f "$LOCK_FILE" ]; then
        echo "✅ No lock file found for $JOB_ID"
        echo "Lock file: $LOCK_FILE"
        exit 0
    fi

    # Show lock info
    echo "Lock file found: $LOCK_FILE"
    echo ""
    echo "Lock contents:"
    cat "$LOCK_FILE"
    echo ""

    # Confirm removal
    read -p "⚠️  Remove this lock? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted"
        exit 0
    fi

    # Remove lock
    rm -f "$LOCK_FILE"
    echo "✅ Lock removed for $JOB_ID"
    echo ""
    echo "The job can now be processed by the worker."
}

main "$@"
