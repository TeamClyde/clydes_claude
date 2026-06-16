# Stack Setup Record

Per-repo provenance + audit trail for tools installed via the `project-setup` Stack Setup
phase (Phase 3.5). Records what was set up *in this repo*, with the install-vetting verdict
for each tool. This file is committed and repo-local — distinct from the global
`~/.claude/stacks/<stack>.md` catalog entries (reusable stack knowledge).

**Detected stacks:** <comma-separated, filled at setup time — e.g. `python`>
**Last updated:** <YYYY-MM-DD>

## Installed Tools

| Stack | Tool | Version | Install location | Source | Gate 1 (Reputation) | Gate 2 (Fit) | Gate 3 (Security) | Date |
|-------|------|---------|------------------|--------|---------------------|--------------|-------------------|------|
| <python> | <ruff> | <0.x.y> | <project venv / global / pipx> | <pip install ruff> | <GREEN> | <does> | <GREEN> | <YYYY-MM-DD> |

> One row per tool the user accepted. Tools declined at the funnel prompt are not recorded.
> Gate verdicts are copied verbatim from the `vet-install` consolidated report.
