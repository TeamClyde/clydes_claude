---
**Feature:** Codebase Knowledge Graph
**C4 Layer:** C3 Component
**Status:** Active
**Owner:** solo
**Last updated:** 2026-06-18
**Related plans:** plans/orchestration-layer-foundation/ (Phase 1B docs)
**Related ADRs:** _(none)_
**Key files:**
  - `skills/infra-init/SKILL.md` — 3-phase graph generation orchestrator
  - `.claude-init/CODEBASE.md`, `.claude-init/enrichments.json` — generated knowledge artifacts (per repo)
  - `rules/filesystem/efficiency.md` — graph-tools-as-default navigation rule
---

# Codebase Knowledge Graph

## Context & Scope

The Codebase Knowledge Graph is the symbol-navigation and planning-context subsystem for this workflow. Its purpose is to eliminate redundant codebase re-discovery — Claude repeatedly spending context re-locating functions, checking whether a utility already exists, or scoping the blast radius of a signature change — by building a queryable, indexed representation of a repo's code structure once, then querying it on demand in subsequent sessions.

**What this covers:**

- The `/infra-init` skill that orchestrates graph generation across three phases
- The `codebase-memory-mcp` MCP server that provides the SQLite-backed graph and its five query tools
- The two-layer knowledge system: the graph itself (primary) plus two supplemental static files (`.claude-init/enrichments.json` and `.claude-init/CODEBASE.md`)
- The rule that graph tools are the default for code navigation whenever a graph is present, with Grep as the explicit fallback
- The freshness model for keeping the graph current across active development

**What this does NOT cover:**

- Plan doc enrichment (how plan docs reference file:line locations — governed separately)
- The integration-engineer agent (cross-repo endpoint mapping — scoped independently)
- The `e2e-init` skill or any testing infrastructure
- Graph installation or MCP server configuration (the MCP must be globally installed before `/infra-init` is invoked; this feature does not install it)

The primary consumer of this system is the main Claude session (planner role) and any subagents that do codebase navigation. Once a graph is indexed, zero additional context cost is incurred in sessions that do not need navigation: `codebase-memory-mcp` is registered with `defer_loading: true`, keeping all five tools out of the context window until explicitly loaded via Tool Search.

---

## Building Block View

The system has two architectural layers, each with a distinct set of artifacts and a different access pattern.

**Layer 1 — The SQLite Graph (primary)**

Managed globally by the `codebase-memory-mcp` binary. One index per repo, stored in the MCP server's own data directory. Never injected into the context window wholesale; never stored as a per-project JSON blob. Accessed exclusively through five MCP tools:

| Tool | Purpose |
|---|---|
| `search_code` | Full-text ranked code search — ranked and deduplicated results |
| `search_graph` | Find a symbol, file, or node by name or type |
| `query_graph` | Cypher-style traversal — callers, callees, imports |
| `get_architecture` | Entry points, modules, and architectural overview |
| `trace_path` | Trace the call chain between two named symbols |

All five tools require a `project` parameter — the canonical key assigned by the MCP server at index time. This key is path-derived but non-obvious (slashes converted to hyphens, internal underscores preserved). It must be read from `list_projects()` output, never constructed client-side. The project's CLAUDE.md (written by `/infra-init` post-completion) stores this key under `## Codebase Knowledge Graph` so it does not need to be looked up every session.

**Layer 2 — Static Supplemental Files**

Two files under `.claude-init/`, gitignored build output, written by `/infra-init` and read directly rather than queried through the MCP:

`.claude-init/enrichments.json` — captures information `codebase-memory-mcp` does not extract: environment variable reads (file:line, default, where defined) and AWS serverless trigger metadata (handler path, trigger source, which env vars the handler reads). Read directly by the graph-builder agent during Phase 3 for trigger annotation, and read directly at navigation time when env var or trigger questions arise.

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

`.claude-init/CODEBASE.md` — a short human/Claude-readable summary: repo type, entry points, key modules grouped into five categories, and a pointer to the MCP tools. Written by the graph-builder agent in Phase 3. Read at the start of any planning session to orient before writing a plan or making navigation queries. Intentionally terse — deeper questions go through the graph tools. Each section carries a `<!-- last-updated: date, commit: hash -->` staleness marker.

**Navigation rule (from `rules/filesystem/efficiency.md`):** When `.claude-init/CODEBASE.md` exists, graph tools are the default for all symbol and code navigation. Grep is the fallback, used only when no graph is present, for non-source files (logs, generated output, configs), or when reading raw implementation logic the graph does not capture. The rationale: Grep returns raw file content — more context than needed, with no structure. Graph tools return exactly the symbol, caller, or env var requested, with nothing else.

Load the five tools once per session via:

```
ToolSearch("select:mcp__codebase-memory-mcp__search_code,mcp__codebase-memory-mcp__search_graph,mcp__codebase-memory-mcp__query_graph,mcp__codebase-memory-mcp__trace_path,mcp__codebase-memory-mcp__get_architecture")
```

**Tool decision table (from `rules/filesystem/efficiency.md`):**

| Need | Tool |
|---|---|
| Find a symbol or code by name/text | `search_code` or `search_graph` |
| What calls this function? | `query_graph` (`MATCH (x)-[:CALLS]->(f:Function {name:"X"}) RETURN x`) |
| What does this file import? | `query_graph` (`MATCH (f {file:"X"})-[:IMPORTS]->(d) RETURN d`) |
| Where is this env var defined? | Read `.claude-init/enrichments.json` directly |
| What are the entry points? | `get_architecture` |
| What routes are exposed? | `search_graph` (filter: Route nodes) |
| Trace call chain between two symbols | `trace_path` |

---

## Runtime View

The `/infra-init` skill orchestrates graph generation across four phases (including Phase 2.5). The entry check makes the flow resumable: on every invocation the skill reads `.claude-init/progress.json` and skips any phase whose `status` is already `complete`.

**Entry check:**

- `progress.json` absent → start fresh from Phase 1
- All phases `complete` → confirm with user before overwriting (default: full refresh)
- File exists but incomplete → offer Resume (skip complete phases) or Restart

**Phase 1 — Structure Detection (inline, no sub-agent)**

Runs `detect_structure.py` against the repo root. Reads the directory tree, package manifests, top-level configs, and README — does not read individual source files. Detects repo type from manifest signals (`serverless.yml` → AWS Lambda backend; `package.json` + express/fastify → Node HTTP server; `requirements.txt` + fastapi/flask → Python HTTP server; `pubspec.yaml` → Flutter; `CMakeLists.txt`/`*.ino` → firmware; `android/` + `ios/` → React Native). Writes `.claude-init/structure.json` and initializes `progress.json`.

**Phase 2 — Index with codebase-memory-mcp**

Verifies the MCP is loaded via `ToolSearch`. Gets the absolute repo path using `git rev-parse --show-toplevel` (not `pwd -P` — see Gotchas). Calls `index_repository(repo_path=<REPO_PATH>)` and captures the `project` key from the response. Polls `index_status(project=<PROJECT>)` up to 20 times at 30-second intervals (10-minute timeout) until status reaches `complete`. Records `meta.repo_path` and `index.status = "complete"` in `progress.json`.

**Phase 2.5 — Supplemental Enrichment**

Runs two Python scripts sequentially:

1. `env_var_scan.py` — tree-sitter-based scan of Python/TS source files; writes `.claude-init/enrichments.json` with `env_vars` entries
2. `serverless_enrich.py` — reads `serverless.yml` (if present) and enriches `enrichments.json` in-place with `entry_points` trigger annotations

If neither script finds relevant data (no Python/TS files, no serverless config), `enrichments.json` is written as `{"env_vars": [], "entry_points": []}`. This is not an error. Sets `phase25.status = "complete"`.

**Phase 3 — Graph Builder Agent (sub-agent, model: Sonnet)**

Spawns a single graph-builder sub-agent. The agent reads `meta.repo_path` from `progress.json` to scope all MCP queries, reads `enrichments.json` for trigger annotation, and reads `structure.json` for repo type naming. It then queries:

- `get_architecture(repo_path=...)` — extracts entry points, modules, and service boundaries (Category 1 of CODEBASE.md)
- `search_graph(...)` — discovers symbols by name and type (Categories 2–5)
- `query_graph("MATCH ...")` — Cypher traversal for call relationships

The agent writes `.claude-init/CODEBASE.md` using a five-category format and sets `codebase_md.status = "complete"`. Phase 3 is the only sub-agent in the entire skill; all other phases run inline.

**Post-completion (inline)**

1. Calls `list_projects()` and records the canonical project name (the entry whose `repo_path` matches `meta.repo_path`) — never derived client-side
2. Writes or replaces the `## Codebase Knowledge Graph` section in the target repo's CLAUDE.md, including the project name, file paths, and the five query tool names
3. Appends `.claude-init/` to the repo's `.gitignore` if not already present
4. Reports index status, project name, and file paths to the user

**`progress.json` schema (complete state):**

```json
{
  "meta": {
    "python_interpreter": "python3.11",
    "repo_path": "/absolute/path/to/repo",
    "started_at": "2026-04-24T14:00:00Z",
    "completed_at": "2026-04-24T14:08:43Z"
  },
  "structure":   {"status": "complete"},
  "index":       {"status": "complete"},
  "phase25":     {"status": "complete", "output": ".claude-init/enrichments.json"},
  "codebase_md": {"status": "complete"}
}
```

Phase status values: `pending`, `complete`, `failed`. `progress.json` is preserved after completion to support resume on future re-runs and to record `meta.repo_path` for Phase 3.

**Freshness model**

Each section of `CODEBASE.md` carries a `<!-- last-updated: date, commit: hash -->` marker. When a plan involves changing something covered by the index, updating the relevant section is a step in that plan. If `git rev-list --count <staleness-commit>..HEAD` returns more than 30 commits, the section is stale. Full re-init is only needed if the repo structure changes fundamentally. Section-level update triggers:

| Section | Update trigger |
|---|---|
| Entry Points & Structure | Major refactors only |
| API Contracts | When route files change |
| Data Models | When schema or type definitions change |
| Utility Functions | When utils/helpers/common change |
| Config & Environment | When `serverless.yml`, `.env`, or infra configs change |

---

## Dependencies

**External:**

- `codebase-memory-mcp` binary — the SQLite graph engine; must be globally installed and registered in `~/.claude/settings.json` before `/infra-init` is invoked. The skill does not install it; it only verifies its presence via ToolSearch before proceeding.
- Python >= 3.11 — required by the three Phase 1/2.5 scripts (`detect_structure.py`, `env_var_scan.py`, `serverless_enrich.py`). The skill uses a resolution loop that executes each candidate interpreter to verify its version, rejecting stubs like the Windows-Store `python3` that exit non-zero.
- tree-sitter (Python package) — used internally by `env_var_scan.py` for AST-based env var extraction.

**Internal:**

- `rules/filesystem/efficiency.md` — the authoritative rule that makes graph tools the navigation default; referenced by any skill or agent doing code navigation
- `rules/filesystem/path-portability.md` — governs the `git rev-parse --show-toplevel` requirement for cross-platform path correctness
- `skills/infra-init/` agents + scripts — the Phase 1/2.5 scripts and the Phase 3 graph-builder agent prompt (spawned-only; not a persistent registered agent)

**Downstream consumers:**

- The `researcher` agent — queries the global MCP for codebase lookups, keeping search out of the main context window
- The `integration-engineer` agent — maps cross-repo endpoints using the graph
- Any planning session — reads `CODEBASE.md` at session start and loads graph tools via ToolSearch for symbol-level navigation

---

## Decisions

_(No accepted ADRs yet.)_

---

## Known Issues & Gotchas

- **`pwd -P` breaks on Windows.** On Windows git-bash, `pwd -P` returns an MSYS path (`/c/Users/...`) that the native `codebase-memory-mcp` binary cannot resolve. The error message is generic ("Pipeline failed. Check repo_path exists") and never names the path format as the cause. Always source the repo path with `git rev-parse --show-toplevel`, which returns `C:/Users/...` on Windows and the correct native path on macOS/Linux. This applies wherever a path is passed to a native binary or MCP server.

- **`index_status` takes `project`, not `repo_path`.** The `project` key must be captured from `index_repository`'s response and passed to `index_status(project=<PROJECT>)`. Calling `index_status(repo_path=...)` errors because the tool has no `repo_path` parameter. If the key is lost, call `list_projects()` to recover it.

- **Project name is non-obvious and must not be constructed client-side.** The `codebase-memory-mcp` project key is derived from the repo path by converting slashes to hyphens, but internal underscores in path components are preserved. The resulting key is unintuitive. Always read it from `list_projects()`. The canonical value is recorded in the project's CLAUDE.md under `## Codebase Knowledge Graph`.

- **Vendored SDK trees inflate the graph on firmware and embedded repos.** `codebase-memory-mcp` respects `.gitignore` — directories listed there are excluded during indexing. For repos with large vendored trees that are intentionally committed to version control, passing a subpath (e.g., `src/`) as `repo_path` scopes the graph to application code without modifying `.gitignore`.

- **codebase-memory-mcp must be pre-installed; the skill cannot install it.** If `ToolSearch` does not surface `index_repository` at Phase 2, `/infra-init` stops and reports the missing dependency to the user. There is no fallback.

- **Python interpreter resolution rejects Windows-Store stubs.** The resolution loop executes each candidate (`python3.11`–`python3.14`, `python3`, `python`, `py -3`) and checks the version string. The Windows-Store `python3` stub prints "Python was not found" and exits non-zero — it is rejected rather than silently selected. If no interpreter >= 3.11 is found, the skill exits with an explicit error.

- **Phase 3 depends on `meta.repo_path` being written in Phase 2.** The graph-builder agent reads `meta.repo_path` from `progress.json` to scope all MCP queries. If Phase 2 completes but fails to write the path, Phase 3 will query against the wrong scope or fail to query at all. Verify `meta.repo_path` is populated before spawning the agent.

- **`enrichments.json` is not queryable through the MCP.** Env var and serverless trigger data lives in `.claude-init/enrichments.json` and must be read directly as a file. There is no `search_graph` node type for env vars or triggers. For repos without Python/TS source or without `serverless.yml`, the file is an empty stub — this is expected and not an error.

- **`.claude-init/` is gitignored.** The entire `.claude-init/` directory is gitignored (appended by `/infra-init` post-completion). `progress.json` is inside it, so it is also gitignored. Re-running `/infra-init` in a fresh clone after `.claude-init/` has been removed restarts from Phase 1.

---

## Observability

The graph system surfaces its own health through several inspection points:

**`index_status(project=<PROJECT>)`** — the live readiness signal. Returns the current indexing status for the project. Call this to verify the graph is indexed before issuing navigation queries. Status values include `pending`, `complete`, and `failed`. During `/infra-init` Phase 2, this is polled up to 20 times at 30-second intervals; outside of init, a single call confirms readiness.

**`.claude-init/CODEBASE.md` freshness markers** — each section carries `<!-- last-updated: date, commit: hash -->`. To check staleness, run `git rev-list --count <staleness-commit>..HEAD`. A count above 30 indicates the section is stale and should be updated as part of the next plan that touches the relevant code. If `CODEBASE.md` is absent entirely, `/infra-init` must be re-run before planning begins.

**`.claude-init/enrichments.json`** — inspect directly to verify env var extraction and serverless trigger annotation completed correctly. An empty `{"env_vars": [], "entry_points": []}` is valid for repos without Python/TS source or serverless configuration; a missing file or malformed JSON indicates Phase 2.5 failed.

**`.claude-init/progress.json`** — the phase manifest. Read this to determine the state of a partial or interrupted init run. Each phase's `status` field is `pending`, `complete`, or `failed`. The `meta.repo_path` field confirms which absolute path the graph is indexed against.

**`list_projects()`** — lists all projects indexed in the global MCP. Use this to confirm the repo appears in the registry and to recover the canonical project name if it was not recorded in CLAUDE.md.

---

## Glossary

**codebase-memory-mcp** — the globally-installed MCP server that manages the SQLite graph database. One binary, one data store, multiple indexed repos. Registered in `~/.claude/settings.json` with `defer_loading: true` so its tools incur no context cost in sessions that do not need navigation.

**enrichments.json** — supplemental file capturing information the MCP cannot extract: environment variable reads (with file:line attribution) and AWS serverless trigger mappings (handler → trigger source → env vars). Written by Phase 2.5 scripts; read directly, never via MCP tools.

**CODEBASE.md** — the human/Claude-readable session-entry summary for a repo. Five-category index: Entry Points, API Contracts, Data Models, Utility Functions, Config & Environment. Intentionally short — deeper symbol navigation goes through the graph tools.

**graph-builder agent** — a Sonnet sub-agent spawned only by `/infra-init` Phase 3. Queries the graph, annotates from `enrichments.json`, and writes `CODEBASE.md`. Not a persistent registered agent; spawned-only.

**infra-init** — the `/infra-init` skill. A thin orchestrator that runs the four-phase graph generation pipeline (Phase 1: structure detection; Phase 2: MCP indexing; Phase 2.5: supplemental enrichment; Phase 3: CODEBASE.md synthesis). Run once per repo onboarding, then re-run only when the repo structure changes significantly or staleness thresholds are exceeded.

**progress.json** — the phase manifest written to `.claude-init/` during `/infra-init`. Tracks `status` (`pending`/`complete`/`failed`) for each phase and stores `meta.repo_path` for cross-phase use. Enables resume on interrupted runs.

**project name** — the canonical key assigned by `codebase-memory-mcp` to each indexed repo. Path-derived (slashes to hyphens, underscores preserved) but non-obvious. Must be read from `list_projects()` output. Required as the `project` parameter for all five graph query tools.

**structure.json** — Phase 1 output. Repo metadata including detected repo type (`aws-lambda`, `node-http`, `python-http`, `flutter`, `firmware`, `react-native`). Read by the graph-builder agent in Phase 3 for category naming in CODEBASE.md.

**Cypher traversal** — the query language used by `query_graph`. A subset of openCypher used to express graph relationship queries. Common patterns: `MATCH (x)-[:CALLS]->(f:Function {name:"X"}) RETURN x` (callers), `MATCH (f {file:"X"})-[:IMPORTS]->(d) RETURN d` (imports).

**staleness marker** — the `<!-- last-updated: date, commit: hash -->` HTML comment embedded in each CODEBASE.md section. The commit hash is the reference point for the `git rev-list --count` staleness check (threshold: 30 commits).
