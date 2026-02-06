# JOB-DECK-002 Plan

## Objective
Make the deck workflow operator-usable from UI: upload Sentry CSV + prior PPTX, review generated plan, explicitly approve, run tasks, and download artifact from one guided experience.

## Scope (UI-first)
- Add a focused "Deck Workflow" panel in chat view.
- Detect uploaded CSV/PPTX and show readiness state.
- Add actions:
  - `Generate Plan`
  - `Approve & Run`
- Render plan summary (task DAG) before execution.
- Keep backend minimal: reuse existing create_job/create_task/task execution/artifacts.

## Non-goals
- Generic workflow builder.
- Scheduling/automation.
- New data connectors.

## Inputs
- Existing chat uploads (`attachments` table)
- Existing task graph + worker + artifact APIs

## Constraints
- Keep to smallest shippable UX increment.
- Preserve security validation constraints.
- Keep changes scoped to chat UI + minimal API support.

## Allowed Write Roots (Implement phase)
- `jobs/JOB-DECK-002/`
- `/Users/vir.c/Desk-latest/server/views/chat.ejs`
- `/Users/vir.c/Desk-latest/server/public/js/chat-client.js`
- `/Users/vir.c/Desk-latest/server/public/css/chat.css`
- `/Users/vir.c/Desk-latest/server/routes/chat.js`
- `/Users/vir.c/Desk-latest/server/routes/api.js`
- `/Users/vir.c/Desk-latest/server/lib/ai-agent.js` (only if strictly needed)

## UX Slice Definition
1. User uploads files in chat.
2. UI identifies one CSV + one PPTX and marks "Ready".
3. Clicking `Generate Plan` calls a focused endpoint that:
- creates a proposed job id
- returns planned tasks and dependencies (no execution yet)
4. UI shows plan card + `Approve & Run` button.
5. Clicking `Approve & Run` creates job/tasks and starts execution.
6. Existing task panel + artifacts reflect progress and output.

## Acceptance Criteria
- Operator can complete workflow with no manual API/shell usage.
- Explicit approval step exists between upload and execution.
- Plan shown includes task names + dependencies.
- Artifact download available from same conversation view.

## Implementation Checklist
1. Add deck-workflow panel markup in `chat.ejs`.
2. Add readiness detection + UI state in `chat-client.js`.
3. Add endpoints:
- `POST /chat/:id/deck-plan` (returns plan only)
- `POST /chat/:id/deck-run` (create job/tasks and run)
4. Style panel in `chat.css`.
5. Reuse existing task/artifact refresh methods.
6. Verify with real fixture upload flow.

## Verify Commands (target)
- `node server/test-security.js`
- Manual flow in browser:
  - upload CSV/PPTX
  - generate plan
  - approve & run
  - confirm completed artifact + download
