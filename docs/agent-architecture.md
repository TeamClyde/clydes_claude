# Agent Architecture

---

## Purpose

This plan is the catalog and design spec for every subagent in the system. Other plans say "invoke an agent to do X" — this plan defines what that agent actually is: its purpose, inputs, outputs, model selection, and constraints.

When a plan references a subagent, it is deferring the agent design here. This plan is the authoritative source for what each agent does.

---

## Agent Registry

| Agent | File | Responsibility |
|-------|------|----------------|
| `architect` | `~/.claude/agents/architect.md` | Plan review — quality, soundness, self-containment |
| `researcher` | `~/.claude/agents/researcher.md` | Codebase lookups via local code MCP/graph + live infrastructure value lookups via AWS MCP — keeps lookup work out of the main context window |
| `infra-init-structure` | (spawned by `/infra-init`, no persistent file) | Repo type detection and batch assignment during repo init |
| `infra-init-batch-indexer` | (spawned by `/infra-init`, no persistent file) | Parallel source file extraction during repo init |
| `infra-init-graph-builder` | (spawned by `/infra-init`, no persistent file) | Reduces batch output into codebase-graph.json and CODEBASE.md |
| `integration-engineer` | `~/.claude/agents/integration-engineer.md` | Cross-repo contract mapping using local codebase MCPs from each repo |
| `test-strategy` | `~/.claude/agents/test-strategy.md` | Per-plan validation criteria |
| `test-builder` | `~/.claude/agents/test-builder.md` | Write test code from test strategy output, in parallel with implementation |
| `test-runner` | `~/.claude/agents/test-runner.md` | Post-implementation test executor — runs the test suite, classifies results (PASS / BUILD FAILURE / TEST FAILURE / ENVIRONMENT FAILURE), writes to `.claude/test-results.md`, and mandates `systematic-debugging` via REQUIRED NEXT STEP block on any failure |
| `jira-workflow-manager` | `~/.claude/agents/jira-workflow-manager.md` | All Jira operations |

**Note:** Skills (`git-manager`, `infra-init`, `e2e-init`) are not agents — they are prompt templates that run in the main context. They are defined in their respective plans.

---

## Agent Designs

---

### 1. `architect` — Plan Reviewer

**Purpose:** Independent review of a plan doc before execution begins. The architect operates with **informed isolation**: it has no access to the conversation history that produced the plan, but it does read CLAUDE.md and related plan docs cold. This is not a limitation — it is the design. Isolation counters Claude's default sycophancy (the tendency to agree with positions stated earlier in a conversation). Reading plan docs cold, without the conversational context that produced them, is what makes the review meaningful — the architect can catch contradictions with prior design decisions precisely because it is reading them fresh, not carrying forward the assumptions that accumulated during drafting.

The architect has two jobs, in order of importance:

1. **Quality check** — will this plan actually work? Is the design sound? Are there contradictions, logical gaps, or foreseeable failures that would cause execution to break down?
2. **Self-containment check** — can this plan be handed to a model in an empty context window with just "execute this plan" and be fully executed? No assumptions, no implied context, no references to prior conversations or external knowledge.

The architect evaluates whether the design makes sense and can suggest improvements — but it does not design the plan from scratch. It reviews what is there.

**Model:** Sonnet

**What it does NOT do:**
- Code review — out of scope entirely
- Debug or root cause analysis — out of scope
- Care about which agents are used — if a plan says "use agent X to do Y," the architect assumes that's valid and moves on

**Review criteria:**
1. **Design soundness** — will this plan actually work? Are the design decisions coherent? Does the approach make sense given the stated goal?
2. **Logic completeness** — are all steps present? Does the sequence make sense? Are there gaps where execution would stall?
3. **Contradictions** — internal consistency within the plan, and accuracy of cross-references to other plans (verified via `researcher`)
4. **Foreseeable issues** — things not covered by the plan that will surface during execution
5. **Self-containment** — no assumptions or implied context; everything needed to execute is written down

**TBD handling:**
Not every TBD is a blocking issue. The architect distinguishes between:
- **In-scope TBD** — something the plan needs to resolve to be executable. Flag as a question for the user. Multiple of these means the plan probably isn't ready.
- **Out-of-scope TBD** — a dependency the plan acknowledges but doesn't own. Note it, don't block on it.

Neither is automatically BLOCKING. The architect surfaces both and lets the user decide.

**Output format:**
- `BLOCKING` — must be resolved before execution begins. Reserved for design flaws, logical gaps, contradictions, and anything that will cause the plan to fail.
- `MINOR` — worth noting but won't block. Suggestions, edge cases, potential future problems.
- `LOOKS GOOD` — specific things that are solid and should be preserved when revising. Without this, the reviewer only knows what to fix, not what to keep.
- `VERDICT` — `APPROVED` or `NEEDS REVISION — address B1, B2 before proceeding`

**Researcher integration:**
The architect cannot search files on its own. When it needs to verify a cross-reference ("this plan says Plan 02 handles ticket format — is that accurate?"), it invokes the `researcher` with a specific question and verifies the claim against what comes back.

**Inputs:**
- `plan_doc_path` — path to the plan doc to review (required)
- `instructions` — what to review and any specific context; the plan doc itself provides all architectural context; use instructions to specify review focus (e.g. "review for self-containment" or "check cross-plan dependencies")

Only `plan` mode is in scope. `evaluate_task` and `debug` modes in the existing `~/.claude/agents/architect.md` will be removed during the rewrite.

**When invoked:**
Two scenarios, both before a significant state transition:

1. **End of planning** — before execution begins:
   - **Manual** — user explicitly calls it when planning is complete
   - **Automatic** — Claude invokes it before calling `ExitPlanMode` (via `plan-gate` after `writing-plans`)

2. **Before task completion** — before transitioning a task from In Progress to Testing or Done:
   - Ensures implementation matches the original plan intent and has no foreseeable issues that would fail in testing

**Iteration and question handling:**
Max 3 review rounds total. Each re-review is a completely fresh pass — no memory of prior rounds.

Two types of BLOCKING items require different handling:

- **Questions the architect raises** — things the plan doesn't answer that require user judgment (not researchable facts). Main context surfaces these to the user verbatim and waits. It does **not** make assumptions to resolve them. After the user answers, main context updates the plan and re-invokes the architect.
- **Design flaws** — contradictions, logical gaps, or missing steps that the plan itself should address. Main context resolves these from available context and re-submits without involving the user.

If BLOCKING issues remain after 3 rounds, escalate to the user — do not attempt a fourth round.

**Current state:** Exists at `~/.claude/agents/architect.md` with three modes: `evaluate_task`, `plan`, `debug`. Only `plan` mode is in scope going forward. `evaluate_task` and `debug` will be removed.

---

### 2. `researcher` — Codebase and Infrastructure Lookup Agent

**Purpose:** Answer lookup questions and light summarization on behalf of the main context or the `architect` without consuming main context window budget. The researcher's primary tool is the **local codebase MCP** (generated by `/infra-init`) for codebase questions, and the **AWS MCP** for live infrastructure values. Both are valid researcher use cases.

**Why researcher over direct Grep:** Grep returns raw file content — more than needed, and Claude often doesn't know exactly what to look for, leading to multiple grep passes. The researcher + local MCP returns the minimum necessary context in a single structured query. Keeping lookup work in the researcher preserves main context for reasoning and implementation.

**Model:** Haiku

**When to use vs. not use:**

| Scenario | Use researcher? | Tool |
|----------|----------------|------|
| "Where does `get_cognito_user` live?" | Yes | codebase-memory-mcp (`search_graph`) |
| "Which files import `NotificationService`?" | Yes | codebase-memory-mcp (`query_graph` with CALLS/IMPORTS) |
| "What env vars does the notification service read?" | Yes | Read `.claude-init/enrichments.json` |
| "What does the notification service do?" (light summarization) | Yes — CODEBASE.md or 10–20 line targeted read; NOT a full codebase scan | Read CODEBASE.md or targeted function read |
| "What is the ARN of the `SendNotificationQueue`?" | Yes | AWS MCP |
| "What is the current value of `/backend/notification/pusher` in SSM?" | Yes | AWS MCP |
| "What DynamoDB tables exist in this account?" | Yes | AWS MCP |
| "What does this function actually do?" (needs multi-file comprehension) | No — read the file in main context | — |
| "Where do I need to change this code?" (needs judgment) | No — reason in main context | — |
| "Explain how the auth system works" (requires reading many files) | No — out of scope, escalate | — |

**Sources:**

The researcher uses whatever MCP is appropriate for the question — local codebase MCP, AWS MCP, Bitbucket, or any other available MCP that covers the domain being queried. It is not limited to a fixed list.

The researcher does not guess or substitute a value when a structured MCP lookup is available.

**Inputs:**
- `question` — a specific natural language question to look up
- `intent` — why the caller needs this answer (optional but recommended). Calibrates how much supplemental context to include so the caller doesn't need to redo the lookup.
- `scope` — optional hint (e.g. "check the prod AWS account", "backend repo")

**Tool discipline:**
Code graph first — it answers most questions in one call. If more detail is needed, read 10–20 lines of the specific function or read CODEBASE.md. Stop as soon as the question can be answered. Never broad-scan multiple files.

**Self-check before returning:**
Before finalizing the answer, the researcher asks: *Will the caller have to run another lookup to get what they need?* A "where does X live?" answered with only a filename is incomplete — the caller would still need to grep for the line. The answer must be as short as possible while being complete enough that no follow-up lookup is required.

**Output:**
A direct answer — an ARN, a parameter value, a resource name, a `file:line`, or a short factual summary — not a dump of raw API response. If the value cannot be found, say so explicitly. If `intent` was provided, include one or two sentences of supplemental context so the caller can act without a follow-up lookup.

**Callers:**
- Main context — live infrastructure value lookups during planning or execution
- `architect` — to verify an infrastructure cross-reference in a plan doc

**Parallel usage:**
When the main context has multiple independent MCP lookups to make simultaneously, it dispatches multiple researcher instances in parallel — one per question. This is the primary justification for the agent pattern: genuine parallelism of independent MCP queries.

**Chained questions:**
When one answer feeds into the next lookup, the main context handles the sequencing. Researchers do not chain themselves or spawn further lookups. Each instance answers exactly what it was asked.

**Out-of-scope escalation:**
When the question exceeds the scoped policy, the researcher stops and surfaces to the orchestrator rather than pushing through silently.
- **Pre-check** (before any tool call): `OUT_OF_SCOPE: [one sentence why] — no work performed.`
- **Mid-work** (scope discovered during execution): `OUT_OF_SCOPE: [one sentence why]. Partial findings: [summary of what was found so far].`

Partial findings are preserved so the main context can use what was retrieved even if the full question is out of scope.

**What it does NOT do:**
- Synthesize across multiple files or require broad codebase scanning
- Make recommendations
- Coordinate with other researcher instances

---

### 3. `infra-init-structure` — Repo Structure Agent

**Purpose:** Phase 1 of `/infra-init`. Reads the high-level shape of the repo — directory tree, package manifests, top-level config files, README — and produces the two artifacts the rest of `/infra-init` depends on: `structure.json` (repo metadata) and the initial `progress.json` (full file list with batch assignments). Runs once, sequentially, before any batch indexers are spawned.

**Model:** Haiku (no reasoning — discovery and classification only)

**What it reads:**
- Directory tree
- Package manifests (`package.json`, `requirements.txt`, `pubspec.yaml`, `serverless.yml`, etc.)
- Top-level config files
- README

**What it does NOT read:** Individual source files — that is the batch indexer's job.

**Repo type detection:**

| Signal | Repo type |
|--------|-----------|
| `serverless.yml` | AWS Lambda backend |
| `package.json` with express/fastify | Node HTTP server |
| `requirements.txt` with fastapi/flask | Python HTTP server |
| `pubspec.yaml` | Flutter mobile |
| `CMakeLists.txt` or `*.ino` | Firmware/embedded |
| `android/` + `ios/` | React Native |

**Outputs:**

`structure.json` — repo metadata:
```json
{
  "repo_type": "python-lambda",
  "key_dirs": ["src/", "tests/"],
  "source_files": ["src/services/notification.py", "src/utils/cognito.py", "..."]
}
```

`progress.json` — batch manifest with all source files assigned to batches:
```json
{
  "repo_type": "python-lambda",
  "total_files": 42,
  "batch_size": 20,
  "batches": {
    "0": {"status": "pending", "files": ["src/services/notification.py", "..."]},
    "1": {"status": "pending", "files": ["src/utils/cognito.py", "..."]}
  },
  "graph_builder": {"status": "pending"},
  "mcp_setup": {"status": "pending"}
}
```

**Batch sizing — token budget model:**
Rather than fixed file counts, the structure agent targets a total token budget per batch. File size is known at assignment time; estimated token count is ~250–300 tokens per KB of source code.

- **Target:** 80K tokens of file content per batch
- **Leaves:** 120K tokens for extraction output, instructions, and reasoning (Haiku's 200K window)
- **Result:** batch size emerges naturally from content — ~40 small files (1–2KB), ~20 medium files (5–10KB), ~6 large files (20KB+), without explicit size tiers
- **Cap:** never exceed 40 files per batch regardless of size, to keep extraction quality high

**What it does NOT do:** Read source files, extract symbols, or make any decisions about the codebase's internal structure.

---

### 4. `infra-init-batch-indexer` — Batch File Extractor

**Purpose:** Extract structured symbols, imports, calls, env vars, and routes from a batch of source files during `/infra-init`. Pure extraction — no synthesis, no filtering. Multiple instances run in parallel; each receives a pre-assigned batch and writes a flat JSON record per file.

**Model:** Haiku (mechanical extraction at volume — no reasoning required)

**Inputs:**
- `batch_id` — which batch this instance owns
- `progress_file` — path to `.claude-init/progress.json` (read to claim a batch; write status updates)
- `output_file` — path to write results (e.g. `.claude-init/results/batch_00.json`)

**Output schema (written to `output_file`):**
```json
[
  {
    "file": "src/services/notification.py",
    "exports": ["NotificationService"],
    "symbol_lines": { "NotificationService": 8 },
    "classes": ["NotificationService"],
    "functions": ["dispatch", "_build_payload"],
    "calls": ["get_cognito_user", "PusherService.send"],
    "imports": ["src/utils/cognito", "src/clients/pusher"],
    "env_vars_read": ["PUSHER_PARAMETER_NAME"],
    "routes": [],
    "entry_point": false,
    "trigger": null
  }
]
```

**Behavior:**
1. Receive assigned batch ID in the prompt — no claiming, no reading `progress.json` to find work
2. Read the files assigned to this batch
3. Extract all symbols using best available tool: language server MCP → tree-sitter MCP → grep/glob fallback
4. Write results to `output_file`
5. Acquire `progress.lock`, write `complete` for this batch in `progress.json`, release lock immediately
6. If context budget runs low mid-batch: write a handoff doc (completed files, remaining files, findings so far), acquire lock, write `needs_continuation`, release lock

**Context budget rule:** Never use more than 60% of context budget on file content.

**What it does NOT do:** Synthesize, filter, prioritize, or reason about architecture. That belongs in `infra-init-graph-builder`.

**Orchestration — pre-assignment model:**
The orchestrator (the `/infra-init` skill) assigns batches before spawning agents. It never lets agents race to claim work:

1. Orchestrator reads `progress.json`, selects the next wave of `pending` batches (up to 5)
2. Spawns one agent per batch in parallel, each prompt includes the assigned batch ID
3. Agents run concurrently — each goes directly to its assigned work, no contention
4. Orchestrator waits for all agents in the wave to complete
5. Repeats for the next wave until all batches are `complete`
6. If any batch is `needs_continuation`, orchestrator re-spawns that agent with the same batch ID plus the handoff doc as context

`progress.lock` is only used for brief status writes back to `progress.json` (step 5 above). Contention is low because agents finish at different times and the write is near-instant. The lock is never held during file processing.

---

### 5. `infra-init-graph-builder` — Graph Builder

**Purpose:** Phase 3 of `/infra-init`. Reduce phase — reads all batch output files and synthesizes them into the two final artifacts: `codebase-graph.json` (the queryable symbol graph) and `CODEBASE.md` (the short human-readable summary). Runs once, sequentially, after all batch indexers have completed. Does not read any source files.

**Model:** Sonnet (synthesis required — must build inverted indexes, correlate data across batches, and generate a coherent summary)

**Inputs:**
- Path to `.claude-init/results/` directory containing all `batch_NN.json` files

**What it builds:**

| Index | Contents |
|-------|----------|
| Symbols index | All exported symbols keyed by name with `file:line` |
| Callers index | Inverted call map — for each symbol, which files call it |
| Env vars index | All env var reads with exact names, where defined (from serverless.yml / infra files), and which files read them |
| Endpoints index | Exposed routes and consumed API clients |

**Outputs:**

`codebase-graph.json` — the full queryable graph (schema defined in Plan 01):
```json
{
  "meta": { "repo_type": "python-lambda", "generated": "...", "commit": "..." },
  "symbols": { ... },
  "callers": { ... },
  "env_vars": { ... },
  "endpoints": { "exposed": [], "consumed": { ... } }
}
```

`CODEBASE.md` — short summary (entry points and key modules only). Intentionally brief — the graph handles deeper questions.

**Behavior:**
1. Read all `batch_NN.json` files from the results directory
2. Merge symbol records across batches — deduplicate, resolve conflicts
3. Build callers index by inverting all `calls` relationships
4. Build env vars index by correlating `env_vars_read` records with definitions in serverless.yml / infra files
5. Build endpoints index from `routes` and consumed API client records
6. Write `codebase-graph.json`
7. Generate `CODEBASE.md` — identify entry points (files where `entry_point: true`), key modules (most-called, most-imported), write short summary

**What it does NOT do:** Read source files, make implementation decisions, or modify any batch output files.

---

### 6. `integration-engineer` — Cross-Repo Analyst

**Purpose:** Answer cross-repo integration questions with precision. Typical questions: "what endpoint does the mobile app need to call?", "exactly what does the backend expect in that request body?", "if I change this contract, what else breaks?" Read-only. Never modifies files, never commits, never guesses — if the exact answer cannot be found in code, it says so.

This system spans dozens of repos across mobile, backend, firmware, and internal tooling. Cross-repo integration questions are a routine part of planning, not an edge case. The integration-engineer exists to answer those questions with precision and minimum context cost.

**Primary navigation: codebase-memory-mcp.** For any repo that has run `/infra-init`, the integration-engineer queries its local codebase-memory-mcp tools (`search_graph`, `query_graph`) to get structured cross-repo context without reading whole files. For example: a dashboard repo needing to understand another repo's API surface queries that repo's codebase MCP rather than grepping files — getting exactly the endpoint list and contract details with no noise. When the graph is not present, the agent falls back to direct file search. A repo not having a graph is not a blocker — but repos with `/infra-init` set up get significantly faster and more precise cross-repo analysis.

**Model:** Sonnet (reasoning required — must correlate across codebases)

**When invoked:**
- During planning when a proposed change has potential cross-repo impact
- When a consumer repo (mobile, firmware) needs to integrate with a provider repo (backend API)
- When explicitly requested to audit endpoint coverage across repos
- When a new endpoint is added and callers in other repos need to be mapped

**Inputs:**
- `goal` — what cross-repo question to answer (plain language)
- `repos` — list of repo identifiers: local paths if known, or descriptions (e.g. "backend API", "iOS app") for discovery
- `focus` — optional: a specific symbol, endpoint path, or data flow to trace (narrows the search)

---

#### Phase 1 — Repo Discovery

When a repo path is not provided, locate it via Bitbucket before doing anything else. The official Atlassian MCP does not cover Bitbucket — use the community `aashari/mcp-server-atlassian-bitbucket` MCP if installed, otherwise fall back to the Bitbucket REST API directly.

**Tier 1 — Explicit path provided:** skip discovery entirely. Proceed to Phase 2.

**Tier 2 — Project key known:** use `bb_ls_repos` with the known `projectKey` to list all repos in that project. Repos organized into Bitbucket projects (e.g. MOBILE, BACKEND, FIRMWARE) make this a clean, reliable lookup. Read repo names and descriptions to pick the right one. If one clear match: proceed. If multiple candidates: read each repo's README to disambiguate.

**Tier 3 — Project key unknown, MCP available:** use `bb_search` with language or file signals rather than a plain description — Bitbucket search matches content, not repo metadata, so searching "mobile app" will not find a repo by name. Instead search for a known marker file or language:
- Mobile (Flutter): search for `pubspec.yaml` or `language:dart`
- Mobile (React Native): search for `language:javascript` + `metro.config`
- Mobile (Swift/iOS): search for `language:swift` or `.xcodeproj`
- Backend (Python Lambda): search for `serverless.yml` + `language:python`
- Firmware: search for `CMakeLists.txt` or `language:c`
Read the returned files to confirm which repo they belong to.

**Tier 4 — No MCP available:** fall back to Bitbucket REST API directly:
```
GET /2.0/repositories/{workspace}?q=project.key="{KEY}"&pagelen=100
```
Parse the response to find candidate repos, then read their READMEs to select the right one.

**Tier 5 — Cannot determine:** stop and surface to main context with a specific question ("I need the Bitbucket project key or repo slug for the mobile app — can you provide it?"). Never guess a repo path.

---

#### Phase 2 — File Discovery

For each repo, two paths depending on whether `/infra-init` has been run:

**Path A — Graph exists** (`codebase-graph.json` is present):
- Read `endpoints.exposed` for routes this repo serves
- Read `endpoints.consumed` for external APIs this repo calls
- Use the symbols and callers indexes to trace specific functions if needed
- The graph is the navigation aid — read the actual source file when the answer requires seeing exact parameter names, types, or validation logic

**Path B — No graph** (repo does not have a codebase graph):
- Do not flag this as a blocker and stop. Search directly.
- Backend repos: grep for route registration patterns (`@app.route`, `router.get/post/put/delete`, `app.use`, `ApiGatewayEvent`, `serverless.yml` HTTP events). These patterns are language-specific — use the repo type (detected from manifest files) to know which patterns to look for.
- Mobile repos: grep for base URL constants, API client classes, request builder calls. Look for `URLSession`, `Retrofit`, `Dio`, `fetch`, `axios` — whatever matches the detected platform.
- Firmware repos: grep for HTTP request construction, socket send patterns, URL strings.
- In all cases: read the files that match rather than relying on grep output alone.

---

#### Phase 3 — Endpoint Extraction

This is the core job. For each endpoint identified in Phase 2, extract exact values — no approximations.

For a backend endpoint, find:
- Exact HTTP method (GET/POST/PUT/PATCH/DELETE)
- Exact route path including path parameters (e.g. `/devices/{deviceId}/telemetry`)
- Required vs optional query parameters with types
- Request body schema: exact field names, types, required/optional status
- Authentication mechanism (API key header name, JWT header, Cognito pool)
- Response shape (status codes, top-level fields returned)

How to get these values: Read the handler function directly — not just the route registration. Route registration gives the path and method; the handler body gives the validation, the required fields, and the response shape. If there is a schema object or Pydantic/Joi/Zod model, read that too — it is the canonical source for field names and types.

For a mobile/firmware client, find:
- Exact URL being constructed (base URL + path, including how path params are interpolated)
- HTTP method
- Request body being sent: exact field names and values
- Headers being set
- How the response is consumed (what fields are read)

Non-negotiable rule: Never describe an endpoint as "probably something like `/api/devices`" or "likely expects a `deviceId` field." If the exact value is in the code, report it. If it is not findable, say "not found in [repo] — manual lookup required" and stop.

---

#### Phase 4 — Contract Mapping

With both sides extracted, produce the mapping:

1. Match backend endpoints to mobile/firmware calls by route pattern and HTTP method
2. For each match: compare what the client sends against what the backend expects — field names, types, required fields, auth headers
3. Identify mismatches (client sends `device_id`, backend expects `deviceId`; client omits a required field)
4. Identify gaps (backend exposes an endpoint with no client; client calls an endpoint that doesn't exist in the backend)

---

**Output:**

```
CONFIRMED CONNECTIONS
  POST /devices/{deviceId}/telemetry
    Backend: src/handlers/telemetry.py:42 — requires { timestamp: ISO8601, readings: [{ sensorId, value }] }, Authorization header (Cognito JWT)
    Mobile client: lib/api/telemetry_client.dart:87 — sends { timestamp, readings }, sets Authorization from token store
    Match: YES — field names and types align

MISMATCHES
  GET /devices/{deviceId}/status
    Backend expects: path param `deviceId` (UUID)
    Mobile sends: path param `device_id` (UUID) — field name mismatch in URL construction (lib/api/device_client.dart:34)

GAPS
  POST /firmware/ota-update — backend exposes, no client found in mobile repo
  GET /health — mobile calls https://api.example.com/ping, no matching route found in backend

BLOCKERS (if any)
  [anything that would cause a runtime failure — missing required fields, wrong auth, wrong method]
```

Gaps are not automatically BLOCKING. A gap is BLOCKING only if the current task depends on that connection working. Surface all gaps; let main context and the user decide severity.

**Constraints:**
- Read-only — no file writes, no git operations, no ticket creation
- Does not resolve mismatches — surfaces them to main context for user decision
- If a repo cannot be located after Git MCP lookup: report as unresolved, do not invent a path
- Never substitutes a "likely" endpoint for a confirmed one

---

### 7. `test-strategy` — Per-Plan Test Reviewer

**Purpose:** Define validation criteria for a plan before execution begins. Operates as a black-box reviewer — it knows what the system is supposed to do, not how it does it. Does not influence implementation decisions. Outputs a Testing section that is appended to the plan doc and later copied into the Jira ticket.

**Model:** Sonnet (must reason about what correct behavior looks like from the outside and what tests would verify it)

**When invoked:**
After architect review completes with `APPROVED` verdict, before `ExitPlanMode`. The sequence is: draft plan → architect review → **if APPROVED** → test strategy → `ExitPlanMode`. The architect does not invoke test-strategy — it is the next step in the main context flow, conditional on architect approval. If architect returns `NEEDS REVISION`, test strategy is deferred until the plan is approved.

**Inputs:**
- `plan_doc` — path to the plan doc being reviewed
- `testing_plan` — path to `.claude/testing-plan.md` for the repo (optional — agent falls back to lightweight mode if absent)

**What it reads:**
- The plan doc's stated intent: what inputs, what expected outputs, what side effects
- `.claude/testing-plan.md` — project type, test frameworks, service boundaries, pipeline config, log map
- Existing test files — permitted in two cases: (1) to understand what currently covers a feature being changed, so it can direct reuse vs. update vs. new; (2) optionally, to extract conventions (naming, structure, assertion style) for the Test Conventions block. It is looking for *what tests exercise and what they expect*, not how features are implemented.

**Two operating modes:**

*Standard mode* — repo testing plan exists:
- Consult service boundaries to scope which tests need to run
- Reference test frameworks and how to invoke them
- Identify what the pipeline requires to pass (lint, type checks, unit coverage thresholds, integration gates) and specify which tests need to exist or be written to satisfy those conditions — "the pipeline requires X, so we need a test that covers Y"
- For each use case the plan introduces, state proactively: "we will need a test that does X to cover use case Y"
- Produce the full Testing section format (unit, integration, E2E, manual steps, pipeline requirements, log monitoring notes)

*Lightweight mode* — no repo testing plan:
- Skip pipeline check and test framework references
- Focus on: what does working look like? what does broken look like? how do you verify each with the simplest possible check?
- Manual Verification Steps are the primary output
- Flag "this would benefit from formal test infrastructure" only if complexity warrants it

**Output:** A Testing section ready to be appended to the plan doc:

```markdown
## Testing Plan

### Unit Tests
- [ ] [specific test: what input, what expected output]

### Integration Tests
- [ ] [specific test: what service interaction, what to verify]

### E2E Tests
- [ ] [specific scenario — or PLANNED GAP if infrastructure doesn't exist yet]

### Manual Verification Steps
- [ ] [step-by-step what to check]

### Pipeline Requirements
- Required to pass: [lint / type checks / unit coverage threshold / integration gates — from testing-plan.md]
- Tests needed to satisfy pipeline: [specific test descriptions, one per bullet]
- If pipeline config changes are needed: [what change — tracked as separate work]

### Log Monitoring Notes
*Passed back to main context for inclusion in the plan — not an implementation spec.*
- Error conditions that should be logged during development: [specific failure modes, edge cases, or state transitions worth capturing]
- These feed into the plan doc so developers know what to instrument; implementation of the log infrastructure is out of scope here.

### Test Conventions *(optional — omit if no existing tests)*
- Test file naming: [e.g. `test_<module>.py` / `<module>.test.ts`]
- Assertion style: [e.g. `pytest` / `jest expect` / `assert` statements]
- Test structure: [e.g. `describe/it` blocks / class-based / flat functions]
- How to run: [command from testing-plan.md]
```

Minimal output for small changes:
```markdown
## Testing Plan

*Existing tests cover this change. No new tests required.*

### Manual Verification Steps
- [ ] [how to confirm the change works]

### Log Monitoring Notes
- [error conditions worth logging during development — or "none identified" if N/A]
```

**Constraints:**
- Black-box only — criteria based on observable behavior, never on implementation internals
- For each scenario, explicitly directs whether to reuse, update, or write a new test — "existing tests cover this" is a valid and correct output for unchanged behavior; tests that cover a changed feature must be updated to match
- Does not block the plan — surfaces what is untestable or has planned gaps, but does not BLOCK on those gaps

**Full spec:** See Plan 03, Pillar 3. This plan owns the agent implementation.

---

### 8. `test-builder` — Test Code Writer

**Purpose:** Write the actual test code defined by the test strategy. Operates as a parallel subagent when execution begins — it is the execution-phase counterpart to `test-strategy`. Takes the Testing section of the plan doc as its specification and produces runnable tests without reading the implementation being built.

**Model:** Sonnet (must reason about test conventions, framework usage, and how to translate behavioral specs into idiomatic test code)

**When invoked:**
Plan approved, execution begins — invoked in parallel with the main implementation work. Does not wait for implementation to finish.

**Inputs:**
- `plan_doc` — path to the plan doc; agent reads only the Testing section (including Test Conventions if test-strategy populated them)
- `testing_plan` — path to `.claude/testing-plan.md`
- `test_dir` *(optional)* — path to the repo's test directory; only needed if the Testing section does not already supply conventions
- `codegraph` *(optional)* — path to `codebase-graph.json` if it exists

**What it reads:**

*Always:*
- The Testing section from the plan doc — scenarios, pass/fail criteria, and Test Conventions if populated
- `.claude/testing-plan.md` — framework, runner commands, service boundaries

*Optionally (only if needed):*
- Existing test files — for naming/structure/assertion conventions, only when the Testing section does not already supply them
- `codebase-graph.json` — for function signatures: symbol names, parameter types, and return types; sufficient context to construct correct test inputs and verify expected outputs; contains no implementation logic — only public interface shape

**Never reads:** implementation source files, design documents, or any non-test code.

**Output:** Writes test files directly to disk and stages them. Returns a **status summary only** to the main context — which scenarios were covered, which files were written, any gaps. The main context does not receive test code; this is what makes the black-box guarantee meaningful.

**Constraints:**
- Black-box only — specification is the Testing section checklist, not implementation internals
- Follows the test strategy's direction on whether to reuse existing tests or write new ones
- Follows the test strategy's explicit direction on which existing tests to reuse, update, or replace — test-builder acts on those directives, not on its own read of implementation changes; test changes track implementation changes, not the other way around
- If a scenario is not testable with the available framework, flags it as a gap rather than approximating

**Full spec:** See Plan 03, Pillar 3b. This plan owns the agent implementation.

---

### 9. `jira-workflow-manager` — Jira Operations Agent

**Purpose:** Handle all Jira operations — ticket creation, status transitions, comments, and ticket reads. Jira is a tracking layer, not a workflow controller. This agent records what happened and what was planned; it never gates or interrupts work.

**Model:** Sonnet (must reason about ticket origin, format, comment policy, and when to surface conflicts vs. proceed)

**When invoked:**
- After a plan is finalized and architect review is complete — to create plan-execution tickets
- When starting a task — to transition to In Progress
- When a bug is identified — to create a Bug ticket
- When a task is committed — to transition to Testing or Done
- When working on a human-created ticket — to read it and keep it current
- Never called directly for Atlassian MCP tools — always delegate through this agent

**Operations:**

| Operation | Inputs | Returns |
|-----------|--------|---------|
| `create-epic` | goal statement, task list with sizing, plan doc reference | Epic key |
| `create-task` | context, scope (files/methods), implementation notes, acceptance criteria, epic key (optional) | Task key |
| `create-bug` | error/stack trace, observed behavior, expected behavior, environment, source, linked work | Bug key |
| `transition` | ticket key, target status, resolution (required when transitioning to Done) | confirmed new status |
| `add-comment` | ticket key, comment body | confirmed |
| `read` | ticket key | ticket content including description, status, comments |
| `search-duplicates` | summary, scope description | list of candidate matching tickets |
| `update-description` | ticket key, updated field, reason for change (required if ticket is In Progress) | confirmed |

**Ticket origin taxonomy — determines format and lifecycle:**

| Origin | Format | Always goes through Testing? |
|--------|--------|------------------------------|
| Plan-execution (Task/Epic) | Context + Scope + Implementation Notes + Acceptance Criteria | Only if human verification needed |
| Bug | Error + Observed + Expected + Environment + Source | Always |
| Human-created | Accept as-is, no reformatting | Per standard rules |
| Cross-repo | Deferred — see Plan 02, Origin 4 | TBD |

**Behavioral constraints:**

- **Check for duplicates before creating** — search open tickets for overlapping scope; surface conflicts to user rather than creating a second ticket
- **One agent per task** — before transitioning to In Progress, read current status; if already In Progress, stop and surface the conflict
- **Additive only** — creating a missed ticket never modifies or merges existing tickets; if overlap exists, surface it
- **Comment policy** — default is no comment; add only when execution diverged from plan, root cause found (bugs), work is blocked, or a significant mid-execution decision was made. Never summarize what was done.
- **Description edits** — silent before In Progress; require a paired comment explaining the change once In Progress
- **Resolution field** — always set when transitioning to Done; tickets without a Resolution are not truly closed in Jira filters

**Bug severity (set at creation, deterministic):**

| Severity | When |
|----------|------|
| Critical | Crash, data loss, security issue, total feature unavailability |
| Major | Core feature broken, no workaround |
| Minor | Feature degraded, workaround exists |
| Trivial | Cosmetic, typo, minor UX issue |

Bug priority is left blank — requires business context, set by humans at triage.

**Obviousness gate (before creating a bug ticket):**
1. Is the root cause immediately obvious without investigation?
2. Is the fix trivial — one area, no downstream effects?

If both are yes → fix inline, no ticket (commit message is the record). If either is no → create a Bug ticket first.

**Token Estimate field:** write `S`, `M`, or `L` into the custom Token Estimate field. If the field does not exist in the project, append `[S]`/`[M]`/`[L]` to the summary line as a fallback. Never apply project-specific custom fields unless documented in the repo's `CLAUDE.md`.

**MCP routing:** All Atlassian operations go through the official Atlassian remote MCP (Jira/Confluence). Do not call MCP tools directly — this agent is the abstraction layer.

**Full spec:** See Plan 02 for complete ticket formats, lifecycle rules, comment policy, and all decisions. This plan owns the agent implementation.

---

### 10. `test-runner` — Test Suite Executor

**Purpose:** Post-implementation test executor. The closing step of the TDD cycle: test-builder wrote the failing tests, implementation made them pass, test-runner verifies that claim. Invoked after implementation is committed and before `verification-before-completion`. Does not propose fixes. Blocks any fix attempt behind `systematic-debugging` on failure.

**Model:** Sonnet

**When invoked:**
- By `executing-plans` (main context) — once per task, after implementation commit
- By `subagent-driven-development` (orchestrator) — once per task; leaf implementer subagents never invoke it
- Caller must have Skill tool access so the REQUIRED NEXT STEP block on failure is actionable

**Inputs:**

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `plan_doc` | Yes | — | Path to plan doc; reads Testing section for expected scenarios |
| `testing_plan` | Yes | — | Path to `.claude/testing-plan.md` |
| `results_file` | No | `.claude/test-results.md` | Output file for full run |
| `defer_write` | No | `false` | Skip writing results to disk |

**Result types:** PASS / TEST FAILURE / BUILD FAILURE / ENVIRONMENT FAILURE / SETUP REQUIRED

**Retry policy:** TEST FAILURE only, up to `flakiness_tolerance` additional runs. BUILD FAILURE and ENVIRONMENT FAILURE are deterministic — retrying cannot fix them.

**On FAILURE:** Emits REQUIRED NEXT STEP block mandating `systematic-debugging` before any fix. This is reinforced by `CLAUDE.md` global rule: no fix attempt until systematic-debugging Phase 1 is complete.

**On SETUP REQUIRED:** Returns immediately if `.claude/testing-plan.md` is absent. Instructs caller to run `e2e-init`. Does not create the file itself.

**What it does NOT do:**
- Propose or suggest fixes — ever
- Read implementation source files (reads only `testing_plan` and the Testing section of `plan_doc`)
- Accumulate result files (always overwrites `.claude/test-results.md`)
- Retry on BUILD FAILURE or ENVIRONMENT FAILURE

---

## Orchestration Patterns

Patterns that appear across multiple agents, standardized here.

### Pattern 1 — Fan-Out / Reduce

*Used by: `/infra-init` (batch indexers → graph builder)*

```
Orchestrator
    ├── Spawns N agents in parallel (Agent tool)
    │   Each: claims a work unit, reads files, writes output to temp file
    └── Waits for completion
         └── Spawns 1 reduce agent
              Reads all temp files, synthesizes into final output
```

State lives in files, not conversation history. Re-running the orchestrator reads the manifest and resumes from the first incomplete step.

### Pattern 2 — Delegate and Return

*Used by: `git-manager` skill, `test-strategy`, `architect`, `researcher`*

```
Main context
    └── Dispatches agent with structured inputs
         Agent executes or reviews, returns structured output
    └── Main context reads result, makes decisions
```

Main context owns all decisions. The subagent executes or reviews — it does not decide what to do next.

### Pattern 3 — Read-Only Cross-Context

*Used by: `integration-engineer`*

```
Main context (working in Repo A)
    └── Dispatches integration-engineer with repo list
         Agent reads from multiple repos
         Returns structured findings — no writes, no side effects
    └── Main context decides how to act on findings
```

### Model Selection

| Model | Use for |
|-------|---------|
| Haiku | Execution-only agents (`infra-init-structure`, `infra-init-batch-indexer`, `researcher`). No reasoning — retrieval, extraction, or MCP lookups. |
| Sonnet | Review and synthesis agents (`architect`, `infra-init-graph-builder`, `test-strategy`). Must reason about or synthesize what they find. |

---

## Cross-Plan Dependencies

| Plan | Relationship |
|------|-------------|
| **Plan 01** | `/infra-init` orchestrates `infra-init-structure`, `infra-init-batch-indexer`, and `infra-init-graph-builder`. Plan 05 owns all three agent designs; Plan 01 owns the orchestrator and the overall phase sequence. |
| **Plan 02** | `jira-workflow-manager` handles all ticket creation and transitions. Cross-repo concerns are handled by `integration-engineer`. |
| **Plan 03** | `test-strategy` is built per Plan 03's spec; Plan 05 provides orchestration pattern and model selection. |
| **Plan 04** | Git workflow standards live in Plan 04 and are implemented in the `git-manager` skill (Plan 08). No agent dependency. |

---

## Deliverables

| # | Deliverable | Location |
|---|-------------|----------|
| 1 | `architect` agent | `~/.claude/agents/architect.md` |
| 2 | `researcher` agent | `~/.claude/agents/researcher.md` |
| 3 | `infra-init-structure` agent spec | Embedded in `~/.claude/skills/infra-init/SKILL.md` — spawned inline by skill, no persistent agent file |
| 4 | `infra-init-batch-indexer` agent spec | Embedded in `~/.claude/skills/infra-init/SKILL.md` — spawned inline by skill, no persistent agent file |
| 5 | `infra-init-graph-builder` agent spec | Embedded in `~/.claude/skills/infra-init/SKILL.md` — spawned inline by skill, no persistent agent file |
| 6 | `integration-engineer` agent | `~/.claude/agents/integration-engineer.md` |

---

## Decisions

| Question | Decision |
|----------|----------|
| **git-executor** | Dropped. Logic absorbed into the `git-manager` skill. The skill runs in main context and calls Bash directly — a separate execution agent added overhead without benefit once the `git-workflow.md` rule was also dropped. |
| **infra-init-batch-indexer claim mechanism** | Pre-assignment by orchestrator. The `/infra-init` skill assigns batch IDs before spawning agents — each agent receives its batch in the prompt and goes directly to work. No claiming, no contention at startup. A single `progress.lock` file is used only for the brief status write-back to `progress.json` when a batch completes. Lock is never held during file processing. |
| **integration-engineer trigger** | On-demand only — if the researcher finds that a plan touches an exposed endpoint (via `endpoints.exposed` in the codebase graph), it flags cross-repo review as warranted. Main context or user decides whether to proceed. |
| **integration-engineer repo discovery MCP** | Bitbucket, not GitHub. Primary: `aashari/mcp-server-atlassian-bitbucket` (`bb_ls_repos` by project key, `bb_search` by language/file signals). Fallback: Bitbucket REST API v2. |
| **researcher scope** | Focused lookups + light summarization from a single already-retrieved source (one graph query, CODEBASE.md, or a 10–20 line targeted read). Hard "refuse synthesis" rule replaced with a scoped-summarization policy and a self-check ("will the caller have to redo this?"). Out-of-scope questions surface via `OUT_OF_SCOPE:` prefix with partial findings rather than silent refusal. Broad scanning or multi-file synthesis remains out of scope. |
| **todo-manager** | Converted from a standalone agent to a workflow inside the `plan-management` skill (Plan 08). High invocation frequency, pure structural edits, no reasoning required — sequential skill execution is the correct pattern. Agent-spawn overhead is not justified. |
| **architect isolation** | Updated to "informed isolation." The architect reads CLAUDE.md and related plan docs cold (no conversation history) — this is intentional, not a limitation. Cold reads counter sycophancy and catch contradictions with prior design decisions that conversational context would mask. |
