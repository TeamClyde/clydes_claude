---
name: infra-init
description: Use when starting a new repo session, before exploring an unfamiliar codebase, or when code structure has changed significantly. Builds a queryable symbol graph and CODEBASE.md so future navigation uses the graph instead of broad file searches.
allowed-tools: Bash, Read, Write, Agent
---

# infra-init

Thin orchestrator. Deterministic structural extraction is handled by [graphify](https://github.com/safishamsi/graphify) (tree-sitter, SHA256-cached). Domain enrichment (env vars, AWS triggers, routes) is handled by Python scripts under `scripts/`. CODEBASE.md generation is a single sub-agent invocation.

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

Scripts themselves never re-resolve. The chosen interpreter is written into `.claude-init/progress.json` under `meta.python_interpreter` and used for MCP server registration in Phase 4.

---

## Entry Check

Check `.claude-init/progress.json`:

- **File does not exist** — start fresh from Phase 1.
- **File exists and all phases are `complete`** — confirm with the user before overwriting. Default: full refresh (delete `.claude-init/`, restart). If user declines, stop.
- **File exists and is incomplete** — offer the user:
  - **Resume** — skip `complete` phases, continue from first non-complete step (reading `meta.python_interpreter` to preserve the original interpreter choice).
  - **Restart** — delete `.claude-init/` and start over.

### Forcing a cold rebuild of graphify's extraction cache

If the user suspects the SHA256 cache is stale (e.g. after a graphify upstream upgrade changed extraction semantics), they can `rm -rf graphify-out/cache/` before re-running. `/infra-init` will then do a cold graphify build (Phase 2 branches on cache presence).

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
    "graphify_version": null,
    "started_at": "<ISO 8601>",
    "completed_at": null
  },
  "structure":   {"status": "complete"},
  "graphify":    {"status": "pending"},
  "phase25":     {"status": "pending", "output": ".claude-init/codebase-graph.json"},
  "codebase_md": {"status": "pending"},
  "mcp_setup":   {"status": "pending"}
}
```

---

## Phase 2 — Graphify Extraction

The PyPI package is named **`graphifyy`** (double-y — the single-y name is squatted; upstream calls it a temporary rename). The CLI entry point is still `graphify`, but installed under `%APPDATA%\Python\...\Scripts\` via `pip install --user` and therefore often not on PATH. **Always invoke via `$PY -m graphify`**, never the bare `graphify` binary.

Graphify has no `build` command and no `--version` flag (confirmed against `graphifyy 0.4.15`). Use `graphify update <path>` for both cold and incremental builds — it creates `graphify-out/graph.json` on first run and re-extracts only changed files on subsequent runs (SHA256 cache in `graphify-out/cache/`).

Log the installed version into `progress.json → meta.graphify_version`:

```bash
"$PY" -m pip show graphifyy | awk -F': ' '/^Version/ {print $2}'
```

Record whether a prior cache existed (for `progress.json → graphify.mode`):

```bash
if [[ -d graphify-out/cache ]]; then
  MODE=update
else
  MODE=cold
fi
"$PY" -m graphify update .
```

Write `graphify.status = "complete"`, `graphify.mode = "$MODE"` to `progress.json`.

**Smoke check before proceeding:** `graphify-out/graph.json` exists, is valid JSON, and has non-empty `nodes` and `links` arrays. If not, abort and report the error to the user — do not attempt Phase 2.5.

---

## Phase 2.5 — Translate + Enrich

Run the orchestrator:

```bash
$PY ~/.claude/skills/infra-init/scripts/run_phase25.py \
    --root . \
    --graphify graphify-out/graph.json \
    --structure .claude-init/structure.json \
    --schema ~/.claude/skills/infra-init/../../templates/codebase-graph.schema.json \
    --commit "$(git rev-parse --short HEAD 2>/dev/null || echo null)" \
    --out .claude-init/codebase-graph.json
```

This script chains:
1. **Translate** — graphify `node_link_data` → our schema (node ID remap, type inference, edge mapping, drift-defensive).
2. **Env var scan** — tree-sitter scan for `os.environ` / `os.getenv` / `process.env` (incl. destructured forms). Emits `env_var` nodes + `reads_env` edges.
3. **Serverless enrichment** — parse `serverless.yml` / `template.yaml`; mark handlers `is_entry_point`, set `trigger`, emit `route` nodes + `defines` edges, populate env var `defined_in` / `default`.
4. **Build indexes** — compute `symbols`, `callers`, `env_vars`, `endpoints`.
5. **Validate + atomic write** — validate against `codebase-graph.schema.json`, then atomic write (`.tmp` + `os.replace`).

Set `phase25.status = "complete"` in `progress.json`.

---

## Phase 3 — CODEBASE.md

Read `agents/graph-builder.md` for the full agent prompt. Spawn one agent using model **Sonnet**. Provide the path to `.claude-init/codebase-graph.json` and `.claude-init/structure.json`.

Wait for this agent to complete. It writes `.claude-init/CODEBASE.md` and sets `codebase_md.status = "complete"`.

---

## Phase 4 — MCP Tool Setup

Run inline:

1. **Copy MCP server files into the repo.** Source is `output/templates/codebase-mcp/` in the `claude-workflow-improvements` repo (symlinked to `~/.claude/templates/` via setup.sh if that symlink exists, otherwise reference the repo directly). Copy `server.py` and `requirements.txt` to `.claude-init/mcp/`. Skip if the files already exist and are current.

2. **Register the MCP server in `.claude/settings.json`.** Read the file if it exists; create otherwise. Merge additively:

   ```json
   {
     "mcpServers": {
       "codebase": {
         "command": "<$PY>",
         "args": [".claude-init/mcp/server.py", ".claude-init/codebase-graph.json"],
         "defer_loading": true
       }
     }
   }
   ```

   The `command` field uses the resolved interpreter from `progress.json → meta.python_interpreter` (`python3.11` or `python3.14`) — never bare `python3`.

3. **Gitignore target repo.** Append to the target repo's `.gitignore` (create if absent, skip lines already present):

   ```
   # /infra-init build output
   .claude-init/
   graphify-out/
   ```

4. **Update `progress.json`:** set `mcp_setup.status = "complete"` and `meta.completed_at`.

---

## Post-Completion

1. **Update the project's CLAUDE.md** — add or replace the codebase section:

   ```markdown
   ## Codebase Knowledge Graph

   Generated: <date>

   - Graph: `.claude-init/codebase-graph.json`
   - Summary: `.claude-init/CODEBASE.md`
   - `.claude-init/` and `graphify-out/` are gitignored build output.
   - At the start of any planning session, read `CODEBASE.md` first.
   - If `CODEBASE.md` is missing, run `/infra-init` before writing a plan.
   - Before writing a new function or utility, use `codebase_search_symbol`
     to check if it already exists.
   - Before changing a function signature or env var name, use
     `codebase_find_callers` to scope the full impact.
   - Symbol file:line references in plan docs come from graph queries —
     not from ad-hoc searching.

   ### Query Tools (via Tool Search)
   - `codebase_search_symbol` — find a symbol by name or description
   - `codebase_find_callers` — who calls this function or class
   - `codebase_find_dependencies` — what does this file import, and what imports it
   - `codebase_get_env_var` — where is this env var defined and who reads it
   - `codebase_get_entry_points` — all entry points and their triggers
   - `codebase_search_api_endpoints` — exposed routes and consumed API clients
   ```

2. **Report to the user:**
   - Total nodes / edges in the final graph
   - Graphify version used
   - Whether the run was cold or incremental (`graphify.mode`)
   - Paths to `codebase-graph.json` and `CODEBASE.md`
   - Any warnings logged by translate / env-var scan / serverless enrich

---

## Outputs Summary

| File | Location | Purpose |
|------|----------|---------|
| `codebase-graph.json` | `.claude-init/` | Primary artifact — queryable symbol graph |
| `CODEBASE.md` | `.claude-init/` | Human-readable summary (5-category index) |
| `structure.json` | `.claude-init/` | Repo metadata from Phase 1 |
| `progress.json` | `.claude-init/` | Phase manifest — keep for resume support |
| `graph.json` | `graphify-out/` | Graphify raw output — regenerated per run |
| `cache/` | `graphify-out/` | SHA256 cache — controls incremental behavior |

---

## Scripts

- `scripts/detect_structure.py` — Phase 1: manifest-based repo type detection
- `scripts/graphify_translate.py` — Phase 2.5A: graphify → our schema
- `scripts/env_var_scan.py` — Phase 2.5B: tree-sitter env var extraction
- `scripts/serverless_enrich.py` — Phase 2.5C: serverless.yml → triggers/routes
- `scripts/build_indexes.py` — Phase 2.5D: top-level indexes
- `scripts/run_phase25.py` — Phase 2.5 orchestrator
- `agents/graph-builder.md` — Phase 3: CODEBASE.md synthesis (only sub-agent)

---

## What this skill does NOT do

- Re-extract symbols from source with an LLM — graphify does that deterministically
- Modify any file in the repo outside of `.claude-init/`, `graphify-out/`, the project's `CLAUDE.md`, and the project's `.gitignore`
- Pin graphify to a specific version (intentional — upstream churn is acceptable, the translator is drift-defensive)

## Gotchas

1. Requires python3.11 or python3.14 specifically — not generic python3.
2. Invoke graphify via `python -m graphify`, not the bare `graphify` binary — it may not be on PATH.
3. Check `.claude-init/progress.json` before starting — if all phases are complete, confirm before overwriting.
