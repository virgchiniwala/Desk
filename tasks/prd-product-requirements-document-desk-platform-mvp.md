# Product Requirements Document: Desk Platform MVP

## 1. Executive Summary

**Product Name:** Desk Platform MVP  
**Version:** 1.0  
**Date:** 2026-01-23  
**Status:** Draft

### Vision
Desk is a job-first platform for government knowledge work that prioritizes durable artifacts, explicit review gates, and audit trails over conversational interfaces. Officers create structured jobs that progress through explicit phases (Plan → Run → Package), producing reviewable artifacts with strict permissions and human oversight.

### Success Metrics
- Officers can create and execute jobs end-to-end without manual system intervention
- 100% of phase transitions and reviews are logged in audit trail
- Supervisors can review and approve blocked jobs within the platform
- All artifacts are immutable post-phase completion
- System handles NEEDS_REVIEW stops gracefully with clear notification and approval flow

---

## 2. Repo Contract (Non-Negotiable for MVP)

**This section defines the kernel execution model that the Desk MVP must respect. The UI/API layer wraps these primitives; it does not replace them.**

### Core Principles
- **Job-first, not chat:** All work happens in job directories. No conversational interface in MVP.
- **Filesystem source of truth:** Job state lives in `meta.json` + git commits, not database tables.
- **Write-root enforcement:** Jobs can only write to their designated paths in `meta.json.allowedPaths`.
- **One phase per run:** Each execution handles exactly one phase (PLAN, RUN, or PACKAGE). Bounded execution.
- **Checkpoint commits:** Every phase completion creates a git commit for audit trail.

### Job Directory Layout
```
jobs/<JOB_ID>/
  inputs/           # User-provided files (read-only after creation)
  output/           # Deliverables produced by phases (artifacts)
  tmp/              # Logs, runtime state, worker.log
  meta.json         # Job metadata (status, phase, allowedPaths)
  plan.md           # Plan phase output
  progress.md       # Append-only phase history
  session-handoff.md # Cross-session context
```

### Execution Flow
1. **Enqueue:** User/UI calls `ralph/enqueue.sh JOB-ID PHASE --exec "cmd" [opts]`
2. **Queue:** Item written to `ralph/queue/pending/<timestamp>-<JOB-ID>-<PHASE>.queue`
3. **Worker:** `ralph/worker.sh` polls queue (FIFO), moves item to `processing/`
4. **Execute:** Worker invokes `ralph/run.sh JOB-ID --phase PHASE --exec "cmd"` with timeout
5. **Exit handling:**
   - `0` → Success → move to `completed/`
   - `1,2,3` → Failure → move to `failed/`, mark job `NEEDS_REVIEW` in meta.json
   - `124` → Timeout → checkpoint or fail (based on `--checkpointable` flag)
6. **Commit:** On success, `ralph/run.sh` creates git commit: `Desk: JOB-ID — PHASE — checkpoint`

### Phase Model
- **Phases:** PLAN → RUN → PACKAGE (sequential, must complete previous before next)
- **Phase status:** `READY` | `RUNNING` | `NEEDS_REVIEW` | `COMPLETE`
- **Job status:** `ACTIVE` | `NEEDS_REVIEW` | `BLOCKED` | `DONE` | `CANCELLED`
- **NEEDS_REVIEW stop:** Phase exits non-zero → worker marks `meta.json.status = NEEDS_REVIEW` → blocks progression until human approval

### Manual Approval (Officer+Supervisor Model)
- Job owner can review `output/` artifacts, `tmp/worker.log`, and git diffs
- Approval action: Update `meta.json.status = ACTIVE`, re-enqueue phase if needed
- Rejection: Investigate logs, fix plan.md/inputs, reset status, retry
- No automatic retries; human must explicitly re-enqueue after review

### Audit Trail
- **Primary:** Git commits (one per phase completion with full diff)
- **Secondary:** `progress.md` (append-only phase history with timestamps)
- **Logs:** `jobs/<JOB_ID>/tmp/worker.log` (per-job execution log)

---

## 3. User Roles & Permissions

### 2.1 Roles

**Officer (Primary User)**
- Creates jobs and specifies job parameters
- Triggers phase execution manually
- Receives notifications when jobs require review
- Approves/rejects review requests with comments
- Views all artifacts for their own jobs

**Supervisor**
- All Officer permissions
- Views all jobs across all officers (read-only by default)
- Can view artifacts for any job in the system
- Receives escalated notifications (future enhancement)

### 2.2 Permission Matrix

| Action | Officer | Supervisor |
|--------|---------|------------|
| Create Job | ✓ | ✓ |
| View Own Jobs | ✓ | ✓ |
| View All Jobs | ✗ | ✓ (read-only) |
| Trigger Phase | ✓ (own jobs) | ✓ (own jobs) |
| Approve Review | ✓ (own jobs) | ✓ (any job) |
| View Own Artifacts | ✓ | ✓ |
| View All Artifacts | ✗ | ✓ |
| Cancel Job | ✓ (own jobs) | ✓ (own jobs) |
| Edit Job | ✗ | ✗ |

---

## 3. Core Features

### 3.1 Job Creation

**Requirements:**
- Any authenticated user (Officer or Supervisor) can create a job
- Job creation form captures:
  - Job title (required, max 200 chars)
  - Job description (required, max 2000 chars)
  - Job type/category (dropdown: Research, Analysis, Report, Investigation, Other)
  - Priority level (Low, Medium, High, Urgent)
  - Optional metadata fields (tags, reference numbers)
- Job receives unique ID on creation (format: `JOBTYPE-NNN`, e.g., `RESEARCH-001`)
- Initial state: `CREATED`
- Creator is automatically set as job owner

**User Story:**
> As an Officer, I want to create a new job with a clear title and description so that the system can execute structured work on my behalf and produce auditable artifacts.

### 3.2 Job Lifecycle & State Machine

**Simplified State Model (meta.json fields):**

```javascript
{
  "jobId": "RESEARCH-001",
  "phase": "PLAN" | "RUN" | "PACKAGE",           // Current/last phase
  "status": "ACTIVE" | "NEEDS_REVIEW" | "BLOCKED" | "DONE" | "CANCELLED"
}
```

**Job Status:**
- `ACTIVE`: Job is progressing, can execute phases
- `NEEDS_REVIEW`: Phase failed or detected issue requiring human approval
- `BLOCKED`: Waiting on external dependency (human must unblock)
- `DONE`: All phases complete, job closed successfully
- `CANCELLED`: User cancelled the job

**Phase Status (implicit from execution state):**
- Phase not started: No queue item exists, no output files
- Phase RUNNING: Queue item in `processing/`, worker.log active
- Phase NEEDS_REVIEW: Job status = NEEDS_REVIEW, phase incomplete
- Phase COMPLETE: Artifacts exist in `output/`, commit created, progress.md updated

**State Transitions:**
```
ACTIVE → NEEDS_REVIEW (phase failure)
NEEDS_REVIEW → ACTIVE (manual approval, ready to retry)
ACTIVE → DONE (all phases complete)
Any state → CANCELLED (user-initiated)
BLOCKED → ACTIVE (human unblocks)
```

**Audit Trail:**
- **Git commits:** One per successful phase completion (full diff, timestamp)
- **progress.md:** Append-only phase history with status and timestamp
- **worker.log:** Per-job execution logs in `jobs/<JOB-ID>/tmp/worker.log`

**User Story:**
> As a Supervisor, I want to see exactly which phase each job is in so I can understand system workload and identify bottlenecks requiring intervention.

### 3.3 Phase Execution

**Manual Trigger Flow:**
1. User/UI calls: `ralph/enqueue.sh JOB-ID PHASE --exec "cmd" [--time-min N]`
2. Script validates:
   - Job exists in `jobs/JOB-ID/`
   - Phase is valid (PLAN|RUN|PACKAGE)
   - No active lock at `jobs/JOB-ID/tmp/worker.lock`
3. Queue file written to `ralph/queue/pending/<timestamp>-JOB-ID-PHASE.queue`
4. Background worker (`ralph/worker.sh` in tmux) polls queue (FIFO, 10s interval)
5. Worker acquires lock, moves item to `processing/`, invokes `ralph/run.sh`
6. run.sh executes command in job directory with timeout, validates writes, commits on success
7. Phase completes → one of:
   - Exit 0 → Success → item moved to `completed/`, git commit created
   - Exit 1/2/3 → Failure → item moved to `failed/`, `meta.json.status = NEEDS_REVIEW`
   - Exit 124 → Timeout → re-enqueue (if checkpointable) or fail + NEEDS_REVIEW

**Phase Prerequisites:**
- **PLAN:** Job status = `ACTIVE`, no previous phase required
- **RUN:** PLAN phase complete (check `progress.md` or `output/plan.md` exists)
- **PACKAGE:** RUN phase complete (check `output/` for RUN artifacts)

**Execution Constraints:**
- One phase per run (bounded execution)
- Write-root enforcement (only `meta.json.allowedPaths` writable)
- Time budget per phase (default: 30 min, configurable)
- Checkpoint commits after each successful phase

**Retry Policy:**
- No automatic retries
- Manual retry only after review/error investigation
- Retry button appears in UI for `ERROR` or `NEEDS_REVIEW` states
- Retry triggers fresh execution of the same phase

**User Story:**
> As an Officer, I want to manually trigger each phase after reviewing previous artifacts so I maintain control over the job's progression and can intervene if needed.

### 3.4 Review & Approval Flow

**NEEDS_REVIEW Trigger:**
- Phase execution fails (exit code 1/2/3 from `ralph/run.sh`)
- Worker detects failure, updates `meta.json.status = NEEDS_REVIEW`
- Queue item moved to `ralph/queue/failed/`
- Job blocks: no further phases can execute until status reset

**Review Process (Manual):**
1. Officer checks job status (via UI or `cat jobs/JOB-ID/meta.json`)
2. Reviews artifacts in `jobs/JOB-ID/output/` directory
3. Reads execution log at `jobs/JOB-ID/tmp/worker.log`
4. Reviews git diff for phase commit (if phase previously succeeded)

**Approval Actions:**
- **Approve/Fix:**
  - Officer investigates failure, updates inputs or plan.md
  - Resets status: `jq '.status = "ACTIVE"' meta.json > meta.json.tmp && mv meta.json.tmp meta.json`
  - Re-enqueues phase: `ralph/enqueue.sh JOB-ID PHASE --exec "cmd"`
- **Cancel:**
  - Sets `meta.json.status = "CANCELLED"`
  - Job stops, no further progression

**Audit Trail:**
- Manual approval actions logged in `progress.md` (append timestamp + action)
- Re-enqueue creates new queue file with retry indicator
- Git commits show before/after state of fixes

**User Story:**
> As an Officer, I want to review and approve phase outputs when the system detects something requiring my judgment, so I ensure quality and compliance before proceeding.

### 3.5 Artifact Management

**Artifact Storage:**
- All artifacts stored in `jobs/<JOB_ID>/output/` directory
- No database metadata tracking - filesystem is source of truth
- Artifacts organized by phase (naming convention or subdirectories)

**Artifact Types:**
- Plan: `plan.md`, research summaries
- Run: `.md`, `.json`, `.csv`, `.txt` (analysis results, data extracts)
- Package: `.md`, `.pdf`, `.zip` (final deliverables)

**Artifact Immutability:**
- Git commits checkpoint artifacts after successful phase execution
- Git history provides immutability and versioning
- UI can show git diff for reviewing changes

**User Story:**
> As a Supervisor, I want to view artifacts from any job in the system so I can audit work quality and ensure compliance with department standards.

### 3.6 Job Cancellation

**Cancellation Flow:**
1. User sets `meta.json.status = CANCELLED`
2. If phase running, worker completes current execution (no interruption)
3. Queue item remains in current state (processing or failed)
4. Worker will not pick up future phases for cancelled jobs
5. Cancelled jobs remain visible (for audit purposes)
6. Artifacts preserved as-is

**Manual Cancellation:**
```bash
# Update meta.json status field
jq '.status = "CANCELLED"' jobs/JOB-ID/meta.json > meta.json.tmp && mv meta.json.tmp jobs/JOB-ID/meta.json

# Or via UI: Cancel Job button → updates meta.json
```

**User Story:**
> As an Officer, I want to cancel a job immediately if I realize the parameters were wrong or the job is no longer needed, so I don't waste system resources.

### 3.7 Audit Logging

**Audit Trail Sources:**
- **Git commits:** Checkpoint commits after each successful phase show what was produced
- **progress.md:** Manual log entries for phase transitions, reviews, approvals
- **tmp/worker.log:** Execution logs showing worker actions, exit codes, timing
- **meta.json history:** Git history of meta.json shows status changes over time

**Audit Information Captured:**
- Phase execution: start time, exit code, artifacts created (via git commits)
- Manual actions: review approvals, status resets (appended to progress.md)
- Worker events: lock acquire/release, queue movement, failures (in worker.log)

**Audit Access:**
- Read `progress.md` for human-readable timeline
- Use `git log jobs/<JOB_ID>/` for detailed file history
- Read `tmp/worker.log` for execution details

**User Story:**
> As a Supervisor, I want to see a complete audit trail of every action taken on a job so I can verify compliance and investigate issues if they arise.

---

## 4. User Interface

### 4.1 Job List View (Primary View)

**Layout:**
- Simple table of jobs
- Columns:
  - Job ID (clickable link to detail)
  - Job Title
  - Status Badge (color-coded)
  - Current Phase
  - Last Updated
- Filter: Status dropdown (All, Active, Needs Review, Done)
- Sort: Last Updated (default: newest first)

**Status Badge Colors:**
- `ACTIVE`: Blue
- `NEEDS_REVIEW`: Orange
- `BLOCKED`: Grey
- `DONE`: Green
- `CANCELLED`: Red strikethrough

**Actions:**
- "New Job" button (top-right)
- Click row → job detail view

**User Story:**
> As an Officer, I want to see all my jobs at a glance with their current status so I can quickly identify which jobs need my attention.

### 4.2 Job Detail View (Split View)

**Layout:**
- **Left Panel: Phase Timeline**
  - Vertical timeline: PLAN → RUN → PACKAGE
  - Each phase shows:
    - Phase name
    - Status badge (ACTIVE/NEEDS_REVIEW/DONE)
    - "Start Phase" button (manual trigger)
    - Last update timestamp
  - Active phase highlighted
  - Completed phases show checkmark

- **Right Panel: Outputs & Logs**
  - List of files in `output/` directory, grouped by phase
  - Each file: filename, size, created date
  - Click file → download or inline preview (if .md/.txt/.json)
  - Execution log: `tmp/worker.log` (view link at bottom)
  - If status = `NEEDS_REVIEW`: show alert box with "Review Required" message

**Top Bar:**
- Job ID and title
- Status badge
- "Cancel Job" button

**User Story:**
> As an Officer, I want to see a split view with the phase timeline on the left and artifacts on the right so I can quickly understand job progress and access relevant outputs.

### 4.3 Job Creation Form

**Fields:**
1. Job ID (text input, required, format: PROJECT-NNN)
2. Job Title (text input, required, max 200 chars)
3. Job Description (textarea, required, max 2000 chars)

**Actions:**
- "Create Job" button → creates `jobs/<JOB_ID>/` directory + `meta.json`
- "Cancel" button → return to job list

**User Story:**
> As an Officer, I want a simple form to create a new job so I can quickly specify what work needs to be done without unnecessary complexity.

### 4.4 Notifications (Optional for MVP)

**Minimal Notification System:**
- Jobs list shows `NEEDS_REVIEW` status badge (orange) for jobs requiring attention
- No in-app notification center required
- Officers check job list periodically for status changes

**Future Enhancement:**
- Email notifications for `NEEDS_REVIEW` status (post-MVP)

**User Story:**
> As an Officer, I want to see which jobs need my attention by checking the job list, without needing complex in-app notifications for MVP.

---

## 5. Technical Architecture

### 5.1 Backend Stack

**Technology:**
- **Execution:** Bash scripts (`ralph/enqueue.sh`, `ralph/worker.sh`, `ralph/run.sh`)
- **Queue:** Filesystem (`ralph/queue/`)
- **Storage:** Local file system (`jobs/{JOB_ID}/`)
- **Server (Optional):** Node.js + Express for UI/API wrapper
- **Database (Optional):** SQLite for user auth only (if multi-user UI built)

**Minimal Database Schema (Optional for UI):**

```sql
-- Users table (only if multi-user UI built)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL, -- OFFICER, SUPERVISOR
  created_at INTEGER NOT NULL
);

-- No jobs, artifacts, or audit_logs tables
-- Filesystem is source of truth for all job data
```

### 5.2 Execution Integration (Filesystem Queue)

**Queue-Based Architecture (No Database):**

The execution layer is implemented via filesystem queue and bash scripts. There is no SQLite `execution_queue` table or callback URLs. The server (if present) is a thin UI/API that reads job state from filesystem and triggers phases by calling `ralph/enqueue.sh`.

**Execution Flow:**
1. **Trigger:** User/UI calls `ralph/enqueue.sh JOB-ID PHASE --exec "cmd" [--time-min N] [--checkpointable]`
2. **Enqueue:** Script writes queue file to `ralph/queue/pending/<timestamp>-<JOB-ID>-<PHASE>.queue`
3. **Worker Poll:** `ralph/worker.sh` (runs in tmux/background) scans `pending/` every 10s (FIFO)
4. **Lock Acquire:** Worker checks `jobs/<JOB-ID>/tmp/worker.lock` (TTL-based, 2hr default)
5. **Execute:** Worker moves item to `processing/`, invokes `ralph/run.sh JOB-ID --phase PHASE --exec "cmd"` with timeout
6. **Exit Handling:**
   - Exit 0 → Success → move to `completed/`, commit created by run.sh
   - Exit 1/2/3 → Failure → move to `failed/`, update `meta.json.status = NEEDS_REVIEW`
   - Exit 124 → Timeout → re-enqueue if checkpointable, else failed + NEEDS_REVIEW
7. **Lock Release:** Worker removes lock file (always, even on failure)
8. **Logs:** Per-job logs at `jobs/<JOB-ID>/tmp/worker.log`

**Queue File Format (Bash-parseable KEY=VALUE):**
```bash
QUEUE_ID=1737539200-RESEARCH-001-PLAN
JOB_ID=RESEARCH-001
PHASE=PLAN
EXEC_COMMAND=echo 'plan generated' > output/plan.md
ENQUEUED_AT=2026-01-23T10:00:00+00:00
ENQUEUED_BY=officer@host
TIME_BUDGET_MIN=30
RETRY_COUNT=0
MAX_RETRIES=0
CHECKPOINTABLE=false
```

**Optional Server/UI Integration:**

If a UI/API server is built, it should:
- Read job state from `jobs/*/meta.json` and `progress.md` (filesystem is source of truth)
- Display job list, phase status, artifacts from `output/` directory
- Trigger phases by shelling out to `ralph/enqueue.sh JOB-ID PHASE --exec "cmd"`
- Poll filesystem for state changes (or use file watching) instead of receiving callbacks
- Provide manual approval flow: UI button → update `meta.json.status = ACTIVE` → re-enqueue phase

The server does **not** own the queue. It merely observes and triggers. All execution state lives in the filesystem.

### 5.3 API Endpoints (Optional for UI)

If a UI server is built, it provides thin wrappers around filesystem operations:

**Jobs:**
- `POST /api/jobs` - Create job directory + `meta.json`
- `GET /api/jobs` - List jobs (read `jobs/*/meta.json`)
- `GET /api/jobs/:id` - Read `jobs/<JOB_ID>/meta.json` + `progress.md`
- `POST /api/jobs/:id/start-phase` - Shell out to `ralph/enqueue.sh`
- `POST /api/jobs/:id/cancel` - Update `meta.json.status = CANCELLED`

**Artifacts:**
- `GET /api/jobs/:id/artifacts` - List files in `jobs/<JOB_ID>/output/`
- `GET /api/artifacts/:path` - Download file from `jobs/<JOB_ID>/output/<path>`

**Logs:**
- `GET /api/jobs/:id/logs` - Read `jobs/<JOB_ID>/tmp/worker.log`

**Note:** No callback endpoints. Server polls filesystem for state changes.

### 5.4 Deployment

**MVP Deployment:**
- Single server instance (Node.js process)
- SQLite database file (`desk.db`)
- File system storage (`/jobs/` directory)
- Environment variables:
  - `PORT` (default: 3000)
  - `DATABASE_PATH` (default: `./desk.db`)
  - `JOBS_PATH` (default: `./jobs`)
  - `EXECUTOR_POLL_INTERVAL` (default: 2000ms)
  
**Future Considerations:**
- Horizontal scaling: migrate to PostgreSQL + Redis queue
- Object storage (S3) for artifacts
- Separate executor service (microservices architecture)

---

## 6. Non-Functional Requirements

### 6.1 Performance
- Job list loads within 500ms (for up to 1000 jobs)
- Job detail view loads within 300ms
- Phase trigger response time: <200ms (queue push)
- Executor polls queue every 2 seconds (configurable)
- Artifact preview loads within 1s (for files <10MB)

### 6.2 Security
- Authentication required for all API endpoints
- Role-based access control enforced server-side
- CSRF protection on state-changing endpoints
- Artifact access validated per user role
- Audit logs cannot be deleted or modified

### 6.3 Reliability
- Graceful error handling (all errors logged, user-friendly messages shown)
- Executor failures do not crash server
- Database transactions for state changes
- Job state corruption recovery (manual admin intervention)

### 6.4 Usability
- Mobile-responsive UI (basic support, desktop-first)
- Accessibility: WCAG 2.1 AA compliance (keyboard navigation, screen reader support)
- Clear error messages (no stack traces shown to users)
- Loading indicators for async operations

### 6.5 Auditability
- All state changes logged with timestamp and user
- Immutable artifacts after phase completion
- Audit logs exportable for compliance reporting
- Job history preserved even after cancellation

---

## 7. User Stories (Summary)

### Officer Stories
1. As an Officer, I want to create a new job with a clear title and description so that the system can execute structured work on my behalf.
2. As an Officer, I want to manually trigger each phase after reviewing previous artifacts so I maintain control over job progression.
3. As an Officer, I want to review and approve phase outputs when the system detects something requiring my judgment.
4. As an Officer, I want to see all my jobs at a glance with their current status so I can quickly identify which jobs need my attention.
5. As an Officer, I want to cancel a job immediately if I realize the parameters were wrong or the job is no longer needed.
6. As an Officer, I want in-app notifications when my jobs need review or encounter errors so I can respond quickly.

### Supervisor Stories
7. As a Supervisor, I want to see exactly which phase each job is in so I can understand system workload and identify bottlenecks.
8. As a Supervisor, I want to view artifacts from any job in the system so I can audit work quality and ensure compliance.
9. As a Supervisor, I want to see a complete audit trail of every action taken on a job so I can verify compliance and investigate issues.

---

## 8. Acceptance Criteria

### 8.1 Job Creation
- [ ] Officer can create job with required fields (title, description, type, priority)
- [ ] Job receives unique ID (format: `{TYPE}-NNN`)
- [ ] Job appears in job list with `CREATED` status
- [ ] Job owner is automatically set to creator
- [ ] Form validation prevents submission with missing required fields

### 8.2 Phase Execution
- [ ] Officer can trigger Plan phase on `CREATED` job
- [ ] Job state transitions to `PLAN_RUNNING` when triggered
- [ ] Executor picks up job from queue within 5 seconds
- [ ] Phase completion transitions job to `PLAN_COMPLETE`
- [ ] Run phase cannot start until Plan phase is `COMPLETE`
- [ ] Package phase cannot start until Run phase is `COMPLETE`

### 8.3 Review & Approval
- [ ] Job transitions to `{PHASE}_NEEDS_REVIEW` when executor requests review
- [ ] Officer receives in-app notification
- [ ] Review panel displays artifacts with side-by-side diff (if applicable)
- [ ] Approve action (with comment) transitions job to `{PHASE}_COMPLETE`
- [ ] Reject action (with comment) transitions job to `{PHASE}_READY`
- [ ] Comment is required (min 10 chars) for approve/reject

### 8.4 Artifact Management
- [ ] Artifacts stored in job workspace directory (`/jobs/{JOB_ID}/output/`)
- [ ] Artifacts become immutable when phase completes
- [ ] Officer can view/download own job artifacts
- [ ] Supervisor can view/download all job artifacts
- [ ] Artifact preview works for `.md` and `.txt` files (inline)
- [ ] Locked icon displayed for immutable artifacts

### 8.5 Job Cancellation
- [ ] Officer can cancel own job at any time
- [ ] Cancellation confirmation modal appears
- [ ] Job state transitions to `CANCELLED` immediately
- [ ] Running executor receives cancellation signal (graceful stop)
- [ ] Cancelled job remains visible in job list (for audit)

### 8.6 Audit Logging
- [ ] All state changes logged with timestamp and user
- [ ] Job creation logged (user, timestamp, parameters)
- [ ] Phase start/complete logged (phase name, timestamp)
- [ ] Review approve/reject logged (user, timestamp, comment)
- [ ] Job cancellation logged (user, timestamp)
- [ ] Audit log displayed in job detail view (collapsible timeline)

### 8.7 UI
- [ ] Job list displays all jobs with status badges, current phase, owner, dates
- [ ] Job list filters work (by status, owner, phase)
- [ ] Job detail split view shows phase timeline (left) and artifacts/logs (right)
- [ ] "Start Phase" button only enabled when phase is `READY`
- [ ] Review panel only visible when job state is `NEEDS_REVIEW`
- [ ] Notification center displays unread count and recent notifications
- [ ] Mobile-responsive layout (basic support)

### 8.8 Permissions
- [ ] Officer can only view/trigger own jobs
- [ ] Supervisor can view all jobs (read-only)
- [ ] Supervisor can view all artifacts (read-only)
- [ ] Officer cannot edit job after creation
- [ ] Artifacts cannot be modified after phase completes (immutable)

---

## 9. Out of Scope (Future Enhancements)

- Multi-step approval chains (creator → supervisor → admin)
- Email notifications (only in-app notifications in MVP)
- Job templates (predefined job types with default parameters)
- Scheduled phase execution (auto-advance after approval)
- Artifact versioning (corrections log for immutable artifacts)
- Job search (full-text search across title, description, artifacts)
- Job analytics dashboard (stats, charts, trends)
- Executor scaling (multiple executor instances, load balancing)
- Object storage (S3) for artifacts
- Microservices architecture (separate job service, executor service)
- Real-time updates (WebSockets for live job status updates)
- Job cloning (duplicate existing job with new parameters)
- Bulk job operations (cancel multiple jobs, export multiple jobs)
- Custom job workflows (define custom phases beyond Plan/Run/Package)

---

## 10. Risks & Mitigations

### Risk 1: Executor Hangs or Crashes
**Impact:** Job stuck in `RUNNING` state indefinitely  
**Mitigation:**
- Executor heartbeat mechanism (timeout after 5 minutes of no activity)
- Manual "Force Stop" button for admins (future)
- Retry button available after timeout

### Risk 2: File System Storage Limits
**Impact:** Disk space exhaustion if many large artifacts  
**Mitigation:**
- Monitor disk usage (alert at 80% capacity)
- Artifact size limits (warn if file >50MB, block if >100MB)
- Artifact cleanup policy (delete artifacts for cancelled jobs after 30 days)

### Risk 3: SQLite Concurrency Limits
**Impact:** Database locks under heavy concurrent write load  
**Mitigation:**
- SQLite WAL mode enabled (improves concurrency)
- Connection pooling (max 5 concurrent connections)
- Future: migrate to PostgreSQL if concurrency becomes bottleneck

### Risk 4: Review Bottlenecks
**Impact:** Jobs pile up in `NEEDS_REVIEW` state, blocking progress  
**Mitigation:**
- Notification system ensures officers are alerted promptly
- Supervisor escalation (future: auto-escalate after 24h)
- Review SLA monitoring (future: alert if >10 jobs in review for >1 day)

### Risk 5: Unclear Job Parameters
**Impact:** Executor produces incorrect or low-quality outputs  
**Mitigation:**
- Job description field encourages clear requirements (2000 char max)
- Review step allows officer to catch issues early
- Retry mechanism allows correcting parameters (future: edit job before retry)

---

## 11. Success Criteria

### MVP Success Definition
The Desk Platform MVP is considered successful if:
1. An officer can create a job, trigger all three phases, and receive a final packaged artifact without manual system intervention (beyond review approvals)
2. 100% of phase transitions are logged in the audit trail with timestamps and user attribution
3. Supervisors can view any job's artifacts and audit logs within 2 clicks from the job list
4. All artifacts are immutable after phase completion (no accidental overwrites)
5. System handles NEEDS_REVIEW stops gracefully (notification → review → approval → progression)
6. Zero critical bugs (data loss, permission bypass, state corruption) in first 30 days of use
7. Officers rate the system as "easier than manual workflow" in post-MVP survey (≥4/5 stars)

---

## 12. Timeline & Milestones

### Phase 1: Core Backend (Week 1-2)
- SQLite schema and migrations
- Job CRUD API endpoints
- State machine implementation
- Execution queue (polling mechanism)
- Executor callback handlers

### Phase 2: UI Foundation (Week 2-3)
- Job list view (table with filters)
- Job detail view (split layout)
- Job creation form
- Phase trigger buttons

### Phase 3: Review & Approval (Week 3-4)
- NEEDS_REVIEW flow implementation
- Review panel UI (artifacts, diff view)
- Approve/reject actions with comments
- In-app notifications

### Phase 4: Artifacts & Audit (Week 4-5)
- Artifact storage and retrieval
- Immutability enforcement
- Audit log display (timeline view)
- Artifact preview (inline for .md/.txt)

### Phase 5: Integration & Testing (Week 5-6)
- Executor integration testing (queue → callback flow)
- End-to-end testing (create → trigger → review → complete)
- Permission testing (Officer vs Supervisor roles)
- Bug fixes and polish

### Phase 6: Deployment & Documentation (Week 6)
- Deployment guide (environment setup, database init)
- User documentation (how to create jobs, trigger phases, review)
- Admin documentation (troubleshooting, database maintenance)
- MVP release

---

## 13. Glossary

- **Job:** A unit of structured work with defined phases and outputs (directory in `jobs/`)
- **Phase:** A stage of job execution (PLAN, RUN, PACKAGE)
- **Artifact:** A file output produced during a phase (stored in `output/` directory)
- **Review Gate:** A mandatory human approval step (NEEDS_REVIEW status)
- **Queue:** Filesystem-based queue (`ralph/queue/pending/`)
- **Worker:** Background bash script (`ralph/worker.sh`) that polls queue and executes phases
- **Lock TTL:** Time-based lock mechanism (2 hours default) instead of PID checks
- **Checkpoint Commit:** Git commit after successful phase execution
- **Audit Trail:** Git commits + progress.md + worker.log
- **Officer:** Primary user role who creates and manages jobs
- **Supervisor:** Administrative role with read access to all jobs and artifacts

---

## 14. Appendix

### A. Example Job Lifecycle (Happy Path)

1. Officer creates job: `./desk/new-job.sh RESEARCH-001 "Analyze Q4 Compliance Reports"`
2. Officer triggers PLAN phase: `ralph/enqueue.sh RESEARCH-001 PLAN --exec "plan_cmd"`
3. Worker polls queue, acquires lock, executes `ralph/run.sh RESEARCH-001 --phase PLAN`
4. PLAN succeeds (exit 0), worker commits `plan.md` to git, sets `meta.json.status = ACTIVE`
5. Officer triggers RUN phase: `ralph/enqueue.sh RESEARCH-001 RUN --exec "run_cmd"`
6. RUN fails (exit 2), worker sets `meta.json.status = NEEDS_REVIEW`
7. Officer reviews `output/analysis.json`, updates `progress.md` with approval comment
8. Officer resets status: `jq '.status = "ACTIVE"' meta.json > meta.json.tmp && mv meta.json.tmp meta.json`
9. Officer re-enqueues RUN phase with fixes
10. RUN succeeds, worker commits, officer triggers PACKAGE phase
11. PACKAGE succeeds, worker commits `final_report.pdf`, sets `meta.json.status = DONE`
12. Job complete, git history shows full audit trail

### B. Example Queue File (Bash-parseable)

```bash
QUEUE_ID=1737539200-RESEARCH-001-PLAN
JOB_ID=RESEARCH-001
PHASE=PLAN
EXEC_COMMAND=./ralph/run.sh RESEARCH-001 --phase PLAN --exec "plan_generator"
ENQUEUED_AT=2026-01-23T10:00:00+00:00
ENQUEUED_BY=officer@hostname
TIME_BUDGET_MIN=30
RETRY_COUNT=0
MAX_RETRIES=0
CHECKPOINTABLE=false
```

### C. Example meta.json (Job Metadata)

```json
{
  "jobId": "RESEARCH-001",
  "title": "Analyze Q4 Compliance Reports",
  "description": "Review all Q4 2025 compliance reports for anomalies",
  "phase": "RUN",
  "status": "ACTIVE",
  "created": "2026-01-23T09:00:00Z",
  "updated": "2026-01-23T10:30:00Z",
  "allowedPaths": [
    "jobs/RESEARCH-001/**"
  ]
}
```

### D. Example progress.md (Manual Log Entries)

```markdown
# RESEARCH-001 Progress

## PLAN Phase — 2026-01-23T10:00:00Z
- Enqueued PLAN phase
- Worker started execution
- Exit 0: Success
- Git commit: abc123 "RESEARCH-001 PLAN checkpoint"

## RUN Phase — 2026-01-23T10:15:00Z
- Enqueued RUN phase
- Worker started execution
- Exit 2: Failure (compliance issues detected)
- Status set to NEEDS_REVIEW

## Manual Review — 2026-01-23T11:00:00Z
- Officer reviewed output/analysis.json
- Found 3 non-compliant items requiring clarification
- Updated inputs with additional context
- Status reset to ACTIVE

## RUN Phase (Retry) — 2026-01-23T11:15:00Z
- Re-enqueued RUN phase with fixes
- Worker started execution
- Exit 0: Success
- Git commit: def456 "RESEARCH-001 RUN checkpoint"
```

### E. Example worker.log (Execution Log)

```
[2026-01-23T10:00:00+00:00] Worker started (PID: 12345)
[2026-01-23T10:00:05+00:00] Scanning queue...
[2026-01-23T10:00:05+00:00] Found: 1737539200-RESEARCH-001-PLAN.queue
[2026-01-23T10:00:05+00:00] Lock acquired for RESEARCH-001 (PID: 12345)
[2026-01-23T10:00:05+00:00] Executing RESEARCH-001 — PLAN (timeout: 1800s)
[2026-01-23T10:00:35+00:00] SUCCESS: RESEARCH-001 (exit 0)
[2026-01-23T10:00:35+00:00] Lock released for RESEARCH-001
```

---

**End of PRD**