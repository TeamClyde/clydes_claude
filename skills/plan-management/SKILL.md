---
name: plan-management
description: >
  Use after Jira tickets are created or change status (in_progress, done), when
  adding items to the backlog, or when reconciling TODO.md against current ticket
  state. Invoke after every ticket creation or status transition to keep TODO.md
  current.
argument-hint: "status:created|in_progress|completed|backlog|reconcile ticket-key:PROJ-N plan-doc:plans/slug/PLAN.md summary:'...'"
---

# plan-management Skill

## Purpose

Keep TODO.md current as a high-level pointer registry for all active work. Every entry links to a Jira ticket key and a plan doc path — TODO.md is a navigation index, not a duplicate task tracker. This skill performs structural edits only; all reasoning about what work to do stays with the caller.

---

## Inputs

| Parameter | Required | Values |
|-----------|----------|--------|
| `status` | Always | `created` \| `in_progress` \| `completed` \| `backlog` \| `reconcile` |
| `ticket-key` | Required for `created`, `in_progress`, `completed`; optional for `backlog` | e.g. `PROJ-42` |
| `plan-doc` | Required for `created`, `in_progress`, `completed` | e.g. `plans/slug/PLAN.md` |
| `summary` | Required for `completed`; optional for others | 1–2 sentences describing what was done |

---

## TODO.md Structure

Fixed section order — never reorder, never rename sections:

```markdown
# TODO

## In Progress
## Up Next
## Backlog
## History
```

### Item Formats

**Plan-backed item** (used in In Progress and Up Next):
```markdown
- [ ] [PROJ-N] Plan summary — [plan doc link](plans/slug/PLAN.md)
  - [ ] Sub-task 1
  - [ ] Sub-task 2
```

**Backlog item** (plain bullet, no checkboxes, no Jira key required):
```markdown
- [context note explaining why this work is needed] Optional tags: [scope], [blocked], [debt]
```

**History item** (after completion):
```markdown
- [x] [PROJ-N] Plan summary — completed YYYY-MM-DD. Summary sentence.
```

---

## Workflows

### `created` — Plan finalized, tickets created

1. Read TODO.md.
2. Search Backlog for an entry matching the new plan's scope (by topic, description similarity, or tags).
3. If a match is found: annotate the backlog entry with the Jira ticket key and plan-doc link, then move it to **Up Next** as a plan-backed item.
4. If no match: add a new plan-backed item directly to **Up Next** with the Jira key and plan-doc path.
5. Check for duplicates before adding — never create a second entry for overlapping scope.
6. Write TODO.md.

---

### `in_progress` — Execution begins

1. Read TODO.md.
2. Find the matching item in **Up Next** by ticket key.
3. Move the item from **Up Next** to **In Progress**.
4. Write TODO.md.

---

### `completed` — Task or feature group done

1. Read TODO.md.
2. Find the matching item in **In Progress** by ticket key.
3. Mark all sub-task checkboxes `[x]`.
4. Evaluate completion:
   - If **all sub-tasks are checked** (or there are no sub-tasks): move the entire item to **History** with today's date (YYYY-MM-DD) and the provided summary. Format: `- [x] [PROJ-N] Plan summary — completed YYYY-MM-DD. <summary>.`
   - If **some sub-tasks remain unchecked**: keep the item in **In Progress** with sub-tasks updated. Do not move to History until all sub-tasks are complete.
5. If the History section now exceeds approximately 15 entries: note this to the caller as a signal to archive older entries. Do not auto-archive.
6. Write TODO.md.

---

### `backlog` — Ad-hoc future scope capture

1. Read TODO.md.
2. Search existing **Backlog** entries for a duplicate (similar scope, description, or intent).
3. If a duplicate is found: surface it to the caller verbatim. Do not add a second entry. Wait for instruction.
4. If no duplicate: append a plain bullet to **Backlog** with a context note explaining why the item exists and any known dependencies or blockers. Apply tags if relevant:
   - `[scope]` — work that belongs to a defined scope boundary but has no plan yet
   - `[blocked]` — waiting on another ticket, decision, or external dependency
   - `[debt]` — known technical or design debt worth tracking
5. Write TODO.md.

---

### `reconcile` — Full sync check

1. Read TODO.md.
2. For each item in **In Progress** and **Up Next**: extract the Jira ticket key.
3. Surface the list of keys and their current TODO.md positions to the caller. **Do not call Jira directly.** The caller is responsible for verifying actual Jira status and reporting back any out-of-sync items.
4. Do not move any items without explicit caller instruction.
5. Append a reconciliation note at the bottom of TODO.md (outside all sections, after the last entry):
   ```
   <!-- reconciled: YYYY-MM-DD -->
   ```
6. Write TODO.md.

---

## Item Quality Rules

- Every plan-backed item **must** link to both a Jira ticket key and a plan doc path. No orphaned entries.
- Descriptions must be **specific and actionable**: "add retry logic to S3 upload handler" not "improve error handling".
- Backlog items **must** include a context note explaining why the item exists. A bare description with no context is not acceptable.
- Items are temporary by design — they move through sections and get archived. TODO.md is not a graveyard.

---

## Constraints

| Rule | Behavior on violation |
|------|-----------------------|
| History exceeds ~15 entries | Note it to the caller as an archive signal. Do not auto-archive. |
| Section order | Fixed: In Progress → Up Next → Backlog → History. Never reorder. |
| Scope of edits | Only touch the sections affected by the current operation. Never reformat or restructure sections not involved. |

---

## Does NOT

- Decide what work to do next
- Create or transition Jira tickets — delegate to `jira-workflow-manager`
- Call `jira-workflow-manager` except during `reconcile` when the caller explicitly requests a status read
- Perform git operations — delegate to `git-manager`
- Auto-resolve conflicts — surface them and wait for instruction
