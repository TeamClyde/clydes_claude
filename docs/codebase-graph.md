# Codebase Knowledge System

---

## Problem Statement

Claude spends significant time re-discovering things that are already known: where a function lives, whether a utility already exists, which files will be affected by a change. This burns context and leads to errors when the re-discovery is incomplete — wrong variable names, missing downstream impacts, reinvented code.

The fix is a compact symbol registry that Claude reads at the start of planning work, so the "where does this live?" question is already answered before the plan is written.

---

## Two-Layer Design

This plan covers Layer 1 only. Layer 2 is Plan 06.

**Layer 1 — Compact Knowledge Index (this plan)**
A machine-readable symbol registry: what exists, where it lives, and what connects to what. Claude uses this as a lookup table and then uses its tools to pull actual detail on demand. No rich documentation — just enough to answer "does this exist and where?"

**Layer 2 — Plan Doc Enrichment (Plan 06)**
Plan docs include which files/functions are being touched, what's changing, and what the downstream effects are — e.g., "changing function A so that function B can do X." This context is human-readable and lives in the plan doc itself. Plan 02 defines how plan docs get populated with this level of detail using the index from Layer 1 as a starting point.

---

## Knowledge Artifacts

Three artifacts, each with a distinct purpose:

### 1. SQLite Graph (codebase-memory-mcp)

The primary artifact — a SQLite-backed graph database managed globally by the `codebase-memory-mcp` binary. Indexed via `index_repository` when `/infra-init` runs. Queried on demand via MCP tools: `search_graph`, `query_graph`, `get_architecture`, `trace_path`, `search_code`. Never injected into context wholesale; never stored as a per-project JSON file.

### 2. Supplemental Enrichments (`.claude-init/enrichments.json`)

`codebase-memory-mcp` does not extract env var reads or AWS serverless trigger metadata. These are captured in a supplemental file by the enrichment scripts:

```json
{
  "env_vars": [
    { "name": "VAR_NAME", "reads": ["file.py:14"], "default": null, "defined_in": null }
  ],
  "entry_points": [
    { "handler": "src/function/foo.py", "trigger": "sqs:QueueName", "env_vars": ["VAR_NAME"] }
  ]
}
```

Written by `env_var_scan.py`, enriched in-place by `serverless_enrich.py`. Read directly by the graph-builder agent for trigger annotation.

### 3. Minimal Summary (`CODEBASE.md`)

A short human/Claude-readable file — entry points, key modules, and the fact that a graph exists. Read at the start of a planning session to orient.

```markdown
# Codebase Summary
<!-- last-updated: 2026-03-19, commit: abc1234 -->
Repo type: Python Lambda (serverless.yml)
Graph: indexed via codebase-memory-mcp (query via search_graph, query_graph, get_architecture)

## Entry Points
- src/function/send_notification_queue_consumer.py — sqs:SendNotificationQueue
- src/function/update_filter_life.py — eventbridge:app.filterlife
- src/function/get_pusher_user_token.py — http:GET:/pusher/token

## Domain Handlers
- src/function/email_consumer.py — handles email notification dispatch (entry point, trigger: null)

## External Services
- src/services/ses_service.py — wraps SES templated email sending
- src/clients/pusher.py — wraps Pusher HTTP API for push delivery

## Use Cases
- src/usecases/email_usecase.py — email notification business logic

## Repositories
- src/repositories/notification_repository.py — DynamoDB notification records
```

This file is intentionally short. Deeper questions go through Tool Search → MCP tools.

---

## The `/infra-init` Skill

### When to run `/infra-init`

Run `/infra-init` on any repo you plan to do meaningful development work in, regardless of size.

The graph is the foundation for the researcher and integration-engineer agents — both query the global MCP rather than grepping files directly.

**Why the graph over grep by default:**
- Grep returns raw file content — more context than needed, with no structure
- The graph returns exactly the symbol, caller, or env var requested — nothing else
- The researcher and integration-engineer agents depend on the MCP to do their jobs

### Skill Flow

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
│  PHASE 1 — Structure Agent                                  │
│  Reads: dir tree, package manifests, configs, README        │
│  Writes: .claude-init/structure.json                        │
│          .claude-init/progress.json (initialized)           │
└─────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2 — Index with codebase-memory-mcp                   │
│  Calls: index_repository(repo_path=<absolute path>)         │
│  Polls: index_status() until complete (10-min timeout)      │
│  Writes: progress.json (index.status = complete,            │
│          meta.repo_path = <absolute path>)                  │
└─────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2.5 — Supplemental Enrichment                        │
│  Runs: env_var_scan.py → .claude-init/enrichments.json      │
│  Runs: serverless_enrich.py (enriches enrichments.json)     │
│  Writes: progress.json (phase25.status = complete)          │
└─────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3 — Graph Builder Agent                              │
│  Queries: codebase-memory-mcp via get_architecture,         │
│           search_graph, query_graph                         │
│  Reads: enrichments.json (trigger annotation)               │
│  Reads: structure.json (repo_type for category naming)      │
│  Writes: .claude-init/CODEBASE.md                           │
└─────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  DONE                                                       │
│  Claude reads CODEBASE.md at session start                  │
│  Graph tools available on-demand via Tool Search            │
└─────────────────────────────────────────────────────────────┘
```

**`progress.json` schema:**

```json
{
  "meta": {
    "python_interpreter": "python3.11",
    "repo_path": "/absolute/path/to/repo",
    "started_at": "2026-04-24T14:00:00Z",
    "completed_at": null
  },
  "structure":   {"status": "complete"},
  "index":       {"status": "complete"},
  "phase25":     {"status": "complete", "output": ".claude-init/enrichments.json"},
  "codebase_md": {"status": "complete"}
}
```

Phase status values: `pending`, `complete`, `failed`. If `/infra-init` is interrupted, re-running it resumes from the first incomplete step.

### Temp file structure

```
.claude-init/              ← created by the skill, gitignored
  progress.json            ← task manifest
  structure.json           ← structure agent output
  enrichments.json         ← env var and serverless trigger metadata
  CODEBASE.md              ← human-readable summary (Phase 3 output)
```

---

### Phase 1 — Structure Agent

Reads the directory tree, package manifests, top-level config files, and README. Does not read individual source files.

**Repo type detection:**
- `serverless.yml` → AWS Lambda backend
- `package.json` with express/fastify → Node HTTP server
- `requirements.txt` with fastapi/flask → Python HTTP server
- `pubspec.yaml` → Flutter mobile
- `CMakeLists.txt` or `*.ino` → firmware/embedded
- `android/` + `ios/` → React Native

---

### Phase 2 — Index with codebase-memory-mcp

**Prerequisite:** `codebase-memory-mcp` must be registered in `~/.claude/settings.json`. Verify:

```
ToolSearch("select:index_repository,index_status")
```

If `index_repository` is not found, stop and tell the user. Get the absolute repo path, then call:

```
index_repository(repo_path="<absolute path>")
```

Poll `index_status()` up to 20 times (30 seconds between calls) until `complete`. Record the path in `meta.repo_path` in `progress.json` — Phase 3 uses this to scope all MCP queries.

---

### Phase 2.5 — Supplemental Enrichment

`codebase-memory-mcp` does not extract env var reads or serverless triggers. Run:

```bash
$PY ~/.claude/skills/infra-init/scripts/env_var_scan.py \
    --root . \
    --out .claude-init/enrichments.json

$PY ~/.claude/skills/infra-init/scripts/serverless_enrich.py \
    --root . \
    --enrichments .claude-init/enrichments.json
```

If no Python/TS files or serverless config are found, `enrichments.json` is `{"env_vars": [], "entry_points": []}` — not an error.

---

### Phase 3 — Graph Builder Agent

Reads `progress.json` (for `meta.repo_path`) and `enrichments.json` (for trigger annotation). Queries:

- `get_architecture(repo_path=...)` — entry points, modules, service boundaries (Category 1)
- `search_graph(...)` — find symbols by name or type (Categories 2–5)
- `query_graph("MATCH ...")` — Cypher traversal for call relationships

Builds `CODEBASE.md` with the 5-category format. Cross-references `enrichments.json` `entry_points` for serverless trigger annotations.

---

## How Claude Uses the Knowledge System

**At session start (planning):** Read `CODEBASE.md`. Orients Claude to repo type, entry points, and key modules.

**During planning, when navigation is needed:**

- "What already exists that handles Cognito auth?" → `search_graph("cognito")`
- "What will break if I change `get_cognito_user`?" → `query_graph("MATCH (x)-[:CALLS]->(f:Function {name:'get_cognito_user'}) RETURN x")`
- "What env vars does the notification service read?" → Read `.claude-init/enrichments.json` directly

**Most sessions:** No graph interaction at all. `codebase-memory-mcp` is registered globally with `defer_loading: true` — zero context cost unless Tool Search surfaces the tools.

**Content written into the project `CLAUDE.md` by `/infra-init`:**
- At the start of any planning session, read `CODEBASE.md` first
- If `CODEBASE.md` is missing, run `/infra-init` before writing a plan
- Before writing a new function or utility, use `search_graph` to check if it already exists
- Before changing a function signature, use `query_graph` (CALLS) to scope the full impact
- Symbol file:line references in plan docs come from graph queries — not from ad-hoc searching

---

## Freshness

`/infra-init` runs once — it sets things up. After that: make it once, keep it current as things change.

| Section | Update trigger |
|---------|---------------|
| Entry Points & Structure | Major refactors only |
| API Contracts | When route files change |
| Data Models | When schema or type definition files change |
| Utility Functions | When utils/helpers/common change |
| Config & Environment | When serverless.yml, .env, or infra/*.yml change |

- Each section has a `<!-- last-updated: date, commit: hash -->` staleness marker
- When a plan involves changing something covered by the index, updating the relevant section is a step in the plan
- If `git rev-list --count <staleness-commit>..HEAD` returns more than 30, the section is stale
- Full re-init only needed if repo structure changes fundamentally

---

## Deliverables

| # | Deliverable | Location | Notes |
|---|-------------|----------|-------|
| 1 | `/infra-init` skill | `~/.claude/skills/infra-init/skill.md` (+ `agents/` subdirectory) | Orchestrates all phases |
| 2 | Integration agent (standalone) | Scoped in Plan 05 | Cross-repo endpoint mapping |
| 3 | `CODEBASE.md` template | `templates/CODEBASE.md` (this repo) | 5-category summary template |
| 4 | Project CLAUDE.md codebase section | Written into the repo's `CLAUDE.md` by `/infra-init` | Tool names, "read CODEBASE.md first" rule |

---

## Cross-Plan Dependencies

| Plan | Relationship | Notes |
|------|-------------|-------|
| **Plan 06 — Plan Management** | Consumes the graph. Defines how plan docs reference file:line locations. | None — Plan 01 can be fully built first. |
| **Plan 03 — Testing System** | The graph informs what needs integration tests and external contract tests. | None. |
| **Plan 05 — Agent Architecture** | The Integration Agent is fully scoped there. | Integration Agent build is blocked on Plan 05. |
