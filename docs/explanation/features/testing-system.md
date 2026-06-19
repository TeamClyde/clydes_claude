---
**Feature:** Testing System
**C4 Layer:** C3 Component
**Status:** Active
**Owner:** solo
**Last updated:** 2026-06-18
**Related plans:** plans/orchestration-layer-foundation/ (Phase 1B docs)
**Related ADRs:** _(none)_
**Key files:**
  - `skills/e2e-init/SKILL.md` — per-repo testing backbone (testing-plan.md, run-tests.sh)
  - `agents/test-strategy.md`, `agents/test-builder.md`, `agents/test-runner.md` — the three test agents
  - `skills/test-driven-development/SKILL.md` — red/green/refactor discipline
---

# Testing System

## Context & Scope

The Testing System is the workflow's validation layer. It ensures that code Claude writes has genuine confidence behind it — not just that it runs, but that it does what was intended, passes the repo's pipeline, and leaves a repeatable signal for future sessions.

The system spans two temporal phases. The first is a one-time per-repo setup phase: the `e2e-init` skill reads the repo's structure and produces a testing backbone (`.claude/testing-plan.md`, `scripts/run-tests.sh`). The second is an ongoing per-plan phase that fires on every plan executed against that repo: a test-strategy agent defines validation criteria after the architect approves the plan, a test-builder agent writes the failing tests before implementation begins, and a test-runner agent executes the suite after implementation is committed.

Pre-commit quality gates run locally at commit time using the per-repo `scripts/run-tests.sh`, providing a fast feedback loop before code reaches CI.

**What this system covers:**
- One-time repo testing backbone setup (`e2e-init`)
- Per-plan validation criteria definition (`test-strategy` agent)
- Pre-implementation failing test authorship (`test-builder` agent)
- Post-implementation suite execution and failure classification (`test-runner` agent)
- Pre-commit hook integration (`scripts/run-tests.sh`)
- Runtime observability notes and bug triage protocol (log map, monitoring cadence)
- Red-green-refactor discipline (`test-driven-development` skill)

**What it does NOT cover:**
- E2E infrastructure (Detox for mobile, hardware-in-the-loop for firmware). These are deferred; `e2e-init` produces a `plans/e2e-plan.md` that documents known gaps and the approach for when that work begins.
- Test file discovery for the Codebase Knowledge System. Detailed test inventory (what each test does) belongs to the codebase-memory graph, not this system.
- Jira ticket creation for bugs. The bug triage protocol identifies severity; ticket creation routes through the `jira-workflow-manager` agent when Jira is enabled.

**Project config toggle:** `workflow.tdd` in `project.json` controls whether the `test-driven-development` skill and `test-builder` agent are active. This repo has `"tdd": false`, which disables the red-green-refactor gate and suppresses test-builder invocation. The test-strategy and test-runner agents are unaffected by this flag.

---

## Building Block View

The system has six named pillars, each corresponding to a discrete component.

### Pillar 1 — `e2e-init` (Repo Testing Backbone)

The `e2e-init` skill (`skills/e2e-init/SKILL.md`) is the testing equivalent of `/init`. Run once per repo, it performs a deep read of repo structure — source directories, CI/CD config, package manifests, test framework signals — and produces three outputs:

- **`.claude/testing-plan.md`** — the persistent repo-level testing config consumed by all downstream agents and hooks. Contains: project type classification (Backend / UI/Client / Firmware / Mixed), test frameworks and run commands, service boundary directory map, CI pipeline info, flakiness tolerance, optional setup steps, and a log map.
- **`scripts/run-tests.sh`** — the change-aware pre-commit test script. Reads the service boundary map from `.claude/testing-plan.md`, determines which services are touched by changed files via `git diff --name-only HEAD`, and runs either a targeted scope (one service) or the full suite (if a shared utility path changed).
- **`.claude/integration-test-constraints.md`** — statically discoverable constraints (singleton patterns, permission reset behaviors, framework gotchas) found during repo analysis. Accumulates runtime-discovered constraints over time; never overwritten on re-run.

Re-running `e2e-init` diffs proposed changes to the two mutable outputs and waits for user confirmation before writing. Firmware repos receive a static-analysis-only `run-tests.sh` instead of the service-boundary host runner, because no host test runner exists for embedded targets.

### Pillar 2 — Pipeline Gatekeeper

The CI/CD pipeline is a rigid gatekeeper. The repo testing plan documents the pipeline: system in use, stages, what gates a merge, environment flow, and known fragility. `e2e-init` performs a pipeline audit on first run and records findings in `.claude/testing-plan.md`. Pipeline changes are always separate tracked work items — never bundled into feature tasks.

### Pillar 3 — `test-strategy` Agent

The `test-strategy` agent (`agents/test-strategy.md`) is a per-plan validation checkpoint invoked after the architect returns an APPROVED verdict, before `ExitPlanMode`. The gate sequence is: **draft plan → architect review → test-strategy → ExitPlanMode**.

The agent operates in two modes:

- **Standard mode** (`.claude/testing-plan.md` exists): applies the full Testing section format, consulting service boundaries, pipeline requirements, and test frameworks.
- **Lightweight mode** (no testing plan): skips pipeline and framework references; focuses on "what does working look like and what is the simplest check that distinguishes working from broken"; makes Manual Verification Steps the primary output.

For each scenario the plan introduces or changes, the agent explicitly directs the test-builder to **reuse** an existing test, **update** an existing test, or **write a new** one. It reads existing test files only to understand what they exercise, not how the feature is implemented. The agent also optionally populates a Test Conventions block in the Testing section to give test-builder naming, assertion style, and structural guidance without requiring it to do its own discovery.

The agent does not block the plan, does not read implementation source files, and does not write test code. Its output — a `## Testing Plan` section — is appended to the plan doc by the caller.

### Pillar 3b — `test-builder` Agent

The `test-builder` agent (`agents/test-builder.md`) is the RED step in red-green-refactor. It is invoked when plan execution begins, before implementation starts. It takes the Testing section from the plan doc as its specification and writes failing test files directly to disk. It does not read implementation source files under any circumstance.

The agent follows the test-strategy's directives exactly: reuse means unchanged, update means extend the named test, write new means create per repo conventions. For symbol verification, it uses `codebase-memory-mcp` (`search_graph`, `get_code_snippet`) to confirm function signatures before asserting against them. If a symbol cannot be verified, it flags the assertion as unverified in the status summary rather than guessing.

The agent returns a **status summary only** to the main context — which scenarios were covered, which files were written, any gaps. The test code itself is not returned. This keeps the implementation honest to the spec: the implementer knows which scenarios must pass, not what the tests assert internally.

**Suppressed when `workflow.tdd: false`.** Test-builder is not invoked in repos with TDD disabled in `project.json`.

### Pillar 3c — `test-runner` Agent

The `test-runner` agent (`agents/test-runner.md`) closes the TDD loop. It is invoked by the main context (`executing-plans`) or orchestrator (`subagent-driven-development`) after implementation is committed and before `verification-before-completion`. Leaf implementer subagents never invoke it, because the mandatory failure directive requires Skill tool access.

The agent reads the run command and config from `.claude/testing-plan.md`, optionally runs setup steps, executes the test command via Bash, and classifies the result into one of five states:

| Result | Condition |
|--------|-----------|
| PASS | Exit code 0 |
| TEST FAILURE | Exit non-zero, test output present (some tests ran and failed) |
| BUILD FAILURE | Exit non-zero, no test output (compile/parse/import error before tests ran) |
| ENVIRONMENT FAILURE | A setup step exited non-zero before the test command ran |
| SETUP REQUIRED | `.claude/testing-plan.md` not found |

On SETUP REQUIRED, the agent instructs the caller to run `e2e-init` and stops. On any FAILURE result, it emits a REQUIRED NEXT STEP block mandating invocation of `systematic-debugging` before any fix attempt. It does not propose or suggest fixes itself. Full run output is written to `.claude/test-results.md`, overwriting on every run — never accumulating timestamped files.

Flakiness tolerance is configured in `.claude/testing-plan.md` as an integer (`flakiness_tolerance`). TEST FAILURE results are retried up to that count; BUILD FAILURE and ENVIRONMENT FAILURE are deterministic and never retried.

### Pillar 4 — Pre-Commit Quality Gates

A global pre-commit hook calls `scripts/run-tests.sh` at the repo root. The script uses `git diff --name-only HEAD` to identify changed files, maps them to services using the boundary table in `.claude/testing-plan.md`, and runs either the affected-service scope or the full suite when a shared utility path is touched. It supports a `--fast` flag that skips integration tests and runs unit tests only. Exit 0 passes, non-zero blocks the commit. The hook is not bypassed with `--no-verify`.

If `scripts/run-tests.sh` does not exist in a repo, the hook skips silently with a warning rather than failing — repos that have not run `e2e-init` are not broken.

### Pillar 5 — Runtime Observability and Bug Triage

The repo testing plan includes a log map: per-service log locations, what is logged, and at what level. When Claude writes code that produces logs, the plan doc for that work documents the expected log messages and failure modes.

The test-strategy agent's Testing section includes Log Monitoring Notes for production-bound changes — specific failure modes worth observing during rollout. Monitoring cadence is defined per-plan, not uniformly: active testing uses live monitoring, post-deploy feature work checks daily for two to three days, and background services align checks to job frequency.

Bug triage uses a three-tier S/M/L classification. S-sized bugs (isolated, clear cause) are fixed inline without a ticket. M-sized bugs (recurring, multiple components, requires investigation) and L-sized bugs (systemic, potential data integrity concern) are escalated to tracked tickets. When a bug's size is ambiguous, the larger classification applies.

---

## Runtime View

### Plan-gate sequence (per plan, standard mode)

```
1. brainstorming → design doc
2. writing-plans → plan doc (with architecture blueprint)
3. plan-gate fires:
   a. architect reviews plan → APPROVED
   b. test-strategy invoked with plan doc + testing-plan.md path
   c. test-strategy appends ## Testing Plan section to plan doc
   d. ExitPlanMode
```

### Execution sequence (per task)

```
1. Execution begins (executing-plans or subagent-driven-development)
2. [If tdd: true] test-builder invoked with plan doc + testing-plan.md
   - Reads Testing section spec and Test Conventions
   - Writes failing test files to disk
   - Returns status summary (scenario names, files written, gaps) — no test code
3. Implementation begins; implementation is written to make failing tests pass (GREEN)
4. Implementation committed via git-manager
5. test-runner invoked by main context / orchestrator
   - Reads run command from testing-plan.md
   - Runs setup_steps if configured
   - Executes test suite
   - Classifies result: PASS / TEST FAILURE / BUILD FAILURE / ENVIRONMENT FAILURE / SETUP REQUIRED
   - On FAILURE: emits REQUIRED NEXT STEP → systematic-debugging (mandatory before any fix)
   - On PASS: writes .claude/test-results.md; returns PASS summary
6. verification-before-completion runs
```

### Pre-commit sequence (at every commit)

```
1. git commit triggers pre-commit hook
2. Hook checks for scripts/run-tests.sh
   - Absent: skip with warning, exit 0
   - Present: invoke it
3. run-tests.sh reads .claude/testing-plan.md Service Boundaries
4. git diff --name-only HEAD → list of changed files
5. Map changed files to services
   - Any file in full suite trigger path → run full suite
   - Otherwise → run tests for affected service(s) only
6. Exit 0: commit proceeds. Non-zero: commit blocked.
```

### `e2e-init` sequence (one-time per repo)

```
1. User invokes /e2e-init
2. Skill checks for existing .claude/testing-plan.md (re-run vs. first run)
3. Reads: .claude-init/CODEBASE.md, test dirs, CI/CD config, package manifests
4. Classifies project type (Backend / UI/Client / Firmware / Mixed)
5. Builds test inventory, service boundary map, CI pipeline summary
6. Checks for existing scripts/run-tests.sh (never overwrites if present)
7. On first run: writes .claude/testing-plan.md, plans/e2e-plan.md, scripts/run-tests.sh, .claude/integration-test-constraints.md
   On re-run: diffs changes to testing-plan.md and run-tests.sh; waits for user confirmation before writing
8. Updates CLAUDE.md Testing section with frameworks, run commands, and file paths
```

---

## Dependencies

**Internal dependencies:**

- `skills/e2e-init/SKILL.md` depends on `.claude-init/CODEBASE.md` (produced by `infra-init`) when available; falls back to direct filesystem reads when absent.
- `agents/test-strategy.md` is invoked by `plan-gate` after the architect review step. It is part of the plan-gate gate sequence and cannot be invoked before architect approval.
- `agents/test-builder.md` is invoked by `executing-plans` or `subagent-driven-development` at execution start. It depends on the Testing section produced by test-strategy; if the Testing section is absent, it has no specification to work from.
- `agents/test-runner.md` is invoked by `executing-plans` or `subagent-driven-development` after each implementation commit. It depends on `.claude/testing-plan.md`; without it, it returns SETUP REQUIRED immediately.
- `skills/test-driven-development/SKILL.md` composes with test-builder: if test-builder ran before execution, the TDD skill's RED step is skipped and the skill proceeds directly to Verify RED (confirming the tests fail for the expected reason before implementation begins).
- `systematic-debugging` skill is the mandatory next step on any test-runner FAILURE. The testing system does not own that skill; it depends on it being available to the invoking context.
- `git-manager` skill owns all git operations including staging and committing test files written by test-builder.
- `verification-before-completion` skill runs after test-runner returns PASS. The testing system gates it.

**External dependencies:**

- Test frameworks (repo-specific): pytest, jest, vitest, mocha, or equivalents. Versions and run commands are documented in `.claude/testing-plan.md` per repo.
- `codebase-memory-mcp` (`search_graph`, `get_code_snippet`): used by test-builder to verify symbol names before asserting against them. Optional; if unavailable, test-builder flags assertions against unverified symbols rather than guessing.
- AWS service stubs (for backend repos): `moto` (Python) and `aws-sdk-client-mock` (TypeScript) for stubbing AWS service calls in unit and integration tests.
- CI/CD system (repo-specific): GitHub Actions, Bitbucket Pipelines, CodeBuild, or equivalents. The pipeline is documented during `e2e-init` and enforces the quality bar independently of local pre-commit gates.

**Configuration:**

- `project.json` `workflow.tdd` — when `false`, suppresses test-builder invocation and the test-driven-development skill's red-green-refactor gate. test-strategy and test-runner are unaffected.
- `.claude/testing-plan.md` — the per-repo config file that all three test agents and `scripts/run-tests.sh` read at runtime.

---

## Decisions

_(No accepted ADRs yet.)_

---

## Known Issues & Gotchas

- **`workflow.tdd: false` disables test-builder but not test-runner.** In repos with TDD disabled, test-runner still executes after implementation — but if no tests were written (by test-builder or pre-existing), the suite may trivially pass or return SETUP REQUIRED. The test-strategy agent still runs and produces a Testing section; that section is simply not acted on by test-builder.

- **test-runner must be invoked by a context with Skill tool access.** The REQUIRED NEXT STEP block on failure mandates invoking `systematic-debugging` via the Skill tool. If test-runner is dispatched from a leaf implementer subagent that has no Skill access, the failure directive is unactionable. The orchestrator (`subagent-driven-development`) or main context (`executing-plans`) must be the invoking context, not a leaf.

- **`scripts/run-tests.sh` must be executable.** The pre-commit hook calls it directly. On Unix systems this requires `chmod +x scripts/run-tests.sh` after `e2e-init` writes it. Windows repos running under git-bash may encounter path-separator issues if the script uses `pwd` for path construction — use `git rev-parse --show-toplevel` for portable paths, per `rules/filesystem/path-portability.md`.

- **Re-running `e2e-init` does not overwrite `scripts/run-tests.sh`.** If the run-tests script needs to be regenerated (e.g. after a major framework change), it must be manually deleted first. The skill will not overwrite an existing script, even on re-run.

- **Test Conventions block is optional in the Testing section.** When test-strategy does not populate it, test-builder reads existing test files to extract conventions. If no test files exist and no conventions block is present, test-builder must infer conventions from the testing plan's framework entry — which may produce naming mismatches on the first test file written to a new repo.

- **Firmware repos have no host test runner.** `e2e-init` produces a static-analysis-only `scripts/run-tests.sh` for firmware repos that runs `cppcheck` or `clang-tidy` if they are on PATH and exits 0 with a message if they are not. The pre-commit hook therefore never hard-fails a firmware repo on a machine without those tools. The E2E plan documents the HIL approach; no automated backend test runner exists.

- **`flakiness_tolerance` default is 0.** Flaky tests are not retried unless `flakiness_tolerance` is explicitly set in `.claude/testing-plan.md`. A flaky test that fails on first run and would pass on retry will produce a TEST FAILURE and trigger `systematic-debugging`. Set `flakiness_tolerance: 1` (or higher) in the testing plan for test suites known to have environment-dependent flakiness.

- **`.claude/integration-test-constraints.md` is never auto-appended.** Runtime-discovered constraints require human confirmation before being written to the file. When `systematic-debugging` identifies a qualifying constraint, it surfaces it to the user for explicit confirmation before the main context writes the entry. The constraint format is `[YYYY-MM-DD] [description] — discovered via [failure type]`.

- **test-builder does not stage files.** It writes test files to disk only. All git staging belongs to `git-manager`. Staging inside test-builder would bypass `git-manager`'s pre-staged-invariant check and produce phantom staged files outside the caller's `files:` parameter.

---

## Observability

- **Test run results:** `test-runner` writes full stdout/stderr and exit code to `.claude/test-results.md` on every run, overwriting the previous run. This file is the primary artifact for diagnosing test failures. It includes: run command, exit code, retry count, and complete output.

- **Testing plan:** `.claude/testing-plan.md` documents the run command, service boundaries, CI pipeline info, and configuration fields (`flakiness_tolerance`, `setup_steps`). It is the source of truth for "how do tests run in this repo."

- **Integration test constraints:** `.claude/integration-test-constraints.md` accumulates statically discovered and runtime-discovered constraints. Reading it before writing new tests prevents re-encountering known gotchas (singleton patterns, permission reset behaviors).

- **Pre-commit output:** `scripts/run-tests.sh` writes pass/fail to stdout at commit time. Non-zero exit blocks the commit and surfaces the failure inline in the terminal.

- **CI pipeline:** the pipeline (GitHub Actions, Bitbucket Pipelines, etc.) runs the full test suite independently of pre-commit scope. Pipeline config is documented in `.claude/testing-plan.md` under `## CI Pipeline`. Test failures in CI that pass locally are typically scope-related (pre-commit ran targeted; CI ran full) or environment-related (missing `setup_steps` or credentials).

- **Log map:** `.claude/testing-plan.md` contains a log map table (service, log location, what is logged, level). Plan docs for production-bound changes include Log Monitoring Notes specifying which failure modes to observe during rollout and the appropriate monitoring cadence.

---

## Glossary

**testing-plan.md** — The per-repo testing configuration file at `.claude/testing-plan.md`. Produced by `e2e-init`. Contains project type, test frameworks, run commands, service boundary map, CI pipeline info, flakiness tolerance, setup steps, and log map. Read by all three test agents and by `scripts/run-tests.sh`.

**e2e-init** — The skill that initializes the testing backbone for a repo. "e2e" in the name refers to the scope of initialization (repo-wide), not to E2E browser/device testing. E2E browser and HIL infrastructure are deferred.

**test-strategy** — A subagent that defines validation criteria (what correct looks like from the outside) for a specific plan. Produces the `## Testing Plan` section appended to the plan doc. Runs after architect approval, before ExitPlanMode.

**test-builder** — A subagent that writes failing test code from the Testing section spec. Implements the RED step of red-green-refactor. Returns a status summary only; never returns test code to the main context. Suppressed when `workflow.tdd: false`.

**test-runner** — A subagent that executes the test suite and classifies the result. Runs after implementation is committed. Emits a mandatory `systematic-debugging` gate on any FAILURE result.

**red-green-refactor** — The TDD cycle: write a failing test (RED), write minimal code to pass it (GREEN), clean up without changing behavior (REFACTOR). Enforced by the `test-driven-development` skill when `workflow.tdd: true`.

**flakiness_tolerance** — An integer field in `.claude/testing-plan.md` specifying how many additional retries test-runner should attempt on TEST FAILURE before declaring the result final. Default is 0 (no retries). Only TEST FAILURE is retried; BUILD FAILURE and ENVIRONMENT FAILURE are deterministic.

**service boundary** — A directory-to-service mapping in `.claude/testing-plan.md` that `scripts/run-tests.sh` uses to determine test scope at commit time. A change to `src/auth/` triggers only auth tests; a change to `src/utils/` (a full suite trigger path) runs the entire suite.

**full suite trigger path** — A directory whose contents affect multiple services (typically `utils/`, `common/`, `shared/`, `models/`, `config/`). Any change to a file under a trigger path causes `scripts/run-tests.sh` to run the full test suite rather than a targeted scope.

**TEST FAILURE** — test-runner classification for: exit non-zero AND test output present. Means some tests ran and failed. Subject to flakiness tolerance retries.

**BUILD FAILURE** — test-runner classification for: exit non-zero AND no test output. Means the test suite did not execute (compile error, import error, parse error). Never retried.

**ENVIRONMENT FAILURE** — test-runner classification for: a `setup_steps` command exited non-zero before the test command ran. Indicates infrastructure or configuration problems, not test logic. Never retried.

**SETUP REQUIRED** — test-runner result when `.claude/testing-plan.md` is not found. Instructs the caller to run `e2e-init` before invoking test-runner again.

**log map** — A table in `.claude/testing-plan.md` mapping services to their log locations, what they log, and at what level. Used by the test-strategy agent when writing Log Monitoring Notes for production-bound changes.

**bug triage protocol** — The S/M/L classification system for bugs found during log monitoring or testing. S: fix inline, no ticket. M: tracked ticket required. L: high-priority ticket, surface immediately, may block current work. Ambiguous size defaults to the larger classification.

**black-box reviewer** — The operating stance of test-strategy and test-builder: all validation criteria and test logic are derived from stated behavioral intent (inputs, outputs, side effects), never from reading implementation source code. Tests verify what the system does, not how it does it.
