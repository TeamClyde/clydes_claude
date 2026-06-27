---
name: requesting-code-review
description: Use when you want to request a code review — after completing a task, implementing a major feature, or before merging/opening a PR to verify work meets requirements. Owns the "submit work for review" direction. For acting on feedback you already received, use receiving-code-review.
allowed-tools: Agent, Bash, Read
---

# Requesting Code Review

Fan out a multi-lens dimensional-review panel over the diff. Each lens is a focused prompt to a model-pinned `general-purpose` agent — not a named agent type. Reviewers get precisely crafted context for their lens, never the session's history. After all lenses return, ONE batched **tiered adversarial verify** (triage → clustered re-check → contested-tail consensus) confirms findings against the diff — not dedup-only.

**Front-door citation:** This skill routes fan-out through `dispatching-parallel-agents` §"Dispatching in prose" (Shape A — Dimensional-review panel). See that section for the five rules and full schema depth at [`references/dispatch-policy.md`](references/dispatch-policy.md).

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Obtain the diff context once (pass to each lens agent):**
```bash
DIFF=$(git diff "$BASE_SHA".."$HEAD_SHA")
STAT=$(git diff --stat "$BASE_SHA".."$HEAD_SHA")
```

**3. Dispatch the dimensional-review panel:**

Fan out one model-pinned `general-purpose` agent per lens in a single parallel block. Each agent prompt begins with its lens role and includes the diff, stat, `WHAT_WAS_IMPLEMENTED`, and `PLAN_OR_REQUIREMENTS` as context.

**Lenses (prompts, not named agents):**
- `correctness` — logic errors, missing edge cases, broken requirements
- `security` — injection, auth gaps, credential exposure, unsafe patterns
- `performance` — hot-path inefficiencies, N+1 queries, memory issues
- `tests` — coverage gaps, mocks-over-logic, missing edge-case tests
- `style` — DRY violations, naming, decomposition, dead code

Dispatch all five in one parallel block (≤ min(16, cores−2) concurrent agents — five lenses fit comfortably). Model-pin every Agent call to Haiku or Sonnet; never Opus.

**4. Collect + verify:**

After all five lenses return (mark non-responding agents ABANDONED), run the **tiered adversarial verify** (`skills/dispatching-parallel-agents/references/verify-protocol.md`, `code-review` profile — defensive bias, guard false-positives): batched triage (dedup + label) → a clustered re-check of the escalated findings against their cited diff hunks → escalate ONLY the still-contested tail to a minority-veto 3-voter consensus. Not per-finding voting on every finding. If a verify tier hangs, surface the pre-tier findings as unverified.

**5. Act on the synthesized findings:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if a finding is wrong (with reasoning)

## Five Front-Door Rules

These apply identically to all prose consumers of `dispatching-parallel-agents`:

| Rule | This skill's application |
|---|---|
| 1. Model-pin leaves | Every lens agent: `model: "claude-haiku-4-5-20251001"` or Sonnet. Never Opus. |
| 2. Cap concurrency | Five lenses fit in one parallel block (≤ 16 concurrent). Batch if more lenses are added. |
| 3. Per-agent timeout | State a 60 s time bound in each lens prompt. Non-responding agent → mark ABANDONED. |
| 4. ONE tiered verify | After all lenses: one tiered adversarial verify (triage → clustered re-check → contested-tail consensus). No per-finding or per-lens vote loop. |
| 5. Cite front-door | See `dispatching-parallel-agents` §"Dispatching in prose" (Shape A). |

## Example

```
[Just completed Task 2: Add verification function]

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)
DIFF=$(git diff "$BASE_SHA".."$HEAD_SHA")
STAT=$(git diff --stat "$BASE_SHA".."$HEAD_SHA")

[Dispatch five lens agents in parallel — model-pinned to Sonnet:]

Lens 1 — correctness:
  [role: correctness-reviewer]
  Complete within 60 s or surface what you have.
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from plans/deploy/deploy-plan.md
  BASE_SHA: a7981ec / HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  GIT STAT: <stat>
  GIT DIFF: <diff>
  Focus: logic errors, broken requirements, missing edge cases.

Lens 2 — security:   [same structure, focus: security]
Lens 3 — performance: [same structure, focus: performance]
Lens 4 — tests:      [same structure, focus: test coverage]
Lens 5 — style:      [same structure, focus: DRY, decomposition]

[All five return. One verify agent:]
  [Tiered adversarial verify — code-review profile (verify-protocol.md). The batched triage call, e.g.:
   "Label each finding supported/uncertain/unsupported and merge duplicates; drop unsupported. Escalate uncertain/disagreed. Findings: <collected>".
   The escalated set then gets a clustered re-check vs the diff, and the still-contested tail a minority-veto 3-voter consensus.]

[Verify agent returns synthesized review:]
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators (tests lens)
    Minor: Magic number (100) for reporting interval (style lens)
  Assessment: Ready to proceed

[Fix progress indicators]
[Continue to Task 3]
```

## Lens Prompt Template

Each lens agent uses the same scaffold — only the focus line and role marker change.

```
[role: <lens>-reviewer]

Complete within 60 s. If you cannot finish, surface what you have found so far.

Use template at requesting-code-review/code-reviewer.md

WHAT_WAS_IMPLEMENTED: {WHAT_WAS_IMPLEMENTED}
PLAN_OR_REQUIREMENTS: {PLAN_OR_REQUIREMENTS}
BASE_SHA: {BASE_SHA}
HEAD_SHA: {HEAD_SHA}
DESCRIPTION: {DESCRIPTION}

GIT STAT:
{STAT}

GIT DIFF:
{DIFF}

REVIEW FOCUS: {focus for this lens only — see lens list above}

Return findings in the format from code-reviewer.md (Critical / Important / Minor).
```

**Placeholders:**
- `{WHAT_WAS_IMPLEMENTED}` — What you just built
- `{PLAN_OR_REQUIREMENTS}` — What it should do
- `{BASE_SHA}` — Starting commit
- `{HEAD_SHA}` — Ending commit
- `{DESCRIPTION}` — Brief summary

See full output format at: `requesting-code-review/code-reviewer.md`

## Integration with Workflows

**Subagent-Driven Development:**
- Review after EACH task (see `subagent-driven-development/code-quality-reviewer-prompt.md`)
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans:**
- Review after each batch (3 tasks)
- Get feedback, apply, continue

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback
- Run a verification loop per finding — one tiered adversarial verify only (triage → clustered re-check → contested-tail consensus)

**If a finding is wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

## Gotchas

1. Run tests and ensure they pass before requesting review — never submit a failing build for review.
2. Include the Jira key in the PR title if `jira.enabled: true` in project.json.
3. The PR description must link to the plan doc — reviewers need context the diff doesn't provide.
4. If a lens agent is ABANDONED (hung past 60 s), proceed with remaining lenses — do not re-dispatch the same lens.
5. When the verify agent signals `verifyDegraded` (or hangs), surface the raw per-lens findings as unverified rather than suppressing them.
6. Lenses are prompts to `general-purpose` agents — there is no named `code-reviewer` agent type to dispatch.
