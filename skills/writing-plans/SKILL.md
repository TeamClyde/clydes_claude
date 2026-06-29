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

## Companion Files (Top-Level Plans)

Every top-level plan produces **three files**, not one. After writing `<slug>-plan.md`, scaffold:

### `<slug>-journal.md`

```markdown
# <Feature Name> — Journal

This file is append-only. Never edit prior entries. Add new dated entries at the bottom.
Journal-worthy events: plan deviations, root causes from debugging, test-mechanics changes,
mid-execution decisions that override plan-time decisions, sub-plan spawn/close events.
Skip: routine task completion, trivial formatting passes, in-session experimentation that changed nothing.

---

## YYYY-MM-DD — Plan created

Plan doc: `plans/<slug>/<slug>-plan.md`
Design doc: `plans/<slug>/<slug>-design.md`

Initial scope: [one sentence from the plan Goal]
```

Replace `YYYY-MM-DD` with today's date.

### `<slug>-handoff.md`

```markdown
# <Feature Name> — Handoff

**Status:** In Progress
**Active task:** Task 1 — [task name]
**Branch:** [branch name]
**Branched from:** [base branch name, e.g. `main` or `feature/gen2`] *(human-readable; the authoritative value lives in `.claude/worktrees/<wt-name>/base-branch` and is what `finishing-a-development-branch` reads)*
**Last updated:** YYYY-MM-DD

---

## Project Description

[2–3 sentences: what this plan builds and why]

## Status Snapshot

| Task | Status |
|------|--------|
| 1. [Task name] | 🔄 In Progress |
| 2. [Task name] | ⬜ Not started |

## What's Configured

[Environment, tools, or settings already in place that the next session needs to know]

## How to Run

[Commands to run tests, build, or verify the work in progress]

## Open Gotchas

[Known issues, edge cases, or surprises discovered so far — empty at plan creation]

## Immediate Next Steps

1. [First thing to do when picking this up]

## Pointers

- Plan: `plans/<slug>/<slug>-plan.md` — Task Reference table is the durable progress record
- Journal: `plans/<slug>/<slug>-journal.md` — append-only history of divergences and decisions
- Active task detail: see plan §Task N (line range, if known)
```

### `.claude/active-plan`

Write the relative path to the new plan file:

```
plans/<slug>/<slug>-plan.md
```

Create the file if it doesn't exist. Overwrite if it does.

### Branch Promotion (`wip/*` → canonical)

This step runs **only for top-level plans** (skip for sub-plans — see Sub-Plan Exception below).

After the slug and plan type are known, promote the provisional brainstorming branch to the canonical name and refresh the binding.

**Determine plan type** from the plan's nature (use one of: `feature`, `fix`, `chore`, `docs`). The canonical branch name is `<type>/<slug>`.

**Step 1 — Rename (only if current branch is `wip/*`)**

```bash
current=$(git rev-parse --abbrev-ref HEAD)
if [[ "$current" == wip/* ]]; then
  git branch -m "$current" <type>/<slug>
fi
```

If the current branch is NOT a `wip/*` branch (e.g., brainstorming's establish step was skipped because work was already on a feature branch), skip the rename entirely.

**Step 2 — Remote cleanup (only if the `wip/*` branch was pushed)**

The `wip/*` branch is normally LOCAL only — brainstorming does not push it. Only run this block if the old branch had a remote tracking ref:

```bash
# Check for a remote tracking ref on the old provisional branch name
if git ls-remote --heads origin "$current" | grep -q .; then
  git push origin --delete "$current"
  git push -u origin <type>/<slug>
fi
```

Skip this block entirely if the `wip/*` branch was local-only (the common case). No spurious `git push --delete` on a branch that was never pushed.

**Step 3 — Refresh the binding**

The worktree already has `extensions.worktreeConfig` enabled (brainstorming's establish step did this). Just update the value — do NOT re-run the enable or version gate:

```bash
git config --worktree claude.expectedBranch <type>/<slug>
```

For the full `git config --worktree` command, see `skills/git-manager/SKILL.md` § Branch Binding (P2).

**Step 4 — Update the handoff `Branch:` field**

In the just-scaffolded `<slug>-handoff.md`, replace the `[branch name]` placeholder in the `**Branch:**` line with the canonical branch name `<type>/<slug>`.

**No-op guard:** if the current branch is NOT `wip/*`, skip Steps 1–2. Still run Steps 3–4 to ensure `claude.expectedBranch` matches the current branch (whatever it is) and the handoff `Branch:` field reflects it accurately.

---

## Sub-Plan Exception (Form A)

When scaffolding a **sub-plan** (separate subdirectory under a parent plan), create **only**:
- `plans/<parent>/<child>/<child>-design.md`
- `plans/<parent>/<child>/<child>-plan.md`

Do **not** create a journal or handoff for sub-plans. The top-level journal and handoff continue to serve. Do **not** update `.claude/active-plan` — that is handled by `plan-management:spawn-subplan`.

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
| Trace who calls a function (DI wiring, call paths) | `query_graph` (Cypher: `MATCH (x)-[:CALLS]->(f:Function {name:"X"}) RETURN x`) |
| Confirm a symbol exists or find its location | `search_graph` |
| Map what a file imports and what imports it | `query_graph` (Cypher: `MATCH (f {file:"X"})-[:IMPORTS]->(d) RETURN d`) |
| Find where an env var / dart-define is consumed | Read `.claude-init/enrichments.json` directly |
| Identify all app entry points and triggers | `get_architecture` |
| Map API routes this app exposes or calls | `search_graph` (filter: Route nodes) |

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

## Plan Frontmatter

Every plan begins with a frontmatter block between `---` markers. Plan-gate and other workflow components read these fields to alter gate behavior.

| Field | Values | Effect |
|-------|--------|--------|
| `plan-type` | `standard` (default) | Full plan-gate sequence — architect, adherence-audit, test-strategy, test-builder, Jira, TODO.md |
| `plan-type` | `test-suite-addition` (or `tests-only`) | plan-gate Step 3 (test-builder) **skips** — the plan's deliverable IS the test suite, so writing failing tests against it would be circular. All other steps run normally. A `[test-only-plan]` journal entry records the skip. |

Set `plan-type: test-suite-addition` when the plan creates or expands a test suite as the primary deliverable (e.g., adding 25 new Patrol UI tests for a new device type, building out integration coverage for an existing module). When unsure, leave it as `standard` — the worst case is test-builder runs and produces a stub baseline you don't use; the worst case for an incorrectly-set `test-suite-addition` is that needed TDD baseline tests are silently skipped.

## Plan Document Header

**Every plan MUST start with this header (including the constitutional gate preamble):**

```markdown
---
plan-type: standard
---

# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT use the `superpowers:` prefix — invoke the local forked versions which have git-manager and plan-gate integration.

## Phase -1 Gate — Tick before starting Task 1

- [ ] Plan structure complete (header, Task Reference, File Structure, per-task sections)
- [ ] Journal initialized with first entry (`<slug>-journal.md` exists)
- [ ] Handoff scaffolded with current state (`<slug>-handoff.md` exists)
- [ ] `.claude/active-plan` set to this plan
- [ ] Architect review passed _(filled by plan-gate)_

---

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---

## Task Reference

| # | Task | Size | Complexity | Scope | Jira Key |
|---|------|------|------------|-------|----------|
| 1 | ... | S/M/L | S/M/L | files/components | _(assigned at plan-gate)_ |

Complexity is the input to tier-aware dispatch (see `subagent-driven-development` Model Selection): S → Haiku, M → Sonnet, L → Opus. Size is independent of complexity — a small but architecturally complex task may be `Size: S, Complexity: L`.
```

## Task Structure

Two task styles are valid — pick the one that fits the task.

### Inline-code style (direct code authoring)

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

### Dispatch-style (specialist-skill invocation)

Use this style when a task's execution is delegating to a specialist skill rather than direct code authoring (e.g., `writing-skills`, `writing-rules`, `writing-agents`, `plugin-dev:hook-development`).

````markdown
### Task N: [Component Name]

**Specialist:** `skill-name`

**Dispatch prompt:**

> [Exact prompt to pass to the specialist skill — self-contained, no pronouns requiring outer context]

**Files affected:**
- Create: `exact/path/to/file.md`
- Modify: `exact/path/to/existing.md`

**Verification:**
- [ ] [Specific observable outcome to confirm the specialist's output is correct]
- [ ] [Another outcome]
````

Both styles end with a commit step via `git-manager`. Inline-code tasks commit source files; dispatch-style tasks commit the files the specialist produced or modified.

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

plan-gate will run architect review (design soundness, self-containment), generate your testing contract, pause for your review and approval of the test strategy, then write failing tests, create Jira tickets, and register the plan in TODO.md — then hand off to executing-plans.

**Sub-plan handling:** when this skill is invoked for a Form A sub-plan (separate `plans/<parent>/<child>/` subdirectory), still invoke plan-gate — it will detect the sub-plan path and run in **sub-plan mode**: architect review + adherence-audit run as normal, but Jira ticket creation, TODO.md registration, test-strategy, and test-builder are skipped (the parent plan's run already covered those). If the sub-plan is a trivial refinement and even adherence-audit is overkill, invoke plan-gate with `mode: minimal` to skip everything except architect. See `skills/plan-gate/SKILL.md` § Sub-Plan Mode.

The Phase -1 Gate checkbox for "Architect review passed" is filled in by plan-gate after architect review completes.

## Gotchas

1. Every task in the plan must have exact file paths — no "the appropriate file" or "wherever it lives".
2. plan-gate fires automatically when this skill completes — do not also invoke architect manually.
3. Plans must be self-contained: a model with an empty context window should be able to execute the plan from the doc alone.
