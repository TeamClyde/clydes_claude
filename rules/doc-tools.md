# Doc Tools

## Diátaxis Quadrants

| Quadrant | Location | User need |
|---|---|---|
| Tutorials | docs/tutorials/ | Learning |
| How-To | docs/how-to/ | Doing |
| Reference | docs/reference/ | Information |
| Explanation | docs/explanation/ | Understanding |

ADRs live under `docs/explanation/adr/`, not flat `docs/adr/`.

## Explanation Quadrant Layout

Three artifact classes under `docs/explanation/`:

| File | Role | C4 layer |
|---|---|---|
| `architecture.md` | Repo-level system overview (single file) | C1 + C2 |
| `features/<slug>.md` | Per-feature explainer (one per component) | C3 |
| `adr/NNNN-<slug>.md` | Decision records, immutable | n/a |

Every ADR has a required `## Related` heading section with at least one `Parent: <path>` line, pointing to either `docs/explanation/architecture.md` or `docs/explanation/features/<slug>.md`. Multi-parent ADRs (rare cross-cutting case) list one `Parent:` line per parent. Format detail lives in `skills/doc-author/SKILL.md` — do not duplicate here.

## Manifest Pattern

Every repo has `docs/manifest.md` — source of truth for "what docs this repo aspires to have." Seeded at `project-setup` Phase 1.5 from `templates/manifest/<domain>.md`. Diátaxis-organized checkbox list. Never delete entries without deliberate intent.

## Open Domain Registry

`project.json` `domain:` is free text. Initial seed templates: `software-eng`, `firmware`, `mobile`, `python-utility`, `ml`. Unknown values fall back to `templates/manifest/_default.md`. Extend by dropping a new `templates/manifest/<name>.md`. One domain per repo (v1).

## Close-Subplan Doc Order

When a closing sub-plan has both ADR candidates AND affected docs: ADR Promotion Scan runs FIRST, `doc-author` skill runs SECOND. Bottom-up — feature-doc synthesis happens with the accepted ADR list in hand. Execution detail lives in `skills/plan-management/SKILL.md` and `skills/doc-author/SKILL.md`.

## Tier Names

`/docs-status` output uses exactly three severity tiers. Tier names are case-sensitive and shared across the workflow:

- `ERRORS` — actionable failures (file marked `[x]` in manifest but missing; broken internal links; ADR `## Related` Parent: path doesn't exist; feature-doc Decisions section references a missing ADR).
- `WARNINGS` — drift signals (file exists but mtime > stale threshold; parent doc's Decisions section doesn't backlink an ADR that points to it).
- `SUGGESTIONS` — aspirational / informational (manifest entry `[ ]` not yet created; file on disk not in manifest).

Skills that emit tiered output MUST use these exact names. Execution detail in `skills/docs-status/SKILL.md`.

## When to Write an ADR

A decision warrants an ADR when one of:

- Framework swap (e.g., switching auth library, ORM, frontend framework)
- API contract change (request/response shape, auth scheme, versioning)
- Data model change (schema migration with downstream impact)
- Infrastructure choice (DB engine, cloud provider, message broker)
- Security model change (auth flow, secret-handling, encryption-at-rest)

Capture mechanism: brainstorming Step 10 surfaces the ADR-candidate question; `[adr-candidate]` journal tags during execution mark mid-plan decisions worth re-justifying. Promotion happens at sub-plan close via the ADR Promotion Scan in `skills/plan-management/SKILL.md`. ADRs are immutable once `Accepted` — evolve via `## Supersedes` chains, not edits to prior ADRs.

## What is NOT Enforced

- Never block PR or commit on missing docs.
- Never auto-commit doc mutations — `doc-author` always surfaces drafts for user review.
- Never push to Confluence without user-initiated action.

## Where the Heavy Detail Lives

| Topic | Source of truth |
|---|---|
| `## Related` heading section format, feature-doc template, ADR backlink shape | `skills/doc-author/SKILL.md` |
| `/doc-backfill` codegraph harvest | `skills/doc-backfill/SKILL.md` |
| `/docs-status` cross-link integrity sweeps | `skills/docs-status/SKILL.md` |
| `/docs-refresh` routing table | `skills/docs-refresh/SKILL.md` |
| Brainstorming C4 classification | `skills/brainstorming/SKILL.md` |
| Close-subplan ordering + per-doc 2-step execution + ADR Promotion Scan | `skills/plan-management/SKILL.md` |

If a skill disagrees with this rule on convention, this rule wins (priority hierarchy). If two skills disagree on a doc-author-related convention, `doc-author` is canonical.
