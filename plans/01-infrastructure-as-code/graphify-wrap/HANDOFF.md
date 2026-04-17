# Handoff — graphify-wrap Testing Session

## What we're doing

Working through `plans/01-infrastructure-as-code/graphify-wrap/TESTING.md` — validating the `/infra-init` graphify-wrap refactor against the `notification backend` repo at `c:/Users/jason/repos/notification backend`.

## Current status

**Phase 3 (manual script validation) — COMPLETE.** All 13 checks pass. Details below.

**Phase 4 (end-to-end `/infra-init` skill run) — READY TO START.** Must be run in a Claude Code session opened in the notification backend repo.

---

## Phase 4 Instructions (for the notification backend session)

### Context

The `/infra-init` skill has been validated script-by-script against this repo. Phase 4 tests the skill itself — the orchestrator that chains structure detection, graphify, translate+enrich, CODEBASE.md generation, and MCP setup.

### Pre-existing state in this repo

These artifacts already exist from manual testing:

| Path | Contents | Created by |
|------|----------|------------|
| `.claude-init/structure.json` | `{"repo_type": "aws-lambda-serverless", ...}` | Manual Step 1.1 |
| `.claude-init/codebase-graph.json` | 590 nodes, 813 edges, 10 env_vars | Manual Step 3.1 |
| `.claude-init/CODEBASE.md` | Old manually-written summary | Prior session (pre-refactor) |
| `.claude-init/mcp/server.py` + `requirements.txt` | MCP server files | Manual Step 4.11 |
| `graphify-out/graph.json` | 504 nodes, 1201 edges | Manual Step 2.1 |
| `graphify-out/cache/` | SHA256 extraction cache | graphify |
| `.claude-init.backup/` | Baseline graph for comparison | Manual Step 0.3 |

There is **no** `.claude-init/progress.json` — the skill should treat this as a fresh run and create one.

### Step 5.1 — Run `/infra-init`

Invoke `/infra-init`. Expected behavior:

1. No `progress.json` exists → skill starts from Phase 1.
2. Phase 1 (structure detection) — re-runs `detect_structure.py`. Should produce same result: `aws-lambda-serverless`.
3. Phase 2 (graphify) — re-runs `python3.14 -m graphify update .`. graphify's SHA256 cache means this is fast. Should produce same counts: 504 nodes, 1201 edges.
4. Phase 2.5 (translate+enrich) — re-runs `run_phase25.py`. Should produce ~590 nodes, ~813 edges, ~10 env_vars. Schema validation should pass.
5. Phase 3 (CODEBASE.md) — spawns graph-builder agent (Sonnet). Should overwrite the old CODEBASE.md with a new structured 5-category index.
6. Phase 4 (MCP setup) — copies server files (already exist), registers MCP server in `.claude/settings.json`, updates `.gitignore`.

**Key facts the skill needs:**
- Python interpreter: `python3.14`
- graphify package: `graphifyy` (double-y), invoked as `python3.14 -m graphify`
- No `graphify build` command — use `graphify update .`
- Schema path: `~/.claude/skills/infra-init/../../templates/codebase-graph.schema.json` (resolves via symlinks to `claude-workflow-improvements/output/templates/`)
- `fastmcp` is installed (required for MCP server)
- `push_notification_consumer.py` doesn't exist on disk — expect a warning, not an error

### Step 5.2 — Review outputs

After `/infra-init` completes, verify:

```bash
# 1. CODEBASE.md has structured categories (Entry Points, Domain Handlers, External Services, Use Cases, Repositories)
cat .claude-init/CODEBASE.md

# 2. MCP server registered in settings.json
cat .claude/settings.json | python3.14 -m json.tool
# Expect: mcpServers.codebase entry with "command": "python3.14"

# 3. .gitignore has both entries
grep -E '\.claude-init|graphify-out' .gitignore

# 4. progress.json shows all phases complete
cat .claude-init/progress.json | python3.14 -m json.tool
```

### Step 5.3 — MCP query smoke test

Ask Claude Code to use `codebase_search_symbol` to find `NotificationService`. The tool should surface via Tool Search and return a result pointing at a file + line from the graph.

If Tool Search doesn't find the tool, check that `.claude/settings.json` has the `mcpServers.codebase` entry and restart Claude Code.

---

## Phase 3 Results (completed — reference only)

| Step | Status | Notes |
|------|--------|-------|
| 0.1 setup.sh | ✅ | |
| 0.2 sanity check | ✅ | |
| 0.3 backup | ✅ | |
| 1.1 structure detect | ✅ | aws-lambda-serverless |
| 2.1 graphify run | ✅ | 504 nodes, 1201 edges |
| 2.2 outputs exist | ✅ | graph.html missing (graphify 0.4.15 doesn't produce it) |
| 2.3 shape inspect | ✅ | matches translator expectations |
| 3.1 orchestrator | ✅ | 590 nodes, 813 edges, 10 env_vars |
| 4.1 version logged | ✅ | graphifyy 0.4.15 |
| 4.2 graphify output valid | ✅ | |
| 4.3 schema validation | ✅ | "Graph passed schema validation" |
| 4.4 node count ≥ 120 | ✅ | 590 nodes (function=362, class=39, method=99, file=73, external=5, env_var=10, route=2) |
| 4.5 env vars (BLOCKING) | ✅ | All 8 baseline + 2 extras (FCM_CREDENTIALS, FCM_PROJECT_ID) |
| 4.6 reads_env edges | ✅ | 39 edges (was 6 in baseline). 2 "missing" are method-resolution granularity diffs |
| 4.7 entry points | ✅* | 7/9 — 2 missing explained below |
| 4.8 serverless env defaults | ✅ | 8/10 have defined_in=serverless.yml with defaults; 2 FCM vars code-only |
| 4.9 imports edges | ✅ | 4 imports edges (> 0) |
| 4.10 inherits dropped | ✅ | Silent skip via SKIP_EDGE_TYPES: inherits=39, method=99, uses=241 |
| 4.11 MCP server smoke | ✅ | Server loaded 590 nodes, no traceback |
| 4.12 incremental cache | ✅ | Graph consistent on re-run |
| 4.13 cold-start regression | ✅ | claude-workflow-improvements: 100 nodes, schema valid, cleaned up |

### Step 4.7 — 2 missing entry points explained

1. `('handler', trigger=None)` — old graph manually marked eventless serverless functions as entry points with null triggers. The automated pipeline only marks handlers as entry points when serverless.yml declares events. Design difference, not a regression.

2. `('handler', 'http:GET:/pusher/token (websocket auth)')` — `get_pusher_user_token` has no events block in serverless.yml. The old graph had a manually annotated trigger. The automated pipeline can't derive triggers for eventless functions.

## Bugs fixed prior to this testing round (4 fixes across 3 files)

1. **env_var_scan.py** — tree-sitter 0.25 moved `Query.matches()` to `QueryCursor`. Fixed: import `QueryCursor`, added `_run_matches()` helper. Also added `.claude-init.backup` to `SKIP_DIRS`.

2. **serverless_enrich.py** — Four fixes:
   - Added `_construct_cfn_tag` multi-constructor on `_LineLoader` for CloudFormation intrinsic YAML tags
   - Added `_ensure_env_var()` so serverless.yml-declared env vars that aren't read from code still get nodes
   - Added `_synthesize_handler_node()` so Lambda handlers in files graphify missed still get entry-point nodes
   - Normalized path comparison in `_find_handler_node()` — backslash vs forward-slash on Windows

3. **graphify_translate.py** — Three fixes:
   - Synthesize `external::` nodes for graphify nodes with empty `source_file`
   - Added observability logging: skipped edge type counts, unresolved edge drop counts
   - Normalized `imports` edge direction (graphify is inconsistent)

4. **codebase-graph.schema.json** — Added `"external"` to the node type enum.
