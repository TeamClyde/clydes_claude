# DispatchPolicy — Full Reference

Supporting reference for `skills/dispatching-parallel-agents/SKILL.md`.  
Helpers: `scripts/lib/dispatch.mjs` · Engine: `scripts/lib/fail-successfully.mjs`

---

## DispatchPolicy Schema

Every helper (`parallelFanout`, `sequentialChain`, `dimensionalReview`) accepts a `policy` object merged over `DEFAULT_POLICY`.

| Key | Default | Purpose |
|---|---|---|
| `maxInFlight` | `8` | Concurrent units per batch. Keep `≤ min(16, cores−2)` so nothing queues behind the runtime cap. NOT a magic 20. |
| `perUnitTimeoutMs` | **required** | No default — omitting throws `TypeError`. Watchdog fires ABANDONED on timeout → fast detect-and-abandon. |
| `maxRetries` | `1` | Crash/timeout retries per unit. |
| `maxValidationRetries` | `1` | Validation-repair retries. Split budget from `maxRetries` so validation oscillation can't drain the crash budget. |
| `quorum` | `undefined → Math.ceil(units.length / 2)` (computed at dispatch) | Minimum confirmed units to avoid `degraded: true`. Override for stricter or relaxed consensus. |
| `modelTier` | `null` | Pin Haiku or Sonnet — **never Opus**. Threaded into the consumer's `agent({ model })`. |
| `tokenBudget` | `null` | Max output tokens for this fan-out. `null` = no limit. |
| `estimatedTokensPerUnit` | `0` | Coarse fallback projection only — output tokens are unknowable pre-call (`count_tokens` is input-only). If `0`, the right-hand side of the token gate comparison is 0, so the gate is inert regardless of `getRemainingBudget`. |
| `budgetReserve` | `0.9` | Stop at 90% of budget to bound non-preemptable in-flight overshoot. |
| `getRemainingBudget` | `null` | `() => number` — live remaining tokens. **Inside a Workflow: `() => budget.remaining()`** |
| `onOverloadBackoff` | `'exponential'` | Passthrough convention. The consumer's `work()` honors it on 529 / API-overload responses. The lib does not act on it directly. |

---

## Per-Shape Return Contracts

### `parallelFanout(units, policy)` → `{ confirmed, abandoned, degraded, counts, stoppedReason }`

| Field | Type | Meaning |
|---|---|---|
| `confirmed` | `Array` | Values from SUCCEEDED units. |
| `abandoned` | `number` | Count of ABANDONED units. |
| `degraded` | `boolean` | `true` when `confirmed.length < quorum`. |
| `counts` | `object` | Per-state counts aggregated across all batches. |
| `stoppedReason` | `string \| undefined` | `'token-budget'` if an early-stop fired; otherwise `undefined`. |

**Important:** Read `degraded` together with `stoppedReason`. A `'token-budget'` early-stop can produce `degraded: true` even when every unit that ran succeeded — the quorum simply wasn't reachable because batches were skipped, not because units failed.

**Internals:** Units are chunked into `maxInFlight`-sized batches and passed through `quorumBarrier`. A post-hoc reactive token gate runs *between* batches (not before each unit).

---

### `sequentialChain(steps, policy)` → `{ results, completed, stoppedReason }`

| Field | Type | Meaning |
|---|---|---|
| `results` | `Array` | `runUnit` result objects for each step (even partial runs). |
| `completed` | `number` | Steps that reached SUCCEEDED. |
| `stoppedReason` | `string \| undefined` | `'abandoned'` if any step was ABANDONED (chain halted); otherwise `undefined`. |

**Internals:** Each step's `work(prior, repair, ctx)` receives the previous step's SUCCEEDED value as `prior`. Validation-as-feedback applies per step (governed by `maxValidationRetries`). The chain halts immediately on the first ABANDONED — no further steps run.

---

### `dimensionalReview(dimensions, policy)` → `{ findings, counts, degraded, verifyDegraded }`

| Field | Type | Meaning |
|---|---|---|
| `findings` | `Array` | Final finding list (post-verify if verify succeeded; pre-verify if it abandoned). |
| `counts` | `object` | Per-state counts from the fan-out phase. |
| `degraded` | `boolean` | `true` if the fan-out phase didn't reach quorum. |
| `verifyDegraded` | `boolean` | `true` if the verify step was ABANDONED; `findings` are **UNVERIFIED** — caller must check before trusting. |

**Cost decision — batched verify, not 3-votes-per-finding across the full set:** `policy.verify` is called once over all findings. This is a deliberate cost choice: 3-votes-per-finding across *every* finding burned ~290 agents / 6.4 M tokens in a prior session. Do not reintroduce per-finding verification over the full findings set. **Bounded exception:** the tiered protocol (`verify-protocol.md` Tier 3) applies minority-veto 3-voter consensus *only to the contested tail* — after triage + clustering have already reduced the set — which keeps the per-finding cost bounded. That bounded form is sanctioned; the unbounded full-set form is not.

**Verify-step timeout:** The batched verify runs as a `runUnit` via `withDefaults`, so it inherits `perUnitTimeoutMs` — the same bound as an individual lens. A slow batched verify over many findings can be abandoned at that timeout → `verifyDegraded: true`, with unverified findings returned. Set `perUnitTimeoutMs` generously when passing many findings to `policy.verify`, or pre-trim findings before the verify step.

---

## Token-Budget Mechanics

The gate is **post-hoc reactive**: it reads real remaining tokens *between* batches (after each batch completes). This is the accurate signal.

**Inside a Workflow, pass `() => budget.remaining()` as `getRemainingBudget`:**

```js
// Inside a Workflow — correct pattern
const { confirmed } = await parallelFanout(units, {
  perUnitTimeoutMs: 30_000,
  tokenBudget: budget.total(),
  getRemainingBudget: () => budget.remaining(),  // ← live signal between batches
});
```

The gate fires only when BOTH a live `getRemainingBudget` (or a projection) gives `remaining`, AND `estimatedTokensPerUnit > 0` — it is the right-hand side of the comparison `remaining × budgetReserve < batch.length × estimatedTokensPerUnit`. Setting `getRemainingBudget` while leaving `estimatedTokensPerUnit` at its default `0` leaves the gate inert — no gating occurs.

`budgetReserve` (default `0.9`) stops new batches at 90% of budget consumed, bounding overshoot from non-preemptable in-flight units.

---

## Non-Preemption Honesty Note

**A script-level watchdog stops *waiting* on a rogue agent — it cannot kill it.**

Claude Code subagents have no abort surface (GitHub: anthropics/claude-code #61405, open). "Kill rogues fast" means abandon-and-proceed at the orchestration level; the rogue agent continues running until it naturally completes or the outer session ends.

Practical implications:

- **`maxInFlight` is your real rogue-containment.** Small batches bound how many agents can be rogue simultaneously.
- **The token gate gates new *spawns* only.** In-flight units always finish — the gate cannot reach back and cancel them.
- **`AbortSignal` is the right tool only when `work` is local-abortable async** (fetch/fs operations), not for agent units. Do not pass `AbortSignal` to `runUnit` expecting agent termination.

When a unit times out, the watchdog fires ABANDONED and the chain/fan-out continues without that unit's result. The agent itself is unaffected.
