# Doc Manifest — Generic Baseline

> Seeded as fallback because `templates/manifest/<your-domain>.md` doesn't exist yet.
> Edit freely. When you've stabilized a useful per-domain manifest, consider promoting it
> to `templates/manifest/<your-domain>.md` in the workflow-improvements repo so future
> repos with the same domain get the same starting point.
> `/docs-status` compares actual files in this repo against the checklist below.

## Tutorials
<!-- Learning-oriented content. What should a new contributor (or future-you)
     read first to get oriented? -->
- [ ] `docs/tutorials/getting-started.md` — first walkthrough

## How-To
<!-- Task-oriented recipes. The "how do I do X" content that you've explained
     more than twice already. -->
- [ ] `docs/how-to/common-tasks.md`

## Reference
<!-- Information-oriented. The "look it up" content: APIs, config, data formats,
     domain-specific reference material. -->
- [ ] `docs/reference/overview.md`

## Explanation
<!-- Hybrid C1+C2+C3 layout per rules/doc-tools.md. -->
- [ ] `docs/explanation/architecture.md` — repo-level system overview (C1 + C2)
- [ ] `docs/explanation/features/<placeholder>.md` — per-feature explainer (C3); create one per major component
- ADRs live under `docs/explanation/adr/`

<!-- Observability section in feature-docs is domain-dependent.
     Default: HTML-commented (no production telemetry assumed).
     Override per domain in templates/manifest/<domain>.md. -->
