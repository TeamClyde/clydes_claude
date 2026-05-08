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

## Workflows

### 1. `start-work` — Create branch and push

1. `git fetch origin && git checkout main && git pull origin main`
2. `git checkout -b <branch-name>` per naming pattern
3. `git push -u origin <branch-name>`
4. Report branch name and tracking ref.

---

### 2. `commit` — Stage specified files and commit

1. `git status` and `git diff` — review current state
2. Stage specified files only: `git add <file>` for each file
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

### 5. `finish` — Open PR via Bitbucket MCP

1. Run `publish` workflow first
2. If WIP/debug commits flagged: surface to user, suggest squash rebase (only safe pre-PR)
3. Fetch branch diff via Bitbucket MCP; flag unrelated changes before opening PR
4. Open PR via `@aashari/mcp-server-atlassian-bitbucket` MCP:
   - Title: `type: subject [PROJ-N]`
   - Target: `main`, squash merge
   - Body: from template below (or `pr-body` override)
5. If Bitbucket MCP unavailable: output title + description for manual submission
6. Report PR URL on success

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
| MCP auth failure | Report which MCP failed. Do not retry. |

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

---

## Out of Scope

This skill does not: call Jira, read source code, decide which files to commit, bypass hooks, or auto-resolve conflicts.

## Gotchas

1. Never run git commands directly with Bash — this skill is the abstraction layer; use it from within.
2. Commit message format is `type: description [PROJ-N]` — do not omit the Jira key unless the repo has `jira.enabled: false` in project.json.
3. Do not push to main/master directly — always push a feature branch.
