# RUNNERFIX-001 Implementation Plan

## Problem Statement

Current `ralph/run.sh` requires manual two-step execution:
1. `./ralph/run.sh JOB-ID --phase PHASE` → prints message, no exec
2. `./ralph/run.sh JOB-ID --phase PHASE --postflight` → manual postflight

This blocks unattended automation and background execution.

## Goal

Make `ralph/run.sh` support single-command unattended execution:
**preflight → exec → postflight → commit**

## Phase: IMPLEMENT

### New CLI Behavior

#### Primary Mode (Unattended Execution)
```bash
./ralph/run.sh JOB-ID --phase PHASE [--exec "COMMAND"]
```

**Workflow:**
1. **Preflight Validation**
   - Validate phase name
   - Check job exists
   - Check required artifacts exist
   - Parse allowed paths from meta.json
   - Update meta.json with current phase

2. **Exec (Optional)**
   - `cd jobs/JOB-ID/` (change working directory)
   - Execute COMMAND if provided via `--exec "COMMAND"`
   - Capture exit code
   - If exec fails (non-zero exit), skip postflight and commit, exit with error

3. **Postflight (Automatic)**
   - Check for unauthorized writes (tracked + untracked)
   - If unauthorized writes detected, exit with error (no commit)
   - If all validations pass, proceed to commit

4. **Commit**
   - `git add .`
   - `git commit -m "Desk: JOB-ID — PHASE — checkpoint"`
   - Exit with code 0 (success)

**Exit Codes:**
- `0` — Success (all steps passed, committed)
- `1` — Validation failure (preflight or postflight)
- `2` — Permission denied (unauthorized writes)
- `3` — Exec command failed (non-zero exit from user command)

#### Manual Postflight Mode (Backward Compatible)
```bash
./ralph/run.sh JOB-ID --phase PHASE --postflight
```

**Behavior:**
- Skip preflight
- Skip exec
- Run postflight only
- Commit if validation passes
- Used for manual workflows where user runs commands outside ralph

#### Skip Postflight Mode (Elevated Only)
```bash
./ralph/run.sh JOB-ID --phase PHASE --exec "COMMAND" --skip-postflight
```

**Requirements:**
- Job must have `"elevated": true` in meta.json
- If not elevated, exit with error
- Runs: preflight → exec → NO postflight → NO commit
- Used for debugging or multi-step manual workflows

**Exit immediately with error if:**
- Not elevated and `--skip-postflight` requested

### Exact Flag Specifications

**Required Flags:**
- `--phase PHASE` — One of: RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE

**Optional Flags:**
- `--exec "COMMAND"` — Execute command in jobs/JOB-ID/ directory
- `--postflight` — Manual postflight mode (skip preflight/exec, run postflight only)
- `--skip-postflight` — Skip postflight (requires elevated=true)

**Flag Combinations:**

| Flags | Behavior |
|-------|----------|
| `--phase PHASE` | Preflight → No exec → Postflight → Commit |
| `--phase PHASE --exec "CMD"` | Preflight → Exec → Postflight → Commit |
| `--phase PHASE --postflight` | Postflight only → Commit (backward compat) |
| `--phase PHASE --exec "CMD" --skip-postflight` | Preflight → Exec → NO postflight (elevated only) |

**Invalid Combinations:**
- `--postflight` with `--exec` → Error (conflicting modes)
- `--postflight` with `--skip-postflight` → Error (conflicting modes)

### Working Directory for Exec

**Critical Requirement:**
```bash
# Before running user command:
cd "jobs/$JOB_ID/" || exit 3

# Run user command in job directory
eval "$EXEC_COMMAND"
EXEC_EXIT=$?

# Return to repo root
cd ../..
```

All user commands via `--exec` must run with `jobs/JOB-ID/` as the working directory, not repo root.

### Error Handling

**Preflight Failures:**
- Invalid phase → Exit 1, print error
- Job not found → Exit 1, print error
- Missing artifacts → Exit 1, print error
- Invalid meta.json → Exit 1, print error

**Exec Failures:**
- Command exits non-zero → Exit 3, print exec output + exit code
- Skip postflight and commit
- Print clear error message

**Postflight Failures:**
- Unauthorized writes detected → Exit 2, print file list
- No commit
- Print allowed paths vs. actual writes

**Skip-Postflight Authorization Failures:**
- Not elevated + `--skip-postflight` → Exit 2, print error
- No exec, no commit

### Implementation Changes to ralph/run.sh

#### 1. Argument Parsing
```bash
# Parse flags
EXEC_COMMAND=""
POSTFLIGHT_ONLY=false
SKIP_POSTFLIGHT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase)
      PHASE="$2"
      shift 2
      ;;
    --exec)
      EXEC_COMMAND="$2"
      shift 2
      ;;
    --postflight)
      POSTFLIGHT_ONLY=true
      shift
      ;;
    --skip-postflight)
      SKIP_POSTFLIGHT=true
      shift
      ;;
    *)
      JOB_ID="$1"
      shift
      ;;
  esac
done
```

#### 2. Validation Logic
```bash
# Validate flag combinations
if [ "$POSTFLIGHT_ONLY" = true ] && [ -n "$EXEC_COMMAND" ]; then
  echo "ERROR: --postflight cannot be used with --exec"
  exit 1
fi

if [ "$POSTFLIGHT_ONLY" = true ] && [ "$SKIP_POSTFLIGHT" = true ]; then
  echo "ERROR: --postflight and --skip-postflight are mutually exclusive"
  exit 1
fi

# Check elevation for --skip-postflight
if [ "$SKIP_POSTFLIGHT" = true ]; then
  elevated=$(jq -r '.elevated // false' "$meta_file")
  if [ "$elevated" != "true" ]; then
    echo "ERROR: --skip-postflight requires elevated=true in meta.json"
    exit 2
  fi
fi
```

#### 3. Main Execution Flow
```bash
if [ "$POSTFLIGHT_ONLY" = true ]; then
  # Legacy mode: postflight only
  run_postflight "$JOB_ID" "$PHASE"
  commit_changes "$JOB_ID" "$PHASE"
  exit 0
fi

# Standard mode: preflight -> exec -> postflight -> commit
run_preflight "$JOB_ID" "$PHASE"

if [ -n "$EXEC_COMMAND" ]; then
  run_exec "$JOB_ID" "$EXEC_COMMAND"
fi

if [ "$SKIP_POSTFLIGHT" = false ]; then
  run_postflight "$JOB_ID" "$PHASE"
  commit_changes "$JOB_ID" "$PHASE"
fi

exit 0
```

#### 4. Exec Function
```bash
run_exec() {
  local job_id="$1"
  local exec_cmd="$2"
  local job_dir="jobs/$job_id"

  echo "🔄 Executing in $job_dir: $exec_cmd"

  # Change to job directory
  cd "$job_dir" || {
    echo "ERROR: Failed to change to $job_dir"
    exit 3
  }

  # Execute command
  eval "$exec_cmd"
  local exit_code=$?

  # Return to repo root
  cd ../.. || {
    echo "ERROR: Failed to return to repo root"
    exit 3
  }

  if [ $exit_code -ne 0 ]; then
    echo "❌ Exec failed with exit code $exit_code"
    exit 3
  fi

  echo "✅ Exec completed successfully"
}
```

### Acceptance Criteria

**DONE:**
- ✅ Script supports `--phase PHASE --exec "CMD"` single-command mode
- ✅ Exec runs in `jobs/JOB-ID/` as working directory
- ✅ Postflight runs automatically after exec (unless `--skip-postflight`)
- ✅ No commit on any failure (preflight, exec, postflight)
- ✅ `--postflight` mode still works (backward compat)
- ✅ `--skip-postflight` requires elevation check
- ✅ Clear error messages for all failure modes
- ✅ Exit codes: 0=success, 1=validation, 2=permission, 3=exec fail
- ✅ All flag combinations validated
- ✅ Updated ralph/run.sh tested with dry runs

**NEEDS_REVIEW:**
- ⚠️ Logic incomplete or unclear behavior
- ⚠️ Missing error handling for edge cases
- ⚠️ Unclear flag combination handling
- ⚠️ Working directory management incorrect

**BLOCKED:**
- 🚫 Cannot modify ralph/run.sh (permission issues)
- 🚫 Unclear requirements or ambiguous specification

## Implementation Sequence

1. Read current `ralph/run.sh` implementation
2. Refactor into functions:
   - `run_preflight()` — Validation and setup
   - `run_exec()` — Execute command in job directory
   - `run_postflight()` — Unauthorized write detection
   - `commit_changes()` — Git commit
   - `parse_args()` — Argument parsing
   - `validate_flags()` — Flag combination validation
3. Implement new flag parsing logic
4. Implement exec function with working directory change
5. Wire up execution flow (preflight → exec → postflight → commit)
6. Test all flag combinations
7. Update job artifacts
8. Git commit IMPLEMENT checkpoint

## Testing Plan

Test cases in IMPLEMENT phase:

1. **Basic exec:** `./ralph/run.sh TEST-001 --phase PLAN --exec "echo 'hello' > test.txt"`
   - Should: run preflight, exec in jobs/TEST-001/, postflight, commit
   - Verify: jobs/TEST-001/test.txt exists, git commit created

2. **Exec failure:** `./ralph/run.sh TEST-002 --phase PLAN --exec "exit 1"`
   - Should: run preflight, exec fails, skip postflight, exit 3
   - Verify: no commit, error message

3. **Unauthorized write:** `./ralph/run.sh TEST-003 --phase PLAN --exec "touch ../../unauthorized.txt"`
   - Should: run preflight, exec, postflight detects write, exit 2
   - Verify: no commit, file list shown

4. **Skip postflight (elevated):** `./ralph/run.sh BOOTSTRAP-001 --phase PLAN --exec "echo test" --skip-postflight`
   - Should: run preflight, exec, skip postflight, no commit
   - Verify: BOOTSTRAP-001 is elevated, no commit

5. **Skip postflight (not elevated):** `./ralph/run.sh TEST-004 --phase PLAN --exec "echo test" --skip-postflight`
   - Should: exit 2, error about elevation
   - Verify: no exec, no commit

6. **Postflight only (legacy):** `./ralph/run.sh TEST-005 --phase PLAN --postflight`
   - Should: skip preflight/exec, run postflight, commit
   - Verify: commit created

7. **No exec (default):** `./ralph/run.sh TEST-006 --phase PLAN`
   - Should: run preflight, no exec, postflight, commit
   - Verify: commit created, no exec happened
