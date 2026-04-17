# TESTING — graphify-wrap integration

Step-by-step checklist for validating the `/infra-init` graphify-wrap refactor against a target repo. First run is manual phase-by-phase so bugs surface clearly. Once green, subsequent runs can use `/infra-init` directly.

Companion doc: [PLAN.md](PLAN.md) (see its Verification section — the 13 checks below map to it).

---

## Confirmed facts from the 2026-04-15 install attempt

These differ from the original plan — we validated against `graphifyy 0.4.15`:

| Plan said | Reality | Action |
|---|---|---|
| `pip install graphify` | PyPI package is **`graphifyy`** (double-y). `graphify` is squatted — upstream note says it's a temporary rename. | `setup.sh` installs `graphifyy`. |
| `graphify build .` / `graphify build . --update` | No `build` command exists. `graphify update <path>` handles both cold and incremental — creates `graphify-out/graph.json` on first run too. | SKILL.md + TESTING use `$PY -m graphify update .` |
| `graphify --version` | No `--version` flag. | Log version via `pip show graphifyy`. |
| CLI on PATH | `--user` installs land in `%APPDATA%\Python\Python314\Scripts\graphify.exe` — not on Windows PATH by default. | **Always invoke as `$PY -m graphify <cmd>`** — module invocation avoids PATH. |
| graphifyy bundles Python + TS tree-sitter | Bundles many grammars but **not** those two. | Separate `tree-sitter-python` / `tree-sitter-typescript` pip installs remain required. |

---

## One-time setup (per machine)

Skip if already done on this machine.

### Step 0.1 — Run setup.sh

```bash
cd c:/Users/jason/repos/claude-workflow-improvements
./scripts/setup.sh
```

Watch for:
- `✓ All prerequisites found` — confirms `python3.11` or `python3.14` resolved into `$INFRA_INIT_PY`.
- `✓ installed: graphifyy, tree-sitter-python, tree-sitter-typescript, pyyaml, jsonschema` — or `↷ already installed: ...` on re-runs.

If `python3.11` / `python3.14` isn't on PATH, setup.sh fails loud with install hint. Install one and re-run.

### Step 0.2 — Sanity-check the install

```bash
python3.14 -c "import tree_sitter_python, tree_sitter_typescript, yaml, jsonschema; print('deps ok')"
python3.14 -m graphify --help | head -3
python3.14 -m pip show graphifyy | grep ^Version
```

All three should produce non-error output. If `graphify --help` fails, something is wrong with the graphifyy install — report the stderr.

---

## Per-test setup (per target repo)

Replace `<TARGET_REPO>` throughout with the absolute path you're testing against. The plan's baseline is `c:/Users/jason/repos/notification backend` (the one with the existing graph for apples-to-apples comparison). Any repo works for a cold test.

### Step 0.3 — Back up the existing graph (baseline-only)

Only do this if the target already has `.claude-init/` from a prior run. This backup is the reference for the Step 4.x parity checks.

```bash
cd "<TARGET_REPO>"
[ -d .claude-init ] && cp -r .claude-init .claude-init.backup
```

If no prior graph exists, skip and treat this as a cold-start regression test (Step 4.13).

---

## Phase 1 — Structure Detection

### Step 1.1 — Run the detector

```bash
cd "<TARGET_REPO>"
python3.14 ~/.claude/skills/infra-init/scripts/detect_structure.py \
    --root . \
    --out .claude-init/structure.json

cat .claude-init/structure.json
```

**Expected:** `{"repo_type": "...", "key_dirs": [...]}`. `repo_type` should match the target — e.g. `aws-lambda-serverless` for a `serverless.yml` repo, `python-generic` for a plain Python project, `node-http-backend` for Express/Fastify, etc.

**If it fails:** paste the stderr. Usually missing interpreter or permission issue.

---

## Phase 2 — Graphify Extraction

### Step 2.1 — Run graphify

```bash
# `update` handles both cold and incremental — there is no `build` command
python3.14 -m graphify update .
```

**Expected:** a short log line like `[graphify watch] Rebuilt: N nodes, M edges, K communities` and `Code graph updated.`

### Step 2.2 — Confirm outputs exist

```bash
ls graphify-out/
```

Expect: `graph.json`, `graph.html`, `GRAPH_REPORT.md`, `cache/`.

### Step 2.3 — Inspect real output shape

The translator was written against inferred shape. Confirm reality before proceeding.

```bash
python3.14 -c "
import json
d = json.load(open('graphify-out/graph.json'))
print('top-level keys:', list(d.keys()))
print('nodes:', len(d.get('nodes', [])))
print('links:', len(d.get('links', [])))
if d.get('nodes'):
    print('sample node:', d['nodes'][0])
if d.get('links'):
    print('sample link:', d['links'][0])
"
```

**Translator expects:**
- Top-level `nodes` and `links` arrays (NetworkX `node_link_data`).
- Node fields: `id`, `label`, `source_file`, `source_location` (e.g. `"L42"`).
- Edge fields: `source`, `target`, and a relation-type key named `type`, `relation`, `edge_type`, or `key`.

**If the real shape differs:** stop. Translator will raise `ValueError("graphify output shape changed — translator update required.")` on Step 3.1. Paste the "top-level keys" and "sample node"/"sample link" output here and I'll patch the translator.

---

## Phase 2.5 — Translate + Enrich

### Step 3.1 — Run the orchestrator

```bash
python3.14 ~/.claude/skills/infra-init/scripts/run_phase25.py \
    --root . \
    --graphify graphify-out/graph.json \
    --structure .claude-init/structure.json \
    --schema c:/Users/jason/repos/claude-workflow-improvements/output/templates/codebase-graph.schema.json \
    --out .claude-init/codebase-graph.json
```

**Expected final log line:** `Phase 2.5 complete: N nodes, M edges, K env_vars` with no `ValueError` and no `"graphify output shape changed"` message.

**Warnings during the run are OK.** Examples:
- `Skipping node with empty label (gid=...)` — graphify emitted an unnamed node, we skip it.
- `Dropped N edge(s) of unknown graphify type 'X'` — a graphify edge type we don't map; informational.
- `Duplicate node id after remap — skipping` — two graphify nodes collapsed to the same `source_file::label`; informational.

**If schema validation fails:** `jsonschema.ValidationError` will be raised. Paste the full traceback.

---

## Phase 3 — Validation (13 checks — maps to PLAN.md Verification section)

These are the acceptance checks. Every `BLOCKING` failure stops the test.

### Step 4.1 — Graphify version logged (smoke test 1)

```bash
python3.14 -m pip show graphifyy | awk -F': ' '/^Version/ {print $2}'
```

Non-empty version string → ✅. (We don't actually have to write this to `progress.json` during the manual test — that's the orchestrator's job. This just confirms graphifyy is installed.)

### Step 4.2 — Graphify output valid (smoke test 2)

```bash
python3.14 -c "
import json
d = json.load(open('graphify-out/graph.json'))
assert isinstance(d.get('nodes'), list) and d['nodes'], 'nodes missing/empty'
assert isinstance(d.get('links'), list) and d['links'], 'links missing/empty'
print('graphify output: %d nodes, %d links — ok' % (len(d['nodes']), len(d['links'])))
"
```

Must print `— ok` without AssertionError.

### Step 4.3 — Schema validation passed (smoke test 3)

If Step 3.1 printed `INFO run_phase25: Graph passed schema validation`, this is ✅. If it printed `jsonschema not installed — skipping schema validation`, re-run setup.sh — `jsonschema` should have been installed.

### Step 4.4 — Node count ≥ 120 (structural parity)

Baseline `notification backend` has 120 nodes. Graphify should match or exceed.

```bash
python3.14 -c "
import json, collections
g = json.load(open('.claude-init/codebase-graph.json'))
by_type = collections.Counter(n['type'] for n in g['nodes'])
print('total nodes:', len(g['nodes']))
print('by type:', dict(by_type))
if len(g['nodes']) < 120:
    print('⚠ node count below baseline 120 — translator may be dropping nodes')
"
```

### Step 4.5 — All 8 env vars present (**BLOCKING** — notification-backend only)

```bash
python3.14 -c "
import json
g = json.load(open('.claude-init/codebase-graph.json'))
expected = {'COGNITO_CUSTOMERS_GROUP_NAME','COGNITO_SECRET_NAME','DEV_IOT_DATA_ENDPOINT',
            'LOG_LEVEL','PROD_IOT_DATA_ENDPOINT','PUSHER_PARAMETER_NAME','STAGE',
            'UNICRON_DYNAMODB_TABLE_NAME'}
actual = {n['name'] for n in g['nodes'] if n['type']=='env_var'}
missing = expected - actual
extra = actual - expected
print('env vars found:', sorted(actual))
print('MISSING (BLOCKING):', sorted(missing))
print('EXTRA (informational):', sorted(extra))
assert not missing, f'BLOCKING: missing env vars {missing}'
print('✓ all 8 baseline env vars present')
"
```

**If any are missing:** the env-var scanner is broken. Paste the output of this check plus the stderr from Step 3.1 (especially `env_var_scan: N reads, K unique vars, ...` log line).

For any other target repo, replace the `expected` set with whatever that repo's env vars are, or just inspect `sorted(actual)` and verify the list looks sane.

### Step 4.6 — All 6 `reads_env` edges present

```bash
python3.14 -c "
import json
old = json.load(open('.claude-init.backup/codebase-graph.json'))
new = json.load(open('.claude-init/codebase-graph.json'))
old_pairs = {(e['from'], e['to']) for e in old['edges'] if e['type']=='reads_env'}
new_pairs = {(e['from'], e['to']) for e in new['edges'] if e['type']=='reads_env'}
print('OLD reads_env pairs:', len(old_pairs))
print('NEW reads_env pairs:', len(new_pairs))
print('MISSING in new:', sorted(old_pairs - new_pairs))
print('EXTRA in new:', sorted(new_pairs - old_pairs))
"
```

Note: `from` node IDs may differ slightly (our translator's remap vs. old manual IDs). That's OK as long as the `to` env var and the caller's file path are semantically equivalent. Skip this step on non-backup targets.

### Step 4.7 — All 7 entry points with matching trigger strings

```bash
python3.14 -c "
import json
old = json.load(open('.claude-init.backup/codebase-graph.json'))
new = json.load(open('.claude-init/codebase-graph.json'))
old_eps = {(n['name'], n.get('trigger')) for n in old['nodes'] if n.get('is_entry_point')}
new_eps = {(n['name'], n.get('trigger')) for n in new['nodes'] if n.get('is_entry_point')}
print('OLD entry points:', sorted(old_eps))
print('NEW entry points:', sorted(new_eps))
print('MISSING in new:', sorted(old_eps - new_eps))
"
```

If handler-name resolution in `serverless_enrich.py` guessed wrong, some triggers will be missing. Known risk: TypeScript handlers (`.ts` instead of `.py`). Patchable.

### Step 4.8 — serverless.yml env defaults populated

```bash
python3.14 -c "
import json
g = json.load(open('.claude-init/codebase-graph.json'))
for name, entry in g['env_vars'].items():
    print(name, '→ defined_in=%r, default=%r' % (entry.get('defined_in'), entry.get('default')))
"
```

For notification-backend: every env var should show `defined_in: 'serverless.yml'` and a meaningful `default` value (or `null` if not set in serverless.yml).

### Step 4.9 — `imports` edges present (new capability)

```bash
python3.14 -c "
import json, collections
g = json.load(open('.claude-init/codebase-graph.json'))
by_type = collections.Counter(e['type'] for e in g['edges'])
print('edges by type:', dict(by_type))
assert by_type.get('imports', 0) > 0, 'BLOCKING: graphify should produce imports edges'
print('✓ imports edges present:', by_type['imports'])
"
```

Old graph had zero imports edges; graphify is the upgrade. Must be > 0.

### Step 4.10 — `inherits` dropped cleanly (translator drift log)

Check the stderr of Step 3.1 — look for either:
- `INFO graphify_translate: ...` messages only (no inherits-related errors), or
- `WARNING Dropped N edge(s) of unknown graphify type 'inherits'` — this is the wrong handling; `inherits` should be in `SKIP_EDGE_TYPES` and dropped silently.

If you see the warning, the translator's `SKIP_EDGE_TYPES` set needs patching. Report the warning.

### Step 4.11 — MCP server smoke test

```bash
# Copy MCP server into the target repo
mkdir -p .claude-init/mcp
cp c:/Users/jason/repos/claude-workflow-improvements/output/templates/codebase-mcp/server.py .claude-init/mcp/server.py
cp c:/Users/jason/repos/claude-workflow-improvements/output/templates/codebase-mcp/requirements.txt .claude-init/mcp/requirements.txt

# Confirm the server starts without error
python3.14 .claude-init/mcp/server.py .claude-init/codebase-graph.json &
SERVER_PID=$!
sleep 2
# If the process is still alive, it's running on stdio. Kill it.
kill $SERVER_PID 2>/dev/null
echo "MCP server smoke test: if no traceback above, ✓"
```

Full MCP tool invocations (`codebase_search_symbol`, `codebase_find_callers`, `codebase_get_env_var`) happen through Claude Code in Step 6.1 — at this step we just confirm the server loads the graph and starts.

### Step 4.12 — Incremental cache check

```bash
# Find any source file in the target repo, touch it, re-run graphify
touch src/**/*.py 2>/dev/null || touch README.md
python3.14 -m graphify update . 2>&1 | tail -5
```

Expected: a short "Rebuilt: N nodes" line, not a full re-extraction. If graphify re-indexes everything, the SHA256 cache isn't working — report the full output.

### Step 4.13 — Cold-start regression on a clean repo

Run the pipeline on `claude-workflow-improvements` itself (no graph yet). This tests cold-start in an unrelated repo and confirms the scripts don't hardcode anything target-specific.

```bash
cd c:/Users/jason/repos/claude-workflow-improvements

python3.14 ~/.claude/skills/infra-init/scripts/detect_structure.py --root . --out .claude-init/structure.json
python3.14 -m graphify update .
python3.14 ~/.claude/skills/infra-init/scripts/run_phase25.py \
    --root . \
    --graphify graphify-out/graph.json \
    --structure .claude-init/structure.json \
    --schema output/templates/codebase-graph.schema.json \
    --out .claude-init/codebase-graph.json

# Quick sanity
python3.14 -c "
import json, collections
g = json.load(open('.claude-init/codebase-graph.json'))
print('nodes:', len(g['nodes']), 'edges:', len(g['edges']))
print('types:', dict(collections.Counter(n['type'] for n in g['nodes'])))
"
```

Expect: non-empty graph, `function` and `file` node types present (env_var likely empty since this repo doesn't heavily use env vars), no schema validation errors.

**After this test, clean up:** `rm -rf .claude-init graphify-out` in `claude-workflow-improvements` — we don't commit its own graph.

---

## Phase 4 — Run `/infra-init` via Claude Code

Only proceed once Steps 4.1–4.13 pass.

### Step 5.1 — Resume via `/infra-init`

Open Claude Code in the target repo and invoke `/infra-init`. It will detect the existing `.claude-init/progress.json` from the manual run. Since Phase 1–2.5 wrote files but never updated `progress.json`, the skill should still consider those phases incomplete and re-run them. That's fine — graphify's SHA256 cache means Phase 2 is near-free on the second run.

Let it run through Phase 3 (CODEBASE.md sub-agent) and Phase 4 (MCP setup).

### Step 5.2 — Review outputs

```bash
cat .claude-init/CODEBASE.md
cat .claude/settings.json | python3.14 -m json.tool
cat .gitignore | grep -E '\.claude-init|graphify-out'
```

Expect:
- `CODEBASE.md` has entries under Entry Points, Domain Handlers, External Services, Use Cases, Repositories (for AWS repo).
- `.claude/settings.json` has an `mcpServers.codebase` entry with `"command": "python3.14"` (or `python3.11`), not `python3`.
- `.gitignore` contains both `.claude-init/` and `graphify-out/`.

### Step 5.3 — End-to-end MCP query

In Claude Code, ask something like: "Use `codebase_search_symbol` to find `NotificationService`." The tool should surface via Tool Search and return a result pointing at the correct file + line from the graph.

---

## Reporting failures

For any step that fails, send:
1. **Step number** (e.g. "Step 4.5").
2. **Exact command** you ran.
3. **Full stderr/traceback**.
4. **Relevant snippet** of the output JSON for structural issues — e.g. for Step 4.5, paste the entire `sorted(actual)` output.

Small, bounded reports. Don't debug in place — the scripts are drift-defensive and will log helpful warnings.

---

## Cleanup (if you want to re-test from scratch)

```bash
cd "<TARGET_REPO>"
rm -rf .claude-init graphify-out
# keep .claude-init.backup/ for future baseline comparisons
```

Re-run from Step 0.3.
