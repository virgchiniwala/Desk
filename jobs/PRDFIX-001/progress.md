# PRDFIX-001 Progress

## Current Phase: EDIT
**Status:** DONE ✅

## Phase History

### EDIT — 2026-01-23
**Status:** DONE ✅

**Completed Changes:**

**A) Added "Repo Contract (Non-Negotiable for MVP)" Section**
- Inserted after Executive Summary (section 2)
- 8 core principles: Job-first, filesystem source of truth, write-root enforcement, one phase per run, checkpoint commits, manual approval, audit trail, bounded execution
- Job directory layout documented
- Execution flow outlined

**B) Replaced `/artifacts/` with `/output/`**
- Global search and replace throughout document
- Updated all references to job artifacts storage location

**C) Rewrote Backend Architecture (Section 5.2)**
- Removed SQLite `execution_queue` table
- Removed REST callback URLs and executor microservice references
- Replaced with filesystem queue: `ralph/queue/{pending,processing,completed,failed}`
- Documented bash script workflow: enqueue.sh → worker.sh → run.sh
- Exit code handling: 0/1-3/124
- Lock TTL mechanism (2 hours)
- Worker.log logging

**D) Updated Job State Model (Section 3.2, 3.3, 3.4)**
- Simplified to: `phase` (PLAN/RUN/PACKAGE) + `status` (ACTIVE/NEEDS_REVIEW/BLOCKED/DONE/CANCELLED)
- Removed complex state machine with {PHASE}_RUNNING, {PHASE}_COMPLETE states
- Phase execution via `ralph/enqueue.sh` instead of database queue
- Manual approval flow via filesystem (update meta.json, re-enqueue)

**E) Simplified UI Section (Section 4.1-4.4)**
- **4.1 Job List View:** Reduced to essential columns (Job ID, Title, Status Badge, Current Phase, Last Updated), minimal filters
- **4.2 Job Detail View:** Simplified right panel to single "Outputs & Logs" section (removed Artifacts/Audit/Review tabs), filesystem-based artifact listing
- **4.3 Job Creation Form:** Reduced to 3 fields (Job ID, Title, Description)
- **4.4 Notifications:** Made optional for MVP, rely on status badges in job list

**F) Updated Supporting Sections**
- **3.5 Artifact Management:** Filesystem-based, git commits for immutability
- **3.6 Job Cancellation:** Filesystem-based (update meta.json)
- **3.7 Audit Logging:** Git commits + progress.md + worker.log (removed SQLite audit_logs table)
- **5.1 Backend Stack:** Minimal database (users table only), filesystem is source of truth
- **5.3 API Endpoints:** Optional thin wrappers, filesystem polling, no callbacks
- **Section 13 Glossary:** Updated terms to reflect filesystem model
- **Section 14 Appendix A:** Updated job lifecycle example to use bash scripts
- **Section 14 Appendices B-E:** Replaced database/callback examples with queue files, meta.json, progress.md, worker.log examples

**Validation:**
- ✅ All sections read coherently
- ✅ No dangling references to removed concepts (SQLite queue, callbacks, executor microservice)
- ✅ Consistent filesystem-based terminology throughout
