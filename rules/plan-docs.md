# Plan Docs — Structure, Lifecycle, and Loading Model

## Four-File Plan Tree (new plans)

Every top-level plan consists of exactly four files under `plans/<slug>/`:

| File | Role | Mutability |
|------|------|------------|
| `<slug>-design.md` | Pre-execution rationale; output of `brainstorming` | Frozen after `writing-plans` runs. Load only on "why did we choose this" questions. |
| `<slug>-plan.md` | North star: goal, architecture, Task Reference table, per-task detail | Surgically mutable. Task Reference is the durable progress record. |
| `<slug>-journal.md` | Append-only history: divergences, decisions, debugging cascades, sub-plan events | Append-only. Never edit prior entries. Supersede with a new dated entry if needed. |
| `<slug>-handoff.md` | Live entry-point: current state, active task, open gotchas, pointers to plan/journal | Continuously refreshed (overwritten in place). Single live file — never date-stamped. |

This applies to **new plans only.** Existing in-flight plans continue under their current conventions until they close out naturally. No migration.

---

## Sub-Plans

Sub-plans follow the two-form distinction from `rules/planning.md`:

### Form A — Significant standalone (L-sized): separate sub-directory

`plans/<parent>/<child>/` with only:
- `<child>-design.md`
- `<child>-plan.md`

Never a journal or handoff — all journal-worthy and handoff-worthy content rolls up to the **top-level** journal/handoff. This rule applies at arbitrary depth: sub-sub-plans also get only design + plan.

Form A sub-plans pass through `plan-gate` in **sub-plan mode**: architect + adherence-audit run as normal, but test-strategy, test-builder, Jira ticket creation, and TODO.md registration are skipped (the parent plan owns those). For trivial refinements, invoke plan-gate with `mode: minimal` to skip adherence-audit as well — architect-only. See `skills/plan-gate/SKILL.md` § Sub-Plan Mode.

### Plan-type frontmatter

Plans declare their type via frontmatter at the top of `<slug>-plan.md`:

```yaml
---
plan-type: standard
---
```

| Value | Plan-gate effect |
|-------|------------------|
| `standard` (default) | Full sequence runs |
| `test-suite-addition` (alias `tests-only`) | Step 3 (test-builder) skips — the plan's deliverable IS the test suite, so writing failing tests against it is circular. All other steps run. Skip recorded with `[test-only-plan]` journal tag. |

The declaration belongs to the plan author — path-heuristic detection was rejected because ecosystem-specific test conventions (Go's sibling `*_test.go`, Rust's mixed `tests/`/`#[cfg(test)]`, mixed-scope plans) make it unreliable. See `skills/writing-plans/SKILL.md` § Plan Frontmatter.

### Form B — Small addition: appended section in parent plan

Append new rows to the parent's Task Reference table. No new files. `plan-management:spawn-subplan` is not invoked. The parent journal and handoff continue to serve.

Sizing rule: Form A when the sub-plan is itself L-sized; Form B otherwise. See `rules/planning.md` for the L-sizing heuristic.

---

## Active Plan Marker

`.claude/active-plan` holds the relative path (from repo root) to the currently active `<slug>-plan.md`.

- Single source of truth for "what am I working on right now."
- Updated by `plan-management:spawn-subplan` (set to child), `plan-management:close-subplan` (reverted to parent / cleared at tree completion), and `plan-management:repoint` (switched to a different active plan during a context switch — moves the marker, never clears it). `repoint` does not contradict the "close-subplan is the only path to clear the marker" invariant: it relocates the pointer, it does not clear it.
- Set on plan creation; cleared on plan tree completion.
- All triggers and hooks consult this file — never guess from heuristics.

---

## Loading Model

SessionStart loads **one file** by default: the top-level `<slug>-handoff.md` for the active plan tree (resolved by walking up from `.claude/active-plan`).

All other artifacts are loaded on demand via pointers in the handoff:

| Pointer type | Load action |
|---|---|
| "Active task: 13 — see plan §line N" | Read only that line range of `plan.md` |
| "Last divergence: see journal YYYY-MM-DD" | Read only that journal entry |
| "Why this approach: see design §N" | Load design only when a why-question arises |

Never preload `plan.md`, `journal.md`, or `design.md` at session start.

---

## Lifecycle

### Plan creation

1. `brainstorming` produces `<slug>-design.md`.
2. `writing-plans` produces `<slug>-plan.md` and scaffolds empty `<slug>-journal.md` and `<slug>-handoff.md` with initial entries.
3. `.claude/active-plan` set to point at the new plan.

### Active execution

| Event | Required action |
|-------|----------------|
| Task completes | Mark Task Reference row ✅; refresh handoff status table |
| Plan deviation (architecture, file path, signature, scope) | Invoke `plan-management:divergence` — atomic three-write: journal append + plan section edit + handoff refresh |
| `systematic-debugging` Phase 4 exit | Mandatory `plan-management:divergence` to record root cause and fix |
| Discovered bug or test debt | Tagged journal entry via `plan-management:divergence` (tags: `[bug]`, `[test-debt]`) |
| Test-running mechanics change | Journal entry tagged `[test-mechanics]`; if permanent, update the relevant testing artifact (`.claude/testing-plan.md`, `scripts/run-tests.sh`, or repo equivalent) in the same divergence call |

`plan-management:divergence` always writes to the **top-level** journal/handoff regardless of which sub-plan is currently active.

### What to journal

The journal is informative, not all-inclusive. Write entries when a future session would need to know something not obvious from the plan or git history.

**Journal-worthy:** plan deviations, root causes from debugging, test-mechanics changes, mid-execution decisions that override plan-time decisions, sub-plan spawn/close events, environment-specific workarounds.

**Skip:** routine task completion, trivial formatting passes, in-session experimentation that changed nothing, content already captured in commit messages.

When in doubt, journal it — a short extra entry costs less than a lost learning.

### Sub-plan spawn

Invoke `plan-management:spawn-subplan`. The skill:
1. Appends a dated spawn entry to the top-level journal.
2. Scaffolds `plans/<parent>/<child>/` with empty design and plan files.
3. Updates top-level handoff: `Active sub-plan: <child-slug>`.
4. Updates `.claude/active-plan` to the child plan path.

### Sub-plan close (the rollup)

When all tasks in `<child>-plan.md` are ✅, invoke `plan-management:close-subplan`. The skill requires structured closeout content before proceeding (refuses otherwise):
- 1-paragraph summary of what the sub-plan accomplished
- Key decisions made during execution
- Gotchas and lessons worth preserving

The skill then: appends a closeout journal entry to the top-level journal, marks the corresponding parent task ✅, refreshes the top-level handoff, and reverts `.claude/active-plan` to the parent plan path.

This structured closeout requirement is the forcing function that prevents sub-plan learnings from being stranded.

### Plan tree completion

When all tasks in `<top>-plan.md` are ✅:

1. Invoke `plan-management:close-subplan` with `closeout-summary`, `closeout-decisions`, and `closeout-gotchas`. The skill writes the final journal entry, refreshes the handoff to terminal status, and clears `.claude/active-plan` atomically.
2. Run the `finishing-a-development-branch` flow.

Do not clear `.claude/active-plan` manually — `plan-management:close-subplan` is the only sanctioned path.

---

## Eliminated Per-Plan Artifacts

Do not create these for new plans:

| Eliminated | Replacement |
|------------|-------------|
| `discovered-bugs.md` (per-plan) | Journal entries tagged `[bug]` |
| `test-debt.md` (per-plan) | Journal entries tagged `[test-debt]` |
| `integration-test-constraints.md` (per-plan) | Journal entries tagged `[constraint]` |
| Multiple dated `<slug>-handoff-YYYY-MM-DD.md` files | Single live `<slug>-handoff.md` + dated journal entries |

**Repo-level files are unchanged:** `.claude/testing-plan.md` and `.claude/integration-test-constraints.md` serve repo scope and continue per `rules/integration-test-constraints.md`.

---

## Sizing — When a Plan Doc Is Required

See `rules/planning.md` for the full sizing table. Summary:

| Size | Plan doc? |
|------|-----------|
| S — 1–3 files, targeted change | No |
| M — several files, some cross-cutting | No |
| L — many files, multi-session, significant work | **Yes — all four files** |

---

## Plan Doc Refinements

Editing or refining an existing plan doc is S-sized. No architect review, no new TODO.md entry required.

---

## After Completing a Plan

Invoke `plan-management` with: plan doc path, status `completed`, and a 1–2 sentence summary. See `rules/workflow-phases.md` for the full post-completion sync steps.
