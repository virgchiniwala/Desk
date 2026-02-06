# Ship Checklist (JOB-DECK-001)

## Functional
- [x] Upload CSV + PPTX through chat
- [x] Create job and DAG tasks
- [x] Execute READY tasks via worker
- [x] Produce editable PPTX artifact in `jobs/<JOB_ID>/output/`
- [x] List/download artifact in UI/API

## Security
- [x] Command validation allowlist + blocked patterns
- [x] Path traversal checks for job/file routes
- [x] Security test suite passing (`server/test-security.js`)

## Reliability
- [x] Worker status events parseable for SSE updates
- [x] Artifact event dedupe cache bounded (TTL + max size)
- [x] Sessions schema fixed for connect-sqlite3 compatibility

## Verification Evidence
- [x] `jobs/JOB-DECK-001/output/verify-evidence.md`
- [x] Validated PPTX outputs from real fixture runs

## Remaining Before UI-First Follow-up
- [ ] Build guided UI workflow for deck generation (JOB-DECK-002)
- [ ] Improve deterministic slide update quality
- [ ] Add integration tests for full upload->run->download path
