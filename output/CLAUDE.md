# Global Claude Workflow

## Delegation — Mandatory

Route every operation through the correct abstraction. Never run git commands directly. Never call Jira MCP tools directly.

| Operation | Tool |
|-----------|------|
| Git commit, branch, push, PR, tag | `git-manager` skill (`Skill` tool) |
| Jira ticket creation, status transitions, updates | `jira-workflow-manager` agent (`Agent` tool) |
| Plan doc registration, TODO.md updates, archival | `plan-management` skill (`Skill` tool) |
| Independent plan/code review | `architect` agent (`Task` tool, `subagent_type: architect`) |

---

## Architect Review — Mandatory

Invoke the `architect` agent before any of these transitions:

| Trigger | Mode |
|---------|------|
| Transitioning a task to Testing or Done | `evaluate_task` |
| Before execution begins (via plan-gate after writing-plans, or manually before `ExitPlanMode` for S-sized ad-hoc work) | `plan` |
| Diagnosing a bug or unexpected behavior | `debug` |

**Skip for:** S-sized mechanical tasks (renaming, config-only, single-line fixes), status-only transitions (Testing → Done after user confirms).

Maximum 3 review iterations. If BLOCKING issues remain after the third pass, surface them to the user — do not attempt a fourth round.

---

## Task Sizing

| Size | Token Estimate | Scope | Ticket |
|------|---------------|-------|--------|
| S | ~1–5k | 1–3 files, targeted change | Single Task |
| M | ~5–15k | Several files, cross-cutting concern | Single Task |
| L | ~15k+ | Many files, multi-session, significant refactor | Task + sub-tasks (or single Task if atomic) |

When in doubt, size up. Token estimates are rough — use them to calibrate, not count.

---

## Workflow Sequence

1. **Assess** — size the work. L-sized or scope unclear → `EnterPlanMode`.
2. **Plan** — read existing plan doc in `plans/` if one exists, or create `plans/<slug>/PLAN.md`. Follow planning rules (loads automatically when reading plan docs). Invoke `architect` before `ExitPlanMode`.
3. **Tickets** — create via `jira-workflow-manager` from the plan doc. Write Jira keys back into the Task Reference table. Register the plan in TODO.md via `plan-management` skill (pointer entry: plan doc path + Epic key).
4. **Execute** — one task at a time. Transition to In Progress via `jira-workflow-manager` before starting.
5. **Commit** — via `git-manager` skill. Every commit includes the Jira key.
6. **Close** — transition to Done (or Testing if human verification needed) via `jira-workflow-manager`. Mark the Task Reference row ✅ in the plan doc. Invoke `plan-management` skill with status and 1–2 sentence summary.

---

## Source of Truth

The plan doc (`plans/<slug>/PLAN.md`) is the single source of truth for what will be built and what was built.

- **Jira** is seeded from the plan doc at ticket-creation time. Deviations go in Jira comments — never rewrite descriptions to match what was done instead of what was planned.
- **TODO.md** is a pointer registry: one entry per active plan containing the plan doc path and Epic key. It does not duplicate task rows or status details.

---

## Core Rules

- One task in progress at a time. Complete and commit before starting the next.
- Scan before writing. Ticket descriptions must reference real file and method names — not guesses.
- Rich ticket descriptions: a person reading them 3 months later should understand what changed and why.
- If a task turns out significantly larger or smaller than estimated, note it and adjust sub-tasks accordingly.
- Jira reflects reality. It does not control it. Never let ticket state block execution.
