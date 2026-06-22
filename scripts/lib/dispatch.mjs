// The fan-out front-door. Pure + dependency-free (must import-run in the Workflow sandbox).
// Wraps the fail-successfully engine; enforces DispatchPolicy (maxInFlight batching +
// post-hoc reactive token gate). NON-PREEMPTIVE: gates new spawns; in-flight units finish.
// See wave-2-engine-harness-design.md §C.
import { runUnit, quorumBarrier } from './fail-successfully.mjs';

export const DEFAULT_POLICY = {
  maxInFlight: 8,                 // keep ≤ runtime cap min(16, cores−2) so nothing queues
  perUnitTimeoutMs: undefined,    // required per call (watchdog → fast detect-and-abandon)
  maxRetries: 1,                  // crash/timeout retries
  maxValidationRetries: 1,        // validation-repair retries (separate budget)
  quorum: undefined,              // default computed: ceil(units.length / 2)
  modelTier: null,                // pin Haiku/Sonnet; threaded into the consumer's agent({model})
  tokenBudget: null,              // max output tokens for this fan-out (null = no limit)
  estimatedTokensPerUnit: 0,      // coarse fallback projection only
  budgetReserve: 0.9,             // stop at 90% to bound non-preemptable in-flight overshoot
  getRemainingBudget: null,       // () => live remaining tokens (Workflow: () => budget.remaining())
  onOverloadBackoff: 'exponential', // passthrough convention; the consumer's work() honors it on 529/API-overload — the lib does not act on it
};

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function withDefaults(u, p) {
  return { timeoutMs: p.perUnitTimeoutMs, maxRetries: p.maxRetries, maxValidationRetries: p.maxValidationRetries, ...u };
}

export async function parallelFanout(units, policy = {}) {
  const p = { ...DEFAULT_POLICY, ...policy };
  if (p.perUnitTimeoutMs == null) throw new TypeError('perUnitTimeoutMs is required in DispatchPolicy');
  const quorum = p.quorum ?? Math.ceil(units.length / 2);
  const confirmed = [];
  const counts = {};
  let abandoned = 0;
  let launched = 0;
  let stoppedReason;
  for (const batch of chunk(units, Math.max(1, p.maxInFlight))) {
    if (p.tokenBudget != null) {
      const remaining = p.getRemainingBudget ? p.getRemainingBudget()
                                             : p.tokenBudget - launched * p.estimatedTokensPerUnit;
      if (remaining * p.budgetReserve < batch.length * p.estimatedTokensPerUnit) { stoppedReason = 'token-budget'; break; }
    }
    // per-batch `degraded` is ignored; the final `degraded` is recomputed over the whole fan-out below
    const r = await quorumBarrier(batch.map((u) => withDefaults(u, p)), quorum);
    confirmed.push(...r.confirmed);
    abandoned += r.abandoned;
    for (const [s, n] of Object.entries(r.counts)) counts[s] = (counts[s] ?? 0) + n;
    launched += batch.length;
  }
  return { confirmed, abandoned, degraded: confirmed.length < quorum, counts, stoppedReason };
}
