# AGENTS.md — Desk Executor Contract (v0.2)

**Applies to:** Claude Code (executor), Codex (planner/reviewer)

This is the execution contract for agents working in this repository.

If an instruction conflicts with this file, **this file wins**.

---

## 1. Role Separation

- Claude Code = executor
- Codex = planner / reviewer / decision support
- Ralph = loop + state enforcer

If a product decision is required, stop and escalate.

---

## 2. Mandatory Workspace and Artifacts

All work happens inside a job directory:

```
/jobs/<JOB_ID>/
  plan.md
  progress.md
  session-handoff.md
  output/
```

Rules:
- never write outside allowed roots
- `progress.md` is append-only
- `session-handoff.md` must be kept short and current

### session-handoff.md requirements
Must contain:
- Current state
- What worked (with evidence)
- What failed (and why)
- What’s next (ordered)
- Open risks / unknowns

This file is the handoff between sessions. Do not rely on chat memory.

---

## 3. Execution Protocol (Exact)

### Step 1 — Read state
Read:
- `plan.md`
- last entries in `progress.md`
- `session-handoff.md`
- `meta.json` if present

If anything is missing or unclear, stop.

### Step 2 — Validate the plan
A valid plan includes:
- objective
- inputs
- tools
- allowed write roots
- constraints
- expected outputs
- phase target (RESEARCH/PLAN/IMPLEMENT/REVIEW/VERIFY/PACKAGE)

If the plan is vague or unsafe, stop.

### Step 3 — Execute within the phase
Rules:
- do not jump phases
- do not expand scope
- keep changes incremental and logged

### Step 4 — Package
Put reviewable outputs in `output/`.
Clearly label generated vs sourced content.

### Step 5 — Finalise
End every run by:
- appending a final status line to `progress.md`
- updating `session-handoff.md`
- committing changes (if instructed by Ralph / runbook)

---

## 4. Context Hygiene

- Do not rely on auto-compact.
- If you compact, do it at phase boundaries.
- Prefer writing state to disk over keeping it in-chat.

---

## 5. Tool Usage and Permissions

Default:
- filesystem read/write limited to `/jobs/<JOB_ID>/`

Explicit approval required for:
- vault writes
- network access
- Linear updates
- writing outside job dir

Never assume permission.

---

## 6. Stop Conditions (Hard)

Stop if:
- scope expands beyond plan
- required inputs are missing
- instructions conflict
- repeated errors occur
- verification fails
- you are unsure where to put information (especially in vault)

Stopping preserves integrity.
Guessing corrupts state.

---

## 7. Linear Interaction

Linear is the source of truth for work state.

You MAY:
- update an issue only when explicitly instructed

You MAY NOT:
- create issues
- reprioritize
- close tickets without outputs

---

**End of file**

