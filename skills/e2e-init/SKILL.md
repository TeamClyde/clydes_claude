---
name: e2e-init
description: >
  Use when a repo's test suite needs to be established or audited — inventorying
  existing tests, identifying coverage gaps, setting up missing infrastructure,
  adding dummy or fixture data, or surfacing failing tests. Useful for first-time
  setup and for expanding an existing suite. Run after /infra-init, before
  writing any new code.
argument-hint: "optional"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# e2e-init — Testing Backbone Setup

Initialize the testing backbone for a repo. Produce `.claude/testing-plan.md`,
`plans/e2e-plan.md`, and `scripts/run-tests.sh`. Re-runnable: re-running diffs
and updates existing documents rather than overwriting them unconditionally.

---

## Re-run Check (Do This First)

Before doing anything else, check whether `.claude/testing-plan.md` already
exists.

- **Exists** — this is a re-run. Read the existing document. Keep its content
  in memory throughout the steps below. At Step 6, generate a diff of proposed
  changes to both output files and show it to the user. Do NOT write either
  file until the user explicitly confirms.
- **Does not exist** — this is a first run. Proceed through all steps and write
  both output files at Step 6 without requiring additional confirmation (the
  user invoked the skill intentionally).

Also check whether `.claude/integration-test-constraints.md` exists. If it does,
**do NOT overwrite or diff it** on re-run — constraints accumulate over time and
are not regenerated. Only create it on first run.

---

## Step 1 — Repo Orientation

Read in this order. Stop reading each item once you have the information you
need — do not read speculatively.

1. `.claude-init/CODEBASE.md` if it exists — repo type, entry points, key
   modules produced by `/infra-init`. If present, this is the primary source
   for repo structure; use it instead of globbing source directories.
2. Test directories and test runner config files (directory names and config
   files only — do not read individual test file implementations):
   - Common test dirs: `tests/`, `test/`, `__tests__/`, `spec/`, `src/**/__tests__/`
   - Config files: `jest.config.*`, `pytest.ini`, `setup.cfg`, `pyproject.toml`,
     `.mocharc.*`, `karma.conf.*`, `vitest.config.*`, `cypress.config.*`,
     `detox.config.*`, `.eslintrc.*`, `tsconfig.json`
3. CI/CD pipeline configs:
   - `.github/workflows/*.yml`
   - `buildspec.yml`
   - `Jenkinsfile`
   - `bitbucket-pipelines.yml`
   - `azure-pipelines.yml`
   - `.circleci/config.yml`
4. Package manifests for test framework identification:
   - `package.json` (devDependencies — look for jest, vitest, mocha, cypress,
     playwright, detox, eslint, etc.)
   - `requirements*.txt`, `Pipfile`, `pyproject.toml` (look for pytest, moto,
     unittest, coverage, etc.)
   - `Gemfile`, `go.mod`, `Cargo.toml` as applicable

---

## Step 2 — Project Type Classification

Classify the repo as one of the following types using the signals from Step 1.
A repo may qualify as Mixed if it spans more than one type.

| Type | Classification Signals |
|------|------------------------|
| **Backend** | Lambda handlers, API server entry points, data pipeline scripts, scheduled jobs; no UI framework; AWS/GCP/Azure SDK in dependencies |
| **UI/Client** | React, Vue, Angular, React Native, Flutter, Swift, Kotlin, or other UI framework; Detox, Playwright, Cypress in devDependencies |
| **Firmware** | Embedded toolchain (CMake, Make, PlatformIO); HAL references; no npm/pip; C/C++/Rust for microcontrollers |
| **Mixed** | Signals from two or more types present in the same repo (e.g. a monorepo with a React frontend and a Lambda backend) |

For Mixed repos, identify which type each top-level directory or package
belongs to and handle each section separately throughout the remaining steps.

---

## Step 3 — Test Inventory

Read directory names and test runner configs only — do not read individual test
file contents.

Produce:

1. **Existing test files** — list by directory; note apparent layer (unit,
   integration, E2E) based on directory name, file name patterns, or runner
   config.
2. **Frameworks in use** — name, version (from manifest), config file location,
   run command.
3. **Coverage gaps** — compare source directories to test directories. Identify
   source directories that have no corresponding test directory or test file
   pattern. Note which source directories are covered and which are not.
4. **CI gate status** — does CI run tests? Does test failure block a merge or
   deploy? Note which pipeline stages gate merge.

---

## Step 4 — Service Boundary Mapping

Map source directories to logical services. This mapping drives the pre-commit
hook's change-scoped test execution.

Output a table:

| Directory | Service Name | Test Scope |
|-----------|-------------|------------|
| `src/auth/` | auth-handler | unit + integration |
| `src/notifications/` | notification-handler | unit |
| `src/utils/` | ALL | full suite trigger |

**Full suite trigger paths** — shared utilities, models, config, and other
cross-cutting directories that affect multiple services. A change to any file
in these paths triggers the full test suite rather than a single-service scope.

Identify full suite trigger paths by looking for directories named:
`utils`, `common`, `shared`, `lib`, `models`, `types`, `config`, `core`,
`helpers`, or equivalent. If uncertain, bias toward marking as full suite
trigger — a false positive here is a slower commit, not a missed bug.

---

## Step 5 — Pre-Commit Hook Check

Check whether `scripts/run-tests.sh` exists at the repo root.

**If it exists:** Do not overwrite it. Note its existence in the output
documents. Skip the rest of this step.

**If it does not exist:** Generate it as described below. Do not install or
configure any tooling — only write the shell script.

---

### Firmware short-circuit (project type = Firmware)

**When the project type classified in Step 2 is Firmware, do NOT emit the
service-boundary host-runner template below.** There is no host test runner
for embedded firmware. Instead, do both of the following:

**A — Record a HIL test-plan note in `plans/e2e-plan.md`**

In the `## E2E Approach` section of `plans/e2e-plan.md`, write the Firmware
entry (per the existing template guidance):

```
- **Firmware:** HIL test sequences or simulation environment; scripted, not
  manual. No host test runner is available for this repo. Define scripted HIL
  or simulation sequences here. See `scripts/run-tests.sh` for the
  static-analysis-only backbone that runs on the host.
```

**B — Emit a static-analysis-only `scripts/run-tests.sh`**

The generated script must NOT pretend to run firmware unit tests on the host.
It must run available static-analysis tools (cppcheck, clang-tidy) **only if
they are present on PATH** and exit 0 with a clear message when they are not
— so a pre-commit hook using it never hard-fails a firmware repo on a machine
that does not have those tools installed.

Template for the Firmware static-analysis backbone:

```bash
#!/bin/bash
# scripts/run-tests.sh
# Generated by /e2e-init — Firmware static-analysis backbone.
# No host test runner is available for this embedded firmware repo.
# For HIL / simulation test sequences, see plans/e2e-plan.md.
# Usage: bash scripts/run-tests.sh

set -uo pipefail

SA_RAN=false

if command -v cppcheck &>/dev/null; then
  echo "Running cppcheck..."
  cppcheck --error-exitcode=1 --quiet . && echo "cppcheck: OK"
  SA_RAN=true
fi

if command -v clang-tidy &>/dev/null; then
  echo "Running clang-tidy (dry-run check)..."
  # REPLACE: adjust file glob and compile-commands path for this repo
  find . -name '*.c' -o -name '*.cpp' | head -50 | xargs clang-tidy --quiet
  SA_RAN=true
fi

if [ "$SA_RAN" = false ]; then
  echo "No host test runner for firmware — see plans/e2e-plan.md HIL plan."
  echo "(Install cppcheck or clang-tidy to enable static-analysis checks here.)"
  exit 0
fi
```

After writing this template, replace the placeholder comments with any
repo-specific adjustments derived from Step 3 (e.g. actual source directory,
compile-commands path if a `compile_commands.json` is present).

**After completing the Firmware branch, skip the rest of Step 5.** The
service-boundary host-runner template below does not apply to Firmware repos.

---

### Non-Firmware repos — host-runner template

The generated script must:

- Read the Service Boundaries section of `.claude/testing-plan.md` to get the
  directory-to-service map and full suite trigger paths
- Get the list of changed files: `git diff --name-only HEAD`
- Map changed files to services using the directory-to-service table
- If any changed file matches a full suite trigger path: run the full test suite
- Otherwise: run tests scoped to the affected service(s) only
- Run lint / type checking if the repo has it configured
- Support a `--fast` flag: when passed, skip integration tests and run unit
  tests only (useful for rapid iteration)
- Exit 0 on pass; exit non-zero on any failure

Template for the generated script:

```bash
#!/bin/bash
# scripts/run-tests.sh
# Generated by /e2e-init. Edit service boundary logic to match your repo.
# Usage: bash scripts/run-tests.sh [--fast]

set -euo pipefail

FAST=false
for arg in "$@"; do
  [ "$arg" = "--fast" ] && FAST=true
done

TESTING_PLAN=".claude/testing-plan.md"
if [ ! -f "$TESTING_PLAN" ]; then
  echo "ERROR: $TESTING_PLAN not found. Run /e2e-init to generate it." >&2
  exit 1
fi

# Determine changed files
CHANGED=$(git diff --name-only HEAD 2>/dev/null || git diff --name-only)

# ---- Service boundary logic (generated from Step 4 output) ----
# Full suite trigger paths — edit this list to match your repo
FULL_SUITE_TRIGGERS=(
  "src/utils/"
  "src/common/"
  "src/models/"
  # ADD: additional full-suite trigger paths identified in Step 4
)

run_full_suite() {
  echo "Running full test suite..."
  # REPLACE: insert the full suite run command for this repo
  # Example: pytest tests/ || npm test
}

run_service_tests() {
  local service="$1"
  echo "Running tests for service: $service"
  # REPLACE: insert per-service test run command
  # Example: pytest "tests/$service/" || npm test --testPathPattern="$service"
}

# Check for full suite triggers
for trigger in "${FULL_SUITE_TRIGGERS[@]}"; do
  if echo "$CHANGED" | grep -q "^$trigger"; then
    run_full_suite
    exit $?
  fi
done

# ---- Per-service scoped run ----
# ADD: service detection blocks generated from Step 4 service boundary table
# Example:
#   if echo "$CHANGED" | grep -q "^src/auth/"; then run_service_tests "auth"; fi
#   if echo "$CHANGED" | grep -q "^src/notifications/"; then run_service_tests "notifications"; fi

echo "No matching service boundaries found for changed files — running full suite as fallback."
run_full_suite
```

After writing the template, replace the placeholder comments with the actual
service detection blocks and run commands derived from Step 4 and the
frameworks identified in Step 3.

---

## Step 6 — Write Output Documents

Write the following two files. On a re-run, diff first and wait for user
confirmation before writing (see Re-run Check at the top).

---

### Output 1: `.claude/testing-plan.md`

```markdown
## Repo Testing Plan
Generated: [YYYY-MM-DD]

## Project Type
[Backend / UI/Client / Firmware / Mixed]

Classification signals:
- [signal 1 — e.g. "Lambda handlers in src/handlers/"]
- [signal 2 — e.g. "jest + @testing-library/react in devDependencies"]

## Test Frameworks

| Layer | Framework | Version | Config File | Run Command |
|-------|-----------|---------|-------------|-------------|
| Unit | [name] | [version] | [config file path] | [command] |
| Integration | [name or "none"] | | | |
| E2E | [name or "none"] | | | |

## Coverage Scope
[What is tested — e.g. "all business logic in src/; framework wiring explicitly excluded"]
[What is explicitly skipped and why — e.g. "auto-generated API client skipped; third-party code"]

## Service Boundaries

| Directory | Service Name | Test Scope |
|-----------|-------------|------------|
| [dir] | [service] | [unit / unit+integration / full suite trigger] |

Full suite trigger paths: [list directories that trigger full suite on change]

## Pre-Commit Hook
- Script: `scripts/run-tests.sh`
- Scope: change-aware (targets affected services) / full suite (if trigger path changed)
- Fast mode: `bash scripts/run-tests.sh --fast` — skips integration tests, runs unit only
- Status: [generated by /e2e-init / pre-existing — not modified]

## CI Pipeline
- System: [GitHub Actions / Bitbucket Pipelines / Jenkins / CodeBuild / none detected]
- Stages: [list — e.g. lint → test → build → deploy]
- Merge gate: [what blocks a merge — e.g. "test stage must pass; lint is advisory"]
- Fragility notes: [known flaky tests, manual steps, environment dependencies — or "none identified"]

## Test Runner Config
- flakiness_tolerance: 0
- recording: false
- setup_steps:
  - # Add shell commands to run before the test suite (e.g. emulator launch, DB seed)
  - # Remove this section if no setup is needed

`flakiness_tolerance`: integer — additional retries after the first run before declaring TEST FAILURE (default: 0).
`recording`: Boolean — enable video/screenshot capture during test run (default: false; v1 field reserved, not yet implemented).
`setup_steps`: ordered list of shell commands run before the test suite; first non-zero exit triggers ENVIRONMENT FAILURE.
All three fields are optional. Remove unused fields or leave at defaults.

## E2E Plan
See `plans/e2e-plan.md` for E2E scenario inventory, known gaps, and instrumentation notes.
[If no e2e-plan.md yet: "PLANNED GAP — run /e2e-init to generate"]

## Log Map

| Service | Log Location | What's Logged | Level |
|---------|-------------|---------------|-------|
| [service name] | [CloudWatch group / file path / Sentry project] | [invocations, errors, custom events] | [ERROR / INFO / DEBUG] |
```

---

### Output 2: `plans/e2e-plan.md`

```markdown
# E2E Plan — [Repo Name]
Generated: [YYYY-MM-DD]

## E2E Approach
[Which invocation pattern applies — e.g.:]
- **Backend:** invoke Lambda/API endpoint with a real or test-account payload;
  verify side effects in DynamoDB, SQS, SES, or other downstream systems.
- **UI/Client:** Playwright or Detox full user flows against a running app instance.
- **Firmware:** HIL test sequences or simulation environment; scripted, not manual.
- **Mixed:** one sub-section per type.

[Tooling chosen or recommended, and why.]

## Existing E2E Tests
[List existing E2E test files, their framework, and the run command — or "none".]

## Known Gaps
[Highest-value scenarios not yet covered by E2E tests. Be specific: name the
user journey or system flow, not just "more coverage needed".]

- [ ] [Scenario 1 — e.g. "user signup → email verification → first login"]
- [ ] [Scenario 2 — e.g. "payment failure → retry → success confirmation"]

## Instrumentation
Current observability state:

| What | Monitored? | Where |
|------|-----------|-------|
| [e.g. Lambda errors] | Yes / No | [CloudWatch group or "not configured"] |
| [e.g. App crashes] | Yes / No | [Sentry project or "not configured"] |
| [e.g. DB query latency] | Yes / No | [metric source or "not configured"] |

What is NOT monitored that should be: [list gaps — or "none identified"]

## First E2E Test to Write
The single highest-value E2E test to add next:

**Scenario:** [name the user journey or trigger]
**Inputs:** [specific inputs — payload, user state, environment conditions]
**Expected outputs / side effects:** [what must be true after the test runs —
  response code, DB record, message on queue, email sent, UI state, etc.]
**Why this one first:** [1 sentence — why this scenario has the highest risk
  if it breaks undetected]
```

---

### Output 3: `.claude/integration-test-constraints.md`

Only written on first run (when the file does not already exist). Never overwritten on re-run.

Use Glob and Grep to discover static constraints from the codebase before writing. Look for:
- Singleton patterns (top-level instances of routers, stores, or service objects that persist across tests)
- Permission types declared in manifests or config files that reset on reinstall/relaunch
- Framework-specific test isolation requirements (e.g. shared state that must be reset in setUp)
- Known silent failure modes in the test framework version in use

```markdown
# Integration Test Constraints
Generated: [YYYY-MM-DD]

## Statically Discoverable Constraints
Populated by e2e-init from code analysis. Update when project type or framework version changes.

- [constraint — cite file path and line where discovered, e.g. "router at routes.dart:64 is a
  top-level singleton — call router.go('/') in every setUp to reset navigation state"]
- [or "none discovered" if no patterns found]

## Runtime-Discovered Constraints
Appended by the main context after systematic-debugging confirms a root cause during test
execution. Never appended automatically — requires human confirmation.

Format per entry: `[YYYY-MM-DD] [constraint description] — discovered via [failure type]`

<!-- Mark stale entries with [STALE - reason] rather than deleting them -->
```

---

## Post-Completion

After both output files are written:

1. **Update `CLAUDE.md`** — add or update a Testing section at the project
   root `CLAUDE.md` with:
   - Test frameworks in use and their run commands
   - Path to `scripts/run-tests.sh`
   - Path to `.claude/testing-plan.md`
   - Date generated

2. **Prompt the user to review** — output this message verbatim after the
   update:

   > Review `.claude/testing-plan.md` — does this match your understanding of
   > the repo's test coverage and service boundaries? Correct anything before
   > we begin writing new code.

---

## Constraints

- Does NOT write any test files. Test file authorship belongs to the
  test-builder agent.
- Does NOT install test tooling or run package managers without explicit user
  confirmation.
- Does NOT read individual test file implementations — reads directory names,
  file names, and runner config files only.
- Does NOT overwrite `scripts/run-tests.sh` if it already exists.
- On re-run: always diffs proposed changes to both output files and waits for
  explicit user confirmation before writing.

## Gotchas

1. Run only once per repo per major framework change — re-running overwrites `testing-plan.md` and `run-tests.sh`.
2. The output `run-tests.sh` must be executable (`chmod +x`) — the pre-commit hook calls it directly.
3. Do not invent test patterns that don't exist in the codebase — derive the testing plan from what's actually there.
