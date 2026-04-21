# Plan Docs — When and How to Create Them

Two types of plan-related files exist. Do not conflate them.

## Plan-Mode Plan (`~/.claude/plans/<slug>.md`)

Created automatically by Claude Code for every plan mode session. All plan mode work produces this file. S and M-sized tasks that use plan mode still produce this file — they do not require a local counterpart.

## Implementation Plan Doc (`plans/<slug>/<slug>-plan.md` in the local repo)

Required when plan mode wraps up for **L-sized work**: several files affected, many implementation steps. Create this file **before calling `ExitPlanMode`** using the Write tool at `plans/<slug>/<slug>-plan.md` in the project root. This is a separate file from the global plan mode file — do not reference or substitute one for the other.

If a design doc exists for this work (`plans/<slug>/<slug>-design.md`), the implementation plan was produced by the `writing-plans` skill after `brainstorming` completed — read the design doc as the starting point.

### Required sections

- **Epic / Task Reference** — placeholder ticket descriptions used during planning. Include a
  suggested Epic summary and a task table (columns: #, Task, Size, Scope). Jira keys are left
  blank until execution begins — do not create real tickets during plan mode. If the plan builds
  on pre-existing tickets, list their keys and summaries instead. This section becomes the source
  of truth for ticket creation when execution begins.
- **Context** — why the change is being made
- **Architecture blueprint** — file paths, function signatures, enum values, domain mappings, external resource names (DynamoDB tables, SQS queues, SES templates, etc.)

As each Jira ticket is completed and committed, mark the corresponding row in the Epic / Task
Reference table as done (e.g. prepend `✅` to the task name).

**`TodoWrite` is not a substitute for plan doc updates.** `TodoWrite` is session-scoped and resets
between conversations. The plan doc's Epic / Task Reference table is the durable record. Both must
be maintained independently:

- `TodoWrite`: update task status in real time during the session (in_progress → completed)
- Plan doc table: mark the row done after each Jira ticket is transitioned to Done

### When to skip

The trigger is work scope, not whether plan mode was invoked:

| Size | Local plan doc? |
| ---- | --------------- |
| S — 1–3 files, targeted change | No |
| M — several files, some cross-cutting | No |
| L — many files, significant work, many steps | **Yes — create before ExitPlanMode** |

### Plan doc refinements

Editing or refining an existing plan doc is an **S-sized task**. It does not:

- Require a new plan doc
- Require architect review
- Require a new TODO.md entry (unless scope significantly changes)

### After creating a plan doc

The plan doc may go through multiple refinement passes before execution begins. No Jira tickets
exist yet — the Epic/Task Reference table holds placeholder rows only. When the plan is ready and
the user signals intent to proceed, follow Phase 1 Path B of `workflow-phases.md` to create real
tickets and sync to TODO.md.

### After completing a plan

Invoke the `plan-management` skill with: plan doc path, Jira key, status `completed`, and a 1–2 sentence summary of what was done.
