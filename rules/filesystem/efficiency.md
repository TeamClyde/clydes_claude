# Filesystem Efficiency Rules

## Scope Before Acting

Before reading or searching files, identify the minimum set needed. Do not read files speculatively. If a plan doc exists for the current task, read it first — it should contain the file paths, function names, and data structures needed. Only use Glob or Grep if the plan doc is missing that context.

## Explore vs. Read — Targeted Question Heuristic

Before accessing a file, apply this decision tree:

| Question type | Line range known? | Tool |
|---|---|---|
| Need a specific fact or summary (step list, function names, structure overview) | No | Dispatch Explore with a targeted question |
| Need specific lines already identified | Yes | Read with `offset` + `limit` |
| Need full file logic or complete structure | Either | Read (full) |

**Dispatch Explore when** your question could be answered in ~15 lines and you don't know where in the file the answer lives. A targeted Explore call returns a concise summary without loading hundreds of lines into context.

**Do not Read a file in full** to extract one piece of information from an unknown location. This is the most common avoidable token waste during planning.

## Targeted Reads

When extracting a specific function or section from a file, read only the relevant lines. The heuristic: a single function or method is typically 20–40 lines. Use `offset` and `limit` parameters on Read rather than dumping the whole file.

## Prohibited Glob Patterns (unscoped)

Never call Glob with these patterns without a `path` parameter:
- `**/*.py`
- `**/*.yml` / `**/*.yaml`
- `**/*.json`
- `**/*.ts` / `**/*.js`
- `**/*`

Always scope with `path="src/function/"` or equivalent. A broad glob on a repo with 50+ files produces noise and consumes tokens with no gain over a targeted read.

## Codebase Graph Tools (When Available)

Prefer graph query tools over Grep for symbol navigation. Use Tool Search to find them:

| Need | Search for |
|------|-----------|
| Does this symbol exist? | `codebase_search_symbol` |
| What calls this function? | `codebase_find_callers` |
| What does this file import? | `codebase_find_dependencies` |
| Where is this env var defined? | `codebase_get_env_var` |
| What are the entry points? | `codebase_get_entry_points` |
| What routes are exposed? | `codebase_search_api_endpoints` |

Use Grep only when no graph is present or when you need to read actual implementation logic.

## Plan-Doc-First Rule

During task execution, the plan doc is the primary reference. Do not use Glob or Grep to locate files that are already documented in the plan. Read the plan doc first; only fall back to filesystem search if a specific detail is genuinely missing.

## Architecture Blueprint — New Epics

When creating a new Epic, the plan doc (`plans/CLAUDE-N-description.md`) must include an architecture section covering:
- File paths and entry points for all affected code
- Function/method signatures and their roles
- Enum values, constants, and data structures in scope
- Domain-specific mappings (e.g., SES template name → trigger condition)
- External resource names (DynamoDB table, SQS queue, EventBridge bus, etc.)

Use pyright-lsp for code-level details during planning (symbol resolution, type inference, enum values, imports) instead of grepping source files. This is the replacement for the static lookup tables that were removed from CLAUDE.md.

## No Circular Narration

Do not explain what you are about to do and then do it and then summarize what you did. Act, then report the result. Avoid phrases like "I'll now read the file to understand..." — just read it.
