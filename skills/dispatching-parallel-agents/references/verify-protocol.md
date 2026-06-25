# VerifyProtocol — Canonical Tiered-Adversarial-Verify Reference

Supporting reference for `skills/dispatching-parallel-agents/SKILL.md`.  
Consumed by: `scripts/lib/verify.mjs` (engine impl) · `skills/dispatching-parallel-agents/SKILL.md` Shape-A prose recipe · conformance guard (Task 8).

---

## Purpose & When Verify Runs

Verify runs **after a fan-out's findings are collected and before they are surfaced to the caller.** It is the gate between raw agent output and trusted output.

This protocol **replaces** dedup/rank-only verify. The campaign's signature weakness was a non-adversarial verify step that deduplicated and ranked findings without challenging them — agreeableness bias caused false positives to survive intact. The tiered-adversarial design challenges each finding's evidential basis, not just its uniqueness.

Three tiers run in sequence: triage (cheap, batched), clustered re-check (task-aware, bounded-cost), minority-veto consensus (contested tail only). A finding must survive all tiers it reaches. Tiers are skipped only under degradation (see § Graceful Degradation).

---

## Tier 1 — Batched Triage

**Portable. Identical across all consumers.**

ONE batched call receives the full findings list and assigns each finding a label:

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
**No new lookups:** Triage does not fetch URLs, read additional files, or extend the evidence set. It evaluates only the evidence the fan-out agents already cited.

Output set after Tier 1 (profile-aware): `supported` findings pass through directly; any finding whose label or flag is in the active profile's `escalateOn` set escalates to Tier 2 (e.g. `uncertain` + `disagree` for most profiles; additionally `unsupported` + `thin-source` for `web-research`); all remaining `unsupported` findings are dropped.

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

Output set after Tier 2: `keep` decisions pass through; `drop` decisions are removed. Any finding the re-check leaves ambiguous (neither clearly kept nor dropped) escalates to Tier 3.

---

## Tier 3 — Minority-Veto 3-Voter Consensus

**Task-aware. Contested tail only.**

Only findings that the lower tiers leave contested escalate here: sources disagreed (`disagree` flag), evidence was thin or single-sourced (`thin-source` flag), or the Tier-2 re-check was ambiguous.

### The Rule (PINNED)

**Three structurally-diverse voters each independently attempt to REFUTE the finding.** A finding survives if and only if ≥ 2 of 3 voters *fail* to refute it.

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

---

## Graceful Degradation

Each tier runs inside a bounded deadline. On timeout or unrecoverable failure:

1. **Tier 1 timeout:** Return all findings stamped `degraded: true`. No triage label applied — caller must treat the full set as unverified.
2. **Tier 2 timeout:** Return the post-Tier-1 set (labels applied, drops respected) stamped `degraded: true`. Tier 2 clustering was not applied — caller sees partially-verified output.
3. **Tier 3 timeout:** Return the post-Tier-2 set stamped `degraded: true`. Contested findings are included unresolved; `contested` log entries are not written.

In all degradation cases: the returned findings include a `degraded: true` field and a `degradedAtTier` field indicating which tier failed. Callers MUST check `degraded` before trusting findings — the same check as `verifyDegraded` in `dimensionalReview`.

**Fallback rule:** On tier failure, always fall back to **that tier's input set** — never to an empty set. Dropping everything on timeout is worse than returning unverified findings with a clear `degraded` flag.

---

## Machine-readable param block

```json
{
  "protocolVersion": "1.0",
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
