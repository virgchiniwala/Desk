# Known Limitations (JOB-DECK-001)

1. UI workflow is not yet guided end-to-end.
- Upload + execution exists, but no dedicated deck wizard.

2. Deterministic update quality is basic.
- Safe/reviewable, but semantic quality is lower than LLM-assisted slide editing.

3. Template-dependent integration test gap.
- `deck-gen/tests/test_multi_template.sh` requires template files under `deck-gen/templates/`.

4. Artifact registration granularity.
- Same output file can be registered by multiple tasks (by design currently).

5. Chat attachment payload linkage.
- Message-level attachment IDs are not fully used; conversation-level attachment lookup is used.

6. Worker command model.
- Commands are still stored as strings; parser is quote-aware but not yet structured argv in DB.
