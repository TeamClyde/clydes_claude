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

### `sessionStart/graph-tools-directive.mjs`

**Event:** `SessionStart`
**Purpose:** When `.claude-init/CODEBASE.md` exists in CWD, inject additionalContext directing graph-tools loading as turn-1 action.
**Behavior:**
- No `CODEBASE.md`: silent pass
- `CODEBASE.md` present: emit additionalContext with ToolSearch instruction
**Owner issue:** #31 (loading aspect)

### `preToolUse/graph-tools-enforcement.mjs`

**Event:** `PreToolUse` on `Grep` and `Glob` tools
**Purpose:** Block code-symbol Grep/Glob calls when graph tools are available; emit additionalContext with the equivalent graph-tool call.
**Behavior:**
- Pre-filter on `.claude-init/CODEBASE.md` existence
- Pattern classifier (regex + file scope)
- Block: returns `permissionDecision: deny` with helpful guidance in `permissionDecisionReason` field (per Claude Code PreToolUse hook API; `additionalContext` is for non-deny paths)
- Allow: silent pass
- Override: prefix pattern with `[grep-allowed]` marker; or `CLAUDE_DISABLE_WORKFLOW_HOOKS=1` env var
**Log file:** `.claude/logs/grep-blocks.jsonl`
**Owner issue:** #31 (drift aspect)

### `userPromptSubmit/slash-command-enforcement.mjs`

**Event:** `UserPromptSubmit`
**Purpose:** When user types `/<skill-name>`, inject additionalContext directing immediate Skill invocation. Acknowledged limitation: prose-injection only — orchestrator can ignore. Mechanical enforcement blocked on Claude Code hook API capability.
**Behavior:**
- Pattern match on `(?:^|\s)/[a-z][a-z0-9-]+(?=\s|$)`
- Validate against user-invocable skills list
- Emit additionalContext per match
**Override:** `CLAUDE_DISABLE_WORKFLOW_HOOKS=1`
**Owner issue:** #14 (closes with limitation note)
