# Librarian Token-Efficiency Retrospective — 2026-08-14

**Status:** Findings + prescriptions. Nothing here has been implemented.
**Audience:** A fresh Claude session in `claude-workflow-improvements` with no context on the run
that produced this. Everything needed to act is in this document.

---

## 0. TL;DR — the four numbers that matter

| Measure | Value |
|---|---|
| Agents spawned for **one** research run | **91** |
| Wall-clock | **49 minutes** |
| Billed-ish tokens (fresh input + cache writes + output) | **~7.96 M** |
| Cache reads (billed at ~10%) | **35.6 M** |
| **Useful output tokens produced** | **452 K** |

The run was *correct* — 9/9 sub-questions answered, `evidenceState: verified`, verify neither
degraded nor partial. It was **not efficient**. The dominant cost is not thinking; it is the same
web-page text being re-sent through model context dozens of times.

**The single highest-leverage fix is one line in `skills/librarian/SKILL.md`:** the workflow already
accepts a `maxSearchesPerLeaf` input that caps per-agent searching, and main context never passes
it because the skill's documented arg list omits it. See §4.1.

---

## 1. What produced this data

A `/librarian` run in a different repo (an Amazon-seller analytics project). Nothing about the
subject matter is load-bearing here; only the shape of the fan-out is.

- **Brief:** one research topic, technical audience, explicit scope exclusions.
- **Sub-questions:** 9.
- **Invocation:** `Workflow({scriptPath: '<skill-dir>/librarian.workflow.mjs', args: {brief, subQuestions, now, cap: 14}})`
- **Run ID:** `wf_cd105af0-fab`
- **Result:** clean. `coverage 9/9`, `evidenceState: verified`,
  `verify: {degraded: false, partial: false, triageCoverage: 1, recheckCoverage: 1, consensusCoverage: 1}`,
  `missingSections: []`, 75 findings, 31 integrity flags.

**Raw data location** (this machine, may be garbage-collected):
`C:\Users\jason\.claude\projects\c--Users-jason-repos-amazon-improvements\1f9a6447-02d1-4074-a225-b5457060cd78\subagents\workflows\wf_cd105af0-fab\`
containing `journal.jsonl` (91 `started` / 85 `result` lines) and 91 `agent-<id>.jsonl` transcripts
carrying per-turn `usage` blocks. The measurement script is reproduced in §6 so these numbers can be
regenerated against any future run.

---

## 2. Measured cost by phase

Classification is by the first user-message prompt in each agent transcript.

| Phase | Agents | Fresh in | Cache write | **Cache read** | Output | Turns | Tool calls |
|---|---:|---:|---:|---:|---:|---:|---:|
| research | 16 | 105,624 | 1,809,269 | **24,245,780** | 97,078 | 535 | 466 |
| verify:recheck | 10 | 7,246 | 1,236,929 | **5,668,323** | 48,685 | 167 | 126 |
| verify:consensus | 9 | 1,708 | 993,983 | **4,358,746** | 70,625 | 114 | 81 |
| integrity-audit | 40 | 238 | 2,294,960 | 1,101,820 | 189,034 | 80 | 26 |
| section-writer | 12 | 72 | 725,266 | 228,316 | 29,799 | 24 | 0 |
| verify:triage | 4 | 24 | 334,928 | 0 | 16,434 | 8 | 4 |
| **TOTAL** | **91** | **114,912** | **7,395,335** | **35,602,985** | **451,655** | **928** | **703** |

Per-agent averages for the research phase — this is the whole story:

| Research agent, averaged | Value |
|---|---:|
| Turns | 33 (median 30, max **63**) |
| Tool calls (WebSearch + WebFetch) | 29 |
| Cache read | **1,515,361** |
| Output produced | 6,067 |
| **Context re-read per token of output** | **≈ 250 : 1** |

---

## 3. Findings, ranked by recoverable tokens

### F1 — Research agents run unbounded turn counts; context re-read grows quadratically
**Cost: ~24.2 M cache read (68% of all cache reads).**

Each research agent does its own WebSearch → WebFetch loop. Every fetched page stays in that agent's
context for all remaining turns, so an agent on turn 40 re-reads the accumulated text of the previous
39 turns. Cost scales as O(turns²) in page size, not O(turns). One agent hit 63 turns and 3.72 M
cache read on its own.

The bundle *already has the control for this*. `scripts/librarian.workflow.mjs:1291`:

```js
(maxSearchesPerLeaf != null ? `Search budget: perform at most ${maxSearchesPerLeaf} WebSearch calls, then synthesize from what you have found.\n` : '')
```

It is destructured from `input` at `:1251` and threaded into both the research and re-research
prompts (`:1291`, `:1462`). **It was `undefined` for this entire run**, because
`skills/librarian/SKILL.md` step 5 documents the args as
`{ brief, subQuestions, now, cap, priorFindings?, seedText? }` — `maxSearchesPerLeaf` and `leafModel`
are not listed, so the orchestrator has no reason to pass them.

This is a documentation gap, not a code gap. Fixing it costs one line.

### F2 — Verify re-fetches sources that research already fetched
**Cost: ~10.0 M cache read across recheck + consensus, and 207 redundant tool calls.**

`verify:recheck` made 126 tool calls over 167 turns; `verify:consensus` made 81. The recheck comment
at `:1340` states the cost driver plainly: *"recheck cost is driven by RE-READING each cited source."*
The research agent already read that page. Its text was discarded, so verify pays full price to fetch
it again — and then re-reads it across its own multi-turn context (median 18 turns for recheck).

### F3 — The traceability auditor is 44% of the agent fleet
**Cost: 40 agents, ~2.29 M cache write.**

The L2 audit at `:1699` runs inside `validate`, once per section attempt
(`SECTION_VALIDATION_RETRIES = 2`, so ≤3 per section). With 9 sections the ceiling should be 27, but
**40 audit-classified agents were observed against only 12 section-writer agents** — a 3.3:1 ratio
that the "one audit per attempt" reading does not explain.

⚠️ **Do not act on a presumed cause.** Either the classifier in §6 is sweeping other Synthesize-phase
agents into this bucket, or audits are being dispatched more often than once per validate call.
Confirm which before changing anything — count agents whose `label` starts with `audit:` directly
rather than trusting prompt-text classification.

Separately: 2 of the 9 sections timed out at `AUDIT_TIMEOUT_MS = 180_000` and were published
unaudited (`reason: "traceability audit did not complete (timeout)"`). Those sections paid the full
audit cost and got no audit. The fail-open behaviour is correct; the timeout may be too tight for
long sections.

### F4 — Killing a run mid-flight and resuming wastes everything in flight
**Cost this run: ~735 K billed tokens, 6 abandoned agents.**

Mid-run, the user added 3 sub-questions. Two options were presented: **(A)** let the 6-question run
finish and append a second pass, or **(B)** kill and relaunch with 9. B was chosen on the assumption
that `resumeFromRunId` would replay the first 6 research agents from cache.

**It did not.** `journal.jsonl` records 91 `started` and 85 `result` lines. The 6 missing IDs are all
research agents from the killed run:

```
a166a02462e40b04c  ~120,996 tok   a0ade49ba6b95b369  ~141,139 tok
aad299f02a4c45375  ~112,481 tok   a58216db87cf03e0a  ~114,089 tok
a5f842ec68c1725bb  ~129,036 tok   a81737a62560056c7  ~117,389 tok
```

The resume cache keys on **completed results** written to the journal. An agent killed in flight
never writes a `result` line, so it is not cacheable — it is simply paid for and discarded. All 9
research agents ran fresh on the relaunch.

**Rule: `resumeFromRunId` recovers work only from a run that finished (or from agents that had
individually completed before the stop). It is a script-editing tool, not a mid-flight-edit tool.**
This is not documented anywhere in `SKILL.md`, and the Workflow tool's own description
("completed agent() calls with unchanged (prompt, opts) return their cached results") is easy to
read as a stronger promise than it is.

### F5 — Sub-question count drives the whole fleet superlinearly
9 sub-questions produced 91 agents. Each one costs a research agent, a share of triage, its own
recheck cluster, consensus frames, a section writer, and ≥1 audit. Adding a 10th sub-question is not
+1 agent; it is roughly +9.

This makes the §7 confirmation gate an efficiency control, not just a UX nicety.

---

## 4. Prescriptions

Ordered by tokens saved per unit of effort. Each is independently shippable.

### 4.1 — Document and default `maxSearchesPerLeaf` ★ do this first
**Est. saving: 40–60% of research-phase cache reads (~10–15 M).**

1. In `skills/librarian/SKILL.md` step 5, change the documented args from
   `{ brief, subQuestions, now, cap, priorFindings?, seedText? }` to
   `{ brief, subQuestions, now, cap, maxSearchesPerLeaf?, leafModel?, priorFindings?, seedText? }`
   and add: *"Pass `maxSearchesPerLeaf: 6` unless the topic is unusually broad. Unbounded searching
   is the run's single largest cost — measured at 250 tokens of re-read context per token of
   output."*
2. Consider a default in the script instead of relying on the caller:
   `scripts/librarian.workflow.mjs:1251` → `maxSearchesPerLeaf = 6` as a destructuring default.
   A default is more robust than an instruction, since prose in SKILL.md is skippable under momentum
   (the same failure mode as §7).

**Verify:** re-run a 4-sub-question brief with and without the cap; compare
`sum(cache_read_input_tokens)` for `research:*` agents using §6.

### 4.2 — Carry fetched source text in findings so verify does not re-fetch
**Est. saving: most of ~10 M cache read + ~200 tool calls.**

Add an optional `excerpt` field to the `FINDINGS` schema — the specific passage the research agent
relied on, not the whole page. Then change the recheck prompt (`:596` region, see the cost note at
`:1340`) to judge against the carried excerpt, reserving a live re-fetch for the case where the
excerpt is absent or the claim is contested at consensus tier.

**Trade-off, state it explicitly in the PR:** this weakens the adversarial property of recheck. Today
recheck re-reads the *source*; after this change it mostly re-reads what the research agent *said*
the source contained. Mitigation: keep live re-fetch for Tier 3 (`verify:consensus`, the contested
tail only) so the strongest check still touches ground truth. Do not apply this to Tier 3.

### 4.3 — Resolve the auditor agent-count discrepancy, then gate the audit
**Est. saving: up to ~2.3 M cache write and ~30 agents.**

1. First **measure** — count agents by `label` prefix `audit:`, not by prompt text (§F3).
2. If audits genuinely exceed one per section attempt, that is a bug; fix it.
3. Then consider: run L2 only on the **final** attempt, or only on sections whose prose length
   exceeds a threshold. L1 (`unknownUrls`, deterministic, free, `:1670` region) already catches the
   structural provenance failure at zero cost.
4. Raise `AUDIT_TIMEOUT_MS` (`:1629`) from 180 s — two sections timed out and published unaudited,
   paying full cost for no result.

### 4.4 — Document the resume-cache limitation
**Est. saving: 735 K per avoided mistake.**

Add to `skills/librarian/SKILL.md` § Gotchas:

> **`resumeFromRunId` does not recover in-flight work.** The cache keys on completed `result` lines
> in `journal.jsonl`. Killing a run to change its args abandons every agent currently running and
> re-runs them from scratch. If the sub-question list needs to change while a run is in flight,
> **let the run finish and append a second pass to the same slug** — appending is supported (step 4,
> `priorFindings`) and costs nothing extra. Never kill-and-relaunch to edit args.

### 4.5 — Cap research turns structurally, not just by search count
`maxSearchesPerLeaf` bounds WebSearch calls but not WebFetch calls or total turns. An agent can still
fetch 40 pages off 6 searches. Investigate whether `runUnit` can pass a turn ceiling to `agent()`; if
not, add explicit prompt language: *"Fetch at most N pages total. If you have not found the answer by
then, report what you have and state the gap."* A stated gap is a valid research result — the schema
already supports thin findings via the reframe path (`:1431`).

---

## 5. What NOT to change

- **Do not cut the verify tiers.** `verify.partial: false` with all three coverage fractions at 1.0
  is what makes `evidenceState: verified` mean anything. The tiered design (batched triage →
  clustered recheck → contested-tail consensus) is already the cost-controlled shape; per-finding
  voting was the thing it replaced. Make verify cheaper per call (§4.2), do not make it shallower.
- **Do not raise `MAX_CONCURRENT` past `min(16, cores−2)`** (`:1265`). Concurrency changes wall-clock,
  not token count, and the cap is the rogue-containment control.
- **Do not switch `LEAF_MODEL` to Haiku** (`:1273`) as a cost measure without a quality A/B. The
  librarian's SKILL.md records a deliberate decision that Haiku under-performs on web research. Cost
  here is context volume, not model tier — Haiku would re-read the same 24 M tokens.
- **Do not remove the fail-open behaviour** in the audit (`:1716`) or the last-attempt preservation
  branches. Those exist to prevent silently discarding paid-for work.

---

## 6. Reproducing the measurements

Run against any workflow transcript directory. Requires Python 3; no dependencies.

```python
import json, io, os, collections
d = r"<TRANSCRIPT_DIR>"   # .../subagents/workflows/wf_<runid>/

def classify(p):
    s = p.lower()
    if "refute" in s or "literalist" in s: return "verify:consensus"
    if "re-check" in s or "recheck" in s:  return "verify:recheck"
    if "triage" in s:                      return "verify:triage"
    if "traceability" in s or ("audit" in s and "claim" in s): return "integrity-audit"
    if "section" in s and "write" in s:    return "section-writer"
    if "research analyst" in s:            return "research"
    return "other"

P = collections.defaultdict(lambda: dict(n=0, inp=0, out=0, cw=0, cr=0, turns=0, tools=0))
for f in [f for f in os.listdir(d) if f.startswith("agent-") and f.endswith(".jsonl")]:
    inp = out = cw = cr = turns = tools = 0; prompt = ""
    for line in io.open(os.path.join(d, f), encoding="utf-8", errors="replace"):
        if not line.strip(): continue
        o = json.loads(line); m = o.get("message") or {}
        if not prompt and o.get("type") == "user":
            c = m.get("content")
            prompt = c if isinstance(c, str) else " ".join(
                x.get("text", "") for x in c if isinstance(x, dict)) if isinstance(c, list) else ""
        u = m.get("usage") or o.get("usage") or {}
        if u:
            turns += 1
            inp += u.get("input_tokens", 0); out += u.get("output_tokens", 0)
            cw  += u.get("cache_creation_input_tokens", 0)
            cr  += u.get("cache_read_input_tokens", 0)
        c = m.get("content")
        if isinstance(c, list):
            tools += sum(1 for x in c if isinstance(x, dict) and x.get("type") == "tool_use")
    e = P[classify(prompt)]
    e["n"] += 1; e["inp"] += inp; e["out"] += out
    e["cw"] += cw; e["cr"] += cr; e["turns"] += turns; e["tools"] += tools

for ph, e in sorted(P.items(), key=lambda x: -x[1]["cr"]):
    print(f"{ph:<18}{e['n']:>4}{e['inp']:>10,}{e['cw']:>11,}{e['cr']:>13,}"
          f"{e['out']:>10,}{e['turns']:>7}{e['tools']:>7}")
```

To find abandoned (paid-for, discarded) agents:

```python
started, done = set(), set()
for line in io.open(os.path.join(d, "journal.jsonl"), encoding="utf-8"):
    if line.strip():
        o = json.loads(line)
        (started if o["type"] == "started" else done).add(o["agentId"])
print("orphaned:", started - done)
```

**Caveat on the classifier:** it keys on prompt text and is known-imperfect (§F3). For any change
that depends on per-phase agent counts, count by the `label` passed at the `agent()` call site
instead.

---

## 7. Related open item

GitHub issue **TeamClyde/clydes_claude#215** — *librarian sub-question confirmation is unenforced
prose*. `SKILL.md` step 3 says the orchestrator "agrees the list with the user," but nothing enforces
it, so in practice sub-questions are derived and the Workflow fires immediately. That is what led to
the mid-flight edit in §F4.

Given §F5 — each sub-question costs ~9 agents — this gate is a **cost control**, not just a UX
improvement. Fixing #215 and §4.4 together closes the loop: confirm the list before spending, and
never kill a run to change it afterwards.

---

## 8. Suggested execution order

| # | Change | Effort | Est. saving |
|---|---|---|---|
| 1 | §4.1 document + default `maxSearchesPerLeaf` | XS | 10–15 M |
| 2 | §4.4 document resume-cache limitation | XS | 735 K per avoided error |
| 3 | §7 / #215 make sub-question confirmation a hard gate | S | ~9 agents per avoided question |
| 4 | §4.3 measure auditor count, then gate + raise timeout | S–M | ~2.3 M |
| 5 | §4.2 carry excerpts to avoid verify re-fetch | M | ~10 M |
| 6 | §4.5 structural turn cap | M | overlaps #1 |

Items 1, 2, and 3 are documentation-only, carry no regression risk, and together address the two
largest single line items. Ship them before touching the engine.
