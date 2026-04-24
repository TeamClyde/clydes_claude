# Testing System

---

## Problem Statement

Testing has been an afterthought in the current workflow. New code ships without meaningful coverage, build pipelines aren't understood before work begins, and there is no protocol for checking whether deployed changes actually work in production. The result: bugs discovered late, low confidence in Claude's changes, and no structured way to catch and address runtime errors.

The goal of this system is not to add process for its own sake — it is to give Claude clear validation criteria so there is genuine confidence that what was built works correctly.

---

## Overview

The Testing System spans six concerns:

1. **`/e2e-init` & Repo Testing Plan** — one-time repo setup that creates the testing backbone
2. **Pipeline as a Rigid Gatekeeper** — CI/CD knowledge lives in planning context; code conforms to it
3. **Test Strategy Agent** — per-plan checkpoint that defines validation criteria before execution begins
3b. **Test Builder Agent** — writes the actual test code from the Testing section spec, before implementation begins (TDD)
3c. **Test Runner Agent** — executes the test suite after implementation is committed; classifies results and gates fixes behind `systematic-debugging` on failure
4. **Pre-Commit Quality Gates** — automated quality checks before code reaches the build pipeline
5. **Runtime Observability & Bug Triage** — log monitoring with context-appropriate cadence and structured bug triage
6. **E2E Infrastructure** — out of scope for this plan; deferred until after unit/integration TDD bootstrapping is established

---

## Two Phases of Testing

Everything in this system operates in one of two modes. Understanding the distinction is key to applying the right thing at the right time.

**Phase 1 — Repo Setup (run once)**
When a repo is first being set up for development, run `/e2e-init`. This does a deep read of the repo and produces the TDD backbone: a repo testing plan and a `scripts/run-tests.sh` wired to the pre-commit hook. It is the testing equivalent of running `/init` to create a `CLAUDE.md` — it establishes the foundation that all future TDD work builds on. Like `/init`, re-running it refreshes and updates the existing documents rather than starting from scratch.

**Phase 2 — Per-Plan Validation (ongoing)**
As individual plans are made, the Test Strategy Agent asks: how do we validate that this specific change works? For small changes, the answer may simply be "existing tests cover this." For larger changes, new tests or manual verification steps may be needed. Either way, the thinking happens — even if the output is minimal. This is not about rewriting or revisiting all existing tests; it is only about the delta introduced by the current plan.

The repo testing plan (created in Phase 1) is the context the Test Strategy Agent reads in Phase 2. Phase 1 runs once. Phase 2 runs every time a plan is finalized.

---

## Testing by Project Type

Not all repos need the same testing approach. The first question when thinking about testing is: what kind of project is this? The available tools, the definition of "E2E," and the validation approach all differ significantly across these categories.

| Project Type | Examples | Testing Approach |
|-------------|---------|-----------------|
| **Backend** | Lambda functions, APIs, data pipelines, scheduled jobs | Unit + integration + E2E trigger testing (invoke → verify side effects) |
| **UI / Client** | Mobile apps, web apps, internal tools, dashboards | Unit + E2E UI testing; Sentry for runtime observability |
| **Hardware / Firmware** | Embedded firmware, device software | Unit where possible + HIL; simulation before physical device |

Projects can touch multiple types. Identify which categories apply so test tooling and E2E approach are appropriate.

### Firmware (Known Gap)

Full firmware testing strategy requires hands-on review of actual firmware. Basics and principles are captured here; detailed design is deferred until active firmware development begins.

**Principles:**
- **Unit test where possible** — pure functions (data transformations, protocol parsing, state machine logic) should have unit tests even in embedded code
- **Simulation before hardware** — always build or identify a simulation path before testing on a physical device
- **Hardware-in-the-loop (HIL)** — for behavior that cannot be simulated, use dedicated HIL test scripts against real hardware in a controlled way
- **Scripted test sequences** — manual "poke it and see" is not acceptable for committed firmware; test sequences must be scripted and repeatable

**Known gaps:** No HIL infrastructure exists yet, no simulation environment defined, toolchain and test framework TBD per device/platform. When the first firmware repo is set up, run `/e2e-init` against it to produce the testing plan and HIL approach for that hardware.

---

## Unit Test Scope

The goal is meaningful confidence, not exhaustive coverage. A good unit test gives a human reviewer genuine assurance that a piece of logic works correctly — it is not a checklist item.

### What a Unit Test Is

A unit test verifies **one unit of behavior in isolation**: given a specific input, the output or state change is what you expect. The boundary is drawn at *behavior*, not at classes or methods. One test, one reason to fail.

Fast is non-negotiable: sub-100ms, no network, no filesystem, no real services. If a test is slow, it is doing too much or hitting real I/O.

### The Practical Filter

Write a test for code you are *afraid might be wrong*. If you would be surprised if it broke, test it. If it is obvious wiring, skip it.

Test these:
- Decision logic — branches, conditions, loops
- Data transformations and calculations
- Boundary conditions — empty input, zero, maximum values
- Error paths that callers are expected to handle

Skip these:
- Private methods — if the logic matters, it is reachable through the public interface
- Framework or library behavior — do not test that the AWS SDK serializes JSON correctly
- Pure pass-through wiring with no logic — trivial getters, simple delegation
- Auto-generated code
- Internal call sequences (e.g. "method A called method B") unless that sequence *is* the observable contract

### The Fragility Trap

A test that breaks on a valid refactor is testing the wrong thing. If you can restructure the internals of a function without changing its behavior, and the tests still pass — that is the goal. If they break, the tests were coupled to implementation, not to behavior.

**This is especially common with AI-generated tests.** Claude will sometimes produce tests that assert on mock call counts, exact exception message strings, or internal state that is not part of the public contract. These should be cut. A test should document what the code does for its callers, not how it does it internally.

The question to ask during test review: *would this test break if I refactored the implementation without changing the behavior?* If yes, rewrite or remove it.

### Replacing External Dependencies

Unit tests never call real external dependencies. Replace them with test doubles — use the simplest one that works:

| Double | Use When |
|--------|---------|
| **Stub** | You need the dependency to return controlled values — no behavior verification needed |
| **Fake** | A lightweight working implementation is more credible (e.g. in-memory store) |
| **Mock** | The interaction itself is the contract — use sparingly |

Prefer stubs and fakes. Mocks that verify call order or argument details create fragile tests.

Per platform:
- **Backend/Lambda:** use `moto` (Python) or `aws-sdk-client-mock` (TypeScript) for AWS services
- **Mobile:** inject repository/service interfaces and stub them; test business logic independently of UI
- **Firmware:** inject HAL interfaces and stub them; never call real GPIO or UART in unit tests

### Integration Tests: The Undervalued Layer

Integration tests verify that two real things work together — a Lambda handler + the DynamoDB client, a firmware module + the HAL. They catch the bugs that unit test mocks hide: schema mismatches, marshaling errors, contract drift.

Write an integration test when:
- Two real components meet at a boundary
- You need to verify configuration (IAM policy, schema mapping, message format)
- A stub or fake would not credibly represent the real dependency's behavior

### Test Pyramid

```
        /\
       /E2E\         few — critical user journeys only (3-5 per repo)
      /------\
     /  Integ  \     moderate — service boundaries and contracts
    /------------\
   /     Unit     \  most — logic, fast, isolated
  /________________\
```

Most teams have this inverted — too many E2E tests, not enough unit tests. E2E tests are slow, expensive to maintain, and notoriously flaky. Every time you want to add one to cover a logic case, write a unit test instead. Reserve E2E for the 3-5 flows that, if broken, mean the product is down.

---

## Pillar 1 — `/e2e-init` & Repo Testing Plan

### `/e2e-init` — One-Time Repo Setup *(Phase 1)*

`/e2e-init` is a user-invoked skill (`~/.claude/skills/e2e-init.md`) that initializes the testing backbone for a repo. It is the testing equivalent of `/init` — meant to be run once when a repo is first being set up for development. Re-running it behaves like re-running `/init`: it reads the existing documents and updates them rather than starting from scratch. The full skill prompt spec and re-run merge strategy live in `~/.claude/skills/e2e-init.md`.

The primary purpose of `/e2e-init` is to **bootstrap TDD for repos that currently have no formal testing infrastructure**. Many repos have zero tests. This skill sets up the foundation so that: Claude has a feedback loop (write tests → implement to pass → validate), the team has a starting point for TDD going forward, and AI-assisted development cycles have a real validation mechanism.

The skill does a deep read of the repo — code, call graph, system boundaries, project type — and produces:

1. **Repo Testing Plan** (`.claude/testing-plan.md`) — the lightweight foundation that guides all ongoing testing decisions; consulted by the Test Strategy Agent on every plan
2. **`scripts/run-tests.sh`** — the initial test runner script wired to the pre-commit hook

This is a **discovery, planning, and scaffolding tool**. It establishes unit and integration test infrastructure. E2E infrastructure (Detox, HIL) is out of scope for this skill and this plan — see the E2E note in this section.

### The Repo Testing Plan *(Phase 1 output / Phase 2 input)*

The repo testing plan is what Phase 2 (per-plan validation) reads as its context. It answers:
- What project type(s) does this repo contain?
- What test frameworks are in use and how do you run them?
- What is the expected coverage scope for this repo?
- What does the pre-commit hook run?

Claude should be *aware* that tests exist in a repo, not intimately familiar with what each test does before writing new tests. In TDD, tests are written from the spec — not derived from reading existing implementation. The test-builder reads existing tests only to extract conventions (naming, structure, assertion style), not to reverse-engineer expectations from code. Detailed test discovery (what tests exist, what each does) belongs in the Codebase Knowledge System (Plan 01 / Plan 05), not here.

### Repo Testing Plan Template

```markdown
## Repo Testing Plan

### Project Type
[Backend / UI/Client / Hardware / Mixed]

### Test Frameworks
- [framework name, version, config file location]
- How to run: [command]

### Coverage Scope
[What level of coverage is expected — e.g. "all business logic, not framework wiring"]

### Service Boundaries
- Services: [list each service/module that can be tested independently]
- Detection:
    src/auth/ → auth-handler
    src/notifications/ → notification-handler
    src/utils/ → ALL (shared — triggers full suite)
- Full suite trigger: [directories or file patterns that affect multiple services, e.g. src/utils/, src/models/]

### Pre-Commit Hook
- Script: scripts/run-tests.sh
- Scope: [change-aware / always full suite / other]

### Log Map
| System | Log Location | What's Logged | Log Level |
|--------|-------------|---------------|-----------|
| [service] | [location] | [what] | [ERROR/INFO/etc] |
```

### E2E Infrastructure: Out of Scope

E2E infrastructure (Detox for mobile, HIL for firmware, trigger-based backend E2E) is explicitly deferred from this plan. The immediate value of `/e2e-init` is unit and integration test scaffolding — giving repos a TDD foundation where none exists. E2E build-out belongs in a follow-on plan once the TDD baseline is established.

---

## Pillar 2 — Pipeline as a Rigid Gatekeeper

### Core Principle

The pipeline is a quality gate, not an obstacle. Code must conform to the pipeline. The pipeline does not change to make code pass.

**Exceptions — pipeline changes are legitimate when:**
- A new repo has no pipeline at all
- A new feature category genuinely requires a new pipeline stage
- A pipeline improvement is identified proactively as its own tracked work item

Pipeline changes are always **separate work items**, never bundled into a feature task to make it pass.

### Pipeline Knowledge in Planning Context

Pipeline documentation is established during repo setup and lives alongside the repo testing plan. Before planning any work on a repo, Claude should know:

- What CI/CD system is in use (GitHub Actions, Bitbucket Pipelines, etc.)
- What stages run (lint, test, build, deploy)
- What gates block a merge/deploy
- What environments exist (dev, staging, prod) and how deploys flow between them
- Any known fragility or manual steps

This context feeds directly into the Test Strategy Agent's pipeline check question: "will this plan pass the current pipeline?"

### Pipeline Audit (Repo Onboarding)

When starting work in a repo for the first time, or when `/e2e-init` is run on an existing repo that has never had an audit:

1. Find and read all CI/CD config files
2. Document current state: what exists, what's missing, what's fragile
3. Record in the repo testing plan
4. Flag gaps as potential future work items — not blocking unless critical

The audit is documentation, not remediation. Pipeline improvements become separate tracked tasks. For repos already in active use, the audit is triggered by the first run of `/e2e-init` — it does not need to be done separately.

### Pipeline Improvement Protocol

When a gap or improvement is identified:
- Flag it explicitly as a pipeline improvement opportunity
- Do not fix it in the same task as feature work
- Create a separate task/ticket for it

---

## Pillar 3 — Test Strategy Agent

### Concept

A dedicated subagent (`subagent_type: test-strategy`) invoked after the architect review, before `ExitPlanMode`. It reads the plan's *intended behavior* — what inputs are expected, what outputs or side effects should result — and defines validation criteria from the spec before any implementation begins.

**Critical principle: tests define the contract; implementation is designed to satisfy the tests (TDD).**

The agent operates from the spec and requirements, not from existing code. It defines what correct looks like — the expected inputs, outputs, and side effects — before the implementation is written. This is the red phase of the red-green-refactor cycle: specifying what the tests must assert before implementation begins. It does not read implementation source. Code is written to pass the tests; tests are not written to match existing code.

Its output is a **Testing section** appended to the plan doc. For larger changes this means specific test cases and verification steps. For small changes the output may simply be "existing tests cover this" — the thinking still happens, but new tests are not always required. The agent should prioritize using existing test when possible. The agent should only ever update existing test if absolutely necessary

### Testing gate — what kinds of tests are actually needed

The test-strategy agent's first job is to determine which test types genuinely apply to the plan's scope. The same principle applies across every test type: **the goal is meaningful confidence, not exhaustive coverage**. A test gives a reviewer genuine assurance that something works correctly — it is not a checklist item. A Testing section that says "existing tests cover this; no new tests required" is a valid and complete output.

The agent reasons through each test type independently. A plan may warrant unit tests but not integration tests. It may require manual verification but nothing automated. The agent should not include a section because it exists on the template — only because the change's nature makes that type of test meaningful.

**Per test type — when it adds genuine confidence:**

| Test type | Include when… | Skip when… |
|-----------|--------------|------------|
| **Unit tests** | New logic with conditions, branching, calculations, or data transformation — something with behavior to verify in isolation | Config-only changes, pure wiring, delegation without logic, single-line fixes |
| **Integration tests** | The change crosses a service boundary (handler + DB, module + external API, infrastructure + runtime), or a mock would hide a real schema/contract problem | Unit tests already cover the behavior and no real boundary is crossed |
| **E2E tests** | A critical user journey is affected — one where if it breaks, the product is meaningfully down. Reserve for 3–5 per repo maximum | Individual features, edge cases, anything unit or integration tests can cover |
| **Manual verification** | Automated tests can't reach the thing being verified (AWS console state, device output, visual rendering, hardware behavior) | Any behavior that can be asserted programmatically |
| **Pipeline requirements** | The change could affect pipeline pass/fail thresholds, or specific gate checks must be called out for reviewers | Pipeline is unaffected and checks are already implicit |
| **Log monitoring notes** | The change involves production-bound logic where specific failure modes should be observed during rollout | Internal-only changes, test/dev-only paths |

When the agent determines a section is not applicable, it omits that section entirely — it does not include a header with "N/A." A Testing section that covers only the types that matter is correct. The agent documents its reasoning in one sentence per omitted type only if the decision is non-obvious.

### Invocation

| Trigger | Action |
|---------|--------|
| Architect review complete, before ExitPlanMode | Invoke Test Strategy Agent with the plan doc path |
| Agent returns testing section | Caller appends the section to the plan doc, then calls ExitPlanMode |

The sequence is: **draft plan → architect review → test strategy review → ExitPlanMode**.

**Invocation example:**
```
Agent { subagent_type: "test-strategy", prompt: "Review this plan and produce a Testing section. Plan doc: plans/CLAUDE-N-description.md" }
```

The agent reads the plan's stated intent and the repo testing plan. If existing test files are present, it may optionally scan them to extract conventions (naming patterns, assertion style, file structure) and include a **Test Conventions** note in the Testing section — giving the test-builder a head start without requiring it to do its own discovery. The full agent prompt spec lives in `~/.claude/agents/test-strategy.md`.

### Fallback: No Repo Testing Plan

If `.claude/testing-plan.md` does not exist — for example, a standalone script or a new repo where `/e2e-init` has not been run — the agent operates in **lightweight validation mode**. The core job does not change: define what correct looks like from the outside. What changes is the infrastructure available to verify it.

In lightweight mode the agent:
- Skips the pipeline check (no pipeline configured)
- Skips formal test framework references
- Focuses on: what does working look like? what does broken look like? how do you verify each with the simplest possible check?
- Uses Manual Verification Steps as the primary output
- Flags "this would benefit from formal test infrastructure if the codebase grows" only if the complexity warrants it — does not require it

A standalone script still gets a useful Testing section: "run with input X, expect output Y; run with bad input, expect error Z." That is actionable validation without any test framework.

### Agent Responsibilities

- Read the plan's stated intent: what inputs, what expected outputs, what side effects
- Consult the repo testing plan if it exists; fall back to lightweight validation mode if it does not
- Define pass/fail criteria from the outside — not based on implementation internals
- Specify test types needed: unit, integration, E2E, manual verification (or manual-only in lightweight mode)
- For each scenario, explicitly direct whether to **reuse an existing test**, **update an existing test** (when the work changes something that test already covers), or **write a new test**. To make this determination for changed features, the agent may read existing test files to understand what coverage already exists — it is looking for *what the tests exercise and what they expect*, not how the feature was implemented. Example: if a button linking test exists and the plan adds a conditional to that link, the agent reads the existing test to understand its scope, then directs the test-builder to extend it for the new condition rather than write a duplicate.
- Flag anything that cannot be automatically tested and requires manual steps
- Check: will this pass the current pipeline? (skip if no pipeline configured)
- Output concrete, behavior-based criteria — or "existing tests cover this" for small changes
- **Optionally:** scan existing test files to extract conventions (naming, structure, assertion style) and include a Test Conventions note in the Testing section for the test-builder to consume

### Testing Section Format (Output)

Only include sections that apply to the change. Omit sections entirely when they don't add confidence — do not include them with "N/A."

**Full template (include only applicable sections):**

```markdown
## Testing Plan

### Unit Tests
- [ ] [specific test: what input, what expected output or side effect]

### Integration Tests
- [ ] [specific test: what service boundary, what to verify across it]

### E2E Tests
- [ ] [specific critical user journey — only 3–5 per repo total]

### Manual Verification Steps
- [ ] [step-by-step what to check — AWS console / device / app / hardware]

### Pipeline Requirements
- Required to pass: [specific gates from testing-plan.md]
- Tests needed to satisfy pipeline: [specific test descriptions]

### Log Monitoring Notes
*Passed back to main context for plan inclusion — not an implementation spec.*
- [Specific failure modes or state transitions worth observing during rollout]

### Test Conventions *(include only if test-builder needs guidance)*
- Test file naming: [e.g. `test_<module>.py` / `<module>.test.ts`]
- Assertion style: [e.g. `pytest` / `jest expect`]
- Test structure: [e.g. `describe/it` / class-based / flat]
- How to run: [command from testing-plan.md]
```

**Minimal output (small changes or no new tests needed):**

```markdown
## Testing Plan

Existing tests cover this change — no new tests required. [Name specific test files or describe what covers it.]
```

**Minimal output format** (small changes or lightweight validation mode):

```markdown
## Testing Plan

*Existing tests cover this change. No new tests required.*

### Manual Verification Steps
- [ ] [how to confirm the change works as intended]

### Log Monitoring Notes
- [error conditions worth logging during development — or "none identified" if N/A]
```

---

## Pillar 3b — Test Builder Agent

### Concept

A dedicated subagent (`subagent_type: test-builder`) invoked when plan execution begins — **before** the main implementation work. Its job is to take the Testing section produced by the Test Strategy Agent and write the failing tests that define the contract for the implementation. This is the red step in red-green-refactor: tests are written first, they fail because no implementation exists yet, and the implementation is then written to make them pass.

The test-builder works from the Testing section spec and the testing plan. It does not read implementation code — the spec is the authoritative source. Tests are grounded in requirements and expected behavior, not in how existing code happens to work. Additional context is optional and should only be used when it would meaningfully improve the output.

**Required inputs:**
- The Testing section from the plan doc (its specification — including Test Conventions if test-strategy populated them)
- `.claude/testing-plan.md` (framework, runner commands, service boundaries)

**Optional inputs:**
- Existing test files — only if the Testing section does not already include conventions; used solely to understand naming, structure, and assertion style
- codebase-memory-mcp (`search_graph`, `get_code_snippet`) — if the project is indexed, may be consulted for function signatures: symbol names, parameter types, and return types. This is sufficient context to construct correct test inputs and verify expected outputs. The graph contains no implementation logic — only public interface shape.

This isolation is intentional. Tests written independently of the implementation are more likely to verify observable behavior rather than implementation internals.

### When Invoked

| Trigger | Action |
|---------|--------|
| Plan approved, execution begins | **Main context** (following `workflow-phases.md` execution step) invokes `test-builder` **before** implementation work begins |
| test-builder completes | It writes test files directly to disk; notifies main context with a status-only summary (scenario names covered, files written) — not the test code |
| Implementation begins | Implementation is written to make the failing tests pass (green phase) |

The test-builder writes tests first — they fail because no implementation exists yet. This is the red step in red-green-refactor. Implementation then begins with the goal of making those tests pass.

**Why the main context does not receive test code:** if the implementation context has full visibility into the tests, it risks conforming to implementation details rather than to the intended contract. The main context only learns *that* tests exist and *which scenarios* they cover — not how they are written. This keeps the implementation honest to the spec.

### What It Reads

**Always:**
- **Plan doc Testing section** — the spec: scenarios, pass/fail criteria, and Test Conventions if populated by test-strategy
- **`.claude/testing-plan.md`** — framework, runner commands, service boundaries

**Optionally (only if needed):**
- **Existing test files** — for naming/structure/assertion conventions, only when the Testing section does not already supply them
- **codebase-memory-mcp** (`search_graph`, `get_code_snippet`) — for function signatures (symbol names, parameter types, return types); sufficient to write correct test inputs and verify expected outputs; contains no implementation logic

**Never reads:** implementation source files, design documents, or any non-test code.

### What It Produces

- Runnable test code matching the scenarios defined in the Testing section
- Follows existing repo conventions (naming, structure, assertion style)
- Each test is traceable to a specific checklist item from the Testing section

### Constraints

- Black-box only — specification is the Testing section checklist, not implementation internals
- Follows the test strategy's direction on whether to reuse existing tests or write new ones
- Follows the test strategy's explicit direction on which existing tests to reuse, update, or replace — test-builder acts on those directives, not on its own read of implementation changes
- If a scenario is not testable with the available framework, flags it as a gap rather than approximating

### Output

Writes test files directly to disk. Returns a **status summary only** to the main context:
- Which scenarios from the Testing section were covered
- Which files were written
- Any gaps flagged (scenarios that could not be implemented with available infrastructure)

The main context does not receive test code. This keeps the TDD contract intact — implementation is driven by the spec and the failing tests' pass/fail signal, not by reading what the tests assert internally.

---

## Pillar 3c — Test Runner Agent *(Per-Task, Phase 2)*

### Role in the TDD Cycle

The test runner is the closing step of each task's TDD loop: test-builder wrote the failing tests before implementation began, implementation made them pass, and test-runner verifies that claim. It runs after implementation is committed and before `verification-before-completion`.

Test-runner does not propose or suggest fixes under any circumstance. Its only job is to run the suite, classify the result, and block fixes behind `systematic-debugging` if anything fails.

### When It Runs

Invoked once per task by the main context (`executing-plans`) or the orchestrator (`subagent-driven-development`) — not by a leaf implementer subagent. The caller must have Skill tool access so the REQUIRED NEXT STEP block on failure is actionable.

If `testing-plan.md` does not exist, test-runner returns SETUP REQUIRED immediately and instructs the caller to run `e2e-init`.

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `plan_doc` | Yes | — | Path to the plan doc; read Testing section for expected scenarios |
| `testing_plan` | Yes | — | Path to `.claude/testing-plan.md` |
| `results_file` | No | `.claude/test-results.md` | Where to write the full run output |
| `defer_write` | No | `false` | Skip writing results to disk |

### Execution Flow

1. **Check for testing-plan.md** — if absent, return SETUP REQUIRED; stop.
2. **Read config** — extract run command, `flakiness_tolerance` (default 0), `setup_steps` (optional ordered list).
3. **Run setup steps** — if defined, run each in order. Any non-zero exit → ENVIRONMENT FAILURE; stop.
4. **Execute test command** — run via Bash; capture exit code, stdout/stderr, elapsed time.
5. **Classify result** — exit 0 → PASS; exit non-zero with test output present → TEST FAILURE; exit non-zero with no test output → BUILD FAILURE.
6. **Retry** — TEST FAILURE only: re-run up to `flakiness_tolerance` times. If any pass → PASS. BUILD/ENVIRONMENT failures are deterministic; never retry them.
7. **Write results** — overwrite `.claude/test-results.md` with full output. Never accumulate files.
8. **Return summary** — structured output to caller.

### Result Classification

| Result | Condition |
|--------|-----------|
| **PASS** | Exit code 0 |
| **TEST FAILURE** | Exit non-zero AND test output present (some tests ran and failed) |
| **BUILD FAILURE** | Exit non-zero AND no test output (compile/parse/import error before tests ran) |
| **ENVIRONMENT FAILURE** | A setup step exited non-zero before the test command ran |
| **SETUP REQUIRED** | `.claude/testing-plan.md` not found |

### On Failure: The Mandatory Gate

When any FAILURE result is returned, test-runner emits:

```
⚠️ REQUIRED NEXT STEP — DO NOT PROPOSE FIXES YET
Invoke systematic-debugging before any fix is attempted:
  Skill { skill: "systematic-debugging" }

No fix attempt is permitted until systematic-debugging has completed Phase 1
(root cause investigation).
```

This gate is enforced by `CLAUDE.md` (global): "When test-runner returns a FAILURE result, invoke `systematic-debugging` before any fix attempt."

**Failure type guidance for systematic-debugging:**
- ENVIRONMENT FAILURE → investigate setup steps and environment configuration first
- BUILD FAILURE → investigate compilation errors before test logic
- TEST FAILURE → start with the failed test names and first-line error messages

### Integration Points

| Component | Relationship |
|-----------|-------------|
| `executing-plans` | Invokes test-runner once per task after implementation commit |
| `subagent-driven-development` | Orchestrator invokes test-runner per task; leaf subagents never invoke it |
| `test-builder` | Wrote the tests test-runner now executes; test-runner never reads implementation source |
| `systematic-debugging` | Mandatory next step on any FAILURE result |
| `verification-before-completion` | Runs after test-runner returns PASS |
| `e2e-init` | Must be run first to create `.claude/testing-plan.md` that test-runner reads |

---

## Pillar 4 — Pre-Commit Quality Gates

### Intent

Before code reaches the build pipeline, a local quality check runs automatically. The purpose is to catch obvious issues early — not to be a blocker, but to avoid wasting CI pipeline time on failures that could have been caught in seconds locally.

The flow is: **pre-commit gates → build pipeline → end-customer testing**.

### How It Works

A global pre-commit hook invokes `scripts/run-tests.sh` at the repo root. That script reads the Service Boundaries section of `.claude/testing-plan.md`, checks which files changed (`git diff --name-only HEAD`), maps them to services using the directory-to-service map, and runs the appropriate scope.

- **Targeted change (one service affected)** — run tests for that service only
- **Broad change (matches full suite trigger paths)** — run the full suite

Exit 0 = pass, commit proceeds. Non-zero = fail, commit blocked. Not bypassed with `--no-verify`.

If `scripts/run-tests.sh` does not exist in a repo, the hook skips silently with a warning — it does not fail. The `/e2e-init` skill generates the initial `scripts/run-tests.sh` as part of repo onboarding.

**Hook script skeleton** (`~/.claude/hooks/pre-commit`):
```bash
#!/bin/bash
SCRIPT="scripts/run-tests.sh"
if [ ! -f "$SCRIPT" ]; then
  echo "⚠️  No run-tests.sh found — skipping pre-commit tests" >&2
  exit 0
fi
bash "$SCRIPT"
```

**Per-repo script** (`scripts/run-tests.sh`) reads `.claude/testing-plan.md` to determine scope. The full implementation spec is generated by `/e2e-init` based on the repo's Service Boundaries configuration.

### What the Hook Checks

The pre-commit hook is not limited to tests. It can include:
- Unit test suite (scoped by service boundary)
- Lint / type checking (if the repo has it)
- Any other fast static checks configured in the repo

The repo testing plan specifies what the hook runs. Default is unit tests only; additional checks are opt-in per repo. Full suite always runs in CI regardless of what the pre-commit hook ran.

---

## Pillar 5 — Runtime Observability & Bug Triage

### Log Map (Per Repo)

The repo testing plan includes a log map. When Claude writes code that produces logs, the plan doc for that work should document what messages will be created, what level they use, and what they indicate.

Default log map structure:

| System | Log Location | What's Logged | Log Level |
|--------|-------------|---------------|-----------|
| Lambda functions | CloudWatch: `/aws/lambda/[function-name]` | invocations, errors, custom | ERROR, INFO |
| Mobile app | Sentry project: `[project-name]` | crashes, errors, custom events | varies |
| Firmware | TBD per device | TBD | TBD |

### Monitoring Cadence (Defined at Planning Time)

Cadence is defined in the Testing section of each plan doc, not applied uniformly:

| Scenario | Cadence |
|----------|---------|
| Active testing / manual verification | Live — monitor logs while tests run |
| Post-deploy (feature work) | Daily check for 2–3 days after deployment |
| Background services / scheduled jobs | Periodic check aligned with job frequency |
| Firmware updates | Device-specific — TBD per device |

Default: check logs after deployment, check again the next day. Anything else must be specified in the plan.

### Bug Triage Protocol

When errors or unexpected behavior is found in logs:

| Bug Size | Definition | Response |
|----------|-----------|----------|
| **S** | Single isolated error, clear cause, targeted fix | Pass directly back into the current conversation. Fix inline, no ticket. |
| **M** | Recurring error, multiple components affected, or requires investigation | Create a Jira Bug ticket linked to the relevant Epic or Task. |
| **L** | Systemic issue, multiple services affected, or potential data integrity concern | Create a Jira Bug ticket with high priority. Surface immediately to user. May block current work. |

**Tie-breaker rule:** When a bug's size is ambiguous, default to the larger classification. The cost of an extra ticket is lower than the risk of under-triaging.

**Note:** Automatic Jira ticket creation for M/L bugs depends on Plan 02 (Jira Integration). Until that is implemented, surface M/L bugs to the user for manual ticket creation.

S-sized bugs found during active testing are fixed in place without interrupting flow. M/L bugs get ticketed so there is a trail from observation to resolution.

---

## Cross-Plan Dependencies

| Plan | Relationship | Notes |
|------|-------------|-------|
| Plan 05 — Agent Architecture | Test Strategy Agent design and invocation | |
| Plan 01 — Infrastructure as Code; Plan 05 — Agent Architecture | Test discovery / codebase knowledge | |
| Plan 01 — Infrastructure as Code; Plan 04 — Git Workflow | Pipeline knowledge and documentation | |
| Plan 02 — Jira Integration | Bug triage → Jira ticket creation | |
| Plan 04 — Git Workflow | Pre-commit hooks | |
| Plan 01 — Infrastructure as Code | Repo onboarding (testing plan, pipeline audit) | |

**Invocation sequence:** architect review runs first (conditional approval gate), then the Test Strategy Agent, then `ExitPlanMode`. This is canonical — see Pillar 3 Invocation table. The Test Builder Agent (Pillar 3b) runs at the start of execution, before implementation begins — it writes the failing tests that implementation must satisfy. It is not part of the planning sequence.

---

## Deliverables

| # | Deliverable | Location | Notes |
|---|-------------|----------|-------|
| 1 | `/e2e-init` skill | `~/.claude/skills/e2e-init.md` | Pillar 1 |
| 2 | Repo Testing Plan template | `.claude/testing-plan.md` (per repo) | Pillar 1 |
| 3 | Pipeline audit protocol | Documented in this plan (Pillar 2) | Pillar 2 |
| 4 | Test Strategy Agent | `~/.claude/agents/test-strategy.md` | Pillar 3 |
| 5 | Testing section format | Documented in this plan (Pillar 3) | Pillar 3 |
| 6 | Test Builder Agent | `~/.claude/agents/test-builder.md` | Pillar 3b |
| 7 | Test Runner Agent | `~/.claude/agents/test-runner.md` | Pillar 3c |
| 8 | Pre-commit hook (global) | `~/.claude/hooks/pre-commit` | Pillar 4 |
| 9 | Pre-commit script (per repo) | `scripts/run-tests.sh` | Pillar 4 |
| 10 | Bug triage protocol | Documented in this plan (Pillar 5) | Pillar 5 |
