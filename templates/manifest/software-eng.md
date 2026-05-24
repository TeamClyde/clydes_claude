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
<!-- Architecture overview anchors cross-team comprehension. ADRs capture decisions. -->
- [ ] `docs/explanation/architecture.md` — system overview + key files
- ADRs live under `docs/explanation/adr/` (see ADR-0000 for the convention)
