---
paths:
  - "plans/**/*.md"
  - "plans/**"
---

# Planning Protocol & Plan Doc Format

## Research-First Protocol

Complete all four phases in order. Do not draft until Phase 3 is resolved.

### Phase 1 — Orient

Read existing artifacts before touching the codebase:

1. If `CODEBASE.md` exists, read it first — it provides repo type, entry points, and key modules without reading source.
2. Read any related plan docs in `plans/` — resolved decisions and file paths do not need to be re-derived.

### Phase 2 — Research

Use the codebase graph for structural facts; reserve source reads for implementation logic.

| Question type | Tool |
|---|---|
| "Does X already exist? Where?" | `search_graph` |
| "What breaks if I change this?" | `query_graph` (CALLS) |
| "What env vars does this consume?" | Read `.claude-init/enrichments.json` |
| Live infrastructure value (ARN, SSM param, table name) | `researcher` agent |
| Cross-repo integration question | `integration-engineer` agent |

Dispatch multiple `researcher` instances in parallel when questions are independent — parallelism is the point. Read source code only when you need implementation logic, not just symbol location.

### Phase 3 — Ask

Batch all remaining unknowns into ONE message to the user. Never trickle questions one at a time.

- Each question must cite a real file, function, or system — not a vague concern.
- Do not ask for anything Claude can find itself via the graph or researcher.

### Phase 4 — Draft

Every implementation step must be a concrete action against a real file or function — no placeholders. If any step cannot be written concretely, return to Phase 2 or surface the gap in Phase 3.

---

## Plan Doc Requirements

### Sizing — When a Plan Doc Is Required

| Size | Scope | Plan doc? |
|---|---|---|
| S | 1–3 files, targeted change, ~1–5k tokens | No — plan mode scratch pad only |
| M | Several files, some cross-cutting, ~5–15k tokens | No — plan mode scratch pad only |
| L | Many files, multi-session work, ~15k+ tokens | **Yes — create before ExitPlanMode** |

When in doubt, size up.

### Location

| Plan type | Location |
|---|---|
| Design doc (from brainstorming) | `plans/<slug>/<slug>-design.md` |
| L — implementation plan | `plans/<slug>/<slug>-plan.md` |
| L — append-only history | `plans/<slug>/<slug>-journal.md` |
| L — live session entry-point | `plans/<slug>/<slug>-handoff.md` |
| S/M — session scratch | `~/.claude/plans/` only (session-scoped, not durable) |
| Sub-plan (significant, standalone) | `plans/<parent-slug>/<child-slug>/<child-slug>-plan.md` (design + plan only — no journal or handoff; all journal/handoff content rolls up to the top-level files) |
| Sub-plan (small addition to existing plan) | Appended section in the parent plan doc |

All four top-level artifacts (design, plan, journal, handoff) live under `plans/<slug>/`. `~/.claude/plans/` files are ephemeral scratch pads — never the durable record. Only `plans/<slug>/` files survive session boundaries.

**`plans/` is gitignored.** Plan docs are session-scoped working artifacts — useful during a
session, not committed deliverables. For committed reference documentation (workflow map, API
docs, architecture guides), use `docs/`.

### Required Sections (L-sized plan docs)

The plan doc is the **north star** for the work. The journal (`<slug>-journal.md`) and handoff (`<slug>-handoff.md`) are paired artifacts that the plan references — they are not sections inside the plan. Do not put journal entries or current-session state inside the plan doc.

Every L-sized plan doc MUST contain:

**Header block** — Parent Plan, Status, Priority, Repo, Jira Project.

**Context** — Why this change is being made now. Links to tickets, prior sessions, or dependencies that motivated the work.

**Architecture Blueprint** — Factual, graph-derived record of what exists and what changes:
- File paths and line numbers for all affected symbols
- Function/method signatures (before and after if signatures change)
- Env vars consumed and where defined
- External resources with actual names (DynamoDB tables, SQS queues, SES templates, EventBridge rules)
- Entry points and triggers involved

**Task Reference table** — **Authoritative durable progress record.** Columns: #, Task, Size, Complexity, Scope, Jira Key. Complexity (S/M/L) drives tier-aware dispatch — see `subagent-driven-development` Model Selection. Size is independent of complexity (a small but architecturally complex task may be `Size: S, Complexity: L`). Jira Key column is intentionally blank during planning — keys are assigned at execution start. Rows marked ✅ as tasks complete. The mechanism that keeps this table current is `plan-management:divergence` — do not rely on "remember to update it."

**Testing** — appended by `test-strategy` agent **after** architect review. This section does not exist at architect review time. This is correct — do not flag its absence during architect review.

**Open Questions** — unresolved decisions with date raised. Resolved questions struck through and answered inline.

Every file path, function name, env var, ARN, and resource name must come from a real lookup. If a value is uncertain, it is an Open Question — not a placeholder.

### Self-Containment Test

A plan is ready when a model with an empty context window could receive it with "execute this plan" and succeed without additional research. If that is not true, the plan is not done.

### Plan Doc Refinements

Editing or refining an existing plan doc before execution begins is S-sized: no architect review, no new TODO.md entry, no new Jira ticket required.

During execution, divergences (architecture changes, scope shifts, discovered bugs, test-mechanics changes) are not "plan doc refinements" — they are handled by `plan-management:divergence`, which atomically writes a journal entry, edits the relevant plan section, and refreshes the handoff. Do not treat mid-execution updates as a separate S-sized editing task.

---

## Architect Gate

Invoke the `architect` agent in `plan` mode before ExitPlanMode. The gate sequence is:

```
draft plan → architect → test-strategy → ExitPlanMode
```

Architect runs first — it reviews the plan for design soundness and self-containment. Test-strategy runs after architect approval — it appends the Testing section.

```
Agent { subagent_type: "architect", prompt: "plan\n\nPlan doc: plans/<slug>/<slug>-plan.md" }
```

**Iteration rules (max 3 rounds):**

| BLOCKING item type | Handling |
|---|---|
| User-judgment question (not researchable) | Surface to the user verbatim. Do not resolve with assumptions. Update plan after user responds. Re-invoke architect. |
| Design flaw resolvable from available context | Resolve from context. Update plan. Re-invoke architect. |

Each re-invocation is a fresh pass — no memory of prior rounds. If BLOCKING issues remain after 3 rounds, surface them to the user; do not attempt a fourth round. ExitPlanMode only after APPROVED verdict.

---

## Test-Strategy Gate

After the architect returns APPROVED, invoke the `test-strategy` agent:

```
Agent { subagent_type: "test-strategy", prompt: "Review this plan and produce a Testing section. Plan doc: plans/<slug>/<slug>-plan.md" }
```

The agent appends a `## Testing` section to the plan doc. "Existing tests cover this — no new tests required" is a valid and complete output. MUST NOT begin implementation without validation criteria present in the plan doc.

---

## After Completing a Plan

When all Task Reference rows are ✅ and all Jira tickets are Done:

1. Add a Completion block to the plan doc (date + 1–2 sentence summary of what was built and deviations from the original design).
2. Invoke `plan-management` skill:
   ```
   Skill { skill: "plan-management", args: "path: plans/<slug>/<slug>-plan.md jira-key: CLAUDE-N status: completed summary: '<1–2 sentences>'" }
   ```
3. `TodoWrite` is session-scoped and resets between conversations — it is NOT a substitute for plan doc updates. Both must be maintained independently: `TodoWrite` tracks in-session task state; the plan doc is the durable record.
