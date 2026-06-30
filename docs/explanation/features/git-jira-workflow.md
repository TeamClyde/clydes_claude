---
**Feature:** Git & Jira Workflow
**C4 Layer:** C3 Component
**Status:** Active
**Owner:** solo
**Last updated:** 2026-06-29
**Related plans:** plans/orchestration-layer-foundation/ (Phase 1B docs), plans/git-workflow-hardening/
**Related ADRs:** _(none)_
**Key files:**
  - `skills/git-manager/SKILL.md` — all git operations (commit / branch / push / PR / sync / switch / clean-gone)
  - `skills/git-manager/references/host-adapters.md` — host-adapter contract (detect_host / auth_preflight / create_pr / read_pr)
  - `agents/jira-workflow-manager.md` — all Jira operations (ticket create / transition / comment)
  - `skills/finishing-a-development-branch/SKILL.md` — branch completion flow
  - `rules/workflow-phases.md` — the Jira + git phase sequence
  - `rules/delivery-cadence.md` — PR sizing conventions and posture
---

# Git & Jira Workflow

## Context & Scope

This explainer covers the two abstraction layers that govern how code changes and work tracking happen in any Claude-assisted development session: the `git-manager` skill (all git operations) and the `jira-workflow-manager` agent (all Jira operations), along with the `finishing-a-development-branch` skill that ties them together at branch completion.

**The central rule:** Claude never runs raw git commands ad hoc, and never calls Atlassian MCP tools directly from the main context. Every git action routes through `git-manager`. Every Jira action routes through `jira-workflow-manager`. This is not a preference — it is a hard constraint enforced by `rules/workflow-phases.md` and `rules/mcp-governance.md`.

**What this covers:**
- Branch creation, commit format, push, PR creation, and merge strategy policy via `git-manager`
- The host-adapter contract for PR creation (`detect_host`, `auth_preflight`, `create_pr`, `read_pr`)
- Per-worktree branch binding (`claude.expectedBranch`) and the `switch` and `clean-gone` workflows
- Config-driven merge strategy resolution (`project.json git.merge-strategy`)
- Commit-verification gates in `subagent-driven-development` (observed-state checks)
- PR-sizing discipline via `rules/delivery-cadence.md` and `project.json git.pr-sizing`
- Ticket creation (plan-execution, bug, human-created, and cross-repo origins), status transitions, comment policy, and duplicate detection via `jira-workflow-manager`
- The two paths to ticket creation (plan-doc vs. codebase-scan)
- The branch-completion flow via `finishing-a-development-branch`

**What this does NOT cover:**
- CI/CD pipeline configuration or deployment infrastructure (covered in infrastructure plans)
- Codebase indexing or knowledge-graph operations (covered in `docs/explanation/features/` for that system)
- Test strategy or test runner configuration

**Jira status in this repo:** `project.json` has `jira.enabled: false`. The Jira system described here is fully operational in repos where Jira is enabled. In this repo, no ticket keys are used and `jira-workflow-manager` is never invoked. The `git-manager` skill still runs as normal — it detects the disabled state and omits the `[PROJ-N]` footer from commits automatically.

## Building Block View

### `git-manager` (Skill)

**File:** `skills/git-manager/SKILL.md`

The git abstraction layer. Receives structured intent from the main context (what files to stage, what the message says, what workflow to run) and owns safe, consistent execution. The main context owns decisions; this skill owns mechanics.

**Named workflows:**

| Workflow | Purpose |
|----------|---------|
| `start-work` | Create a feature branch from latest `main`, push tracking ref, and set the expected-branch binding (`claude.expectedBranch`) |
| `commit` | Stage specified files, validate message format, run plan-state validator, check branch binding (Step 5.5 soft-warn), commit |
| `publish` | Pull latest, push branch, flag WIP commits, PR-size soft-warn |
| `sync` | Bring branch up to date with `main` (rebase when no open PR, merge when PR is open) |
| `smoke-commit` | Disposable commit for exercising hooks and the plan-state validator; unconditionally reverts |
| `finish` | Run `publish`, resolve merge strategy, resolve host via adapter contract, preview conflicts (merge-commit strategy only), open PR |
| `switch` | Context-switch to a different branch and plan; delegates plan repointing to `plan-management repoint` |
| `clean-gone` | Prune local tracking branches whose upstream was deleted after PR merge; triggers post-merge codebase-graph reindex |

The `commit` workflow includes a two-stage guard before the actual `git commit`: a pre-staged invariant check (the staged set must exactly match the `files:` parameter) and a plan-state validator (if an active plan exists, in-scope commits must include the plan doc unless `[no-plan-update]` is present). A branch soft-warn (Step 5.5) also runs after these validators, comparing the current branch against `claude.expectedBranch` — non-blocking, fires only when a binding is set and mismatched.

**Branch binding (P2):**

`git-manager` records the expected branch for each worktree in native per-worktree git config under the key `claude.expectedBranch` (requires git ≥ 2.20; falls back to no-binding on older git). The binding is established at brainstorming start (the macro entry gate in `brainstorming`'s "Establish Branch Context" step creates a provisional `wip/*` branch and sets the binding). It is refreshed by `start-work`, by the `writing-plans` branch rename (WIP → canonical), and by `switch`. Consumers: the `commit` workflow's Step 5.5 branch soft-warn, and the session-start hook. An unset binding is always silent — no warning, no block.

**Host-adapter contract:**

PR creation in the `finish` workflow is delegated to the host-adapter contract defined in `skills/git-manager/references/host-adapters.md`. The contract exposes four named operations — `detect_host`, `auth_preflight`, `create_pr`, `read_pr` — each with normalized inputs and return values. `finish` is host-blind: it calls these operations against whichever adapter `detect_host` selects; it never branches on a host name internally. Four adapters are bundled: `github` (via `gh` CLI), `gitlab` (via `glab` CLI), `bitbucket` (via `curl` + `git credential fill`), and `manual` (outputs rendered title/body for web submission). Adding a new hosting provider requires writing one adapter block in `host-adapters.md` — no edit to the `finish` procedure is needed.

The `read_pr` operation is used by the merge-method divergence check during `finish` (see Config-driven merge strategy below). It returns the PR's URL, state, and the repository's configured merge method — a best-effort read that, when unavailable, stays silent rather than warning.

**Config-driven merge strategy:**

`project.json` carries a `git.merge-strategy` field: a glob map of branch-pattern → strategy (`squash` | `merge-commit` | `rebase`). During `finish`, step 4b resolves the strategy for the PR target branch (exact-match beats wildcard; longest wildcard wins; default is `squash` when the map is absent or no pattern matches). Two advisory checks follow resolution:

- **Promotion conflict preview:** for `merge-commit` strategy only, runs a read-only `git merge-tree` dry-run (requires git ≥ 2.38). Exits advisory — never blocks the PR; conflicts are surfaced so the user can decide.
- **Host merge-method divergence check:** calls `read_pr` from the active adapter to read the repository's configured merge method; warns if it differs from the resolved strategy. Stays silent on `unavailable` (covers: GitHub with multiple methods allowed, Bitbucket, `manual` host, any read failure).

Enforcement is always host-side (branch-protection settings or repository merge settings). `git-manager` requests the strategy and flags divergence; it does NOT enforce.

**PR-size soft-warn:**

`git-manager`'s `publish` and `finish` workflows emit a non-blocking advisory when the branch diff exceeds the ceiling configured in `project.json git.pr-sizing.ceiling-loc` (default 400 LOC). The `--stat` line-count is a heuristic proxy for logical change — comment padding, whitespace, and generated code can inflate the number without increasing review burden. For `ongoing` posture the warn is purely advisory; for `new` posture it prompts reviewing delivery-cadence slicing patterns. Never blocks or aborts.

### `jira-workflow-manager` (Agent)

**File:** `agents/jira-workflow-manager.md`

The Jira abstraction layer. Handles ticket creation, status transitions, comment policy enforcement, duplicate detection, and description edit rules. All Atlassian MCP calls happen inside this agent — the main context never calls them directly.

**Operations:**

| Operation | Description |
|-----------|-------------|
| `create-epic` | Create an Epic from a goal statement and task list |
| `create-task` | Create a Task with structured scope, implementation notes, and acceptance criteria |
| `create-bug` | Create a Bug ticket with severity determined deterministically from the error description |
| `transition` | Move a ticket through its lifecycle; sets Resolution when transitioning to Done |
| `add-comment` | Add a comment, enforcing the sparse comment policy |
| `read` | Retrieve ticket content |
| `search-duplicates` | Check for existing tickets before creating a new one |
| `update-description` | Edit a ticket description; requires a paired comment if the ticket is already In Progress |

The agent's first action on any call is a `project.json` check. If `jira.enabled: false`, it responds immediately: "Jira not configured for this project. No operations to perform." and stops.

### `finishing-a-development-branch` (Skill)

**File:** `skills/finishing-a-development-branch/SKILL.md`

Guides branch completion once implementation is done. Called by `subagent-driven-development` and `executing-plans` after all tasks complete. The skill verifies tests first, determines the base branch, optionally runs `/docs-status`, presents four structured options (merge locally, push and create PR, keep as-is, discard), executes the chosen option, and handles worktree cleanup.

For Option 2 (Push and Create PR), this skill delegates to `git-manager`'s `finish` workflow — it does not call `gh pr create` directly. This preserves the host-adapter contract, merge-strategy resolution, WIP-commit checks, and the abstraction boundary.

### `rules/workflow-phases.md`

The normative sequence document. Defines Phase 1 (planning and ticket creation), Phase 2 (execution and status transitions), and Phase 3 (commits). All skills and agents in this feature implement the rules described there.

## Runtime View

### Flow A: Starting a new feature (with Jira enabled)

1. A plan doc exists at `plans/<slug>/<slug>-plan.md` (preferred) or codebase scanning has identified the scope.
2. Main context invokes `jira-workflow-manager` with the goal, task list, and plan doc reference. The agent runs a duplicate check, evaluates whether an Epic is warranted (3+ distinct deliverable tasks with a single nameable outcome, combined L-scale), creates the Epic and Tasks, and writes keys back into the plan doc's Task Reference table.
3. Main context invokes `git-manager` with `start-work` and the branch name (`feature/PROJ-N-slug` when Jira is enabled, `feature/<slug>` when disabled). The skill fetches latest `main`, creates the branch, pushes the tracking ref, and sets `claude.expectedBranch` for this worktree.
4. Work begins. No ticket operations block execution.

### Flow B: Committing a completed task

1. Main context forms the complete commit message and file list.
2. Main context invokes `git-manager commit files:[...] type:feat description:'...' jira-key:PROJ-N`.
3. The skill stages only the listed files, runs the pre-staged invariant check, verifies staged content, validates message format, runs the plan-state validator (checks whether the active plan's scope is touched and whether the plan doc is staged), and then runs the branch soft-warn (Step 5.5): reads `claude.expectedBranch`; if a binding is set and the current branch doesn't match, surfaces a non-blocking warning before proceeding to commit.
4. On hook rejection: the skill surfaces the full output and stops. It never passes `--no-verify`.
5. On success: the skill returns the commit hash. Main context then invokes `jira-workflow-manager transition PROJ-N In Progress` (if not already transitioned) or `transition PROJ-N Done` for mechanical tasks.

**Commit format:**
```
type(optional-scope): subject

Body — explains why, not what. Wrap at 72 chars.

[PROJ-N]
Co-Authored-By: <model> <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`. Subject: imperative mood, max 72 chars. Jira key in footer (omitted when `jira.enabled: false`). Body required when the diff alone would not explain the reasoning.

### Flow C: Ticket status transitions

The lifecycle for plan-execution Tasks:
```
To Do → In Progress → Testing* → Done
```

Testing is required when human verification is needed (AWS behavior, UI, observable output). Mechanical or structural changes skip Testing and go directly from In Progress to Done after commit. Bug tickets always pass through Testing. The agent sets the Resolution field on every Done transition.

Main context invokes `jira-workflow-manager transition <key> <status>` at each gate. The agent reads the current status first — if a ticket is already In Progress (another agent may be working it), it surfaces the conflict rather than overriding.

### Flow D: Bug ticket

1. An error surface (Sentry, CloudWatch, log paste) is identified.
2. Main context applies the obviousness gate: if root cause is immediately obvious AND the fix is trivial (one area, no downstream effects), fix inline with a commit — no ticket. Otherwise, invoke `jira-workflow-manager create-bug` before any investigation.
3. The agent sets Severity deterministically from the error description (Critical / Major / Minor / Trivial). Priority is left blank — it requires business context the agent does not have.
4. Investigation findings go into a comment before any fix code is written. Root Cause and Fix Approach fields in the ticket description remain blank — the comment thread is the audit trail.
5. If investigation reveals a systemic issue, the bug ticket is parked, a new Task is created for the systemic problem, and the two are linked with `causes / is caused by`.

### Flow E: Completing a branch

1. All tasks marked complete. Tests pass.
2. Main context invokes `finishing-a-development-branch`.
3. Skill verifies tests, determines base branch (reads `.claude/worktrees/<name>/base-branch` sidecar if present), optionally offers `/docs-status`.
4. Skill presents four options. For Option 2 (PR), delegates to `git-manager finish`, which: resolves the merge strategy from `project.json git.merge-strategy`, detects the hosting backend via `detect_host`, runs `publish`, previews promotion conflicts (merge-commit strategy only, read-only `git merge-tree`), checks host merge-method divergence via `read_pr`, applies PR-size soft-warn, and creates the PR via the detected adapter (`gh pr create` for GitHub, `glab mr create` for GitLab, `curl` REST for Bitbucket, or rendered output for `manual`).
5. PR title follows conventional commit format with the Jira key: `feat: add notification routing [PROJ-42]`. The merge strategy that lands the squash commit on `main` is determined by host-side branch-protection settings, guided by `project.json git.merge-strategy`.

### Flow F: Two paths to ticket creation

**Path A — Plan doc exists (preferred for L-sized work):**
The plan doc at `plans/<slug>/<slug>-plan.md` contains all file paths, function names, data structures, and implementation detail. Main context reads the plan doc's Epic/Task Reference section and passes it directly to `jira-workflow-manager`. No codebase scanning required.

**Path B — No plan doc:**
Main context scans the codebase to identify relevant files, methods, and structure before invoking `jira-workflow-manager`. All ticket descriptions must reference real file and method names — not guesses. This path is for S/M work that does not warrant a full plan doc.

### Flow G: SDD commit-verification gates

When `subagent-driven-development` orchestrates implementation, a micro entry gate and exit gate bracket each task's implementer dispatch. These gates operate on observed git state — not the implementer's self-report.

**Micro entry gate (before implementer dispatch):**
- E4 captures `BASELINE` SHA via `git rev-parse HEAD` — the exact commit the implementer builds on top of.
- E5 captures the in-scope file list for the task.

Both values are held by the orchestrator and are implementer-independent.

**Micro exit gate (after implementer returns):**
- X5: verifies new commits appeared beyond `BASELINE` (task actually committed something).
- X6: verifies in-scope files are clean (`git status --porcelain -- <in-scope paths>` is empty).
- X7: verifies the current branch matches the branch at `BASELINE` (no branch drift).
- X8: optionally cross-checks the implementer's reported commit hash against `<BASELINE>..HEAD` — corroboration only, not a stop-condition.

X5–X7 are stop-conditions: any failure blocks the task's ✅. X8 failure is logged, not a gate failure. Recovery path: on X5–X7 failure, the orchestrator re-dispatches the implementer once with the exact discrepancy stated; on a second failure, stop and surface to the user. The orchestrator must NOT silently commit a dirty tree itself — that would defeat the boundary these gates exist to verify.

**Scope:** these gates apply to `subagent-driven-development` only. In `executing-plans`, the orchestrator is itself the committer — there is no untrusted implementer→orchestrator boundary, so observed-state verification is unnecessary.

## Dependencies

- **Atlassian MCP** (`plugin:atlassian`) — `jira-workflow-manager` uses this for all Jira read/write operations. The main context never calls these MCP tools directly. When this MCP has auth failures, the agent surfaces the error immediately and stops — it does not retry or debug autonomously.
- **`gh` CLI** — required for the `github` host adapter in `git-manager`'s `finish` workflow. If absent, `auth_preflight` returns `missing-cred` and the adapter falls back to `manual`.
- **`glab` CLI** — required for the `gitlab` host adapter. Same fallback to `manual` if absent or unauthenticated.
- **`curl` + credential helper** — required for the `bitbucket` host adapter. The API token is retrieved via `git credential fill` at runtime; the token never passes through the command line or appears in output. The token is unset after use.
- **`skills/git-manager/references/host-adapters.md`** — the host-adapter contract. Defines the four operations (`detect_host`, `auth_preflight`, `create_pr`, `read_pr`) and per-host adapter blocks. `finish` delegates all PR creation and host merge-method reads through this contract. Adding a host means adding one adapter block here — no edit to `finish`.
- **`project.json`** — the config root. `git-manager` reads it to determine whether a Jira key is required in commit footers, to resolve `git.merge-strategy` (glob map → strategy), `git.pr-sizing` (posture + thresholds for size soft-warns), and `git.main-branch`. `jira-workflow-manager` reads it at Step 0 of every invocation to gate on `jira.enabled`. `git-manager`'s `finish` workflow reads `git.backend` to override host auto-detection for enterprise hosts.
- **`rules/delivery-cadence.md`** — PR sizing conventions. Defines the ~200 LOC target and ~400 LOC ceiling (soft bounds based on logical change, not raw LOC), slicing patterns, and posture behavior. Consumed by `plan-gate` (architect sees oversized tasks at plan time), the `architect` agent (slicing lens), and `git-manager`'s `publish` and `finish` workflows (size soft-warn).
- **`.claude/active-plan`** — read by `git-manager`'s plan-state validator during the `commit` workflow to identify the currently active plan. If absent, the validator skips entirely.
- **`plan-management` skill** — sibling skill that owns the three-write atomic operation (journal append + plan section edit + handoff refresh) when a divergence occurs. `git-manager` does not write to the journal — that invariant belongs to `plan-management:divergence`.
- **Pre-commit hooks** — `git-manager` surfaces hook rejection output and stops; it never passes `--no-verify`. The `.pre-commit-config.yaml` standard hook set covers commit message format (`commitlint`), lint/format (`ruff` / `eslint`/`prettier`), secret scanning (`gitleaks`), and optionally fast unit tests.

## Decisions

No accepted ADRs yet.

## Known Issues & Gotchas

- **`jira.enabled: false` in this repo.** `project.json` has `jira.enabled: false`. `jira-workflow-manager` will immediately respond "Jira not configured" and stop on any invocation. `git-manager` omits the `[PROJ-N]` footer from commits. Do not pass a Jira key to `git-manager` expecting it to be included — the skill follows the project config, not the caller's hope.

- **Pre-staged invariant (Step 2.5 of `commit`).** If files were staged before `git-manager commit` is invoked (e.g., from a prior interrupted session), the skill will refuse. The staged set must exactly match the `files:` parameter. Either include the pre-staged files in `files:`, or unstage them with `git reset HEAD <file>` before re-invoking. The `[no-plan-update]` override token does not apply here — it only governs plan-doc staleness, not pre-stage drift.

- **`smoke-commit` is for validation only.** Never instruct a subagent to "commit then `git reset` afterward." If the subagent is interrupted between those two steps, the branch is left in a polluted state. Use `smoke-commit` — it owns the revert unconditionally and refuses to push.

- **Merge conflicts stop everything.** `git-manager` lists conflicting files and stops. It does not auto-resolve. This includes during `sync` and `publish`. Conflict resolution requires explicit user direction.

- **Merge strategy is host-enforced, not git-manager-enforced.** `project.json git.merge-strategy` declares the intended strategy per branch pattern (squash is the default). `git-manager` resolves the strategy during `finish`, previews promotion conflicts for `merge-commit` branches, and warns on host-method divergence via `read_pr` — but it does NOT enforce. Configure squash-only (or rebase-only) merging in GitHub/GitLab/Bitbucket branch-protection settings to make the policy binding. The `read_pr` operation reads the repository's configured merge method; when the host allows multiple methods, `merge_method` returns `unavailable` and the divergence check stays silent.

- **Bug tickets always require Testing.** Unlike plan-execution Tasks (which can skip Testing for mechanical changes), bug tickets always stop at Testing and wait for human verification. Do not transition a bug ticket directly to Done.

- **Bitbucket credential must be an API token.** Bitbucket app passwords are being retired. The credential retrieved via `git credential fill` must be an API token paired with the Atlassian account email (the credential helper validates that `username` contains `@`). A legacy Bitbucket username fails validation.

- **WIP commits in branch before PR.** `git-manager`'s `publish` workflow flags commits containing WIP/TODO/FIXME/debug markers. These must be addressed (via interactive rebase to squash, only safe before a PR is open) before the PR is created. The skill surfaces them and stops — it does not suppress them silently.

- **Additive-only ticket creation.** If a ticket was missed during initial plan-execution and must be created retroactively, `jira-workflow-manager` creates only the new ticket. It never modifies, merges, or rewrites existing tickets as a side effect. If apparent overlap with an existing ticket is found, the agent surfaces the conflict to the user.

- **Branch binding requires git ≥ 2.20.** On older git, the `--worktree` config scope is unavailable. `git-manager` detects this at binding-set time and skips the binding entirely — no binding, no warning. This is the correct degraded behavior; a missing binding is always silent.

- **`switch` requires `target-plan`.** There is no branch→plan index. If you invoke `switch` without the `target-plan` arg, the skill refuses immediately. Find the plan doc path under `plans/` or in `TODO.md` before invoking.

- **`clean-gone` triggers a codebase-graph reindex only when `.claude-init/CODEBASE.md` exists.** If the graph has not been initialized (`/infra-init` not yet run), the reindex step is silently skipped and noted in the summary. Unmerged branches are force-deleted only with per-branch explicit typed confirmation — the skill never silently force-deletes.

- **SDD orchestrator must not silently commit a dirty tree.** If the X5–X7 exit gate fails (implementer did not commit, left files unstaged, or branched drift occurred), the orchestrator re-dispatches the implementer once with the exact discrepancy. On a second failure, it stops and surfaces to the user. Committing on the implementer's behalf would defeat the observed-state verification boundary.

## Observability

- **Git history:** `git log --oneline main..HEAD` shows the commits on the current branch before a PR. `git log --oneline -20` on `main` shows the squash commits that have landed — each corresponds to one merged PR and follows conventional commit format.
- **Branch list:** `git branch -a` shows active feature branches. Branches open more than 5 days without a PR are flagged as a warning by `git-manager`.
- **Branch binding:** `git config --worktree --get claude.expectedBranch` shows the expected branch for the current worktree. Empty output means no binding (always silent).
- **Pre-commit hook output:** hook rejection messages appear directly in the `git-manager` response as the full hook output. They are never suppressed.
- **PR history (GitHub):** `gh pr list` and `gh pr view <number>` show open and merged PRs, their status checks, and review state.
- **PR history (Bitbucket):** the Bitbucket REST API (`/2.0/repositories/<workspace>/<repo>/pullrequests`) or the Bitbucket UI shows PR state, status checks, and merge outcome.
- **Jira board (when enabled):** the project board shows ticket status across all four lifecycle states. The Epic burndown view shows progress toward the Epic's delivery outcome. The comment thread on each ticket is the audit trail for divergences, root-cause findings, and description changes.
- **`project.json`:** the single authoritative source for `jira.enabled`, `git.main-branch`, `git.backend` (when overriding auto-detection), `git.merge-strategy` (branch-pattern → strategy map), and `git.pr-sizing` (posture + thresholds). Read it first when diagnosing unexpected behavior from either abstraction layer.

## Glossary

**Atomic commit:** a commit that represents exactly one logical, complete change and leaves the repo in a working state. Enables `git bisect`, surgical reverts, and meaningful `git blame`.

**Backend (git-manager):** the hosting platform used for PR creation. Resolved via the host-adapter contract's `detect_host` operation — matched from the remote URL (`github.com` → `github`, `gitlab.com` → `gitlab`, `bitbucket.org` → `bitbucket`) or overridden via `project.json git.backend` for enterprise hosts. Falls back to `manual` when the required CLI or credential is unavailable.

**Branch binding (P2):** the per-worktree expected-branch record stored in native git worktree config as `claude.expectedBranch`. Set by `start-work`, `switch`, and `writing-plans` (on WIP→canonical rename). Read by the `commit` Step 5.5 soft-warn and the session-start hook. An unset binding is always silent.

**Conventional commit:** the commit message format used throughout this workflow — `type(scope): subject` with an optional body and a footer containing the Jira key and `Co-Authored-By` trailer.

**Host-adapter contract:** the four-operation interface (`detect_host`, `auth_preflight`, `create_pr`, `read_pr`) defined in `skills/git-manager/references/host-adapters.md`. `finish` is host-blind — it calls the four operations against the selected adapter; it never names the host internally. Each adapter normalizes its own transport's output. Adding a host = one new adapter block.

**Merge strategy map:** the `project.json git.merge-strategy` field — a glob map of branch-pattern → strategy (`squash` | `merge-commit` | `rebase`). Resolved by `finish` step 4b for the PR target branch. Default is `squash` when absent or no pattern matches.

**Obviousness gate:** the two-question check applied before creating a bug ticket. If the root cause is immediately obvious AND the fix is trivial (one area, no downstream effects), fix inline with a commit and no ticket. If either condition is false, create the ticket first.

**Plan-state validator:** the check inside `git-manager`'s `commit` workflow that, when an active plan exists and the staged files intersect the active task's scope, requires the plan doc to also be staged (unless `[no-plan-update]` is present in the commit message).

**PR-sizing posture:** the `project.json git.pr-sizing.posture` value (`new` or `ongoing`). `new` repos apply sizing conventions from day one; `ongoing` repos get an advisory ratchet only — never a hard block. The ceiling and target thresholds are stored alongside the posture in `git.pr-sizing`.

**Pre-staged invariant:** the requirement that the set of files staged in git at the time of commit exactly matches the `files:` parameter passed to `git-manager commit`. Enforced in Step 2.5. Protects the plan-state validator and pre-commit hooks from gating on a phantom set.

**Resolution field:** a Jira field that must be set when transitioning a ticket to Done. Tickets without a Resolution are not truly closed in Jira filters and reports. `jira-workflow-manager` always sets this field on Done transitions.

**Severity (bug tickets):** impact classification set deterministically by `jira-workflow-manager` at bug ticket creation — Critical, Major, Minor, or Trivial. Measures impact, not fix effort. Distinct from Priority, which requires business context and is left blank for humans to set at triage.

**Smoke commit:** a disposable commit created by `git-manager`'s `smoke-commit` workflow for exercising hooks and the plan-state validator. Reverts unconditionally before returning control. Never pushes.
