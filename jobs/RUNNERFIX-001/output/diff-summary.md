# RUNNERFIX-001 Diff Summary

## File Modified: ralph/run.sh

**Line count:** 173 → 325 lines (+152 lines, +87% growth)

## What Changed

### New CLI Flags Added

**Added:**
- `--exec "COMMAND"` — Execute command in jobs/JOB-ID/ directory
- `--postflight` — Manual postflight mode (backward compatible)
- `--skip-postflight` — Skip postflight (requires elevated=true)

**Usage patterns:**
```bash
# New primary mode (unattended execution)
./ralph/run.sh JOB-ID --phase PHASE --exec "COMMAND"

# Legacy mode (still works)
./ralph/run.sh JOB-ID --phase PHASE --postflight

# Skip postflight (elevated only)
./ralph/run.sh JOB-ID --phase PHASE --exec "CMD" --skip-postflight
```

### Refactoring: Functions Extracted

**Old structure:**
- `main()` — Did validation and printed message
- `postflight()` — Manual postflight invocation

**New structure:**
- `parse_args()` — Argument parsing with flag support
- `validate_flags()` — Flag combination validation
- `run_preflight()` — Preflight validation (extracted from main)
- `run_exec()` — Execute command in job directory (NEW)
- `run_postflight()` — Postflight checks (refactored)
- `commit_changes()` — Git commit (extracted)
- `main()` — Orchestration flow

### New Execution Flow

**Before:**
```
main() → print "Execute your phase work now" → exit
User manually runs: --postflight → commit
```

**After:**
```
main() → preflight → exec (if --exec) → postflight → commit
```

**Automatic postflight:** No longer requires manual `--postflight` invocation

### run_exec() Function (New)

**Critical implementation:**
```bash
run_exec() {
    local job_id="$1"
    local exec_cmd="$2"
    local job_dir="jobs/$job_id"

    # Execute command in job directory with login shell
    if (cd "$job_dir" && bash -lc "$exec_cmd"); then
        echo "✅ Exec completed successfully"
        return 0
    else
        exit 3  # Exec failed, skip postflight and commit
    fi
}
```

**Key behaviors:**
- Changes directory to `jobs/JOB-ID/` before execution
- Uses `bash -lc` for login shell environment
- Captures exit code from user command
- Exits with code 3 on exec failure (skips postflight/commit)

### Testing Verification

**Test case:** TESTRUN-001
```bash
./ralph/run.sh TESTRUN-001 --phase PLAN --exec "echo 'test exec working' > exec-test.txt && pwd"
```

**Results:**
✅ Preflight validation passed
✅ Exec ran in correct working directory
✅ File created with correct content
✅ Unauthorized write detection worked
✅ Exit code 2 (correct for unauthorized write)

## Summary

**Problem solved:** ralph/run.sh now supports unattended automation with single-command execution while preserving backward compatibility.

**Key achievement:** `--exec` flag executes commands in `jobs/JOB-ID/` directory with automatic postflight validation and commit.
