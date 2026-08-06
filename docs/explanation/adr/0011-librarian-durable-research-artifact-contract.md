# ADR-0011: The librarian's output is a durable research artifact, not a returned report

## Status

Accepted (2026-08-06, librarian trust-contract slice).

## Related

Parent: docs/explanation/features/agents-and-skills.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

The `librarian` workflow originally ended the way most fan-out skills end: it synthesized a report
string and returned it to main context, which presented it to the user. A single run then burned
~1.1M tokens and returned an **empty report** — while **78 findings, with their citations intact**,
sat recoverable in the run's JSONL transcripts.

The distinction that failure exposes is the one this ADR is about. The research did not fail. The
sources were reached, the claims were extracted, the URLs were captured; the shelf references
survived the whole run. What failed was the pipeline's ability to **hand them over**. A returned
string is a single point of loss for work whose entire value is a set of durable pointers: the
moment the conversation moves on, an unwritten report is gone, and nothing in the process notices,
because a run that returns an empty string still returns *successfully*.

Two further constraints shape the fix:

- **The Workflow sandbox has no filesystem.** `scripts/librarian.workflow.mjs` cannot write
  anything. Whatever contract is chosen, computation and persistence are separated by the sandbox
  boundary, not by preference.
- **Prose written by an agent cannot be trusted to carry provenance.** A section writer asked to
  cite its sources in prose can paraphrase a URL, invent a support label, or omit a flag — and
  nothing downstream can tell. Provenance rendered by an agent is provenance that can silently
  disagree with the data it claims to describe.

## Decision

The librarian's output is an **append-only, machine-readable artifact pair** with
**mechanically-rendered provenance** — not a returned report string.

1. **The artifact pair.** Every run produces `research/<slug>/dossier.md` (narrative, append-only)
   and `research/<slug>/findings.json` (the complete structured payload, rewritten wholesale).
   `dossier.md` is history and is never edited; `findings.json` is data. That split is what lets
   supersession be recorded **mechanically** — a superseded finding is *stamped* with the run that
   replaced it and why, never deleted — so a later session following a stale pointer still sees
   what happened to it.

2. **The workflow computes; the skill persists.** The workflow returns `dossierEntry`,
   `dossierHeader` (first run only), and `findingsDoc`. Main context writes exactly what it
   received, verbatim — it does not reformat, retype, or summarize. This is forced by the sandbox,
   and making it explicit is what turns "the model forgot to write the files" into a checkable step
   rather than an invisible loss.

3. **Provenance is a projection, never prose.** The `#### Evidence` table in each dossier entry is
   rendered **by code** from the findings array. An agent never types a URL, a support label, or a
   flag; section writers are instructed to write explanation only. This is the mechanism that makes
   the two files structurally unable to disagree, and it extends to every tabular gap the entry
   reports — unanswered sub-questions, sections whose write-up failed, claims that failed the
   traceability audit are all rendered from the same arrays the reader is being shown.

4. **One shape on every exit.** All exits — the coverage gate, the evidence floor, and the success
   path — return the same keys, with `stoppedAt` and a `null` `dossierEntry` on a stopped run. A
   caller reads one shape instead of branching on which gate stopped it, and a stopped run writes
   nothing at all.

5. **Trust state is derived, not asserted.** A run reports an `evidenceState` — `verified`,
   `unverified`, `no-results`, `web-unavailable`, `research-incomplete` — computed entirely from
   data the pipeline already holds. The enum is *cause-bearing* and its order is load-bearing: the
   most upstream cause wins, so a run with no reachable web reports `web-unavailable` rather than
   the `research-incomplete` its empty findings would otherwise imply.

The consequence this contract asserts, and which the rest of the design follows from: **source
pointers are the payload and prose is the index to them.** `sources: []` therefore does not degrade
a report — it voids it.

## Alternatives Considered

- **Return the synthesized report string (status quo)** — rejected: this *is* the failure. The
  value of a research run is a set of durable pointers, and a string is a single point of loss for
  them. A run can return empty and still report success.
- **Have the workflow write the files itself** — not available: the Workflow sandbox has no
  filesystem. The compute/persist split is a constraint, not a design preference.
- **One combined file** — rejected: an append-only narrative cannot record supersession without
  editing a prior entry, which is exactly what append-only forbids. Separating immutable history
  (`dossier.md`) from rewritable data (`findings.json`) is what makes mechanical supersession
  possible.
- **Publish the report as an Artifact** — rejected as the *storage* mechanism: an Artifact is read
  back via `WebFetch` and is not greppable. It is a presentation format, not a data format.
  Publishing remains available on explicit request, layered on top of the durable artifacts.
- **Let section writers cite their own sources in prose** — rejected: it reintroduces the
  possibility that the narrative and the data disagree, with no mechanism able to detect it. Code
  rendering the evidence table removes the possibility rather than policing it.

## Consequences

- **Gained:** research output survives the conversation that produced it; supersession is recorded
  mechanically without editing history; the narrative and the data cannot disagree, because one is
  generated from the other; a caller reads one result shape regardless of which gate stopped the
  run; the trust state of a run is derivable rather than asserted.
- **Gave up:** a two-step handover (workflow returns → main context writes) that main context can
  still skip — the failure is now *visible* rather than *impossible*, and the `librarian` skill
  carries it as an explicit gotcha. Callers must write files rather than simply presenting a
  string, and `research/<slug>/` accumulates on disk indefinitely by design (nothing is deleted).
- **Follow-up:** the append-only guarantee means a wrong topic merge is unrecoverable by a later
  run, so the skill defaults to a **new** slug and appends only when the user explicitly asks. That
  default is the mitigation; there is no repair path.
