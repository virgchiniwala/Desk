# RALPH.md — Desk Loop Config (v0.2)

**Status:** v0.2 (adds session memory + phase boundaries)

Ralph is orchestration, not intelligence.
Ralph enforces the execution contract in `AGENTS.md`.

---

## 0. Scope

This config governs:
- how a run starts
- what state is read/written
- when Claude Code is invoked
- how we decide to continue/stop
- how we record progress + commit
- optional Linear updates (explicit enable only)

Out of scope (MVP):
- autonomous multi-agent choreography
- background daemons
- speculative exploration of vault/repo

---

## 1. Required Repo Structure

```
AGENTS.md
/jobs/
/ralph/
/vault/
/.claude/
```

Create if missing:

```
mkdir -p jobs ralph vault .claude
```

---

## 2. Job Workspace Layout

Every job lives under:

```
/jobs/<JOB_ID>/
  /inputs/
  plan.md
  progress.md
  /output/
  /tmp/
  meta.json
  session-handoff.md
```

### session-handoff.md (new)
This is the durable handoff between Claude Code sessions. It must be short.

Required sections:
- **Current state** (what is true now)
- **What worked (with evidence)**
- **What failed (and why)**
- **What’s next (ordered steps)**
- **Open risks / unknowns**

Ralph treats this as mandatory for long-running work.

---

## 3. Ralph State Model

States:
- PLANNED
- RUNNING
- NEEDS_REVIEW
- BLOCKED
- DONE

Allowed transitions:
- PLANNED → RUNNING
- RUNNING → NEEDS_REVIEW | BLOCKED
- NEEDS_REVIEW → RUNNING | DONE
- BLOCKED → PLANNED

No other transitions.

---

## 4. Phase Boundaries (New)

Ralph runs a job in *phases*. Each phase ends at a clean boundary.

Default phases:
1. **RESEARCH** (understand; no writes outside job dir)
2. **PLAN** (write/adjust plan + extraction checklist)
3. **IMPLEMENT** (code/changes)
4. **REVIEW** (self-review; prepare for human)
5. **VERIFY** (tests/lint/build; fix regressions)
6. **PACKAGE** (final outputs)

### Why phases exist
- They reduce context rot.
- They create natural points to manually compact.
- They make partial progress reviewable.

Ralph does *not* auto-compact. It only *nudges* (see §7).

---

## 5. Start-of-Run Ritual (Preflight)

Before invoking Claude Code:

1) **Resolve job**
- ensure job dir exists
- ensure `plan.md`, `progress.md`, `meta.json` exist
- ensure `session-handoff.md` exists (create template if missing)

2) **Read state**
- read `plan.md`
- read last ~50 lines of `progress.md`
- read `session-handoff.md`
- read `meta.json`

3) **Repo sanity**
- working tree clean OR changes strictly inside `/jobs/<JOB_ID>/`
- branch matches `ralph/<JOB_ID>` (recommended)

4) **Permissions check**
Default:
- FS read/write limited to `/jobs/<JOB_ID>/`
- network off
- Linear MCP off
- vault write off

If a plan requires elevation, it must be explicit and time-bounded (see §8).

---

## 6. Claude Code Invocation Contract

Ralph invokes Claude Code with:
- working directory = job dir
- explicit allowed tools for this run
- explicit allowed write roots
- phase goal (one phase per invocation in MVP)

**MVP rule:** one run = one phase.

This forces clean checkpoints and avoids runaway sessions.

---

## 7. Context Hygiene (Nudges, Not Automation)

### 7.1 Manual compact policy
- Do **not** rely on auto-compact.
- Compact only at phase boundaries.

### 7.2 Tool-call counter nudge (optional)
Ralph may emit a warning after N tool calls *within a phase*:
> “Tool call threshold reached — consider manual compact before next phase.”

This is advisory only. It must not force compaction mid-phase.

---

## 8. Permissions and Elevation

Elevation is per-run and explicit.

Possible elevations:
- enable vault writes (scoped paths only)
- enable network
- enable Linear MCP updates
- allow writes outside job dir (rare; must justify)

Rules:
- elevation must be declared in `plan.md`
- enabled by human/Codex
- logged to `progress.md`

---

## 9. End-of-Run Ritual (Postflight)

After Claude Code completes:

1) **Validate artifacts**
- `progress.md` appended with end status line
- `session-handoff.md` updated
- outputs exist in `/output` if phase expects them
- `meta.json.status` consistent

2) **Verification policy**
- If phase is IMPLEMENT/VERIFY: run tests/lint/build (as defined by repo)
- If verification fails: stop and mark BLOCKED (do not continue phases)

3) **Commit discipline**
Commit at end of each phase with:

```
Desk: <JOB_ID> — <phase> — <short outcome>

Status: <DONE|NEEDS_REVIEW|BLOCKED|RUNNING>
```

No empty commits.

4) **Optional Linear update**
Only if explicitly enabled:
- set issue status based on `meta.json.status`
- attach/link outputs

Failures are logged; no auto-retry.

---

## 10. Vault Interaction (Strict)

Vault writes are **never** default.

If enabled, the job must:
- follow `/vault/CLAUDE.md`
- end in `NEEDS_REVIEW`

Ralph must block any attempt to write outside the allowed vault write roots.

---

## 11. Minimal Runbook (Local)

### Create a job

```
JOB_ID=US-123
mkdir -p jobs/$JOB_ID/{inputs,output,tmp}
: > jobs/$JOB_ID/progress.md
cat > jobs/$JOB_ID/session-handoff.md <<'MD'
# Session Handoff

## Current state

## What worked (with evidence)

## What failed (and why)

## What’s next (ordered)

## Open risks / unknowns
MD
```

### Run a single phase

```
./ralph/run.sh $JOB_ID --phase RESEARCH
./ralph/run.sh $JOB_ID --phase PLAN
./ralph/run.sh $JOB_ID --phase IMPLEMENT
```

---

**End of file**

