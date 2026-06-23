---
name: librarian
description: Use when the user wants a thorough, multi-aspect analysis or research synthesis of a brief or a source document — a prose description, a local file, or a .docx — produced by a regulated parallel fan-out (not a single pass). Triggers on requests for multi-aspect research, structured source document analysis, regulated fan-out synthesis, or parallel analysis across multiple lenses. Does NOT trigger on quick single-pass summaries or when a single agent pass is sufficient.
allowed-tools: Read, Bash, Agent
---

# Librarian

> This is NOT Claude's system `deep-research` skill — it is a locally-defined, regulated fan-out exemplar built on the `dispatching-parallel-agents` front-door.

## Overview

**REQUIRED BACKGROUND:** Use `dispatching-parallel-agents` before proceeding. The librarian is its executable exemplar — a regulated, read-only multi-source research/analysis fan-out that applies all five front-door rules. The engine lives in `scripts/lib/dispatch.mjs` (`parallelFanout`, `dimensionalReview`) and is inlined into `scripts/librarian.workflow.mjs` via the engine bundle (see `scripts/build-engine-bundle.mjs`).

The seed is either:
- A **prose brief** typed or pasted in the chat, or
- A **local source document** (`.txt`, `.md`, `.docx`, etc.)

For binary documents (`.docx`), main-context **must extract text before invoking the Workflow tool** — the Workflow sandbox cannot read files. Use Python stdlib (`zipfile` + `xml.etree.ElementTree`) over `word/document.xml`:

```bash
python3 - <<'PY'
import zipfile, xml.etree.ElementTree as ET, sys
path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    tree = ET.fromstring(z.read('word/document.xml'))
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
print(' '.join(n.text for n in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if n.text))
PY
```

## When to Use

Use when the user asks for:
- A multi-aspect breakdown of a document or brief
- Structured synthesis across several analytical lenses (e.g., risks + opportunities + implementation + comparison)
- Parallel analysis where each aspect is genuinely independent
- A cited report from a single source, not a web crawl

**Do not use when:** a single-pass summary suffices, or when the `deep-research` skill covers the use case (web fan-out + adversarial verify).

## How It Runs

1. **Seed** — user supplies a prose brief or points to a local file.
2. **Extract (if `.docx`)** — main-context runs the Python snippet above via Bash and captures the plain-text output as `seedText`.
3. **Define aspects** — agree with the user on the aspect list (e.g., `["risks", "opportunities", "implementation", "comparison"]`). Default to 4–6 aspects; cap at 20.
4. **Workflow tool** — invoke `scripts/librarian.workflow.mjs` via the Workflow tool (requires user opt-in), passing `{ seedText, aspects }` as `args`. The script fans out one Haiku-pinned agent per aspect via `parallelFanout` (`maxInFlight: 6`).
5. **Batched verify** — the workflow runs ONE `dimensionalReview` verify pass over all collected findings (never per-finding voting).
6. **Synthesize** — a Sonnet agent produces the final cited report grouped by aspect, with risks and recommendations surfaced.
7. **Return** — the workflow returns `{ report, aspectCount, findingCount, degraded, verifyDegraded }`. If `degraded: true` (analysis) or `verifyDegraded: true` (verify step), surface it to the user before presenting findings.

## Front-Door Rules Applied

Per `dispatching-parallel-agents` §Key Rules:

| Rule | This skill |
|---|---|
| Model pinning — never Opus | Leaf agents pinned to `claude-haiku-4-5-20251001`; synthesizer uses `claude-sonnet-4-6` |
| `maxInFlight ≤ min(16, cores−2)` | Workflow uses `maxInFlight: 6` |
| `perUnitTimeoutMs` always set | 120 000 ms per aspect; 90 000 ms for verify |
| ONE batched verify | `dimensionalReview` with a single `verify` pass — no per-finding voting |
| Token budget gating | Pass `getRemainingBudget` if calling from inside a larger Workflow |

## Watchdog and Degraded-Mode Behavior

Each aspect unit has a 120 s watchdog. A timed-out unit is abandoned (non-preemptive — the agent runs to natural completion per #61405) and counted in `abandoned`. If `degraded: true` on return, log it and present the partial report with a caveat. Do not retry silently.

## Gotchas

1. **Binary source not extracted first.** The Workflow sandbox cannot read files — for a `.docx` or binary source you **must extract the text in main-context** (Python stdlib `zipfile` + `xml.etree`) and pass it as `seedText` in `args`. Passing a file path yields an empty/failed analysis. On Windows with non-ASCII characters like `→`, write the extracted text to the output file with explicit `encoding='utf-8'` — redirecting `print()` fails on non-cp1252 chars.

2. **Mistaking it for the system `deep-research` skill.** This is NOT Claude's built-in `deep-research`. It is a locally-defined, regulated fan-out exemplar that runs `scripts/librarian.workflow.mjs` via the Workflow tool.

3. **Breaking a front-door rule.** Do not use per-finding voting (use ONE batched verify), do not unpin leaf agents to Opus (pin Haiku; synthesis Sonnet), and keep `maxInFlight ≤ min(16, cores−2)` (this workflow uses 6).

4. **Removing the per-aspect watchdog.** Each aspect unit carries a bounded `perUnitTimeoutMs` so a hung agent is abandoned and proceeded. Removing it reintroduces deadlock risk.

5. **Running without the user's Workflow-tool opt-in.** The smoke or real run requires the user to explicitly opt into the Workflow tool — surface and confirm before invoking it.

## Related

- `dispatching-parallel-agents` — the regulated fan-out front-door (canonical reference)
- `scripts/lib/dispatch.mjs` — `parallelFanout`, `dimensionalReview`
- `scripts/librarian.workflow.mjs` — the Workflow-tool script (engine bundle inlined)
- `scripts/build-engine-bundle.mjs` — regenerates the inlined bundle
- `docs/explanation/orchestration-regulation-layer.md` §5 / §9 — design rationale
