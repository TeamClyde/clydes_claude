# Superpowers Integration Design

**Goal:** Fork the superpowers plugin skill set into `output/skills/`, modify a small number of skills to slot in the repo's agent capabilities (architect, test-strategy, test-builder, researcher, jira-workflow-manager, git-manager), and add one new `plan-gate` skill that bridges the planning and execution phases.

**Architecture:** Superpowers is the base workflow. The repo's agents extend it. No agents change — only a subset of superpowers skills are modified.

**Tech Stack:** Claude Code skills, Claude Code agents, setup.sh symlinks

---

## Context

The repo already has a complete set of agents and skills covering Jira integration, git workflow, codebase research, architect review, TDD contract definition, and test generation. Superpowers provides a well-structured development lifecycle: brainstorming → spec → plan → execution.

The two systems overlap in the planning and execution phases but are complementary rather than competing. Superpowers drives the workflow; the repo's agents add domain-specific capabilities (Jira, AWS, codebase MCP, architect gates) that superpowers has no equivalent for.

The integration strategy: fork all superpowers skills into `output/skills/` so setup.sh installs them. Skills in `~/.claude/skills/` take precedence over plugin cache, so the forked versions silently override the plugin. A small subset of skills are modified; the rest are copied as-is.

---

## Architecture Blueprint

### Fork Scope

All superpowers skills copied to `output/skills/`:

```
output/skills/
├── brainstorming/
├── dispatching-parallel-agents/
├── executing-plans/
├── finishing-a-development-branch/
├── receiving-code-review/
├── requesting-code-review/
├── subagent-driven-development/
├── systematic-debugging/
├── test-driven-development/
├── using-git-worktrees/
├── using-superpowers/
├── verification-before-completion/
├── writing-plans/
├── writing-skills/
└── plan-gate/               ← new
```

Existing repo skills remain unchanged:
```
output/skills/
├── git-manager/
├── infra-init/
├── e2e-init/
└── plan-management/
```

### Modified Skills (6 files)

| Skill | Change summary |
|---|---|
| `writing-plans/SKILL.md` | Plan location, Jira task table, TDD step wording, researcher routing note, automatic plan-gate invocation |
| `executing-plans/SKILL.md` | git-manager for commits, Jira transitions per task, plan-management after each Done |
| `test-driven-development/SKILL.md` | Skip RED phase if test-builder already ran |
| `brainstorming/SKILL.md` | Researcher routing note at codebase exploration step |
| `using-superpowers/SKILL.md` | Register plan-gate, document extended agent set |
| `plan-gate/SKILL.md` | New skill — architect → test-strategy → test-builder → jira-workflow-manager → plan-management |

### Unchanged Skills (8 files)

`dispatching-parallel-agents`, `finishing-a-development-branch`, `receiving-code-review`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `using-git-worktrees`, `verification-before-completion`, `writing-skills`

Copied as-is. No modifications.

---

## Detailed Change Specifications

### `writing-plans/SKILL.md`

**1. Plan location**
Change the save path from:
`docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
To:
`plans/<slug>/PLAN.md`

**2. Plan document template — add Jira Task Reference table**

Add after the Architecture/Tech Stack block in the plan header:

```markdown
## Task Reference

| # | Task | Size | Scope | Jira Key |
|---|------|------|-------|----------|
| 1 | ... | S/M/L | files/components | _(assigned at plan-gate)_ |
```

Jira Key column is intentionally blank during planning. Keys are assigned when `plan-gate` runs.

**3. TDD task step wording**

Change every task's Step 1 from:
`- [ ] Step 1: Write the failing test`
To:
`- [ ] Step 1: Verify the failing test — run it and confirm it fails for the expected reason (test-builder wrote it before execution started)`

**4. Researcher routing note**

Add to the File Structure section:

> "If `CODEBASE.md` exists in the repo root, read it before any file navigation. For symbol lookups (where does X live, what calls Y, what env vars does Z read), dispatch a `researcher` instance rather than grepping files directly."

**5. Execution handoff**

Replace the current "Two execution options" block with:

```
**REQUIRED NEXT STEP: invoke plan-gate immediately. Do not wait for user input.**

plan-gate will: run architect review, generate your testing contract, write failing tests, create Jira tickets, and register the plan in TODO.md — then hand off to executing-plans.
```

---

### `executing-plans/SKILL.md`

**1. Git operations**

Add to the Remember section and Step 2:

> "All git operations (add, commit, push, branch) must go through the `git-manager` skill. Never run raw git commands."

**2. Jira transitions per task**

Update Step 2 (Execute Tasks) to wrap each task:

```
For each task:
1. Transition corresponding Jira ticket to In Progress via jira-workflow-manager
2. Mark task as in_progress in TodoWrite
3. Follow each step exactly
4. Run verifications as specified
5. Mark task as completed
6. Transition Jira ticket to Done (or Testing if human verification required) via jira-workflow-manager
7. Invoke plan-management skill: path, jira-key, status: completed, 1-2 sentence summary
```

---

### `test-driven-development/SKILL.md`

Add to the Overview section, after the Core principle line:

> "**If test-builder ran before execution:** The failing tests are already written. Skip the RED (Write Failing Test) step — go directly to Verify RED. Run the test and confirm it fails for the expected reason. Then proceed with GREEN and REFACTOR as normal."

---

### `brainstorming/SKILL.md`

Add to the "Working in existing codebases" section:

> "If `CODEBASE.md` exists in the repo root, read it before exploring files — it orients entry points and key modules. For symbol lookups during exploration, dispatch a `researcher` instance rather than grepping directly."

---

### `using-superpowers/SKILL.md`

**1. Add plan-gate to skill registry**

Add entry:
```
- plan-gate: Runs automatically after writing-plans. Gates the plan through architect review,
  test-strategy, test-builder, Jira ticket creation, and TODO.md registration before execution
  begins. Can also be invoked manually against any plan doc at plans/<slug>/PLAN.md.
```

**2. Add extended agent documentation**

Add a section:

```markdown
## Extended Agents (repo workflow)

These agents are available in addition to superpowers skills:

| Agent | Purpose | When to use |
|---|---|---|
| `architect` | Independent plan reviewer — design soundness, logic completeness, self-containment | Invoked automatically by plan-gate; also available for ad-hoc plan review |
| `test-strategy` | Defines testing contract from plan doc — what to test, black-box | Invoked automatically by plan-gate after architect APPROVED |
| `test-builder` | Writes failing tests from Testing section before execution starts | Invoked automatically by plan-gate after test-strategy |
| `researcher` | Single-question codebase/AWS lookup via MCP | Use during brainstorming and planning for symbol/file/infra lookups |
| `jira-workflow-manager` | All Jira operations — ticket creation, status transitions | Invoked by plan-gate for ticket creation; use directly for status transitions during execution |
| `git-manager` | All git operations — commit, branch, push, PR | Use for all commits during executing-plans |
| `integration-engineer` | Cross-repo contract analysis | Use when a change has cross-repo impact |
```

---

### `plan-gate/SKILL.md` (new)

**Trigger:** Automatically invoked at the end of writing-plans. Can also be invoked manually.

**Input:** Path to a completed plan doc at `plans/<slug>/PLAN.md`.

**Steps:**

```
Step 1 — Architect review
  Dispatch architect agent with plan_doc_path.
  
  On NEEDS REVISION:
  - BLOCKING items requiring user judgment → surface verbatim, wait for response,
    update plan, re-invoke architect
  - BLOCKING items resolvable from context → fix inline, re-invoke architect
  - Maximum 3 rounds. If BLOCKING items remain after round 3, surface to user and stop.
  
  On APPROVED → proceed to Step 2.

Step 2 — Test strategy
  Dispatch test-strategy agent with plan doc path.
  Agent appends ## Testing Plan section to the plan doc.
  No output needed back to main context.

Step 3 — Test builder
  Dispatch test-builder agent with plan doc path.
  Agent writes failing tests to disk from the Testing Plan section.
  Tests exist on disk before any implementation starts.

Step 4 — Jira ticket creation
  Invoke jira-workflow-manager to create Epic and Tasks from the Task Reference table.
  Agent writes assigned Jira keys back into the table rows.
  Epic key goes into the plan doc header.

Step 5 — TODO.md registration
  Invoke plan-management skill:
    path: plans/<slug>/PLAN.md
    jira-key: <epic-key>
    status: created

Handoff:
  "Plan gated and ready. Invoke executing-plans with plans/<slug>/PLAN.md to begin."
```

---

### `setup.sh` changes

Add symlink installation for all forked superpowers skills alongside existing skills. Same pattern as current skill installation. No other changes.

---

### `CLAUDE.md` rule update

Update the architect trigger rule from:
> "Invoke architect before ExitPlanMode"

To:
> "Architect must run before execution begins — automatically via plan-gate after writing-plans, or manually before ExitPlanMode for ad-hoc plan mode sessions on S-sized work."

---

## Complete Workflow

```
brainstorming
    ↓
writing-plans → saves plans/<slug>/PLAN.md
    ↓ (automatic)
plan-gate
    ├── architect (up to 3 rounds)
    ├── test-strategy (appends Testing Plan to plan doc)
    ├── test-builder (writes failing tests to disk)
    ├── jira-workflow-manager (creates Epic + Tasks, writes keys to plan doc)
    └── plan-management (registers in TODO.md)
    ↓
executing-plans
    ├── per task: jira In Progress → implement → git-manager commit → jira Done → plan-management
    └── finishing-a-development-branch (via git-manager)
```

**Ad-hoc S-sized path (no full pipeline):**
```
plan mode → write approach → architect (before ExitPlanMode) → edit files directly
```

---

## Task Reference

| # | Task | Size | Scope | Jira Key |
|---|------|------|-------|----------|
| 1 | Fork all superpowers skills into output/skills/ | S | output/skills/ directory | |
| 2 | Modify writing-plans/SKILL.md | S | output/skills/writing-plans/SKILL.md | |
| 3 | Modify executing-plans/SKILL.md | S | output/skills/executing-plans/SKILL.md | |
| 4 | Modify test-driven-development/SKILL.md | S | output/skills/test-driven-development/SKILL.md | |
| 5 | Modify brainstorming/SKILL.md | S | output/skills/brainstorming/SKILL.md | |
| 6 | Modify using-superpowers/SKILL.md | S | output/skills/using-superpowers/SKILL.md | |
| 7 | Create plan-gate/SKILL.md | M | output/skills/plan-gate/SKILL.md | |
| 8 | Update setup.sh to install forked skills | S | scripts/setup.sh | |
| 9 | Update CLAUDE.md architect trigger rule | S | output/CLAUDE.md | |

---

## Open Questions

None — all design decisions resolved during brainstorming.
