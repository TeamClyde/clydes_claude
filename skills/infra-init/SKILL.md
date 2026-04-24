---
name: infra-init
description: Use when starting a new repo session, before exploring an unfamiliar codebase, or when code structure has changed significantly. Builds a queryable symbol graph and CODEBASE.md so future navigation uses the graph instead of broad file searches.
allowed-tools: Bash, Read, Write, Agent
---

# infra-init

Thin orchestrator. Structural indexing is handled by codebase-memory-mcp (global binary, SQLite-backed). Domain enrichment (env vars, AWS triggers) is handled by Python scripts under `scripts/`. CODEBASE.md generation is a single sub-agent invocation.

---

## Interpreter resolution

`/infra-init` invokes Python scripts as `$PY scripts/X.py ...`. `$PY` is resolved once at the start of every run:

```bash
resolve_python() {
  if command -v python3.11 >/dev/null 2>&1; then echo python3.11; return 0
  elif command -v python3.14 >/dev/null 2>&1; then echo python3.14; return 0
  else
    echo "ERROR: /infra-init requires python3.11 or python3.14; neither found on PATH." >&2
    return 1
  fi
}
PY="$(resolve_python)" || exit 1
```

Scripts themselves never re-resolve. The chosen interpreter is written into `.claude-init/progress.json` under `meta.python_interpreter`.

---

## Entry Check

Check `.claude-init/progress.json`:

- **File does not exist** — start fresh from Phase 1.
- **File exists and all phases are `complete`** — confirm with the user before overwriting. Default: full refresh (delete `.claude-init/`, restart). If user declines, stop.
- **File exists and is incomplete** — offer the user:
  - **Resume** — skip `complete` phases, continue from first non-complete step (reading `meta.python_interpreter` to preserve the original interpreter choice).
  - **Restart** — delete `.claude-init/` and start over.

---

## Phase 1 — Structure Detection

Run inline (no sub-agent):

```bash
$PY ~/.claude/skills/infra-init/scripts/detect_structure.py \
    --root . \
    --out .claude-init/structure.json
```

Then initialize `.claude-init/progress.json`:

```json
{
  "meta": {
    "python_interpreter": "<$PY value>",
    "repo_path": null,
    "started_at": "<ISO 8601>",
    "completed_at": null
  },
  "structure":   {"status": "complete"},
  "index":       {"status": "pending"},
  "phase25":     {"status": "pending", "output": ".claude-init/enrichments.json"},
  "codebase_md": {"status": "pending"}
}
```

---

## Phase 2 — Index with codebase-memory-mcp

Prerequisite: codebase-memory-mcp must already be registered in `~/.claude/settings.json`. Verify
before proceeding:

```
ToolSearch("select:index_repository,index_status")
```

If `index_repository` is not found, stop and tell the user — do not attempt inline installation.

Get the absolute repo path:

```bash
REPO_PATH="$(pwd -P)"
```

Call:

```
index_repository(repo_path="<REPO_PATH>")
```

Then poll until complete — call `index_status(repo_path="<REPO_PATH>")` up to 20 times, waiting
30 seconds between calls (10-minute timeout). If status never reaches `complete`, stop and
surface the error to the user.

Record in `.claude-init/progress.json`:

```json
{ "meta": { "repo_path": "<REPO_PATH>" }, "index": { "status": "complete" } }
```

---

## Phase 2.5 — Supplemental Enrichment

codebase-memory-mcp does not extract env var reads or AWS serverless trigger metadata. Run
the supplemental enrichment scripts:

```bash
$PY ~/.claude/skills/infra-init/scripts/env_var_scan.py \
    --root . \
    --out .claude-init/enrichments.json

$PY ~/.claude/skills/infra-init/scripts/serverless_enrich.py \
    --root . \
    --enrichments .claude-init/enrichments.json
```

If neither script finds any data (no Python/TS files, no serverless config), `enrichments.json`
is written as `{"env_vars": [], "entry_points": []}` — this is not an error.

Set `phase25.status = "complete"` in `progress.json`.

---

## Phase 3 — CODEBASE.md

Read `agents/graph-builder.md` for the full agent prompt. Spawn one agent using model **Sonnet**. Provide paths to `.claude-init/progress.json` (agent reads `meta.repo_path` to scope MCP queries), `.claude-init/structure.json` (for `repo_type`), and `.claude-init/enrichments.json` (for trigger annotation).

Wait for this agent to complete. It writes `.claude-init/CODEBASE.md` and sets `codebase_md.status = "complete"`.

---

## Post-Completion

1. **Update the project's CLAUDE.md** — add or replace the codebase section:

   ```markdown
   ## Codebase Knowledge Graph

   Generated: <date>

   - Summary: `.claude-init/CODEBASE.md`
   - Env vars & serverless triggers: `.claude-init/enrichments.json`
   - `.claude-init/` is gitignored build output.
   - At the start of any planning session, read `CODEBASE.md` first.
   - If `CODEBASE.md` is missing, run `/infra-init` before writing a plan.
   - Before writing a new function or utility, use `search_graph` to check if it already exists.
   - Before changing a function signature, use `query_graph` (CALLS) to scope the full impact.
   - Symbol file:line references in plan docs come from graph queries — not from ad-hoc searching.

   ### Query Tools (codebase-memory-mcp, via Tool Search)
   - `search_graph` — find a symbol by name or type
   - `query_graph` — Cypher-like traversal (callers: `MATCH (x)-[:CALLS]->(f:Function {name:"X"}) RETURN x`)
   - `get_architecture` — entry points, modules, architectural overview
   - `trace_path` — trace call chain between two specific symbols
   - `search_code` — full-text code search

   ### Env vars and serverless triggers
   Read `.claude-init/enrichments.json` directly — not queryable via MCP tools.
   ```

2. **Gitignore the build output.** Append to the target repo's `.gitignore` (create if absent, skip lines already present):

   ```
   # /infra-init build output
   .claude-init/
   ```

3. **Report to the user:**
   - Index status from `index_status()` result
   - Paths to `CODEBASE.md` and `enrichments.json`
   - Any warnings logged by env var scan / serverless enrich

---

## Outputs Summary

| File | Location | Purpose |
|------|----------|---------|
| `CODEBASE.md` | `.claude-init/` | Human-readable summary (5-category index) |
| `structure.json` | `.claude-init/` | Repo metadata from Phase 1 |
| `enrichments.json` | `.claude-init/` | Env vars and serverless trigger metadata |
| `progress.json` | `.claude-init/` | Phase manifest — keep for resume support |

---

## Scripts

- `scripts/detect_structure.py` — Phase 1: manifest-based repo type detection
- `scripts/env_var_scan.py` — Phase 2.5A: tree-sitter env var extraction
- `scripts/serverless_enrich.py` — Phase 2.5B: serverless.yml → triggers
- `agents/graph-builder.md` — Phase 3: CODEBASE.md synthesis (only sub-agent)

---

## What this skill does NOT do

- Modify any file in the repo outside of `.claude-init/`, the project's `CLAUDE.md`, and the project's `.gitignore`
- Install or configure codebase-memory-mcp — it must already be globally installed before infra-init runs

## Gotchas

1. Requires python3.11 or python3.14 specifically — not generic python3.
2. Call ToolSearch("select:index_repository") at Phase 2 start to verify codebase-memory-mcp is loaded.
3. Phase 3 reads meta.repo_path from progress.json — verify it was written in Phase 2 before spawning the graph-builder agent.
