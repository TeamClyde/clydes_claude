---
name: doc-author
description: Use when authoring or updating a feature-doc (docs/explanation/features/<slug>.md) or docs/explanation/architecture.md. Wraps the docs-architect agent with merge-not-replace + 2-step (backlink-first → content-second) constraints. Invoked by plan-management:close-subplan (after ADR Promotion Scan), /doc-backfill (whole-repo backfill), and /docs-refresh feature|architecture (manual refresh). Triggers on "draft feature doc", "update feature explainer", "synthesize architecture doc".
allowed-tools: Read, Write, Edit, Glob, Grep, Skill, Agent, get_architecture, query_graph, search_graph, search_code
---

# doc-author — Feature & Architecture Doc Kernel

## Purpose

Single execution kernel for all mutations of:

- `docs/explanation/features/<slug>.md` (feature explainers, arc42-lite)
- `docs/explanation/architecture.md` (C1/C2 system context)

Wraps the `docs-architect` agent so every feature/architecture doc mutation goes through the same merge-not-replace, backlink-first, structure-preserving pipeline. Callers (`plan-management:close-subplan`, `/doc-backfill`, `/docs-refresh feature|architecture`) do not invoke `docs-architect` directly — they invoke this skill, which enforces the contract.

## Inputs (args)

| Arg | Type | Required | Values |
|---|---|---|---|
| `target` | path | yes | `docs/explanation/features/<slug>.md` or `docs/explanation/architecture.md` |
| `mode` | enum | yes | `create` \| `update` \| `backlink-only` |
| `context-source` | enum | yes (for `create`/`update`) | `codegraph` \| `journal` |
| `accepted-adrs` | list of paths | optional | ADR paths to backlink into `## Decisions` |
| `plan-doc` | path | conditional | required when `context-source=journal` |

## Two-Step Execution

Every invocation runs Step 1. Step 2 runs only for `mode=create` and `mode=update`.

### Step 1 — Backlink Pass (always runs)

1. **Resolve target file:**
   - If target exists, Read it.
   - If target does not exist and `mode=create`:
     - For `features/*.md` paths: scaffold from `templates/feature-explainer.md`.
     - For `architecture.md`: scaffold from `templates/architecture.md`.
   - If target does not exist and `mode=update` or `backlink-only`: refuse (see Refuse Rules).

2. **Parse the `## Decisions` section** (the heading is identical in both templates).

3. **For each path in `accepted-adrs`:**
   - Read the ADR file.
   - Extract the H1 title (e.g., `# 0007 — Use feature explainers for C3`).
   - Extract the `## Status` value (e.g., `Accepted`).
   - Derive `NNNN` and slug from filename `NNNN-<slug>.md`.
   - Build the backlink line:
     `- [ADR-NNNN](../adr/NNNN-<slug>.md) — <one-line title> (<Status>)`
   - Append to `## Decisions` only if not already present (idempotent — match by `ADR-NNNN`).

4. **If `mode=backlink-only`:** write the updated target and return. Do not invoke `docs-architect`.

### Step 2 — Content Pass (modes `create` and `update`)

1. **Gather context** per `context-source` (see Context Sources below).
2. **Build the constraint-augmented prompt** (see Constraint Prompt below).
3. **Dispatch `docs-architect` via Agent tool** with that prompt.
4. **Validate the returned content** preserves every section heading from the template. If any section is dropped, re-prompt once with: `Missing section "<name>" — preserve template structure verbatim. Re-emit full document.`
5. **If second attempt still drops sections:** surface the bad output and return failure to the caller. Do not write.
6. **Write the validated content** to the target. Return to caller.

## Constraint Prompt (verbatim contract to docs-architect)

Every Step-2 dispatch MUST include these five constraints in the prompt. They are non-negotiable:

> 1. Output MUST match the section structure of `templates/feature-explainer.md` (or `templates/architecture.md`) exactly. Do NOT add, remove, or reorder sections.
> 2. The `## Decisions` section has already been populated by doc-author. Do NOT modify it.
> 3a. (`mode=update`) Existing prose in any section is authoritative. APPEND or REFINE individual sentences; never REPLACE entire sections.
> 3b. (`mode=create`) Template placeholder lines (the example/scaffold prose under each heading) are scaffolding, not authoritative content. Replace them with real content. Do not append to them.
> 4. Front-matter is authoritative. Update only `**Last updated:**` and append-only fields (Related plans, Related ADRs, Key files). Never rewrite or reorder front-matter fields.
> 5. Use the front-matter pattern `**Field:** value` exactly as the template does — do NOT switch to YAML frontmatter (no `---` block, no `key: value` lines).

The full existing content of the target file (or scaffolded template if creating) must be embedded in the prompt under a `## Existing content` block so docs-architect sees the authoritative starting state.

## Context Sources

### `context-source = journal`

Used when there is a recently completed plan tree (most common from `close-subplan`).

Required `plan-doc` arg. The prompt to docs-architect lists these reference paths:

- `plans/<slug>/<slug>-design.md`
- `plans/<slug>/<slug>-plan.md`
- `plans/<slug>/<slug>-journal.md`
- `git log --oneline <merge-base>..HEAD` output for the branch

docs-architect reads them itself. doc-author does not pre-summarize.

### `context-source = codegraph`

Used for whole-repo backfill (`/doc-backfill`) or refreshes against the current code state, not a recent plan.

doc-author builds a structured summary itself and embeds it directly in the prompt:

1. `get_architecture(project=<canonical>)` → top-level cluster map.
2. `query_graph` Cypher for IMPORTS/CALLS within the relevant cluster.
3. `search_code` for representative entry points and key files.

The resulting summary is inlined under a `## Codegraph summary` block in the prompt. No external file paths for docs-architect to read.

The canonical project name is in the repo's CLAUDE.md under "Codebase Knowledge Graph". Read it from there — do not derive from path.

## Refuse Rules

doc-author refuses (returns failure with a clear message — does not silently degrade) when:

1. **`target` is outside `docs/explanation/`.** Message: `doc-author only operates on docs/explanation/features/*.md and docs/explanation/architecture.md. Got: <target>.`
2. **`context-source=codegraph` but `.claude-init/CODEBASE.md` is missing.** Message: `Codegraph context requires .claude-init/CODEBASE.md. Run /infra-init first.`
3. **`context-source=journal` but `plan-doc` arg is missing.** Message: `Journal context requires plan-doc=plans/<slug>/<slug>-plan.md.`
4. **`accepted-adrs` references a missing ADR file.** Message: `accepted-adrs entry not found: <bad-path>. Verify ADR was promoted.`
5. **`mode=update` but target does not exist.** Message: `Target <path> does not exist. Use mode=create.`
6. **`mode=create` but target already exists.** Message: `Target <path> already exists. Use mode=update (no silent overwrite).`
7. **`docs-architect` returns content with sections dropped, and re-prompt still fails.** Message: `docs-architect dropped section(s) <names> twice. Surfacing output for manual review. No write performed.`
8. **`mode=backlink-only` and `accepted-adrs` is empty or absent.** Message: `mode=backlink-only with no accepted-adrs is a no-op. Pass at least one ADR path, or use mode=create/update without accepted-adrs.`
9. **`mode=create` or `mode=update` and `context-source` is absent.** Message: `context-source is required for mode=create and mode=update. Pass context-source=journal or context-source=codegraph.`

## Output Contract

- doc-author returns the proposed file contents (or a diff against the prior state) to the caller.
- doc-author does NOT auto-commit.
- doc-author does NOT invoke `git-manager`.
- The caller (`plan-management:close-subplan`, `/doc-backfill`, `/docs-refresh feature|architecture`) owns review and commit.

## Non-Goals

- Does NOT draft ADRs. That is owned by `architecture-decision-records` skill.
- Does NOT modify the `Related:` field on existing ADR files (immutable post-acceptance).
- Does NOT draft CHANGELOG, tutorials, how-to, or reference docs. Use `/docs-refresh <type>` for those.
- Does NOT modify the journal.
- Does NOT modify any file outside the `target`.

## Caller-Specific Notes

| Caller | mode | context-source | accepted-adrs |
|---|---|---|---|
| `plan-management:close-subplan` (after ADR Promotion Scan) | `create` or `update` | `journal` | list of ADRs promoted during scan |
| `/doc-backfill` | `create` (per feature) | `codegraph` | resolved per-feature from existing ADRs |
| `/docs-refresh feature \| architecture` | `update` (or `create` if missing) | `journal` or `codegraph` per user arg | optional |

## Gotchas

1. **Always Step-1 before Step-2 — backlinks first.** Running content synthesis before the `## Decisions` section is populated means docs-architect sees stale backlinks and may "improve" them. The order is mandatory.
2. **Never call `docs-architect` directly without the constraint prompt.** docs-architect's default behavior is full-document synthesis; without the 5 constraints it will rewrite sections, drop the front-matter pattern, and reorder content. The wrapper IS the value.
3. **Never auto-commit. The caller is responsible.** Even on success. doc-author has no business deciding whether the new content is correct enough to ship — that is the caller's review responsibility.
4. **For `mode=update`, the existing file's prose is authoritative — append/refine, don't replace.** This is enforced via constraint 3 in the prompt, but if you ever bypass the wrapper, you lose this guarantee.
5. **If codegraph fails or returns sparse data, surface this in the draft as TODO comments rather than producing empty sections.** Empty sections look authoritative; explicit `<!-- TODO: codegraph returned no data for X -->` comments are honest and actionable for the human reviewer.
