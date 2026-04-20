# Plugin Registry

This file is the ground truth for integration state, domain ownership, and pinned version for installed plugins.

It coexists with `~/.claude/plugins/installed_plugins.json`, which is managed by the Claude Code plugin system and is the ground truth for what is physically installed. `registry.md` is the ground truth for how each plugin integrates with the orchestration layer.

---

## skill-creator

- **Source:** https://github.com/claude-ai/skill-creator (claude-plugins-official)
- **State:** Active
- **Pinned version:** unknown (installed 2026-04-20; no git SHA recorded by plugin system)
- **Skills provided:** `skill-creator:skill-creator`
- **Domain ownership:** CSO benchmarking and A/B description comparison — not part of orchestration layer
- **Last audited:** 2026-04-20
- **Notes:**
  - Eval infrastructure (Python scripts, browser viewer, `ANTHROPIC_API_KEY`) is not used in this workflow. The concepts it introduced — trigger accuracy testing, grading, A/B comparison — are adapted locally via `eval-methodology.md` in `writing-skills`.
  - May be invoked directly for experimentation and CSO benchmarking.
  - Not integrated into `creating-tools` orchestration. Do not route through it.
  - Windows patches applied at install time.

---

## plugin-dev

- **Source:** https://github.com/claude-ai/plugin-dev (claude-plugins-official)
- **State:** Integrated
- **Pinned version:** unknown (installed 2026-04-20; no git SHA recorded by plugin system)
- **Skills provided:** `plugin-dev:hook-development`, `plugin-dev:mcp-integration`, `plugin-dev:plugin-structure`, `plugin-dev:plugin-settings`, `plugin-dev:command-development`, `plugin-dev:agent-development`, `plugin-dev:skill-development`, `plugin-dev:create-plugin`
- **Domain ownership:** Structural guidance for all component types (file structure, frontmatter fields, section conventions). Process guidance for hooks and commands.
- **Last audited:** 2026-04-20
- **Notes:**
  - 7 skills delegated to via `creating-tools`: hook-development, mcp-integration, plugin-structure, plugin-settings, command-development, agent-development, skill-development.
  - `plugin-dev:create-plugin` (8-phase guided workflow) is also a delegation target.
  - Never invoke plugin-dev skills directly — always route through `creating-tools`.
  - Windows patches applied at install time.

---

## Lifecycle State Machine

```
Active      — installed, using directly, no local orchestration layer
Integrated  — installed, delegated to via creating-tools, not invoked directly
Deprecated  — orchestration removed, plugin still installed, pending cleanup
Removed     — uninstalled, registry entry archived
```

## Upstream Drift Protocol

When an Integrated plugin releases a new version, diff its SKILL.md files against the pinned version in the registry. If the diff touches any of the following, update the orchestration layer before upgrading:
- Trigger descriptions (CSO)
- Eval script APIs
- Agent frontmatter fields

After confirming compatibility: update the **Pinned version** and **Last audited** date.

## Pre-Install Checklist (for future plugins)

Before installing any new plugin:

1. List its skill names and trigger descriptions.
2. Compare against existing skills in `~/.claude/skills/` for name and trigger overlap.
3. If overlap found: define domain boundary before installing.
4. Add to `registry.md` with state `Active` before first use.

## When to Promote Integrated → Removed

1. All its capabilities are now covered by local skills (full supersession)
2. Upstream abandoned (no commits in 12 months, open issues unaddressed)
3. Irresolvable conflict (governance rule not sufficient to suppress direct invocation)

Document the reason in the registry entry before transitioning to Removed.
