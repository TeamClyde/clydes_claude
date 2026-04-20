# Plugin Lifecycle — Conflict Suppression and Routing

## Routing Rule

When a plugin is **Integrated**, always route through `creating-tools`. Do not invoke Integrated plugin skills directly.

**Currently Integrated: `plugin-dev`**

Do not invoke these directly:
- `plugin-dev:skill-development`
- `plugin-dev:agent-development`
- `plugin-dev:hook-development`
- `plugin-dev:command-development`
- `plugin-dev:mcp-integration`
- `plugin-dev:plugin-structure`
- `plugin-dev:plugin-settings`
- `plugin-dev:create-plugin`

**Currently Active (invoke directly if needed): `skill-creator`**

`skill-creator:skill-creator` may be used directly for CSO benchmarking and experimentation. It is not part of the orchestration layer.

## Conflict Suppression — Mechanism and Limits

Rule files load into the system prompt with higher priority than skill triggers (per the priority hierarchy in `using-superpowers`: user instructions > rules > skills). This rule overrides skill trigger matching — it is the correct suppression mechanism for Integrated plugins, not merely advisory.

This is **soft enforcement**: it relies on Claude reading and following the rule, not a technical block.

If direct invocation of an Integrated plugin skill persists despite this rule, the next escalation is narrowing the plugin skills' trigger descriptions — which requires forking. Log that as a flag in `plugins/registry.md` before forking.

## creating-tools + plugin-lifecycle Interaction

`creating-tools` uses a broad trigger by design — it must capture any component creation intent before plugin skills do. This rule suppresses the plugin skills once `creating-tools` fires. Both must be present in `~/.claude/rules/` for conflict suppression to be active.

Verify both are symlinked before treating this system as operational:
```
ls ~/.claude/rules/plugin-lifecycle.md
ls ~/.claude/skills/creating-tools/skill.md
```

## Lifecycle States

| State | Meaning |
|---|---|
| Active | Installed, using directly, no local orchestration layer |
| Integrated | Installed, delegated to via creating-tools, not invoked directly |
| Deprecated | Orchestration removed, plugin still installed, pending cleanup |
| Removed | Uninstalled, registry entry archived |

See `plugins/registry.md` for current state of each installed plugin.
