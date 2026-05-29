---
**Feature:** <Feature Name>
**C4 Layer:** C3 Component
**Status:** Draft | Active | Deprecated
**Owner:** @username (or team / "solo")
**Last updated:** YYYY-MM-DD
**Related plans:** plans/<slug>/ (...)
**Related ADRs:**
  - [ADR-NNNN](../adr/NNNN-<slug>.md) — <one-line> (Accepted)
**Key files:**
  - `src/<path>/<entry>.py` — entry point
  - `src/<path>/<core>.py` — main logic
  - `tests/test_<feature>.py` — test examples
---

# <Feature Name>

## Context & Scope
What this feature does, who uses it, what it bounds. What it explicitly does NOT do.

## Building Block View
Key modules / classes / files. Inline Mermaid component diagram if useful.

## Runtime View
Key flows. Sequence diagram or numbered step list.

## Dependencies
- External services (e.g., AWS SES, Cognito) and what they're used for
- Internal features/modules this depends on
- Version constraints worth calling out

## Decisions
Backlinks to ADRs that govern this feature (status inline).
- [ADR-NNNN](../adr/NNNN-<slug>.md) — <one-line> (Accepted)

## Known Issues & Gotchas
- Known bugs (with ticket links)
- Performance edges, edge cases
- Race conditions / concurrency concerns
- Common mistakes when modifying this feature

## Observability
- **Logs:** what to grep for, log levels
- **Metrics:** Prometheus metric names, dashboards
- **Traces:** span names, distributed tracing
- **Health check:** endpoint or command to verify

## Glossary
Domain terms specific to this feature.
