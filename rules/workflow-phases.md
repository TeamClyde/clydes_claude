# Workflow Phases — Jira + Git

This workflow applies to all repositories. Project-specific settings override global defaults.

---

## Phase 1 — Planning & Ticket Creation

**Invoke the `jira-workflow-manager` agent to create tickets. Do not call Jira MCP tools directly.**

### Two paths to ticket creation

**Path A — No local plan doc exists**

Before writing any code:

1. **Scan the codebase yourself** to identify relevant files, methods, and structure. All ticket descriptions must reference real file and method names — not guesses.
2. **Invoke the `jira-workflow-manager` agent** (`Agent` tool, `subagent_type: jira-workflow-manager`) to create the Epic and Tasks. Pass:
   - The overall goal (2–3 sentences of context)
   - The full task list with scoping: files to create/modify, methods affected, mappings, implementation notes
3. The agent applies correct ticket format, sizing, and links Tasks to the Epic automatically.

**Path B — A local plan doc exists (preferred for L-sized work)**

A completed local plan doc (`plans/CLAUDE-N-description.md`) is the canonical kickoff artifact for L-sized work. It replaces codebase scanning entirely — the plan doc must already contain all file paths, function names, data structures, and implementation details needed. Do not scan the codebase when a plan doc covers the work.

A plan doc is complete when it has: context, an architecture blueprint, an Epic/Task Reference section, and a task checklist.

When a user presents a completed plan doc with intent to proceed:

1. **Read the plan doc.** It is the sole source of implementation truth. Do not Grep or Glob for information it should already contain.
2. Check the **Epic / Task Reference** section. Create tickets via `jira-workflow-manager` and update the table rows with the assigned keys. (If keys are already listed from a prior session, verify they exist.) Then invoke `plan-management` skill with: plan doc path, Epic key, `status: created` — this syncs the plan doc's ticket table into TODO.md for the first time.
3. Begin execution. Follow Phase 2 for all status transitions.

The plan doc is the handoff artifact. Receiving it does not bypass ticket creation or status transitions.

**When to skip the Epic:** A one-off bug fix, single config change, or work that maps to a single Task with no follow-on work does not need an Epic.

---

## Phase 2 — Execution & Status Transitions

**All status transitions must be handled via the `jira-workflow-manager` agent. Do not call `transitionJiraIssue` directly.**

| Trigger | Action |
| ------- | ------ |
| Starting a task | Agent: transition ticket to **In Progress** |
| Code complete, needs user verification | Agent: transition to **Testing**. Stop and wait for sign-off. |
| Mechanical/structural task committed | Agent: transition directly to **Done** |
| User confirms Testing | Agent: transition **Testing → Done** |

Stop and wait for user confirmation before transitioning out of Testing. Do not move a ticket to Done based on your own judgment.

### Three-source task sync

Jira tickets, the plan doc Epic / Task Reference table, and TODO.md represent the same work at
different levels of granularity. They must stay in sync:

| Event | Action |
| ----- | ------ |
| Jira ticket transitions to Done | Prepend `✅` to the corresponding row in the plan doc's Epic/Task Reference table |
| Jira ticket transitions to Done | Invoke `plan-management` skill with: ticket key, plan doc path, `status: completed`, 1-2 sentence summary. The skill determines if the linked TODO.md item is fully done or partially done and marks it accordingly. |
| One TODO.md item maps to multiple Jira tickets | Invoke `plan-management` after every Done transition; it accumulates progress across partial completions. |

A Jira ticket being Done means the plan doc row is done. They are equivalent records of the same
work, not separate tracking systems.

---

## Phase 3 — Commits

**All git operations must be handled via the `git-manager` skill. Never run git commands ad-hoc.**

| Trigger | Action |
| ------- | ------ |
| New Epic created | Skill: create and push the feature branch. Pass Epic key + short slug. |
| Task code complete | Skill: commit and push. Pass issue key, commit type, description, files to stage. |
| Epic complete | Skill: open PR. Pass Epic key and target branch. |

After a task commit is confirmed:

1. Invoke `jira-workflow-manager` to transition the ticket to Done (or Testing if AWS verification required).
2. After the ticket transitions to Done, invoke `plan-management` skill with: ticket key, plan doc path, `status: completed`, 1-2 sentence summary.

Commit format: `type: description [PROJ-N]`

Example:
```
Skill { skill: "git-manager", args: "commit files: [src/foo.py] type: feat description: 'add handler' jira-key: CLAUDE-12" }
```
