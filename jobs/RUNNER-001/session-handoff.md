# RUNNER-001 Session Handoff

## Current Job State

**Job ID:** RUNNER-001
**Phase:** PLAN (completed)
**Next Phase:** IMPLEMENT
**Status:** ACTIVE
**Elevated:** Yes (ralph/ modifications allowed)

## What Was Completed

### Queue System Design
- ✅ Filesystem-backed queue under ralph/queue/
- ✅ Queue file format: JSON with queueId, jobId, phase, execCommand, timeBudgetMinutes, retryCount, maxRetries, checkpointable
- ✅ FIFO processing using timestamp-prefixed filenames
- ✅ Queue states: pending/ → processing/ → completed/ or failed/

### Lock Strategy
- ✅ Per-job locks at jobs/<JOB_ID>/tmp/worker.lock
- ✅ Lock format: JSON with pid, queueId, startedAt, hostname
- ✅ Stale lock detection via PID liveness check
- ✅ Lock acquisition/release protocol defined

### Worker Control Flow
- ✅ 9-step execution flow: Preflight → Scan → Parse → Validate → Lock → Execute → Handle Exit → Release → Loop
- ✅ Exit code handling:
  - 0 → Success → completed/
  - 1,2,3 → Failure → failed/ → NEEDS_REVIEW
  - 124 → Timeout → checkpoint or failed/
- ✅ Time budget enforcement with timeout command
- ✅ Per-job logging to jobs/<JOB_ID>/tmp/worker.log

### Enqueue Script Design
- ✅ CLI: ./ralph/enqueue.sh JOB-ID PHASE --exec "CMD" [OPTIONS]
- ✅ Options: --time-budget, --checkpointable, --max-retries
- ✅ Validation: job exists, phase valid, exec provided, no active lock

### Job Status Definitions
- ✅ ACTIVE: Worker may execute if enqueued
- ✅ DONE: Terminal, worker skips
- ✅ NEEDS_REVIEW: Requires human intervention, worker skips
- ✅ BLOCKED: Waiting on dependency, worker skips

### Safety Guarantees
- ✅ All execution through ralph/run.sh (no bypass)
- ✅ Worker refuses to run if run.sh unavailable
- ✅ Worker refuses to run if timeout unavailable
- ✅ Worker refuses to run if jq unavailable
- ✅ Stale locks detected and removed

## Immediate Next Action

**Resume with:** RUNNER-001 IMPLEMENT phase

**Implementation Tasks:**
1. Create ralph/enqueue.sh
   - Argument parsing with getopts or manual parsing
   - Validation: job exists, phase valid, exec provided
   - Queue file generation with all fields
   - User feedback and error messages

2. Create ralph/worker.sh
   - Preflight checks (run.sh, timeout, jq)
   - Main loop (infinite with sleep 10)
   - Queue scanning (oldest pending item)
   - Lock acquisition with stale lock detection
   - Execution with timeout wrapper
   - Exit code handling (case statement)
   - Lock release (trap for cleanup)
   - Logging to job-specific files

3. Create queue directory structure
   - mkdir -p ralph/queue/{pending,processing,completed,failed}

4. Test all scenarios from output/runner-design.md
   - Example 1: Successful execution
   - Example 2: Failure → NEEDS_REVIEW
   - Example 3: Timeout with checkpoint
   - Example 4: Concurrent lock prevention
   - Example 5: Stale lock detection

5. Update progress.md and session-handoff.md
6. Git commit IMPLEMENT checkpoint

## Files to Read First (Next Session)

**Priority order:**
1. `jobs/RUNNER-001/plan.md` — Complete specification
2. `jobs/RUNNER-001/output/runner-design.md` — Concrete examples
3. `jobs/RUNNERFIX-001/output/runner-usage.md` — How to use ralph/run.sh
4. `jobs/RUNNERFIX-001/output/limitations.md` — Known constraints
5. `ralph/run.sh` — Current executor implementation

## Hard Stop Conditions

**Do NOT implement:**
- ❌ Job dependencies (out of scope)
- ❌ Priority queue (FIFO only)
- ❌ Distributed workers (single worker only)
- ❌ Automatic retries as default (maxRetries=0 default)
- ❌ Job cancellation (out of scope)
- ❌ Worker health monitoring (out of scope)

**Do NOT bypass:**
- ❌ Never execute jobs without ralph/run.sh
- ❌ Never ignore ralph/run.sh exit codes
- ❌ Never widen write permissions beyond meta.json
- ❌ Never guess executor behavior if unavailable

## Success Criteria

**RUNNER-001 is complete when:**
- ✅ ralph/enqueue.sh can enqueue jobs with validation
- ✅ ralph/worker.sh processes queue in FIFO order
- ✅ Per-job locking prevents concurrent execution
- ✅ Time budget enforced with timeout wrapper
- ✅ Exit codes handled correctly (0=success, 1/2/3=failure, 124=timeout)
- ✅ Failed jobs marked NEEDS_REVIEW in meta.json
- ✅ Worker logs to jobs/<JOB_ID>/tmp/worker.log
- ✅ Worker refuses to run if ralph/run.sh unavailable
- ✅ Stale locks detected and removed
- ✅ All 5 examples from runner-design.md verified

## Next Job Guidance

After RUNNER-001 is complete:
- Background worker enables unattended job execution
- Future jobs can be enqueued and run automatically
- Consider jobs for:
  - Scheduled maintenance tasks
  - Background data processing
  - Automated testing workflows
  - Periodic synchronization tasks

**Prerequisite for automation:**
- Jobs must have correct meta.json with allowedPaths
- Jobs must have valid exec commands
- Jobs must be tested manually first before enqueueing
