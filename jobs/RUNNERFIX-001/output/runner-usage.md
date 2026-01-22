# ralph/run.sh — Canonical CLI Usage

## Overview

`ralph/run.sh` is the canonical executor for Desk jobs. It provides validated, single-command execution with automatic postflight validation and git commits.

## Basic Usage

```bash
./ralph/run.sh JOB-ID --phase PHASE [OPTIONS]
```

### Required Arguments

- **JOB-ID**: The job identifier (e.g., `MYWORK-001`)
- **--phase PHASE**: One of `RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE`

### Optional Flags

- **--exec "COMMAND"**: Execute command in `jobs/JOB-ID/` directory
- **--postflight**: Run postflight only (backward compatibility mode)
- **--skip-postflight**: Skip postflight validation (requires `elevated=true`)

## Behavior

### Working Directory

When `--exec "COMMAND"` is provided:
- Command executes in `jobs/JOB-ID/` directory
- Uses `bash -lc` for login shell environment
- Cannot write outside allowed paths defined in `meta.json`

### Execution Flow

**Standard mode** (`--phase PHASE --exec "CMD"`):
1. **Preflight**: Validate phase, check job exists, verify artifacts, update `meta.json`
2. **Exec**: Run command in `jobs/JOB-ID/` directory
3. **Postflight**: Check for unauthorized writes outside allowed paths
4. **Commit**: Git add and commit with message: `Desk: JOB-ID — PHASE — checkpoint`

### Automatic Postflight

After `--exec` completes successfully, postflight runs automatically:
- Verifies all writes are within allowed paths
- Prevents commits if unauthorized writes detected
- No manual `--postflight` flag needed

### Commit Semantics

**Commits happen only when**:
- All validation passes (preflight + postflight)
- Exec command succeeds (exit code 0)
- No unauthorized writes detected

**No commit happens when**:
- Preflight validation fails (exit code 1)
- Permission denied for `--skip-postflight` (exit code 2)
- Exec command fails (exit code 3)
- Unauthorized writes detected (exit code 2)

### Exit Codes

| Code | Meaning | Commit? |
|------|---------|---------|
| 0 | Success | ✅ Yes |
| 1 | Validation failure (preflight) | ❌ No |
| 2 | Permission denied (unauthorized writes or elevation) | ❌ No |
| 3 | Exec command failed | ❌ No |

## Example 1: SAFE Run (Success)

**Scenario**: Create a file inside the job directory

```bash
./ralph/run.sh DEMO-001 --phase IMPLEMENT --exec "echo 'test data' > output/result.txt"
```

**Expected Output**:
```
🚀 Running DEMO-001 — Phase: IMPLEMENT
📂 Allowed write paths:
  - jobs/DEMO-001/

✅ Preflight validation complete

🔄 Executing in jobs/DEMO-001: echo 'test data' > output/result.txt
✅ Exec completed successfully

🔍 Checking for unauthorized writes...
✅ All writes within allowed paths

📝 Committing changes...
[main abc1234] Desk: DEMO-001 — IMPLEMENT — checkpoint
 1 file changed, 1 insertion(+)

✅ Phase IMPLEMENT complete for DEMO-001
```

**Exit Code**: 0

**Commit**: ✅ Yes — `jobs/DEMO-001/output/result.txt` committed

**Files Modified**:
- `jobs/DEMO-001/meta.json` (phase updated)
- `jobs/DEMO-001/output/result.txt` (created by exec)

## Example 2: VIOLATION Run (Failure)

**Scenario**: Attempt to write outside job directory

```bash
./ralph/run.sh DEMO-001 --phase IMPLEMENT --exec "echo 'violation' > ../../VIOLATION.txt"
```

**Expected Output**:
```
🚀 Running DEMO-001 — Phase: IMPLEMENT
📂 Allowed write paths:
  - jobs/DEMO-001/

✅ Preflight validation complete

🔄 Executing in jobs/DEMO-001: echo 'violation' > ../../VIOLATION.txt
✅ Exec completed successfully

🔍 Checking for unauthorized writes...
❌ ERROR: Unauthorized writes detected:
  VIOLATION.txt

Allowed write paths:
  - jobs/DEMO-001/

ERROR: Write path validation failed
No commit created
```

**Exit Code**: 2

**Commit**: ❌ No — unauthorized write blocked

**Files Modified**:
- `jobs/DEMO-001/meta.json` (phase updated, but not committed)
- `VIOLATION.txt` (created by exec, **not committed**)

**Result**: The unauthorized file remains as an untracked file. User must manually `git clean` or delete it. No changes are committed to git.

## Advanced Usage

### Elevated Jobs

Jobs with `"elevated": true` in `meta.json` can specify additional allowed write paths:

```json
{
  "jobId": "SPECIAL-001",
  "elevated": true,
  "allowedPaths": [
    "jobs/SPECIAL-001/",
    "ralph/",
    "vault/"
  ]
}
```

These jobs can write to `ralph/` or `vault/` in addition to their job directory.

### Backward Compatibility

Legacy two-step mode still works:

```bash
# Step 1: Manual work (no runner)
cd jobs/MYWORK-001
# ... do work ...

# Step 2: Postflight and commit
./ralph/run.sh MYWORK-001 --phase IMPLEMENT --postflight
```

This mode is **deprecated** for automation. Use `--exec` for single-command execution.

### Skip Postflight (Dangerous)

Elevated jobs can skip postflight:

```bash
./ralph/run.sh SPECIAL-001 --phase IMPLEMENT --exec "touch tmp/work.txt" --skip-postflight
```

**⚠️ Warning**: No commit is created. Use only when you need to defer validation.

## Validation Guarantees

**ralph/run.sh ensures**:
- ✅ Phase is valid (RESEARCH|PLAN|IMPLEMENT|REVIEW|VERIFY|PACKAGE)
- ✅ Job exists with required artifacts (meta.json, plan.md, progress.md, session-handoff.md)
- ✅ Exec runs in correct working directory (`jobs/JOB-ID/`)
- ✅ All writes are within allowed paths
- ✅ No commits on any failure
- ✅ Atomic operation: all-or-nothing execution

## Security Model

**Write Path Enforcement**:
- Default: Jobs can only write to `jobs/JOB-ID/`
- Elevated jobs: Can write to additional paths in `meta.json`
- Postflight blocks commits if unauthorized writes detected
- Exit code 2 signals permission violation

**No Escalation**:
- `--skip-postflight` requires `elevated=true`
- Non-elevated jobs cannot bypass postflight validation
- Elevated status must be set before job creation
