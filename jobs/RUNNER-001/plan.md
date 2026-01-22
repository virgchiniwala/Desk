# RUNNER-001 Plan — Background Worker + Job Queue System

## Problem Statement

Ralph needs a background worker to run Desk jobs unattended. Currently, jobs require manual execution through ralph/run.sh. A queue system enables:
- Scheduled job execution without human intervention
- Safe, validated execution through ralph/run.sh enforcement
- Controlled concurrency with per-job locking
- Time-bounded execution with automatic checkpoint and re-queue
- Failure handling with NEEDS_REVIEW status

## Design Constraints (Non-Negotiable)

1. **Worker only runs explicitly enqueued jobs** — No automatic discovery
2. **One queue item = one job + one phase** — Single unit of work
3. **One phase per dequeue** — Worker executes one phase, then dequeues next item
4. **Per-job lock** — Prevents concurrent execution of same job
5. **Logs to jobs/<JOB_ID>/tmp/worker.log** — Per-job logging
6. **Time budget per run** — Configurable timeout with checkpoint and re-enqueue
7. **Non-zero exit from run.sh → NEEDS_REVIEW** — Worker stops processing that job
8. **Never widen write permissions** — Worker respects meta.json allowedPaths
9. **Never bypass run.sh enforcement** — All execution goes through ralph/run.sh
10. **Safe if executor unavailable** — Worker refuses to run, does not guess

## Queue Architecture

### Queue Directory Structure

```
ralph/
  queue/
    pending/       # Queued items waiting for execution
    processing/    # Items currently being processed (locked)
    completed/     # Successfully completed items (archive)
    failed/        # Failed items requiring review (archive)
  enqueue.sh       # Enqueue jobs into queue
  worker.sh        # Background worker loop
  run.sh           # Existing executor (no changes)
```

### Queue File Format

Queue items are JSON files: `ralph/queue/pending/<TIMESTAMP>-<JOB_ID>-<PHASE>.json`

**Structure:**
```json
{
  "queueId": "1737539200-MYWORK-001-IMPLEMENT",
  "jobId": "MYWORK-001",
  "phase": "IMPLEMENT",
  "execCommand": "echo 'work done' > output/result.txt",
  "enqueuedAt": "2026-01-22T10:00:00+08:00",
  "enqueuedBy": "user@host",
  "timeBudgetMinutes": 30,
  "retryCount": 0,
  "maxRetries": 0,
  "checkpointable": false
}
```

**Field Definitions:**
- **queueId**: Unique identifier (timestamp-jobId-phase)
- **jobId**: Target job ID (must exist in jobs/)
- **phase**: Target phase (RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE)
- **execCommand**: Command to pass to ralph/run.sh --exec
- **enqueuedAt**: ISO 8601 timestamp
- **enqueuedBy**: User@host who enqueued the item
- **timeBudgetMinutes**: Max execution time (default: 30)
- **retryCount**: Number of times this item has been retried (starts at 0)
- **maxRetries**: Max retry attempts (0 = no retries)
- **checkpointable**: If true, timeout causes checkpoint and re-enqueue

**Filename Convention:**
- Pending: `<UNIX_TIMESTAMP>-<JOB_ID>-<PHASE>.json`
- Processing: Same filename, moved to processing/
- Completed: Same filename, moved to completed/
- Failed: Same filename, moved to failed/

**FIFO Guarantee:**
- Files processed in lexicographic order (timestamp prefix ensures FIFO)
- Worker always picks oldest pending item

## Lock Strategy

### Per-Job Locking

**Lock File:** `jobs/<JOB_ID>/tmp/worker.lock`

**Lock Format:**
```json
{
  "pid": 12345,
  "queueId": "1737539200-MYWORK-001-IMPLEMENT",
  "startedAt": "2026-01-22T10:00:00+08:00",
  "hostname": "macbook-pro.local"
}
```

**Lock Acquisition:**
1. Check if `jobs/<JOB_ID>/tmp/worker.lock` exists
2. If exists, read lock file
3. Check if PID is still running: `ps -p <PID> > /dev/null 2>&1`
4. If PID dead, remove stale lock and acquire
5. If PID alive, skip this queue item (job already running)
6. If no lock, create lock file with current worker info
7. Move queue file from `pending/` to `processing/`

**Lock Release:**
1. Execute job phase through ralph/run.sh
2. Move queue file to `completed/` or `failed/`
3. Remove lock file: `rm jobs/<JOB_ID>/tmp/worker.lock`
4. Lock MUST be released even on failure

**Stale Lock Detection:**
- Worker checks PID liveness before respecting locks
- Dead PID → remove lock → retry acquisition
- Live PID → skip item → move to next in queue

## Worker Control Flow

### ralph/worker.sh — Main Loop

**High-Level Flow:**
```
START
  ↓
Check ralph/run.sh exists and is executable
  ↓
[LOOP]
  ↓
Scan ralph/queue/pending/ for oldest item (lexicographic sort)
  ↓
If no items: sleep 10 seconds, continue loop
  ↓
Parse queue item JSON
  ↓
Validate job exists (jobs/<JOB_ID>/)
  ↓
Try acquire lock (jobs/<JOB_ID>/tmp/worker.lock)
  ↓
If lock held by live PID: skip this item, continue loop
  ↓
If lock acquired:
  Move queue item to ralph/queue/processing/
  ↓
Execute job phase with timeout wrapper
  ↓
Handle exit code:
  0 → Success → Move to completed/
  1,2,3 → Failure → Move to failed/ → Update job status NEEDS_REVIEW
  124 → Timeout → Handle checkpoint logic
  ↓
Release lock (remove lock file)
  ↓
Continue loop
```

### Detailed Step-by-Step

**Step 1: Preflight Validation**
```bash
# Check executor exists
if [ ! -x "ralph/run.sh" ]; then
  echo "FATAL: ralph/run.sh not executable"
  exit 1
fi

# Check queue directory exists
mkdir -p ralph/queue/{pending,processing,completed,failed}
```

**Step 2: Scan Queue**
```bash
# Get oldest pending item (lexicographic sort)
QUEUE_FILE=$(ls -1 ralph/queue/pending/ 2>/dev/null | head -n1)

if [ -z "$QUEUE_FILE" ]; then
  sleep 10
  continue
fi
```

**Step 3: Parse Queue Item**
```bash
QUEUE_PATH="ralph/queue/pending/$QUEUE_FILE"
JOB_ID=$(jq -r '.jobId' "$QUEUE_PATH")
PHASE=$(jq -r '.phase' "$QUEUE_PATH")
EXEC_CMD=$(jq -r '.execCommand' "$QUEUE_PATH")
TIME_BUDGET=$(jq -r '.timeBudgetMinutes // 30' "$QUEUE_PATH")
CHECKPOINTABLE=$(jq -r '.checkpointable // false' "$QUEUE_PATH")
```

**Step 4: Validate Job**
```bash
if [ ! -d "jobs/$JOB_ID" ]; then
  echo "ERROR: Job not found: $JOB_ID"
  mv "$QUEUE_PATH" "ralph/queue/failed/"
  continue
fi
```

**Step 5: Acquire Lock**
```bash
LOCK_FILE="jobs/$JOB_ID/tmp/worker.lock"

# Check existing lock
if [ -f "$LOCK_FILE" ]; then
  LOCKED_PID=$(jq -r '.pid' "$LOCK_FILE")
  if ps -p "$LOCKED_PID" > /dev/null 2>&1; then
    # Lock held by live process, skip this item
    echo "Job $JOB_ID locked by PID $LOCKED_PID, skipping"
    continue
  else
    # Stale lock, remove it
    rm "$LOCK_FILE"
  fi
fi

# Acquire lock
cat > "$LOCK_FILE" <<EOF
{
  "pid": $$,
  "queueId": "$QUEUE_FILE",
  "startedAt": "$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")",
  "hostname": "$(hostname)"
}
EOF

# Move to processing
mv "$QUEUE_PATH" "ralph/queue/processing/"
QUEUE_PATH="ralph/queue/processing/$QUEUE_FILE"
```

**Step 6: Execute with Timeout**
```bash
LOG_FILE="jobs/$JOB_ID/tmp/worker.log"
TIME_LIMIT_SECONDS=$((TIME_BUDGET * 60))

# Log execution start
echo "[$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")] Starting $JOB_ID — $PHASE" >> "$LOG_FILE"

# Execute with timeout
timeout "$TIME_LIMIT_SECONDS" \
  ./ralph/run.sh "$JOB_ID" --phase "$PHASE" --exec "$EXEC_CMD" \
  >> "$LOG_FILE" 2>&1

EXIT_CODE=$?
```

**Step 7: Handle Exit Code**
```bash
case $EXIT_CODE in
  0)
    # Success
    echo "[$(date)] SUCCESS: $JOB_ID — $PHASE" >> "$LOG_FILE"
    mv "$QUEUE_PATH" "ralph/queue/completed/"
    ;;

  1|2|3)
    # Failure from ralph/run.sh
    echo "[$(date)] FAILED (exit $EXIT_CODE): $JOB_ID — $PHASE" >> "$LOG_FILE"
    mv "$QUEUE_PATH" "ralph/queue/failed/"

    # Mark job NEEDS_REVIEW
    jq '.status = "NEEDS_REVIEW"' "jobs/$JOB_ID/meta.json" > "jobs/$JOB_ID/meta.json.tmp"
    mv "jobs/$JOB_ID/meta.json.tmp" "jobs/$JOB_ID/meta.json"
    ;;

  124)
    # Timeout
    if [ "$CHECKPOINTABLE" = "true" ]; then
      # Checkpoint and re-enqueue
      echo "[$(date)] TIMEOUT (checkpointed): $JOB_ID — $PHASE" >> "$LOG_FILE"

      # Increment retry count
      jq '.retryCount += 1 | .enqueuedAt = now | .enqueuedBy = "worker-retry"' \
        "$QUEUE_PATH" > "$QUEUE_PATH.tmp"
      mv "$QUEUE_PATH.tmp" "ralph/queue/pending/$(date +%s)-$JOB_ID-$PHASE.json"
    else
      # Timeout is a failure
      echo "[$(date)] TIMEOUT (non-checkpointable): $JOB_ID — $PHASE" >> "$LOG_FILE"
      mv "$QUEUE_PATH" "ralph/queue/failed/"

      # Mark job NEEDS_REVIEW
      jq '.status = "NEEDS_REVIEW"' "jobs/$JOB_ID/meta.json" > "jobs/$JOB_ID/meta.json.tmp"
      mv "jobs/$JOB_ID/meta.json.tmp" "jobs/$JOB_ID/meta.json"
    fi
    ;;

  *)
    # Unknown error
    echo "[$(date)] UNKNOWN ERROR (exit $EXIT_CODE): $JOB_ID — $PHASE" >> "$LOG_FILE"
    mv "$QUEUE_PATH" "ralph/queue/failed/"

    jq '.status = "NEEDS_REVIEW"' "jobs/$JOB_ID/meta.json" > "jobs/$JOB_ID/meta.json.tmp"
    mv "jobs/$JOB_ID/meta.json.tmp" "jobs/$JOB_ID/meta.json"
    ;;
esac
```

**Step 8: Release Lock**
```bash
rm -f "$LOCK_FILE"
```

**Step 9: Continue Loop**
```bash
# Back to Step 2
```

## Enqueue Script

### ralph/enqueue.sh

**Usage:**
```bash
./ralph/enqueue.sh JOB-ID PHASE [OPTIONS]
```

**Options:**
- `--exec "COMMAND"` — Command to execute (required)
- `--time-budget MINUTES` — Max execution time (default: 30)
- `--checkpointable` — Allow checkpoint and re-enqueue on timeout
- `--max-retries N` — Max retry attempts (default: 0)

**Validation:**
1. Check job exists: `jobs/<JOB_ID>/`
2. Check phase is valid: RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE
3. Check exec command provided
4. Check no existing lock: `jobs/<JOB_ID>/tmp/worker.lock`

**Enqueue Logic:**
```bash
TIMESTAMP=$(date +%s)
QUEUE_ID="${TIMESTAMP}-${JOB_ID}-${PHASE}"
QUEUE_FILE="ralph/queue/pending/${QUEUE_ID}.json"

cat > "$QUEUE_FILE" <<EOF
{
  "queueId": "$QUEUE_ID",
  "jobId": "$JOB_ID",
  "phase": "$PHASE",
  "execCommand": "$EXEC_CMD",
  "enqueuedAt": "$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")",
  "enqueuedBy": "$(whoami)@$(hostname)",
  "timeBudgetMinutes": $TIME_BUDGET,
  "retryCount": 0,
  "maxRetries": $MAX_RETRIES,
  "checkpointable": $CHECKPOINTABLE
}
EOF

echo "✅ Enqueued: $QUEUE_ID"
echo "📍 Queue file: $QUEUE_FILE"
```

## Time Budget Behavior

**Purpose:** Prevent worker from hanging on long-running or infinite jobs

**Mechanism:**
- `timeout` command wraps ralph/run.sh execution
- Exit code 124 signals timeout
- Worker detects timeout via exit code

**Checkpoint Logic (if checkpointable=true):**
1. Timeout occurs → exit code 124
2. Worker increments retryCount in queue item
3. Worker re-enqueues to `ralph/queue/pending/` with new timestamp
4. Worker releases lock
5. Job will be picked up again in next loop iteration

**Non-Checkpointable Timeout:**
1. Timeout occurs → exit code 124
2. Worker moves queue item to `failed/`
3. Worker marks job `NEEDS_REVIEW` in meta.json
4. Worker releases lock
5. Job requires human intervention

**When to Use Checkpointable:**
- Long-running analysis tasks that can be interrupted
- Incremental data processing
- Multi-stage compilation

**When NOT to Use Checkpointable:**
- Atomic operations (database migrations)
- Git operations (may leave dirty state)
- Single-pass transformations

## Job Status Definitions

**Status Field in meta.json:**

### ACTIVE
- Job is in progress, not yet complete
- Worker may execute ACTIVE jobs
- Default status for new jobs

### DONE
- Job completed successfully
- Worker skips DONE jobs
- Terminal state (no further execution)

### NEEDS_REVIEW
- Job failed validation or execution
- Worker skips NEEDS_REVIEW jobs
- Requires human intervention before retry
- Set automatically when ralph/run.sh exits non-zero (1, 2, 3)

### BLOCKED
- Job waiting on external dependency
- Worker skips BLOCKED jobs
- Human must unblock (change status to ACTIVE)
- Not set automatically by worker

**Worker Behavior by Status:**
| Status | Worker Action |
|--------|---------------|
| ACTIVE | Execute if enqueued |
| DONE | Skip (terminal) |
| NEEDS_REVIEW | Skip (requires human) |
| BLOCKED | Skip (requires human) |

**Status Transitions:**
```
ACTIVE → DONE (success)
ACTIVE → NEEDS_REVIEW (failure)
BLOCKED → ACTIVE (human unblocks)
NEEDS_REVIEW → ACTIVE (human fixes and resets)
```

## Stop Conditions for Worker

**Worker MUST refuse to run if:**

1. **ralph/run.sh not executable**
   - Check: `[ -x ralph/run.sh ]`
   - Action: Exit worker with error

2. **ralph/run.sh missing**
   - Check: `[ -f ralph/run.sh ]`
   - Action: Exit worker with error

3. **Queue directory inaccessible**
   - Check: `[ -d ralph/queue ]`
   - Action: Create if missing, exit if creation fails

4. **Job directory missing after dequeue**
   - Check: `[ -d jobs/<JOB_ID> ]`
   - Action: Move queue item to failed/, continue loop

5. **Lock file cannot be created**
   - Check: Write to `jobs/<JOB_ID>/tmp/worker.lock`
   - Action: Skip this item, continue loop

6. **Timeout command unavailable**
   - Check: `command -v timeout`
   - Action: Exit worker with error (cannot enforce time budget)

7. **jq unavailable**
   - Check: `command -v jq`
   - Action: Exit worker with error (cannot parse queue items)

## Retry Rules

**Default:** No automatic retries (maxRetries=0)

**Retry Logic (if maxRetries > 0):**
1. Worker checks `retryCount < maxRetries`
2. On failure (exit 1,2,3), increment retryCount
3. If retryCount < maxRetries, re-enqueue to pending/
4. If retryCount >= maxRetries, move to failed/ and mark NEEDS_REVIEW

**Retry Scenarios:**

**Transient Failures (safe to retry):**
- Network timeouts
- Temporary resource unavailability
- Recoverable execution errors

**Non-Retryable Failures (mark NEEDS_REVIEW):**
- Validation failures (exit 1) — Bad configuration
- Permission denied (exit 2) — Security violation
- Exec command failed (exit 3) — Logic error

**Recommendation:** Set maxRetries=0 for most jobs. Retries should be explicit, not automatic.

## Implementation Checklist

**Phase: IMPLEMENT**

1. **Create ralph/enqueue.sh**
   - Argument parsing (JOB-ID, PHASE, --exec, options)
   - Validation (job exists, phase valid, exec provided)
   - Queue file generation (JSON with all fields)
   - FIFO guarantee (timestamp prefix)

2. **Create ralph/worker.sh**
   - Preflight validation (run.sh exists, queue dirs exist)
   - Main loop (infinite loop with sleep)
   - Queue scanning (oldest pending item)
   - Lock acquisition (stale lock detection)
   - Execution with timeout wrapper
   - Exit code handling (0/1/2/3/124/other)
   - Lock release (always, even on failure)
   - Logging (append to jobs/<JOB_ID>/tmp/worker.log)

3. **Create ralph/queue/ directory structure**
   - mkdir -p ralph/queue/{pending,processing,completed,failed}

4. **Test Cases**
   - Enqueue valid job → worker picks up → success
   - Enqueue valid job → worker picks up → exec fails → NEEDS_REVIEW
   - Enqueue job with timeout → checkpoint → re-enqueue
   - Enqueue two instances of same job → second waits for lock
   - Worker detects stale lock → removes → acquires

5. **Documentation**
   - Update RUNNERFIX-001 session-handoff with worker usage
   - Create examples in output/runner-design.md

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
- ✅ All execution goes through ralph/run.sh (no bypass)

**Not Required for RUNNER-001:**
- Job dependencies (out of scope)
- Priority queue (FIFO only)
- Distributed workers (single worker only)
- Automatic retry (manual re-enqueue only, unless maxRetries > 0)
- Job cancellation (out of scope)
- Worker health monitoring (out of scope)
- Queue inspection CLI (nice-to-have, not required)
