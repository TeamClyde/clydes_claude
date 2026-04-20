---
name: feedback
description: Use when experiencing friction, confusion, or a gap mid-session — a skill that didn't trigger, a rule that conflicted with reality, a missing capability, or a process that felt wrong. Captures the observation without interrupting current work.
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
