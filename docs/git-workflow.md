# Git Workflow

---

## Problem Statement

No standard git workflow exists across repos. Each project has its own conventions (or none). History quality varies — commit messages are inconsistent, versioning is informal, and many repos lack branch protection or CI enforcement. The result is a poor historical record, hard-to-audit release history, and no reliable foundation for build pipeline integration.

Secondary problems: MCP auth failures mid-workflow and build pipeline requirements not known before work begins.

---

## Goal

Define the standard workflow — branching, commits, merges, releases, and PRs — so that work done going forward follows consistent rules and produces a clean, auditable history. This is not about cleaning up existing repos; it's about what Claude does on any repo from this point forward, and how it knows what practices are already in place.

---

## Standards Layer — What Good Looks Like

### Branching Strategy: GitHub Flow

- `main` is always releasable. No broken code lands there.
- Feature branches: `feature/PROJ-N-slug`
- Fix branches: `fix/PROJ-N-slug`
- Chore/docs branches: `chore/slug`, `docs/slug`
- No long-lived branches except `main` (and optionally `develop` for repos that do release staging)
- Branch from latest `main`. Merge back via PR only — never direct push.
- Branch names are short, descriptive, and include the Jira key when one exists.

**Existing repos:** Many already have their own conventions. Before starting work on a repo, Claude reads `CLAUDE.md` and recent branch/commit history to understand what practices are already in place, then follows those. Where a repo has no conventions, the above is the default.

---

### Commit Standards: Conventional Commits

Format:
```
type(optional-scope): subject

Optional body — explain why, not what. Wrap at 72 chars.

[PROJ-N]
Co-Authored-By: Name <email>
```

**Types:** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`

**Rules:**
- Subject: imperative mood ("add handler", not "added handler"), max 72 chars
- Body: required for non-trivial changes; explains the reasoning, not the diff
- Footer: Jira key is **required** on every commit — not in the subject line. Multiple commits may reference the same ticket key; a ticket doesn't need to be closed to be reused. Plus any `Co-Authored-By` trailers.
- **Atomic commits**: one logical, complete change per commit. Never mix refactoring with feature work. Always leaves the repo in a working state.
- Stage specific files only — never `git add .` blindly

**Why atomic matters:** enables `git bisect` for regressions, surgical reverts, and meaningful `git blame` for future readers.

---

### Merge Strategy: Squash into Main

- All PRs squash-merged into `main`
- The squash commit message = the PR title, written as a conventional commit that summarizes what the group of related commits collectively accomplish. A PR may contain mixed commit types (e.g., `refactor` + `feat`) — the squash message describes the overall change, not a single type.
- Feature branch history is preserved on the branch until deletion — intermediate commits are valuable during review even though they don't land on `main`
- No fast-forward merges, no three-way merge commits on `main`
- Result: `main` history is one commit per feature/fix — clean, linear, readable

---

### Branch Protection Rules (Standard Template)

All repos should enforce:
- Require PR before merging to `main` — no direct push
- Require at least 1 approval before merge
- Require all status checks to pass (CI must be green)
- Require branch to be up to date with `main` before merge
- No force-push to `main`
- No deletion of `main`

These are the floor. Individual repos can add stricter requirements.

---

### Pre-Commit Hooks

Pre-commit hooks are scripts git runs automatically before a commit is saved. If any hook fails, the commit is aborted. The developer sees the output, fixes the issue, and commits again.

**The pre-commit framework** (pre-commit.com) manages hooks via a `.pre-commit-config.yaml` file committed to the repo. Everyone runs `pre-commit install` once to wire up hooks locally. This solves the drift problem — hooks are versioned alongside the code.

**Standard hook set:**

| Hook | Tool | What it does |
|------|------|-------------|
| Commit message format | `commitlint` | Rejects messages that don't match conventional commit format — catches `"fixed the thing"` before it lands |
| Lint/format | `ruff` (Python), `eslint`/`prettier` (JS/TS) | Scans staged files; formatting hooks often auto-fix and re-stage, so the next commit attempt just works |
| Secret scanning | `gitleaks` | Scans staged content for API keys, tokens, passwords — catches them before they hit the remote |
| Fast unit tests | language-specific | Optional; only if suite runs in under 30 seconds. Slow hooks get bypassed. |

**`--no-verify`:** skips all hooks. Should only be used with explicit user instruction. CI running the same checks on push is the second gate for when hooks get bypassed.

**Installation:** The `.pre-commit-config.yaml` file is committed to the repo. Developers run `pre-commit install` once. CI runs `pre-commit run --all-files` on every push — hard gate, not a warning.

---

### Semantic Versioning

Format: `MAJOR.MINOR.PATCH` (e.g., `v1.4.2`)

| Increment | When |
|-----------|------|
| MAJOR | Breaking change — existing callers must update |
| MINOR | New backward-compatible feature |
| PATCH | Bug fix, internal refactor, docs — no behavior change for callers |

**Rules:**
- Tags are annotated (`git tag -a`), not lightweight — they store who tagged, when, and a message
- Tag format: `v1.2.3` (always `v` prefix)
- Tags are only cut from `main`
- Every release gets a tag. No untagged production deployments.

**Changelog: automated.** Conventional commit types map to changelog sections automatically. `semantic-release` or equivalent tooling generates the changelog from commit history between tags — `feat` commits → MINOR bump, `fix` → PATCH, `BREAKING CHANGE` in footer → MAJOR. Claude creates the tag; `semantic-release` runs in CI in changelog-only mode to generate the changelog file. These do not conflict.

**Existing repos without tags:** when starting work, note the current state. Apply `vMAJOR.MINOR.PATCH` going forward from wherever the project is.

---

### Tooling — Git vs. PR Operations

**Git operations** (commit, push, pull, branch, fetch, tag) are standard git CLI regardless of hosting platform. Bitbucket hosting doesn't change how any of these work.

**PR operations** (create PR, post review comments, get PR status, merge) require a platform-specific tool:

**Platform: Bitbucket Cloud.** PR operations use the Bitbucket Cloud REST API (`api.bitbucket.org/2.0`) authenticated with an API token. The token pairs with the Atlassian account email and is retrieved at runtime via `git credential fill` — never stored in this repo or passed on the command line. (Bitbucket app passwords are being retired; use an API token.)

Capabilities used: create PR, get PR diff and changed files, post inline review comments, get PR status and checks — all via the REST API.

Fallback if no Bitbucket credential is configured (or `curl` is unavailable): output the full PR title and description for manual submission via the Bitbucket UI.

**The existing Atlassian MCP** (used for Jira/Confluence) does not cover Bitbucket PRs — those go through the Bitbucket REST API described above. These are separate concerns.

---

### Pull Requests

**Title format:** maps directly to the squash commit that will land on `main`:
```
feat: add notification routing for anomaly events [CLAUDE-42]
```

**Description template:**
```
## Summary
2-3 sentences. What changed and why.

## Changes
- Bullet list of meaningful changes (not a commit log)

## Testing
How to verify this works. Automated test coverage noted here.

## Linked Tickets
- PROJ-N: Ticket summary
```

**Size:** aim for PRs reviewable in 30 minutes (~50–400 LOC). Larger PRs should be split into a preparatory infrastructure PR followed by a feature PR.

**Division of labor:** AI review runs first and catches low-level issues. Human review focuses on business logic, architectural decisions, and anything requiring context that lives outside the diff. Claude surfaces issues and posts findings — humans make merge decisions.

---

### PR Review — What Claude Checks

Claude reviews a PR in passes, each focused on a different category of issue:

| Pass | What Claude looks for |
|------|-----------------------|
| **Logic errors** | Null/undefined access, off-by-one errors, unreachable branches, incorrect parameter ordering, unhandled state transitions |
| **Security** | Missing input validation, exposed credentials, SQL/command injection patterns, improper auth checks, insecure deserialization |
| **Test coverage** | New code paths introduced by the diff that have no corresponding test. Surfaces specific untested branches, not just line coverage. |
| **Breaking changes** | Modified function signatures, removed exports, changed enum values, altered API contracts that would break callers |
| **Convention compliance** | Does the code match patterns established in `CLAUDE.md` and the existing codebase? Naming, structure, error handling style. |
| **Scope check** | Does the diff match what the linked ticket describes? Flag unrelated changes that should be a separate PR. |

**What Claude does not judge:** architectural correctness without context, business logic validity, design trade-offs, or anything that requires knowing why a decision was made outside the code.

**Output format:**
- Inline comments on specific lines for concrete findings
- A summary comment at the top of the PR grouping findings by category and severity (Critical / High / Medium / Low)
- Each finding includes: what the issue is, which line, and a suggested fix where one is clear

**Severity guide:**
- **Critical:** security vulnerability or bug that will cause incorrect behavior in production
- **High:** logic error or missing test coverage for a non-trivial path
- **Medium:** convention violation or scope creep
- **Low:** style, naming, minor documentation gap

See the PR Review section under Claude's Role for the execution steps.

---

## Build Pipeline & CI Integration

Build pipeline details (what deploys where, environment config, deployment triggers) live in the infrastructure-as-code plan (01). This plan owns the git side: how commits, tags, and PRs interact with CI.

**On every push:**
- CI runs lint, tests, build
- Results reported back as status checks on the PR
- Branch protection blocks merge until all required checks are green

**On tag push (`v*`):**
- CD pipeline triggers deployment
- Claude reads the CI/CD config to understand what environments and approval gates are involved before tagging

**Other plans that touch git defer here** for commit format, branching, PR creation, and tagging conventions. Those plans reference this plan rather than duplicating rules.

---

## Claude's Role — Participation Protocol

### Pre-Flight Checks (Before Any Git Operation)

Dispatched as a `preflight` operation to the subagent. The subagent checks and returns a structured report:

- Current branch (fail if `main`)
- Remote reachability (fail if unreachable)
- Uncommitted or untracked changes
- Whether a CI configuration file exists
- Whether pre-commit hooks are installed

Main context reads the report and decides whether to proceed, warn, or stop. On remote auth failure: stop, surface the error to the user with re-auth steps.

---

### Reading Existing Repo Conventions

Dispatched as a `read-conventions` operation to the subagent at the start of work on any repo. The subagent reads and returns:
- Recent branch names (last 10)
- Recent commit messages (last 20) — format and Jira key usage
- Existing tags — versioning pattern in use
- Branch protection status if readable

Main context reads the summary and decides which conventions to follow. Where nothing is established, the standards in this plan are the default. `CLAUDE.md` overrides always take precedence.

---

### Git Operations via `git-manager` Skill

All git operations — including basic single-file commits — are handled by the `git-manager` skill (Plan 08 — Skills System). This is intentional. Routing every git operation through the skill, rather than only complex workflows, enforces a consistent cadence: pre-flight checks run, commit message format is verified, files are staged explicitly, and hook output is surfaced every time. The uniformity is the point. It is not over-engineering for simple commits; it is how good git practice is made automatic across all repos regardless of task size.

The skill is invoked by the main context and executes the correct sequence of git commands. Main context owns decisions about *what* to do; the skill owns *how* to do it safely.

**What main context provides:**
- An intent or workflow name: `start-work`, `commit`, `publish`, `sync`, `finish`, or an atomic operation
- For `commit`: the list of files to stage and the exact commit message (fully formed by main context)
- For `start-work`: the branch name to create
- For `tag`: tag name and annotation message

**What the skill returns:**
- Success or failure with a brief summary of what was done
- Commit hash (on commit)
- Conflicts, hook output, or auth errors that require a decision
- Warning flags (WIP commits detected, large diff, branch behind main)

**What stays in main context:** all decisions — which files to stage, what the commit message says, when to tag, whether to proceed after a warning, PR content. Main context never runs git commands directly.

---

### Commit Workflow

Main context forms the complete commit message and file list, then dispatches the `commit` workflow:

1. Agent runs: `git status` → `git diff` → stage specified files → `git diff --staged` → commit
2. If staged diff contains unexpected content (debug code, unrelated files, credentials): agent stops and surfaces before committing
3. Agent returns: commit hash on success; hook output on rejection
4. On hook rejection: main context reads the output and decides how to fix — agent does not retry with `--no-verify` unless explicitly instructed

---

### PR Creation

**What main context needs before opening a PR:**
- Branch commit history and diff — fetched via `get-branch-summary` atomic operation; agent returns commit list and unified diff summary
- `CLAUDE.md` for repo-specific reviewer or target branch rules

**Steps:**
1. Dispatch `publish` workflow — agent pulls latest, pushes branch, confirms CI triggered, returns any WIP commit warnings
2. If agent flags WIP/debug commits in the branch: surface to user before opening PR; suggest `git rebase -i` to squash (only safe before PR is open)
3. Dispatch `get-branch-summary` to get commit list and diff
4. Main context constructs PR title (conventional commit format, Jira key) and populates description template
5. Verify diff scope matches the linked ticket — if unrelated changes are present, flag to user before opening
6. Open PR via the Bitbucket REST API (see Tooling section) or output details for manual submission
7. Report PR URL
8. Do not request specific reviewers unless user specifies

---

### PR Review

**Trigger:** Claude reviews a PR when explicitly asked. Review is not automatic — it requires a user instruction or a comment on the PR requesting it.

**What Claude needs:**
- The full diff and changed file list — fetched via the Bitbucket REST API or via `get-branch-summary` subagent operation if reviewing before PR is open
- The existing test files for any files touched by the diff — needed to assess coverage
- `CLAUDE.md` for repo-specific conventions to check against
- Recent git history for context on patterns and why certain structures exist
- Ability to post inline comments — via the Bitbucket REST API

**Steps:**
1. Fetch the diff and the list of changed files
2. For each changed file, read the corresponding test file if one exists
3. Read `CLAUDE.md` for any repo-specific rules that apply
4. Run review passes in sequence (see PR Review — What Claude Checks in the Standards section for the full criteria):
   - Logic errors and null/undefined access
   - Security patterns
   - Test coverage gaps
   - Breaking changes to exported interfaces
   - Convention compliance against `CLAUDE.md` and existing patterns
   - Scope check against the linked ticket
5. Collect findings. For each: file path, line number, category, severity, description, suggested fix if clear
6. Filter out anything that is a style preference without a rule backing it — only flag things with a concrete reason
7. Post inline comments on specific lines for each finding
8. Post a summary comment grouping findings by severity

**What Claude does not do:**
- Approve the PR
- Make a merge recommendation
- Judge architectural decisions without explicit context
- Flag things as issues if they're just different from Claude's preference with no rule violated

---

### Release Tagging

Main context determines the version and writes the annotation. Subagent creates and pushes the tag.

1. Dispatch subagent to fetch commits since last tag — subagent returns commit type list and current tag
2. Main context determines next version: `feat` → MINOR, `fix` → PATCH, `BREAKING CHANGE` → MAJOR
3. Main context writes the annotation message (short release summary)
4. Dispatch subagent: create annotated tag, push to remote
5. Pushing the tag triggers CI which runs `semantic-release` in changelog-only mode — generates the changelog file from commit history between tags

**Build pipeline integration:** pushing a tag triggers the CD pipeline. The specifics (deploy targets, environments, approval gates) are defined per repo. Before tagging, main context reads the CI/CD config to understand what will be triggered — subagent fetches the config file contents if needed.

---

### On Failure

| Failure | Response |
|---------|---------|
| MCP auth failure | Stop. Report which MCP. Provide re-auth steps. Do not retry. |
| CI failure after push | Report the failing check, link to logs if available. Do not push again until fixed. |
| Merge conflict | List conflicting files. Stop. Ask user — never auto-resolve. |
| Pre-commit hook rejection | Show hook output. Auto-fix if the hook supports it (lint/format). Re-attempt commit. Secret scan or commit format failures require manual fix. |
| No Bitbucket credential, or `curl` unavailable | Output full PR title and description for manual submission via the Bitbucket UI. |

---

## Deliverables

| # | Deliverable | Location | Notes |
|---|-------------|----------|-------|
| 1 | `git-manager` skill | `~/.claude/skills/git-manager/SKILL.md` | All git CLI operations; spec in Plan 08 |
| 2 | Pre-commit config template | `templates/.pre-commit-config.yaml` | Standard hook set for new repos; copy in and install |
| 3 | PR description template | `templates/pr-description.md` | Main context populates this when creating PRs |
| 4 | Branch protection template | `templates/branch-protection.json` | Bitbucket API payload to apply standard rules to a repo |

---

## Cross-Plan Dependencies

| Plan | Relationship | Notes |
|------|-------------|-------|
| **Plan 03 — Testing System** | Pre-commit hooks optionally run tests | Test strategy plan defines what "fast enough for a hook" means and which tests qualify |
| **Plan 01 — Codebase Knowledge System** | Tag-triggered deployments connect to CD pipeline | IaC plan owns the pipeline definition; this plan owns the tagging that triggers it |
| **Plan 02 — Jira Integration** | Jira Smart Commits parse `[PROJ-N]` from commit footers automatically if configured | Confirm Smart Commits are enabled per repo |
| **Plan 08 — Skills System** | `git-manager` skill implementation depends on Plan 08 finalizing the skill spec | All git CLI operations are delegated to the skill |
