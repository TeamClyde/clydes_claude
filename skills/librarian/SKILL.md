---
name: librarian
description: Use when the user wants deep, multi-source WEB research on a topic or on a source document's topics — produced by a regulated parallel fan-out that searches the web, cites sources, and adversarially verifies claims (not a single pass, not memory-only). Triggers on requests to research a topic from scratch, validate a brief's claims against live sources, or produce a cited research report across several sub-questions. Does NOT trigger on quick single-pass summaries or on pure analysis of a document's own content with no external research.
allowed-tools: Read, Bash, Workflow
---

# Librarian

> A locally-defined, regulated **web-research** fan-out built on the `dispatching-parallel-agents` front-door. This is the repo's rebuild of the `deep-research` pattern (the friction-#76 deadlock case) **on the regulation engine** — it is NOT Claude's system `deep-research` skill, and it is NOT a document analyzer.

## Overview

**REQUIRED BACKGROUND:** Use `dispatching-parallel-agents` before proceeding. The librarian is the engine's executable exemplar — a regulated, read-only **web-research** fan-out applying all five front-door rules. The engine lives in `scripts/lib/dispatch.mjs` (`parallelFanout`, `dimensionalReview`) and is inlined into `scripts/librarian.workflow.mjs` via the engine bundle (`scripts/build-engine-bundle.mjs`).

It fans out **one web-research agent per sub-question** (each searches the web and cites its sources), runs **one adversarial verify** over all collected findings, and synthesizes a **cited report**. It brings in *external* information — it does not merely re-analyze the seed.

The seed is either:
- A **research brief / question** typed or pasted in the chat, or
- A **local source document** whose topics you want researched from scratch (`.txt`, `.md`, `.docx`).

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

On Windows with non-ASCII characters (e.g. `→`), write the extracted text to a file with explicit `encoding='utf-8'` rather than shell-redirecting `print()` (cp1252 fails).

## When to Use

Use when the user asks for:
- Research on a topic — or on a document's topics — **from scratch, with citations**
- Validation of a brief's time-sensitive or factual claims against **live** sources
- A cited report synthesized across several genuinely independent sub-questions

**Do not use when:** a single-pass summary suffices; the user wants pure analysis of a document's OWN content with no external research (that's just a summary); or the work is mutating (this fan-out is read-only).

## How It Runs

1. **Seed** — user supplies a brief or points to a local file.
2. **Extract (if `.docx`)** — main-context runs the Python snippet above via Bash and captures the plain text.
3. **Derive sub-questions** — main-context turns the brief/seed into 4–~12 *independent* research sub-questions and agrees the list with the user. Default 4–6; cap at 20.
4. **Workflow tool** — invoke `scripts/librarian.workflow.mjs` via the Workflow tool (requires user opt-in), passing `{ brief, subQuestions, seedText? }` as `args`. One Sonnet-pinned agent per sub-question fans out via `parallelFanout` (`maxInFlight: 6`); each runs WebSearch/WebFetch and returns cited findings.
5. **Adversarial verify** — the workflow runs ONE `dimensionalReview` verify pass that re-checks each claim against its cited source and labels support (`supported` / `uncertain` / `unsupported`). Never per-finding voting.
6. **Synthesize** — a Sonnet agent produces the final cited report grouped by sub-question, with confidence, contradictions surfaced, and a "what this means for the build" section.
7. **Return** — `{ report, sources, subQuestionCount, findingCount, degraded, verifyDegraded }`. If `degraded: true` (fewer sub-questions than quorum succeeded) or `verifyDegraded: true` (the verify step was abandoned → findings are UNVERIFIED), surface it before presenting.

## Front-Door Rules Applied

Per `dispatching-parallel-agents` §Key Rules:

| Rule | This skill |
|---|---|
| Model pinning — never Opus | Research + verify + synthesis agents pinned to `claude-sonnet-4-6` (web research/reading is judgment-heavy; Haiku under-performs) |
| `maxInFlight ≤ min(16, cores−2)` | `maxInFlight = min(sub-questions, 8)` — one batch for the common case |
| `perUnitTimeoutMs` always set | 240 000 ms per research unit; 180 000 ms for verify |
| ONE batched verify | `dimensionalReview` with a single adversarial `verify` pass — no per-finding voting |
| Token budget gating | Pass `getRemainingBudget` if calling from inside a larger Workflow |

## Watchdog and Degraded-Mode Behavior

Each research unit has a 240 s watchdog. A timed-out unit is abandoned (non-preemptive — the agent runs to natural completion per #61405) and counted in `abandoned`. If `degraded: true` on return, present the partial report with a caveat. If `verifyDegraded: true`, the verify step was abandoned and the script falls back to the **unverified** findings — the report must say so. Do not retry silently.

## Gotchas

1. **Binary source not extracted first.** The Workflow sandbox cannot read files — for a `.docx`/binary source you **must extract the text in main-context** (Python stdlib `zipfile` + `xml.etree`) and pass it as `seedText`. Passing a file path yields an empty/failed run.

2. **Memory-only "research."** The research agents MUST search the web — the prompt enforces "do NOT answer from memory." If web tools are unreachable in the sandbox, findings will be thin/uncited; surface that rather than presenting model memory as research. (Confirm sandbox web access if in doubt — a one-agent WebSearch probe is enough.)

3. **Mistaking it for the system `deep-research` skill.** This is NOT Claude's built-in `deep-research`. It is the locally-defined regulated rebuild that runs `scripts/librarian.workflow.mjs` via the Workflow tool.

4. **Breaking a front-door rule.** Use ONE batched adversarial verify (never per-finding voting), pin agents to Sonnet (never Opus), and keep `maxInFlight ≤ min(16, cores−2)` (this workflow uses 6).

5. **`verifyDegraded` fallback.** On verify abandon, `dimensionalReview([], {verify})` returns an empty set; the script falls back to the unverified findings array, and the synthesis is told to mark claims UNVERIFIED. Do not silently present unverified findings as verified.

6. **Running without the user's Workflow-tool opt-in.** The run requires the user to explicitly opt into the Workflow tool — surface and confirm before invoking it.

## Related

- `dispatching-parallel-agents` — the regulated fan-out front-door (canonical reference)
- `scripts/lib/dispatch.mjs` — `parallelFanout`, `dimensionalReview`
- `scripts/librarian.workflow.mjs` — the Workflow-tool script (engine bundle inlined)
- `scripts/build-engine-bundle.mjs` — regenerates the inlined bundle
- `docs/explanation/orchestration-regulation-layer.md` §7 (the deep-research worked example this rebuilds) / §9 (build spec)
