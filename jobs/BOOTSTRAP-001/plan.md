# BOOTSTRAP-001 Implementation Plan

## Phase: IMPLEMENT

### Directory Structure to Create

```
/
├── jobs/                    # Job execution workspace (already exists from PLAN)
│   └── BOOTSTRAP-001/       # This bootstrap job
├── ralph/                   # Ralph workflow scripts
├── vault/                   # Knowledge base and documentation
└── .claude/contexts/        # Claude context files
```

### Files to Create

#### 1. Canonical Documentation (Repo Root)

**AGENTS.md**
- Purpose: Agent registry and role definitions
- Content: Empty template with header "# Desk Agents"
- Location: `/AGENTS.md`

**RALPH.md**
- Purpose: Ralph workflow system documentation
- Content: Minimal Ralph overview and job workflow
- Location: `/RALPH.md`

**vault/CLAUDE.md**
- Purpose: Claude-specific instructions and context
- Content: Desk invariants, job system rules, phase enforcement
- Location: `/vault/CLAUDE.md`

#### 2. Ralph Scripts

**ralph/new-job.sh**
- Purpose: Create new job with proper structure
- Location: `/ralph/new-job.sh`
- Must enforce:
  - Job ID format: `{PROJECT}-{NNN}` (e.g., BOOTSTRAP-001)
  - Create subdirs: inputs/, output/, tmp/
  - Generate required artifacts: plan.md, progress.md, session-handoff.md, meta.json
  - Validate job ID uniqueness
  - Set executable permissions
- Input: Job ID, optional title
- Output: New job directory in `/jobs/{JOB_ID}/`

**ralph/run.sh**
- Purpose: Execute job phases with validation
- Location: `/ralph/run.sh`
- Must enforce:
  - Phase sequence: PLAN → IMPLEMENT → PACKAGE
  - Single phase per execution
  - Status validation before phase transition
  - Elevated permission checks from meta.json
  - Path restriction enforcement
  - Git commit checkpoints per phase
- Input: Job ID, phase name
- Output: Execute phase, update progress.md, git commit

### Implementation Sequence

1. Create directory structure:
   - `mkdir -p ralph vault .claude/contexts`

2. Create canonical docs:
   - Write `/AGENTS.md` (empty template)
   - Write `/RALPH.md` (minimal workflow doc)
   - Write `/vault/CLAUDE.md` (Desk invariants)

3. Create ralph scripts:
   - Write `/ralph/new-job.sh` with job creation logic
   - Write `/ralph/run.sh` with phase execution logic
   - `chmod +x ralph/*.sh`

4. Update job artifacts:
   - Update `progress.md` → Phase: IMPLEMENT, Status: DONE
   - Update `session-handoff.md` → Ready for PACKAGE

5. Git checkpoint:
   - `git add .`
   - `git commit -m "Desk: BOOTSTRAP-001 — IMPLEMENT — checkpoint"`

### Acceptance Criteria

**DONE:**
- ✅ All directories exist: `/jobs`, `/ralph`, `/vault`, `/.claude/contexts`
- ✅ All canonical docs exist with proper content
- ✅ Both ralph scripts exist, are executable, and enforce rules
- ✅ Scripts validated with test execution (dry run)
- ✅ progress.md shows Phase: IMPLEMENT, Status: DONE
- ✅ Git commit created with checkpoint message

**NEEDS_REVIEW:**
- ⚠️ Script logic incomplete or unclear enforcement
- ⚠️ Missing required validation in scripts
- ⚠️ Unclear error handling in ralph scripts
- ⚠️ Documentation incomplete or ambiguous

**BLOCKED:**
- 🚫 Cannot create directories (permission issues)
- 🚫 Git operations fail
- 🚫 Script requirements unclear from specification

## Ralph Script Requirements Detail

### new-job.sh Enforcement Rules
```bash
# Must validate:
1. Job ID format: PROJECT-NNN (uppercase project, zero-padded number)
2. Job ID uniqueness (no existing /jobs/{JOB_ID}/)
3. Create structure: {JOB_ID}/{inputs,output,tmp}/
4. Generate artifacts with templates
5. Exit codes: 0=success, 1=validation fail, 2=system error
```

### run.sh Enforcement Rules
```bash
# Must validate:
1. Job exists in /jobs/
2. meta.json exists and is valid JSON
3. Phase is valid: PLAN|IMPLEMENT|PACKAGE
4. Phase sequence respected (no skip ahead)
5. Elevated permissions checked before repo-root writes
6. Path restrictions enforced (only allowed paths writable)
7. Git checkpoint after successful phase
8. Exit codes: 0=success, 1=validation fail, 2=permission denied
```

## Phase Transition Logic

```
PLAN → status=DONE → allow IMPLEMENT
IMPLEMENT → status=DONE → allow PACKAGE
PACKAGE → status=DONE → job complete
```

Status values: `DONE`, `NEEDS_REVIEW`, `BLOCKED`
