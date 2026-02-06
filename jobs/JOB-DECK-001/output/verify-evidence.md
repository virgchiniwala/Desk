# JOB-DECK-001 Verify Evidence

## E2E Conversation Flow Evidence

### Conversation + uploads
- Conversation created via `/chat` -> redirected to `/chat/1`
- Uploaded fixtures to conversation 1:
  - `Discover_2026-January-28_89777.csv`
  - `Oobee Sprint Review - Jan 29.pptx`

### Job and DAG tasks created
- Job `DECK-101`
  - `build_deck` (READY -> COMPLETED)
  - `validate_deck` (PENDING -> COMPLETED, blocked by `build_deck`)
- Job `DECK-102`
  - `build_deck` (repo-relative command paths) -> COMPLETED first attempt

### Output artifacts (filesystem)
- `jobs/DECK-101/output/e2e-output.pptx`
- `jobs/DECK-102/output/relative-output.pptx`

### Output artifacts (DB registration)
- `task_artifacts` rows exist for both jobs:
  - `DECK-101`: `e2e-output.pptx` (task 1 and task 2)
  - `DECK-102`: `relative-output.pptx` (task 3)

### Artifact route
- Artifact download route returned `200` with full payload size for generated PPTX.

## Validation Commands
- `python3 deck-gen/scripts/validate_pptx.py jobs/DECK-101/output/e2e-output.pptx` -> valid
- `python3 deck-gen/scripts/validate_pptx.py jobs/DECK-102/output/relative-output.pptx` -> valid
- `node server/test-security.js` -> 10/10 pass

## Key Fix Proven by E2E
- Worker execution CWD switched to repo root, enabling repo-relative task commands (e.g. `bash deck-gen/run_deck.sh ...`) to succeed without manual absolute-path rewrites.
