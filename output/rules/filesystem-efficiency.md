# Filesystem Efficiency

## Scope Before Acting

Before reading or searching any file, identify the minimum set needed. If a plan doc exists for the current task (`plans/<slug>/PLAN.md`), read it first — it contains file paths, function names, and data structures. Only fall back to Glob or Grep if the plan doc is missing a specific detail. If a `CODEBASE.md` exists in the repo root, read it before any file navigation — it orients entry points and key modules in a few dozen lines.

## Targeted Reads

Use `offset` and `limit` parameters on Read. A single function or method is 20–40 lines — read only those lines. Do not dump a whole file when you need one section.

## Prohibited Unscoped Globs

NEVER call Glob without a `path` parameter for these patterns:
`**/*.py`, `**/*.ts`, `**/*.js`, `**/*.json`, `**/*.yml`, `**/*.yaml`, `**/*`

Always scope with a directory: `path="src/services/"` or equivalent.

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

## Plan-Doc-First During Execution

During task execution, the plan doc is the primary reference. Do not Glob or Grep for files, functions, or data structures already documented in the plan. Read the plan doc; only search the filesystem if a specific detail is genuinely absent from it.

## No Circular Narration

Do not explain what you are about to do, then do it, then summarize what you did. Act, then report the result. Phrases like "I'll now read the file to understand..." are prohibited — just read it.
