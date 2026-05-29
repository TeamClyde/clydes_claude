# Doc Manifest — Python Utility

> Seeded for `domain: python-utility`. Edit freely as this project evolves.
> `/docs-status` compares actual files in this repo against the checklist below.
> Each section maps to a Diátaxis quadrant: Tutorials (learning), How-To (doing),
> Reference (information), Explanation (understanding).

## Tutorials
<!-- Most Python utilities benefit from a 5-minute "first invocation" walkthrough
     in the README itself. Separate tutorial file is optional. -->
- README has `## Usage` section with example invocations (primary tutorial surface)

## How-To
<!-- Recipe-style guides for common invocation patterns: filtering, piping,
     scripting against the utility. Useful when the tool has more than one mode. -->
- [ ] `docs/how-to/common-recipes.md` — only if utility has >1 invocation pattern

## Reference
<!-- argparse-generated --help is the canonical reference. /docs-status verifies
     --help exists and is non-trivial. No separate reference file required. -->
- argparse `--help` text (verified by `/docs-status`, no separate file needed)
- [ ] `docs/reference/exit-codes.md` — only if utility has non-trivial exit codes

## Explanation
<!-- Hybrid C1+C2+C3 layout per rules/doc-tools.md.
     Python-utility repos seed Observability as HTML comment in feature-docs (solo utility, no production telemetry). -->
- [ ] `docs/explanation/architecture.md` — repo-level system overview (C1 + C2)
- [ ] `docs/explanation/features/<placeholder>.md` — per-feature explainer (C3); create one per major component
- ADRs live under `docs/explanation/adr/`
