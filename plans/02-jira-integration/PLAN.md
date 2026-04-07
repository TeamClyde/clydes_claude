# Jira Integration System — Sub-Plan

**Parent Plan:** [MAIN-PLAN.md](../MAIN-PLAN.md)
**Status:** Designing
**Priority:** 3

---

## Problem Statement

The original `jira-workflow-manager` was built for a controlled test scenario: Claude creates tickets, Claude controls them, everything is structured. Real usage is messier. Tickets come from multiple origins — Claude planning sessions, runtime alerts, human team members, and eventually cross-repo dependencies. The current system has no model for any of these except the first.

The deeper issue is that Jira was too central. It became a workflow controller that blocked work and added process overhead. The goal of this plan is to redesign Jira as a **background tracking layer**: it records what happened and what was planned, but never gates or interrupts work.

## Files to Create

Everything currently in `~/.claude/agents/jira-workflow-manager.md` and `~/.claude/policies/jira-workflow-manager/` is being rewritten from scratch. The existing files are reference material only — not preserved as-is.

| File | Note |
|------|------|
| `~/.claude/agents/jira-workflow-manager.md` | Full rewrite |
| `~/.claude/policies/jira-workflow-manager/ticket-types.md` | Full rewrite |
| `~/.claude/policies/jira-workflow-manager/ticket-format.md` | Full rewrite |
| `~/.claude/policies/jira-workflow-manager/transitions.md` | Full rewrite |
| `~/.claude/policies/jira-workflow-manager/output-format.md` | Full rewrite |
| `~/.claude/policies/jira-workflow-manager/comment-policy.md` | New file |

---

## Design Rationale — Formalism Level

The Jira formalism in this system is calibrated for **cross-team visibility and external stakeholder tracking**, not just developer bookkeeping. Non-technical stakeholders and team members outside the development loop read Jira to understand what is done, what is in progress, and what is planned. The comment policy, origin taxonomy, collision detection, and description edit rules exist to serve that audience — they are not over-specified. The level of structure here is intentional and should not be trimmed in the name of simplicity.

---

## Core Principle

> Jira reflects reality. It does not control it.

Tickets are created to record intent or findings. Statuses reflect where work actually is. Comments capture deviations and discoveries. None of this blocks execution.

---

## Ticket Origin Taxonomy

| Origin | Creator | Trigger | Purpose |
|--------|---------|---------|---------|
| **Plan-execution** | Claude | Plan mode produces an execution plan | Record of what will be done; trail if interrupted |
| **Bug** | Claude | Sentry/CloudWatch alert, log review | Track investigation and fix |
| **Human-created** | Human | Anything | Claude works on it when prompted; keeps it current |
| **Cross-repo** | Claude | Work depends on another repo | Coordinate dependency; ensures cross-repo work is visible on both project boards |

---

## Origin 1 — Plan-Execution Tickets

### What they represent

Plan-execution tickets record **what will be done** — created from the plan *before execution begins*. The description is the plan as understood at creation time. If reality diverges, the description may be updated (see Ticket Maintenance below) and a comment explains the change.

Audit trail: description = current intent, comment thread = history of how intent changed.

### Epic/Task Decision

Every plan maps to one of three outcomes. Apply these checks in order:

**Step 1 — Check for an existing open Epic**
Does the work clearly advance the stated goal of an open Epic already in Jira? If yes: create child Tasks under that Epic. Do not create a new Epic.

**Step 2 — Determine if a new Epic is warranted**

*Is this enough work for an Epic?*
The work needs 3 or more distinct deliverable tasks and a single nameable outcome — something you can state in one phrase (e.g., "Enable push notifications for mobile app"). A pile of three S tasks with no unifying goal is still just tasks. The combined sizing should exceed what a single focused session could close — roughly L-scale or larger in total.

*Is this too much work for one Epic?*
If the task count is growing large (roughly 10+) or the work keeps expanding with no clear close horizon, it should be split into multiple Epics. An Epic that never closes has no tracking value. The signal is whether progress is visible — if you can't tell whether you're getting closer to done, the Epic is too big.

Exact thresholds are intentionally not prescribed. The goal is the right judgment call: not so small that an Epic is overkill, not so large that it becomes a permanent bucket. Thresholds can be refined with experience.

> **Note on time-based rules**: conventional Jira guidance uses calendar time (one sprint minimum, one quarter maximum) to bound Epics. These thresholds don't apply to AI-assisted work, which operates significantly faster than human sprint cycles. The S/M/L sizing system is the equivalent proxy — use combined task sizing and task count, not calendar estimates.

**Step 3 — Standalone Tasks (no Epic)**
Work that doesn't meet the Epic threshold creates standalone Tasks with no parent Epic. This includes one-off fixes, config changes, isolated improvements, and task clusters without a single unifying outcome.

### Epic naming and rules

Name Epics by **outcome, not implementation**:
- ✅ "Enable push notifications for mobile users"
- ✅ "Migrate billing to Stripe"
- ❌ "Implement FCM handler"
- ❌ "Refactor billing module"

The name should make sense to someone reading a roadmap who doesn't know the implementation details.

Never create "Miscellaneous", "Tech Debt", or open-ended container Epics. If work doesn't have a clear deliverable outcome and a foreseeable close date, it belongs as standalone Tasks.

### Ticket format

**Task:**

```
## Context
<2–3 sentence summary of what is being done and why. Reference the plan doc by name.>

## Scope
**Files to create or modify:**
| File | Action |
|------|--------|
| path/to/file.py | Modify — add X method |
| path/to/new_file.py | Create — new handler |

**Methods / Functions:**
- `method_name()` in `file.py` — description of change

## Implementation Notes
- Non-obvious decisions, patterns, configs, or data structures
- Mappings (e.g., old name → new name, trigger → template)

## Acceptance Criteria
- [ ] <testable condition — specific input/output or observable behavior>
- [ ] <testable condition>

## Testing
<Copied from the Testing section appended to the plan doc by the Test Strategy Agent.
Omit this section entirely if no testing section exists in the plan doc yet.>
```

**Token Estimate field**: write `S`, `M`, or `L` into the custom Token Estimate field — do not append it to the summary line. See Custom Fields section for project onboarding requirements.

**Epic:**

```
## Goal
<1–2 sentence outcome statement — what is delivered when this Epic is complete>

## Tasks
| Key | Summary | Size | Status |
|-----|---------|------|--------|
| (populated after task creation) | | | |

## Context
<Why this work is being done. Reference the originating plan doc.>
```

### Creation timing

Created by `jira-workflow-manager` after the plan is finalized and architect review is complete, before execution begins. The plan doc's Epic/Task Reference table is the source: one row → one ticket. Keys are written back into the table after creation.

### Lifecycle

```
To Do → In Progress → Testing* → Done
```

*Testing required when human verification is needed (AWS behavior, UI, observable output). Mechanical/structural changes go To Do → In Progress → Done directly after commit.

---

## Origin 2 — Bug Tickets

### Trigger

Currently: human pastes a Sentry link, CloudWatch log, or error output into the conversation. Long-term direction: automated monitoring feeds Claude directly (see Plan 03, Pillar 5). The Jira integration design is the same either way.

### Obviousness gate — ticket or inline

Before creating a ticket, apply this two-question check:

1. Is the root cause immediately obvious without investigation?
2. Is the fix trivial — one area, no downstream effects?

If **both** are yes → fix inline, no ticket. The commit message is the record.
If **either** is no → create a Bug ticket before investigating.

When ambiguous, default to creating the ticket. The cost of an extra ticket is lower than an untracked fix that turns out to be larger than expected.

### Ticket format

**Summary format:** `[Component] What breaks under what condition`
Example: `[Checkout] Order total shows $0 when promo code applied after item removal`

**Fields at creation:**
- **Severity:** Critical / Major / Minor / Trivial — set by Claude (see definitions below)
- **Priority:** left blank — requires business context, set by human at triage
- **Token Estimate:** left blank — unknown until investigation completes

```
## Error
<error message or stack trace — verbatim, not paraphrased>

## Observed Behavior
<what is actually happening>

## Expected Behavior
<what should happen>

## Environment
<deployment environment, relevant config state, app version if known>

## Source
<Sentry link / CloudWatch log group / paste>

## Linked Work
<Epic key or Task key if associated with recent changes — blank if none>

## Root Cause
<blank — do not edit; investigation findings go in a comment>

## Fix Approach
<blank — do not edit; investigation findings go in a comment>
```

### Severity

Severity is deterministic from the bug description. Claude sets it at creation.

| Severity | Definition |
|----------|-----------|
| Critical | Crash, data loss, security issue, total feature unavailability |
| Major | Core feature broken, no workaround exists |
| Minor | Feature degraded, workaround exists |
| Trivial | Cosmetic, typo, minor UX issue |

**Severity is not effort.** A Critical bug can be a one-line fix. A Trivial bug can require touching 40 files. They measure different things and must never be conflated.

### Priority

Priority requires business context — how urgently does this need to be fixed relative to other work. Claude does not set priority. Leave blank for the human to assign at triage.

### Investigation and fix

Bug tickets are worked in two phases within the same ticket:

1. **Investigate** — determine root cause. Write findings as a comment on the ticket before writing any fix code. The Root Cause and Fix Approach fields in the description remain blank — the comment is the record.
2. **Fix** — implement the fix. Update Token Estimate once scope is known.

If investigation reveals the fix is systemic (touches shared infrastructure, data model, or API contracts used elsewhere), do not widen the bug ticket. Instead: park the bug ticket, create a new Task describing the systemic problem, link it back to the original bug, and surface to the user before proceeding.

### Lifecycle

```
To Do → In Progress → Testing → Done
```

Bug tickets always go through Testing — the fix needs human verification.

### Comments

- **After investigation, before fixing**: add a comment with the root cause. This separates what was found from what was done.
- **If fix scope is larger than the bug description suggested**: note the scope change and update Token Estimate.
- **If investigation reveals a systemic issue**: comment to flag it, then create the linked Task as described above.

---

## Origin 3 — Human-Created Tickets

### What Claude does

When prompted to work on a human-created ticket:

1. Read the ticket via `jira-workflow-manager` — including any attachments the MCP can retrieve
2. If the ticket does not contain enough information to define what "done" looks like — and that cannot be reasonably inferred from context — ask for clarification before starting
3. Transition to In Progress
4. Execute the work
5. Transition to Testing or Done per standard rules

Human tickets will not follow Claude's structured format. Accept them as-is. Never require reformatting.

### Attachments

The Atlassian MCP (`jiraRead`, `fetch`) can retrieve attachment metadata and URLs. Read attachments when referenced and relevant (logs, screenshots, specs). If an attachment cannot be retrieved, flag it to the user rather than proceeding blind.

### Comments

More conservative than any other ticket type. Add a comment only when:
- **Ambiguity was resolved a specific way** and that interpretation should be on record
- **A follow-up was surfaced** that warrants a separate ticket
- **An important constraint or finding** emerged that the ticket creator would want to know

Never summarize what was done. The commit history and status transitions tell that story.

---

## Origin 4 — Cross-Repo Tickets

### Purpose

When work in one repo depends on a change in another, a ticket in the target repo's Jira project is created to track that dependency. Without this, cross-repo dependencies are invisible to stakeholders reading either project's board.

### Design

- Each repo's `CLAUDE.md` declares its Jira project key — this is the mapping from repository to Jira project
- Claude creates a ticket in the target project and links it back to the originating ticket/Epic using the `blocks / is blocked by` link type
- `jira-workflow-manager` handles cross-project creation using the target project key from the destination repo's `CLAUDE.md`
- The originating ticket is updated with the cross-repo link at creation time

### Implementation note

Full implementation depends on the Integration Engineer agent (Plan 05), which resolves repo-to-project mappings and can read foreign `CLAUDE.md` files. This section is complete from the Jira design perspective; the agent design is the outstanding dependency.

---

## Ticket Standards

### Link Types

Three link types cover all cases. Use them with discipline — incorrect or excessive linking pollutes the dependency map.

| Link type | Meaning | When to use |
|-----------|---------|-------------|
| `blocks / is blocked by` | Finish-to-start dependency — one must complete before the other can begin | True prerequisites only. Not "would be nice to do first." |
| `relates to` | Connection exists, but both can complete independently | Use sparingly. Tickets within the same Epic are already related by the Epic — no link needed. Valid cases: a bug relates to a specific task that likely introduced it; a new standalone task continues or extends a much older closed ticket. If in doubt, no link is better than a weak one. |
| `causes / is caused by` | Bug traceability — one issue created or triggered another | Bug tickets and post-incident tracing |

Link early, at creation time. Retroactively added links are frequently missed.

Links are informational only — Jira does not enforce them. A ticket marked "is blocked by" can still be moved to Done. Enforcement is the agent's responsibility, not the platform's.

### Custom Fields

**Default: no custom fields populated.**

The one standard custom field is **Token Estimate** (`S`, `M`, or `L`). All other custom fields are project-specific and must be explicitly documented in that project's `CLAUDE.md` before the agent applies them.

The Token Estimate field must be created in each Jira project before it can be used — it does not exist by default. When onboarding a new project, flag to the user that Token Estimate needs to be created. Until it exists, fall back to appending the size to the summary line as `[S]`/`[M]`/`[L]`.

---

## Ticket Maintenance

### Description Edit Policy

The default is that the description is **created once and not rewritten** — it represents what was planned at the time the ticket was created.

**Edits are only appropriate in these situations:**

| Situation | Before In Progress | After In Progress |
|-----------|-------------------|------------------|
| Factual error (wrong file path, typo, wrong method name) | Edit silently | Edit + paired comment |
| Acceptance criteria wrong or incomplete | Edit silently | Edit + paired comment |
| Scope formally expanded or narrowed after agreement | Edit silently | Edit + paired comment |

The dividing line is whether work has begun. Before a ticket is In Progress, silent edits are fine. Once In Progress, **any edit requires a paired comment** explaining what changed and why. Without it there is no audit trail that the spec shifted mid-execution.

Never rewrite a description to match what was actually done instead of what was planned. If execution differed from the plan, that difference lives in the comment thread — not in a revised description.

### Comment Policy

**Default: no comment.**

A comment is added only when it captures something not already recorded by the description, a status transition, or a commit message.

| Situation | Comment? | Note |
|-----------|----------|------|
| Execution diverged from the plan | Yes | What changed and why |
| Root cause identified (bugs) | Yes | Before fixing |
| Significant mid-execution decision | Yes | If not obvious from commits |
| Work blocked | Yes | Document the constraint |
| Ambiguity resolved a specific way (human tickets) | Yes | On record for ticket author |
| Description edited after work began | Yes | Required — explain what changed |
| Starting work | No | Transition handles it |
| Committed code | No | Commit message with key handles it |
| Task complete | No | Transition to Done handles it |
| Progress update | No | Noise |
| Conversation summary | Never | Explicitly prohibited |

---

## Agent Behavioral Constraints

### Concurrent work

Multiple agents can work different tasks simultaneously — this is expected and supported. The constraint is **one agent per task at a time**, not one task total. Before transitioning a ticket to In Progress, read its current status. If it is already In Progress, do not transition it — surface the conflict to the user and stop. Do not attempt to resolve the collision autonomously.

### Check for duplicates before creating

Before creating any ticket, search for existing open tickets covering the same scope. This applies to both plan-execution tickets (a plan may overlap with an existing Epic or Task) and bug tickets (the same error may already be logged). If a duplicate is found, surface it to the user rather than creating a second ticket or silently merging the work.

### Ticket creation is additive only

If Claude is asked to create a ticket that was missed (e.g., a task omitted during initial plan execution), the correct action is to **create a new ticket only**. Claude must never modify, merge, or rewrite tickets that already exist as a side effect of creating a new one.

This is an explicit anti-pattern that has occurred: when asked to retroactively create a missed task, the agent rewrote an existing task by combining it with the missing work, effectively destroying a ticket and hiding the original record. If there is apparent overlap with an existing ticket, surface the conflict to the user rather than resolving it silently.

### Set Resolution when transitioning to Done

Jira does not consider a ticket truly closed until the Resolution field has a value. Always set Resolution when transitioning to Done. Tickets Done without a resolution set may resurface as "active" in filters and reports.

---

## Cross-Plan Dependencies

| Plan | Relationship | Notes |
|------|-------------|-------|
| Plan 03 — Testing System | Bug triage (obviousness gate) | Reference Plan 03, Pillar 5 for the triage protocol; this plan owns only the Jira-specific actions. |
| Plan 03 — Testing System | Testing section in ticket format | Test Strategy Agent appends this to the plan doc; ticket format copies it. |
| Plan 03 — Testing System | Automated alert → ticket (future) | Runtime Observability owns the monitoring trigger; this plan owns the Jira side. |
| Plan 05 — Agent Architecture | Cross-repo ticket strategy | Integration Engineer agent may resolve the repo-to-project mapping question. |

---

## Deliverables

| # | Deliverable | Location | Notes |
|---|-------------|----------|-------|
| 1 | Jira workflow agent | `output/agents/jira-workflow-manager.md` | ✅ Complete |
| 2 | Ticket types policy | ~~`~/.claude/policies/jira-workflow-manager/ticket-types.md`~~ | ✅ Consolidated into agent file — Claude Code has no `policies/` directory concept |
| 3 | Ticket format policy | ~~`~/.claude/policies/jira-workflow-manager/ticket-format.md`~~ | ✅ Consolidated into agent file |
| 4 | Transitions policy | ~~`~/.claude/policies/jira-workflow-manager/transitions.md`~~ | ✅ Consolidated into agent file |
| 5 | Output format policy | ~~`~/.claude/policies/jira-workflow-manager/output-format.md`~~ | ✅ Consolidated into agent file |
| 6 | Comment policy | ~~`~/.claude/policies/jira-workflow-manager/comment-policy.md`~~ | ✅ Consolidated into agent file |
| 7 | Cross-repo strategy | This plan, Origin 4 section | Design complete; implementation depends on Integration Engineer agent (Plan 05) |
