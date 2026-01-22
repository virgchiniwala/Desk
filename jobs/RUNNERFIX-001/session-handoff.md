# RUNNERFIX-001 Session Handoff

## Job Context
**Job ID:** RUNNERFIX-001
**Title:** Fix ralph/run.sh for Unattended Execution
**Current Phase:** PLAN
**Status:** DONE ✅
**Elevated:** Yes (can modify ralph/run.sh)

## What Was Done (PLAN Phase)

Created comprehensive plan to fix ralph/run.sh for automation:

1. **Problem Identified:**
   - Current implementation requires two-step execution
   - Step 1: Preflight validation only, prints "Execute your phase work now"
   - Step 2: Manual `--postflight` invocation
   - Blocks background automation and unattended workflows

2. **Solution Designed:**
   - Single-command mode: `--phase PHASE --exec "CMD"`
   - Workflow: preflight → exec → postflight → commit
   - Exec runs in `jobs/JOB-ID/` working directory (critical!)
   - Automatic postflight unless explicitly skipped
   - No commit on any failure

3. **Artifacts Created:**
   - `plan.md` — Complete implementation specification with:
     - Exact CLI behavior and flag definitions
     - All flag combinations (valid + invalid)
     - Error handling for all failure modes
     - Function refactoring design
     - 7-test validation plan
   - `output/runnerfix-spec.md` — 15 terminal output examples:
     - Success cases (basic exec, no exec, legacy mode, skip postflight)
     - Failure cases (exec fail, unauthorized write, permission denied, invalid phase, missing job)
     - Edge cases (empty exec, multi-command, working directory verification)
     - Exit code summary table

## What's Next (IMPLEMENT Phase)

Execute the plan in `plan.md`:

1. **Refactor ralph/run.sh:**
   - Extract functions: `run_preflight()`, `run_exec()`, `run_postflight()`, `commit_changes()`
   - Add: `parse_args()`, `validate_flags()`

2. **Implement New Features:**
   - Flag parsing for `--exec`, `--postflight`, `--skip-postflight`
   - Exec function with working directory change to `jobs/JOB-ID/`
   - Automatic postflight after exec
   - Skip-postflight elevation check
   - Exit code management (0/1/2/3)

3. **Test All Cases:**
   - Run 7 test cases from plan.md
   - Verify 15 terminal outputs match runnerfix-spec.md
   - Confirm working directory is correct
   - Validate exit codes

4. **Update and Commit:**
   - Update progress.md and session-handoff.md
   - Git commit: "Desk: RUNNERFIX-001 — IMPLEMENT — checkpoint"

## Elevated Permissions

This job has ELEVATED status allowing writes to:
- `jobs/RUNNERFIX-001/`
- `ralph/run.sh`

**Critical:** ONLY modify ralph/run.sh. No other repo-root files.

## Key Implementation Details

### Working Directory Change (Critical!)
```bash
# In run_exec function:
cd "jobs/$JOB_ID" || exit 3
eval "$EXEC_COMMAND"
EXEC_EXIT=$?
cd ../.. || exit 3
```

All user commands must run with `jobs/JOB-ID/` as working directory, NOT repo root.

### Exit Code Strategy
- **0:** Success (all validations passed, committed)
- **1:** Validation failure (invalid phase, missing files, conflicting flags)
- **2:** Permission denied (unauthorized writes, skip-postflight without elevation)
- **3:** Exec command failed (user command exited non-zero)

### Flag Validation Rules
Invalid combinations that must error immediately:
- `--postflight` + `--exec`
- `--postflight` + `--skip-postflight`
- `--skip-postflight` when `elevated != true`

## Ambiguities / Decisions Needed

None. Plan is complete and explicit.

## How to Continue

Run IMPLEMENT phase:
```bash
# Review current run.sh
cat ralph/run.sh

# Review plan
cat jobs/RUNNERFIX-001/plan.md

# Review expected outputs
cat jobs/RUNNERFIX-001/output/runnerfix-spec.md

# Execute IMPLEMENT
# Refactor ralph/run.sh per plan
# Test all cases
# Update progress.md
# Commit when phase complete
```

## Testing Checklist for IMPLEMENT

- [ ] Test 1: Basic exec with auto-postflight
- [ ] Test 2: Exec failure (exit code 3)
- [ ] Test 3: Unauthorized write detection (exit code 2)
- [ ] Test 4: Skip postflight with elevated job
- [ ] Test 5: Skip postflight without elevation (should fail)
- [ ] Test 6: Postflight only (legacy mode)
- [ ] Test 7: No exec (default behavior)
- [ ] Verify: Working directory is jobs/JOB-ID/ during exec
- [ ] Verify: Exit codes match spec for all cases
- [ ] Verify: Terminal output matches runnerfix-spec.md

## Desk Invariants Reminder

- **Job-first:** All work in `/jobs/{JOB_ID}/`
- **Phase sequence:** One phase per run
- **Stop on ambiguity:** NEEDS_REVIEW if unclear
- **Git checkpoints:** Commit after each phase
- **Elevated enforcement:** Only modify allowed paths from meta.json
