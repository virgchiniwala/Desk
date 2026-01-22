# OPS-001 Plan — macOS Portability for ralph/worker.sh

## Objective

Make ralph/worker.sh portable on macOS by supporting gtimeout (GNU coreutils).

## Problem

- Linux systems have `timeout` command built-in (part of coreutils)
- macOS requires `brew install coreutils` which provides `gtimeout` (not `timeout`)
- Current ralph/worker.sh only checks for `timeout`, failing on macOS with GNU coreutils

## Solution

Update ralph/worker.sh to:
1. Detect available timeout binary (prefer `timeout`, fallback to `gtimeout`)
2. Store detected binary in `TIMEOUT_BIN` variable
3. Use `${TIMEOUT_BIN}` in execution instead of hardcoded `timeout`
4. Maintain all existing queue semantics, locking, and logging behavior

## Implementation

### Changes to ralph/worker.sh

1. Add `TIMEOUT_BIN=""` variable at top of script
2. Update `preflight_checks()` function:
   - Check for `timeout` first (Linux, macOS with coreutils linked)
   - Fallback to `gtimeout` (macOS with GNU coreutils)
   - Exit with clear error if neither found
3. Replace `timeout` usage in `execute_job()` with `${TIMEOUT_BIN}`

### No Changes Required

- Queue file format (KEY=VALUE)
- Lock strategy (TTL-based)
- Exit code handling (0/1/2/3/124)
- Logging behavior
- Retry/checkpoint logic

## Acceptance Criteria

- ✅ ralph/worker.sh passes `bash -n` syntax validation
- ✅ Script detects and uses `timeout` when available
- ✅ Script detects and uses `gtimeout` as fallback
- ✅ Script exits with clear error if neither command found
- ✅ No changes to queue semantics, locking, or logging
