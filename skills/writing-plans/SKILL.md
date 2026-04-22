---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code — produces a plan doc with concrete file paths, task breakdown, and architecture blueprint. Hands off to plan-gate automatically.
allowed-tools: Read, Write, Agent, Skill, Glob, Grep
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** This should be run in a dedicated worktree (created by brainstorming skill).

**Save plans to:** `plans/<slug>/<slug>-plan.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

Follow the orientation hierarchy before any file navigation: read `project.json` → read the file at `codebase-entry` (e.g. CODEBASE.md) → read the plan doc or spec if one exists → stop. Only fall back to targeted Grep or a `researcher` instance if a specific detail is genuinely absent from all three. Never run broad bash scans or read the code graph output directly.

**File access during planning:** When a specific detail requires opening a file you haven't read yet, apply the Explore-first heuristic: targeted question about an unknown-size file → dispatch Explore. Full logic review or line-level reference → Read with `offset`/`limit`. Do not read a 500-line file in full to extract 5 lines of facts — the efficiency rule has the full decision tree.

**Symbol navigation during planning:** Use codebase graph tools before Grep/Glob for these specific tasks:

| Need | Tool |
|------|------|
| Trace who calls a function (DI wiring, call paths) | `codebase_find_callers` |
| Confirm a symbol exists or find its location | `codebase_search_symbol` |
| Map what a file imports and what imports it | `codebase_find_dependencies` |
| Find where an env var / dart-define is consumed | `codebase_get_env_var` |
| Identify all app entry points and triggers | `codebase_get_entry_points` |
| Map API routes this app exposes or calls | `codebase_search_api_endpoints` |

Using Grep for symbol tracing when graph tools are available is a plan quality failure — graph tools return complete call graphs; Grep returns partial text matches that miss injected or aliased usages.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Agent Answers Are Ground Truth

When a researcher or Explore agent answers a code question during planning, that answer is settled. Do not reason past it in context. Specifically:
- Accept the agent's answer and move on
- If the answer is incomplete or raises a follow-up, dispatch a narrower follow-up agent
- Never reason in-context about something an agent has already answered or could answer with a targeted dispatch

Circular reasoning past agent answers is a plan quality failure — it produces incorrect assumptions that architect review must correct.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT use the `superpowers:` prefix — invoke the local forked versions which have git-manager and plan-gate integration.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---

## Task Reference

| # | Task | Size | Scope | Jira Key |
|---|------|------|-------|----------|
| 1 | ... | S/M/L | files/components | _(assigned at plan-gate)_ |
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Verify the failing test — run it and confirm it fails for the expected reason (test-builder wrote it before execution started)**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Execution Handoff

**REQUIRED NEXT STEP: invoke plan-gate immediately. Do not wait for user input.**

plan-gate will: run architect review, generate your testing contract, pause for your review and approval of the test strategy, then write failing tests, create Jira tickets, and register the plan in TODO.md — then hand off to executing-plans.

## Gotchas

1. Every task in the plan must have exact file paths — no "the appropriate file" or "wherever it lives".
2. plan-gate fires automatically when this skill completes — do not also invoke architect manually.
3. Plans must be self-contained: a model with an empty context window should be able to execute the plan from the doc alone.
