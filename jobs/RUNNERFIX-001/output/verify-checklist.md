# ralph/run.sh Verification Checklist

**Estimated time**: <2 minutes

## Prerequisites

- Desk repo checked out
- Clean working directory (no pending changes)
- `jq` installed (`brew install jq` or equivalent)

## Test 1: Create Test Job

```bash
mkdir -p jobs/VERIFY-TEST/{inputs,output,tmp}
cat > jobs/VERIFY-TEST/meta.json <<'EOF'
{
  "jobId": "VERIFY-TEST",
  "title": "Runner Verification Test",
  "phase": "IMPLEMENT",
  "status": "ACTIVE",
  "elevated": false,
  "allowedPaths": ["jobs/VERIFY-TEST/"],
  "created": "2026-01-22"
}
EOF
touch jobs/VERIFY-TEST/{plan.md,progress.md,session-handoff.md}
git add jobs/VERIFY-TEST
git commit -m "Test: Create VERIFY-TEST job"
```

**Expected**: Job created successfully

## Test 2: SAFE Run (Write Inside Job Directory)

```bash
./ralph/run.sh VERIFY-TEST --phase IMPLEMENT --exec "echo 'success' > output/test.txt"
```

**Expected output**:
```
✅ Preflight validation complete
🔄 Executing in jobs/VERIFY-TEST: echo 'success' > output/test.txt
✅ Exec completed successfully
✅ All writes within allowed paths
📝 Committing changes...
✅ Phase IMPLEMENT complete for VERIFY-TEST
```

**Exit code**: 0

**Verification**:
```bash
# Check file was created
cat jobs/VERIFY-TEST/output/test.txt
# Expected: "success"

# Check commit was created
git log --oneline -1
# Expected: Contains "Desk: VERIFY-TEST — IMPLEMENT — checkpoint"
```

## Test 3: VIOLATION Run (Attempt Unauthorized Write)

```bash
./ralph/run.sh VERIFY-TEST --phase IMPLEMENT --exec "echo 'bad' > ../../VIOLATION.txt"
```

**Expected output**:
```
✅ Preflight validation complete
🔄 Executing in jobs/VERIFY-TEST: echo 'bad' > ../../VIOLATION.txt
✅ Exec completed successfully
❌ ERROR: Unauthorized writes detected:
  VIOLATION.txt
ERROR: Write path validation failed
No commit created
```

**Exit code**: 2 (permission denied)

**Verification**:
```bash
# Check no new commit was created
git log --oneline -1
# Expected: Still shows previous commit (not a new VIOLATION commit)

# Check unauthorized file exists (untracked)
ls VIOLATION.txt
# Expected: File exists (but not committed)

# Clean up
rm VIOLATION.txt
```

## Test 4: Working Directory Verification

```bash
./ralph/run.sh VERIFY-TEST --phase IMPLEMENT --exec "pwd > output/cwd.txt"
cat jobs/VERIFY-TEST/output/cwd.txt
```

**Expected**: Path ends with `jobs/VERIFY-TEST`

## Cleanup

```bash
# Remove test job and commits
git reset --hard HEAD~2  # Remove both test commits
rm -rf jobs/VERIFY-TEST
```

## Success Criteria

All tests pass:
- ✅ SAFE run creates commit
- ✅ VIOLATION run blocks commit (exit code 2)
- ✅ No unauthorized writes committed
- ✅ Working directory is correct (`jobs/JOB-ID/`)

## If Tests Fail

1. Check `ralph/run.sh` has execute permissions: `chmod +x ralph/run.sh`
2. Verify `jq` is installed: `jq --version`
3. Ensure clean git state: `git status`
4. Review error messages for specific validation failures

## Manual Verification (Optional)

Test additional scenarios:
- Invalid phase: `./ralph/run.sh VERIFY-TEST --phase INVALID`
- Missing job: `./ralph/run.sh NONEXIST-001 --phase IMPLEMENT`
- Exec failure: `./ralph/run.sh VERIFY-TEST --phase IMPLEMENT --exec "exit 1"`

All should fail gracefully with appropriate exit codes and error messages.
