# VerifyProtocol — Canonical Tiered-Adversarial-Verify Reference

Supporting reference for `skills/dispatching-parallel-agents/SKILL.md`.  
Consumed by: `scripts/lib/verify.mjs` (engine impl) · `skills/dispatching-parallel-agents/SKILL.md` Shape-A prose recipe · conformance guard (Task 8).

---

## Purpose & When Verify Runs

Verify runs **after a fan-out's findings are collected and before they are surfaced to the caller.** It is the gate between raw agent output and trusted output.

This protocol **replaces** dedup/rank-only verify. The campaign's signature weakness was a non-adversarial verify step that deduplicated and ranked findings without challenging them — agreeableness bias caused false positives to survive intact. The tiered-adversarial design challenges each finding's evidential basis, not just its uniqueness.

Three tiers run in sequence: triage (cheap, batched), clustered re-check (task-aware, bounded-cost), minority-veto consensus (contested tail only). A finding must survive all tiers it reaches. Tiers are skipped only under degradation (see § Graceful Degradation).

---

## Tier 1 — Chunked Batched Triage

**Portable. Identical across all consumers.**

Triage is batched, and **chunked** at a bounded number of findings per call (engine default: 40). Chunks are dispatched concurrently and their verdicts merged into one map keyed by the finding's global index. Chunking exists because a single call handed a large findings list will silently judge only a prefix of it and return — the batch must be small enough that the judge reliably covers all of it.

Each call assigns every finding it receives a label:

| Label | Meaning |
|---|---|
| `supported` | Finding's claim is directly supported by the cited source(s). |
| `uncertain` | Weak, ambiguous, or split evidence — cannot confidently confirm or deny. |
| `unsupported` | No cited evidence substantiates the claim; or cited source contradicts it. |

The triage call also flags two additional conditions per finding (non-exclusive with the label):

| Flag | Meaning |
|---|---|
| `disagree` | The sources cited by different panel members conflict on this finding. |
| `thin-source` | The finding rests on a single source, or the cited source is shallow/low-authority. |

**Drop rule (default):** `unsupported` findings are dropped immediately — no re-check, no vote — *unless* the active consumer profile's `escalateOn` set lists `unsupported`. Only `web-research` does (`guard-unsupported`): for that profile, `unsupported` findings escalate to Tier 2 instead of being dropped. The drop rule is profile-overridable; it is not a global pre-filter that runs before profile escalation.
**Unjudged is not refuted (PINNED):** a finding that comes back with **no verdict** — because a chunk truncated its output or the chunk call failed — **escalates to Tier 2**. It is never dropped. An unjudged finding carries no evidence against it, so dropping it silently discards collected work while reporting success. Track the judged fraction as `triageCoverage` and surface it to the caller; `< 1` means the adversarial tiers, not triage, are what carried those findings.

**No new lookups:** Triage does not fetch URLs, read additional files, or extend the evidence set. It evaluates only the evidence the fan-out agents already cited.

Output set after Tier 1 (profile-aware): `supported` findings pass through directly; any finding whose label or flag is in the active profile's `escalateOn` set escalates to Tier 2 (e.g. `uncertain` + `disagree` for most profiles; additionally `unsupported` + `thin-source` for `web-research`), as does any unjudged finding; all remaining `unsupported` findings are dropped.

`thinSource` is judged on the **source**, not the claim, and independently of `support`. A finding
can be `supported: true, thinSource: true` — well-argued from a single low-authority page — and
that combination is precisely the one Tier 1 must not wave through. The flag is carried onto the
finding so it survives into the consumer's own output; verify is the only stage that re-read the
sources, so this judgement cannot be reconstructed downstream.

---

## Tier 2 — Clustered Adversarial Re-Check

**Task-aware. One re-check call per cluster, not per finding.**

### Cluster Contract

Group the escalation set by a **cluster key**:

- **Code-review / audit / plan-review:** cluster key = the *file* portion of the finding's `where` field (e.g., `src/lib/verify.mjs`). All findings from the same file form one cluster.
- **Web-research:** cluster key = `finding.subQuestion` (the sub-question the fan-out agent was answering). Findings answering the same sub-question form one cluster.

For **each cluster**, dispatch ONE re-check agent that:
1. Re-reads the cluster's primary source (cited file or URL — the same source the original agent used).
2. Re-evaluates each finding in the cluster: does the source's actual content support the claim?
3. Returns a per-member `keep` / `drop` decision with a one-sentence rationale.

**Cost bound:** N findings → approximately (distinct cluster keys) re-check calls, not N calls. This bounds re-check cost to the number of distinct files/sub-questions touched, regardless of how many findings each contains.

**Cluster failure is contained (PINNED):** clusters are independent, so a cluster whose re-check times out or errors falls back to **its own input set** — all of its members are kept and escalate to Tier 3 — while every other cluster's decisions stand. A failed cluster must never degrade the whole verify: measured re-check durations span a wide range, so one slow cluster is the expected case, and collapsing the run on it discards completed Tier-1 work and skips Tier 3 entirely. Report the fraction of clusters that returned as `recheckCoverage`.

Output set after Tier 2: `drop` decisions are removed; `keep` decisions form the **contested tail** that escalates to Tier 3 consensus. The re-check returns a binary `keep`/`drop` per member — there is no separate "ambiguous" outcome.

---

## Tier 3 — Minority-Veto 3-Voter Consensus

**Task-aware. Contested tail only.**

The **contested tail** = findings that escalated at Tier 1 (their label or flag matched the active profile's `escalateOn` — e.g. `uncertain`, `disagree`, `thin-source`) **and** were kept by the Tier-2 re-check. Clean Tier-1 `supported` findings never reach this tier.

### Dispatch Shape (PINNED)

**One agent call per voter frame per chunk — NEVER one call per finding.** Each of the three voters receives a whole chunk of contested findings (same bound as Tier 1) and returns one refute/keep vote per finding index. Cost is `3 × chunks`, independent of how many findings each chunk holds. Per-finding voting is `O(3N)` and has already cost this repo a session limit at scale; it is prohibited, not merely discouraged.

The three frames for a chunk run concurrently; chunks run in sequence, so at most `voters` agents are in flight at this tier.

**A voter that omits a finding's index has NOT refuted it** — silence counts as a keeper, mirroring Tier 2's absent-entry `keep` rule. Without this, a voter whose output truncates would silently refute its own tail. If *every* voter frame fails while findings are waiting on them, Tier 3 never ran: degrade rather than pass the contested set through labelled as verified.

**A voter frame that never RAN is not a voter that stayed silent (PINNED).** Frames dispatch concurrently and independently, so a rejected or timed-out frame is simply absent from the results. It must be excluded from the denominator, never counted as a keeper. Two distinct rules follow, and both are per-CHUNK — a healthy chunk never vouches for a sibling chunk that lost its frames:

- **Quorum floor.** Apply the survival rule only when at least `surviveAtLeast` frames returned for that chunk. Below the floor there is no consensus to compute — "≥ 2 of 3 failed to refute" is unanswerable when fewer than 2 voted. Keep the chunk's members (a frame that never ran is not evidence against a finding) but log **every one** as `contested`, so a chunk that was never actually judged cannot read as a clean unanimous keep.
- **Live denominator.** Above the floor, measure keepers as `(frames that returned) − refutations`, never against the fixed voter count. Counting absent frames as silent keepers lets a real refutation be outvoted by voters that never ran — the verify becomes least adversarial exactly when it is least healthy.

Report the fraction of frames that returned as `consensusCoverage`.

### The Rule (PINNED)

**Three structurally-diverse voters each independently attempt to REFUTE the finding.** A finding survives if and only if ≥ 2 of the voters that *returned* fail to refute it, and at least `surviveAtLeast` voters returned. Batching changes only the dispatch shape — the per-finding aggregation is unchanged.

| Outcome | Refutations | Disposition |
|---|---|---|
| (a) Dropped + logged `contested` | ≥ 2 voters refuted (< 2 failed to refute) | Finding is dropped; logged under `contested` for transparency. |
| (b) Kept + logged `contested` | ≥ 2 voters failed to refute, but ≥ 1 did refute | Finding **survives**; logged under `contested` — the refutation is recorded, not silenced. |
| (c) Clean keep | All 3 voters failed to refute | Finding survives; no `contested` log entry required. |

### Why "minority-veto"?

A lone minority refuter **cannot silently out-vote the finding into survival-without-trace.** When a single voter refutes but two fail to, the finding keeps — but the refutation escalates it to the `contested` log (visibility). This guards agreeableness-bias (consensus accepting too much) without over-dropping true findings. The veto is on *invisibility*, not on survival.

### Voter Diversity — Mandatory

Three diversity axes must be satisfied. Temperature variation alone is **not sufficient.**

| Axis | Requirement |
|---|---|
| **Role framing** | Each voter is assigned a structurally different adversarial lens (e.g., "skeptical peer reviewer," "devil's advocate," "standards auditor"). |
| **Evidence ordering** | Cited sources are presented in a different order to each voter, preventing anchoring on whichever source appears first. |
| **Model family** | Where available, voters come from distinct model families (e.g., one Haiku, one Sonnet, one from a different family). When only one family is available, vary role + ordering + temperature together as a weaker substitute — document this in the `contested` log entry. |

---

## Per-Consumer Profiles

Each consumer has an asymmetric cost model that controls which findings escalate from Tier 1 to Tier 2/3. See the machine-readable param block for the exact `escalateOn` sets.

| Consumer | Bias | Rationale |
|---|---|---|
| `code-review` | `guard-false-positive` | A false-positive finding triggers rework. Escalate on `uncertain` and `disagree`; accept `supported` findings without re-check. |
| `web-research` | `guard-unsupported` | Claims lacking authoritative sources are more dangerous than missed findings. Escalate on `uncertain`, `unsupported` (even if Tier 1 would normally drop), and `thin-source`. |
| `plan-review` | `balanced` | Balanced cost: escalate on `uncertain` and `disagree`. Neither false-positive nor missed-finding is systematically worse. |
| `audit` | `balanced` | Same as `plan-review`. Audit surfaces patterns; both false-positive and missed-finding carry costs. |

### Subtractive vs remediative escalation

Every escalation reason except one routes a finding toward tiers that can only **drop** it. The
`thin-source` reason under `web-research` is **remediative**: it routes toward better evidence.

The asymmetry follows from what each signal means:

| Reason | What it says | Right response |
|---|---|---|
| `uncertain`, `disagree` | The claim may be **wrong**. | Adversarial challenge — drop it if it cannot survive. |
| `unsupported` | The premise is not supported. | Drop, unless the profile guards against that. |
| `thin-source` | The claim may be **right but poorly evidenced**. | Better evidence. Deleting a working pointer to a weak source loses the pointer without gaining accuracy. |

Only the `web-research` profile uses the remediative path, and only after Tier 1 has flagged the
finding. Thin findings are **never dropped for being thin** — they are kept, flagged, and shown to
the reader as thin. A vendor blog that names the right technique is a working pointer.

---

## Graceful Degradation

Each tier runs inside a bounded deadline. On timeout or unrecoverable failure, the tier that failed falls back to its own input set — never to an empty set — and reports what happened via `degraded`, `degradedAtTier`, and `partial`.

In all degradation cases the result carries `degraded: true` and `degradedAtTier`, naming the tier
that fell back. On a clean run `degradedAtTier` is `null` — it is a **cause**, not a status. Callers
MUST check `degraded` before trusting findings.

`degradedAtTier` takes one of **`'triage'`, `'consensus'`, or `null`** — deliberately not the full
`tiers` vocabulary. There is no `'clusteredRecheck'` value, because losing every Tier-2 cluster is
not a degradation: each cluster falls back to keeping its own members, those members go on to face
Tier 3, and the verify still produces a real judgement. That case reports `partial: true` with
`recheckCoverage: 0`, which is containment working as designed. Only Tier 1 (nothing was ever
judged) and Tier 3 (no voter frame returned, so consensus never happened) leave the run without a
usable verdict for the findings that reached them.

**Scope the fallback to the unit that failed.** Tiers 2 and 3 dispatch many independent agents (one
per cluster, three per chunk). When one is lost, the fallback applies to *that cluster* or *that
chunk* — not the whole run. A whole-tier collapse is reserved for a whole-tier failure.

**And a whole-tier collapse does not unwind the tiers below it.** A lost Tier 3 returns the Tier-1
`supported` set plus the contested tail; a lost Tier 2 passes its own escalation set on to Tier 3.
Completed tier work is never discarded because a later tier failed — that discard was the defect
in the single-outer-`try` structure this replaces.

### `degraded` vs `partial` — distinct signals

| Field | Meaning | Correct caller response |
|---|---|---|
| `degraded: true` | The verify did not run. No usable judgement was produced. | Discard the verify output; treat findings as unverified. |
| `partial: true` | The verify ran and its output is usable, but some tier agents were lost, so it was **less adversarial than this protocol promises**. | Use the output; surface the reduced assurance. Read `recheckCoverage` / `consensusCoverage` for the extent. |

**Do not conflate them.** Callers commonly implement `degraded` as "throw the verify away and pass the raw findings through". Raising `degraded` for a single lost voter frame would therefore discard an entire otherwise-good verify pass — a worse outcome than the fail-open it was meant to fix. Partial loss gets its own flag precisely so the healthy majority of the work survives.

---

## Machine-readable param block

```json
{
  "protocolVersion": "1.2",
  "tiers": ["triage", "clusteredRecheck", "consensus"],
  "consensus": { "voters": 3, "surviveAtLeast": 2, "rule": "minority-veto", "diversity": ["role", "ordering", "modelFamily"] },
  "labels": ["supported", "uncertain", "unsupported"],
  "profiles": {
    "code-review":  { "escalateOn": ["uncertain", "disagree"], "bias": "guard-false-positive" },
    "web-research": { "escalateOn": ["uncertain", "unsupported", "thin-source"], "bias": "guard-unsupported" },
    "plan-review":  { "escalateOn": ["uncertain", "disagree"], "bias": "balanced" },
    "audit":        { "escalateOn": ["uncertain", "disagree"], "bias": "balanced" }
  }
}
```
