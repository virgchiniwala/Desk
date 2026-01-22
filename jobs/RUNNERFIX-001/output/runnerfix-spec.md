# RUNNERFIX-001 Terminal Output Specification

## Success Cases

### Case 1: Basic Exec with Auto-Postflight
```bash
$ ./ralph/run.sh TEST-001 --phase PLAN --exec "echo 'hello world' > test.txt"
```

**Expected Output:**
```
🚀 Running TEST-001 — Phase: PLAN
📂 Allowed write paths:
  - jobs/TEST-001/

✅ Preflight validation complete

🔄 Executing in jobs/TEST-001: echo 'hello world' > test.txt
✅ Exec completed successfully

🔍 Checking for unauthorized writes...
✅ All writes within allowed paths

📝 Committing changes...
[master abc1234] Desk: TEST-001 — PLAN — checkpoint
 1 file changed, 1 insertion(+)
 create mode 100644 jobs/TEST-001/test.txt

✅ Phase PLAN complete for TEST-001
```

**Exit Code:** `0`

**Verification:**
```bash
$ cat jobs/TEST-001/test.txt
hello world

$ git log -1 --oneline
abc1234 Desk: TEST-001 — PLAN — checkpoint
```

---

### Case 2: No Exec (Default Behavior)
```bash
$ ./ralph/run.sh TEST-002 --phase IMPLEMENT
```

**Expected Output:**
```
🚀 Running TEST-002 — Phase: IMPLEMENT
📂 Allowed write paths:
  - jobs/TEST-002/

✅ Preflight validation complete
⚠️  No --exec command provided

🔍 Checking for unauthorized writes...
✅ All writes within allowed paths

📝 Committing changes...
[master def5678] Desk: TEST-002 — IMPLEMENT — checkpoint
 1 file changed, 1 insertion(+), 1 deletion(-)

✅ Phase IMPLEMENT complete for TEST-002
```

**Exit Code:** `0`

---

### Case 3: Postflight Only (Legacy Mode)
```bash
$ ./ralph/run.sh TEST-003 --phase REVIEW --postflight
```

**Expected Output:**
```
🔍 Running postflight for TEST-003 — Phase: REVIEW

🔍 Checking for unauthorized writes...
✅ All writes within allowed paths

📝 Committing changes...
[master ghi9012] Desk: TEST-003 — REVIEW — checkpoint
 2 files changed, 10 insertions(+), 5 deletions(-)

✅ Phase REVIEW complete for TEST-003
```

**Exit Code:** `0`

---

### Case 4: Skip Postflight (Elevated Job)
```bash
$ ./ralph/run.sh BOOTSTRAP-001 --phase IMPLEMENT --exec "mkdir -p tmp/debug" --skip-postflight
```

**Expected Output:**
```
🚀 Running BOOTSTRAP-001 — Phase: IMPLEMENT
📂 Allowed write paths:
  - jobs/BOOTSTRAP-001/
  - ralph/
  - vault/
  - .claude/contexts/
  - AGENTS.md
  - RALPH.md
  - vault/CLAUDE.md
🔓 Elevated permissions: true

✅ Preflight validation complete

🔄 Executing in jobs/BOOTSTRAP-001: mkdir -p tmp/debug
✅ Exec completed successfully

⚠️  Skipping postflight (--skip-postflight enabled)
⚠️  No commit created
```

**Exit Code:** `0`

**Verification:**
```bash
$ git status
On branch master
Changes not staged for commit:
  modified:   jobs/BOOTSTRAP-001/meta.json

Untracked files:
  jobs/BOOTSTRAP-001/tmp/debug/
```

---

## Failure Cases

### Case 5: Exec Command Fails
```bash
$ ./ralph/run.sh TEST-004 --phase PLAN --exec "exit 1"
```

**Expected Output:**
```
🚀 Running TEST-004 — Phase: PLAN
📂 Allowed write paths:
  - jobs/TEST-004/

✅ Preflight validation complete

🔄 Executing in jobs/TEST-004: exit 1
❌ Exec failed with exit code 1

ERROR: Exec command failed
Skipping postflight and commit
```

**Exit Code:** `3`

**Verification:**
```bash
$ git log -1 --oneline
def5678 Desk: TEST-002 — IMPLEMENT — checkpoint
# No new commit created
```

---

### Case 6: Unauthorized Write Detected
```bash
$ ./ralph/run.sh TEST-005 --phase IMPLEMENT --exec "touch ../../unauthorized.txt"
```

**Expected Output:**
```
🚀 Running TEST-005 — Phase: IMPLEMENT
📂 Allowed write paths:
  - jobs/TEST-005/

✅ Preflight validation complete

🔄 Executing in jobs/TEST-005: touch ../../unauthorized.txt
✅ Exec completed successfully

🔍 Checking for unauthorized writes...
❌ ERROR: Unauthorized writes detected:
  unauthorized.txt

Allowed write paths:
  - jobs/TEST-005/

ERROR: Write path validation failed
No commit created
```

**Exit Code:** `2`

**Verification:**
```bash
$ ls -la | grep unauthorized
-rw-r--r--  1 user  staff  0 Jan 22 17:00 unauthorized.txt

$ git status
On branch master
Untracked files:
  unauthorized.txt
```

---

### Case 7: Skip Postflight Without Elevation
```bash
$ ./ralph/run.sh TEST-006 --phase PLAN --exec "echo test" --skip-postflight
```

**Expected Output:**
```
❌ ERROR: --skip-postflight requires elevated=true in meta.json
Job TEST-006 elevated status: false
Permission denied
```

**Exit Code:** `2`

---

### Case 8: Invalid Phase Name
```bash
$ ./ralph/run.sh TEST-007 --phase INVALID
```

**Expected Output:**
```
❌ ERROR: Invalid phase. Must be one of: RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE
Provided: INVALID
```

**Exit Code:** `1`

---

### Case 9: Job Not Found
```bash
$ ./ralph/run.sh NONEXISTENT-999 --phase PLAN
```

**Expected Output:**
```
❌ ERROR: Job directory not found: jobs/NONEXISTENT-999
```

**Exit Code:** `1`

---

### Case 10: Missing Required Artifact
```bash
$ ./ralph/run.sh TEST-008 --phase PLAN
# Assume meta.json is missing
```

**Expected Output:**
```
❌ ERROR: Required artifact missing: jobs/TEST-008/meta.json
```

**Exit Code:** `1`

---

### Case 11: Conflicting Flags (--postflight with --exec)
```bash
$ ./ralph/run.sh TEST-009 --phase PLAN --postflight --exec "echo test"
```

**Expected Output:**
```
❌ ERROR: --postflight cannot be used with --exec
These modes are mutually exclusive
```

**Exit Code:** `1`

---

### Case 12: Conflicting Flags (--postflight with --skip-postflight)
```bash
$ ./ralph/run.sh TEST-010 --phase PLAN --postflight --skip-postflight
```

**Expected Output:**
```
❌ ERROR: --postflight and --skip-postflight are mutually exclusive
```

**Exit Code:** `1`

---

## Exit Code Summary

| Code | Meaning | Example Cause |
|------|---------|---------------|
| `0` | Success | All validations passed, committed |
| `1` | Validation failure | Invalid phase, missing artifacts, job not found, conflicting flags |
| `2` | Permission denied | Unauthorized writes, --skip-postflight without elevation |
| `3` | Exec command failed | User command exited non-zero |

---

## Working Directory Verification

### Case 13: Verify Exec Working Directory
```bash
$ ./ralph/run.sh TEST-011 --phase PLAN --exec "pwd > cwd.txt"
```

**Expected Output:**
```
🚀 Running TEST-011 — Phase: PLAN
📂 Allowed write paths:
  - jobs/TEST-011/

✅ Preflight validation complete

🔄 Executing in jobs/TEST-011: pwd > cwd.txt
✅ Exec completed successfully

🔍 Checking for unauthorized writes...
✅ All writes within allowed paths

📝 Committing changes...
[master xyz3456] Desk: TEST-011 — PLAN — checkpoint
 1 file changed, 1 insertion(+)
 create mode 100644 jobs/TEST-011/cwd.txt

✅ Phase PLAN complete for TEST-011
```

**Verification:**
```bash
$ cat jobs/TEST-011/cwd.txt
/Users/virchiniwala/desk/jobs/TEST-011
# NOT /Users/virchiniwala/desk
```

---

## Edge Cases

### Case 14: Empty Exec Command
```bash
$ ./ralph/run.sh TEST-012 --phase PLAN --exec ""
```

**Expected Output:**
```
🚀 Running TEST-012 — Phase: PLAN
📂 Allowed write paths:
  - jobs/TEST-012/

✅ Preflight validation complete
⚠️  No --exec command provided (empty string)

🔍 Checking for unauthorized writes...
✅ All writes within allowed paths

📝 Committing changes...
[master abc7890] Desk: TEST-012 — PLAN — checkpoint
 1 file changed, 1 insertion(+), 1 deletion(-)

✅ Phase PLAN complete for TEST-012
```

**Exit Code:** `0`

---

### Case 15: Multi-Command Exec
```bash
$ ./ralph/run.sh TEST-013 --phase IMPLEMENT --exec "echo 'line1' > out.txt && echo 'line2' >> out.txt"
```

**Expected Output:**
```
🚀 Running TEST-013 — Phase: IMPLEMENT
📂 Allowed write paths:
  - jobs/TEST-013/

✅ Preflight validation complete

🔄 Executing in jobs/TEST-013: echo 'line1' > out.txt && echo 'line2' >> out.txt
✅ Exec completed successfully

🔍 Checking for unauthorized writes...
✅ All writes within allowed paths

📝 Committing changes...
[master def1234] Desk: TEST-013 — IMPLEMENT — checkpoint
 1 file changed, 2 insertions(+)
 create mode 100644 jobs/TEST-013/out.txt

✅ Phase IMPLEMENT complete for TEST-013
```

**Verification:**
```bash
$ cat jobs/TEST-013/out.txt
line1
line2
```
