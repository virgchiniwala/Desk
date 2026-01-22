# OPS-001 Progress

## Current Phase: IMPLEMENT
**Status:** DONE ✅

## Phase History

### IMPLEMENT — 2026-01-23
**Status:** DONE ✅

**Completed:**
- ✅ Added `TIMEOUT_BIN=""` variable to ralph/worker.sh
- ✅ Updated `preflight_checks()` to detect timeout binary:
  - Prefers `timeout` (Linux, macOS with coreutils symlinks)
  - Falls back to `gtimeout` (macOS with GNU coreutils)
  - Exits with clear error if neither found
- ✅ Replaced hardcoded `timeout` usage with `${TIMEOUT_BIN}` in `execute_job()`
- ✅ Validated with `bash -n ralph/worker.sh` (syntax OK)
- ✅ Preserved all queue semantics, locking, and logging behavior

**Changes Made:**
```diff
+ TIMEOUT_BIN=""

  preflight_checks() {
-   if ! command -v timeout >/dev/null 2>&1; then
-     echo "❌ FATAL: timeout command not available"
+   if command -v timeout >/dev/null 2>&1; then
+     TIMEOUT_BIN="timeout"
+   elif command -v gtimeout >/dev/null 2>&1; then
+     TIMEOUT_BIN="gtimeout"
+   else
+     echo "❌ FATAL: Neither timeout nor gtimeout command available"
      ...
-   log_worker "✅ timeout command available"
+   log_worker "✅ timeout/gtimeout command available"

  execute_job() {
-   if timeout "$timeout_sec" ./ralph/run.sh ...
+   if ${TIMEOUT_BIN} "$timeout_sec" ./ralph/run.sh ...
```

**Next Phase:** DONE (OPS-001 complete)
