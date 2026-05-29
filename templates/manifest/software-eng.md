# Doc Manifest — Software Engineering

> Seeded for `domain: software-eng`. Edit freely as this project evolves.
> `/docs-status` compares actual files in this repo against the checklist below.
> Each section maps to a Diátaxis quadrant: Tutorials (learning), How-To (doing),
> Reference (information), Explanation (understanding).

## Tutorials
<!-- Software-eng repos benefit from a "getting started" tutorial that walks a
     new contributor through cloning, building, running, and seeing first output. -->
- [ ] `docs/tutorials/getting-started.md` — clone-to-first-output walkthrough

## How-To
<!-- Runbooks for the highest-friction recurring tasks: deploy, rollback, debug. -->
- [ ] `docs/how-to/deploy.md`
- [ ] `docs/how-to/rollback.md`
- [ ] `docs/how-to/troubleshooting.md`

## Reference
<!-- API surface documentation. OpenAPI is canonical for HTTP services;
     api-reference.md is the human-readable companion. -->
- [ ] `openapi.yaml` — if this is an HTTP service
- [ ] `docs/reference/api-reference.md` — human-readable companion to OpenAPI

## Explanation
<!-- Hybrid C1+C2+C3 layout per rules/doc-tools.md.
     Software-eng repos seed Observability uncommented in feature-docs (production-style). -->
- [ ] `docs/explanation/architecture.md` — repo-level system overview (C1 + C2)
- [ ] `docs/explanation/features/<placeholder>.md` — per-feature explainer (C3); create one per major component
- ADRs live under `docs/explanation/adr/`
