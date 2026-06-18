# Setup Workflow — Acceptance Criteria

**Type:** reference (durable). **Scope:** the onboarding/setup skills — `init`, `e2e-init`, `infra-init`, `project-setup` — and the install-vetting funnel they invoke.

## Why this exists

Dry runs of the setup workflow produce a breakage log every time. Without an absolute definition of "working," each log is graded only against the *previous* log, so "fixed" silently means "fixed last run's list" — a treadmill that cannot converge. This document is the fixed point: it states what each skill must guarantee, per target, with **zero manual intervention**. A dry run passes a criterion or it does not; everything else is sorted (see Triage) rather than treated as a bug.

## Supported targets

The workflow must meet the criteria below on each supported (platform × repo-type) cell.

- **Tier 1** — must work intervention-free.
- **Tier 2** — must work with a single documented setup step (e.g. installing a scanner the funnel recommends).
- **Best-effort** — no guarantee; failures are logged but out of scope.

| Platform | firmware-embedded | python | node/ts |
|---|---|---|---|
| Windows (git-bash) | Tier 1 | Tier 1 | Tier 1 |
| macOS | Tier 1 | Tier 1 | Tier 1 |
| Linux | Tier 1 | Tier 1 | Tier 1 |

Windows is the primary development platform; macOS and Linux are first-class. **An instruction that works on only one OS family is a defect, not an environment edge.** Tools the workflow *installs* (OSV-Scanner, cppcheck, …) are Tier 2: their absence yields a documented "couldn't scan / bootstrap install" path, never a hard block.

## Per-skill acceptance criteria

### init
- Produces an accurate `CLAUDE.md` at the **git root**.
- Does not create a duplicate when a `CLAUDE.md` already exists at or above the git root — detect-and-ask, never silently duplicate.

### e2e-init
- Classifies the repo type correctly.
- Firmware/embedded → emits a **static-analysis backbone**, not a host-test-runner stub that references tools it cannot run.
- Produces `.claude/testing-plan.md` and a Testing section in `CLAUDE.md`.

### infra-init  *(the criterion the current Windows blocker fails)*
- Produces a **non-empty** `.claude-init/CODEBASE.md` with zero manual path/argument fixes.
- Derives the repo path in OS-native form (`git rev-parse --show-toplevel`) so indexing succeeds on Windows as well as macOS/Linux — see `rules/filesystem/path-portability.md`.
- Leaves `.claude-init/` **gitignored** (no accidental-commit risk).
- Adds the "Codebase Knowledge Graph" section to `CLAUDE.md`.

### project-setup
- Completes Phases 1–5 without a dead-end.
- Pre-flight detects nested/stray config above the git root and **asks** before proceeding.
- Doc scaffolding sources from `~/.claude/templates/` (reachable from any target repo).
- Install-vetting funnel runs all applicable gates and **always asks** before installing anything.

## Reset precondition (every dry run)

Two stores exist: files inside the repo, and the codebase-memory index in the MCP server's own store (outside the repo — it survives `git clean`).

1. **Working tree (required):** `git clean -ndx` → inspect the preview → confirm **no genuine user work** is in it (untracked debugging notes, scratch files) → `git clean -fdx`.
2. **External index (best-effort):** try `delete_project(<name>)` (find the name via `list_projects()`). On Windows this can return `Permission denied` — the long-running MCP server holds its SQLite file open and `delete_project` has no force flag. **That is acceptable:** `index_repository` re-extracts on every run (mode `full`), so a persisting index is refreshed, not stale. The persisting index only matters when you need to observe *true cold-machine* indexing; for that, restart the codebase-memory MCP server to release the lock, then `delete_project`.

Grade workflow correctness from step 1 alone; treat step 2 as test-purity hygiene, not a gate.

## Triage — sorting a breakage log

Every finding sorts into exactly one bin. Only bin 1 and (decided) bin 2 become fixes:

| Bin | Definition | Action |
|---|---|---|
| 1 — Logic defect | Platform-independent workflow-logic bug | Fix the skill |
| 2 — Platform | OS/shell/interpreter edge (path format, interpreter version) | Fix **if** the cell is Tier 1; else out of scope |
| 3 — Repo-type | Stack-specific friction (SDK noise, no host runner) | Belongs to the stack hat / template, not the core skill |
| 4 — Harness artifact | The test agent's own mistake or workaround | Discard — not a bug |

## How to verify

Run the dry-run harness from a session whose cwd is the target repo, **after** performing the reset precondition. Grade each criterion above pass/fail; sort everything else via Triage.
