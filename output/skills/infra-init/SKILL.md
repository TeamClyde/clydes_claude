---
name: infra-init
description: "Generates the codebase knowledge graph for the current repo. Orchestrates a 3-phase indexing process: (1) structure detection — reads directory tree, manifests, and config files to classify repo type and assign files to batches; (2) parallel batch file extraction — up to 5 agents simultaneously extract symbols, imports, calls, env vars, and routes; (3) graph synthesis — reduces all batch output into codebase-graph.json and CODEBASE.md. Produces .claude-init/codebase-graph.json (queryable symbol graph) and .claude-init/CODEBASE.md (human summary). Run once per repo during initial setup, then re-run when the codebase grows significantly. Handles resume automatically if a prior run was interrupted. Does not read individual source files directly."
---

# infra-init

Orchestrates a 3-phase codebase indexing process by spawning sub-agents. Agent prompts live in `agents/` — read the relevant file before spawning each agent.

---

## Entry Check

Before starting, check `.claude-init/progress.json`:

- **File does not exist** — start fresh from Phase 1.
- **File exists and all batches are `complete` and `graph_builder` is `complete`** — check if `codebase-graph.json` exists. If it does, confirm with the user before overwriting. Default action: full refresh (delete `.claude-init/` and restart). If user declines, stop.
- **File exists and is incomplete** — offer the user two options:
  - **Resume** — skip completed batches, continue from the first incomplete step.
  - **Restart** — delete `.claude-init/` and start over.
  Proceed based on user selection.

---

## Phase 1 — Structure Detection

Read `agents/structure.md` for the full agent prompt. Spawn one agent using model **Haiku**. Provide the repo root path.

Wait for this agent to complete before proceeding to Phase 2.

---

## Phase 2 — Parallel Batch Indexing

Read `agents/batch-indexer.md` for the full agent prompt. Spawn one agent per batch using model **Haiku**.

**Pre-assignment model.** Before spawning any agents, read `progress.json` and identify all `pending` batches. Assign batches to agents before spawning — agents receive their batch ID in the prompt and go directly to work. There is no claiming or racing.

**Wave loop:**
1. Read `progress.json`. Select up to 5 `pending` batches as the next wave.
2. Spawn one `infra-init-batch-indexer` agent per batch in parallel. Each agent receives: its `batch_id` and the list of files assigned to that batch.
3. Wait for all agents in the wave to complete.
4. For any batch with status `needs_continuation`: re-spawn the batch-indexer with the same `batch_id` plus the path to the handoff document (`results/batch_NN_handoff.json`) as additional context.
5. For any batch where the agent failed without writing a valid result file: mark the batch `failed` in `progress.json` with the error message. Continue with remaining batches.
6. Repeat from step 1 until all batches are `complete` or `failed`.

After all batches finish, report any `failed` batches to the user before proceeding to Phase 3.

---

## Phase 3 — Graph Synthesis

Read `agents/graph-builder.md` for the full agent prompt. Spawn one agent using model **Sonnet**. Provide the path to `.claude-init/results/`.

Wait for this agent to complete before running post-completion steps.

---

## Phase 4 — MCP Tool Setup

After Phase 3 completes, run these steps inline (no sub-agent needed):

1. **Copy MCP server files into the repo:**
   - Source: `~/.claude/skills/infra-init/` contains `templates/codebase-mcp/server.py` and `templates/codebase-mcp/requirements.txt` — but these are stored in the `claude-workflow-improvements` repo at `output/templates/codebase-mcp/`. Copy both files to `.claude-init/mcp/` in the current repo.
   - If `.claude-init/mcp/` already exists and files are present, skip unless `--force` was passed.

2. **Register the MCP server in `.claude/settings.json`:**
   - Read `.claude/settings.json` if it exists; create it if not.
   - Add the following entry under `mcpServers` (merge additively — do not overwrite existing entries):
   ```json
   {
     "mcpServers": {
       "codebase": {
         "command": "python3",
         "args": [".claude-init/mcp/server.py", ".claude-init/codebase-graph.json"],
         "defer_loading": true
       }
     }
   }
   ```
   - On Windows, use `"python"` instead of `"python3"` if `python3` is not found.
   - `defer_loading: true` ensures zero context cost — tools only load when searched for via Tool Search.

3. **Update `progress.json`:**
   - Set `mcp_setup.status` to `"complete"`.

---

## Post-Completion

After Phase 4 completes:

1. **Update the project's CLAUDE.md** — add or replace the codebase section with:
   ```
   ## Codebase Knowledge Graph

   Generated: <date>

   - Graph: `.claude-init/codebase-graph.json`
   - Summary: `.claude-init/CODEBASE.md`
   - At the start of any planning session, read `CODEBASE.md` first.
   - If `CODEBASE.md` is missing, run `/infra-init` before writing a plan.
   - Before writing a new function or utility, use `codebase_search_symbol` to
     check if it already exists.
   - Before changing a function signature or env var name, use
     `codebase_find_callers` to scope the full impact.
   - Symbol file:line references in plan docs come from graph queries — not
     from ad-hoc searching.

   ### Query Tools (via Tool Search)
   - `codebase_search_symbol` — find a symbol by name or description
   - `codebase_find_callers` — who calls this function or class
   - `codebase_find_dependencies` — what does this file import, and what imports it
   - `codebase_get_env_var` — where is this env var defined and who reads it
   - `codebase_get_entry_points` — all entry points and their triggers
   - `codebase_search_api_endpoints` — exposed routes and consumed API clients
   ```

2. **Report to the user:**
   - Total files indexed
   - Repo type detected
   - Number of batches completed vs failed
   - Paths to `codebase-graph.json` and `CODEBASE.md`
   - Any failed batches (names and error messages)

---

## Outputs Summary

| File | Location | Purpose |
|------|----------|---------|
| `codebase-graph.json` | `.claude-init/` | Primary artifact — queryable symbol graph |
| `CODEBASE.md` | `.claude-init/` | Human-readable summary (5-category index) |
| `structure.json` | `.claude-init/` | Repo metadata from Phase 1 |
| `progress.json` | `.claude-init/` | Batch manifest — keep for resume support |
| `batch_NN.json` | `.claude-init/results/` | Per-batch extraction — keep for graph rebuild |

---

## Agent files

- `agents/structure.md` — Phase 1: repo structure detection and batch assignment
- `agents/batch-indexer.md` — Phase 2: per-file symbol/import/call extraction
- `agents/graph-builder.md` — Phase 3: graph synthesis and CODEBASE.md generation

---

## What this skill does NOT do

- Read individual source files directly in the main skill context (that is the batch indexer's job)
- Write application code
- Make architectural decisions about the codebase
- Modify any file in the repo outside of `.claude-init/` and the project's `CLAUDE.md`
