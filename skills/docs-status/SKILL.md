---
name: docs-status
description: Use when auditing a repo's documentation against its docs/manifest.md — checks what's missing, stale, or aspirational vs what's actually on disk. Multi-domain aware via project.json domain. Outputs tiered report (ERRORS / WARNINGS / SUGGESTIONS) per rules/doc-tools.md. Read-only audit; never modifies repo files except scaffolding manifest on first use. Triggers on "docs status", "audit my docs", "check what docs are missing", "/docs-status".
allowed-tools: Read, Glob, Grep, Bash, Edit, Write, mcp__linkinator__*
---

# /docs-status — Doc Audit Slash Command

## Purpose

Compare what `docs/manifest.md` declares the repo should have against what actually exists on disk. Produce tiered output per `rules/doc-tools.md` Section 6: ERRORS (actionable), WARNINGS (drift), SUGGESTIONS (aspirational).

`/docs-status` is read-only and non-blocking — it informs, the user decides. Companion to `/docs-refresh` (which generates content).

## Inputs

None. Operates on the current working directory.

## Workflow

1. **Read `project.json`** from repo root. If missing, prompt user to run `project-setup` first; exit with INFO.

2. **Read the `domain:` field** from `project.json`. If missing, prompt user once for the domain, write back to `project.json`, then continue.

3. **Read `docs/manifest.md`.** If missing, offer to scaffold from `templates/manifest/<domain>.md` (fall back to `templates/manifest/_default.md` if domain-specific template doesn't exist). If user declines, exit with INFO.

4. **Parse manifest checkbox entries.** Lines matching `- [ ] <path>` or `- [x] <path>` are expected-file declarations. Lines starting with `<!--` or empty lines are skipped. Paths are repo-relative.

5. **Walk `docs/` filesystem.** Also check any root files referenced in manifest (`README.md`, `openapi.yaml`, `CHANGELOG.md`).

6. **Classify each manifest entry:**
   - File marked `[x]` but missing on disk → **ERRORS**
   - File exists, mtime > 6 months (configurable via `<!-- stale-threshold: N months -->` comment in `docs/manifest.md`) → **WARNINGS**
   - Entry marked `[ ]`, file does not exist → **SUGGESTIONS** (aspirational; not an error)

7. **Detect orphan files.** For each file under `docs/` not referenced in manifest → **SUGGESTIONS** ("orphan — add to manifest or remove").

8. **Broken-link check (optional).** If Linkinator MCP is available, invoke it across `docs/`. Each broken link → **ERRORS** entry. If MCP not installed, skip with one-line INFO note.

9. **Format output** with three tier sections (omit empty sections). Each entry one line: tier marker + path + reason.

10. **Return summary line:** "N errors, M warnings, K suggestions."

## Failure Modes

Each non-blocking. Each surfaces a clear message:

| Condition | Behavior |
|---|---|
| `project.json` missing | Prompt user to run `project-setup` first; exit with INFO |
| `domain:` field missing | Prompt user once, persist to `project.json`, continue |
| `docs/manifest.md` missing | Offer to scaffold from `templates/manifest/<domain>.md` (or `_default.md` fallback); if declined, exit with INFO |
| Manifest line malformed (e.g., `- [-]` or unparseable path) | List parse error in ERRORS tier; continue processing remaining entries |
| Linkinator MCP missing | Skip broken-link check; one-line INFO note in output; remaining checks proceed |

## Output Example

```
/docs-status — multi-domain-doc-workflow (domain: software-eng)

ERRORS (3)
  docs/reference/api-spec.md — manifest marks [x] but file missing
  docs/tutorials/getting-started.md — broken link to docs/reference/api-spec.md
  docs/manifest.md:42 — malformed entry "- [-] foo.md" (use [ ] or [x])

WARNINGS (1)
  docs/explanation/architecture.md — last touched 2025-09-10 (8 months ago)

SUGGESTIONS (2)
  docs/reference/api-reference.md — aspirational; not yet created
  docs/how-to/orphan-recipe.md — exists on disk but not in manifest

Summary: 3 errors, 1 warning, 2 suggestions.
```

## Gotchas

1. **Never blocks** any other workflow. Produces a report; the user decides what to act on.
2. **Stale threshold is 6 months by default.** Honor any per-repo override via `<!-- stale-threshold: N months -->` comment in `docs/manifest.md`.
3. **Read-only operation** on the audited repo, except scaffolding `docs/manifest.md` if the user accepts the offer on first use.
4. **One domain per repo (v1).** If `project.json` has multiple domains declared, error out clearly — this is a v2 scope.
5. **Tier names are case-sensitive** and match `rules/doc-tools.md` Section 6 exactly: `ERRORS`, `WARNINGS`, `SUGGESTIONS`. Do not rename.
