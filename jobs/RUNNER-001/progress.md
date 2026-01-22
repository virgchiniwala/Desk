# RUNNER-001 Progress

## Current Phase: PLAN
**Status:** DONE ✅

## Phase History

### PLAN — 2026-01-22
**Status:** DONE ✅

**Completed:**
- ✅ Created job structure: `/jobs/RUNNER-001/{inputs,output,tmp}/`
- ✅ Created `meta.json` with ELEVATED permissions for ralph/ modifications
- ✅ Created detailed `plan.md` with:
  - Problem statement (need for background worker automation)
  - Complete queue architecture (filesystem-backed under ralph/queue/)
  - Queue file format (JSON with all required fields)
  - Lock strategy (per-job locking with stale lock detection)
  - Worker control flow (step-by-step execution logic)
  - Time budget behavior (checkpoint and re-enqueue)
  - Exit code handling (0/1/2/3/124 with appropriate actions)
  - Enqueue script specification (ralph/enqueue.sh)
  - Job status definitions (ACTIVE/DONE/NEEDS_REVIEW/BLOCKED)
  - Stop conditions for worker (10 safety checks)
  - Retry rules (default: no retries, optional maxRetries)
  - Implementation checklist
  - Success criteria
- ✅ Created `output/runner-design.md` with:
  - Example 1: Successful job execution (enqueue → execute → commit → completed/)
  - Example 2: Failure → NEEDS_REVIEW (exec fails → failed/ → human intervention)
  - Example 3: Timeout with checkpoint (re-enqueue with incremented retryCount)
  - Example 4: Concurrent lock prevention (second job waits for first)
  - Example 5: Stale lock detection (dead PID → remove lock → acquire)
  - System diagram showing complete workflow
- ✅ Created `progress.md` (this file)
- ✅ Created `session-handoff.md`

**Key Specifications:**
- **Queue Format**: JSON files in ralph/queue/pending/ with timestamp prefix for FIFO
- **Lock Strategy**: Per-job locks at jobs/<JOB_ID>/tmp/worker.lock with PID liveness checks
- **Worker Loop**: Scan → Parse → Validate → Lock → Execute → Handle Exit → Release
- **Time Budget**: Configurable timeout with exit code 124, checkpoint support
- **Exit Code Mapping**:
  - 0 → Success → completed/
  - 1,2,3 → Failure → failed/ → NEEDS_REVIEW
  - 124 → Timeout → checkpoint (if enabled) or failed/
- **Safety Guarantees**:
  - All execution through ralph/run.sh (no bypass)
  - Worker refuses to run if run.sh unavailable
  - Stale locks detected and removed
  - Per-job logging to jobs/<JOB_ID>/tmp/worker.log

**Next Steps:**
→ Commit PLAN checkpoint
→ Ready for IMPLEMENT phase

---

## Next Phase: IMPLEMENT

**Planned Actions:**
1. Create ralph/enqueue.sh script
   - Argument parsing (JOB-ID, PHASE, --exec, options)
   - Validation (job exists, phase valid, exec provided)
   - Queue file generation with all required fields
   - Error handling and user feedback

2. Create ralph/worker.sh script
   - Preflight validation (run.sh exists, timeout available, jq available)
   - Main loop with queue scanning
   - Lock acquisition with stale lock detection
   - Execution with timeout wrapper
   - Exit code handling (0/1/2/3/124/other)
   - Lock release (always, even on failure)
   - Logging to job-specific log files

3. Create ralph/queue/ directory structure
   - mkdir -p ralph/queue/{pending,processing,completed,failed}

4. Test comprehensive scenarios
   - Enqueue and execute successful job
   - Enqueue and handle failed job
   - Test timeout with checkpoint
   - Test concurrent lock prevention
   - Test stale lock detection

5. Update documentation
   - Update session-handoff.md with next job guidance
   - Verify all examples work as documented

**Success Criteria:**
- ✅ ralph/enqueue.sh validates and creates queue items
- ✅ ralph/worker.sh processes queue in FIFO order
- ✅ Per-job locking prevents concurrent execution
- ✅ Time budget enforced correctly
- ✅ Exit codes handled as specified
- ✅ Failed jobs marked NEEDS_REVIEW
- ✅ Stale locks detected and removed
- ✅ All tests pass
