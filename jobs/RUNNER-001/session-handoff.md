# RUNNER-001 Session Handoff

## Current Job State

**Job ID:** RUNNER-001
**Phase:** IMPLEMENT (completed)
**Next Phase:** VERIFY
**Status:** ACTIVE
**Elevated:** Yes (ralph/ modifications allowed)

## What Was Completed

### PLAN Phase
**Queue System Design**
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

**Safety Guarantees**
- ✅ All execution through ralph/run.sh (no bypass)
- ✅ Worker refuses to run if run.sh unavailable
- ✅ Worker refuses to run if timeout unavailable
- ✅ Stale locks detected and removed via TTL

### IMPLEMENT Phase
**Scripts Created**
- ✅ ralph/enqueue.sh - Enqueue jobs with bash-only dependencies
- ✅ ralph/worker.sh - Background worker with lock TTL
- ✅ ralph/unlock-job.sh - Manual lock removal tool
- ✅ ralph/queue/{pending,processing,completed,failed}/ - Queue directories

**Key Implementation Details**
- **Queue Format**: Bash-parseable KEY=VALUE (no jq dependency)
- **Lock Strategy**: TTL-based (2 hours default) instead of PID checks
- **Exit Codes**: 0=success, 1/2/3=failure→NEEDS_REVIEW, 124=timeout
- **Logging**: Per-job logs at jobs/<JOB_ID>/tmp/worker.log
- **Retry**: Configurable with --retries flag
- **Checkpoint**: Re-enqueue on timeout with --checkpointable

**Verification Complete**
- ✅ All scripts pass bash -n syntax validation
- ✅ Dry-run enqueue test successful
- ✅ Queue file format verified (bash source-able)

## Immediate Next Action

**Resume with:** RUNNER-001 VERIFY phase

**Verification Tasks:**
1. Test successful job execution
   - Enqueue test job with simple command
   - Start worker in tmux session
   - Verify job completes and moves to completed/
   - Check worker.log for correct logging

2. Test failure handling
   - Enqueue job with failing command (exit 1)
   - Verify job moves to failed/
   - Verify meta.json marked NEEDS_REVIEW

3. Test timeout behavior
   - Enqueue job with long sleep (exceeds time budget)
   - Test checkpointable: verify re-enqueue
   - Test non-checkpointable: verify failed/ + NEEDS_REVIEW

4. Test lock TTL
   - Create artificial lock file with old timestamp
   - Verify worker detects and removes stale lock

5. Test manual unlock
   - Create lock manually
   - Run unlock-job.sh
   - Verify confirmation prompt and removal

6. Update progress.md and session-handoff.md with test results
7. Git commit VERIFY checkpoint

## Files to Read First (Next Session)

**Priority order:**
1. `ralph/enqueue.sh` — Enqueue script implementation
2. `ralph/worker.sh` — Worker loop implementation
3. `ralph/unlock-job.sh` — Manual unlock tool
4. `jobs/RUNNER-001/plan.md` — Original specification
5. `jobs/RUNNER-001/output/runner-design.md` — Test scenarios

## How to Use

**Start Worker (tmux):**
```bash
cd /Users/virchiniwala/desk
tmux new-session -s ralph-worker
./ralph/worker.sh  # Runs forever, Ctrl+B D to detach
```

**Enqueue Jobs:**
```bash
./ralph/enqueue.sh JOB-ID PHASE --exec "CMD" [OPTIONS]

# Options:
#   --time-min N       Time budget in minutes (default: 30)
#   --retries N        Max retries on failure (default: 0)
#   --checkpointable   Re-enqueue on timeout (default: false)
```

**Monitor:**
```bash
tmux attach -t ralph-worker         # View worker stdout
tail -f jobs/JOB-ID/tmp/worker.log # View job-specific log
ls ralph/queue/*/                   # Check queue states
```

**Recover from Stuck Lock:**
```bash
./ralph/unlock-job.sh JOB-ID
```

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

**RUNNER-001 IMPLEMENT Phase Complete:**
- ✅ ralph/enqueue.sh can enqueue jobs with validation
- ✅ ralph/worker.sh implements background processing loop
- ✅ ralph/unlock-job.sh provides manual lock recovery
- ✅ Queue directories created and committed
- ✅ All scripts pass bash -n validation
- ✅ Dry-run test successful

**RUNNER-001 VERIFY Phase (Next):**
- ⏳ Worker processes queue in FIFO order
- ⏳ Per-job locking prevents concurrent execution
- ⏳ Time budget enforced with timeout wrapper
- ⏳ Exit codes handled correctly (0=success, 1/2/3=failure, 124=timeout)
- ⏳ Failed jobs marked NEEDS_REVIEW in meta.json
- ⏳ Worker logs to jobs/<JOB_ID>/tmp/worker.log
- ⏳ Worker refuses to run if ralph/run.sh unavailable
- ⏳ Stale locks detected via TTL and removed

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
