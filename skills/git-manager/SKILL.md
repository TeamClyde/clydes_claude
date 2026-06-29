---
name: git-manager
description: >
  Use when committing files, creating a branch, pushing to remote, syncing with
  main, opening a pull request, or when a merge conflict needs to be surfaced and
  handled safely. Invoke for any git action during development — starting work,
  recording progress, shipping, or managing conflicts.
argument-hint: "commit files:[file1,file2] type:feat|fix|refactor|chore|docs|test|perf description:'...' jira-key:PROJ-N"
allowed-tools: Skill, Bash, Read
---

# git-manager

Caller owns decisions (files, message, timing). This skill owns safe, consistent execution.

---

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `files` | For `commit` | Explicit file list — no wildcards |
| `type` | For `commit` | `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf` |
| `description` | For `commit` | Subject line (imperative mood, max 72 chars) |
| `jira-key` | Conditional (see table below) | Jira issue key (e.g. `PROJ-42`) |
| `pr-body` | For `finish`, optional | Override PR description body |
| `target-branch` | For `switch` | Branch name to check out |
| `target-plan` | For `switch` | Plan doc path to activate (e.g. `plans/slug/<slug>-plan.md`); required — no branch→plan index exists |

---

## Jira Key Requirement

A "configured Jira project" means `project.json` at the repo root has `jira.enabled: true` and a concrete `jira.project` value (e.g. `"PROJ"`).

If `project.json` is absent, or `jira.enabled` is `false` or missing: treat the project as untracked — no Jira key required.

**Fallback (no project.json):** Check whether CLAUDE.md contains a concrete project key — not a placeholder like `[PROJ]` or a missing field. This fallback exists for repos that have not yet run project-setup.

| Repo CLAUDE.md has configured Jira project? | Key provided? | Action |
|---------------------------------------------|--------------|--------|
| No (missing, placeholder, or not present) | No | Proceed without Jira footer |
| No (missing, placeholder, or not present) | Yes | Include in footer |
| Yes | No | Ask for key before committing |
| Yes | Yes | Include in footer |

## Commit Format

```
type(optional-scope): subject

Body (when the diff alone would not tell a reviewer *why* the change was made).
Wrap at 72 chars.

[PROJ-N]
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**Body:** required when the diff alone would not tell a reviewer *why* the change was made. When uncertain, write the body.

**Footer:** Jira key `[PROJ-N]` per the table above, then `Co-Authored-By` trailer.

---

## Branch Naming

`<type>/PROJ-N-slug` — types: `feature`, `fix`, `chore`, `docs`. Include Jira key when one exists. Slugs are short and descriptive.

Before first operation on any repo, run `git log --oneline -20` and `git branch -a`. Follow existing repo conventions when they differ from defaults.

---

## Branch Binding (P2)

The **expected-branch binding** records which branch a given worktree is supposed to be on, so downstream checks (the `commit` soft-warn, session-start, the SDD exit gate) can detect when HEAD has drifted to the wrong branch. The binding is stored in **native per-worktree git config** — not a `.claude` sidecar file. Native `--worktree` config scopes automatically per worktree, needs no keying, and covers the main/default worktree that `using-git-worktrees` never created a sidecar for.

**Git-version floor.** `--worktree` config requires `git ≥ 2.20`. Preflight with `git --version`; if git is older, **skip the binding entirely** — set nothing, read nothing, warn nowhere. On older git the `--worktree` write silently falls back to local config, which defeats per-worktree isolation, so degrade to no-binding rather than write a broken shared binding.

**Portable version-gate snippet (use this form — `sort -V` is GNU-only and fails on macOS BSD sort):**

```bash
# git >= 2.20 required for per-worktree config (extensions.worktreeConfig).
# Strips the .windows.N suffix that git for Windows appends to its version string.
v=$(git version | awk '{print $3}')          # e.g. 2.39.0  or  2.43.0.windows.1
major=$(printf '%s' "$v" | cut -d. -f1)
minor=$(printf '%s' "$v" | cut -d. -f2)
if [ "${major:-0}" -gt 2 ] || { [ "${major:-0}" -eq 2 ] && [ "${minor:-0}" -ge 20 ]; }; then
  # git >= 2.20 — safe to enable per-worktree config and set the binding
  ...
fi
```

**Enable (one-time, per-repo, idempotent).** `extensions.worktreeConfig` is a repo-wide setting that MUST live in the shared/common config, not a worktree-local one. Write it explicitly to the common config so it is correct even when run from inside a linked worktree:

```bash
git config --file "$(git rev-parse --git-common-dir)/config" extensions.worktreeConfig true
```

Ensure this is enabled before the first `--worktree` write in a repo.

**Set:**

```bash
git config --worktree claude.expectedBranch <branch>
```

**Read:**

```bash
git config --worktree --get claude.expectedBranch
```

Empty output → no binding → **no warning anywhere.** This is the soft-warn contract every consumer relies on: an unset binding is silent, never an error.

**Compare:** against the current branch from `git branch --show-current`. A mismatch is a soft-warn, never a block.

**Accepted pitfall (documented, not engineered around).** A renamed or rebased branch staling the binding produces one ignorable soft-warn. The binding is refreshed by `switch`, by `start-work`, and by the `writing-plans` rename — so the stale warning self-heals on the next branch operation. Not worth the complexity of auto-detecting renames.

---

## Workflows

### 1. `start-work` — Create branch and push

1. `git fetch origin && git checkout main && git pull origin main`
2. `git checkout -b <branch-name>` per naming pattern
3. `git push -u origin <branch-name>`
4. **Set the expected-branch binding (P2).** Use the portable version gate from § Branch Binding (POSIX integer comparison — not `sort -V`); if `git ≥ 2.20`, enable `extensions.worktreeConfig` then `git config --worktree claude.expectedBranch <branch-name>`. If git is older, skip silently — no binding.
5. Report branch name and tracking ref.

---

### 2. `commit` — Stage specified files and commit

1. `git status` and `git diff` — review current state
2. Stage specified files only: `git add <file>` for each file
2.5. **Pre-staged invariant check.** Run `git diff --cached --name-only` and compare to the `files:` parameter. If any path appears in the staged set but not in `files:`, **refuse** with:
   > "Pre-staged files outside the `files:` parameter detected: [list of orphan paths]. The plan-state validator and pre-commit hooks inspect the staged set — committing now would gate on a different set than the one you listed. Either: (a) re-invoke with these files included in `files:`, or (b) unstage them via `git reset HEAD <file>` and re-invoke. Never bypass by passing `[no-plan-update]` — that token applies to the staged set, which is not the set you're committing."

   This check protects the invariant **staged set = about-to-be-committed set**, which both the plan-state validator (Step 5) and `hooks/pre-commit` rely on. Proceed only when the staged set is exactly the `files:` set.
3. `git diff --staged` — verify staged content:
   - Stop if unexpected files, debug statements, secrets, or unrelated changes appear
4. Validate commit message against the Commit Format section (Jira key per the conditional table)
5. **Plan-state validator** (scope-driven — runs after all pre-commit validations, before git commit):
   1. Read `.claude/active-plan`. If absent → skip entirely, proceed to commit.
   2. Read the active plan's `plan.md` Task Reference and active task's File Structure entries. **Identify the active task** by reading `<top>-handoff.md` for the `Active task:` line, then locate that row in the Task Reference table. If the handoff is absent or the line is missing, treat the first non-✅ row in the Task Reference table as active.
   3. Compute intersection: staged file paths ∩ active task's File Structure paths.
   4. **Intersection empty** → out-of-scope commit. Proceed to commit normally. (Covers parallel small fixes during plan execution.)
   5. **Intersection non-empty** → in-scope commit. Check whether `<top>-plan.md` is in the staged set.
      - Yes → proceed to commit.
      - No → **refuse** unless commit message contains `[no-plan-update]`:
        > "Active plan scope touched but `<top>-plan.md` not staged. Update plan via `plan-management:divergence` or include `[no-plan-update]` in commit message to override. If `plans/` is gitignored in this repo, stage the plan with `git add -f <plan-path>` after invoking `plan-management:divergence`."
   6. **Override token `[no-plan-update]`**: allows the commit to proceed. The validator does NOT write to the journal — that would bypass the three-edit atomic invariant owned by `plan-management:divergence`. If the caller wants the override recorded, they invoke `plan-management:divergence` separately. The journal is written only by `plan-management:divergence`, never by this skill.
   - Path-level matching is the MVP. Symbol-level (DocSync-style) is deferred.
   - This validator runs in addition to (not replacing) the existing bash `hooks/pre-commit`.
5.5. **Branch soft-warn (P2)** (runs after all pre-commit validations, before `git commit`):
   1. Read the expected-branch binding: `git config --worktree --get claude.expectedBranch`.
   2. If the output is empty → **silent, proceed** (no binding = no warning; this is the soft-warn contract).
   3. If a binding is set, read the current branch: `git branch --show-current`.
   4. If current branch ≠ expected branch → surface a non-blocking warning, then **proceed with the commit**:
      > "⚠ You are on `<current>` but the active plan's expected branch is `<expected>`. Committing here anyway. Run git-manager `switch` if this is unintended."
   5. If current branch = expected branch → silent, proceed.
   - **This warn is intentionally non-blocking.** It never refuses, never aborts. Contrast with Step 5 (Plan-state validator), which can refuse based on file scope — this step checks branch only.
   - Requires `git ≥ 2.20` (per § Branch Binding (P2)). If the version gate was not met at binding-set time, `--worktree --get` returns empty → silent by the rule above.
6. `git commit -m "<message>"`
7. On hook rejection: surface full output, stop — never `--no-verify`
8. Report commit hash on success

---

### 3. `publish` — Pull latest and push branch

1. Preflight: block if on protected branch (`main`/`master`/`develop`/`release`), uncommitted changes, or remote unreachable
2. Pull strategy: no PR open → `--rebase`; PR open → `--merge`
3. On conflicts: list files, stop, do not auto-resolve
4. `git log --oneline main..HEAD` — flag WIP/TODO/FIXME/debug commits
5. `git push origin <branch>`
6. Report commit range pushed

---

### 4. `sync` — Bring branch up to date with main

1. Pull strategy: no PR open → `--rebase`; PR open → `--merge`
2. `git fetch origin` then pull with chosen strategy
3. On conflicts: list files, stop, do not auto-resolve

---

### 4b. `smoke-commit` — Disposable commit for validation tests

Use when a caller (typically a smoke-test subagent) needs to actually create a commit in order to exercise downstream behavior (pre-commit hooks, plan-state validator, push pipeline) but must not leave the commit on the branch. Eliminates the "remember to clean up" contract — the workflow itself owns the revert.

**Inputs:** same `files`, `type`, `description` as `commit`. Optionally `validation`: a description (string) of what the caller will inspect between commit and revert (e.g. "verify pre-commit hook output contains 'plan-state OK'").

1. Record the current HEAD: `git rev-parse HEAD` → save as `<rollback-sha>`.
2. Run the full `commit` workflow (including Step 2.5 pre-staged invariant check, Step 5 plan-state validator, Step 6 commit). If `commit` refuses or hook rejects, surface the failure — **do not auto-revert** (there's nothing to revert).
3. Report the new commit SHA and the `<rollback-sha>` to the caller. The caller now does its inspection.
4. **Revert unconditionally before returning control:** `git reset --soft <rollback-sha>` followed by `git reset HEAD` to also drop the staged set. The working tree is restored to whatever the caller's listed files looked like at smoke-commit invocation (unstaged), so the caller can re-test or discard freely.
5. Verify: `git rev-parse HEAD` must equal `<rollback-sha>`. If it doesn't (e.g., the inspection step somehow advanced HEAD), refuse to return — surface to the user with the discrepancy.
6. Report: "Smoke commit + revert complete. HEAD restored to `<rollback-sha>`. Files unstaged."

**Push prohibition.** `smoke-commit` must never push. If the caller wants the commit to persist, use the regular `commit` workflow — `smoke-commit` is for validation only and is structurally incompatible with push.

**Why this exists.** Smoke tests of git-manager itself (plan-state validator path, hook integration, etc.) need real commits to exercise. Without this workflow, the cleanup contract lives in the caller's instructions; any interrupted subagent leaves a polluted branch. With this workflow, revert is part of the call.

---

### 5. `finish` — Open PR (host-blind via the adapter contract)

This workflow is **host-blind**: it never branches on a host name. PR creation is delegated to the host-adapter contract in `references/host-adapters.md`, whose four operations (`detect_host`, `auth_preflight`, `create_pr`, `read_pr`) each parse their own host's output and return a **normalized** value. Adding a host means writing one adapter block in that file — never editing this procedure.

1. Run `publish` workflow first
2. If WIP/debug commits flagged: surface to user, suggest squash rebase (only safe pre-PR)
3. **`detect_host`:** resolve the target host per the contract. The `project.json` `git.backend` override wins over auto-detection when set (`github` | `gitlab` | `bitbucket` | `manual`) — use it for enterprise hosts (`github.mycompany.com`, self-hosted GitLab, Bitbucket Data Center) where the URL doesn't match a public host. Otherwise `git remote get-url origin` is matched: `github.com` → `github`, `gitlab.com` → `gitlab`, `bitbucket.org` → `bitbucket`, anything else → `manual`. Returns the normalized `{ host, owner_or_workspace, repo, api_base }`. See `references/host-adapters.md` § `detect_host` and the per-adapter `detect_host` blocks for the parsing rules.
4. **`auth_preflight`:** confirm a usable credential per the contract; returns `ok` or `missing-cred`. On `missing-cred`, fall back to `manual` and surface the adapter's one-line remediation (e.g. install `gh`/`glab`, or set up the Bitbucket API token). See `references/host-adapters.md` § `auth_preflight` and each adapter's block.
5. **Diff inspection:** fetch the branch diff (`git diff origin/main...HEAD`); flag unrelated changes before opening the PR.
6. **`create_pr(title, body, src_branch, dst_branch)`:** open the PR through the detected adapter, passing the rendered title (`type: subject [PROJ-N]`) and body (from the template below, or the `pr-body` override). The adapter parses its host's output and returns a normalized **PR URL**; the `manual` adapter returns the sentinel `manual submission required`. The per-adapter `create_pr` blocks in `references/host-adapters.md` own all host-specific transport — `gh pr create` for GitHub, `glab mr create` for GitLab, the self-contained `git credential fill` + `curl` REST script for Bitbucket (which retrieves the credential non-interactively, builds the auth header in a variable, and unsets all secrets), and the rendered title/body for `manual`. Do not inline any of that here. All Bitbucket secret-handling guarantees live in that block.
7. Report the PR URL returned by `create_pr` on success (or "manual submission required" with the rendered title/body for the `manual` path).

**Backend scope.** `github`, `gitlab`, and `bitbucket` are first-class adapters in `references/host-adapters.md`. Gitea, Azure DevOps, and other self-hosted variants use the `manual` fallback (or override via `project.json` `git.backend: manual` to make it explicit) until an adapter block is added for them — see the Extension Recipe in `references/host-adapters.md` (write one adapter block filling the four operations; no edit to this procedure is needed).

**PR description template:**

```
## Summary
2–3 sentences. What changed and why.

## Changes
- Bullet list of meaningful changes (not a commit log)

## Testing
How to verify. Note automated coverage.

## Linked Tickets
- PROJ-N: Ticket summary
```

---

### 6. `switch` — Context-switch to a different branch and plan

Inputs: `target-branch` (required), `target-plan` (required).

**Delegation boundary:** `switch` owns the git half of a context switch (clean-tree check, checkout, branch rebind). The plan-management half (writing `.claude/active-plan` and refreshing the target handoff) is owned entirely by `plan-management repoint`. `switch` must NOT write `.claude/active-plan` directly.

#### Step 0 — Required-input check

If `target-plan` is not supplied, REFUSE immediately with:

> "`switch` requires `target-plan` — the plan-doc path to activate (no branch→plan index exists). Find it under `plans/` or in `TODO.md` and re-invoke."

Do not proceed past Step 0 without `target-plan`.

#### Step 1 — Clean-tree check

Run `git status --porcelain`. If the output is non-empty (dirty working tree or index), STOP. Offer the user two options:

- **Stash:** `git stash push -m "claude-switch-<current-branch>"` — names the stash for easy recovery. After confirming, stash and proceed to Step 2.
- **Abort:** cancel the switch entirely.

Never auto-discard uncommitted changes. Wait for the user's explicit choice before proceeding.

#### Step 2 — Checkout target branch

Run `git checkout <target-branch>`.

- **Branch exists locally:** checkout succeeds — continue.
- **Branch absent locally, present on origin:** offer to create a local tracking branch: `git checkout -b <target-branch> origin/<target-branch>`. Confirm with the user before creating.
- **Branch absent on both local and origin:** report not-found and stop. Do not create a new unrelated branch — that is the `start-work` workflow's responsibility.

#### Step 3 — Refresh branch binding (P2)

Set `claude.expectedBranch` for this worktree to `target-branch` using the portable version gate from § Branch Binding (P2):

```bash
git config --worktree claude.expectedBranch <target-branch>
```

Apply the `git ≥ 2.20` version gate (POSIX integer comparison — not `sort -V`). If git is older, skip silently — no binding.

#### Step 4 — Repoint active plan

Invoke `plan-management` with `status: repoint` and `plan-doc: <target-plan>`. This is the only sanctioned path for writing `.claude/active-plan` during a context switch — do not write the file directly.

#### Step 5 — Report

Surface:

- New branch name and the checkout path taken (local / created-from-origin)
- Stash name, if a stash was created in Step 1 (e.g. `claude-switch-<old-branch>`)
- Repointed plan path, as confirmed by `plan-management repoint`

---

## Blocking Conditions

Stop immediately and surface to the user:

| Condition | Action |
|-----------|--------|
| Push to `main`/`master`/`develop`/`release/*` | Ask for explicit confirmation first |
| `git add .` or `git add -A` | Never. Stage specific files only. |
| Force push (`--force`) | Use `--force-with-lease` on feature branches only, with explicit user instruction |
| Pre-commit hook rejection | Surface full output. Never `--no-verify`. |
| Secrets/credentials in staged diff | Do not commit. Surface what was found. |
| Uncommitted changes when switching branches | Stash or ask user |
| Merge conflicts | List files, do not auto-resolve |
| Bitbucket credential missing (empty `git credential fill`) | Stop; direct the user to set up their API token per the `secrets-handling` rule. Do not prompt interactively. The check itself lives in the `bitbucket` adapter's `create_pr` in `references/host-adapters.md`. |
| Bitbucket HTTP 401 on PR create | Token may be invalid or lack pull-request scope. Surface the status; do not retry blindly. Handled inside the `bitbucket` adapter's `create_pr` in `references/host-adapters.md`. |

---

## Warnings (proceed but flag)

| Condition | Warning |
|-----------|---------|
| Staged diff exceeds 50 files | Surface count before committing |
| WIP/TODO/FIXME/debug in staged content | Flag specific lines |
| Branch open >5 days without PR | Note it |
| Branch >10 commits behind `main` | Recommend `sync` |

---

## Merge Strategy

All PRs squash-merge into `main`. Squash commit message = PR title (conventional commit format). No fast-forward or three-way merge commits on `main`.

The merge strategy is enforced **host-side** — by branch-protection rules or the host's repository merge settings — so this skill documents the expected squash policy; it does not (and cannot) guarantee it per-PR. Configure squash-only at the host to make the policy binding.

---

## Out of Scope

This skill does not: call Jira, read source code, decide which files to commit, bypass hooks, or auto-resolve conflicts.

## Gotchas

1. Never run git commands directly with Bash — this skill is the abstraction layer; use it from within.
2. Commit message format is `type: description [PROJ-N]` — do not omit the Jira key unless the repo has `jira.enabled: false` in project.json.
3. Do not push to main/master directly — always push a feature branch.
4. The `files:` parameter must match the staged set exactly — Step 2.5 refuses if pre-staged files exist outside the listed set. The validator and pre-commit hooks inspect the staged set, so a mismatch would let them gate on a phantom set. To proceed: include the orphans in `files:`, or `git reset HEAD <orphan>` first. Never use `[no-plan-update]` to bypass this — that token only applies to plan-doc staleness, not pre-stage drift.
5. Use `smoke-commit` (workflow 4b) when a caller needs a real commit purely to exercise downstream behavior (hooks, validator). Never instruct subagents to "commit then `git reset` afterward" — that pushes the cleanup contract onto the caller and breaks if the subagent is interrupted between the two steps. `smoke-commit` owns the revert.
6. The branch soft-warn (Step 5.5 in `commit`) is intentionally non-blocking. It warns and proceeds — it never refuses a commit. A mismatch means you may be committing to the wrong branch, not that you must stop. Use git-manager `switch` to move to the correct branch before the next commit. This is distinct from the Plan-state validator (Step 5), which checks file scope and CAN refuse.
