---
name: plan-management
description: >
  Use when Jira tickets are created or change status (in_progress, done), when
  adding items to the backlog, when reconciling TODO.md against current ticket
  state, or when a plan deviation is discovered, a sub-plan is spawned, or a
  sub-plan is ready to close. Invoke after every ticket creation or status
  transition to keep TODO.md current; invoke for plan-doc state changes
  (divergence, spawn-subplan, close-subplan) independently of Jira.
argument-hint: "status:created|in_progress|completed|backlog|reconcile|divergence|spawn-subplan|close-subplan ticket-key:PROJ-N plan-doc:plans/slug/<slug>-plan.md summary:'...'"
allowed-tools: Read, Write, Edit
---

# plan-management Skill

## Purpose

Two complementary responsibilities in one skill:

1. **TODO.md registry maintenance** — keep TODO.md current as a high-level pointer registry for all active work. Every entry links to a Jira ticket key and a plan doc path. TODO.md is a **navigation registry that points at active plans**, not a duplicate task tracker or a third sync target. This skill performs structural edits only; all reasoning about what work to do stays with the caller.

2. **Plan-doc state management** — maintain the four-file plan tree (plan + journal + handoff + design) in sync via three new modes (`divergence`, `spawn-subplan`, `close-subplan`). These modes operate on plan-doc state independently of Jira. They are the skill-internal forcing functions that prevent plan drift, knowledge loss on sub-plan close, and context-load overhead across sessions.

---

## Active-Plan Marker — `.claude/active-plan`

Single-line file at `.claude/active-plan` (relative to repo root). Holds the relative path (from repo root) to the currently active `<slug>-plan.md`.

**Convention:**
- Always points at the **deepest active plan** in the tree (a sub-plan if one is active, otherwise the top-level plan).
- Format: one line, relative path, no trailing newline. Example: `plans/my-feature/my-feature-plan.md`
- Created by the plan-creation flow (`writing-plans`).
- Updated by `spawn-subplan` (set to child plan path) and `close-subplan` (reverted to parent plan path or deleted on tree completion).
- **Deleted** (not just emptied) when the top-level plan completes — subsequent SessionStart hooks see no active-plan and exit silently.
- Read by: the SessionStart hook, the `git-manager` plan-state validator, and constitutional gates inside `executing-plans`, `subagent-driven-development`, and `systematic-debugging`.

**Walk-up algorithm** (used by `divergence`, `spawn-subplan`, and `close-subplan` to resolve the top-level plan):
Starting from the active plan's directory, walk up one directory level. If that directory contains a `*-plan.md` file, the current plan is a sub-plan and the parent is that file. Keep walking up until reaching a directory with no `*-plan.md` — that is the top level. The top-level plan's peer files (`<top>-journal.md`, `<top>-handoff.md`) are the targets for all journal appends and handoff refreshes.

---

## Inputs

| Parameter | Required | Values |
|-----------|----------|--------|
| `status` | Always | `created` \| `in_progress` \| `completed` \| `backlog` \| `reconcile` \| `divergence` \| `spawn-subplan` \| `close-subplan` |
| `ticket-key` | Required for `created`, `in_progress`, `completed` **when `project.json` has `jira.enabled: true`** (omit entirely when `jira.enabled: false`); optional for `backlog`; **not applicable** for `divergence`, `spawn-subplan`, `close-subplan` | e.g. `PROJ-42` |
| `plan-doc` | Required for `created`, `in_progress`, `completed`; required for `divergence`, `spawn-subplan`, `close-subplan` | e.g. `plans/slug/<slug>-plan.md` |
| `summary` | Required for `completed`; required for `divergence` (description of the deviation); required for `close-subplan` (structured closeout — see below); optional for others | 1–2 sentences describing what was done |
| `tag` | Required for `divergence` | One or more tags from the authoritative taxonomy (see `divergence` mode) |
| `plan-section` | Required for `divergence` | The heading or line range in `<top>-plan.md` to surgically update |
| `child-slug` | Required for `spawn-subplan` | Slug for the new child plan directory |
| `parent-task` | Required for `spawn-subplan` | The parent task number or description that is being expanded |
| `closeout-summary` | Required for `close-subplan` | 1-paragraph summary of what the sub-plan accomplished |
| `closeout-decisions` | Required for `close-subplan` | Key decisions made during sub-plan execution |
| `closeout-gotchas` | Required for `close-subplan` | Gotchas and lessons worth preserving |

**Jira-disabled handling — all modes:**
- **New modes:** `divergence`, `spawn-subplan`, and `close-subplan` do not consume `ticket-key` regardless of Jira state — they operate on plan-doc state independently of Jira.
- **Status modes (`created`, `in_progress`, `completed`):** when `project.json` has `jira.enabled: false`, callers omit the `ticket-key` argument entirely (do not pass an empty string). The skill body proceeds without writing a Jira-key column to TODO.md and without any Jira-key validation. The Task Reference table's Jira Key column simply remains blank.
- **Backlog mode:** `ticket-key` remains optional regardless of Jira state.

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
- [ ] [PROJ-N] Plan summary — [plan doc link](plans/slug/<slug>-plan.md)
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

**Rationale:** TODO.md is a navigation registry that points at active plans. When a new plan is created and tickets assigned, an entry must appear in TODO.md so any session can locate the work without scanning `plans/`.

1. Read TODO.md.
2. Search Backlog for an entry matching the new plan's scope (by topic, description similarity, or tags).
3. If a match is found: annotate the backlog entry with the Jira ticket key and plan-doc link, then move it to **Up Next** as a plan-backed item.
4. If no match: add a new plan-backed item directly to **Up Next** with the Jira key and plan-doc path.
5. Check for duplicates before adding — never create a second entry for overlapping scope.
6. Classify the plan before adding: is this a **deeper dive** (extends an existing TODO item's scope) or **net new** (introduces work not captured anywhere)? For a deeper dive, annotate the existing item rather than creating a parallel entry.
7. Write TODO.md.

---

### `in_progress` — Execution begins

**Rationale:** TODO.md is a navigation registry. Moving the item to In Progress signals to any session opening this repo that this plan is actively being worked and should be loaded via the `.claude/active-plan` marker.

1. Read TODO.md.
2. Find the matching item in **Up Next** by ticket key.
3. Move the item from **Up Next** to **In Progress**.
4. Write TODO.md.

---

### `completed` — Task or feature group done

**Rationale:** TODO.md is a navigation registry. History entries are a pointer to completed work for reference. The canonical completion record is the Task Reference row ✅ in the plan doc — History is the navigational echo of that fact.

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

**Rationale:** TODO.md is a navigation registry. The Backlog section captures work that has no plan yet — it is the lowest-fidelity pointer, but it keeps future scope visible without creating premature plan docs.

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

**Rationale:** TODO.md is a navigation registry. Reconcile surfaces the current registry state so the caller can verify it matches real Jira state. The skill does not call Jira — it surfaces the keys; the caller compares.

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

### `divergence` — Atomic three-write for plan deviations

**Rationale:** When a plan deviation is discovered (architecture change, file path moved, signature changed, test-mechanics change, root cause from `systematic-debugging`, etc.), three files must stay in sync: the journal gets a new entry, the plan gets a surgical edit, and the handoff gets a refresh. This mode does all three in one call so they cannot drift apart.

**Trigger conditions (invoke this mode for):**
- Architecture changes, file path moves, signature changes, scope changes
- Root cause found by `systematic-debugging`
- Mid-task discovered bug or test debt
- Test-running mechanics change (new flag, env var, fixture pattern, skip group, etc.)
- Mid-execution decision that overrides a plan-time decision
- Environment-specific workaround discovered
- Any content that a future session would need to know that isn't already captured in the plan or git history

**Do not invoke for:** routine task completion (Task Reference is the record), trivial typo fixes, formatting passes, in-session experimentation that changed nothing, content already adequately captured in commit messages.

#### Authoritative Tag Taxonomy

Every journal entry appended by `divergence` must include at least one tag from this list:

| Tag | When to use |
|-----|-------------|
| `[bug]` | A defect discovered mid-execution |
| `[test-debt]` | A test gap or flaky test discovered mid-execution |
| `[divergence]` | An architecture, file path, signature, or scope change from the plan |
| `[decision]` | A mid-execution decision that overrides or refines a plan-time decision |
| `[test-mechanics]` | A change to how tests are run (new flag, env var, fixture pattern, skip group) |
| `[constraint]` | A runtime-discovered constraint (replaces per-plan integration-test-constraints.md) |
| `[debug-cascade]` | A debugging cascade root cause and fix |
| `[subplan-spawn]` | A sub-plan was spawned (written automatically by `spawn-subplan` mode) |
| `[subplan-close]` | A sub-plan was closed (written automatically by `close-subplan` mode) |

Multiple tags may apply. Example: a flaky test discovered mid-execution is `[bug] [test-debt]`.

#### Workflow

1. Read `.claude/active-plan` to identify the active plan path.
2. Walk up the directory tree (using the walk-up algorithm in the Active-Plan Marker section) to resolve `<top>-journal.md`, `<top>-plan.md`, and `<top>-handoff.md`.
3. **Idempotency check — journal:** Read `<top>-journal.md`. Search for a dated entry header matching today's date AND the summary text provided. If the header already exists (partial write recovery), skip the journal append step.
4. If no matching entry: append a new dated entry to `<top>-journal.md`:
   ```markdown
   ## YYYY-MM-DD — <summary> <tag(s)>

   <detailed description of what changed and why>

   **Plan section affected:** <heading or line range>
   **Fix / new state:** <what the plan now says>
   ```
5. **Idempotency check — plan:** Read the relevant section of `<top>-plan.md` (identified by `plan-section`). If the section already reflects the new state described in `summary`, skip the plan edit step.
6. If plan section does not reflect new state: surgically edit `<top>-plan.md` to reflect the current reality. Touch only the section identified by `plan-section`. Do not restructure surrounding content.
7. **Idempotency check — handoff:** Read `<top>-handoff.md`. Check whether `Last Updated:` already contains today's date and the divergence is already reflected in "Last divergence." If already current, skip the handoff refresh.
8. If handoff is not current: update `<top>-handoff.md`:
   - Bump `Last Updated:` to today's date
   - Update "Last divergence:" line to today's date and a one-line summary
   - Update "Open gotchas" if the divergence introduces a new gotcha worth flagging
9. **Test-mechanics special case:** if `tag` includes `[test-mechanics]` and the change is permanent, also update the relevant testing artifact (`.claude/testing-plan.md`, `scripts/run-tests.sh`, or repo equivalent) as part of this same call.

---

### `spawn-subplan` — Initialize a sub-plan and update the active-plan marker

**Rationale:** When a parent task is large enough (L-sized) to warrant its own design + plan files, a sub-plan directory is scaffolded and the active-plan marker is advanced to the child. The top-level journal records the spawn event so the parent history is complete.

#### Workflow

1. Read `.claude/active-plan` to identify the current active plan path (this is the parent plan).
2. Walk up to resolve `<top>-journal.md` and `<top>-handoff.md`.
3. Derive the parent slug from the parent plan's directory name.
4. **Idempotency check — journal:** Read `<top>-journal.md`. If a `## YYYY-MM-DD — Spawned sub-plan <child-slug>` entry already exists, skip the journal append.
5. If no matching entry: append a dated spawn entry to `<top>-journal.md`:
   ```markdown
   ## YYYY-MM-DD — Spawned sub-plan <child-slug> [subplan-spawn]

   **Parent task:** <parent-task reference>
   **Motivation:** <why this task warrants its own sub-plan>
   **Expected scope:** <what the sub-plan will accomplish>
   **Sub-plan path:** plans/<parent-slug>/<child-slug>/<child-slug>-plan.md
   ```
6. **Idempotency check — directory:** Check whether `plans/<parent-slug>/<child-slug>/` already exists.
7. If the directory does not exist: scaffold `plans/<parent-slug>/<child-slug>/` with two skeleton files:
   - `<child-slug>-design.md` — empty skeleton with a header: `# <child-slug> — Design\n\n> Sub-plan of: plans/<parent-slug>/<parent-slug>-plan.md\n`
   - `<child-slug>-plan.md` — empty skeleton with a header: `# <child-slug> — Plan\n\n> Sub-plan of: plans/<parent-slug>/<parent-slug>-plan.md\n\n## Task Reference\n\n| # | Task | Size | Scope |\n|---|------|------|-------|\n`
8. **Idempotency check — handoff:** Read `<top>-handoff.md`. If `Active sub-plan: <child-slug>` is already present, skip the handoff update.
9. If not present: update `<top>-handoff.md` — add or replace the `Active sub-plan:` line with `Active sub-plan: <child-slug>`.
10. **Idempotency check — active-plan marker:** Read `.claude/active-plan`. If it already points at `plans/<parent-slug>/<child-slug>/<child-slug>-plan.md`, skip this step.
11. If not pointing at child: write `.claude/active-plan` with the child plan path: `plans/<parent-slug>/<child-slug>/<child-slug>-plan.md`
12. Report to the caller: child plan path created, active-plan marker updated, ready for `brainstorming` and `writing-plans` to run on the child.

---

### `close-subplan` — Roll up a completed sub-plan to the top-level

**Rationale:** This is the load-bearing forcing function for preventing knowledge loss when a sub-plan closes. Without structured closeout content, learnings are stranded in the sub-plan's plan file or transient session memory and never surface to the parent. This mode refuses to close without the required content.

#### Required Inputs (Mandatory — Refuses Without Them)

The caller must provide all three closeout fields before this mode proceeds:

| Field | Description |
|-------|-------------|
| `closeout-summary` | 1-paragraph summary of what the sub-plan accomplished |
| `closeout-decisions` | Key decisions made during sub-plan execution (rolls up D-style decisions to top history) |
| `closeout-gotchas` | Gotchas and lessons worth preserving (rolls up "what broke" content) |

If any of the three fields is missing or empty: **refuse to close.** Surface the missing fields to the caller and wait. Do not proceed.

#### Top-Level vs. Sub-Plan Detection

Before executing, determine whether the plan being closed is a sub-plan or the top-level plan using the **walk-up algorithm defined in the Active-Plan Marker section** above:

- If the walk-up finds a parent `*-plan.md`: this is a sub-plan. Execute the **sub-plan close path** below with that file as the parent.
- If the walk-up terminates without finding a parent `*-plan.md` (i.e., the closing plan IS the top-level): execute the **terminal-state path** below.

Use the canonical algorithm — do not duplicate or restate the walk-up logic here.

#### Sub-Plan Close Path

1. Read the child `<child-slug>-plan.md`. Scan the Task Reference table.
2. **Verify all tasks are ✅.** If any row is not checked, refuse to close. Surface the incomplete tasks to the caller and stop.
3. **Check required closeout content.** If `closeout-summary`, `closeout-decisions`, or `closeout-gotchas` are missing: refuse to close.
4. Identify the top-level plan (via walk-up algorithm). Resolve `<top>-journal.md`, `<top>-plan.md`, and `<top>-handoff.md`.
5. **Idempotency check — journal:** Read `<top>-journal.md`. If a closeout entry for `<child-slug>` already exists (header: `## YYYY-MM-DD — Closed sub-plan <child-slug>`), skip journal append.
6. If no matching entry: append a closeout journal entry to `<top>-journal.md`:
   ```markdown
   ## YYYY-MM-DD — Closed sub-plan <child-slug> [subplan-close]

   **Summary:** <closeout-summary>

   **Key decisions:**
   <closeout-decisions>

   **Gotchas and lessons:**
   <closeout-gotchas>

   **Full task detail:** plans/<parent-slug>/<child-slug>/<child-slug>-plan.md
   ```
7. **Idempotency check — parent task:** Read `<top>-plan.md`. Find the Task Reference row corresponding to this sub-plan. If it is already ✅, skip.
8. If not ✅: mark the corresponding parent task row ✅ in `<top>-plan.md`.
9. **Idempotency check — handoff:** Read `<top>-handoff.md`. If `Active sub-plan:` line is already removed and `Active task:` already reflects the next parent task, skip.
10. If not updated: refresh `<top>-handoff.md`:
    - Remove the `Active sub-plan: <child-slug>` line.
    - Advance `Active task:` to the next unchecked row in the parent Task Reference table.
    - Bump `Last Updated:` to today's date.
11. **Idempotency check — active-plan marker:** Read `.claude/active-plan`. If it already points at the parent plan, skip.
12. If not reverted: write `.claude/active-plan` with the parent plan path.

#### Terminal-State Path (Top-Level Plan Completion)

Triggered when `close-subplan` is invoked on the top-level plan (no parent `*-plan.md` found by walk-up):

1. Read `<top>-plan.md`. Verify all Task Reference rows are ✅. If any are incomplete, refuse and surface them.
2. **Check required closeout content** (`closeout-summary`, `closeout-decisions`, `closeout-gotchas`). Refuse if missing.
3. **Idempotency check — journal:** Read `<top>-journal.md`. If a final completion entry already exists (header: `## YYYY-MM-DD — Plan complete`), skip journal append.
4. If no completion entry: append a final journal entry to `<top>-journal.md`:
   ```markdown
   ## YYYY-MM-DD — Plan complete [subplan-close]

   **Summary:** <closeout-summary>

   **Key decisions:**
   <closeout-decisions>

   **Gotchas and lessons:**
   <closeout-gotchas>
   ```
5. **Idempotency check — handoff terminal state:** Read `<top>-handoff.md`. If `Status:` already reads "All tasks complete; awaiting closeout", skip.
6. If not terminal: update `<top>-handoff.md` — set status line to "All tasks complete; awaiting closeout" and bump `Last Updated:`.
7. **Idempotency check — active-plan marker:** Check whether `.claude/active-plan` still exists.
8. If it exists: **delete** `.claude/active-plan` (do not empty — delete the file). Subsequent SessionStart hooks see no active-plan and exit silently.
9. Report to the caller: plan tree is complete, active-plan marker cleared, `finishing-a-development-branch` flow should now be invoked.

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
| `close-subplan` missing closeout fields | Refuse. Surface missing fields. Wait for instruction. |
| `close-subplan` with incomplete child tasks | Refuse. Surface incomplete rows. Wait for instruction. |
| Journal entries for trivial changes | Do not write journal entries for routine task completion, typo fixes, formatting passes, or in-session experimentation that changed nothing. |

---

## Does NOT

- Decide what work to do next
- Create or transition Jira tickets — delegate to `jira-workflow-manager`
- Call `jira-workflow-manager` directly. (`reconcile` surfaces ticket keys to the caller; the caller is responsible for verifying status against Jira and reporting back. The skill itself never invokes Jira tools.)
- Perform git operations — delegate to `git-manager`
- Auto-resolve conflicts — surface them and wait for instruction
- Write journal entries for every task completion — Task Reference rows are the completion record

## Gotchas

1. When adding a new plan (`status: created`), classify it: is it a deeper dive into existing TODO scope, or net new? Annotate an existing item rather than creating a duplicate.
2. The section order in TODO.md is fixed: In Progress → Up Next → Backlog → History. Never reorder sections.
3. Do not move an item to History until all sub-tasks are checked — partial progress stays In Progress.
4. `reconcile` surfaces keys to the caller — it does not call Jira directly.
5. `divergence` must resolve the **top-level** journal/handoff even when a sub-plan is active — always walk up to the root of the plan tree before writing.
6. `close-subplan` is the only path to clearing `.claude/active-plan`. Do not clear it manually or as part of another mode.
7. All three new modes (`divergence`, `spawn-subplan`, `close-subplan`) are idempotent — re-running with the same arguments completes any remaining writes without duplicating already-written content.
8. The tag taxonomy is closed-set for journal entries. Do not invent new tags; use the authoritative list in the `divergence` mode's Authoritative Tag Taxonomy table.
