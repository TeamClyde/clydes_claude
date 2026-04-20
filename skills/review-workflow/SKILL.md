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
