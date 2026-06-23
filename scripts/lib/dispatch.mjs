// The fan-out front-door. Node module (imports fail-successfully.mjs); Workflow scripts consume it via the INLINED engine bundle (scripts/build-engine-bundle.mjs) — the sandbox has no module system.
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
  estimatedTokensPerUnit: 0,      // coarse fallback projection only; if 0 AND no getRemainingBudget, the projection gate is inert — use getRemainingBudget for real gating
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

/**
 * Batch `units` (chunks of maxInFlight) through quorumBarrier; a post-hoc reactive token gate
 * runs between batches. Returns { confirmed, abandoned, degraded, counts, stoppedReason }.
 * NOTE: read `degraded` together with `stoppedReason` — a 'token-budget' early-stop can leave
 * confirmed < quorum (degraded=true) even when every unit that actually RAN succeeded.
 */
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

/**
 * Run steps in order; each step's SUCCEEDED value feeds the next step's work(prior, repair, ctx).
 * Validation-as-feedback applies per step. Halts on the first ABANDONED.
 */
export async function sequentialChain(steps, policy = {}) {
  const p = { ...DEFAULT_POLICY, ...policy };
  if (p.perUnitTimeoutMs == null) throw new TypeError('perUnitTimeoutMs is required in DispatchPolicy');
  const results = [];
  let prev;
  let completed = 0;
  let stoppedReason;
  for (const step of steps) {
    const prior = prev;
    // bridge: runUnit calls work(repair, ctx); the consumer's step.work takes (prior, repair, ctx)
    const spec = withDefaults({ ...step, work: (repair, ctx) => step.work(prior, repair, ctx) }, p);
    const r = await runUnit(spec);
    results.push(r);
    if (r.state !== 'SUCCEEDED') { stoppedReason = 'abandoned'; break; }
    prev = r.value;
    completed++;
  }
  return { results, completed, stoppedReason };
}

/**
 * Monolith→fan-out reviewer path: fan out review lenses, then ONE batched verify over all
 * findings (NOT 3-votes-per-finding — see feedback_workflow_model_pinning). policy.verify
 * is an optional async (findings) => findings.
 */
export async function dimensionalReview(dimensions, policy = {}) {
  const p = { ...DEFAULT_POLICY, ...policy };
  if (p.perUnitTimeoutMs == null) throw new TypeError('perUnitTimeoutMs is required in DispatchPolicy');
  const review = await parallelFanout(dimensions, p);
  let findings = review.confirmed.flat();
  let verifyDegraded = false;
  if (p.verify) {
    // ONE batched verify (runs as a single runUnit → maxRetries+1 total calls on failure, never per-finding).
    // Contract: p.verify(findings) resolves to the filtered findings array.
    const v = await runUnit(withDefaults({ work: () => p.verify(findings) }, p));
    if (v.state === 'SUCCEEDED') findings = v.value;
    else verifyDegraded = true; // verify abandoned → findings are the UNVERIFIED pre-verify list; caller must check this flag
  }
  return { findings, counts: review.counts, degraded: review.degraded, verifyDegraded };
}
