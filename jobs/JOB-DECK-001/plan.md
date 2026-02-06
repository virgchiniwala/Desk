# JOB-DECK-001 Plan

## Objective
Ship the smallest end-to-end Desk slice for deck refresh: user uploads Sentry CSV + prior PPTX template in chat, approves plan, Desk executes DAG tasks, and returns an editable `.pptx` artifact in `jobs/<JOB_ID>/output/` downloadable in UI.

## Inputs
- User-provided Sentry CSV attachment
- User-provided prior deck `.pptx` attachment (template/base deck)
- Optional audience prompt text in chat

## Tools
- Existing AI tools: `create_job`, `create_task`, `check_job_status`, `list_artifacts`
- Node worker + `TaskGraph` for DAG execution
- Python pipeline in `deck-gen/` (preferred v1 path)
- Existing download routes: `/artifacts/:jobId/*` and `/api/jobs/:id/artifacts`

## Constraints
- Follow `AGENTS.md`: planner/reviewer separation, job-first workspace, durable handoff files
- Keep scope to one shippable slice, no broad connectors/scheduling
- Security defaults required: strict command validation, path restrictions, no credential access
- Prefer structured task creation (`create_task` + dependencies), avoid free-form shelling
- Do not merge to `main`; use feature branch + PR

## Allowed Write Roots
- `jobs/JOB-DECK-001/`
- For implementation phase only (executor):
  - `server/lib/ai-agent.js`
  - `server/lib/task-graph.js`
  - `server/lib/worker.js`
  - `server/lib/worker-manager.js`
  - `server/lib/job-reader.js`
  - `server/routes/chat.js`
  - `server/routes/api.js`
  - `server/public/js/chat-client.js`
  - `server/db/migrations/003_deck_job_support.sql` (new)
  - `deck-gen/run_deck.sh`
  - `deck-gen/scripts/*` (minimal targeted edits only)
  - `server/test-*.js` and/or new focused tests under `server/`

## Expected Outputs
- Working upload -> plan approval -> DAG execution -> downloadable PPTX flow
- Deck artifact physically present under `jobs/<jobId>/output/*.pptx`
- Task-level artifact registration in DB (`task_artifacts`) and UI visibility
- SSE task update + artifact-ready events visible in chat panel
- Verification notes and executor handoff in job artifacts

## Phase Target
Current run phase: `PLAN`
Next execution order: `IMPLEMENT` -> `REVIEW` -> `VERIFY` -> `PACKAGE`

## Recommended V1 Deck Generation Approach
Use **Python-based template update (`python-pptx`) with deterministic update rules**, reusing `deck-gen/`.

Why this v1:
- Fastest to ship because repo already has near-complete Python pipeline and tests.
- Better template fidelity than generating a fresh deck from scratch.
- Deterministic mode is reviewable and safer than always-on LLM content mutation.

V1 behavior:
- Parse Sentry CSV metrics deterministically.
- Apply constrained placeholder/text/table replacements to prior deck.
- Produce editable `.pptx` in job `output/`.
- Keep LLM-assisted updates optional/guarded for a later phase.

## Step-by-Step Checklist (Executor)

### Phase IMPLEMENT
1. **Unify artifact file metadata plumbing**
- Fix `listJobOutputFiles()` consumers to handle actual returned types (currently mismatched object/string expectations).
- Ensure API and AI tool outputs return valid `{ filename, size, path, modified }`.

2. **Add chat-attachment to job-input copy bridge**
- On `create_job` (or first `create_task`), copy conversation attachments into `jobs/<jobId>/inputs/` with sanitized names.
- Persist mapping in DB or deterministic naming convention for task commands.

3. **Harden command validation and path policy**
- Restrict task commands to allowlisted executables (`python3`, `bash`, `node`, repo scripts).
- Block shell metacharacters and command chaining in task command strings.
- Require job-scoped read/write paths (`jobs/<JOB_ID>/inputs|output|tmp`).

4. **Implement deck pipeline task recipe**
- Add AI prompt guidance for standard deck DAG:
  - `prepare_inputs` (no blockers)
  - `parse_metrics` (blockedBy `prepare_inputs`)
  - `generate_updates` (blockedBy `parse_metrics`)
  - `build_deck` (blockedBy `generate_updates`)
  - `validate_deck` (blockedBy `build_deck`)
- Use `deck-gen/run_deck.sh` or direct scripts with explicit job paths.

5. **Register produced artifacts in DB**
- After successful task completion, scan `jobs/<jobId>/output/` for newly produced files and insert into `task_artifacts`.
- Deduplicate by `(task_id, filepath)`.

6. **Emit reliable SSE updates**
- Ensure worker/manager emits `task_update` from actual task transitions.
- Emit `artifact_ready` only for newly registered artifacts.
- Keep heartbeat events lightweight.

### Phase REVIEW
7. **Code + security review pass**
- Verify no path traversal, no credential file access, and no unsafe command execution path.
- Confirm DAG dependency handling and cycle checks are preserved.

### Phase VERIFY
8. **Automated verification**
- Run server tests and targeted deck pipeline tests.
- Run a local happy-path integration flow for one job:
  - upload CSV + PPTX
  - create tasks
  - execute worker
  - confirm downloadable `.pptx` appears

9. **Manual verification in UI**
- Open chat, verify task graph statuses update and artifact link downloads file.

### Phase PACKAGE
10. **Package outputs**
- Write concise runbook + known limits in `jobs/JOB-DECK-001/output/`.
- Update `progress.md` and `session-handoff.md` with evidence and next steps.

## Exact Files to Touch (Planned)
- `server/lib/job-reader.js`
- `server/routes/api.js`
- `server/lib/ai-agent.js`
- `server/lib/ai-agent-prompt.js`
- `server/lib/worker.js`
- `server/lib/worker-manager.js`
- `server/routes/chat.js`
- `server/lib/task-graph.js`
- `server/db/migrations/003_deck_job_support.sql` (new)
- `server/public/js/chat-client.js`
- `deck-gen/run_deck.sh`
- `deck-gen/scripts/parse_sentry_csv.py`
- `deck-gen/scripts/generate_slide_updates_mock.py` (if needed for deterministic fallback)
- `deck-gen/scripts/build_pptx.py`

## Tests to Run (Planned)
- `cd server && npm test` (or existing test entrypoints)
- `cd server && node test-security.js`
- `cd deck-gen && bash tests/test_multi_template.sh`
- `cd deck-gen && python -m pytest tests -q`
- End-to-end smoke:
  - start server + worker
  - create chat conversation
  - upload CSV + PPTX
  - run generated tasks
  - verify `jobs/<JOB_ID>/output/*.pptx` exists and downloads

## Acceptance Criteria
- User can upload CSV + prior PPTX in chat and approve a clear task DAG.
- Worker executes only READY tasks and respects dependencies.
- Deck output is a valid editable `.pptx` in job output.
- Artifact appears in task panel and downloads via UI route.
- Security checks prevent unsafe commands and path escapes.
- Progress/handoff docs updated with verification evidence.
