---
name: docs-refresh
description: Use when generating or refreshing doc content for a specific Diátaxis quadrant or artifact type — routes to the right wshobson doc agent or skill (tutorial-engineer / docs-architect / reference-builder / architecture-decision-records / changelog-automation / openapi-spec-generation / mermaid-expert). Multi-domain aware. Does not commit (user reviews specialist output). Triggers on "docs refresh", "generate tutorial", "draft ADR", "refresh changelog", "/docs-refresh".
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

# /docs-refresh — Doc Generation Slash Command

## Purpose

Manual doc-content generation. `/docs-status` shows what's missing; `/docs-refresh` generates content for one specific artifact type via the appropriate specialist (wshobson agent or skill).

This skill is a thin router. Specialists handle their own internal logic.

## Inputs

`type` argument selects the target.

| `<type>` | Routes to | Target location |
|---|---|---|
| `tutorial` | `tutorial-engineer` agent | `docs/tutorials/<name>.md` (prompt user for name) |
| `how-to` | `docs-architect` agent | `docs/how-to/<name>.md` (prompt user for name) |
| `reference` | `reference-builder` agent | `docs/reference/<name>.md` (prompt user for name) |
| `explanation` | `docs-architect` agent | `docs/explanation/<name>.md` (prompt user for name) |
| `adr` | `architecture-decision-records` skill | `docs/explanation/adr/NNNN-<title>.md` (auto-numbered) |
| `changelog` | `changelog-automation` skill | `CHANGELOG.md` (overwrites/extends `[Unreleased]`) |
| `openapi` | `openapi-spec-generation` skill | `openapi.yaml` |
| `diagram` | `mermaid-expert` agent | inline in user-specified target file |

## Workflow

1. **Validate `type` argument** matches one of the 8 values above. If invalid, list valid types and exit.

2. **Resolve target path or name:**
   - For `tutorial` / `how-to` / `reference` / `explanation`: prompt user for a short kebab-case filename.
   - For `adr`: auto-derive next ADR number by scanning `docs/explanation/adr/` for the highest `NNNN-*.md` and incrementing.
   - For `diagram`: prompt user for the target file the diagram should be inlined into.
   - For `changelog`, `openapi`: target path is fixed.

3. **Dispatch to the appropriate agent or skill** via the standard mechanism (Agent tool for agents, Skill tool for skills).

4. **Specialist drafts content** and writes to the target path.

5. **After specialist returns**, show user a summary:
   > "Drafted <path>. Review and commit when ready. Re-run /docs-status to see the artifact move from SUGGESTIONS to a healthier tier."

## Failure Modes

| Condition | Behavior |
|---|---|
| Invalid `<type>` argument | List the 8 valid types, exit |
| Target file already exists (non-versioned types: tutorial / how-to / reference / explanation) | Ask user: overwrite, append, or cancel |
| Specialist agent or skill missing | Fail loud — these are installed at commit `67b1403`; this should never happen unless the workflow-improvements repo is in an unexpected state |

## Gotchas

1. **This skill does not commit.** User reviews specialist output then commits via `git-manager`.
2. **After running**, recommend the user re-run `/docs-status` to see the artifact's tier change.
3. **Thin router only.** Specialist agents/skills handle their own internal logic — do not duplicate their behavior here.
4. **ADR auto-numbering** scans `docs/explanation/adr/` (Diátaxis path) — not the older flat `docs/adr/` path. If the repo somehow has both, the scan ignores `docs/adr/`.
