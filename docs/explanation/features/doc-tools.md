---
**Feature:** Documentation Tooling
**C4 Layer:** C3 Component
**Status:** Active
**Owner:** solo
**Last updated:** 2026-06-18
**Related plans:** plans/orchestration-layer-foundation/ (Phase 1B docs)
**Related ADRs:** _(none yet — completeness-oracle ADR is promoted at sub-plan close)_
**Key files:**
  - `skills/doc-author/SKILL.md` — feature/architecture doc kernel (wraps docs-architect)
  - `skills/docs-status/SKILL.md` — manifest + cross-link audit
  - `skills/docs-refresh/SKILL.md` — per-quadrant content generation router
  - `skills/doc-backfill/SKILL.md` — whole-repo codegraph-driven bootstrap
  - `rules/doc-tools.md` — Diátaxis layout, manifest pattern, ADR conventions, severity tiers
---

# Documentation Tooling

## Context & Scope

The documentation tooling subsystem provides every skill, rule, and convention the workflow uses to create, audit, and keep current the narrative documentation for a repo. It covers the full lifecycle from first-time bootstrap through per-plan synthesis to ongoing health monitoring.

The subsystem has two complementary layers. The **Reference layer** (`docs/reference/component-inventory.md`, `docs/reference/gate-map.md`) is generated from the codebase and drift-checked on every run — it is complete by construction and is the backstop for "everything is listed somewhere." The **Explanation layer** (`docs/explanation/architecture.md` plus per-feature explainers under `docs/explanation/features/`) adds narrative depth and rationale, citing the generated artifacts rather than duplicating lists that would drift. A re-runnable coverage audit cross-references every component name in the inventory against the Explanation layer, making completeness a verifiable invariant rather than a judgement call. This design — using the generated inventory as the oracle for documentation completeness — is the architectural decision captured as ADR candidate #2 (promoted at sub-plan close).

**In scope:** `doc-author` (the authoring kernel), `docs-status` (manifest and cross-link audit), `docs-refresh` (on-demand content generation router), `doc-backfill` (whole-repo codegraph bootstrap), `architecture-decision-records` (ADR drafting), `changelog-automation` (release note generation), `openapi-spec-generation` (API contract documentation), and the rules and conventions that govern them all (`rules/doc-tools.md`).

**Out of scope:** test documentation (owned by `testing-system`), Jira ticket descriptions, commit messages, and any documentation stored outside `docs/` or outside the `docs/explanation/` Explanation layer. The subsystem does not push to Confluence, does not block PRs on missing docs, and does not auto-commit any mutation — all writes are drafts for human review.

## Building Block View

### Diátaxis Quadrant Model

All documentation in a repo is organized into four quadrants, each serving a distinct user need:

| Quadrant | Location | User Need |
|---|---|---|
| Tutorials | `docs/tutorials/` | Learning — step-by-step walkthroughs |
| How-To | `docs/how-to/` | Doing — task-oriented recipes |
| Reference | `docs/reference/` | Information — exhaustive lookup |
| Explanation | `docs/explanation/` | Understanding — rationale and architecture |

The Explanation quadrant has a three-tier internal layout that maps to the C4 model:

| File | Role | C4 Layer |
|---|---|---|
| `docs/explanation/architecture.md` | Repo-level system overview (one file per repo) | C1 + C2 |
| `docs/explanation/features/<slug>.md` | Per-feature explainer (one per component group) | C3 |
| `docs/explanation/adr/NNNN-<slug>.md` | Decision records (immutable once Accepted) | n/a |

ADRs live under `docs/explanation/adr/`, never under a flat `docs/adr/` path. This placement is load-bearing: `docs-status` locates ADRs by scanning `docs/explanation/adr/*.md`.

### The Manifest Pattern

Every repo declares its aspirational documentation inventory in `docs/manifest.md` — a Diátaxis-organized checklist of all docs the repo intends to have. It is seeded at `project-setup` Phase 1.5 from `templates/manifest/<domain>.md`, falling back to `templates/manifest/_default.md` when the domain has no specific template. The manifest uses checkbox syntax: `- [x] <path>` for docs that exist and `- [ ] <path>` for aspirational entries. Entries are never deleted without deliberate intent. The manifest is the source of truth that `docs-status` audits against — without it, the audit cannot distinguish "intentionally missing" from "forgotten."

### The Completeness Oracle

Documentation completeness is enforced by cross-referencing the generated, drift-checked component inventory (`docs/reference/component-inventory.md`) rather than by manual review. The inventory is produced by `scripts/harvest-components.mjs` and committed on every run with a drift-check gate — it reflects the actual state of the repo at all times. The coverage audit (the closing task of a documentation plan) reads every component name from `docs/reference/component-inventory.json` and verifies that each name appears in at least one `docs/explanation/` file, or is explicitly marked as `catalog-only` with a stated reason. This makes the question "is the whole workflow documented?" a re-runnable automated check rather than a subjective review. The architectural choice to use the generated inventory as the oracle — rather than a hand-maintained list — is the decision captured by ADR candidate #2, which is promoted at sub-plan close and backlinked into this document's `## Decisions` section at that time.

### Skills and Their Roles

**`doc-author`** is the single execution kernel for all mutations of `docs/explanation/features/<slug>.md` and `docs/explanation/architecture.md`. It wraps the `docs-architect` agent with a strict two-step pipeline and a five-constraint prompt that enforces merge-not-replace behavior, section-structure preservation, and front-matter integrity. Callers — `plan-management:close-subplan`, `/doc-backfill`, and `/docs-refresh feature|architecture` — never invoke `docs-architect` directly; they always go through `doc-author`. The wrapper is the value: without it, `docs-architect`'s default behavior is full-document synthesis that will rewrite sections, reorder content, and drop front-matter conventions.

**`docs-status`** audits a repo's documentation health. It compares the manifest checklist against the filesystem, classifies each entry into one of three severity tiers, optionally runs a broken-link check, and performs three regex sweeps to validate ADR-to-feature-doc cross-link integrity. It is a read-only skill — it never modifies files except scaffolding `docs/manifest.md` on first use if the user accepts. It produces a structured tiered report and a summary line.

**`docs-refresh`** is a thin router that dispatches on-demand content generation to the right specialist. The `feature` and `architecture` routes go through `doc-author`; the `adr` route goes through `architecture-decision-records`; `changelog` and `openapi` go through their respective skills; `tutorial`, `how-to`, `reference`, and `diagram` route to wshobson agents (`tutorial-engineer`, `docs-architect`, `reference-builder`, `mermaid-expert`).

**`doc-backfill`** is a whole-repo one-shot bootstrap. It reads the codebase graph to identify C2 container boundaries and C3 component clusters, presents a confirmed target list to the user, then dispatches `doc-author` (with `context-source=codegraph`) for each target. It never writes docs directly and never auto-commits. It is the entry point for a repo that has no Explanation-layer docs yet and needs a first-pass draft from the current code state rather than from a recent plan.

**`architecture-decision-records`** drafts ADRs with required sections: Status, Context, Decision, Consequences, and a `## Related` heading section with at least one `Parent:` line. It is invoked by `/docs-refresh adr` and by the ADR Promotion Scan at sub-plan close. Once an ADR reaches `Accepted` status it is immutable — changes happen via `## Supersedes` chains in a new ADR, not edits to the prior one.

**`changelog-automation`** generates and maintains `CHANGELOG.md` following the Keep a Changelog format, driven by Conventional Commits. Invoked by `/docs-refresh changelog`.

**`openapi-spec-generation`** produces and maintains OpenAPI 3.1 specifications, supporting design-first, code-first, and hybrid approaches. Invoked by `/docs-refresh openapi`.

### ADR Cross-Link Convention

Every ADR must have a `## Related` heading section (not YAML frontmatter) containing at least one `Parent:` line pointing to either `docs/explanation/architecture.md` or a `docs/explanation/features/<slug>.md` file. The format is:

```
## Related

Parent: docs/explanation/features/doc-tools.md
```

Multi-parent ADRs (cross-cutting decisions) list one `Parent:` line per parent. The parent document's `## Decisions` section must contain a reciprocal backlink in the form `[ADR-NNNN](../adr/NNNN-<slug>.md) — <title> (Accepted)`. `docs-status` enforces both directions of this relationship via its three cross-link integrity sweeps. `doc-author`'s Step 1 backlink pass inserts the parent-side backlink automatically when `accepted-adrs` are passed; the ADR's own `## Related` section is written at ADR creation time and is immutable thereafter (except for the narrow link-hygiene repair case where an ADR was written before its canonical parent doc existed).

### When to Write an ADR

| Write ADR | Skip ADR |
|---|---|
| Framework or library swap | Minor version upgrades |
| API contract change (shape, auth scheme, versioning) | Bug fixes |
| Data model change with downstream impact | Implementation details |
| Infrastructure choice (DB engine, cloud provider, broker) | Configuration changes |
| Security model change (auth flow, secret-handling, encryption) | Routine maintenance |

ADR candidates are captured at two points: `brainstorming` Step 10 surfaces candidates proactively, and `[adr-candidate]` journal tags during execution mark mid-plan decisions worth re-justifying. Both are inputs to the ADR Promotion Scan at sub-plan close.

## Runtime View

### Authoring a New Feature Doc (primary flow)

The normal path for a new feature explainer runs through `plan-management:close-subplan`:

1. All tasks in the sub-plan reach ✅.
2. `close-subplan` runs the **ADR Promotion Scan** first. For each `[adr-candidate]` journal tag: decide promote or decline. For each promoted ADR, `architecture-decision-records` drafts the file under `docs/explanation/adr/NNNN-<slug>.md`.
3. `close-subplan` then invokes `doc-author` second — **ADR Promotion Scan always runs before `doc-author`** so the accepted ADR list is in hand when content synthesis happens.
4. `doc-author` is called with `mode=create`, `context-source=journal`, `plan-doc=<path>`, and `accepted-adrs=[<promoted paths>]`.
5. `doc-author` **Step 1 — Backlink Pass:** scaffolds the target from `templates/feature-explainer.md`, reads each accepted ADR, extracts its H1 title and Status, and appends a backlink line to the `## Decisions` section.
6. `doc-author` **Step 2 — Content Pass:** builds a constraint-augmented prompt embedding the five non-negotiable constraints (section structure, Decisions section frozen, merge-not-replace, front-matter authority, no YAML frontmatter), then dispatches `docs-architect` with that prompt and the plan doc reference.
7. `docs-architect` reads the plan design and journal, synthesizes content for each section, and returns the full document.
8. `doc-author` validates that every template section heading is present. If a section is missing, it re-prompts once. If the second attempt still drops sections, it surfaces the failure and returns without writing.
9. `doc-author` writes the validated content to the target and returns the draft to `close-subplan`.
10. `close-subplan` surfaces the draft for human review. The caller owns review and commit — `doc-author` never auto-commits.
11. After human acceptance, `git-manager` commits the new file.

### On-Demand Refresh (`/docs-refresh`)

When a developer needs to refresh an existing doc or generate content outside a plan-close event:

1. User invokes `/docs-refresh <type>` (e.g., `/docs-refresh feature doc-tools` or `/docs-refresh adr`).
2. `docs-refresh` validates the type argument against its routing table.
3. For `feature` and `architecture` routes, `docs-refresh` resolves a plan-doc source: it reads `.claude/active-plan`; if empty, it prompts the user for a plan-doc path or `codegraph` mode.
4. `docs-refresh` dispatches to the appropriate specialist (for `feature`/`architecture` routes, this is `doc-author`; for others it is the relevant agent or skill).
5. Specialist drafts content and writes to the target path.
6. `docs-refresh` surfaces a summary and recommends re-running `/docs-status` to confirm the doc's tier improves.

### First-Time Bootstrap (`/doc-backfill`)

For a repo with no Explanation-layer docs yet:

1. Preflight: verify `.claude-init/CODEBASE.md` exists. Refuse if missing — the codegraph is required.
2. Codegraph harvest: `get_architecture`, `query_graph` (IMPORTS edges), `search_graph` (Route nodes), `search_code` (heuristic seeds for sparse clusters).
3. Component identification: classify C2 candidates (architecture.md) and C3 candidates (features/*.md) by cohesion.
4. Present target list to user. Wait for explicit confirmation before generating anything.
5. For each confirmed target: invoke `doc-author` with `mode=create context-source=codegraph`.
6. Collect all drafts. Surface to user for per-file accept / edit / decline.
7. Commit each accepted draft via `git-manager`.

### Health Audit (`/docs-status`)

The audit runs in a fixed sequence:

1. Read `project.json` for the domain field.
2. Read or scaffold `docs/manifest.md`.
3. Parse manifest checkbox entries; walk the `docs/` filesystem.
4. Classify each manifest entry: `[x]`-but-missing → **ERRORS**; exists-but-stale → **WARNINGS**; `[ ]`-not-created → **SUGGESTIONS**.
5. Detect orphan files (on disk but absent from manifest) → **SUGGESTIONS**.
6. Optional broken-link check → ERRORS for each broken link.
7. Three regex sweeps for ADR cross-link integrity:
   - Sweep 1: every ADR has a `## Related` section with at least one `Parent:` line that resolves to a file on disk. Missing section or unresolvable path → **ERRORS**.
   - Sweep 2: every parent doc's `## Decisions` section backlinks its ADR children. Missing backlink → **WARNINGS**.
   - Sweep 3: every backlink in a feature-doc's `## Decisions` section resolves to an ADR file on disk. Missing file → **ERRORS**.
8. Emit the three-tier report and summary line.

## Dependencies

- **`docs-architect` agent** — the content synthesis engine wrapped by `doc-author`. All content generation passes through this agent; `doc-author` is the wrapper that enforces constraints before dispatching it and validates the returned content before writing.
- **`plan-management:close-subplan`** — the primary caller of `doc-author` in the normal workflow. Owns the ADR Promotion Scan ordering (ADRs first, `doc-author` second) and owns commit after human review.
- **`architecture-decision-records` skill** — drafts ADR files. Invoked by `/docs-refresh adr` and by the ADR Promotion Scan. `doc-author` reads ADR files (already written) but does not draft them.
- **`git-manager` skill** — handles all commits of documentation artifacts. Neither `doc-author` nor `docs-refresh` nor `doc-backfill` commit directly.
- **`codebase-memory MCP`** (`get_architecture`, `query_graph`, `search_graph`, `search_code`) — required by `doc-backfill` (and by `doc-author` when `context-source=codegraph`). Requires `.claude-init/CODEBASE.md` to exist, seeded by `/infra-init`.
- **`scripts/harvest-components.mjs`** — generates `docs/reference/component-inventory.md` and `docs/reference/component-inventory.json`. These are the inputs to the completeness oracle. Not a skill — a standalone script invoked by `npm run harvest`.
- **`rules/doc-tools.md`** — the authoritative rule file for Diátaxis layout, manifest pattern, ADR conventions, severity tier names, and the close-subplan doc ordering rule. When a skill's behavior conflicts with this rule, the rule wins.
- **`templates/feature-explainer.md`** and **`templates/architecture.md`** — the scaffold templates `doc-author` uses for `mode=create`. Section headings in these templates define the structure `doc-author` validates against in Step 2.

## Decisions

_(No accepted ADRs yet — the completeness-oracle ADR is promoted at sub-plan close.)_

## Known Issues & Gotchas

- **Backlink pass must run before content pass.** `doc-author` enforces this internally (Step 1 always before Step 2), but callers that bypass the wrapper and invoke `docs-architect` directly will see stale or missing `## Decisions` backlinks. The wrapper is non-optional.

- **`doc-author` refuses `mode=create` if the target already exists.** Use `mode=update` for existing files. A common mistake is re-running a create flow after a partial write; the refuse rule prevents silent overwrites but requires the caller to explicitly choose between create and update.

- **`context-source=codegraph` requires `.claude-init/CODEBASE.md`.** If `/infra-init` has not been run in the repo, both `doc-author` and `doc-backfill` will refuse with a clear message. The codegraph must be indexed before any codegraph-sourced doc generation is possible.

- **`context-source=journal` with a Form-A sub-plan produces no journal file.** Form-A sub-plans (design + plan only) have no journal artifact. `docs-architect` receives a not-found on the journal path and proceeds on design + plan + any explicitly-named legacy source docs. This is expected and harmless — `doc-author`'s refuse rule 3 only fires when the `plan-doc` arg itself is absent, not when the journal file is missing.

- **`mode=backlink-only` with an empty `accepted-adrs` is a no-op that triggers a refuse.** When `close-subplan` decides to skip an ADR candidate (declined at the Promotion Scan), it must not call `doc-author` in `backlink-only` mode for that candidate's parent doc — the refuse rule fires with an empty list. Only call `backlink-only` for parents whose ADR was actually promoted.

- **ADR `Parent:` paths written before the Explanation layer existed may point at flat `docs/` files** that no longer exist after relocation. The only conforming repair path for a broken `Parent:` is to repoint it to the correct `docs/explanation/` path. This is permitted as link hygiene (the immutability rule protects the decision record sections, not link paths), but must be done before the coverage audit or `docs-status` will emit ERRORS for the broken parent.

- **Tier names are case-sensitive.** `docs-status` output uses exactly `ERRORS`, `WARNINGS`, `SUGGESTIONS`. Skills that emit tiered output must use these exact strings. Using `errors`, `Errors`, or `error` will silently break any downstream tool or human process that parses the report.

- **`doc-author` does not auto-commit under any circumstances.** This is by design: the caller owns review and commit. Any caller that silently commits `doc-author`'s output without surfacing it for review is violating the contract.

## Observability

Doc health is observed via three mechanisms:

**`/docs-status` tiered report** — the primary health signal. Run on demand or as part of the coverage audit. The report emits three sections (`ERRORS`, `WARNINGS`, `SUGGESTIONS`) followed by a summary line (`N errors, M warnings, K suggestions`). The success criterion for a complete documentation pass is `ERRORS = 0`. A non-zero error count means at least one of: a manifest entry marked `[x]` is missing on disk; a broken internal link; an ADR missing its `## Related` section or with an unresolvable `Parent:` path; a feature-doc `## Decisions` section referencing a missing ADR file.

**`docs/manifest.md` checklist** — the aspirational inventory. Visual inspection of the manifest reveals documentation completeness at a glance: `[x]` entries are on disk, `[ ]` entries are aspirational. The manifest doubles as the input to `docs-status` classification; keeping it current is what makes the audit meaningful.

**`docs/_coverage-audit.md`** — the completeness oracle report, generated at the close of a documentation plan. It maps every component in `component-inventory.json` to its documenting explanation file (or records it as `catalog-only` with a reason). Zero un-triaged entries in this report is the invariant that guarantees every component has a documented home.

## Glossary

**Diátaxis** — A documentation authoring framework that organizes content into four quadrants by user need: Tutorials (learning), How-To (doing), Reference (information), Explanation (understanding). `rules/doc-tools.md` is the authoritative mapping of these quadrants to directory locations in this workflow.

**Explanation layer** — The `docs/explanation/` subtree, which contains `architecture.md` (C1+C2), `features/<slug>.md` (C3 explainers), and `adr/NNNN-<slug>.md` (decision records). The Explanation layer is where narrative rationale lives; the Reference layer is where generated, exhaustive listings live.

**Completeness oracle** — The mechanism by which documentation completeness is verified: the generated component inventory (`docs/reference/component-inventory.json`) is cross-referenced against the Explanation layer. Every component must be named in at least one explanation doc or explicitly categorized as `catalog-only`. This makes completeness re-runnable and not reliant on human memory.

**ADR (Architecture Decision Record)** — An immutable record of a significant technical decision, capturing context, considered options, decision, and consequences. Written with a required `## Related` section containing `Parent:` lines. Promoted from `[adr-candidate]` journal tags at sub-plan close via the ADR Promotion Scan. Once `Accepted`, the decision record sections are immutable — evolution happens via `## Supersedes` chains in new ADRs.

**Manifest** — `docs/manifest.md`, the source of truth for what documentation this repo aspires to have. A Diátaxis-organized checkbox list seeded from a domain template. Entries marked `[x]` must exist on disk; entries marked `[ ]` are aspirational. Never delete entries without deliberate intent.

**ADR Promotion Scan** — The step that runs at `plan-management:close-subplan`, before `doc-author`, to convert `[adr-candidate]` journal tags into actual ADR files. The scan decides for each candidate: promote (draft the ADR) or decline. Only promoted ADRs are passed to `doc-author` as `accepted-adrs`.

**Merge-not-replace** — The `doc-author` behavioral constraint for `mode=update`: existing prose in any section is authoritative, and the content pass may only append or refine individual sentences, never replace entire sections. Enforced via the constraint prompt dispatched to `docs-architect`.

**Backlink pass** — Step 1 of `doc-author`'s two-step execution, which always runs before the content pass. Reads each accepted ADR, extracts its H1 title and Status, and inserts a `[ADR-NNNN](../adr/NNNN-<slug>.md) — <title> (<Status>)` line into the target's `## Decisions` section. Idempotent — a given ADR-NNNN is only inserted once regardless of how many times the pass runs.

**Context source** — The origin of content for `doc-author`'s Step 2 content pass. `journal` directs `docs-architect` to read the plan design, plan, and journal for a recently completed plan tree. `codegraph` directs `doc-author` to build a structured summary from codebase graph queries and embed it inline in the prompt. `backlink-only` skips Step 2 entirely and only runs the backlink pass.

**ERRORS / WARNINGS / SUGGESTIONS** — The three case-sensitive severity tiers emitted by `docs-status`. ERRORS are actionable failures (manifest `[x]` entry missing; broken link; ADR cross-link broken). WARNINGS are drift signals (file exists but is stale; missing backlink from parent to child ADR). SUGGESTIONS are aspirational or informational (manifest `[ ]` entry not yet created; orphan file on disk not in manifest).
