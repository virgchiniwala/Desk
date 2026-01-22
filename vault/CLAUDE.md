# CLAUDE.md — Vault Operating Contract

**Applies to:** Claude Code, Codex, any agent operating on the `/vault` directory

This file defines how agents may **read, write, and reason about the Vault**.

The Vault is not a chat memory.
It is a **shared, durable knowledge system**.

Violating these rules corrupts organizational memory.

---

## 0. Vault Purpose (Non‑Negotiable)

The Vault exists to:
- externalize organizational knowledge
- preserve decisions and reasoning
- allow agents to reload context deliberately
- keep shared state synchronized with reality

The Vault does **not** exist to:
- brainstorm freely
- auto‑organize itself
- act as an autonomous knowledge graph
- be modified speculatively

If you are unsure where something belongs, **stop**.

---

## 1. Vault Structure (PARA‑based, Fixed)

```
/vault/
  01_Inbox/
  02_Projects/
  03_Areas/
  04_Knowledge/
  05_Archive/
  CLAUDE.md
```

This structure is stable.
Do not invent new top‑level folders.

---

## 2. Folder Semantics

### 01_Inbox/
Temporary holding area.

Used for:
- unprocessed notes
- raw inputs awaiting classification

Rules:
- nothing here is considered authoritative
- items must eventually move or be archived

---

### 02_Projects/
Active, goal‑bound initiatives.

Each project has its own folder:

```
02_Projects/<Project‑Name>/
  <Project‑Name>.md   ← project hub (source of truth)
  Ideas/
  Docs/
  Meetings/
```

Rules:
- the project hub file defines current status
- meetings update project reality
- ideas are linked, not merged prematurely

---

### 03_Areas/
Ongoing responsibilities without an end date.

Examples:
- Infrastructure
- Design System
- User Research

Rules:
- areas accumulate practices, not tasks
- avoid mixing project‑specific decisions here

---

### 04_Knowledge/
Generalizable, reusable knowledge.

Examples:
- frameworks
- patterns
- tools

Rules:
- content here should outlive any single project
- avoid copying project‑specific decisions

---

### 05_Archive/
Immutable historical record.

Used for:
- raw transcripts
- past meeting records
- deprecated material

Rules:
- archive files are never edited after creation
- corrections happen via new notes, not rewrites

---

## 3. Reading Rules (Context Loading)

Agents must **only read what they are instructed to read**.

Allowed:
- explicit file paths provided in a job plan
- linked documents referenced from those files

Not allowed:
- browsing the Vault
- sampling multiple projects “for context”
- inferring relevance heuristically

Context must be loaded deliberately.

---

## 4. Writing Rules (Hard Constraints)

### 4.1 Write Scope

Each job defines explicit write roots, e.g.:

```
Allowed write paths:
- /vault/02_Projects/Recipe‑Manager/
- /vault/05_Archive/Transcripts/
```

Writing outside these paths is forbidden.

---

### 4.2 No Silent Modification

Rules:
- never overwrite files silently
- preserve existing content unless instructed
- append or clearly mark changes

Decisions and state changes must be explicit.

---

### 4.3 Change Budget

Each job plan must state:
- expected number of files touched
- expected number of new files

If you exceed this budget:
- stop
- report deviation

---

## 5. Meeting Transcript Processing (Canonical Pattern)

Meetings synchronize reality → Vault state.

Required pipeline:

1. Archive raw transcript
   - location: `05_Archive/Transcripts/`
   - never edited

2. Create comprehensive meeting summary
   - minimum: ~1 page for 60+ min meeting
   - capture reasoning, alternatives, uncertainty

3. Plan all extractions *before writing*
   - explicit TODO list
   - no writing before plan exists

4. For each extraction:
   - read current hub state
   - identify delta
   - apply update

5. Produce a state‑sync report
   - what changed
   - what was created
   - what was intentionally left untouched

If any step cannot be completed safely, stop.

---

## 6. What to Actively Hunt For

While reading transcripts, actively extract:

- feature ideas
- new project sparks
- frameworks and mental models
- philosophies and working principles
- explicit decisions
- implicit decisions (including non‑decisions)
- status changes
- action items
- blockers

Missing content is unacceptable.

---

## 7. Quality Bar (Enforced)

Before marking work complete, verify:

- entire transcript was read
- all explicit decisions captured
- implicit decisions identified
- multiple ideas extracted where discussion warrants
- project hubs reflect post‑meeting reality
- archive remains immutable

Red flags:
- short summaries for long meetings
- only 1–2 ideas from brainstorming
- no state changes in status‑heavy meetings

If quality bar is not met, stop.

---

## 8. Linking Discipline

Links connect knowledge.
They do not replace structure.

Rules:
- link from project hubs to ideas and meetings
- do not duplicate content across folders
- prefer references over copies

---

## 9. Stop Conditions (Critical)

You must stop if:
- unsure where content belongs
- write scope is exceeded
- project ownership is unclear
- conflicting signals appear in transcripts
- instructions conflict with this file

Stopping preserves integrity.

---

## 10. Completion State

Vault jobs **never auto‑complete**.

They end in:
- `NEEDS_REVIEW`

Human approval is required before shared knowledge is trusted.

---

**End of file**

