---
name: librarian
description: Use when the user wants deep, multi-source WEB research on a topic or on a source document's topics — produced by a regulated parallel fan-out that searches the web, cites sources, and adversarially verifies claims (not a single pass, not memory-only). Triggers on requests to research a topic from scratch, validate a brief's claims against live sources, or produce a cited research report across several sub-questions. Does NOT trigger on quick single-pass summaries or on pure analysis of a document's own content with no external research. For non-research fan-out, use `dispatching-parallel-agents`.
allowed-tools: Read, Bash, Workflow
---

# Librarian

> A locally-defined, regulated **web-research** fan-out built on the `dispatching-parallel-agents` front-door. This is the repo's rebuild of the `deep-research` pattern (the friction-#76 deadlock case) **on the regulation engine** — it is NOT Claude's system `deep-research` skill, and it is NOT a document analyzer.

## Overview

**REQUIRED BACKGROUND:** Use `dispatching-parallel-agents` before proceeding. The librarian is the engine's executable exemplar — a regulated, read-only **web-research** fan-out applying all five front-door rules. The engine lives in `scripts/lib/dispatch.mjs` (`parallelFanout`) and `scripts/lib/verify.mjs` (`tieredVerify`), with the librarian's own pure helpers in `scripts/lib/librarian-core.mjs`; all three are inlined into the built bundle `scripts/librarian.workflow.mjs` via `scripts/build-engine-bundle.mjs`. That bundle is the **source** (in the workflow repo); the **runtime** copy the skill invokes is co-located in this skill directory as `librarian.workflow.mjs` (a symlink to the source bundle), so the skill runs from any repo.

It fans out **one web-research agent per sub-question** (each searches the web and cites its sources), runs **one adversarial verify** over all collected findings, and produces a **durable, cited research dossier** on disk — an append-only `dossier.md` plus a machine-readable `findings.json`. It brings in *external* information — it does not merely re-analyze the seed.

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
3. **Derive sub-questions, then STOP and confirm.** Turn the brief/seed into 4–~12 *independent*
   research sub-questions. Default 4–6; cap at 20.

   **This is a hard gate, not a courtesy.** Present the numbered list and obtain explicit
   go-ahead — via `AskUserQuestion` or a plain confirm — BEFORE invoking the Workflow tool. Do not
   derive and fire in the same turn.

   Each sub-question costs roughly 9 agents: a research unit, a share of triage, its own re-check
   cluster, consensus frames, a section writer, and at least one audit. Adding one after launch is
   not a small edit — and it cannot be applied to a run already in flight (see Gotcha 11).
4. **Prepare the run.** Derive a kebab-case `<slug>` from the brief → `research/<slug>/`.
   **A new topic is the default.** Append to an existing topic ONLY when the user explicitly asks
   to expand prior research, or names an existing slug — never infer a match. A wrong merge
   corrupts an append-only history that cannot be edited afterwards.
   - If appending: `Read research/<slug>/findings.json` and pass it as `args.priorFindings`.
   - Compute `args.now` (ISO date, e.g. `2026-08-05`) and `args.cap` = `min(16, cores − 2)`.
     The sandbox cannot compute either: `Date.now()` throws, and `os.cpus()` is unavailable.
5. **Workflow tool** — invoke the script via the Workflow tool (requires user opt-in), passing
   `{ brief, subQuestions, now, cap, maxSearchesPerLeaf?, leafModel?, priorFindings?, seedText? }`
   as `args`. Set `scriptPath` to an
   **absolute** path: the *Base directory for this skill* joined with `librarian.workflow.mjs`.
   Never a cwd-relative `scripts/...` path — that resolves only inside the workflow repo.

   > `maxSearchesPerLeaf` defaults to `6` in the script. Raise it only for an unusually broad topic.
   > Unbounded searching is the run's single largest cost — measured at ~116 tokens of re-read
   > context per token of output, and 73% of a whole run's cache reads from 16% of its agents.
   >
   > `harvestPerLeaf` defaults to `4` — the hard cap on pages read per sub-question, and the control
   > that keeps the research phase inside its token budget. Raising it is a budget decision, not a
   > tuning knob: each extra harvest agent costs a fixed ~8 K floor regardless of how little it finds.
   >
   > `roundsBudget` defaults to `3` — how many sub-questions across the WHOLE run may get a second
   > research round. Round 2 fires only on reported gaps, is spent neediest-first, harvests 2 pages
   > rather than 4, and stops early if its search returns >80% of round 1's sources. The budget is
   > run-wide because per-unit capping alone would let a second round fire on every sub-question.

   The research phase runs three tool-restricted agent types per sub-question — `web-search`
   (WebSearch only, ranks URLs and cannot fetch), `page-harvest` (WebFetch only, one page each,
   returns verbatim spans and cannot search), and `synthesize` (no web tool at all, reads only the
   quote bundles). The toolset is the guardrail, not the prompt: an agent with no fetch tool cannot
   fetch, and an agent that cannot reach the web cannot add an unsourced claim.
6. **Adversarial verify + synthesis** happen inside the workflow. Section writers produce prose
   only; every URL, support label, and flag is rendered by CODE from the findings.
7. **Write the artifacts.** The workflow writes nothing — the sandbox has no filesystem. Write
   exactly what it returned; do not reformat, retype, or summarize any of it.
   - If `dossierHeader` is non-null (a first run), write it to `research/<slug>/dossier.md` first,
     then append `dossierEntry`. If it is null, **append `dossierEntry` only** — never edit a prior
     entry, and never rewrite the header.
   - Write `JSON.stringify(findingsDoc, null, 2)` to `research/<slug>/findings.json`, wholesale.
8. **Report before presenting.** Surface the paths written, plus any of:

| Signal | Meaning |
|---|---|
| `stoppedAt: 'coverage-gate'` | Too little of the brief was answered to be worth verifying. No dossier entry. See `coverage.missing`. |
| `stoppedAt: 'evidence-floor'` | Verify left zero surviving findings. No dossier entry. |
| `evidenceState` | `verified` · `unverified` · `no-results` · `web-unavailable` · `research-incomplete` — see the table below. |
| `coverage.missing` | Sub-questions the run does not answer. Always name them. |
| `missingSections` | Sub-questions whose research SUCCEEDED but whose write-up was abandoned. Distinct from `coverage.missing` — the evidence exists, the prose does not. |
| `integrity` (non-empty) | Claims that failed the traceability audit after repair. The section was KEPT and flagged. |
| `verify.degraded` | Verify did not run; findings are raw and unchecked. |
| `verify.partial` | Verify ran and was used, but some clusters or voter frames were lost. Do not read a thinned verify as a clean one. |
| `verify.degradedAtTier` | Which tier fell back, when one did. |
| `fanoutDegraded` | The research fan-out fell below quorum. Distinct from `coverage` — it counts units that RETURNED, not sub-questions ANSWERED. |
| `findings[].reframe` | The sub-question had no grounded finding, so a diagnose-then-shift reframe ran. `improved: false` means the reframe fired and did **not** find better evidence — report that plainly; it is a real result, not a gap. |

### `evidenceState`

| State | What to tell the user |
|---|---|
| `verified` | Trust the labels in the evidence tables. |
| `unverified` | Findings are raw; treat every claim as unchecked. |
| `no-results` | The web was reachable; the questions found nothing. |
| `web-unavailable` | Zero resolvable source URLs across EVERY sub-question — almost certainly an outage, not eight independent fruitless searches. **Re-run rather than concluding anything.** |
| `research-incomplete` | Partial brief; see `coverage.missing`. |

**Publishing an Artifact is only on explicit request, never the storage mechanism.** Artifacts are
read back via `WebFetch` and are not greppable — a presentation format, not a data format.

## Front-Door Rules Applied

Per `dispatching-parallel-agents` §Key Rules:

| Rule | This skill |
|---|---|
| Model pinning — never Opus | Research + verify + synthesis agents pinned to `claude-sonnet-4-6` (web research/reading is judgment-heavy; Haiku under-performs) |
| `maxInFlight ≤ min(16, cores−2)` | `maxInFlight = min(sub-questions, args.cap)` where main context passes `cap = min(16, cores − 2)` |
| `perUnitTimeoutMs` always set | 900 000 ms per research unit; 900 000 ms per verify tier; 600 000 ms per section writer |
| ONE batched verify | `tieredVerify` — a batched triage, then escalation of only the contested tail. No per-finding voting. |
| Token budget gating | Pass `getRemainingBudget` if calling from inside a larger Workflow |

## Watchdog and Degraded-Mode Behavior

Each research unit has a 900 s watchdog, as does each verify tier. A timed-out unit is abandoned (non-preemptive — the agent runs to natural completion) and counted in `abandoned`. Because abandonment is non-preemptive, a budget below the measured workload is not a saving: the agent is still paid for in full and only its result is discarded.

If `fanoutDegraded: true` on return, the research fan-out fell below quorum — present the entry with a caveat. If `verify.degraded: true`, the verify step was abandoned and the script falls back to the **unverified** findings — say so. Do not retry silently. Whether the brief was actually answered is a separate question, read from `coverage` and `evidenceState`, never from `fanoutDegraded`.

**Verify degrades per unit, not per run.** A single re-check cluster or voter frame that fails is contained: that cluster falls back to keeping its own members, that chunk is marked contested, and the rest of the verify still stands. The run reports `verify.partial: true` with the coverage fractions (`verify.triageCoverage` / `verify.recheckCoverage` / `verify.consensusCoverage`) rather than discarding the whole pass. Report `verify.partial` — a verify that was quietly thinned is exactly the case a reader would otherwise mistake for a clean one. `verify.degradedAtTier` names which tier fell back, and is `null` on a clean run.

**A stopped run writes nothing.** If the coverage gate or the evidence floor halts the run, the return carries `stoppedAt` and a `null` `dossierEntry` — do not create `research/<slug>/` at all in that case. Every exit returns the same keys, so read the result without branching on which gate stopped it.

## Gotchas

1. **Binary source not extracted first.** The Workflow sandbox cannot read files — for a `.docx`/binary source you **must extract the text in main-context** (Python stdlib `zipfile` + `xml.etree`) and pass it as `seedText`. Passing a file path yields an empty/failed run.

2. **Memory-only "research."** The research agents MUST search the web — the prompt enforces "do NOT answer from memory." If web tools are unreachable in the sandbox, findings will be thin/uncited; surface that rather than presenting model memory as research. (Confirm sandbox web access if in doubt — a one-agent WebSearch probe is enough.)

3. **Mistaking it for the system `deep-research` skill.** This is NOT Claude's built-in `deep-research`. It is the locally-defined regulated rebuild that runs `scripts/librarian.workflow.mjs` via the Workflow tool.

4. **Breaking a front-door rule.** Use ONE batched adversarial verify (never per-finding voting), pin agents to Sonnet (never Opus), and keep `maxInFlight ≤ min(16, cores−2)` (this workflow uses `args.cap`).

5. **`verify.degraded` fallback.** On verify abandon, `tieredVerify` returns `degraded: true`; the script falls back to the unverified findings array, and the synthesis is told to mark claims UNVERIFIED. Do not silently present unverified findings as verified.

6. **Running without the user's Workflow-tool opt-in.** The run requires the user to explicitly opt into the Workflow tool — surface and confirm before invoking it.

7. **"The scripts don't exist."** The `.mjs` files are NOT copied into the installed skill directory — the source bundle lives in the workflow repo's `scripts/`, and the skill directory carries a co-located symlink `librarian.workflow.mjs` pointing at it. Invoke it by the **absolute** skill-base-dir path (see How It Runs step 5), never a cwd-relative `scripts/...` path. A cwd-relative path resolves only when your cwd is the workflow repo — from any other repo it fails and looks like a missing script.

8. **Forgetting to write the artifacts.** The workflow returns `dossierEntry` and `findingsDoc` but writes nothing — the sandbox has no filesystem. If main context does not perform step 7, the run's entire output is lost the moment the conversation moves on. This is the #96 failure in a new place: work that was paid for and never handed over.

9. **Appending to the wrong topic.** `dossier.md` is append-only and cannot be edited afterwards, so a wrong merge is not recoverable by a later run. Default to a NEW slug unless the user explicitly asked to extend an existing one.

10. **Reading `coverage.missing` as the whole gap.** It lists sub-questions with no findings. A sub-question whose research succeeded but whose section writer was abandoned appears in `missingSections` instead, and the dossier names it under `### Sections not written`. Report both.

11. **`resumeFromRunId` does not recover in-flight work.** The resume cache keys on completed
    `result` lines in `journal.jsonl`. An agent killed mid-flight never writes one, so killing a run
    to change its args abandons every agent currently running and re-runs them from scratch — the
    abandoned agents are still paid for in full. It is a script-editing tool, not a
    mid-flight-edit tool. If the sub-question list needs to change while a run is in flight, **let
    the run finish and append a second pass to the same slug** (step 4, `priorFindings`) — appending
    is supported and costs nothing extra. Never kill-and-relaunch to edit args.

## Related

- `dispatching-parallel-agents` — the regulated fan-out front-door (canonical reference)
- `scripts/lib/dispatch.mjs` — `parallelFanout`; `scripts/lib/verify.mjs` — `tieredVerify`
- `scripts/lib/librarian-core.mjs` — coverage, evidence state, and the dossier / `findings.json` renderers
- `scripts/librarian.workflow.mjs` — the source Workflow-tool bundle (engine inlined); the skill invokes it through the co-located symlink `skills/librarian/librarian.workflow.mjs`
- `scripts/build-engine-bundle.mjs` — regenerates the inlined bundle (writes to the source in `scripts/`; the co-located symlink tracks it automatically)
- `docs/explanation/orchestration-regulation-layer.md` §7 (the deep-research worked example this rebuilds) / §9 (build spec)
