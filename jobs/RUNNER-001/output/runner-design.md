# RUNNER-001 Design Examples

## Example 1: Successful Job Execution

### Setup: Create Test Job

```bash
mkdir -p jobs/DEMO-WORK-001/{inputs,output,tmp}
cat > jobs/DEMO-WORK-001/meta.json <<'EOF'
{
  "jobId": "DEMO-WORK-001",
  "title": "Demo Work Task",
  "phase": "IMPLEMENT",
  "status": "ACTIVE",
  "elevated": false,
  "allowedPaths": ["jobs/DEMO-WORK-001/"],
  "created": "2026-01-22"
}
EOF
touch jobs/DEMO-WORK-001/{plan.md,progress.md,session-handoff.md}
git add jobs/DEMO-WORK-001
git commit -m "Test: Create DEMO-WORK-001 job"
```

### Step 1: Enqueue Job

```bash
./ralph/enqueue.sh DEMO-WORK-001 IMPLEMENT \
  --exec "echo 'Task completed' > output/result.txt" \
  --time-budget 5
```

**Output:**
```
✅ Job exists: DEMO-WORK-001
✅ Phase valid: IMPLEMENT
✅ No active lock found
✅ Enqueued: 1737539200-DEMO-WORK-001-IMPLEMENT
📍 Queue file: ralph/queue/pending/1737539200-DEMO-WORK-001-IMPLEMENT.json
```

**Queue File Contents:**
```json
{
  "queueId": "1737539200-DEMO-WORK-001-IMPLEMENT",
  "jobId": "DEMO-WORK-001",
  "phase": "IMPLEMENT",
  "execCommand": "echo 'Task completed' > output/result.txt",
  "enqueuedAt": "2026-01-22T02:00:00+00:00",
  "enqueuedBy": "user@macbook-pro.local",
  "timeBudgetMinutes": 5,
  "retryCount": 0,
  "maxRetries": 0,
  "checkpointable": false
}
```

### Step 2: Worker Picks Up Item

**Worker Log (stdout):**
```
[2026-01-22T02:00:05+00:00] Worker started (PID: 23456)
[2026-01-22T02:00:05+00:00] Scanning queue...
[2026-01-22T02:00:05+00:00] Found: 1737539200-DEMO-WORK-001-IMPLEMENT.json
[2026-01-22T02:00:05+00:00] Acquiring lock for DEMO-WORK-001...
[2026-01-22T02:00:05+00:00] Lock acquired (PID: 23456)
[2026-01-22T02:00:05+00:00] Executing DEMO-WORK-001 — IMPLEMENT
```

**Lock File Created:**
`jobs/DEMO-WORK-001/tmp/worker.lock`
```json
{
  "pid": 23456,
  "queueId": "1737539200-DEMO-WORK-001-IMPLEMENT",
  "startedAt": "2026-01-22T02:00:05+00:00",
  "hostname": "macbook-pro.local"
}
```

**Queue File Moved:**
- From: `ralph/queue/pending/1737539200-DEMO-WORK-001-IMPLEMENT.json`
- To: `ralph/queue/processing/1737539200-DEMO-WORK-001-IMPLEMENT.json`

### Step 3: ralph/run.sh Executes

**Worker invokes:**
```bash
timeout 300 ./ralph/run.sh DEMO-WORK-001 --phase IMPLEMENT \
  --exec "echo 'Task completed' > output/result.txt" \
  >> jobs/DEMO-WORK-001/tmp/worker.log 2>&1
```

**ralph/run.sh Output (in worker.log):**
```
🚀 Running DEMO-WORK-001 — Phase: IMPLEMENT
📂 Allowed write paths:
  - jobs/DEMO-WORK-001/

✅ Preflight validation complete

🔄 Executing in jobs/DEMO-WORK-001: echo 'Task completed' > output/result.txt
✅ Exec completed successfully

🔍 Checking for unauthorized writes...
✅ All writes within allowed paths

📝 Committing changes...
[main f1a2b3c] Desk: DEMO-WORK-001 — IMPLEMENT — checkpoint
 2 files changed, 2 insertions(+)

✅ Phase IMPLEMENT complete for DEMO-WORK-001
```

**Exit Code:** 0

### Step 4: Worker Handles Success

**Worker Log (stdout):**
```
[2026-01-22T02:00:08+00:00] SUCCESS: DEMO-WORK-001 — IMPLEMENT (exit 0)
[2026-01-22T02:00:08+00:00] Moving to completed/
[2026-01-22T02:00:08+00:00] Releasing lock
[2026-01-22T02:00:08+00:00] Scanning queue...
```

**Queue File Moved:**
- From: `ralph/queue/processing/1737539200-DEMO-WORK-001-IMPLEMENT.json`
- To: `ralph/queue/completed/1737539200-DEMO-WORK-001-IMPLEMENT.json`

**Lock File Removed:**
`jobs/DEMO-WORK-001/tmp/worker.lock` deleted

**Git Commit Created:**
```bash
$ git log --oneline -1
f1a2b3c Desk: DEMO-WORK-001 — IMPLEMENT — checkpoint
```

**Files Created:**
- `jobs/DEMO-WORK-001/output/result.txt` (contains "Task completed")
- `jobs/DEMO-WORK-001/meta.json` (phase updated to IMPLEMENT)

---

## Example 2: Failure → NEEDS_REVIEW

### Setup: Job with Invalid Command

```bash
./ralph/enqueue.sh DEMO-WORK-001 REVIEW \
  --exec "exit 1" \
  --time-budget 5
```

**Output:**
```
✅ Enqueued: 1737539300-DEMO-WORK-001-REVIEW
📍 Queue file: ralph/queue/pending/1737539300-DEMO-WORK-001-REVIEW.json
```

### Worker Picks Up Item

**Worker Log (stdout):**
```
[2026-01-22T02:01:40+00:00] Scanning queue...
[2026-01-22T02:01:40+00:00] Found: 1737539300-DEMO-WORK-001-REVIEW.json
[2026-01-22T02:01:40+00:00] Acquiring lock for DEMO-WORK-001...
[2026-01-22T02:01:40+00:00] Lock acquired (PID: 23456)
[2026-01-22T02:01:40+00:00] Executing DEMO-WORK-001 — REVIEW
```

### ralph/run.sh Executes and Fails

**ralph/run.sh Output (in worker.log):**
```
🚀 Running DEMO-WORK-001 — Phase: REVIEW
📂 Allowed write paths:
  - jobs/DEMO-WORK-001/

✅ Preflight validation complete

🔄 Executing in jobs/DEMO-WORK-001: exit 1

❌ Exec failed with exit code 1

ERROR: Exec command failed
Skipping postflight and commit
```

**Exit Code:** 3 (exec command failed)

### Worker Handles Failure

**Worker Log (stdout):**
```
[2026-01-22T02:01:41+00:00] FAILED: DEMO-WORK-001 — REVIEW (exit 3)
[2026-01-22T02:01:41+00:00] Marking job NEEDS_REVIEW
[2026-01-22T02:01:41+00:00] Moving to failed/
[2026-01-22T02:01:41+00:00] Releasing lock
[2026-01-22T02:01:41+00:00] Scanning queue...
```

**Queue File Moved:**
- From: `ralph/queue/processing/1737539300-DEMO-WORK-001-REVIEW.json`
- To: `ralph/queue/failed/1737539300-DEMO-WORK-001-REVIEW.json`

**Lock File Removed:**
`jobs/DEMO-WORK-001/tmp/worker.lock` deleted

**meta.json Updated:**
```json
{
  "jobId": "DEMO-WORK-001",
  "title": "Demo Work Task",
  "phase": "REVIEW",
  "status": "NEEDS_REVIEW",
  "elevated": false,
  "allowedPaths": ["jobs/DEMO-WORK-001/"],
  "created": "2026-01-22"
}
```

**No Git Commit Created:**
- ralph/run.sh failed, so no commit was made
- Job state changed to NEEDS_REVIEW
- Worker will skip this job in future queue scans

### Recovery: Human Intervention

**Human reviews worker.log:**
```bash
$ cat jobs/DEMO-WORK-001/tmp/worker.log
[2026-01-22T02:01:40+00:00] Starting DEMO-WORK-001 — REVIEW
🚀 Running DEMO-WORK-001 — Phase: REVIEW
...
❌ Exec failed with exit code 1
ERROR: Exec command failed
```

**Human fixes issue and resets status:**
```bash
# Fix the exec command (correct the job plan)
# Reset status to ACTIVE
jq '.status = "ACTIVE"' jobs/DEMO-WORK-001/meta.json > jobs/DEMO-WORK-001/meta.json.tmp
mv jobs/DEMO-WORK-001/meta.json.tmp jobs/DEMO-WORK-001/meta.json

# Re-enqueue with corrected command
./ralph/enqueue.sh DEMO-WORK-001 REVIEW \
  --exec "echo 'review complete' > output/review.txt" \
  --time-budget 5
```

**Worker will now process the corrected job.**

---

## Example 3: Timeout with Checkpoint

### Setup: Long-Running Job

```bash
./ralph/enqueue.sh DEMO-WORK-001 PACKAGE \
  --exec "sleep 600 && echo 'done' > output/package.txt" \
  --time-budget 1 \
  --checkpointable
```

**Queue File:**
```json
{
  "queueId": "1737539400-DEMO-WORK-001-PACKAGE",
  "jobId": "DEMO-WORK-001",
  "phase": "PACKAGE",
  "execCommand": "sleep 600 && echo 'done' > output/package.txt",
  "enqueuedAt": "2026-01-22T02:03:20+00:00",
  "enqueuedBy": "user@macbook-pro.local",
  "timeBudgetMinutes": 1,
  "retryCount": 0,
  "maxRetries": 0,
  "checkpointable": true
}
```

### Worker Executes with Timeout

**Worker Log (stdout):**
```
[2026-01-22T02:03:25+00:00] Scanning queue...
[2026-01-22T02:03:25+00:00] Found: 1737539400-DEMO-WORK-001-PACKAGE.json
[2026-01-22T02:03:25+00:00] Acquiring lock for DEMO-WORK-001...
[2026-01-22T02:03:25+00:00] Lock acquired (PID: 23456)
[2026-01-22T02:03:25+00:00] Executing DEMO-WORK-001 — PACKAGE (time budget: 60s)
```

**After 60 seconds, timeout kills process:**

**Worker Log (stdout):**
```
[2026-01-22T02:04:25+00:00] TIMEOUT: DEMO-WORK-001 — PACKAGE (exit 124)
[2026-01-22T02:04:25+00:00] Job is checkpointable, re-enqueueing
[2026-01-22T02:04:25+00:00] Releasing lock
[2026-01-22T02:04:25+00:00] Scanning queue...
```

**Queue File Re-enqueued:**
- Moved from: `ralph/queue/processing/1737539400-DEMO-WORK-001-PACKAGE.json`
- To: `ralph/queue/pending/1737539465-DEMO-WORK-001-PACKAGE.json` (new timestamp)

**Updated Queue File:**
```json
{
  "queueId": "1737539465-DEMO-WORK-001-PACKAGE",
  "jobId": "DEMO-WORK-001",
  "phase": "PACKAGE",
  "execCommand": "sleep 600 && echo 'done' > output/package.txt",
  "enqueuedAt": "2026-01-22T02:04:25+00:00",
  "enqueuedBy": "worker-retry",
  "timeBudgetMinutes": 1,
  "retryCount": 1,
  "maxRetries": 0,
  "checkpointable": true
}
```

**Lock File Removed:**
`jobs/DEMO-WORK-001/tmp/worker.lock` deleted

**Job Status Unchanged:**
- status remains ACTIVE
- Job will be retried in next worker loop

---

## Example 4: Concurrent Lock Prevention

### Setup: Two Enqueues for Same Job

**Terminal 1:**
```bash
./ralph/enqueue.sh DEMO-WORK-001 IMPLEMENT \
  --exec "sleep 30 && echo 'first' > output/first.txt" \
  --time-budget 5
```

**Terminal 2 (1 second later):**
```bash
./ralph/enqueue.sh DEMO-WORK-001 IMPLEMENT \
  --exec "echo 'second' > output/second.txt" \
  --time-budget 5
```

**Result:**
Two queue items created:
- `ralph/queue/pending/1737539500-DEMO-WORK-001-IMPLEMENT.json` (first)
- `ralph/queue/pending/1737539501-DEMO-WORK-001-IMPLEMENT.json` (second)

### Worker Processes First Item

**Worker Log (stdout):**
```
[2026-01-22T02:05:00+00:00] Scanning queue...
[2026-01-22T02:05:00+00:00] Found: 1737539500-DEMO-WORK-001-IMPLEMENT.json
[2026-01-22T02:05:00+00:00] Acquiring lock for DEMO-WORK-001...
[2026-01-22T02:05:00+00:00] Lock acquired (PID: 23456)
[2026-01-22T02:05:00+00:00] Executing DEMO-WORK-001 — IMPLEMENT
```

**Lock File Created:**
`jobs/DEMO-WORK-001/tmp/worker.lock` with PID 23456

### Worker Encounters Second Item (Locked)

**Worker continues loop, scans queue again:**
```
[2026-01-22T02:05:10+00:00] Scanning queue...
[2026-01-22T02:05:10+00:00] Found: 1737539501-DEMO-WORK-001-IMPLEMENT.json
[2026-01-22T02:05:10+00:00] Acquiring lock for DEMO-WORK-001...
[2026-01-22T02:05:10+00:00] Job DEMO-WORK-001 locked by PID 23456 (live), skipping
[2026-01-22T02:05:10+00:00] Sleeping 10s...
```

**Second item remains in `pending/` queue.**

### First Item Completes

**Worker Log (stdout):**
```
[2026-01-22T02:05:30+00:00] SUCCESS: DEMO-WORK-001 — IMPLEMENT (exit 0)
[2026-01-22T02:05:30+00:00] Moving to completed/
[2026-01-22T02:05:30+00:00] Releasing lock
[2026-01-22T02:05:30+00:00] Scanning queue...
[2026-01-22T02:05:30+00:00] Found: 1737539501-DEMO-WORK-001-IMPLEMENT.json
[2026-01-22T02:05:30+00:00] Acquiring lock for DEMO-WORK-001...
[2026-01-22T02:05:30+00:00] Lock acquired (PID: 23456)
[2026-01-22T02:05:30+00:00] Executing DEMO-WORK-001 — IMPLEMENT
```

**Second item now processes successfully.**

---

## Example 5: Stale Lock Detection

### Setup: Worker Crashes Mid-Execution

**Scenario:**
1. Worker starts job DEMO-WORK-001
2. Creates lock with PID 23456
3. Worker process killed: `kill -9 23456`
4. Lock file remains: `jobs/DEMO-WORK-001/tmp/worker.lock`

**Orphaned Lock File:**
```json
{
  "pid": 23456,
  "queueId": "1737539600-DEMO-WORK-001-IMPLEMENT",
  "startedAt": "2026-01-22T02:06:40+00:00",
  "hostname": "macbook-pro.local"
}
```

### New Worker Starts

**Worker Log (stdout):**
```
[2026-01-22T02:07:00+00:00] Worker started (PID: 24567)
[2026-01-22T02:07:00+00:00] Scanning queue...
[2026-01-22T02:07:00+00:00] Found: 1737539601-DEMO-WORK-001-IMPLEMENT.json
[2026-01-22T02:07:00+00:00] Acquiring lock for DEMO-WORK-001...
[2026-01-22T02:07:00+00:00] Lock file exists (PID: 23456)
[2026-01-22T02:07:00+00:00] Checking if PID 23456 is alive...
[2026-01-22T02:07:00+00:00] PID 23456 is dead (stale lock)
[2026-01-22T02:07:00+00:00] Removing stale lock
[2026-01-22T02:07:00+00:00] Lock acquired (PID: 24567)
[2026-01-22T02:07:00+00:00] Executing DEMO-WORK-001 — IMPLEMENT
```

**Stale lock removed, new lock created, job proceeds.**

---

## System Diagram

```
┌──────────────────────────────────────────────────────┐
│                    User Interaction                  │
└────────────┬─────────────────────────────────────────┘
             │
             │ ./ralph/enqueue.sh JOB-ID PHASE --exec "CMD"
             ↓
┌──────────────────────────────────────────────────────┐
│              ralph/queue/pending/                    │
│   1737539200-JOB-ID-PHASE.json (FIFO)                │
└────────────┬─────────────────────────────────────────┘
             │
             │ Worker scans (oldest first)
             ↓
┌──────────────────────────────────────────────────────┐
│              Worker Lock Acquisition                 │
│   - Check jobs/JOB-ID/tmp/worker.lock                │
│   - Detect stale locks (dead PID)                    │
│   - Skip if live PID holds lock                      │
└────────────┬─────────────────────────────────────────┘
             │
             │ Lock acquired
             ↓
┌──────────────────────────────────────────────────────┐
│           ralph/queue/processing/                    │
│   Queue item moved from pending/                     │
└────────────┬─────────────────────────────────────────┘
             │
             │ timeout <seconds> ./ralph/run.sh --exec
             ↓
┌──────────────────────────────────────────────────────┐
│                  ralph/run.sh                        │
│   - Preflight validation                             │
│   - Execute command in jobs/JOB-ID/                  │
│   - Postflight validation                            │
│   - Git commit (if success)                          │
└────────────┬─────────────────────────────────────────┘
             │
             │ Exit code: 0, 1, 2, 3, or 124
             ↓
     ┌───────┴────────┐
     │                │
     ↓                ↓
Exit 0          Exit 1/2/3/124
SUCCESS         FAILURE
     │                │
     ↓                ↓
┌──────────┐   ┌──────────────┐
│completed/│   │   failed/    │
└──────────┘   └──────┬───────┘
                      │
                      │ Update meta.json
                      ↓
              ┌───────────────────┐
              │status=NEEDS_REVIEW│
              └───────────────────┘
```
