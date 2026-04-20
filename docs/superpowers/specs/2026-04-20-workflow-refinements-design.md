# Workflow Refinements Design

**Date:** 2026-04-20  
**Status:** Draft  
**Scope:** Six improvements to reduce friction between the superpowers skill set and the custom workflow

---

## Context

After initial integration of superpowers with the custom Jira/git/architect workflow (completed Apr 17–18), several friction points emerged in practice:

1. Jira operations being enforced in repos where Jira is not configured
2. Superpowers skills doing broad, token-heavy exploration instead of using targeted reads and the researcher agent
3. Plan docs produced in two separate folders with two different naming conventions
4. No mechanism to capture and act on workflow friction in the moment
5. No confidence about how this repo syncs to `~/.claude/` — hesitation to make changes

---

## Component 1: `project.json`

### Purpose

A machine-readable per-repo config file that tells workflow skills what features are enabled. Absence means "use defaults" — skills degrade gracefully.

### Schema

```json
{
  "project": {
    "name": "my-project",
    "description": "Short description for ticket generation"
  },
  "jira": {
    "enabled": true,
    "project": "PROJ",
    "default-issue-type": "Task",
    "board": "optional-board-name"
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
    "command": "npm test",
    "coverage-threshold": 80
  },
  "codebase-entry": "CODEBASE.md"
}
```

### Conventions

- **Absence of `project.json`**: all workflow features use global defaults (no Jira, no key requirements, architect review on, TDD on)
- **`jira.enabled: false`**: explicit opt-out — skip all Jira operations silently
- **`workflow.*: false`**: disable specific workflow steps for this repo
- **`codebase-entry`**: path to the human/AI-readable orientation summary (typically `CODEBASE.md`). This is NOT the code graph — that file is researcher-agent-only territory

### Skills that read `project.json`

| Skill / Agent | Field read | Behavior change |
|---|---|---|
| `git-manager` | `git.require-jira-key-in-commits`, `git.main-branch` | Align existing detection logic to this file |
| `jira-workflow-manager` | `jira.enabled`, `jira.project` | Skip all operations if `enabled: false` or file absent |
| `plan-gate` | `workflow.architect-review` | Skip architect agent if false |
| `test-driven-development` | `workflow.tdd` | Skip if false |
| `executing-plans` | `jira.enabled`, `workflow.*` | Gate each Jira transition and workflow step on config |
| `brainstorming`, `writing-plans` | `codebase-entry` | Use as orientation shortcut (see Component 3) |

---

## Component 2: `project-setup` Skill

### Purpose

A single setup wizard for new and existing repos. Replaces the need to fork `init`. Orchestrates existing init skills then generates `project.json` from interactive answers.

### Four phases

**Phase 1 — Codebase init**

Asks which init skills to run:
- `init` → CLAUDE.md (skip if already exists)
- `e2e-init` → testing backbone (ask user, optional)
- `infra-init` → codebase knowledge graph (ask user, optional)

Skips any whose output already exists in the repo.

**Phase 2 — Interactive questionnaire**

One question at a time:
1. Does this project use Jira? → if yes: project key?
2. What is the main branch? (default: `main`)
3. Require Jira key in commits? (default: yes if Jira enabled, no otherwise)
4. Architect review enabled? (default: yes)
5. TDD enabled? (default: yes)
6. Plan-gate enabled? (default: yes)
7. Test command? (e.g. `npm test`, `pytest`, `go test ./...`) — skip if not applicable
8. Is there a CODEBASE.md or equivalent orientation file? → if yes: path?

**Phase 3 — Write `project.json`**

Writes to repo root based on answers. Omits sections for features that are off or not applicable — keeps the file lean.

**Phase 4 — Symlink health check (workflow repo only)**

Detect the workflow repo by checking for `setup.sh` + `skills/` + `agents/` at the repo root. When all three are present, verify all skills, agents, and rules have active symlinks in `~/.claude/`. If any are missing or broken, run `setup.sh --force` automatically.

### Symlink architecture note (for the skill's documentation)

> This repo IS `~/.claude/` for workflow files. Symlinks mean editing any file here is immediately live — there is no sync step for edits to existing files. `setup.sh --force` is only needed when **adding new files** (to create new symlinks). Edit in this repo; Claude Code picks it up instantly.

---

## Component 3: Token Efficiency Protocol

### Problem

Superpowers skills do a broad "explore project context" step — reading large files, running bash scans, re-orienting on every new context window. In large repos (e.g., mobile app codebase with ~250K line code graph), this can consume half the context budget before real work starts.

### Orientation hierarchy

Any skill that currently does broad exploration must follow this order instead:

1. Read `project.json` (always small, always fast)
2. Read the file at `codebase-entry` (typically CODEBASE.md, ~50–200 lines — safe to read directly)
3. Read the plan doc if one exists for the current task (contains file paths, function names, data structures)
4. **Stop.** Do not explore further unless a specific detail is genuinely absent from all three
5. For specific symbol/file lookups: researcher agent only — never Grep or bash on the raw code graph

### Hard boundaries

- **CODEBASE.md** → read directly (purpose-built for AI orientation)
- **Code graph** (infra-init output, typically very large) → researcher agent only, never read directly
- **Plan doc** → always read during execution; it supersedes filesystem exploration

### Skills to patch

`brainstorming`, `writing-plans`, `executing-plans` — replace the "explore project context" step with the orientation hierarchy above.

`using-superpowers` — add a section establishing this protocol so it's applied from session start, not just within individual skills.

---

## Component 4: Plan Doc Unification

### Problem

Two separate output locations with different naming conventions:
- Brainstorming → `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Writing-plans → `plans/<slug>/PLAN.md`

### Unified structure

```
plans/
  <slug>/
    <slug>-design.md    ← brainstorming output (spec)
    <slug>-plan.md      ← writing-plans output (execution plan)
```

Same folder, same slug, sequential documents. The design is the precursor to the plan — keeping them together makes the relationship obvious and makes both easy to find by slug.

### Naming conventions

- **Slug**: kebab-case short description of the work (e.g., `auth-refactor`, `mobile-onboarding`)
- **No date prefix** in filenames — dates live inside the doc
- `plan-management` and `TODO.md` pointers use the slug as the stable reference

### Skills to update

- `brainstorming`: change hardcoded output path from `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` to `plans/<slug>/<slug>-design.md`
- `writing-plans`: confirm output path is `plans/<slug>/<slug>-plan.md` (verify current convention matches)
- `plan-management`: verify pointer format handles the unified structure

`docs/superpowers/specs/` is retired as a destination for new files. Existing specs stay where they are.

---

## Component 5: `/feedback` + `/review-workflow`

### Design principle

Capture and triage are separate. `/feedback` is non-interrupting note-taking. `/review-workflow` is the deliberate improvement session.

### `/feedback` skill

**Trigger:** User runs `/feedback <description>` during or immediately after any work session.

**Behavior:**

1. The skill runs briefly in the main context window to capture a snapshot:
   - Active plan doc path (from TODO.md or current session context)
   - Current Jira task if known
   - Which skill was last invoked (if known)
   - Verbatim user feedback text

2. Spawns a **background subagent** with that snapshot + the feedback text

3. Subagent appends a structured entry to `docs/workflow-feedback.md`:

```markdown
## [timestamp] <short description>

**Context:** <what was being worked on>
**Active plan:** <path if known>
**Skill involved:** <skill name or "unknown">
**Feedback:** <verbatim user input>
**Category:** <one of: skill-skipped | skill-too-heavy | circular-reasoning | missing-capability | memory-gap | workflow-conflict | agent-failing | rule-too-strict | other>
```

4. Returns a one-line confirmation to the main context. Does not interrupt ongoing work.

**The subagent has enough context** because the snapshot includes what the main window was doing — it doesn't need to read the full conversation.

### `/review-workflow` skill

**Trigger:** User runs `/review-workflow` when they have time to act on accumulated feedback.

**Behavior:**

1. Reads `docs/workflow-feedback.md`
2. Groups entries by category and skill
3. Identifies the highest-signal items (repeated categories, same skill appearing multiple times)
4. For each item, proposes the fix type and target:
   - Skill update → dispatch to `writing-skills`
   - New skill needed → dispatch to `writing-skills`
   - CLAUDE.md conflict → propose specific edit
   - Memory gap → write memory entry
   - Agent failing → debug and update agent instructions
   - Rule too strict → propose rule update
5. Executes approved fixes one at a time
6. Marks resolved entries in `docs/workflow-feedback.md`

### Future state: automated compliance (when workflow is stable)

Session hooks log skill invocations. A scheduled analysis compares actual vs expected skill flow and surfaces compliance gaps ("brainstorming was skipped 3 times this week"). This builds on the existing hooks infrastructure. Not in scope for this iteration.

---

## Component 6: Post-Implementation Rules Audit

### Purpose

After the skill behavior changes in Components 1–5 land, several CLAUDE.md and `rules/` entries will describe behavior that is now enforced by the skills themselves. Keeping redundant rules creates noise and risks contradictions as skills evolve. This component is a single focused cleanup pass — not a broad refactor.

### Known targets going in

- **`rules/filesystem-efficiency.md` and `rules/filesystem/efficiency.md`** — two files describing the same rules. Consolidate to one.
- **`rules/filesystem/efficiency.md` plan-doc-first section** — once Component 3 bakes this into the skills, the rule becomes documentation of skill behavior rather than an independent constraint. Evaluate whether it still needs to live in `rules/`.
- **CLAUDE.md delegation table entries** — after skill patches land, check whether each row still needs to be stated in CLAUDE.md or whether the skill itself enforces it. Remove rows that are now fully handled by the skill.

### Process

1. Read each flagged file
2. For each rule, ask: does a skill now enforce this, or does the skill rely on the rule being stated here?
3. If the skill enforces it independently → remove or simplify the rule
4. If the rule is load-bearing (skill reads CLAUDE.md or the rule to decide behavior) → keep it
5. If unclear → keep it and add a comment noting it's a candidate for future removal

### What this is not

Not a wholesale CLAUDE.md rewrite. Not an opportunity to restructure the rules directory. One pass, targeted removals only.

---

## Implementation Order

These components have dependencies:

1. **`project.json` schema** — foundational, everything else references it
2. **`project-setup` skill** — creates project.json, wraps init skills
3. **Skill patches** (git-manager, jira-workflow-manager, plan-gate, executing-plans, tdd) — read project.json
4. **Token efficiency patches** (brainstorming, writing-plans, executing-plans, using-superpowers) — orientation protocol
5. **Plan doc unification** (brainstorming, writing-plans path changes) — can run in parallel with 3–4
6. **`/feedback` + `/review-workflow` skills** — independent of above
7. **Rules audit** (Component 6) — must run last, after all skill behavior changes are live

Components 3, 4, 5 can be worked in parallel. Component 1 must precede 2 and 3. Component 6 must follow all others.

---

## Out of Scope

- Automated hook-based compliance monitoring (future state)
- Changes to superpowers plugin itself (all changes are to forked skills in this repo)
- Changes to `docs/superpowers/specs/` existing files (leave in place)
