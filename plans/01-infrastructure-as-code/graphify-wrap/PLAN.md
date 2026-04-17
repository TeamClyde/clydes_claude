# Plan — Wrap Graphify as the extraction engine for `/infra-init`

**Parent Plan:** [../PLAN.md](../PLAN.md)
**Status:** Approved (architect round 2)
**Priority:** 1 (extends Plan 01)
**Repo:** claude-workflow-improvements
**Jira Project:** N/A (skipped per user directive)

---

## Context

Today, `/infra-init` builds the code graph itself: a Structure Agent enumerates files and assigns batches, 3–5 parallel Batch Indexer subagents LLM-read every source file to extract symbols/calls/imports/env-vars/routes, and a Graph Builder subagent merges everything into `.claude-init/codebase-graph.json` and `CODEBASE.md`. A FastMCP server in `templates/codebase-mcp/` then exposes 6 query tools over the graph.

This works but is expensive: every re-run burns LLM tokens re-reading files that haven't changed, and the extraction is non-deterministic. The open-source tool **graphify** (github.com/safishamsi/graphify, MIT-licensed, actively maintained — latest commit 2026-04-15) solves the structural-extraction half of this deterministically using tree-sitter with a SHA256 per-file cache. It produces a NetworkX `node_link_data` JSON graph with node types (file/class/function/method) and edge types (`calls`, `imports`, `imports_from`, `method`, `inherits`, `contains`, `uses`).

**Key confirmed gap:** graphify does **not** extract env var reads (`os.environ`, `os.getenv`, `process.env`). Our current graph has 8 `env_var` nodes and 6 `reads_env` edges on notification-backend — these are domain-critical for AWS Lambda work and must be preserved. We add a deterministic env-var scanner on top of graphify's output.

**Intended outcome:** `/infra-init` becomes a thin orchestrator. Graphify does the structural heavy lifting; we add a focused enrichment pass that produces a graph in our existing schema (`templates/codebase-graph.schema.json`) so our FastMCP server and the notification-backend reference graph remain drop-in compatible.

---

## Inventory — what exists today (confirmed by exploration)

### Our repo (`claude-workflow-improvements`)

| Artifact | Path | Role after this change |
|---|---|---|
| SKILL.md | `output/skills/infra-init/SKILL.md` | **Rewrite** — new Phase 2/2.5 |
| Structure subagent prompt | `output/skills/infra-init/agents/structure.md` | **Delete** — replaced by inline Python |
| Batch-indexer subagent prompt | `output/skills/infra-init/agents/batch-indexer.md` | **Delete** — replaced by graphify |
| Graph-builder subagent prompt | `output/skills/infra-init/agents/graph-builder.md` | **Trim** — CODEBASE.md generation only |
| FastMCP server template | `output/templates/codebase-mcp/server.py` (440 lines, 6 tools) | **Unchanged** |
| Graph schema | `output/templates/codebase-graph.schema.json` | **Unchanged** |
| CODEBASE.md template | `output/templates/CODEBASE.md` | **Unchanged** |
| Parent plan doc | `plans/01-infrastructure-as-code/PLAN.md` | **Update** — Phases 2/3, Deliverables, Freshness, `progress.json` example |

### Reference graph (`C:\Users\jason\repos\notification backend\.claude-init\`)

- `codebase-graph.json` — 120 nodes (87 function, 16 class, 8 env_var, 5 method, 2 route, 2 file), 85 edges (79 calls, 6 reads_env). **Note:** zero `imports` edges today — our current extractor isn't emitting them. Graphify will give us this for free.
- Entry points carry `trigger: "http:DELETE:/firebase/tokens"` / `sqs:X` / `eventbridge:Y` / `cron rate(24 hours)` etc.
- `env_vars` metadata block tracks `defined_in: "serverless.yml"`, `default`, and `read_by` list with file:line.
- MCP server auto-generated at `.claude-init/mcp/server.py`. No `.mcp.json` registration yet (separate gap — not in scope).

### Graphify (`github.com/safishamsi/graphify`)

- **CLI:** `graphify build <path>` → writes `graphify-out/graph.json`, `graph.html`, `GRAPH_REPORT.md`, `cache/`. Supports `--update` (incremental, SHA256-keyed), `--mcp` (export), `--mode deep`.
- **Output shape:** NetworkX `node_link_data` — `{nodes: [...], links: [...], hyperedges: [...]}`. Nodes have `id`, `label`, `file_type`, `source_file`, `source_location` ("L42" string), `community`. Edges have `source`, `target`, relationship type, `confidence_score` (1.0=EXTRACTED, 0.8=INFERRED).
- **Node type inference:** graphify does **not** put a `type: class|function|method` field on nodes directly. Types are derivable from edges — handled in translation.
- **Env vars:** **NOT extracted.** Confirmed by reading `extract.py` — only imports, classes, functions, calls, inheritance. Must be added by us.
- **Python requirement:** `requires-python>=3.10`. **We use `python3.11` (or `python3.14` if 3.11 absent) explicitly — never bare `python`/`python3`.**
- **Install:** `pip install graphify` (MIT). Optional extras: `[pdf]`, `[watch]`, `[neo4j]`, `[mcp]`, `[all]`. We install base only.
- **Cache:** `graphify-out/cache/` keyed by SHA256 of file contents. `--update` re-extracts changed files and merges.

---

## Design — new `/infra-init` flow

```
┌───────────────────────────────────────────────────────────────┐
│ Phase 1 — Structure (trimmed)                                 │
│   Detects repo type (serverless.yml → aws-lambda, etc.)       │
│   Writes .claude-init/structure.json, progress.json           │
│   NO LONGER assigns batches — graphify owns chunking          │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ Phase 2 — Graphify Extraction (NEW, deterministic)            │
│   graphify build .        (cold)                              │
│   graphify build . --update  (incremental, if cache exists)   │
│   Reads graphify-out/graph.json                               │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ Phase 2.5 — Translate + Enrich (NEW)                          │
│   A. Translate graphify shape → our schema                    │
│   B. Env var scan (Python + tree-sitter)                      │
│   C. Serverless enrichment (triggers, routes, env defaults)   │
│   D. Build required top-level indexes                         │
│   E. Write .claude-init/codebase-graph.json                   │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ Phase 3 — CODEBASE.md (unchanged logic)                       │
│   Reads enriched graph, writes 5-category summary             │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ Phase 4 — MCP Setup                                           │
│   Copy templates/codebase-mcp/ → .claude-init/mcp/            │
│   Register in .claude/settings.json (defer_loading: true)     │
│   command field: python3.11 or python3.14 (NOT python3)       │
└───────────────────────────────────────────────────────────────┘
```

### Python-version declaration (required by user)

Wherever `/infra-init` invokes Python, it **must** resolve the interpreter in this order and fail loud if none are found:

```
python3.11  (preferred)
python3.14  (fallback)
```

Applies to: `graphify` invocation, env-var scanner, MCP server bootstrap, and the `command` field in `.claude/settings.json` MCP registration (Phase 4 — updated from current `"python3"` to the resolved interpreter from `progress.json`).

**Interpreter resolution shell snippet** (used by `setup.sh` and inline in SKILL.md Phase 1):

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

Scripts themselves do not re-resolve — `/infra-init` passes `$PY` to every invocation and writes the chosen interpreter into `progress.json` under `meta.python_interpreter`.

### Phase 2.5 — detailed contract

#### A. Translate graphify → our schema

**Node ID remapping.** Graphify IDs are opaque. Always remap — never preserve graphify IDs:

```
new_id = f"{source_file}::{label}"
   where label has surrounding "()" and leading "." stripped (method labels)
```

Nodes without `source_file` are skipped — they have no stable location in our schema.

**Node type inference.** Apply rules in order (first match wins):

| Rule | Resulting type |
|---|---|
| Node is the target of a `method` edge | `method` |
| Node is the source of a `method` edge (has methods) | `class` |
| Node is the source of an `inherits` edge (subclass) | `class` |
| Node is the target of an `inherits` edge only (base class, no methods/subclass edges) | `class` |
| Otherwise (has `source_file` and `source_location`) | `function` |

**File nodes.** Graphify does not emit file nodes. The translator synthesizes one `type: "file"` node per distinct `source_file`:

```json
{"id": "src/services/notification.py", "type": "file", "name": "notification.py",
 "file": "src/services/notification.py", "line_start": 1}
```

**Route nodes.** Routes are distinct nodes (`type: "route"`, id = `route::METHOD:/path`), **not** annotations on function nodes. The function node receives `is_entry_point: true` + `trigger: "http:METHOD:/path"`; the route node is emitted by `serverless_enrich.py` and linked with a `defines` edge (`from: function_id, to: route_id`).

**Location parse.** `source_location: "L42"` → `line_start: 42` (int). If missing or unparseable, `line_start: null` and log a warning.

**Field renames.** `links` → `edges`. `source`/`target` → `from`/`to`.

**Edge mapping.**

| Graphify edge | Our edge | Notes |
|---|---|---|
| `contains` | `contains` | File → symbol |
| `imports` | `imports` | Preserve |
| `imports_from` | `imports` | Merge — same semantics |
| `method` | (drop) | Used for type inference only; redundant with `contains` file→method |
| `inherits` | (drop) | No inheritance edge in our schema; acceptable loss |
| `calls` | `calls` | Preserve |
| `uses` | (drop) | Confidence 0.8 (INFERRED); no equivalent; dropping reduces noise |

Graphify's `confidence_score` is dropped. Unknown edge types from future graphify versions are logged and dropped.

#### B. Env-var scanner (`scripts/env_var_scan.py`)

**Python tree-sitter queries** (`tree-sitter-python`):

```scheme
; os.environ["X"], os.environ['X']
(subscript
  value: (attribute
    object: (identifier) @_os (#eq? @_os "os")
    attribute: (identifier) @_env (#eq? @_env "environ"))
  subscript: (string) @var_name)

; os.environ.get("X"), os.getenv("X")
(call
  function: [
    (attribute
      object: (attribute
        object: (identifier) @_os (#eq? @_os "os")
        attribute: (identifier) @_env (#eq? @_env "environ"))
      attribute: (identifier) @_get (#eq? @_get "get"))
    (attribute
      object: (identifier) @_os (#eq? @_os "os")
      attribute: (identifier) @_getenv (#eq? @_getenv "getenv"))
  ]
  arguments: (argument_list . (string) @var_name))
```

**TypeScript/JS tree-sitter queries** (`tree-sitter-typescript`):

```scheme
; process.env.X
(member_expression
  object: (member_expression
    object: (identifier) @_proc (#eq? @_proc "process")
    property: (property_identifier) @_env (#eq? @_env "env"))
  property: (property_identifier) @var_name)

; process.env["X"]
(subscript_expression
  object: (member_expression
    object: (identifier) @_proc (#eq? @_proc "process")
    property: (property_identifier) @_env (#eq? @_env "env"))
  index: (string) @var_name)

; const { X, Y } = process.env  and  const { X: local } = process.env
(variable_declarator
  name: (object_pattern) @pattern
  value: (member_expression
    object: (identifier) @_proc (#eq? @_proc "process")
    property: (property_identifier) @_env (#eq? @_env "env")))
```

For the destructuring case, a post-match walk over `@pattern`'s `shorthand_property_identifier_pattern` and `pair_pattern` children yields each extracted var name. Aliased form `{X: local}` records `X` (the env var), not `local`.

**Caller-node resolution.** For each match, walk up the AST to find the enclosing `function_definition` / `method_definition` / `class_definition` (Python) or `function_declaration` / `method_definition` / `arrow_function` (TS/JS). The caller is the innermost such node; its `path::symbol` id matches what the translator produced in step A. If no enclosing function found (module-level read), use `<file_path>::<module>` and emit a synthetic function node if absent.

**Output:** env_var nodes (one per unique name) and `reads_env` edges with `from`, `to`, `file`, `line`.

#### C. Serverless enrichment (`scripts/serverless_enrich.py`)

Reads `serverless.yml` / `template.yaml` / `serverless.ts` and:
- For each function mapping, locates the matching handler node (by `source_file` ending in the handler path) and sets `is_entry_point: true` + `trigger` (e.g. `http:POST:/widgets`, `sqs:MyQueue`, `eventbridge:cron(...)`).
- For each HTTP event, emits a `route` node and a `defines` edge from the function to the route.
- Populates env var `defined_in: "serverless.yml"` and `default` values under `provider.environment` and function-level `environment` blocks, tracking line numbers.

Reuses YAML-parsing logic currently in `graph-builder.md` (moves verbatim into this script).

#### D. Build required top-level indexes

`scripts/build_indexes.py` (called from `run_phase25.py` as the final step before write) builds:

- `symbols` — `{name → [node_id, ...]}` keyed by `node.name` across all symbol nodes
- `callers` — `{node_id → [{from: id, file, line}, ...]}` derived from `calls` edges (reverse index)
- `env_vars` — `{VAR_NAME → {defined_in, default, read_by: [{file, line}, ...]}}` derived from env_var nodes + `reads_env` edges
- `endpoints` — `{exposed: [{method, path, file, line, handler_id}, ...], consumed: {client_file → [routes]}}` derived from route nodes

Adapted from `agents/graph-builder.md` steps 2–3 — index-building moves from LLM prompt to deterministic Python.

#### E. Write output

`run_phase25.py` sequences A → B → C → D → E. Writes `.claude-init/codebase-graph.json` as a single atomic write (write to `.tmp`, `os.replace` to final). Validates against `codebase-graph.schema.json` before write — fails loud on validation failure.

### Upstream-drift mitigation (do NOT pin version)

- Do not add `graphify==X.Y.Z` to any requirements file. Install unpinned.
- Every run, log `graphify --version` into `.claude-init/progress.json` under `meta.graphify_version`.
- Phase 2.5's translator reads `graphify-out/graph.json` defensively: missing `source_location`, unknown edge types, or absent fields fall through with a warning rather than crashing.
- Smoke test: assert `nodes` and `links` keys exist and are lists. If not, error with "graphify output shape changed — translator update required."

### `progress.json` schema update

The existing `progress.json` has `batches`, `graph_builder`, `mcp_setup`. New shape:

```json
{
  "meta": {
    "python_interpreter": "python3.11",
    "graphify_version": "0.X.Y",
    "started_at": "2026-04-15T...",
    "completed_at": null
  },
  "structure":    {"status": "complete"},
  "graphify":     {"status": "complete", "mode": "update|cold"},
  "phase25":      {"status": "pending",  "output": ".claude-init/codebase-graph.json"},
  "codebase_md":  {"status": "pending"},
  "mcp_setup":    {"status": "pending"}
}
```

Resume-on-interrupt reads these in order and resumes from the first non-`complete` step.

### `--update` flag behavior

The orchestrator branches on whether `graphify-out/cache/` exists:

```
if graphify-out/cache/ exists:  graphify build . --update
else:                           graphify build .
```

Record which mode was used in `progress.json` → `graphify.mode` for traceability.

**Forcing a cold rebuild.** Users can delete `graphify-out/cache/` manually to force cold re-extraction. SKILL.md Phase 2 documents this as the escape hatch for cases where the cache appears stale or a graphify version bump changes extraction semantics.

### Parent plan's `progress.json` example also needs updating

`plans/01-infrastructure-as-code/PLAN.md` lines 298–310 show the old schema. Those keys no longer apply. Parent-plan update in the file-modification table explicitly includes replacing that example.

### Env-var scanner — non-Python/TS repos

If a target repo has no `.py`, `.ts`, `.js`, `.tsx`, or `.jsx` files (pure Go, Ruby, Rust, etc.), `env_var_scan.py` emits zero env_var nodes and zero `reads_env` edges without error. Future language support can be added by extending the scanner with additional tree-sitter grammars.

### Target-repo `.gitignore` handling

After Phase 4, `/infra-init` appends these lines to the target repo's `.gitignore` (creating if absent, skipping lines already present):

```
# /infra-init build output
.claude-init/
graphify-out/
```

The project CLAUDE.md section (written by Phase 4) also documents this for transparency, but the `.gitignore` edit is the load-bearing action.

---

## Architecture Blueprint — files and responsibilities

### Files to delete

- `output/skills/infra-init/agents/structure.md`
- `output/skills/infra-init/agents/batch-indexer.md`

### Files to rewrite

- `output/skills/infra-init/SKILL.md` — full orchestration rewrite (new phases, interpreter resolution, `--update` branching, gitignore edit step)
- `output/skills/infra-init/agents/graph-builder.md` — trim to CODEBASE.md generation only; input is the already-enriched `codebase-graph.json`

### New scripts (all under `output/skills/infra-init/scripts/`)

- `detect_structure.py` — repo-type detection from top-level manifests. Writes `structure.json`.
- `graphify_translate.py` — reads `graphify-out/graph.json`, emits translated nodes+edges in our schema (type inference, ID remap, location parse, link/edge rename, edge mapping, drift-defensive).
- `env_var_scan.py` — tree-sitter env var scanner (Python + TS/JS, including destructured forms).
- `serverless_enrich.py` — reads `serverless.yml`/`template.yaml`, sets `is_entry_point`/`trigger`, emits `route` nodes + `defines` edges, populates env var defaults.
- `build_indexes.py` — builds `symbols`/`callers`/`env_vars`/`endpoints` top-level indexes.
- `run_phase25.py` — orchestrator wiring translate → env_var_scan → serverless_enrich → build_indexes → schema-validate → atomic write.

### Files unchanged

- `output/templates/codebase-mcp/server.py`
- `output/templates/codebase-graph.schema.json`
- `output/templates/CODEBASE.md`

### External changes

- `scripts/setup.sh` — add dependency-install block (see below)
- `plans/01-infrastructure-as-code/PLAN.md` — update Phases 2/3, Deliverables table, Freshness section, `progress.json` example
- Project CLAUDE.md section template (currently inline in `SKILL.md` lines 93–117) — add `.gitignore` recommendation line

### `setup.sh` install block

```bash
# --- /infra-init dependency install (idempotent) ---
PY=""
if command -v python3.11 >/dev/null 2>&1; then PY=python3.11
elif command -v python3.14 >/dev/null 2>&1; then PY=python3.14
else
  echo "ERROR: setup.sh requires python3.11 or python3.14; neither found on PATH." >&2
  echo "Install one of them and re-run setup.sh." >&2
  exit 1
fi
echo "Using $PY for /infra-init dependency install"

for pkg in graphify tree-sitter-python tree-sitter-typescript; do
  if "$PY" -m pip show "$pkg" >/dev/null 2>&1; then
    echo "  $pkg already installed — skipping"
  else
    echo "  installing $pkg"
    "$PY" -m pip install --user "$pkg"
  fi
done
```

- `pip show` guard — skip already-installed packages (no unnecessary re-resolve)
- No `--upgrade` — do not chase upstream versions automatically
- `--user` install — avoids sudo
- `exit 1` + stderr message on missing interpreter — fail-loud contract

---

## Two-computer sync model

User runs this workflow on two separate machines. Source of truth is this repo in git.

**Synced via `git pull` + existing symlink install:**
- `output/skills/infra-init/SKILL.md`, `scripts/*.py`, `agents/graph-builder.md`
- `output/templates/codebase-mcp/`, `codebase-graph.schema.json`, `CODEBASE.md`

Because `scripts/setup.sh` symlinks `output/` into `~/.claude/`, `git pull` on either computer instantly propagates changes.

**Per-machine, one-time install (handled by setup.sh):**
- Python 3.11 (or 3.14 fallback) — OS-level
- `graphify`, `tree-sitter-python`, `tree-sitter-typescript` — pip

**Per-target-repo, per-machine, ephemeral (gitignored in target repos):**
- `.claude-init/` — local graph output
- `graphify-out/cache/` — SHA256 cache

### What the user does on computer 2 when this plan lands

1. `cd claude-workflow-improvements && git pull`
2. `scripts/setup.sh` — re-runs idempotently. New pip-install block handles graphify + tree-sitter packages.
3. `cd <target-repo> && /infra-init` — first run per repo is cold; subsequent runs use the SHA256 cache.

---

## Task Reference

| # | Task | Size | Scope | Jira Key |
|---|---|---|---|---|
| 1 | `detect_structure.py` — repo-type detection script | S | `output/skills/infra-init/scripts/detect_structure.py` | — |
| 2 | `graphify_translate.py` — shape translator (node ID remap, type inference, edge mapping, drift-defensive) | M | `output/skills/infra-init/scripts/graphify_translate.py` | — |
| 3 | `env_var_scan.py` — tree-sitter env-var scanner (Python + TS/JS incl. destructuring) | M | `output/skills/infra-init/scripts/env_var_scan.py` | — |
| 4 | `serverless_enrich.py` — serverless.yml parser; entry points, routes, env defaults | M | `output/skills/infra-init/scripts/serverless_enrich.py` | — |
| 5 | `build_indexes.py` — symbols/callers/env_vars/endpoints index builder | S | `output/skills/infra-init/scripts/build_indexes.py` | — |
| 6 | `run_phase25.py` — orchestrator with atomic write + schema validation | S | `output/skills/infra-init/scripts/run_phase25.py` | — |
| 7 | SKILL.md rewrite — new phase orchestration, interpreter resolver, `--update` branch, gitignore step, MCP command fix | M | `output/skills/infra-init/SKILL.md` | — |
| 8 | Trim `graph-builder.md` to CODEBASE.md generation only | S | `output/skills/infra-init/agents/graph-builder.md` | — |
| 9 | Delete `structure.md` and `batch-indexer.md` subagent prompts | S | `output/skills/infra-init/agents/` | — |
| 10 | `setup.sh` — dependency-install block (graphify + tree-sitter, idempotent, fail-loud) | S | `scripts/setup.sh` | — |
| 11 | Update parent plan `plans/01-infrastructure-as-code/PLAN.md` (Phases 2/3, Deliverables, Freshness, progress.json example) | S | `plans/01-infrastructure-as-code/PLAN.md` | — |
| 12 | End-to-end verification run on notification-backend (see Verification section) | M | n/a — local run | — |

---

## Verification plan

Run the new `/infra-init` against `C:\Users\jason\repos\notification backend` (already has the old graph, apples-to-apples baseline).

**Before running:** back up existing `.claude-init/` to `.claude-init.backup/`.

**Smoke tests:**
1. `graphify --version` logs a value in `progress.json` without error.
2. `graphify-out/graph.json` exists and has non-empty `nodes`/`links` arrays.
3. `.claude-init/codebase-graph.json` is valid against `codebase-graph.schema.json`.

**Structural parity (new graph vs. backup):**
4. Node count ≥ 120 (graphify should match or exceed — if lower, translator is dropping nodes).
5. All 8 env vars from baseline are present: `COGNITO_CUSTOMERS_GROUP_NAME`, `COGNITO_SECRET_NAME`, `DEV_IOT_DATA_ENDPOINT`, `LOG_LEVEL`, `PROD_IOT_DATA_ENDPOINT`, `PUSHER_PARAMETER_NAME`, `STAGE`, `UNICRON_DYNAMODB_TABLE_NAME`. **Blocking if any missing.**
6. All 6 `reads_env` edges from baseline are present with the same `from`/`to` pairs.
7. All 7 entry points from `CODEBASE.md` are present with the same trigger strings.
8. `serverless.yml` `env_vars.defined_in` / `default` fields populated identically.

**New capabilities (graphify wins):**
9. `imports` edges present and non-zero — today's graph has zero; graphify adds these.
10. `inherits` edges surfaced during translation (logged even though dropped).

**MCP layer:**
11. Start `.claude-init/mcp/server.py` manually (`python3.11 server.py`). Invoke `codebase_search_symbol("NotificationService")`, `codebase_find_callers("get_cognito_user")`, `codebase_get_env_var("UNICRON_DYNAMODB_TABLE_NAME")` — each returns expected result shape.

**Incremental cache:**
12. Touch one source file; re-run `/infra-init`. Confirm graphify re-extracts only that file (cache hit rate > 95%).

**Regression on a clean repo:**
13. Run `/infra-init` on `claude-workflow-improvements` itself (no graph yet). Confirm cold-start builds cleanly.

---

## Out of scope (explicit non-goals)

- Pinning graphify version (accept upstream churn, monitor via `--version` log).
- Using graphify's own MCP server, HTML visualizer, Leiden clustering, or semantic/Whisper passes. JSON only.
- Adding confidence labels to our schema (graphify tracks them; we drop for now — revisit later).
- MCP registration in `.mcp.json` for notification-backend. Separate existing gap.
- Upstreaming an env-var tree-sitter query to graphify. Nice-to-have future PR.

---

## Review history

- Architect round 1: NEEDS REVISION — 6 BLOCKING (B1 node ID remap, B2 node type inference gaps, B3 unmapped edges, B4 missing top-level indexes, B5 destructured TS forms, B6 setup.sh idempotency) + 5 MINOR.
- Architect round 2: **APPROVED.** All 6 blockers resolved. 3 new MINOR operational notes folded into the plan (cold-rebuild escape hatch, parent plan progress.json example, non-Python/TS language behavior).
