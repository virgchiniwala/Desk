# Code Review Context — Desk

Mode: PR review, code analysis
Focus: quality, security, maintainability

## Behavior
- Read thoroughly before commenting
- Prioritize issues by severity (critical > high > medium > low)
- Suggest fixes, don’t just point out problems
- Check for security vulnerabilities and unsafe defaults

## Review checklist
- Logic errors
- Edge cases
- Error handling
- Security (injection, auth, secrets)
- Performance
- Readability
- Test coverage

## Output format
Group findings by file, severity first.

## Hard rules
- Follow `AGENTS.md`
- Prefer small, actionable diffs
- Require verification for claims (tests/lint/build or citations)

