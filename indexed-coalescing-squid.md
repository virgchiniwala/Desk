# Implementation Plan: Desk Platform MVP (Simplified v2)
**Status:** Revised Based on Technical Reviews
**Date:** 2026-01-23
**Reviewers:** DHH (agent-dhh-rails-reviewer), Kieran (agent-kieran-rails-reviewer), Simplicity (agent-code-simplicity-reviewer)

---

## Review Feedback Summary

**All three reviewers converged on the same theme: the original plan was over-engineered by ~30%.**

**DHH's verdict (6.5/10):**
- Core kernel: 9/10 (brilliant)
- UI/API plan: 4/10 (over-engineered, fighting server-rendering)
- Remove JWT → use cookie sessions
- Remove JSON API → use server-rendered HTML
- Remove polling → manual refresh
- Remove SPA patterns

**Kieran's verdict (D+):**
- 14 major issues identified
- Misunderstood existing code (claimed run.sh missing features it already has)
- Shell injection and path traversal vulnerabilities not explicitly mitigated
- Inadequate testing (only happy paths)
- No type safety

**Simplicity verdict (30% over-engineered):**
- Remove helper CLI scripts
- Remove auto-refresh, preview modals, mobile support, color badges
- Remove queue status endpoint, worker heartbeat
- Total LOC reduction: ~700 lines (30%)

---

## Simplified Scope

### What We're Building

**Ralph Kernel (2 missing scripts + worker fixes):**
- ✅ ralph/new-job.sh - Job creation script
- ✅ ralph/unlock-job.sh - Lock removal script
- ✅ Fix worker.sh exit code handling (NEEDS_REVIEW status updates)
- ❌ No helper CLI scripts
- ❌ No worker heartbeat

**Server-Rendered Web UI:**
- ✅ Express + EJS templates (NOT JSON API)
- ✅ Cookie-based sessions (NOT JWT)
- ✅ HTML forms with POST/redirect (NOT AJAX)
- ✅ Manual refresh button (NOT auto-polling)
- ✅ Download-only for artifacts (NOT preview modals)
- ✅ Desktop-only CSS (NOT responsive/mobile)

---

## Phase 1: Ralph Kernel (Essential Only) ✅ COMPLETE

### 1.1 Create ralph/new-job.sh ✅

Creates job directory with proper structure. Validates job ID strictly - no path traversal characters.

File location: /Users/vir.c/Desk/ralph/new-job.sh

### 1.2 Create ralph/unlock-job.sh ✅

Removes stale lock file after validation. Requires --force flag for safety.

File location: /Users/vir.c/Desk/ralph/unlock-job.sh

### 1.3 Fix Worker Exit Code Handling ✅

Worker needs to update meta.json status and progress.md on failure.
Current gap: When run.sh exits non-zero, worker doesn't set NEEDS_REVIEW.

File location: /Users/vir.c/Desk/ralph/worker.sh (modify existing)

**Phase 1 Completed:** 2026-01-26
- All Ralph kernel scripts functional
- Worker NEEDS_REVIEW status updates verified
- End-to-end testing complete

---

## Phase 2: Server-Rendered Web UI ✅ COMPLETE

**Phase 2 Completed:** 2026-01-26
- Server-rendered Express app with EJS templates
- Cookie-based authentication (no JWT)
- Safe shell execution (spawn with shell:false)
- Path traversal protection
- All routes functional and tested

### 2.1 Project Structure

server/
  package.json
  server.js
  routes/
    index.js - Job list (HTML)
    auth.js - Login/logout (HTML forms)
    jobs.js - Job detail, create, trigger (HTML)
    artifacts.js - File downloads
  middleware/
    auth.js - Cookie session verification
  views/
    layout.ejs
    login.ejs
    jobs-list.ejs
    job-detail.ejs
    job-create.ejs
  lib/
    shell-runner.js - Safe spawn() wrapper
    job-reader.js - Filesystem reader helpers
  db/
    init.sql - Users + sessions schema
    db.js - SQLite connection
  scripts/
    create-user.js - CLI tool
  public/css/
    styles.css - Minimal desktop-only CSS

### 2.2 Dependencies

express, express-session, better-sqlite3, connect-sqlite3, bcryptjs, ejs, helmet

NOT included: JWT, CORS, React, socket.io

### 2.3 Routes (HTML Responses)

GET /login → Login form (EJS)
POST /login → Verify → Set cookie → Redirect to /
POST /logout → Destroy session → Redirect to /login

GET / → Job list table (EJS)
GET /jobs/new → Job creation form (EJS)
POST /jobs → Create job → Redirect to /jobs/:id

GET /jobs/:id → Job detail view (EJS)
POST /jobs/:id/start-phase → Trigger phase → Redirect back

GET /artifacts/:jobId/* → Stream file download (no preview)
GET /jobs/:id/logs → Logs as <pre> block (EJS)

### 2.4 Security Implementation

Safe shell execution (lib/shell-runner.js):
- Use spawn() with argv array
- Set shell: false to prevent injection
- Pass user input as array elements, never interpolate strings

Path traversal prevention (lib/job-reader.js):
- Validate job ID format (alphanumeric + hyphens only)
- Normalize and resolve requested path
- Verify resolved path is within job output directory
- Reject if path escapes boundaries

### 2.5 UI Templates

Server-rendered EJS templates, NOT client-side JavaScript SPA.

Manual refresh button, no auto-polling.
Download links only, no preview modals.
Text-only status, no color badges.
Desktop-only layout, no responsive CSS.

---

## Phase 3: Testing & Validation

### 3.1 Essential Test Scenarios

Scenario 1: Happy Path
- Login → Create job → Trigger phases → Download artifacts → Verify git commits

Scenario 2: Phase Failure → Retry
- Create job → Trigger (fail) → Status = NEEDS_REVIEW → Retry → Success

Scenario 3: Security Tests
- Job ID validation: ../etc/passwd → rejected
- Artifact download: path traversal → rejected
- Shell injection: malicious command → safely passed as literal arg

### 3.2 Pre-Launch Checklist

Ralph:
- new-job.sh creates valid structure
- unlock-job.sh removes locks safely
- Worker updates meta.json.status on failure
- Checkpoint commits work
- Lock mechanism prevents concurrent execution

Server:
- Cookie sessions work
- Officers see only own jobs
- Supervisors see all jobs
- Shell runner uses spawn(), never string interpolation
- Artifact downloads validate paths
- Forms validate inputs

Security:
- No command injection possible
- No path traversal possible
- Session secret not in repo (.gitignore)
- Passwords bcrypt hashed

---

## Critical Files Summary

New Ralph Scripts:
- /Users/vir.c/Desk/ralph/new-job.sh
- /Users/vir.c/Desk/ralph/unlock-job.sh

Modified Ralph Scripts:
- /Users/vir.c/Desk/ralph/worker.sh

New Server Files:
- /Users/vir.c/Desk/server/ (entire directory)
- /Users/vir.c/Desk/.env

---

## Implementation Time Estimate

Ralph Kernel: 1 day
Server-Rendered UI: 3-4 days

Total: 4-5 days for complete MVP

---

## Out of Scope

- Helper CLI scripts
- Auto-refresh / polling
- Artifact preview modals
- Mobile / responsive CSS
- Color-coded status badges
- Queue status endpoint
- Worker heartbeat
- Job cancellation UI
- Real-time updates
- Email notifications
- Job templates

These can be added post-MVP if needed.

---

End of Plan
