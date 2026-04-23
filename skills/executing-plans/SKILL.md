---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
allowed-tools: Read, Agent
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Tell your human partner that Superpowers works much better with access to subagents. The quality of its work will be significantly higher if run on a platform with subagent support (such as Claude Code or Codex). If subagents are available, use superpowers:subagent-driven-development instead of this skill.

## The Process

### Step 1: Load and Review Plan
1. Read plan file
2. Review critically - identify any questions or concerns about the plan
3. If concerns: Raise them with your human partner before starting
4. If no concerns: Create TodoWrite and proceed

### Step 2: Execute Tasks

**Before starting the first task:** Read `project.json` at repo root if it exists. Note whether `jira.enabled` is true. If absent, assume Jira is enabled (legacy fallback).

For each task:
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
6. Mark task as completed
7. If Jira enabled: Transition Jira ticket to Done (or Testing if human verification required) via jira-workflow-manager. If Jira disabled: skip.
8. If Jira enabled: Invoke plan-management skill: path, jira-key, status: completed, 1-2 sentence summary. If Jira disabled: invoke plan-management skill with status: completed and summary only (omit jira-key).

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch
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
- **superpowers:using-git-worktrees** - REQUIRED: Set up isolated workspace before starting
- **superpowers:writing-plans** - Creates the plan this skill executes
- **superpowers:finishing-a-development-branch** - Complete development after all tasks
