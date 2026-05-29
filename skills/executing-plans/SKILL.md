---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
allowed-tools: Read, Agent
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Tell your human partner that Superpowers works much better with access to subagents. The quality of its work will be significantly higher if run on a platform with subagent support (such as Claude Code or Codex). If subagents are available, use subagent-driven-development instead of this skill.

## The Process

### Step 1: Load and Review Plan
1. Read plan file
2. Review critically - identify any questions or concerns about the plan
3. If concerns: Raise them with your human partner before starting
4. If no concerns: Create TodoWrite and proceed

### Step 2: Execute Tasks

**Before starting the first task:** Read `project.json` at repo root if it exists. Note whether `jira.enabled` is true. If absent, assume Jira is enabled (legacy fallback).

For each task:

#### Constitutional Entry Gate (assert before starting the task)

Before doing any work on a task, assert all of the following. **If any check fails, stop and refuse to start the task until the condition is met.**

- [ ] **E1 — Active plan confirmed:** `.claude/active-plan` exists and points to the correct plan doc for this work. If missing or pointing to the wrong plan, do not start — surface the discrepancy to the user.
- [ ] **E2 — Previous task ✅:** The previous task's row in the plan's Task Reference table is marked ✅ (or this is Task 1 and no prior row exists). If the prior task row is not ✅, do not start the new task — mark the prior task complete first.
- [ ] **E3 — Task prompt read:** The dispatch prompt (if dispatch-style) or the inline step list (if traditional) for this task has been read in full before any implementation begins.

**Entry gate failure message format:**
> ENTRY GATE FAILED — [E1 | E2 | E3]: [specific reason]. Cannot start Task N until this is resolved.

---

1. If Jira enabled: Transition corresponding Jira ticket to In Progress via jira-workflow-manager. If Jira disabled: skip.
2. Mark task as in_progress in TodoWrite
3. Follow each step exactly (plan has bite-sized steps)
4. Run verifications as specified
4a. **If `.claude/testing-plan.md` exists in the repo:** invoke test-runner to verify the
    implementation before marking the task complete:
    ```
    Agent {
      subagent_type: "test-runner",
      prompt: "plan_doc: [path to current plan doc]\ntesting_plan: .claude/testing-plan.md"
    }
    ```
    - **PASS**: proceed to step 5.
    - **FAILURE**: invoke `systematic-debugging` before any fix attempt:
      `Skill { skill: "systematic-debugging" }`. Do not mark the task complete or attempt fixes
      until systematic-debugging has completed Phase 3 (hypothesis validation). Re-run
      test-runner after all confirmed fixes are applied to confirm PASS before proceeding.
    - **SETUP REQUIRED**: `.claude/testing-plan.md` is missing — run `e2e-init` first, or skip
      test-runner for this repo if testing is not yet configured.
    - If `.claude/testing-plan.md` does not exist: skip this step silently.
5. **If the task created one or more skills:** run `pulser --strict --skill <name> --no-anim` before marking done. Fix any warnings or errors before proceeding. This is a hard gate — do not skip even if pulser was not listed in the plan's testing section.
5a. **Mark the task's row in the plan's Task Reference table ✅** — edit `<top>-plan.md` and add the ✅ marker to the row. This is the durable completion record the exit gate (X1) confirms. Doing this before the exit gate makes X1 a confirmation step rather than an orphaned precondition.
5b. **Tick all step-level checkboxes inside the just-completed task's detail section** — edit `<top>-plan.md` and change every `- [ ]` to `- [x]` inside the Task N detail section. Bulk-ticking at task close is acceptable (the Task Reference row ✅ is the authoritative completion signal); step checkboxes provide a durable per-step track record for future sessions reading the plan.

#### Constitutional Exit Gate (assert before marking the task complete)

Before marking a task ✅ or transitioning its Jira ticket, assert all of the following. **If any check fails, stop and refuse to advance until the condition is met.**

- [ ] **X1 — Task Reference row ✅:** The task's row in the plan's Task Reference table has been marked ✅. This is mandatory even for trivial changes.
- [ ] **X2 — Divergence journaled (if applicable):** If any divergence occurred during the task — architecture change, file path moved, signature changed, scope shift, discovered bug, test-debt finding — a journal entry has been appended via `plan-management:divergence`. See trivial-change exception below.
- [ ] **X3 — Handoff refreshed:** The handoff's status table has been updated: Active task advanced to the next task, and any new gotchas relevant to the next session have been recorded.
- [ ] **X4 — Test-mechanics divergence handled (if applicable):** If the task changed how tests run (new pytest flag, new fixture, new env var requirement, new skip group, changed test command, etc.), then:
  - A journal entry tagged `[test-mechanics]` was written via `plan-management:divergence`, AND
  - The relevant testing artifact (`.claude/testing-plan.md`, `scripts/run-tests.sh`, or repo equivalent) was updated **in the same `plan-management:divergence` call**.
  Test-mechanics changes always count as divergence regardless of how small they appear.

**Exit gate failure message format:**
> EXIT GATE FAILED — [X1 | X2 | X3 | X4]: [specific reason]. Cannot mark Task N complete until this is resolved.

**Trivial-change exception (X2 and X4 only):**
The journal entry (X2) is optional — and X4 does not apply — when ALL of the following are true:
- The change is a one-line typo fix, whitespace/formatting correction, comment-only edit, or documentation-only prose edit (e.g., rewording one paragraph in a markdown file with no logic, behavioral, or test-mechanics implications)
- No behavioral change of any kind was introduced
- No test-running mechanics were changed
X1 (Task Reference ✅) and X3 (handoff refresh) are still mandatory even for trivial changes — they are never skipped.

---

6. Mark task as completed
7. If Jira enabled: Transition Jira ticket to Done (or Testing if human verification required) via jira-workflow-manager. If Jira disabled: skip.
8. If Jira enabled: Invoke plan-management skill: path, jira-key, status: completed, 1-2 sentence summary. If Jira disabled: invoke plan-management skill with status: completed and summary only (omit jira-key).

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use finishing-a-development-branch
- Follow that skill to verify tests, present options, execute choice

## Gotchas

1. **Skipping Step 1 (plan review) to save time.** Plans have gaps. Reviewing critically before touching any code catches blockers before they cost two hours of work. Read the whole plan first.
2. **Not checking `project.json` before starting.** Jira and git behavior depend on it. Starting without reading it produces commits with missing keys or broken transitions.
3. **Marking a task complete before its verification passes.** Verification is part of the task. A task with failing tests or a failing pulser check is not done — it is still in progress.
4. **Skipping the pulser gate for skill-creation tasks.** This is the most common way newly-created skills ship with a lower score than they should. Step 5 is a hard gate — no exceptions.
5. **Batching task completions.** Mark each task done the moment it is verified, before starting the next. Batching makes it easy to lose track of which step failed if something goes wrong.
6. **Skipping the test-runner step when testing-plan.md exists.** If the repo has `.claude/testing-plan.md`, test-runner must be invoked after implementation and before marking the task complete. Skipping it means failures are discovered later, making root cause harder to isolate.

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent
- All git operations (add, commit, push, branch) must go through the `git-manager` skill. Never run raw git commands.

## Integration

**Required workflow skills:**
- **using-git-worktrees** - REQUIRED: Set up isolated workspace before starting
- **writing-plans** - Creates the plan this skill executes
- **finishing-a-development-branch** - Complete development after all tasks
