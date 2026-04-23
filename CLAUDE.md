# Global Claude Workflow

## Delegation — Mandatory

Route every operation through the correct abstraction. Never run git commands directly. Never call Jira MCP tools directly.

| Operation | Tool |
|-----------|------|
| Git commit, branch, push, PR, tag | `git-manager` skill (`Skill` tool) |
| Jira ticket creation, status transitions, updates | `jira-workflow-manager` agent (`Agent` tool) |
| Plan doc registration, TODO.md updates, archival | `plan-management` skill (`Skill` tool) |
| Independent plan/code review | `architect` agent (`Agent` tool, `subagent_type: architect`) |

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

1. **Assess** — size the work. L-sized or scope unclear → continue to Design.
2. **Design** — invoke the `brainstorming` skill. It asks clarifying questions, proposes approaches, and produces a design doc at `plans/<slug>/<slug>-design.md`. Commit the design doc. Skip for S-sized work where the approach is already clear.
3. **Plan** — `brainstorming` hands off to `writing-plans`. Read the design doc and any existing plan doc in `plans/`; produce `plans/<slug>/<slug>-plan.md`. `writing-plans` fires `plan-gate` automatically — plan-gate handles architect review (Case A). For ad-hoc plan mode without `writing-plans`, invoke architect manually before `ExitPlanMode` (Case B).
4. **Tickets** — create via `jira-workflow-manager` from the plan doc. Write Jira keys back into the Task Reference table. Register the plan in TODO.md via `plan-management` skill (pointer entry: plan doc path + Epic key).
5. **Execute** — one task at a time. Transition to In Progress via `jira-workflow-manager` before starting.
6. **Commit** — via `git-manager` skill. Every commit includes the Jira key.
7. **Close** — transition to Done (or Testing if human verification needed) via `jira-workflow-manager`. Mark the Task Reference row ✅ in the plan doc. Invoke `plan-management` skill with status and 1–2 sentence summary.

---

## Source of Truth

The implementation plan doc (`plans/<slug>/<slug>-plan.md`) is the single source of truth for what will be built and what was built. The paired design doc (`plans/<slug>/<slug>-design.md`) is the upstream artifact — it captures approach decisions and is produced by the `brainstorming` skill before the implementation plan is written.

- **Jira** is seeded from the plan doc at ticket-creation time. Deviations go in Jira comments — never rewrite descriptions to match what was done instead of what was planned.
- **TODO.md** is a pointer registry: one entry per active plan containing the plan doc path and Epic key. It does not duplicate task rows or status details.

---

## Core Rules

- One task in progress at a time. Complete and commit before starting the next.
- Scan before writing. Ticket descriptions must reference real file and method names — not guesses.
- Rich ticket descriptions: a person reading them 3 months later should understand what changed and why.
- If a task turns out significantly larger or smaller than estimated, note it and adjust sub-tasks accordingly.
- Jira reflects reality. It does not control it. Never let ticket state block execution.
- When test-runner returns a FAILURE result, invoke `systematic-debugging` before any fix
  attempt. Do not propose fixes until `systematic-debugging` has completed Phase 1 (root
  cause investigation).

---

## Repository Structure

```
claude-workflow-improvements/
├── CLAUDE.md                   — this file (global instructions, symlinked to ~/.claude/CLAUDE.md)
├── README.md                   — repo overview and restoration guide
├── agents/                     — agent definition files → symlinked to ~/.claude/agents/
├── skills/                     — skill directories → each symlinked to ~/.claude/skills/<name>/
├── rules/                      — rule .md files + filesystem/ subdir → symlinked to ~/.claude/rules/
│   └── filesystem/             — subdirectory, symlinked as a unit
├── hooks/
│   └── pre-commit              — global pre-commit hook → symlinked to ~/.claude/hooks/pre-commit
├── templates/                  — project templates (not symlinked; copied on use)
├── docs/                       — public-facing documentation
│   └── superpowers/specs/      — archived design specs (old location; new: plans/<slug>/<slug>-design.md)
└── scripts/
    └── setup.sh                — idempotent installer
```

---

## Working in This Repo

- Read `docs/overview.md` when starting a new session — it contains the system overview and integration picture.
- Workflow components live at the repo root, mirroring `~/.claude/` directly. Edit in place; symlinks keep `~/.claude/` in sync automatically.
- After adding or modifying a component, run `setup.sh --force` to recreate symlinks if needed.
