---
name: docs-status
description: "Use when auditing a repo's documentation against its docs/manifest.md — checks what's missing, stale, or aspirational vs what's actually on disk. Multi-domain aware via project.json domain. Outputs tiered report (ERRORS / WARNINGS / SUGGESTIONS) per rules/doc-tools.md. Also validates ADR ↔ feature-doc cross-link integrity (3 regex sweeps: ## Related section + Parent: paths resolve, parent backlinks ADR, Decisions section links resolve). Read-only audit; never modifies repo files except scaffolding manifest on first use. Triggers on \"docs status\", \"audit my docs\", \"check what docs are missing\", \"/docs-status\"."
allowed-tools: Read, Glob, Grep, Bash, Edit, Write, mcp__linkinator__*
---

# /docs-status — Doc Audit Slash Command

## Purpose

Compare what `docs/manifest.md` declares the repo should have against what actually exists on disk. Produce tiered output per `rules/doc-tools.md` "Tier Names" section: ERRORS (actionable), WARNINGS (drift), SUGGESTIONS (aspirational).

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

## Cross-Link Integrity Check

After the manifest audit and Linkinator pass, run three regex sweeps to validate ADR ↔ feature-doc cross-links.

**Note on ADR format:** ADRs use a `## Related` heading section (not front-matter) per the convention in `templates/adr/template.md`. Under `## Related`, each parent is declared on its own line with the prefix `Parent: ` followed by a path. Example:

```
## Related

Parent: docs/explanation/features/auth.md
```

Multi-parent ADRs have multiple `Parent:` lines.

**Sweep 1 — ADR `## Related` section + Parent: paths resolve:**

For each file matching `docs/explanation/adr/*.md`:
1. Parse the `## Related` heading section. Capture every line under that heading (until the next `##` heading or EOF) matching the regex `^Parent:\s*(\S.*?)\s*$` — the captured group is the parent path.
2. If the `## Related` section is missing entirely → emit ERRORS-tier entry: `<adr-path> → required ## Related section missing`.
3. If no `Parent:` lines are found under the section → emit ERRORS-tier entry: `<adr-path> → ## Related section has no Parent: lines`.
4. For each captured parent path: verify it exists on disk. If missing → emit ERRORS-tier entry: `<adr-path> → Parent: <path> does not exist`.

**Sweep 2 — Parent doc backlinks the ADR:**

For each ADR whose `## Related` Parent: paths resolve:
1. Open each parent doc.
2. Verify the parent's `## Decisions` section contains a backlink to this ADR file. Use the regex `\[ADR-\d{4}\]\([^)]*<adr-filename-without-extension>\.md\)` where `<adr-filename-without-extension>` is the literal slug derived from the ADR's filename (e.g., for `0001-cognito-jwt-paste.md`, the slug is `0001-cognito-jwt-paste`).
3. If no backlink found → emit WARNINGS-tier entry: `<adr-path> → parent <path> does not backlink this ADR in ## Decisions`.

**Sweep 3 — feature-doc Decisions section links resolve:**

For each file matching `docs/explanation/features/*.md` and `docs/explanation/architecture.md`:
1. Parse the `## Decisions` heading section.
2. For each link matching the regex `\[ADR-\d{4}\]\(([^)]+\.md)\)` — capture the target path.
3. Resolve the captured path relative to the doc's location. Verify it exists.
4. If missing → emit ERRORS-tier entry: `<doc-path> → Decisions references missing ADR: <link>`.

Output from all three sweeps merges into the existing ERRORS / WARNINGS / SUGGESTIONS tier classification — no new tier introduced.

**Pure regex; no MCP dependencies.** Runs on any repo regardless of which optional tooling is installed (Linkinator MCP, etc.).

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
5. **Tier names are case-sensitive** and match `rules/doc-tools.md` "Tier Names" section exactly: `ERRORS`, `WARNINGS`, `SUGGESTIONS`. Do not rename.
