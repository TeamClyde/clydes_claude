# Workflow Hooks Overview

This repo defines several Claude Code hooks at `.claude/hooks/<event>/<intent>.mjs`. Each hook is a Node.js ESM script invoked by the Claude Code harness at the corresponding event. Registration is in `.claude/settings.json`.

**Emergency rollback:** Set `CLAUDE_DISABLE_WORKFLOW_HOOKS=1` to disable all workflow hooks (each hook checks this env var as its first action).

---

## Hooks

### `preToolUse/agent-model-pinning.mjs`

**Event:** `PreToolUse` on `Agent` tool
**Purpose:** Audit Agent dispatches; pin Haiku for known-cheap subagents via frontmatter; inject Sonnet default when model unset; log overrides.
**Behavior:**
- Frontmatter-pinned subagents (model: haiku in agent file): pass through, frontmatter wins
- Other subagents with no model: inject `model: sonnet` (system default explicit)
- Other subagents with `model: opus` (or override): log to `.claude/logs/agent-dispatches.jsonl`; warn on stderr if no `model_override_reason` provided
- Never blocks. Exit 0 on all paths.
**Log file:** `.claude/logs/agent-dispatches.jsonl`
**Owner issue:** #30, #32 (and partial #31)
