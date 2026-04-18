# Codebase Knowledge System

> **Note:** The original design had `/infra-init` orchestrate multiple LLM sub-agents to extract symbols/calls/imports from source (Phase 2 Batch Indexers). That design has been **replaced** by a wrapper around [graphify](https://github.com/safishamsi/graphify) — deterministic tree-sitter extraction, SHA256-cached — with a custom Python enrichment pass for env vars (which graphify does not extract) and AWS serverless triggers/routes. The external contract (graph schema, FastMCP server, CODEBASE.md) is unchanged. Sections below describing Batch Indexers are historical; the current flow is: detect_structure → graphify build → translate + env_var_scan + serverless_enrich + build_indexes → CODEBASE.md sub-agent → MCP setup.

---

## Problem Statement

Claude spends significant time re-discovering things that are already known: where a function lives, whether a utility already exists, which files will be affected by a change. This burns context and leads to errors when the re-discovery is incomplete — wrong variable names, missing downstream impacts, reinvented code.

The fix is a compact symbol registry that Claude reads at the start of planning work, so the "where does this live?" question is already answered before the plan is written.

---

## Two-Layer Design

This plan covers Layer 1 only. Layer 2 is Plan 06.

**Layer 1 — Compact Knowledge Index (this plan)**
A machine-readable symbol registry: what exists, where it lives, and what connects to what. Claude uses this as a lookup table and then uses its tools (LSP MCP, tree-sitter, grep, Read) to pull actual detail on demand. No rich documentation — just enough to answer "does this exist and where?"

**Layer 2 — Plan Doc Enrichment (Plan 06)**
Plan docs include which files/functions are being touched, what's changing, and what the downstream effects are — e.g., "changing function A so that function B can do X." This context is human-readable and lives in the plan doc itself, not in a persistent knowledge file. Plan 02 defines how plan docs get populated with this level of detail using the index from Layer 1 as a starting point.

---

## The Knowledge Artifacts

Two artifacts, two different purposes:

### 1. Code Graph (`codebase-graph.json`)

The primary artifact — a compact JSON file capturing symbols as nodes and relationships as edges. This is the data layer that MCP tools query on demand. Never injected into context wholesale.

```json
{
  "meta": {
    "repo_type": "python-lambda",
    "generated_at": "2026-03-19T14:00:00Z",
    "commit": "abc1234",
    "root": "/repos/unicron-backend"
  },
  "nodes": [
    {
      "id": "src/services/notification.py::NotificationService",
      "type": "class",
      "name": "NotificationService",
      "file": "src/services/notification.py",
      "line_start": 8,
      "exported": true,
      "is_entry_point": false
    },
    {
      "id": "src/function/send_notification_queue_consumer.py::send_notification_handler",
      "type": "function",
      "name": "send_notification_handler",
      "file": "src/function/send_notification_queue_consumer.py",
      "line_start": 1,
      "exported": true,
      "is_entry_point": true,
      "trigger": "sqs:SendNotificationQueue"
    },
    {
      "id": "src/utils/cognito.py::get_cognito_user",
      "type": "function",
      "name": "get_cognito_user",
      "file": "src/utils/cognito.py",
      "line_start": 14,
      "exported": true,
      "is_entry_point": false
    },
    {
      "id": "env::UNICRON_DYNAMODB_TABLE_NAME",
      "type": "env_var",
      "name": "UNICRON_DYNAMODB_TABLE_NAME",
      "env_var_name": "UNICRON_DYNAMODB_TABLE_NAME",
      "env_var_default": "unicronTable-${stage}",
      "file": "serverless.yml",
      "line_start": 109
    },
    {
      "id": "env::PUSHER_PARAMETER_NAME",
      "type": "env_var",
      "name": "PUSHER_PARAMETER_NAME",
      "env_var_name": "PUSHER_PARAMETER_NAME",
      "env_var_default": "/backend/notification/pusher",
      "file": "serverless.yml",
      "line_start": 114
    },
    {
      "id": "src/api-client.ts::apiClient",
      "type": "route",
      "name": "apiClient",
      "file": "src/api-client.ts",
      "line_start": 186,
      "is_entry_point": false,
      "route_base": "API_BASE_URL",
      "route_prefix": "v2/admin"
    }
  ],
  "edges": [
    {
      "type": "calls",
      "from": "src/function/send_notification_queue_consumer.py::send_notification_handler",
      "to": "src/services/notification.py::NotificationService::dispatch",
      "file": "src/function/send_notification_queue_consumer.py",
      "line": 24
    },
    {
      "type": "calls",
      "from": "src/services/notification.py::NotificationService::dispatch",
      "to": "src/utils/cognito.py::get_cognito_user",
      "file": "src/services/notification.py",
      "line": 51
    },
    {
      "type": "calls",
      "from": "src/services/auth.py::authenticate",
      "to": "src/utils/cognito.py::get_cognito_user",
      "file": "src/services/auth.py",
      "line": 33
    },
    {
      "type": "reads_env",
      "from": "src/services/notification.py::NotificationService",
      "to": "env::UNICRON_DYNAMODB_TABLE_NAME",
      "file": "src/services/notification.py",
      "line": 18
    },
    {
      "type": "reads_env",
      "from": "src/clients/pusher.py::PusherClient",
      "to": "env::PUSHER_PARAMETER_NAME",
      "file": "src/clients/pusher.py",
      "line": 8
    },
    {
      "type": "imports",
      "from": "src/function/send_notification_queue_consumer.py::send_notification_handler",
      "to": "src/services/notification.py::NotificationService",
      "file": "src/function/send_notification_queue_consumer.py",
      "line": 3
    }
  ]
}
```

### 2. Minimal Summary (`CODEBASE.md`)

A short human/Claude-readable file — entry points, key modules, and the fact that a graph exists. Read at the start of a planning session to orient. Not a full symbol list.

```markdown
# Codebase Summary
<!-- last-updated: 2026-03-19, commit: abc1234 -->
Repo type: Python Lambda (serverless.yml)
Full graph: codebase-graph.json (query via codebase MCP tools)

## Entry Points
- src/function/send_notification_queue_consumer.py — sqs:SendNotificationQueue
- src/function/update_filter_life.py — eventbridge:app.filterlife
- src/function/get_pusher_user_token.py — http:GET:/pusher/token

## Domain Handlers
- src/function/email_consumer.py — handles email notification dispatch (entry point, trigger: null)
- src/function/push_consumer.py — handles push notification dispatch (entry point, trigger: null)

## External Services
- src/services/ses_service.py — wraps SES templated email sending
- src/clients/pusher.py — wraps Pusher HTTP API for push delivery

## Use Cases
- src/usecases/email_usecase.py — email notification business logic

## Repositories
- src/repositories/notification_repository.py — DynamoDB notification records
- src/repositories/dynamodb.py — base DynamoDB access layer
```

This file is intentionally short. Deeper questions ("what calls this?", "what env vars does this module read?") go through Tool Search → MCP tools → graph.

---

## The `/infra-init` Skill

### When to run `/infra-init`

Run `/infra-init` on any repo you plan to do meaningful development work in, regardless of size.

The graph is not just a navigation aid — it is the foundation for the researcher and integration-engineer agents, both of which query the local MCP rather than grepping files directly. A small repo still benefits: the MCP tools provide minimum necessary context on demand, whereas grep provides more context than needed (or requires multiple passes when the exact location is unknown). The code graph/MCP should be the default lookup mechanism; Grep and Read are reserved for cases where you need to read and understand actual code, or where the graph hasn't been built yet.

**Why the graph over grep by default:**
- Grep returns raw file content — more context than needed, with no structure
- Claude often doesn't know exactly what it's looking for, leading to multiple grep passes
- The graph returns exactly the symbol, caller, or env var requested — nothing else
- The researcher and integration-engineer agents depend on the local MCP to do their jobs

---

A one-time skill run at the start of working in a new repo. Deploys a coordinated team of subagents via the Agent tool across four phases. Does not run in a single context window — state lives in files, not conversation history.

### Skill Flow (Sequential Diagram)

```
User / Skill Trigger
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  ENTRY: Check .claude-init/progress.json                    │
│  ├── exists → resume from first incomplete step             │
│  └── missing → start fresh                                  │
└─────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1 — Structure Agent (single agent, sequential)       │
│                                                             │
│  Reads: dir tree, package manifests, top-level configs,     │
│         README                                              │
│  Detects: repo type, key dirs, file list (src only)        │
│  Writes: .claude-init/structure.json                        │
│          .claude-init/progress.json (file list + batches)   │
└─────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2 — Batch Indexers (parallel map — 3–5 at once)      │
│                                                             │
│  Orchestrator reads progress.json, spawns N agents         │
│                                                             │
│  Each indexer:                                              │
│  ├── Claims one pending batch from progress.json           │
│  ├── Reads ~20 source files                                │
│  ├── Extracts symbols, calls, imports, env vars, routes    │
│  └── Writes .claude-init/results/batch_NN.json             │
│                                                             │
│  On context limit mid-batch:                               │
│  ├── Writes batch_NN_handoff.json (files done/remaining)   │
│  └── Sets status → needs_continuation                      │
│      Orchestrator re-spawns indexer with handoff context   │
│                                                             │
│  Loop until all batches → complete                         │
└─────────────────────┬───────────────────────────────────────┘
                       │  (all batches complete)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3 — Graph Builder (single agent, reduce phase)       │
│                                                             │
│  Reads: all batch_NN.json files (no source file reading)   │
│  Builds: symbols index, callers index,                      │
│          env vars index, endpoints index                    │
│  Writes: codebase-graph.json                               │
│          CODEBASE.md (short human-readable summary)        │
└─────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 4 — MCP Tool Setup                                   │
│                                                             │
│  Generates: codebase-mcp/ Python server (reads graph JSON) │
│  Registers: 6 query tools in .claude/settings.json         │
│             (defer_loading: true — zero context cost)       │
│  Cleans up: .claude-init/ temp directory                   │
└─────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  DONE                                                       │
│  Claude reads CODEBASE.md at session start                 │
│  Graph tools available on-demand via Tool Search           │
└─────────────────────────────────────────────────────────────┘
```

**Key state flow in `progress.json`:**
```
pending → in_progress → complete
                      ↘ needs_continuation → (re-spawn) → complete
                      ↘ failed (error captured)
```

The resume-on-interrupt behavior runs through every phase boundary — if the skill is killed after Phase 2 but before Phase 3, re-running it skips directly to the Graph Builder.

### Temp file structure

```
.claude-init/              ← created by the skill, gitignored
  progress.json            ← task manifest (orchestrator reads/writes this)
  structure.json           ← structure agent output
  results/
    batch_00.json          ← flat per-file extraction output
    batch_01.json
    ...
```

`progress.json` is the single source of truth (current shape, post–graphify-wrap):
```json
{
  "meta": {
    "python_interpreter": "python3.11",
    "graphify_version": "0.X.Y",
    "started_at": "2026-04-15T14:00:00Z",
    "completed_at": null
  },
  "structure":   {"status": "complete"},
  "graphify":    {"status": "complete", "mode": "cold"},
  "phase25":     {"status": "pending", "output": ".claude-init/codebase-graph.json"},
  "codebase_md": {"status": "pending"},
  "mcp_setup":   {"status": "pending"}
}
```

Phase status values: `pending`, `complete`, `failed` (error captured in `error` field).

If `/infra-init` is interrupted, re-running it reads `progress.json` and resumes from the first incomplete step — no work is repeated.

---

### Phase 1 — Structure Agent

Reads the directory tree, package manifests, top-level config files, and README. Does not read individual source files. Produces `structure.json` and populates `progress.json` with the full file list and initial batch assignments.

**Determines:**
- Repo type and key directories
- Which files to include (source files only — skip node_modules, dist, build, .git, test fixtures)
- Batch assignments (files grouped into batches of ~20)
- Output format (single CODEBASE.md vs. codebase/ folder)

**Repo type detection:**
- `serverless.yml` → AWS Lambda backend
- `package.json` with express/fastify → Node HTTP server
- `requirements.txt` with fastapi/flask → Python HTTP server
- `pubspec.yaml` → Flutter mobile
- `CMakeLists.txt` or `*.ino` → firmware/embedded
- `android/` + `ios/` → React Native

---

### Phase 2 — Batch Indexers (parallel map phase)

Multiple instances of the same generic indexer agent run in parallel — typically 3–5 at once. Each claims one pending batch from `progress.json`, reads those ~20 files, and writes flat extraction output to its batch JSON file.

**Each indexer agent's only job is extraction — no synthesis, no filtering by concern.**

Batch output schema — nodes and edges extracted from each file in the batch:
```json
{
  "batch": 1,
  "nodes": [
    {
      "id": "src/services/notification.py::NotificationService",
      "type": "class",
      "name": "NotificationService",
      "file": "src/services/notification.py",
      "line_start": 8,
      "exported": true,
      "is_entry_point": false
    },
    {
      "id": "env::PUSHER_PARAMETER_NAME",
      "type": "env_var",
      "name": "PUSHER_PARAMETER_NAME",
      "env_var_name": "PUSHER_PARAMETER_NAME",
      "file": "src/clients/pusher.py",
      "line_start": 8
    }
  ],
  "edges": [
    {
      "type": "calls",
      "from": "src/services/notification.py::NotificationService::dispatch",
      "to": "src/utils/cognito.py::get_cognito_user",
      "file": "src/services/notification.py",
      "line": 51
    },
    {
      "type": "reads_env",
      "from": "src/clients/pusher.py::PusherClient",
      "to": "env::PUSHER_PARAMETER_NAME",
      "file": "src/clients/pusher.py",
      "line": 8
    }
  ]
}
```

Node ID convention: `"relative/path.py::ClassName::method_name"` — stable, human-readable, scoped to the repo root. The Graph Builder uses IDs to deduplicate across batches (env var nodes especially may appear in multiple batches).

Batch sizing rules:
- Default: 20 files per batch
- Large files (500+ lines): drop to 10 per batch
- Tiny files (configs, constants): up to 40 per batch
- Mixed batches: size is determined by the largest file in the batch
- Never exceed 60% of the context budget on file content — leave room for reasoning and output

If an indexer runs out of context mid-batch, it writes a handoff document to `.claude-init/results/batch_NN_handoff.json` (< 2K tokens: files completed, files remaining, findings so far) and sets the batch status to `needs_continuation`. The orchestrator re-spawns the indexer with the handoff doc as its starting context.

The orchestrator marks each batch `complete` when the output file exists and is valid JSON. All batches must be `complete` before Phase 3 starts.

---

### Phase 3 — Graph Builder (reduce phase)

A single agent reads all batch JSON files and compiles them into `codebase-graph.json`. No file reading at this stage — works entirely from batch output.

**Two steps:**
1. **Merge**: concatenate all `nodes` arrays across batches, deduplicate by `id` (env var nodes and shared utility nodes may appear in multiple batches — last-write wins). Concatenate all `edges` arrays — edges are not deduplicated since two files can both call the same function.
2. **Enrich env vars**: cross-reference env var nodes against infrastructure files (`serverless.yml`, `.env`, `infra/*.yml`) to populate `env_var_default` values where missing. Batch indexers record where env vars are *read*; this step records where they are *defined*.

Also generates `CODEBASE.md` — a 5-category structured index (Entry Points, Domain Handlers, External Services, Use Cases, Repositories — names vary by repo type) built from the node graph using directory path and naming conventions to assign each file to its category.

---

### Phase 4 — MCP Tool Setup

Runs after the graph is fully built (Phases 1–3 complete). Creates a local Python MCP server (`codebase-mcp/`) that reads `codebase-graph.json` and exposes query tools. Registers these tools in the project's `.claude/settings.json` with `defer_loading: true` so they consume zero context until searched for. Cleans up `.claude-init/` temp files.

The MCP server is always Python regardless of the repo's primary language — it only reads a JSON file and needs no language-specific dependencies.

**Tools registered:**

| Tool | What it does |
|------|-------------|
| `codebase_search_symbol` | Find a symbol by name or description |
| `codebase_find_callers` | Who calls this function or class |
| `codebase_find_dependencies` | What does this file import, and what imports it |
| `codebase_get_env_var` | Where is this env var defined and who reads it |
| `codebase_get_entry_points` | All entry points and their triggers |
| `codebase_search_api_endpoints` | Exposed routes and consumed API clients |

Claude discovers these via `tool_search_tool_bm25` when it needs to navigate — e.g., searching "find codebase callers" surfaces `codebase_find_callers`. Sessions that never need graph navigation pay zero context cost.

`defer_loading: true` is the correct key for each tool definition — confirmed in the Anthropic API docs.

**MCP server implementation:** The server is built with FastMCP (`pip install "mcp[cli]"`). It uses `transport="stdio"` for Claude Code integration. At startup it loads `codebase-graph.json` and pre-builds lookup indexes (by id, by name, by file) for sub-millisecond query performance. Do not `print()` to stdout — it corrupts the JSON-RPC stream; use `logging` to stderr. Python 3.10+ required.

The `templates/codebase-mcp/` directory in this repo contains the starter implementation that `/infra-init` copies into each repo. See the Deliverables section for its contents.

---

## MCP Tool Strategy

`/infra-init` creates a **local MCP server** (`codebase-mcp/`) committed to the repo. This is not optional and does not depend on what's already installed — the skill generates it as part of setup.

The local MCP server is a lightweight Python script (FastMCP) that reads `codebase-graph.json` and exposes the query tools. It requires no external services, no auth, no language server. Python is used regardless of the repo's primary language — it only reads a JSON file and has no language-specific dependencies.

**Reference implementations** worth reading before writing `server.py`:
- `CartographAI/mcp-server-codegraph` — closest open-source match (Python, in-memory, clean tool structure)
- `DeusData/codebase-memory-mcp` — production-grade, 66 languages, git-diff aware

**Extraction accuracy during `/infra-init`**: The batch indexers use the best available tool in priority order:
1. `mcp-language-server` if configured → most accurate (full type resolution, cross-file refs)
2. `mcp-server-tree-sitter` if configured → good accuracy, no setup required
3. Targeted grep + glob → always works, slightly less precise on relationships

The local MCP query tools (created by `/infra-init`) are separate from these extraction tools — they query the already-built graph file and have no dependency on either.

---

## How Claude Uses the Knowledge System

**At session start (planning):** Read `CODEBASE.md` — the short summary. This orients Claude to repo type, entry points, and key modules in a few dozen lines. No deep reading needed.

**During planning, when navigation is needed:** Use Tool Search (`tool_search_tool_bm25`) to find the right codebase query tool, then call it. Examples:
- "What already exists that handles Cognito auth?" → search "codebase symbol search" → `codebase_search_symbol("cognito")`
- "What will break if I change `get_cognito_user`?" → search "codebase find callers" → `codebase_find_callers("get_cognito_user")`
- "What env vars does the notification service read?" → search "codebase env var" → `codebase_get_env_var("COGNITO_SECRET_NAME")`

**Most sessions:** No graph interaction at all. The local MCP tools are registered with `defer_loading: true` — they consume zero context unless Tool Search surfaces them.

**Content written into the project `CLAUDE.md` codebase section by `/infra-init`:**
- At the start of any planning session in a repo with `/infra-init` set up, read `CODEBASE.md` first
- If `CODEBASE.md` is missing, run `/infra-init` before writing a plan
- Before writing a new function or utility, use `codebase_search_symbol` to check if it already exists
- Before changing a function signature or env var name, use `codebase_find_callers` to scope the full impact
- Symbol file:line references in plan docs come from graph queries — not from ad-hoc searching

---

## Freshness

`/infra-init` runs once, the same way `/init` works — it sets things up. After that it's a maintenance model, the same as CLAUDE.md: make it once, keep it current as things change.

Maintenance is layered by how often each section changes:

| Section | Update trigger |
|---------|---------------|
| Entry Points & Structure | Major refactors only (new service, restructured directories) |
| API Contracts | When route files change or new endpoints are added |
| Data Models | When schema, migration, or type definition files change |
| Utility Functions | When files in utils/helpers/common change |
| Config & Environment | When serverless.yml, .env, or infra/*.yml change |

**How updates happen:**
- Each section has a `<!-- last-updated: date, commit: hash -->` staleness marker
- When a plan involves changing something covered by the index (adding an endpoint, new model, new utility), updating the relevant section is included as a step in the plan — not a separate task, not an afterthought
- Claude flags stale sections before reading them: if `git rev-list --count <staleness-commit>..HEAD` returns more than 30, the section is considered stale and Claude notes it before relying on it
- Full re-init is only needed if the repo structure changes so fundamentally that section-level updates aren't enough

---

## Deliverables

| # | Deliverable | Location | Notes |
|---|-------------|----------|-------|
| 1 | `/infra-init` skill | `~/.claude/skills/infra-init/SKILL.md` (+ `agents/` subdirectory) | Orchestrates all phases; agent prompts live in `agents/` |
| 2 | Integration agent (standalone) | Scoped in Plan 05 | Cross-repo endpoint mapping; requires multiple repos set up first |
| 3 | Local MCP server template | `templates/codebase-mcp/` (this repo) | Copied per-repo by `/infra-init`. Contains: `server.py` (FastMCP, 6 query tools, pre-built indexes), `requirements.txt` (`mcp[cli]>=1.2.0`), `README.md` (how to run / register in settings.json) |
| 4 | Graph schema | `templates/codebase-graph.schema.json` (this repo) | JSON Schema (draft-07) for the graph format — nodes array (id, type, name, file, line_start, exported, is_entry_point, env_var_name) + edges array (type, from, to, file, line). Node types: file, class, function, method, env_var, route. Edge types: calls, imports, reads_env, contains, defines, exports. This is the contract the batch indexers write to and the MCP server reads from. |
| 5 | `CODEBASE.md` template | `templates/CODEBASE.md` (this repo) | 5-category summary template (Entry Points, Domain Handlers, External Services, Use Cases, Repositories — names vary by repo type) |
| 6 | Project CLAUDE.md codebase section | Written into the repo's `CLAUDE.md` by `/infra-init` when it runs | Graph path, summary path, query tool names, "read CODEBASE.md first" rule — see Plan 07 `new-repo-setup.md` template |

---

---

## Cross-Plan Dependencies

| Plan | Relationship | Notes |
|------|-------------|-------|
| **Plan 06 — Plan Management** | Consumes the graph. Defines how plan docs reference file:line locations and describe downstream effects. | None — Plan 01 can be fully built before Plan 06 is designed. |
| **Plan 03 — Testing System** | The `endpoints` section of `codebase-graph.json` informs what needs integration tests and what external contracts tests should verify. | None — Plan 01 can be fully built before Plan 03 is designed. |
| **Plan 05 — Agent Architecture** | The Integration Agent is fully scoped there. The multi-agent fan-out pattern (Batch Indexers + Graph Builder) is also the first concrete use case for orchestration design — patterns that work here should be generalized there. | Integration Agent build is entirely blocked on Plan 05. |
