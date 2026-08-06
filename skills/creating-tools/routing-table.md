# Routing Table — Artifact Types to Skills

Reference table for `creating-tools` orchestration. Each row defines the complete routing for one artifact type.

| Artifact type | Process skill | Structure skill | Eval / Test mechanism | Notes |
|---|---|---|---|---|
| skill | `writing-skills` | `creating-tools/frontmatter-reference.md` + bundled `anthropic-best-practices.md` | Pulser CLI: static lint + eval.yaml + conflict detection | Full TDD cycle (RED-GREEN-REFACTOR) then Phase 3 Pulser eval |
| agent | `writing-agents` | `creating-tools/frontmatter-reference.md` (owned locally) | Subagent pressure scenarios via `testing-agents-with-subagents.md` | Baseline dispatch required before system prompt |
| rule | `writing-rules` | (no structural delegate — rules have minimal structure) | Observational (live sessions, 2–3 runs) | No eval loop; ship when unambiguous |
| hook | `test-driven-development` | `creating-tools/hooks-reference.md` (owned locally) | Sibling `.test.mjs` under `npm test` | Hooks are scripts with a stdin/stdout contract — the one component type here with real unit tests |
| command | `writing-skills` | `creating-tools/frontmatter-reference.md` (owned locally) | Pulser CLI, as for any skill | A command **is** a skill upstream; author with `disable-model-invocation: true` |
| full plugin | — | — | — | Not authored in this repo — it consumes plugins. See `plugins/registry.md`. |

## Plugin State Reference

No route in this table delegates to a plugin. Every structural reference is owned locally.

| Plugin | State | Invocation |
|---|---|---|
| `plugin-dev` | **Removed** (2026-08-06) | Nothing routes to it. Do not reinstate — see below. |
| `skill-creator` | **Removed** (2026-08-06) | Nothing routes to it. |

See `plugins/registry.md` for full plugin lifecycle details, and
`docs/reference/skill-surface-policy.json` for the check that fails if either returns.

## Routing Boundaries

**No route may point at a plugin.** Both plugins this table once delegated to are uninstalled. A
route naming an absent target does not error — it dispatches confidently to nothing, which is
strictly worse than having no route. If a future plugin looks like a routing target, add the
local reference first and the route second.

**`writing-skills` is the full-cycle entry point for skills *and* commands.** It includes the
Pulser eval phase (Phase 3). Structural conventions are owned locally in
`creating-tools/frontmatter-reference.md`.

**`writing-skills` is the full-cycle entry point for skills.** It includes the Pulser eval phase (Phase 3). Do not route to `plugin-dev:skill-development` — `rules/plugin-lifecycle.md` forbids invoking it, and `writing-skills` does not depend on it. Structural conventions are owned locally in `creating-tools/frontmatter-reference.md`.

**`writing-agents` is the full-cycle entry point for agents.** Structural guidance is owned locally in `creating-tools/frontmatter-reference.md`, never delegated. The reference covers agents and skills side by side, because the differences between the two surfaces are what authors get wrong.

**Hooks are authored, not delegated.** `creating-tools/hooks-reference.md` owns the event taxonomy, the exit-code and deny contract, the settings.json wiring shape, and this repo's house pattern. It was written from the official hooks documentation and the repo's own nine working hooks — deliberately not from a plugin snapshot, which is how the previous delegation came to assert a settings format that does not work.
