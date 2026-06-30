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
| `target-branch` | For `switch` (required); for `finish` (optional, default: `git.main-branch`) | Branch name to check out (`switch`) or explicit PR target branch (`finish`) |
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
4b. **PR-size soft-warn:** resolve the base from `project.json` `git.main-branch` (default `main` if the key is absent or `project.json` does not exist — do NOT hardcode `origin/main`). Call this value `<base>`. Run:

   ```bash
   git diff --stat origin/<base>...HEAD
   ```

   The `--stat` line-count is a **heuristic proxy** for the rule's "logical change" metric (see `rules/delivery-cadence.md`). It is an advisory signal, NOT a raw-LOC gate or a hard count — comment padding, whitespace, and generated code can inflate the number without increasing review burden. Use it to flag, not to refuse.

   Read the ceiling from `project.json` `git.pr-sizing.ceiling-loc` (default `400` if absent). If the stat shows more than `<ceiling>` lines changed OR more than 50 files changed, surface a non-blocking advisory (never refuse or abort the push):

   - **`posture: ongoing`** (or absent config): "Advisory: this branch diff is large (`<lines>` lines, `<files>` files — `--stat` is a heuristic proxy, not a raw-LOC gate). Consider splitting if review burden is high. See `rules/delivery-cadence.md`."
   - **`posture: new`**: "Note: this branch diff exceeds the sizing ceiling (`<lines>` lines, `<files>` files — `--stat` is a heuristic proxy, not a raw-LOC gate). Review `rules/delivery-cadence.md` slicing patterns before opening the PR."
   - Absent `git.pr-sizing` entirely → treat as `ongoing` and use the default ceiling.

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
4b. **Merge Strategy Resolution:**

   **Resolve the PR target branch `<dst>`:** Use the caller-supplied `target-branch` input if provided; otherwise read `project.json` `git.main-branch` (default `main` if the key is absent or `project.json` does not exist). This is the branch the PR targets, and the branch name matched against the merge-strategy map. When `target-branch` is omitted the behavior is identical to before this step existed — backward compatible.

   **Read the merge-strategy map:** Read `project.json` `git.merge-strategy` — a map of branch-pattern → strategy value.

   Example schema:
   ```jsonc
   "git": { "merge-strategy": { "main": "squash", "release/*": "merge-commit", "prod": "merge-commit" } }
   ```

   Valid strategy values: `"squash"` | `"merge-commit"` | `"rebase"`.

   **Matching rules (glob, order-independent):**
   - Exact branch name beats any wildcard.
   - Among wildcards, the longest (most-specific) pattern wins.
   - This is deterministic and does NOT depend on JSON key/declaration order.

   **Default:** When `git.merge-strategy` is absent, or no pattern matches `<dst>` → use `squash`. This preserves backward compatibility with repos that do not declare a map.

   **Named outputs:** This step produces two resolved values — `<dst>` (the PR target branch) and `<merge-strategy>` (the matched or defaulted strategy) — that all subsequent steps in `finish` consume. Later steps (diff inspection, `create_pr`, and the checks that follow) reference these resolved values rather than re-reading `project.json`.

   **Scope of this step:** This step resolves and records the intended merge strategy for `<dst>`. It does NOT enforce it. Enforcement is host-side (branch-protection rules or repository merge settings — see `## Merge Strategy`). The promotion conflict preview and the host merge-method divergence check (both added to this workflow next) consume `<merge-strategy>` and `<dst>`.

5. **Diff inspection:** fetch the branch diff (`git diff origin/<dst>...HEAD`, where `<dst>` is the PR target branch resolved in step 4b); flag unrelated changes before opening the PR.
5b. **Promotion conflict preview:** uses `<merge-strategy>` and `<dst>` from step 4b — no re-resolution.

   **Gate on strategy:** run this step ONLY when `<merge-strategy>` is `merge-commit`. For `squash` or `rebase`, skip it entirely.

   **Version floor — git ≥ 2.38** (required for `merge-tree --write-tree`). Before running, check the git version using the portable POSIX version-gate (mirrors the style from § Branch Binding (P2) — `sort -V` is GNU-only and fails on macOS BSD sort; strip the `.windows.N` suffix):

   ```bash
   # git >= 2.38 required for merge-tree --write-tree.
   # Strips the .windows.N suffix that git for Windows appends to its version string.
   v=$(git version | awk '{print $3}')          # e.g. 2.38.0  or  2.43.0.windows.1
   v=$(printf '%s' "$v" | cut -d. -f1,2)        # strip patch + any .windows.N suffix → e.g. 2.38
   major=$(printf '%s' "$v" | cut -d. -f1)
   minor=$(printf '%s' "$v" | cut -d. -f2)
   if [ "${major:-0}" -gt 2 ] || { [ "${major:-0}" -eq 2 ] && [ "${minor:-0}" -ge 38 ]; }; then
     # git >= 2.38 — safe to run merge-tree --write-tree
     ...
   else
     echo "promotion conflict preview requires git >= 2.38; skipping"
   fi
   ```

   If git is older than 2.38, **skip the preview and warn** — degrade, do NOT block the PR.

   **Read-only in-memory merge — do NOT mutate the working tree.** The command is:

   ```bash
   git merge-tree --write-tree --name-only origin/<dst> HEAD
   ```

   This computes the merge of `HEAD` (the source being promoted) and `origin/<dst>` (the target) entirely in memory. It exits **non-zero and lists the conflicted paths on stdout** when there are conflicts; exits zero when clean. Explicitly: **no `git merge`, no `--no-commit`/`--no-ff`, no `git merge --abort`, no working-tree mutation, no dirty or half-merged state possible.** This read-only approach deliberately replaces an older `--no-commit --no-ff` + abort approach, which mutated the tree and risked leaving a half-merged state on interruption.

   Note on argument order: for conflict-path detection via `--name-only`, the result is symmetric in the two refs — argument order does not change which conflicts are found; it only affects which side reads as "ours" in a hunk, which `--name-only` does not surface.

   **Outcomes:**

   - **On conflict (non-zero exit):** key this branch on the **exit code**, not on the path list being non-empty — `merge-tree` can exit non-zero with an *empty* `--name-only` list for conflicts that are not per-file (e.g. directory-rename conflicts), so an empty list is still a conflict. Surface the conflicted file list (or, when the list is empty, "conflict has no per-file paths — inspect manually") and a short resolution recipe:
     > "Promotion merge preview found conflicts in: [list of paths, or 'no per-file paths — inspect manually']. The promotion will need manual conflict resolution or a rebase before merging. Note: a prior squash onto a promotion branch stales the merge-base, so `merge-commit` strategy is recommended for promotion branches going forward. Proceeding to open the PR — resolve conflicts before merging."
     Then proceed (this preview is advisory; it does not hard-block the PR, but the conflict is made visible so the user can decide).

   - **On clean (zero exit):** report "Promotion merge previews clean." and continue.

5c. **Host merge-method divergence check:** uses `<merge-strategy>` and `<dst>` from step 4b — no re-resolution. This step runs only when the **active** adapter (after any `auth_preflight` fallback in step 4) is `github`, `gitlab`, or `bitbucket` — not `manual`. If step 4's `auth_preflight` returned `missing-cred` and fell back to `manual`, skip this step entirely.

   **Call `read_pr(<src>)`** per the contract in `references/host-adapters.md`, where `<src>` is the **source/feature branch being finished** (`git branch --show-current`) — NOT `<dst>`. (`read_pr` looks up the PR for its head/source branch: `gh pr view <src>`, `glab mr view <src>`, Bitbucket `source.branch.name="<src>"`; passing `<dst>` would query the wrong branch.) It returns a normalized `{ state, url, merge_method? }`. Do NOT inline adapter logic here — each adapter's `read_pr` block owns its own transport and normalization.

   **Compare** the returned `merge_method` against `<merge-strategy>`:

   - **On `merge_method: unavailable` (field-level) or whole-return `unavailable`** — skip silently. Do NOT warn. Missing or ambiguous data is not a divergence. This covers: `manual` host (no API), GitHub with multiple merge methods allowed, `glab` unable to surface project merge settings, Bitbucket (does not expose allowed merge methods via this contract), any read failure.

   - **On a concrete `merge_method` that differs from `<merge-strategy>`** — surface a non-blocking warning, then proceed:
     > "⚠ project.json requests `<merge-strategy>` for `<dst>` but the host is configured for `<host_method>`. The host enforces the actual merge — align branch-protection settings."

   - **On a concrete `merge_method` that matches `<merge-strategy>`** — silent, proceed.

   **git-manager requests the strategy and flags divergence; it does NOT enforce.** The host enforces the actual merge via branch-protection rules or repository merge settings. This check is advisory — it never blocks the PR.

5d. **PR-size soft-warn:** reuse the already-resolved `<dst>` from step 4b (no re-read of `project.json`). Run:

   ```bash
   git diff --stat origin/<dst>...HEAD
   ```

   The `--stat` line-count is a **heuristic proxy** for the rule's "logical change" metric (see `rules/delivery-cadence.md`). It is an advisory signal, NOT a raw-LOC gate or a hard count — comment padding, whitespace, and generated code can inflate the number without increasing review burden. Use it to flag, not to refuse.

   Read the ceiling from `project.json` `git.pr-sizing.ceiling-loc` (default `400` if absent). If the stat shows more than `<ceiling>` lines changed OR more than 50 files changed, surface a non-blocking advisory (never refuse or abort PR creation):

   - **`posture: ongoing`** (or absent config): "Advisory: this branch diff is large (`<lines>` lines, `<files>` files — `--stat` is a heuristic proxy, not a raw-LOC gate). Consider splitting if review burden is high. See `rules/delivery-cadence.md`."
   - **`posture: new`**: "Note: this branch diff exceeds the sizing ceiling (`<lines>` lines, `<files>` files — `--stat` is a heuristic proxy, not a raw-LOC gate). Review `rules/delivery-cadence.md` slicing patterns before opening the PR."
   - Absent `git.pr-sizing` entirely → treat as `ongoing` and use the default ceiling.

6. **`create_pr(title, body, src_branch, dst_branch)`:** open the PR through the detected adapter, where `dst_branch` is the resolved `<dst>` from step 4b — not separately derived. Pass the rendered title (`type: subject [PROJ-N]`) and body (from the template below, or the `pr-body` override). The adapter parses its host's output and returns a normalized **PR URL**; the `manual` adapter returns the sentinel `manual submission required`. The per-adapter `create_pr` blocks in `references/host-adapters.md` own all host-specific transport — `gh pr create` for GitHub, `glab mr create` for GitLab, the self-contained `git credential fill` + `curl` REST script for Bitbucket (which retrieves the credential non-interactively, builds the auth header in a variable, and unsets all secrets), and the rendered title/body for `manual`. Do not inline any of that here. All Bitbucket secret-handling guarantees live in that block.
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

### 7. `clean-gone` — Prune local branches whose upstream was deleted

Purpose: after PRs merge on the remote, clean up local tracking branches marked `gone` and their associated worktrees.

#### Step 1 — Resolve base branch

Read `project.json` at the repo root. Use `git.main-branch` if present; default to `main` if the key is absent or `project.json` does not exist. Call this value `<base>`. Do NOT hardcode `main` — on repos using `master` or `trunk`, `git branch --merged origin/main` would return empty and every gone branch would read as unmerged, triggering spurious force-delete prompts.

#### Step 2 — Fetch and prune remote refs

```bash
git fetch --prune origin
```

This removes remote-tracking refs (`origin/<branch>`) for branches that no longer exist on the remote. It does NOT delete local branches — Step 3 does that.

#### Step 3 — Enumerate gone branches

```bash
git branch -vv
```

Parse for lines that contain `: gone]` in the upstream tracking column. These are local branches whose upstream has been deleted. **Exclude the current branch** (`git branch --show-current`) from this list unconditionally — it is never a candidate for deletion, regardless of its upstream state.

#### Step 4 — Build worktree map

Before any deletion, parse `git worktree list --porcelain` once to build a `branch-name → worktree-path` map. This must happen before Step 5 because `git branch -d/-D` refuses to delete a branch that is currently checked out in a linked worktree — worktree removal must precede branch deletion.

```bash
git worktree list --porcelain
```

This outputs blocks like:
```
worktree /path/to/worktree
HEAD <sha>
branch refs/heads/<branch-name>
```

Parse these blocks to build the map: strip the `refs/heads/` prefix so the key is the bare branch name.

#### Step 5 — Present list for confirmation

Show the user the list of gone branches before any deletion. Surface it as:

```
The following local branches have no upstream (merged or deleted on remote):
  <branch-1>
  <branch-2>
  ...

Proceed with analysis? Merged branches will be deleted automatically. Unmerged branches
will each require a separate typed 'force-delete <branch>' confirmation before deletion.
(y/n)
```

If the list is empty, report "No gone branches found." and stop. Never delete without confirmation.

#### Step 6 — Per-branch: worktree remove → sidecar clean → branch delete

For each branch in the confirmed list, execute in this exact order:

**6a. Worktree removal (if applicable)**

Look up the branch in the map built in Step 4.

If the branch has an associated worktree:

> **Why worktree removal must come first:** `git branch -d` and `git branch -D` both refuse to delete a branch that is currently checked out in any linked worktree, returning `error: Cannot delete branch '<name>' checked out at '<path>'`. The worktree must be removed before the branch can be deleted.

```bash
git worktree remove "<worktree-path>"
```

If `git worktree remove` fails (e.g., the worktree has uncommitted changes), do NOT force removal and do NOT silently skip. Instead:

1. Surface the worktree's state to the user:
   ```bash
   git -C "<worktree-path>" status --short
   ```
2. Tell the user: the worktree at `<path>` has uncommitted changes and cannot be removed automatically. Options: commit or stash the changes manually, remove the worktree manually, or skip this branch entirely.
3. **Skip the branch-delete for this branch** (the worktree still holds it checked out; the delete would fail anyway). Note it in the final report as "skipped — worktree has uncommitted changes."

**6b. Sidecar cleanup (if worktree was successfully removed)**

```bash
repo_root=$(git rev-parse --show-toplevel)
wt_name=$(basename "<worktree-path>")
# Remove the per-worktree sidecar created by using-git-worktrees.
# Safe unconditionally — no-op if the sidecar was never created.
rm -rf "$repo_root/.claude/worktrees/$wt_name"
```

The repo root is anchored via `git rev-parse --show-toplevel` because `clean-gone` may run from any CWD; a relative path would resolve incorrectly if CWD is not the repo root.

**6c. Branch deletion**

**Merged check (use the remote ref — local `<base>` may be stale):**

```bash
git branch --merged origin/<base>
```

- **If the branch appears in this output (merged into `origin/<base>`):**
  Delete safely: `git branch -d <branch>`. (`-d` refuses if the branch is not fully merged, providing a backstop.) On successful deletion, set `reindex_needed = true`. (`<base>` here is the value resolved in Step 1 — the configured `git.main-branch`, defaulting to `main`. Promotion bases beyond main are out of scope for this trigger.)

- **If the branch does NOT appear (not merged):**
  Flag it explicitly and require a per-branch explicit confirmation before force-deleting:

  ```
  Branch <branch> is NOT merged into origin/<base>. Force-delete anyway?
  Commits that would be lost: <git log --oneline origin/<base>..<branch>>
  Type 'force-delete <branch>' to confirm.
  ```

  Wait for exact typed confirmation. If confirmed: `git branch -D <branch>`. If not confirmed: skip this branch and note it in the final report. **Do NOT set `reindex_needed`** for force-deleted unmerged branches — that work never landed in the base branch, so the graph has not changed.

If the branch has NO associated worktree: proceed directly to 6c (branch deletion). No worktree step.

#### Step 7 — Report (summary)

Surface a summary:

```
Pruned:
  <branch-1>  (merged, worktree removed at <path>)
  <branch-2>  (merged, no worktree)

Force-deleted (unmerged, explicitly confirmed):
  <branch-3>  (worktree removed at <path>)

Skipped (unmerged, not confirmed):
  <branch-4>

Skipped (worktree has uncommitted changes — manual cleanup required):
  <branch-5>  (worktree at <path>)

Codebase graph: <reindex triggered | skipped — no merged branches | skipped — no .claude-init/CODEBASE.md>
```

If nothing was pruned, say so. Always report what was skipped and why. The `Codebase graph` line is finalized by Step 8 below — assemble this summary in Step 7 but emit it once, after Step 8 completes, so the reindex outcome is included.

#### Step 8 — Post-prune reindex (fires once, after the full loop)

**Gate:** this step runs only when BOTH conditions are true:

1. `reindex_needed` is `true`. The flag starts `false` (initialize it before the Step 6 per-branch loop) and is set `true` only by a successful merged `-d` delete in Step 6c — never by an unmerged `-D` force-delete.
2. `.claude-init/CODEBASE.md` exists at the repo root.

If either condition is false, skip this step entirely and silently — the `Codebase graph` line in the final report then states the skip reason (`skipped — no merged branches` or `skipped — no .claude-init/CODEBASE.md`).

**When both conditions are met:**

**Resolve the repo root in native OS form** (required — a bare `pwd` MSYS path breaks the codebase-memory MCP on Windows):

```bash
repo_root=$(git rev-parse --show-toplevel)
```

`git rev-parse --show-toplevel` emits `C:/Users/...` on Windows and `/Users/...` or `/home/...` on macOS/Linux — the correct native absolute path on every platform. Do NOT use `pwd` or `pwd -P` here; those produce MSYS-format paths on Windows that the native MCP server cannot resolve.

**Resolve the project name** (required — every codebase-memory graph tool requires a `project` argument):

1. Read the repo's `CLAUDE.md` and look for a "Codebase Knowledge Graph" section. Use the project name listed there.
2. If that section is absent, call `list_projects()` (codebase-memory MCP) and find the entry whose `repo_path` matches `$repo_root`. Use its name.
3. Do NOT derive the name from the path by hand — the slashes-to-hyphens conversion preserves internal underscores in unintuitive ways and is not reliable.

**Trigger the reindex — exactly once:**

Call `index_repository` (codebase-memory MCP) with:
- `repo_path`: the native absolute path from `git rev-parse --show-toplevel` above.
- `project`: the name resolved above.

Do NOT call `index_repository` inside the per-branch loop. This is a single call made once, after all branches have been processed, using the boolean set during the loop.

**Poll to completion** (inline — do not cross-reference `infra-init`):

After `index_repository` returns, poll `index_status` (codebase-memory MCP, same `project` argument) in a bounded loop:

- Call `index_status`. If it returns `complete`, stop polling and report success.
- If it returns `error`, stop polling and surface the error to the user.
- If it returns any other status (e.g., `indexing`, `pending`), wait a short interval (a few seconds) and retry.
- Stop after up to 20 retries (a few seconds apart). If still not complete, surface: "Codebase graph reindex did not complete within the polling window — check `index_status` manually."

**Report:** Update the "Codebase graph" line in the Step 7 summary to: `reindex triggered and complete` (or `reindex triggered — polling timed out` if the bounded retry count was reached).

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
| `clean-gone`: current branch is a gone candidate | Exclude it unconditionally — never delete the branch currently checked out. |
| `clean-gone`: unmerged branch force-delete | Require typed `force-delete <branch>` confirmation per branch; never force-delete silently. |

---

## Warnings (proceed but flag)

| Condition | Warning |
|-----------|---------|
| Branch diff (`git diff --stat origin/<base/dst>...HEAD`) exceeds `git.pr-sizing.ceiling-loc` lines (default 400) OR exceeds 50 files — evaluated in `publish` (step 4b) and `finish` (step 5d) | Non-blocking advisory; `--stat` is a heuristic proxy for logical change per `rules/delivery-cadence.md`, not a raw-LOC gate. Message tone scales with posture: `ongoing` → advisory note; `new` → clearer nudge. Never refuses or aborts. |
| WIP/TODO/FIXME/debug in staged content | Flag specific lines |
| Branch open >5 days without PR | Note it |
| Branch >10 commits behind `main` | Recommend `sync` |

---

## Merge Strategy

The merge strategy is resolved per-PR, not globally fixed:

- **Default: `squash`** — used when `project.json` has no `git.merge-strategy` key, or when no pattern matches the PR's target branch. This preserves backward compatibility.
- **Per-branch overrides** — `project.json git.merge-strategy` is a glob map of `branch-pattern → squash | merge-commit | rebase`. The resolution happens in the `finish` workflow's **Merge Strategy Resolution step (step 4b)**, which produces the named outputs `<dst>` and `<merge-strategy>` consumed by later steps.
- **Enforcement is host-side** — git-manager requests the strategy and flags divergence; it does not run the merge. Specifically:
  - Step 5b (**read-only `merge-tree` dry-run**) previews promotion conflicts for `merge-commit` targets before the PR opens — no working-tree mutation occurs.
  - Step 5c (**host merge-method divergence check**) warns when the host's configured merge method disagrees with the resolved `<merge-strategy>`. This check is advisory and non-blocking.

  The host (branch-protection rules or repository merge settings) enforces the actual merge.

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
7. The promotion conflict preview (Step 5b in `finish`) is read-only — it uses `git merge-tree --write-tree` and makes no working-tree mutation, no staged changes, no half-merged state. It is gated on `<merge-strategy>` being `merge-commit` (skipped for `squash` and `rebase`) and on git ≥ 2.38. On older git it degrades with a warning and never blocks the PR. It is advisory — the PR opens regardless of conflict findings.
8. The host merge-method divergence check (Step 5c in `finish`) is advisory and non-blocking. It warns when `read_pr` returns a concrete `merge_method` that differs from the `project.json`-resolved `<merge-strategy>`. It stays silent for any `unavailable` result (whole-return or field-level) — missing data is not a divergence. git-manager flags; the host enforces.
