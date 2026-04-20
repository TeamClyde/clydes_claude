---
name: writing-rules
description: Use when creating a new rules file, deciding whether a constraint should be a rule or a skill, or determining if a rule should be global or path-scoped.
---

# Writing Rules

## Overview

Rules are **always-on context injections**. They load automatically into every session (global rules) or into sessions touching specific files (path-scoped rules). Unlike skills, they are not invoked on demand — they are always present when they apply.

## Rule vs Skill

| Use a rule when... | Use a skill when... |
|---|---|
| The constraint must always be active | The process is invoked on demand |
| It's a routing directive or hard constraint | It's a methodology or multi-step technique |
| No trigger keyword needed | Discovery via trigger description matters |
| Short and scannable (< 50 lines) | Detailed guidance benefits from explicit loading |
| Universal across all contexts | Specific to a type of task |

**Out of scope for writing-rules:** If the request is a process guide (step-by-step methodology, TDD cycle, multi-phase workflow) → redirect to `writing-skills`. If it's an autonomous worker → redirect to `writing-agents`.

## Two Rule Types

### Global Rules (no frontmatter)

Always loaded into every session. No frontmatter at all.

Use for: universal constraints (never call Jira MCP directly), routing directives (always use git-manager for commits), lifecycle governance rules.

```markdown
# Rule Name

Content here.
```

Examples: `rules/mcp-governance.md`, `rules/cspell.md`, `rules/plugin-lifecycle.md`

### Path-Scoped Rules (paths: frontmatter)

Loaded only when files matching the pattern are in scope.

Use for: per-directory conventions, file-type-specific constraints, onboarding checklists scoped to config files.

```markdown
---
paths:
  - "src/api/**"
  - "CLAUDE.md"
---

# Rule Name

Content here.
```

Examples: `rules/new-repo-setup.md` (scoped to `CLAUDE.md` and `.claude/**`)

## Authoring Principles

**Short and scannable.** A rule read in 20 seconds is better than one requiring 2 minutes.

**Procedural, not philosophical.** Decision tables and numbered steps over narrative paragraphs.

**One concern per file.** If a rule covers two unrelated constraints, split it into two files.

**Hard constraint language, not advisory:**
```
# ❌ Avoid calling Jira MCP tools directly when possible.
# ✅ Never call Jira MCP tools directly. Always route through jira-workflow-manager.
```

**Decision table over prose:**
```markdown
| Operation | Correct tool |
|---|---|
| Git commit | git-manager skill |
| Jira ticket | jira-workflow-manager agent |
```

## Testing: Observational

Rules have no eval loop and no automated test. Testing is observational:

1. Start 2–3 real sessions that would trigger the rule.
2. Observe whether the constraint is followed or violated.
3. If violated: is the rule ambiguous? Rewrite and re-test.

**No Pulser eval needed.** Rules are not skills — skip the eval phase entirely.

**Pass criteria:** The constraint is followed in all observed sessions without explicitly invoking the rule.

## Deployment

1. Create the file at `rules/<name>.md`
2. Run `setup.sh --force` to symlink it into `~/.claude/rules/`
3. Verify the symlink: `ls ~/.claude/rules/<name>.md`
4. Register in `rules/new-repo-setup.md` if it applies to new repo onboarding

## Checklist

- [ ] Rule vs skill decision made (see table above)
- [ ] Rule type chosen: global (no frontmatter) or path-scoped (`paths:`)
- [ ] Content is scannable: decision table or short procedural steps
- [ ] Single concern per file
- [ ] Hard constraint language ("never" / "always"), not advisory ("avoid")
- [ ] Placed at `rules/<name>.md`
- [ ] Symlinked via `setup.sh --force`
- [ ] Tested observationally (2–3 live sessions)
- [ ] Registered in `rules/new-repo-setup.md` if broadly applicable
