---
name: feedback
description: Use when experiencing friction, confusion, or a gap mid-session — a skill that didn't trigger, a rule that conflicted with reality, a missing capability, or a process that felt wrong. Captures the observation as a GitHub issue without interrupting current work.
argument-hint: "<description of what felt wrong>"
allowed-tools: Read, Agent
---

# feedback

Log workflow friction as a GitHub issue without interrupting current work.

**Usage:** `/feedback <what felt wrong>`

Examples:
- `/feedback brainstorming got skipped when starting the auth feature`
- `/feedback plan-gate ran architect review on a 2-line config change`
- `/feedback had to explain the Jira project key again`
- `/feedback claude argued with itself about whether to use git-manager`

**Requires:** `gh` CLI authenticated (`gh auth login` once per machine).

---

## Behavior

### Step 1 — Capture context snapshot (runs in main context)

Before spawning the agent, capture:

```
SNAPSHOT:
- Active plan doc: [read from TODO.md In Progress section, or "none"]
- Current Jira task: [read from TODO.md In Progress section, or "unknown"]
- Last skill invoked: [from current session context, or "unknown"]
- Verbatim feedback: [the argument passed to /feedback]
- Timestamp: [current date/time]
```

### Step 2 — Create GitHub issue via subagent

Spawn an Agent with this prompt (substitute all SNAPSHOT values before spawning):

> Classify the following workflow friction, then create a GitHub issue using the `gh` CLI.
>
> Feedback: "[VERBATIM_FEEDBACK]"
> Active plan: [ACTIVE_PLAN]
> Current task: [CURRENT_TASK]
> Last skill: [LAST_SKILL]
> Timestamp: [TIMESTAMP]
>
> Step A — Classify into exactly one category:
> `skill-skipped` | `skill-too-heavy` | `circular-reasoning` | `missing-capability` | `memory-gap` | `workflow-conflict` | `agent-failing` | `rule-too-strict` | `other`
>
> Step B — Create the issue:
> ```bash
> gh issue create \
>   --repo TeamClyde/clydes_claude \
>   --title "[workflow-friction] [short description]" \
>   --body "## Workflow Friction
>
> **Feedback:** [VERBATIM_FEEDBACK]
> **Category:** [chosen category]
>
> ### Context
> | Field | Value |
> |-------|-------|
> | Active plan | [ACTIVE_PLAN] |
> | Current task | [CURRENT_TASK] |
> | Last skill | [LAST_SKILL] |
> | Timestamp | [TIMESTAMP] |" \
>   --label "workflow-friction"
> ```
> If the `workflow-friction` label does not exist, create it first:
> ```bash
> gh label create "workflow-friction" --repo TeamClyde/clydes_claude --color "#e4e669" --force
> ```
>
> If `gh` is not authenticated, return: "AUTH_FAILED: run `gh auth login` in a terminal, then retry."
>
> Otherwise return only: "Logged: [short description] — [issue URL]"

### Step 3 — Confirm (in main context)

If the agent returned `AUTH_FAILED:`, surface the message to the user and stop.

Otherwise report the single-line confirmation and continue with current work.

---

## Notes

- One issue per /feedback invocation — no batching
- The agent classifies the category; the user does not need to choose it
- Issues are always created in TeamClyde/clydes_claude regardless of the active working repo

## Gotchas

1. Log even if the friction feels minor — review-workflow needs volume to identify patterns.
2. Do not try to resolve the friction in the same session as capturing it — capture first, /review-workflow addresses later.
3. One issue per friction point — do not batch multiple observations into one issue.
