# Stack Hats — Per-Stack Best-Practice Layer

A **stack hat** is specialist best-practice + tooling guidance for a technology (Python, React, C/C++, …), layered on top of SE-fundamentals — never replacing them. Hats compose: a Python+React repo wears both.

## Source of truth

- A repo opts in via `project.json`: `"stacks": ["python", "react"]`. The `stacks` array may be hand-edited, or auto-populated by the `project-setup` skill's **Phase 3.5 — Stack Setup**, which detects the repo's stack(s) and proposes the array (propose-then-confirm; never silently written).
- Each stack's guidance is the `## Hat` section of `~/.claude/stacks/<stack>.md`.
- The architect agent's "active domain hat" (`agents/architect.md`) IS a stack hat — same concept, one mechanism.

## Resolving the active hats (deterministic)

1. Read `project.json` `stacks` at the repo root.
2. For each name, read `~/.claude/stacks/<name>.md` and take its `## Hat` section.

Resolve directly. Do NOT rely on the SessionStart injection having reached you — subagents (architect, implementer, reviewer) get their own context and MUST resolve hats themselves.

## When to leverage

| Moment | Obligation |
|--------|-----------|
| Session start | `sessionStart/stack-hat-directive.mjs` injects active hats as ambient reminders (main session). |
| Generating code | `executing-plans` and `subagent-driven-development` resolve active hats and make generated code follow them. |
| Reviewing a plan or implementation | The `architect` agent resolves active hats and flags any best-practice violation. |

No `stacks` field, or no catalog entry for a declared stack → no hat applies; proceed on SE-fundamentals alone.
