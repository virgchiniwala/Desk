#!/usr/bin/env bash
set -euo pipefail

# new-job.sh - Create new Desk job with proper structure
# Usage: ./ralph/new-job.sh JOB-ID [title]

usage() {
    echo "Usage: $0 JOB-ID [title]"
    echo "  JOB-ID: Format PROJECT-NNN (e.g., BOOTSTRAP-001)"
    echo "  title: Optional job title"
    exit 1
}

validate_job_id() {
    local job_id="$1"
    if ! [[ "$job_id" =~ ^[A-Z]+-[0-9]{3}$ ]]; then
        echo "ERROR: Invalid job ID format. Expected PROJECT-NNN (e.g., BOOTSTRAP-001)"
        exit 1
    fi
}

main() {
    if [ $# -lt 1 ]; then
        usage
    fi

    local job_id="$1"
    local title="${2:-Untitled Job}"
    local job_dir="jobs/$job_id"

    validate_job_id "$job_id"

    # Check uniqueness
    if [ -d "$job_dir" ]; then
        echo "ERROR: Job $job_id already exists at $job_dir"
        exit 1
    fi

    # Create structure
    echo "Creating job $job_id..."
    mkdir -p "$job_dir"/{inputs,output,tmp}

    # Generate meta.json
    cat > "$job_dir/meta.json" <<EOF
{
  "jobId": "$job_id",
  "title": "$title",
  "phase": "RESEARCH",
  "status": "PENDING",
  "elevated": false,
  "allowedPaths": [
    "jobs/$job_id/"
  ],
  "created": "$(date +%Y-%m-%d)",
  "description": ""
}
EOF

    # Generate plan.md
    cat > "$job_dir/plan.md" <<EOF
# $job_id Plan

## Phase: RESEARCH

TODO: Add research findings and implementation plan

## Phase: PLAN

TODO: Add detailed implementation steps

## Phase: IMPLEMENT

TODO: Add implementation details

## Acceptance Criteria

TODO: Define success criteria
EOF

    # Generate progress.md
    cat > "$job_dir/progress.md" <<EOF
# $job_id Progress

## Current Phase: RESEARCH
**Status:** PENDING

## Phase History

### RESEARCH — $(date +%Y-%m-%d)
**Status:** PENDING

**Next Steps:**
TODO: Document next steps
EOF

    # Generate session-handoff.md
    cat > "$job_dir/session-handoff.md" <<EOF
# $job_id Session Handoff

## Job Context
**Job ID:** $job_id
**Title:** $title
**Current Phase:** RESEARCH
**Status:** PENDING

## What Was Done

TODO: Document completed work

## What's Next

TODO: Document next steps

## Ambiguities / Decisions Needed

TODO: Document open questions
EOF

    echo "✅ Job $job_id created at $job_dir"
    echo "📁 Structure: inputs/, output/, tmp/"
    echo "📄 Artifacts: meta.json, plan.md, progress.md, session-handoff.md"
}

main "$@"
