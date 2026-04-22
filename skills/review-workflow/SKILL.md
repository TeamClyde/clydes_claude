---
name: review-workflow
description: Use when workflow-feedback.md has accumulated friction entries and you want to act on them — grouping patterns, proposing fixes to skills or rules, and routing improvements to the right component. Run periodically or after several feedback entries accumulate.
argument-hint: "(no arguments needed — reads docs/workflow-feedback.md)"
allowed-tools: Read, Write, Edit, Glob
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

### Step 5 — Commit changes

After all approved fixes are executed, invoke the `git-manager` skill to commit all modified files in a single commit:

```
Skill { skill: "git-manager", args: "commit files: [<all modified skill/rule/agent/feedback files>] type: chore description: 'apply workflow improvements from feedback review'" }
```

Include every file touched during Step 4 — skill files, rule files, agent files, and `docs/workflow-feedback.md`. Do not skip the commit step even if changes feel small.

### Step 6 — Summary

Report: N entries reviewed, M resolved, K deferred (and why). Include the commit hash.

---

## Notes

- Do not batch fixes — present one at a time and wait for approval
- Do not attempt fixes without user approval — propose first, execute second
- Entries with `Status: resolved` are skipped in Step 2
- If a fix requires a plan doc (L-sized work), create one via brainstorming rather than executing inline

## Gotchas

1. Run only when `workflow-feedback.md` has accumulated multiple entries — single-entry reviews produce changes too narrow to be useful.
2. Propose changes to skill files, not to CLAUDE.md directly — rules changes require more scrutiny.
3. After proposing improvements, route new skills through `creating-tools`, not direct `writing-skills` invocation.
