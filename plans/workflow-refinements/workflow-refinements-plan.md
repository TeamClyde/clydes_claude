# Workflow Refinements Implementation Plan

**Parent Plan:** —
**Status:** Ready for execution
**Priority:** Medium
**Repo:** claude-workflow-improvements
**Jira Project:** CLAUDE

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT use the `superpowers:` prefix — invoke the local forked versions which have git-manager and plan-gate integration.

**Goal:** Eliminate friction between the superpowers skill set and the custom workflow by adding per-repo config, a setup wizard, token-efficient orientation, unified plan doc paths, a lightweight feedback system, and a rules cleanup pass.

**Architecture:** All changes live in this repo (`claude-workflow-improvements`) and propagate to `~/.claude/` automatically via symlinks. The foundation is a new `project.json` schema; downstream skill patches read from it to gate Jira, architect review, TDD, and commit key requirements per-repo. Two new skills (`feedback`, `review-workflow`) add a non-interrupting feedback loop. All changes are to `.md` skill/agent files and JSON — no compiled code.

**Tech Stack:** Markdown skill files, JSON, bash (for symlink health check in project-setup)

**Spec:** `docs/superpowers/specs/2026-04-20-workflow-refinements-design.md`

---

## Task Reference

| # | Task | Size | Scope | Jira Key |
|---|------|------|-------|----------|
| 1 | Create project.json for this repo | S | repo root | _(assigned at plan-gate)_ |
| 2 | Create project-setup skill | M | skills/project-setup/SKILL.md (new) | _(assigned at plan-gate)_ |
| 3 | Update git-manager — read project.json | S | skills/git-manager/SKILL.md | _(assigned at plan-gate)_ |
| 4 | Update jira-workflow-manager — check project.json | S | agents/jira-workflow-manager.md | _(assigned at plan-gate)_ |
| 5 | Update plan-gate — check workflow.architect-review | S | skills/plan-gate/SKILL.md | _(assigned at plan-gate)_ |
| 6 | Update executing-plans — gate Jira steps on project.json | S | skills/executing-plans/SKILL.md | _(assigned at plan-gate)_ |
| 7 | Update test-driven-development — check workflow.tdd | S | skills/test-driven-development/SKILL.md | _(assigned at plan-gate)_ |
| 8 | Add orientation protocol to using-superpowers | S | skills/using-superpowers/SKILL.md | _(assigned at plan-gate)_ |
| 9 | Token efficiency patches — brainstorming and writing-plans | M | skills/brainstorming/SKILL.md, skills/writing-plans/SKILL.md | _(assigned at plan-gate)_ |
| 10 | Plan doc path unification | S | skills/brainstorming/SKILL.md, skills/writing-plans/SKILL.md, TODO.md | _(assigned at plan-gate)_ |
| 11 | Create /feedback skill | M | skills/feedback/SKILL.md (new) | _(assigned at plan-gate)_ |
| 12 | Create /review-workflow skill | M | skills/review-workflow/SKILL.md (new) | _(assigned at plan-gate)_ |
| 13 | Rules audit — consolidate and remove redundant entries | S | rules/filesystem-efficiency.md, rules/filesystem/efficiency.md, CLAUDE.md | _(assigned at plan-gate)_ |

---

## Testing Plan

Skills are `.md` files — there is no compilation step. Verification for each task is:
1. Read the modified file and confirm the expected section/text is present
2. Verify JSON files parse correctly (`python -m json.tool project.json`)
3. For behavioral changes: trace through the logic manually against a "Jira-enabled repo" scenario and a "no project.json" scenario to confirm graceful degradation

Test scenarios that must pass after all tasks complete:
- **Scenario A (no project.json):** All Jira operations skip silently. Architect review runs. TDD runs. No error thrown.
- **Scenario B (jira.enabled: false):** Same as Scenario A.
- **Scenario C (full config):** All operations enabled. Jira key required in commits. Architect review runs.
- **Scenario D (workflow.architect-review: false):** plan-gate skips Step 1 and proceeds directly to test-strategy.
- **Scenario E (workflow.tdd: false):** TDD skill exits immediately with a note.

---

## Task 1: Create project.json for this repo

**Files:**
- Create: `project.json` (repo root)

- [ ] **Step 1: Write project.json**

Create `project.json` at the repo root with these values:

```json
{
  "project": {
    "name": "claude-workflow-improvements",
    "description": "Personal Claude Code workflow — skills, agents, rules, hooks"
  },
  "jira": {
    "enabled": true,
    "project": "CLAUDE",
    "default-issue-type": "Task"
  },
  "git": {
    "main-branch": "main",
    "require-jira-key-in-commits": true
  },
  "workflow": {
    "architect-review": true,
    "tdd": false,
    "plan-gate": true
  }
}
```

Note: `tdd` is false because this repo contains only markdown and JSON files — TDD does not apply. No `codebase-entry` field because there is no CODEBASE.md.

- [ ] **Step 2: Validate JSON**

```bash
python -m json.tool project.json
```

Expected: clean JSON echoed back with no error.

- [ ] **Step 3: Commit**

```
Skill { skill: "git-manager", args: "commit files:[project.json] type:chore description:'add project.json — workflow config for this repo' jira-key:CLAUDE-N" }
```

---

## Task 2: Create project-setup skill

**Files:**
- Create: `skills/project-setup/SKILL.md`

- [ ] **Step 1: Create the skill directory and file**

```bash
mkdir -p skills/project-setup
```

Write `skills/project-setup/SKILL.md`:

```markdown
---
name: project-setup
description: One-time project initialization wizard. Runs init skills (CLAUDE.md, testing backbone, codebase graph) then generates project.json from interactive answers. Works on new and existing repos. Also verifies symlink health when run in the workflow repo.
argument-hint: "(no arguments needed — interactive)"
---

# project-setup

Initialize a repo for the Claude workflow. Generates `project.json` and optionally runs codebase init skills.

**Announce at start:** "I'm using the project-setup skill to initialize this project."

---

## Symlink Architecture (workflow repo only)

> This repo IS `~/.claude/` for workflow files. Symlinks mean editing any file here is immediately live — there is no sync step for edits to existing files. `setup.sh --force` is only needed when **adding new files** (to create new symlinks). Edit in this repo; Claude Code picks it up instantly.

---

## Phase 1 — Codebase Init

Ask the user which init skills to run. Skip any whose output already exists.

| Skill | Output | Skip condition |
|-------|--------|----------------|
| `init` | `CLAUDE.md` | CLAUDE.md exists at repo root |
| `e2e-init` | e2e test scaffolding | ask user if they want this |
| `infra-init` | codebase knowledge graph | ask user if they want this |

Run selected skills one at a time. Wait for each to complete before proceeding.

---

## Phase 2 — Interactive Questionnaire

Ask these questions one at a time. Record answers for Phase 3.

1. **Jira** — Does this project use Jira? (yes/no)
   - If yes: What is the Jira project key? (e.g. `PROJ`)
   - If yes: What is the default issue type? (default: `Task`)

2. **Git** — What is the main branch name? (default: `main`)

3. **Git** — Require Jira key in commit messages? (default: yes if Jira enabled, no otherwise)

4. **Workflow** — Enable architect review before execution? (default: yes)

5. **Workflow** — Enable TDD for this repo? (default: yes — set to no for config/infra/markdown-only repos)

6. **Workflow** — Enable plan-gate? (default: yes)

7. **Testing** — What command runs the test suite? (e.g. `npm test`, `pytest`, `go test ./...`) — skip if not applicable, enter `none`

8. **Orientation** — Is there a CODEBASE.md or equivalent orientation file? If yes, what is its path?

---

## Phase 3 — Write project.json

Construct `project.json` at the repo root from the questionnaire answers. Omit sections for features that are off or not applicable — keep the file lean.

Example for a full-featured repo:

```json
{
  "project": {
    "name": "my-service",
    "description": "Short description for ticket generation"
  },
  "jira": {
    "enabled": true,
    "project": "PROJ",
    "default-issue-type": "Task"
  },
  "git": {
    "main-branch": "main",
    "require-jira-key-in-commits": true
  },
  "workflow": {
    "architect-review": true,
    "tdd": true,
    "plan-gate": true
  },
  "testing": {
    "command": "npm test"
  },
  "codebase-entry": "CODEBASE.md"
}
```

Example for a scripts/utilities repo (minimal):

```json
{
  "project": {
    "name": "my-scripts"
  },
  "jira": {
    "enabled": false
  },
  "workflow": {
    "tdd": false
  }
}
```

After writing, validate:
```bash
python -m json.tool project.json
```

---

## Phase 4 — Symlink Health Check (workflow repo only)

Detect the workflow repo: check for all three of `setup.sh`, `skills/`, and `agents/` at the repo root. If all three are present, run:

```bash
bash scripts/setup.sh --check
```

If `--check` is not supported by setup.sh, run:

```bash
bash scripts/setup.sh --force
```

Report any symlinks that were created or repaired.

---

## Notes

- Running project-setup on a repo that already has `project.json` will overwrite it after confirmation.
- project.json is intentionally minimal — only include sections for features you are using.
- The `codebase-entry` file should be the human/AI-readable orientation summary (50–200 lines), NOT the code graph output from infra-init.
```

- [ ] **Step 2: Verify the skill file reads correctly**

```bash
head -5 skills/project-setup/SKILL.md
```

Expected: frontmatter with `name: project-setup`.

- [ ] **Step 3: Commit**

```
Skill { skill: "git-manager", args: "commit files:[skills/project-setup/SKILL.md] type:feat description:'add project-setup skill — repo init wizard with project.json generation' jira-key:CLAUDE-N" }
```

---

## Task 3: Update git-manager — read project.json

**Files:**
- Modify: `skills/git-manager/SKILL.md` — replace the "Jira Key Requirement" section

- [ ] **Step 1: Replace the Jira Key Requirement section**

Find this section in `skills/git-manager/SKILL.md`:

```markdown
## Jira Key Requirement

A "configured Jira project" means CLAUDE.md contains a concrete project key (e.g. `PROJ`, `CLAUDE`) — not a placeholder like `[PROJ]` or a missing/empty field. If the key field is absent, a template placeholder, or not present, treat the project as untracked.
```

Replace with:

```markdown
## Jira Key Requirement

A "configured Jira project" means `project.json` at the repo root has `jira.enabled: true` and a concrete `jira.project` value (e.g. `"PROJ"`).

If `project.json` is absent, or `jira.enabled` is `false` or missing: treat the project as untracked — no Jira key required.

**Fallback (no project.json):** Check whether CLAUDE.md contains a concrete project key — not a placeholder like `[PROJ]` or a missing field. This fallback exists for repos that have not yet run project-setup.
```

**Spec deviation note (intentional):** The spec states "absence of project.json → no Jira, no key requirements." The replacement above adds a CLAUDE.md fallback for repos that haven't run project-setup yet. This is a deliberate backward-compatibility choice — existing repos relying on CLAUDE.md detection continue to work. New repos use project.json exclusively.

- [ ] **Step 2: Verify the change**

```bash
grep -A 8 "## Jira Key Requirement" skills/git-manager/SKILL.md
```

Expected: output shows the new `project.json`-first logic.

- [ ] **Step 3: Commit**

```
Skill { skill: "git-manager", args: "commit files:[skills/git-manager/SKILL.md] type:feat description:'git-manager reads project.json for Jira key detection' jira-key:CLAUDE-N" }
```

---

## Task 4: Update jira-workflow-manager — check project.json

**Files:**
- Modify: `agents/jira-workflow-manager.md` — add Project Config Check before Step 1

- [ ] **Step 1: Add the config check section**

In `agents/jira-workflow-manager.md`, find the line:

```markdown
## Step 1 — Identify Ticket Origin
```

Insert this section immediately before it:

```markdown
## Step 0 — Project Config Check

Before any operation, check `project.json` at the repo root:

```bash
cat project.json 2>/dev/null
```

| Condition | Action |
|-----------|--------|
| File absent | Proceed — assume Jira is configured (legacy repos without project.json) |
| `jira.enabled: false` | Respond: "Jira not configured for this project (`jira.enabled: false`). No operations to perform." Stop. |
| `jira.enabled: true` + `jira.project` present | Use `jira.project` value as the default project key for all operations in this session |
| `jira.enabled: true`, no `jira.project` | Ask caller for the project key before proceeding |

---

```

- [ ] **Step 2: Verify**

```bash
grep -n "Step 0\|Step 1\|Project Config" agents/jira-workflow-manager.md | head -10
```

Expected: Step 0 appears before Step 1.

- [ ] **Step 3: Commit**

```
Skill { skill: "git-manager", args: "commit files:[agents/jira-workflow-manager.md] type:feat description:'jira-workflow-manager checks project.json before any operation' jira-key:CLAUDE-N" }
```

---

## Task 5: Update plan-gate — check workflow.architect-review

**Files:**
- Modify: `skills/plan-gate/SKILL.md` — add config check before Gate Sequence

- [ ] **Step 1: Add the config check**

In `skills/plan-gate/SKILL.md`, find:

```markdown
## Gate Sequence

### Step 1 — Architect Review
```

Insert immediately before `## Gate Sequence`:

```markdown
## Project Config Check

Before running the gate sequence, read `project.json` at the repo root if it exists:

```bash
cat project.json 2>/dev/null
```

Apply these overrides:

| Field | Value | Effect |
|-------|-------|--------|
| `workflow.architect-review` | `false` | Skip Step 1 (Architect Review) entirely — proceed directly to Step 2 |
| `workflow.plan-gate` | `false` | Skip the entire gate sequence — hand off directly to executing-plans |
| absent / true | — | Run full gate sequence as defined |

---

```

- [ ] **Step 2: Verify**

```bash
grep -n "Project Config Check\|Gate Sequence\|Step 1" skills/plan-gate/SKILL.md | head -10
```

Expected: Project Config Check appears before Gate Sequence.

- [ ] **Step 3: Commit**

```
Skill { skill: "git-manager", args: "commit files:[skills/plan-gate/SKILL.md] type:feat description:'plan-gate checks project.json to conditionally skip architect review' jira-key:CLAUDE-N" }
```

---

## Task 6: Update executing-plans — gate Jira steps on project.json

**Files:**
- Modify: `skills/executing-plans/SKILL.md` — update Step 2 task loop

- [ ] **Step 1: Update the task loop**

In `skills/executing-plans/SKILL.md`, find:

```markdown
### Step 2: Execute Tasks

For each task:
1. Transition corresponding Jira ticket to In Progress via jira-workflow-manager
2. Mark task as in_progress in TodoWrite
3. Follow each step exactly (plan has bite-sized steps)
4. Run verifications as specified
5. Mark task as completed
6. Transition Jira ticket to Done (or Testing if human verification required) via jira-workflow-manager
7. Invoke plan-management skill: path, jira-key, status: completed, 1-2 sentence summary
```

Replace with:

```markdown
### Step 2: Execute Tasks

**Before starting the first task:** Read `project.json` at repo root if it exists. Note whether `jira.enabled` is true. If absent, assume Jira is enabled (legacy fallback).

For each task:
1. If Jira enabled: Transition corresponding Jira ticket to In Progress via jira-workflow-manager. If Jira disabled: skip.
2. Mark task as in_progress in TodoWrite
3. Follow each step exactly (plan has bite-sized steps)
4. Run verifications as specified
5. Mark task as completed
6. If Jira enabled: Transition Jira ticket to Done (or Testing if human verification required) via jira-workflow-manager. If Jira disabled: skip.
7. If Jira enabled: Invoke plan-management skill: path, jira-key, status: completed, 1-2 sentence summary. If Jira disabled: invoke plan-management skill with status: completed and summary only (omit jira-key).
```

- [ ] **Step 2: Verify**

```bash
grep -n "jira.enabled\|Jira enabled\|Jira disabled" skills/executing-plans/SKILL.md
```

Expected: at least 3 matches showing the conditional logic.

- [ ] **Step 3: Commit**

```
Skill { skill: "git-manager", args: "commit files:[skills/executing-plans/SKILL.md] type:feat description:'executing-plans gates Jira transitions on project.json jira.enabled' jira-key:CLAUDE-N" }
```

---

## Task 7: Update test-driven-development — check workflow.tdd

**Files:**
- Modify: `skills/test-driven-development/SKILL.md` — add config check at top

- [ ] **Step 1: Add the config check**

In `skills/test-driven-development/SKILL.md`, find:

```markdown
## Overview

Write the test first. Watch it fail. Write minimal code to pass.
```

Insert immediately before `## Overview`:

```markdown
## Project Config Check

Read `project.json` at repo root if it exists:

```bash
cat project.json 2>/dev/null
```

If `workflow.tdd` is explicitly `false`: announce "TDD is disabled for this repo (`workflow.tdd: false`). Proceeding with direct implementation." and exit this skill. Do not apply RED-GREEN-REFACTOR discipline.

If `project.json` is absent or `workflow.tdd` is true/missing: continue with the full TDD process below.

---

```

- [ ] **Step 2: Verify**

```bash
grep -n "Project Config Check\|workflow.tdd\|Overview" skills/test-driven-development/SKILL.md | head -8
```

Expected: Project Config Check appears before Overview.

- [ ] **Step 3: Commit**

```
Skill { skill: "git-manager", args: "commit files:[skills/test-driven-development/SKILL.md] type:feat description:'TDD skill checks project.json workflow.tdd before enforcing discipline' jira-key:CLAUDE-N" }
```

---

## Task 8: Add orientation protocol to using-superpowers

**Files:**
- Modify: `skills/using-superpowers/SKILL.md` — add Orientation Protocol section after Platform Adaptation

- [ ] **Step 1: Add the section**

In `skills/using-superpowers/SKILL.md`, find:

```markdown
## Platform Adaptation

Skills use Claude Code tool names.
```

After the full Platform Adaptation paragraph (ends before `# Using Skills`), insert:

```markdown
## Orientation Protocol

Before exploring any repo, follow this hierarchy — stop as soon as you have what you need:

1. Read `project.json` at repo root (small, always fast — tells you what features are enabled)
2. Read the file at `codebase-entry` in project.json if set (typically CODEBASE.md, 50–200 lines — safe to read directly)
3. Read the plan doc for the current task if one exists (`plans/<slug>/<slug>-plan.md`)
4. **Stop.** Do not explore further unless a specific detail is genuinely absent from all three sources
5. For specific symbol/file lookups beyond that: dispatch `researcher` agent — never Grep or run bash on large codebases

**Hard boundaries:**
- `CODEBASE.md` → read directly (purpose-built for AI orientation, designed to be short)
- Code graph output from `infra-init` (can be 250K+ lines) → researcher agent only, never read directly
- Plan doc → always read during execution; it supersedes all filesystem exploration

```

- [ ] **Step 2: Verify**

```bash
grep -n "Orientation Protocol\|Platform Adaptation\|Using Skills" skills/using-superpowers/SKILL.md | head -8
```

Expected: Orientation Protocol appears between Platform Adaptation and Using Skills.

- [ ] **Step 3: Commit**

```
Skill { skill: "git-manager", args: "commit files:[skills/using-superpowers/SKILL.md] type:feat description:'add orientation protocol — project.json > CODEBASE.md > plan doc > researcher agent' jira-key:CLAUDE-N" }
```

---

## Task 9: Token efficiency patches — brainstorming and writing-plans

**Files:**
- Modify: `skills/brainstorming/SKILL.md` — replace broad exploration with orientation hierarchy
- Modify: `skills/writing-plans/SKILL.md` — replace broad exploration with orientation hierarchy

- [ ] **Step 1: Update brainstorming — existing codebase section**

In `skills/brainstorming/SKILL.md`, find:

```markdown
**Working in existing codebases:**

- If `CODEBASE.md` exists in the repo root, read it before exploring files — it orients entry points and key modules. For symbol lookups during exploration, dispatch a `researcher` instance rather than grepping directly.
- Explore the current structure before proposing changes. Follow existing patterns.
```

Replace with:

```markdown
**Working in existing codebases:**

- Follow the orientation hierarchy: read `project.json` → read `codebase-entry` file (e.g. CODEBASE.md) → read plan doc if one exists → stop. Do not explore further unless a specific detail is genuinely absent from all three.
- For symbol lookups (where does X live, what calls Y): dispatch a `researcher` instance — never Grep or run bash on large codebases.
- Follow existing patterns. Where a file has grown unwieldy, include a targeted split in the design — do not unilaterally restructure.
```

- [ ] **Step 2: Update brainstorming — checklist explore step**

In `skills/brainstorming/SKILL.md`, find:

```markdown
1. **Explore project context** — check files, docs, recent commits
```

Replace with:

```markdown
1. **Explore project context** — read project.json → read codebase-entry file if set → read plan doc if one exists → stop (see Orientation Protocol in using-superpowers)
```

- [ ] **Step 2b: Update brainstorming — DOT graph node**

The DOT graph in `skills/brainstorming/SKILL.md` references `"Explore project context"` as a named node. After Step 2, the prose and the diagram will be out of sync unless the graph is also updated.

In `skills/brainstorming/SKILL.md`, find:

```
    "Explore project context" [shape=box];
```

Replace with:

```
    "Orient to repo context" [shape=box];
```

Then find:

```
    "Explore project context" -> "Visual questions ahead?";
```

Replace with:

```
    "Orient to repo context" -> "Visual questions ahead?";
```

- [ ] **Step 3: Update writing-plans — existing codebase section**

In `skills/writing-plans/SKILL.md`, find:

```markdown
If `CODEBASE.md` exists in the repo root, read it before any file navigation. For symbol lookups (where does X live, what calls Y, what env vars does Z read), dispatch a `researcher` instance rather than grepping files directly.
```

Replace with:

```markdown
Follow the orientation hierarchy before any file navigation: read `project.json` → read the file at `codebase-entry` (e.g. CODEBASE.md) → read the plan doc or spec if one exists → stop. Only fall back to targeted Grep or a `researcher` instance if a specific detail is genuinely absent from all three. Never run broad bash scans or read the code graph output directly.
```

- [ ] **Step 4: Verify both files**

```bash
grep -n "orientation hierarchy\|codebase-entry\|project.json" skills/brainstorming/SKILL.md
grep -n "orientation hierarchy\|codebase-entry\|project.json" skills/writing-plans/SKILL.md
```

Expected: at least one match in each file.

- [ ] **Step 5: Commit**

```
Skill { skill: "git-manager", args: "commit files:[skills/brainstorming/SKILL.md,skills/writing-plans/SKILL.md] type:feat description:'apply orientation hierarchy to brainstorming and writing-plans — replace broad exploration' jira-key:CLAUDE-N" }
```

---

## Task 10: Plan doc path unification

**Files:**
- Modify: `skills/brainstorming/SKILL.md` — update output path for design docs
- Modify: `skills/writing-plans/SKILL.md` — update output path for plan docs
- Modify: `TODO.md` — clean up stale entry referencing old path

- [ ] **Step 1: Update brainstorming output path**

In `skills/brainstorming/SKILL.md`, find:

```markdown
- **Write design doc** — save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit
```

Replace with:

```markdown
- **Write design doc** — save to `plans/<slug>/<slug>-design.md` and commit
```

Also find this two-line block in the Documentation section (both lines must be in the find — the continuation line is part of the replacement):

```markdown
- Write the validated design (spec) to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
  - (User preferences for spec location override this default)
```

Replace the entire two-line block with:

```markdown
- Write the validated design (spec) to `plans/<slug>/<slug>-design.md`
  - Slug is a kebab-case short description of the work (e.g. `auth-refactor`, `mobile-onboarding`)
  - Dates live inside the doc, not in the filename
  - (User preferences for spec location override this default)
```

- [ ] **Step 2: Update writing-plans output path**

In `skills/writing-plans/SKILL.md`, find:

```markdown
**Save plans to:** `plans/<slug>/PLAN.md`
```

Replace with:

```markdown
**Save plans to:** `plans/<slug>/<slug>-plan.md`
```

- [ ] **Step 3: Clean up stale TODO.md entry**

In `TODO.md`, the "Up Next" section contains a stale entry from the completed restructure:

```markdown
- [ ] Personal Workflow Repo — Restructure to dotfiles layout — [plans/personal-workflow-repo/PLAN.md](plans/personal-workflow-repo/PLAN.md)
```

Remove this line. The restructure was completed in commit `8b5881f`.

- [ ] **Step 4: Verify**

```bash
grep -n "plans/.*design\|plans/.*plan\|PLAN.md\|docs/superpowers/specs" skills/brainstorming/SKILL.md skills/writing-plans/SKILL.md
```

Expected: no remaining references to `docs/superpowers/specs/` or `PLAN.md` (uppercase) in the save-path instructions.

- [ ] **Step 5: Commit**

```
Skill { skill: "git-manager", args: "commit files:[skills/brainstorming/SKILL.md,skills/writing-plans/SKILL.md,TODO.md] type:refactor description:'unify plan doc paths to plans/<slug>/<slug>-design.md and <slug>-plan.md' jira-key:CLAUDE-N" }
```

---

## Task 11: Create /feedback skill

**Files:**
- Create: `skills/feedback/SKILL.md`

- [ ] **Step 1: Create the skill directory and file**

```bash
mkdir -p skills/feedback
```

Write `skills/feedback/SKILL.md`:

```markdown
---
name: feedback
description: Non-interrupting workflow feedback capture. Run /feedback <description> at any point to log a friction point, missed skill, or improvement idea to docs/workflow-feedback.md. Fires a background subagent — does not interrupt current work. Pair with /review-workflow to act on accumulated feedback.
argument-hint: "<description of what felt wrong>"
---

# feedback

Log workflow friction without interrupting current work.

**Usage:** `/feedback <what felt wrong>`

Examples:
- `/feedback brainstorming got skipped when starting the auth feature`
- `/feedback plan-gate ran architect review on a 2-line config change`
- `/feedback had to explain the Jira project key again`
- `/feedback claude argued with itself about whether to use git-manager`

---

## Behavior

### Step 1 — Capture context snapshot (runs in main context)

Before spawning the background agent, capture:

```
SNAPSHOT:
- Active plan doc: [read from TODO.md In Progress section, or "none"]
- Current Jira task: [read from TODO.md In Progress section, or "unknown"]
- Last skill invoked: [from current session context, or "unknown"]
- Verbatim feedback: [the argument passed to /feedback]
- Timestamp: [current date/time]
```

### Step 2 — Spawn background subagent

Spawn a background Agent with this prompt (substitute snapshot values):

> Append a feedback entry to `docs/workflow-feedback.md` in the repo at [current working directory].
>
> Context snapshot:
> - Active plan: [ACTIVE_PLAN]
> - Current task: [CURRENT_TASK]
> - Last skill: [LAST_SKILL]
> - Timestamp: [TIMESTAMP]
>
> Feedback: "[VERBATIM_FEEDBACK]"
>
> Classify the feedback into one of these categories:
> skill-skipped | skill-too-heavy | circular-reasoning | missing-capability | memory-gap | workflow-conflict | agent-failing | rule-too-strict | other
>
> Append this entry to `docs/workflow-feedback.md` (create the file if it does not exist):
>
> ```markdown
> ## [TIMESTAMP] [SHORT_DESCRIPTION]
>
> **Context:** [what was being worked on]
> **Active plan:** [path or "none"]
> **Skill involved:** [skill name or "unknown"]
> **Feedback:** [verbatim]
> **Category:** [chosen category]
> **Status:** open
> ```
>
> Return only: "Logged: [short description]"

### Step 3 — Confirm (in main context)

Report the single-line confirmation from the subagent to the user. Continue with current work.

---

## Notes

- If `docs/workflow-feedback.md` does not exist, the subagent creates it with a header:
  ```markdown
  # Workflow Feedback Log
  Entries appended by /feedback. Review and triage with /review-workflow.
  ```
- One entry per /feedback invocation — no batching
- The subagent classifies the category; the user does not need to choose it
```

- [ ] **Step 2: Verify**

```bash
head -5 skills/feedback/SKILL.md
```

Expected: frontmatter with `name: feedback`.

- [ ] **Step 3: Commit**

```
Skill { skill: "git-manager", args: "commit files:[skills/feedback/SKILL.md] type:feat description:'add /feedback skill — non-interrupting workflow friction capture via background subagent' jira-key:CLAUDE-N" }
```

---

## Task 12: Create /review-workflow skill

**Files:**
- Create: `skills/review-workflow/SKILL.md`

- [ ] **Step 1: Create the skill directory and file**

```bash
mkdir -p skills/review-workflow
```

Write `skills/review-workflow/SKILL.md`:

```markdown
---
name: review-workflow
description: Triage accumulated workflow feedback from docs/workflow-feedback.md. Groups entries by category, identifies highest-signal issues, proposes targeted fixes, and dispatches approved changes via writing-skills or CLAUDE.md edits. Run when you have time to act on friction captured by /feedback.
argument-hint: "(no arguments needed — reads docs/workflow-feedback.md)"
---

# review-workflow

Triage and act on accumulated workflow feedback.

**Announce at start:** "I'm using the review-workflow skill to triage workflow feedback."

---

## The Process

### Step 1 — Load feedback

Read `docs/workflow-feedback.md`. If the file does not exist or is empty, respond: "No feedback logged yet. Use /feedback to capture friction as you work." and stop.

### Step 2 — Group and analyze

Group open entries by `Category`. For each category group, note:
- How many entries
- Which skills appear most often
- Any pattern in the context (same repo? same plan type?)

Identify the top 2–3 highest-signal items using these signals:
- Same category appears 3+ times → systemic issue
- Same skill appears in 2+ entries → that skill needs work
- "circular-reasoning" or "missing-capability" entries → high priority regardless of count

### Step 3 — Propose fixes

For each high-signal item, propose a specific fix:

| Category | Fix route |
|----------|-----------|
| `skill-skipped` | Update the skill's trigger description in its frontmatter, or tighten the relevant section in `using-superpowers` |
| `skill-too-heavy` | Add a size check or early-exit condition to the skill |
| `circular-reasoning` | Add an explicit decision rule or break condition to the offending skill |
| `missing-capability` | Create a new skill — describe what it should do |
| `memory-gap` | Write a memory entry immediately |
| `workflow-conflict` | Identify which file wins (skill or CLAUDE.md) and update the loser |
| `agent-failing` | Read the agent file, identify the failure point, propose updated instructions |
| `rule-too-strict` | Read the relevant rule file, propose a targeted relaxation |

Present proposed fixes to the user one at a time and wait for approval before executing.

### Step 4 — Execute approved fixes

For each approved fix:

| Fix type | Action |
|----------|--------|
| Skill update | Invoke `writing-skills` skill with the proposed change |
| New skill | Invoke `writing-skills` skill to create it |
| CLAUDE.md edit | Make the edit directly using Edit tool |
| Memory entry | Write to memory using Write tool |
| Rule update | Make the edit directly using Edit tool |
| Agent update | Make the edit directly using Edit tool |

After executing each fix, mark the corresponding feedback entries as resolved:

Change `**Status:** open` to `**Status:** resolved — [brief description of fix]`

### Step 5 — Summary

Report: N entries reviewed, M resolved, K deferred (and why).

---

## Notes

- Do not batch fixes — present one at a time and wait for approval
- Do not attempt fixes without user approval — propose first, execute second
- Entries with `Status: resolved` are skipped in Step 2
- If a fix requires a plan doc (L-sized work), create one via brainstorming rather than executing inline
```

- [ ] **Step 2: Verify**

```bash
head -5 skills/review-workflow/SKILL.md
```

Expected: frontmatter with `name: review-workflow`.

- [ ] **Step 3: Commit**

```
Skill { skill: "git-manager", args: "commit files:[skills/review-workflow/SKILL.md] type:feat description:'add /review-workflow skill — triage and act on accumulated feedback' jira-key:CLAUDE-N" }
```

---

## Task 13: Rules audit — consolidate and remove redundant entries

**Files:**
- Read: `rules/filesystem-efficiency.md`, `rules/filesystem/efficiency.md`, `CLAUDE.md`
- Action: consolidate duplicate rules file, remove CLAUDE.md entries now enforced by skills

- [ ] **Step 1: Compare the two filesystem efficiency files**

Read both files:
- `rules/filesystem-efficiency.md`
- `rules/filesystem/efficiency.md`

Identify: are they identical, overlapping, or complementary?

- [ ] **Step 2: Consolidate**

If one is a superset or they are duplicates:
- Keep `rules/filesystem/efficiency.md` (the scoped version under the subdirectory)
- Delete `rules/filesystem-efficiency.md`
- Run `bash scripts/setup.sh --force` to remove the now-broken symlink from `~/.claude/rules/`

If they are complementary:
- Merge into `rules/filesystem/efficiency.md`, keeping all unique content
- Delete `rules/filesystem-efficiency.md`

- [ ] **Step 3: Review CLAUDE.md for redundant delegation entries**

Read `CLAUDE.md` delegation table section. For each row, ask:
- Does a skill now enforce this independently? (e.g., executing-plans now reads project.json and skips Jira transitions — the rule in CLAUDE.md about using jira-workflow-manager is still load-bearing because CLAUDE.md is read as global context)
- Is the rule a safety net that adds value even if redundant? Keep it.
- Is the rule now purely noise that contradicts or duplicates skill behavior? Remove or simplify.

Expected outcome: the plan-doc-first section in CLAUDE.md (if present) can be simplified or noted as "now enforced by orientation protocol in skills". The delegation table rows should stay — they are load-bearing global context, not redundant.

- [ ] **Step 4: Commit**

```
Skill { skill: "git-manager", args: "commit files:[rules/filesystem-efficiency.md,rules/filesystem/efficiency.md,CLAUDE.md] type:chore description:'rules audit — consolidate duplicate filesystem efficiency file, remove redundant CLAUDE.md entries' jira-key:CLAUDE-N" }
```

Note: adjust the files list based on what was actually changed in Steps 2–3.

---

## Verification Scenarios

After all tasks are complete, manually trace these scenarios:

**Scenario A — Repo with no project.json:**
1. git-manager asked for Jira key → falls back to CLAUDE.md check → finds no key → proceeds without footer
2. jira-workflow-manager invoked → reads project.json (absent) → assumes Jira configured (legacy fallback) → proceeds normally
3. plan-gate runs → no project.json → runs full gate sequence including architect review
4. TDD skill → no project.json → runs full TDD discipline

**Scenario B — Repo with jira.enabled: false:**
1. git-manager → `jira.enabled: false` → no key required → commits without Jira footer
2. jira-workflow-manager → `jira.enabled: false` → responds "Jira not configured" → stops
3. executing-plans → reads `jira.enabled: false` → skips all Jira transitions silently

**Scenario C — Full config repo (this repo):**
1. git-manager → `jira.enabled: true`, `jira.project: "CLAUDE"` → requires key
2. plan-gate → `workflow.architect-review: true` → runs architect review
3. TDD → `workflow.tdd: false` → exits immediately with note

**Scenario D — /feedback invoked mid-session:**
1. Skill captures snapshot from TODO.md
2. Background subagent appends to docs/workflow-feedback.md
3. Main context gets one-line confirmation
4. docs/workflow-feedback.md has a new entry with correct category

---

## Testing

No compiled code exists in this repo. All verification is textual and structural. The tests below are the formal contract — each item states what correct output looks like from the outside and how to confirm it.

### Manual Verification Steps

#### Task 1 — project.json

- [ ] File exists at `C:\Users\jason\repos\claude-workflow-improvements\project.json`
- [ ] `python -m json.tool project.json` exits 0 and echoes clean JSON (no parse errors)
- [ ] JSON contains `jira.enabled: true`, `jira.project: "CLAUDE"`, `workflow.tdd: false`, `git.require-jira-key-in-commits: true`

#### Task 2 — project-setup skill

- [ ] `skills/project-setup/SKILL.md` exists
- [ ] First 5 lines contain frontmatter with `name: project-setup`
- [ ] File contains all four phases: "Phase 1", "Phase 2", "Phase 3", "Phase 4"
- [ ] "Symlink Architecture" block is present (workflow-repo-only note)

#### Task 3 — git-manager: project.json-first Jira detection

- [ ] `## Jira Key Requirement` section in `skills/git-manager/SKILL.md` references `project.json` and `jira.enabled` — not CLAUDE.md as the primary check
- [ ] The CLAUDE.md fallback sentence is present (backward-compatibility for repos without project.json)
- [ ] No reference to CLAUDE.md as the _sole_ source of truth for Jira detection remains in that section

#### Task 4 — jira-workflow-manager: Step 0 config check

- [ ] `## Step 0 — Project Config Check` section exists in `agents/jira-workflow-manager.md`
- [ ] Step 0 appears before `## Step 1 — Identify Ticket Origin` in the file (line number of Step 0 is lower than line number of Step 1)
- [ ] The table inside Step 0 contains rows for all four conditions: file absent, `jira.enabled: false`, `jira.enabled: true` with project, `jira.enabled: true` without project

#### Task 5 — plan-gate: conditional architect-review skip

- [ ] `## Project Config Check` section exists in `skills/plan-gate/SKILL.md`
- [ ] That section appears before `## Gate Sequence` in the file
- [ ] The override table covers `workflow.architect-review: false` (skip Step 1) and `workflow.plan-gate: false` (skip entire gate)

#### Task 6 — executing-plans: Jira-gated task loop

- [ ] `skills/executing-plans/SKILL.md` contains the phrase "jira.enabled" at least once in the Step 2 task loop
- [ ] Steps 1 and 6 in the loop both include an "If Jira disabled: skip" branch
- [ ] Step 7 includes an "If Jira disabled" branch that invokes plan-management without a jira-key

#### Task 7 — test-driven-development: tdd flag exit

- [ ] `## Project Config Check` section exists in `skills/test-driven-development/SKILL.md`
- [ ] That section appears before `## Overview` in the file
- [ ] The section contains the exact exit announcement: "TDD is disabled for this repo (`workflow.tdd: false`). Proceeding with direct implementation."

#### Task 8 — using-superpowers: orientation hierarchy

- [ ] `## Orientation Protocol` section exists in `skills/using-superpowers/SKILL.md`
- [ ] It appears after `## Platform Adaptation` and before `# Using Skills`
- [ ] The five-step hierarchy is present (project.json → codebase-entry → plan doc → stop → researcher)
- [ ] The "Hard boundaries" block listing CODEBASE.md vs. code graph output is present

#### Task 9 — brainstorming and writing-plans: orientation hierarchy

- [ ] `skills/brainstorming/SKILL.md` "Working in existing codebases" block references "orientation hierarchy" and "codebase-entry" — no longer references "If CODEBASE.md exists" as the top-level check
- [ ] Step 1 of the brainstorming checklist reads "read project.json → read codebase-entry file if set → read plan doc if one exists → stop"
- [ ] The DOT graph node label is "Orient to repo context" (not "Explore project context") and its edge to "Visual questions ahead?" is intact
- [ ] `skills/writing-plans/SKILL.md` contains "orientation hierarchy" and "codebase-entry" in place of the old "If CODEBASE.md exists" sentence

#### Task 10 — plan doc path unification

- [ ] `skills/brainstorming/SKILL.md` save-path instruction references `plans/<slug>/<slug>-design.md` — no remaining reference to `docs/superpowers/specs/`
- [ ] `skills/writing-plans/SKILL.md` save-path instruction reads `plans/<slug>/<slug>-plan.md` — not the old `plans/<slug>/PLAN.md`
- [ ] `TODO.md` no longer contains the stale line referencing `plans/personal-workflow-repo/PLAN.md`

#### Task 11 — /feedback skill

- [ ] `skills/feedback/SKILL.md` exists with frontmatter `name: feedback`
- [ ] File contains all three steps: "Step 1 — Capture context snapshot", "Step 2 — Spawn background subagent", "Step 3 — Confirm"
- [ ] The category list is present and includes at least: `skill-skipped`, `missing-capability`, `workflow-conflict`
- [ ] Notes block describes the auto-created file header

#### Task 12 — /review-workflow skill

- [ ] `skills/review-workflow/SKILL.md` exists with frontmatter `name: review-workflow`
- [ ] File contains all five steps: "Step 1 — Load feedback" through "Step 5 — Summary"
- [ ] The fix-route table maps all eight category values to actions
- [ ] Notes block contains the "Do not batch fixes" constraint

#### Task 13 — rules audit

- [ ] Only one filesystem-efficiency file remains under `rules/` after the consolidation (either `rules/filesystem/efficiency.md` alone, or a merged version — `rules/filesystem-efficiency.md` must be gone)
- [ ] `~/.claude/rules/filesystem-efficiency.md` symlink is removed or no longer points to a deleted source file (run `ls -la ~/.claude/rules/` and confirm no broken symlink)
- [ ] CLAUDE.md delegation table rows are present and unmodified (they are load-bearing global context — verify they were not removed)

### Scenario Traces (graceful degradation)

These are the definitive pass/fail criteria. Trace each scenario by reading the modified skill files and confirming the logic described below is present in the text.

- [ ] **Scenario A (no project.json):** git-manager falls back to CLAUDE.md check. jira-workflow-manager assumes Jira configured and proceeds. plan-gate runs full sequence including architect review. TDD skill runs full discipline. No "file not found" error text in any skill.

- [ ] **Scenario B (jira.enabled: false):** jira-workflow-manager stops with "Jira not configured" message. executing-plans skips all Jira transitions silently. git-manager does not require a key. These three behaviors are expressed as explicit conditional branches in the respective files — not as undefined behavior.

- [ ] **Scenario C (full config, this repo — jira.enabled: true, workflow.tdd: false, workflow.architect-review: true):** git-manager requires Jira key (reads from project.json). plan-gate runs architect review. TDD skill exits immediately with the configured announcement. executing-plans transitions Jira tickets normally.

- [ ] **Scenario D (workflow.architect-review: false):** plan-gate skips Step 1 and proceeds directly to Step 2 (test-strategy). The word "skip" or equivalent is present in the Project Config Check table for this condition.

- [ ] **Scenario E (workflow.plan-gate: false):** plan-gate exits without running any gate steps and hands off directly to executing-plans.

### Log Monitoring Notes

No production services are involved. The only runtime-observable failure modes are:

- A broken symlink in `~/.claude/rules/` after Task 13 would silently drop a rule from all sessions — check with `ls -la ~/.claude/rules/` post-commit
- A malformed `project.json` (invalid JSON) would cause all skills that `cat project.json` to silently receive no output and fall through to legacy behavior — validate with `python -m json.tool project.json` before committing Task 1
