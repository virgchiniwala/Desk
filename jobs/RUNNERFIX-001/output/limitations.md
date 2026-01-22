# ralph/run.sh Known Limitations

## Technical Dependencies

### Required Tools

**jq**: JSON parsing for `meta.json` files
- **Required version**: 1.5+
- **Install**: `brew install jq` (macOS), `apt-get install jq` (Linux)
- **Failure mode**: Script exits with error if `jq` not found

**git**: Version control operations
- **Required version**: 2.0+
- **Assumed**: Available in PATH
- **Failure mode**: Script exits if git commands fail

**bash**: Shell interpreter
- **Required version**: 4.0+
- **Notes**: Uses `bash -lc` for exec commands (login shell)
- **Limitation**: Exec commands inherit bash restrictions

## Platform Assumptions

### Tested Platforms
- ✅ macOS (Darwin) — Primary development environment
- ⚠️ Linux — Expected to work (requires testing)
- ❌ Windows (WSL) — Untested, may have path issues

### File System
- **Assumption**: Case-sensitive file system
- **Assumption**: POSIX-compliant paths
- **Limitation**: No Windows native paths (C:\...) support

## Shell Environment

### Login Shell (`bash -lc`)
- **Behavior**: Exec commands run in login shell
- **Consequence**: Loads user's bash profile (`.bash_profile`, `.bashrc`)
- **Limitation**: Environment may differ from script execution context
- **Risk**: Profile initialization errors can break exec

### Working Directory
- **Guarantee**: Exec runs in `jobs/JOB-ID/`
- **Limitation**: Relative paths in exec resolve from job directory
- **Example**: `../sibling-job/` would access another job's directory
- **Risk**: Jobs can read (but not write) sibling jobs if elevation allows

## Git Operations

### Commit Behavior
- **Assumption**: Clean working directory before run
- **Limitation**: Untracked files outside job directory are not cleaned
- **Consequence**: Failed runs leave untracked files (must manually clean)

### Stage and Commit
- **Operation**: `git add .` stages all changes
- **Limitation**: Cannot selectively stage files within job directory
- **Consequence**: All changes in allowed paths are committed together

### Merge Conflicts
- **Not Handled**: Script does not detect or resolve merge conflicts
- **Failure Mode**: Git commit may fail if conflicts exist
- **Recovery**: Manual intervention required

## Validation Limitations

### Postflight Validation
- **Detection**: Checks `git status --porcelain` for unauthorized writes
- **Limitation**: Cannot detect writes that are immediately deleted by exec
- **Example**: `touch ../../bad.txt && rm ../../bad.txt` would bypass detection
- **Mitigation**: Exit code 3 prevents commit if exec fails

### Path Traversal
- **Protection**: Postflight checks file paths after exec completes
- **Limitation**: Does not prevent writes during exec (only blocks commit)
- **Consequence**: Unauthorized files may exist briefly before postflight fails

### Elevated Jobs
- **Risk**: `elevated=true` jobs can write to additional paths
- **Limitation**: No runtime validation of `allowedPaths` correctness
- **Assumption**: `meta.json` allowedPaths are correct and safe
- **Consequence**: Misconfigured elevated jobs can write anywhere allowed

## Execution Limitations

### Exec Command
- **Single Command**: `--exec` accepts one command string
- **Workaround**: Use `bash -c "cmd1 && cmd2 && cmd3"` for sequences
- **Limitation**: No support for multiple `--exec` flags

### Exit Code Handling
- **Captured**: Exec exit code determines success/failure
- **Limitation**: Postflight runs only if exec succeeds
- **Consequence**: Cannot validate partial writes after exec failure

### Timeout
- **Not Implemented**: No timeout for exec commands
- **Risk**: Long-running or hanging commands block indefinitely
- **Mitigation**: User must manually terminate process

## Concurrency

### Single Execution
- **Assumption**: One runner instance per job at a time
- **Limitation**: No file locking or concurrency control
- **Risk**: Race conditions if multiple runners access same job
- **Consequence**: Git conflicts or inconsistent state

### Parallel Jobs
- **Supported**: Different jobs can run in parallel
- **Limitation**: No coordination between jobs
- **Risk**: Jobs may conflict if writing to overlapping elevated paths

## Automation Stop Conditions

**Do NOT run ralph/run.sh unattended unless**:
1. ✅ Job `meta.json` exists with correct `allowedPaths`
2. ✅ Exec command is known-safe (no destructive operations)
3. ✅ Working directory is clean (no pending changes)
4. ✅ Job artifacts exist (plan.md, progress.md, session-handoff.md)
5. ✅ Monitoring in place to detect hanging exec commands

**Hard Stop Conditions for Automation**:
- ❌ Never run with `--skip-postflight` unattended
- ❌ Never run elevated jobs without pre-validation
- ❌ Never run without `--exec` flag (manual work required)
- ❌ Never run if git state is dirty (pending changes)
- ❌ Never run without timeout wrapper (risk of hanging)

## Future Improvements

**Not Implemented (Intentionally)**:
- Job queue system (out of scope)
- Background worker automation (requires RUNNER-001)
- Retry logic (should be handled by caller)
- Rollback on partial failure (git handles this)
- Multi-command exec support (use bash chaining)
- Interactive mode (design is non-interactive)
- Timeout enforcement (caller responsibility)
- File locking (caller must serialize)

## Known Safe Patterns

**Safe for automation**:
```bash
./ralph/run.sh JOB-ID --phase PHASE --exec "echo 'data' > output/result.txt"
./ralph/run.sh JOB-ID --phase PHASE --exec "cat inputs/* | process > output/out.txt"
./ralph/run.sh JOB-ID --phase PHASE --exec "bash tmp/script.sh"
```

**Unsafe for unattended automation**:
```bash
# No exec (requires manual work)
./ralph/run.sh JOB-ID --phase PHASE

# Skip postflight (no validation)
./ralph/run.sh JOB-ID --phase PHASE --exec "cmd" --skip-postflight

# Destructive operations
./ralph/run.sh JOB-ID --phase PHASE --exec "rm -rf important/"

# External network calls (may hang)
./ralph/run.sh JOB-ID --phase PHASE --exec "curl slow-api.com"
```

## Error Recovery

**If runner fails mid-execution**:
1. Check exit code (0/1/2/3) to determine failure type
2. Review error messages for specific validation failures
3. Inspect git status for uncommitted changes
4. Manually clean unauthorized files if postflight failed
5. Fix underlying issue before retry

**Git state recovery**:
```bash
# Discard uncommitted changes
git reset --hard HEAD

# Remove untracked files
git clean -fd
```
