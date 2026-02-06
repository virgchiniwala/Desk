# Desk Deck Workflow Runbook (v1)

## Goal
Generate an updated editable PPTX from:
- Sentry CSV export
- Prior sprint deck template

## Operator Steps

1. Login to Desk and open chat.
2. Upload both files:
- `*.csv` Sentry export
- prior `*.pptx` template deck
3. Request deck generation in chat and review the proposed task DAG.
4. Approve plan.
5. Wait for task statuses to reach `COMPLETED`.
6. Open task panel artifacts.
7. Download generated PPTX from artifact link.
8. Validate deck opens/editable in PowerPoint or Google Slides import.

## Expected Task Shape
- `build_deck`
- `validate_deck` (blocked by `build_deck`)

## Output Location
- Filesystem: `jobs/<JOB_ID>/output/*.pptx`
- UI: artifact cards in chat task panel
- Route: `/artifacts/<JOB_ID>/output/<filename>`

## Troubleshooting
- If task fails with command/path errors:
  - confirm command references `jobs/<JOB_ID>/inputs/...` and `jobs/<JOB_ID>/output/...`
- If artifact not shown:
  - refresh chat task panel and check `/api/jobs/<JOB_ID>/artifacts`
- If CSV parse fails:
  - ensure export includes count/events-like columns

## Security Expectations
- Commands must pass allowlist/blocklist validation.
- Cross-job path references are blocked.
- No system path access (`/etc`, `.env`, ssh/aws creds).
