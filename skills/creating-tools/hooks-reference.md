# Hooks Reference

Canonical hook reference for this repo. Verified against official documentation 2026-08-06:
[code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks), cross-checked against
the nine working hooks in `.claude/hooks/`.

This file is the repo's own reference. It replaced a delegation to
`plugin-dev:hook-development`, which was **removed** — see  <!-- ref-ok: provenance — records the removed skill this file replaces -->
[Why this file exists](#why-this-file-exists).

## Contents

- [Why this file exists](#why-this-file-exists)
- [Wiring — the wrapper that gets dropped silently](#wiring--the-wrapper-that-gets-dropped-silently)
- [Event catalogue](#event-catalogue)
- [Exit codes and the deny contract](#exit-codes-and-the-deny-contract)
- [House pattern](#house-pattern)
- [Windows](#windows)
- [Testing a hook](#testing-a-hook)

---

## Why this file exists

`plugin-dev:hook-development` was the only plugin-dev skill with a live claim on this repo. On  <!-- ref-ok: provenance — records the removed skill this file replaces -->
audit it failed on the claim itself:

| Its claim | Reality |
|---|---|
| settings.json format is *"No wrapper — events directly at top level"* | settings.json requires the `hooks` wrapper. The repo's nine working hooks all use it. |
| Nine events exist | Thirty-one events exist. It predates `SubagentStart`, `PostToolUseFailure`, `PostToolBatch`, `PermissionRequest`, `TaskCreated`, `FileChanged`, and more. |

A wrong wiring format is the worst possible defect here, because an unrecognized top-level key
in settings.json is **dropped without error**. The hook block reads as correct and never fires.
Verify against the official docs, not against a cached plugin snapshot.

---

## Wiring — the wrapper that gets dropped silently

Hooks are declared in `.claude/settings.json` under a top-level `hooks` key:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/preToolUse/my-hook.mjs", "timeout": 5 }
        ]
      }
    ]
  }
}
```

Note the two nested `hooks` keys — the outer one groups events, the inner one lists handlers for
a matcher. Both are required.

**Matcher evaluation** (from the official docs):

| Matcher form | Evaluated as |
|---|---|
| `"*"`, `""`, or omitted | match all |
| Only letters, digits, `_`, `-`, spaces, `,`, `\|` | exact string or pipe/comma list — `Bash`, `Edit\|Write` |
| Anything else | JavaScript regex, **unanchored** — `^Notebook`, `mcp__memory__.*` |

That third row is a trap: `Grep|Glob` is a literal list, but `mcp__codebase-memory-mcp__.*`
contains `.` and `*` so it becomes a regex. Both forms appear in this repo's settings.json.

**Config locations**, narrowest wins:

| Location | Scope | Committed |
|---|---|---|
| `~/.claude/settings.json` | every project | no |
| `.claude/settings.json` | this project | **yes** — where this repo's hooks live |
| `.claude/settings.local.json` | this project | no (gitignored) |

---

## Event catalogue

Thirty-one events. The ones this repo uses are marked ●.

| Event | Fires |
|---|---|
| ● `SessionStart` | session begins or resumes |
| `Setup` | `--init-only`, or `--init`/`--maintenance` in `-p` mode |
| ● `UserPromptSubmit` | prompt submitted, before Claude sees it |
| `UserPromptExpansion` | a typed command expands into a prompt |
| ● `PreToolUse` | before a tool call executes |
| `PermissionRequest` | a tool call needs a permission decision |
| `PermissionDenied` | a tool call was denied by the auto-mode classifier |
| ● `PostToolUse` | after a tool call **succeeds** |
| `PostToolUseFailure` | after a tool call **fails** |
| `PostToolBatch` | after a parallel batch resolves, before the next model call |
| `Notification` | Claude Code sends a notification |
| `MessageDisplay` | assistant text is displayed |
| `SubagentStart` / `SubagentStop` | subagent spawned / finished |
| `TaskCreated` / `TaskCompleted` | task created / marked complete |
| `Stop` | Claude finishes responding |
| `StopFailure` | turn ends on an API error |
| `TeammateIdle` | an agent-team teammate is about to idle |
| `InstructionsLoaded` | a CLAUDE.md or `.claude/rules/*.md` loads |
| `ConfigChange` | a config file changes mid-session |
| `CwdChanged` / `DirectoryAdded` | cwd changed / `/add-dir` |
| `FileChanged` | a watched file changes on disk |
| `WorktreeCreate` / `WorktreeRemove` | worktree lifecycle |
| `PreCompact` / `PostCompact` | around context compaction |
| `Elicitation` / `ElicitationResult` | MCP server requests user input |

`PostToolUse` fires only on success. A hook that must observe failures needs
`PostToolUseFailure` as well — registering only `PostToolUse` and expecting both is a silent gap.

---

## Exit codes and the deny contract

| Exit | Meaning |
|---|---|
| `0` | success. stdout is parsed as JSON for decision fields; stderr goes to the debug log only. |
| `2` | blocking error. stdout/JSON is **ignored**; stderr is fed to Claude as the error message. |
| other | non-blocking error. The action proceeds; stderr shows in the transcript with a hook-error notice. |

Only some events block on exit 2 — `PreToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`,
`PreCompact`, `PostToolBatch`, `ConfigChange`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`,
`PermissionRequest`, `WorktreeCreate`, and the elicitation pair. On `PostToolUse`,
`SessionStart`, `Notification`, and `SubagentStart`, exit 2 does **not** block.

**This repo denies with JSON and exit 0, never with exit 2.** See
[git-prohibitions.mjs:150-158](.claude/hooks/preToolUse/git-prohibitions.mjs#L150-L158):

```js
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}) + '\n');
process.exit(0);
```

The reason: exit 2 surfaces raw stderr as an error, while `permissionDecisionReason` carries a
structured, actionable message and keeps the hook's own failures distinguishable from its
decisions. A hook that crashes exits non-zero; a hook that decides exits 0.

Useful output fields:

| Field | Events |
|---|---|
| `hookSpecificOutput.permissionDecision` (`allow`/`deny`/`ask`/`defer`) + `permissionDecisionReason` | `PreToolUse` |
| `hookSpecificOutput.additionalContext` | `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `SubagentStart` |
| `decision: "block"` + `reason` | `PostToolUse`, `Stop`, `SubagentStop`, `UserPromptSubmit` |
| `continue: false` + `stopReason` | all events |
| `systemMessage` | all events — warning shown to the user |

---

## House pattern

`.claude/hooks/<eventCamelCase>/<name>.mjs`, with a sibling `<name>.test.mjs`. Node ESM,
`#!/usr/bin/env node`.

Every hook in this repo follows the same five rules:

1. **Header docblock** stating Event, Purpose, Short-circuit order, Override, and runtime budget.
   Where the hook is a safety-net rather than a security boundary, say so — `git-prohibitions.mjs`
   documents that command-string interception is trivially evadable and out of scope.
2. **`CLAUDE_DISABLE_WORKFLOW_HOOKS=1` checked first**, before anything else, as a full
   emergency rollback.
3. **Fail open.** Malformed stdin, a missing field, an unexpected tool name — every one of these
   exits 0 and passes through. A hook that throws on unexpected input blocks the user's work for
   a bug in the hook.
4. **Narrow before matching.** Filter on `tool_name`, then extract, then run detectors. Cheapest
   rejection first.
5. **A documented bypass.** `git-prohibitions.mjs` accepts a `[git-allowed]` **prefix** —
   deliberately prefix-only, since a substring match would let the marker hide inside a commit
   message.

Input arrives as JSON on stdin: `tool_name`, `tool_input`, `session_id`, `cwd`, plus
event-specific fields.

---

## Windows

`readFileSync('/dev/stdin')` does not work reliably on Windows. Every hook here falls back to a
synchronous `readSync(0, ...)` loop on fd 0 — see
[git-prohibitions.mjs:43-67](.claude/hooks/preToolUse/git-prohibitions.mjs#L43-L67). Copy that
block verbatim into any new hook; it is the difference between a hook that works and one that
silently reads nothing and passes everything.

Paths handed to native binaries must be OS-native — see `rules/filesystem/path-portability.md`.

---

## Testing a hook

Hooks are the one component type in this repo with real unit tests, because they are plain
scripts with a stdin/stdout contract. Every hook has a sibling `.test.mjs` running under
`npm test` (`node:test`).

Drive the hook by piping a JSON payload and asserting on stdout and the exit code:

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git add -A"}}' \
  | node .claude/hooks/preToolUse/git-prohibitions.mjs
```

Cover at minimum: the deny case, the pass case, the bypass marker, malformed input (must exit 0),
and a wrong-tool payload (must exit 0). Wiring is not covered by these tests — after editing
settings.json, confirm the hook actually fires, since a mis-keyed block fails silently.
