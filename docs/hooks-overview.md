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

### `sessionStart/stack-hat-directive.mjs`

**Event:** `SessionStart`
**Purpose:** When `project.json` in CWD declares a non-empty `stacks` array, inject the matching catalog entries' `## Hat` guidance (specialist best-practices + tooling reminders), layered on SE-fundamentals.
**Behavior:**
- No `project.json`, no `stacks` field, or empty array: silent pass
- Reads each `~/.claude/stacks/<stack>.md`, extracts `## Hat`, composes them
- Size budget (~3200 chars ≈ 800 tokens): full inline when small; pointer-to-file directive when large
- Declared stack with no entry (or no `## Hat`): emits a one-line "no catalog entry yet" note, never fails
**Override:** `CLAUDE_DISABLE_WORKFLOW_HOOKS=1`

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

### `postToolUse/graph-tools-self-heal.mjs`

**Event:** `PostToolUse` on `mcp__codebase-memory-mcp__*` tools
**Purpose:** Catch "project not found" errors; resolve correct project from available indexed projects; update CLAUDE.md; emit additionalContext for retry.
**Behavior:**
- Re-entry guard prevents recursion (env var `CLAUDE_HOOK_GRAPH_TOOLS_HEAL_ACTIVE`)
- Match condition: tool name starts with `mcp__codebase-memory-mcp__` AND output contains `"project not found"`
- `available_projects` in the error response is an array of **name strings** (not objects) — this is the codebase-memory-mcp binary's actual format (verified 2026-05-09)
- Single project in `available_projects`: update CLAUDE.md's Codebase Knowledge Graph section directly; emit retry instruction
- Multiple projects in `available_projects`: emit additionalContext instructing Claude to call `list_projects()` to find CWD-matching entry (can't disambiguate from names alone)
- No `available_projects` (no indexed projects): emit additionalContext directing `/infra-init` run
- CLAUDE.md update targets the line: `- **Project name (codebase-memory-mcp):** \`{project-name}\` — pass as ...`
**Owner issue:** #28 (closes via self-heal hook; no write-site root-cause fix needed — all write sites already use `list_projects()` correctly)
