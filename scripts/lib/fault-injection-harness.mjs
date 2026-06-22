// Deterministic fault-injection INVARIANT harness for the fail-successfully engine.
// Proves the FSM upholds its deterministic invariants under injected faults.
// NO real LLM — measures fault-handling / coverage, NOT real-LLM semantic reliability.
// See wave-2-engine-harness-design.md §B (the adversarial-research reframe).

const faulted = (trialIndex, unitIndex, period) => (trialIndex + unitIndex) % period === 0;

/** work() that hangs (never resolves) on the faulted (trial,unit); resolves a value otherwise. */
export function injectStall(trialIndex, unitIndex, { period = 3 } = {}) {
  return () => (faulted(trialIndex, unitIndex, period) ? new Promise(() => {}) : Promise.resolve(`u${unitIndex}`));
}

/** work() that returns schema-invalid output (null) on the faulted (trial,unit); valid otherwise. */
export function injectBadOutput(trialIndex, unitIndex, { period = 3 } = {}) {
  return () => Promise.resolve(faulted(trialIndex, unitIndex, period) ? null : { ok: true, u: unitIndex });
}

/** work() that throws on the faulted (trial,unit); resolves otherwise. */
export function injectCrash(trialIndex, unitIndex, { period = 3 } = {}) {
  return () => {
    if (faulted(trialIndex, unitIndex, period)) throw new Error(`crash u${unitIndex}`);
    return Promise.resolve(`u${unitIndex}`);
  };
}

/**
 * Check the four deterministic invariants on a quorumBarrier-shaped result:
 * completes, valid shape, makes progress (if expected), degrades gracefully.
 */
export function checkInvariants(result, { expectProgress = true } = {}) {
  const completes = result != null;
  const validShape = completes && Array.isArray(result.confirmed) && typeof result.degraded === 'boolean';
  const makesProgress = !expectProgress || (validShape && result.confirmed.length > 0);
  const degradesGracefully = validShape && typeof result.abandoned === 'number'; // structured result that ACCOUNTS for its abandoned units (not just confirmed/degraded)
  const allHold = completes && validShape && makesProgress && degradesGracefully;
  return { completes, validShape, makesProgress, degradesGracefully, allHold };
}

/**
 * Run scenarioFn(trialIndex) k times; invariants must hold every trial.
 * passedAllK === "invariants held across all k distinct fault patterns"
 * (an FSM fault-coverage / determinism guarantee — NOT a real-LLM reliability claim).
 */
export async function passK(scenarioFn, k, invariantOpts = {}) {
  let passes = 0;
  for (let t = 0; t < k; t++) {
    let result;
    try { result = await scenarioFn(t); }
    catch { result = null; } // a throw is an invariant violation (no graceful degrade)
    if (checkInvariants(result, invariantOpts).allHold) passes++;
  }
  return { k, passes, passRate: passes / k, passedAllK: passes === k };
}
