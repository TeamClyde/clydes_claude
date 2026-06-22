// Minimal fail-successfully orchestration primitive (the regulation layer's
// first building block). Pure: no LLM, no network, no filesystem — parameterized
// by an async `work` function so it is deterministically testable.
// See docs/explanation/orchestration-regulation-layer.md §5 (per-unit FSM) and §6.3
// (validation-as-feedback). Used inlined by scripts/phase-2-audit.workflow.mjs.

/**
 * Race an async work function against a deadline.
 * Resolves to a discriminated result — never rejects (a timeout is a value).
 * NON-PREEMPTIVE: the underlying work keeps running after a timeout
 * (regulation dossier §7). Keep any fan-out ≤ the concurrency cap so a
 * timed-out-but-still-running unit can't starve a slot.
 * @param {() => Promise<any>} workFn
 * @param {number} ms
 * @returns {Promise<{outcome:'done', value:any} | {outcome:'timeout'} | {outcome:'error', error:any}>}
 */
export function withWatchdog(workFn, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve({ outcome: 'timeout' }); } }, ms);
    Promise.resolve().then(workFn).then(
      (value) => finish({ outcome: 'done', value }),
      (error) => finish({ outcome: 'error', error }),
    );
  });
}

/**
 * Drive one work unit through the lifecycle FSM:
 *   PENDING → RUNNING → VALIDATING → { SUCCEEDED | RETRYING(repair) | TIMED_OUT | FAILED } → ABANDONED
 * A memo-hit (spec.store + spec.stepId present and cached) short-circuits to MEMOIZED → SUCCEEDED
 * without running work.
 * Validation failure is a CONTROL SIGNAL: the reason is fed back as repair
 * context and the work retried, reaching ABANDONED only after the retry budget.
 * runUnit ALWAYS resolves to a terminal state — it never rejects and never hangs
 * (the watchdog guarantees termination). This is what lets quorumBarrier be safe.
 * @param {object} spec
 * @param {(repair: string|null, ctx: {reason:string, value:any, attempt:number}|null) => Promise<any>} spec.work
 *   repair = validation reason string (backward-compat 1st arg); ctx = structured repair context
 *   (null on first attempt; ctx.attempt counts ALL loop iterations — crash + validation retries).
 * @param {(value:any) => ({ok:boolean, reason?:string} | Promise<{ok:boolean, reason?:string}>)} [spec.validate]
 *   default: non-null ⇒ ok. May be sync or async (the verdict is awaited).
 * @param {number} spec.timeoutMs
 * @param {number} [spec.maxRetries=1] crash/timeout retry budget
 * @param {number} [spec.maxValidationRetries=maxRetries] separate validation-repair retry budget
 * @param {{has(k):boolean, get(k):any, set(k,v):void}} [spec.store] opt-in step-result cache (e.g. a Map); intra-run only
 * @param {*} [spec.stepId] consumer-owned cache key — stable across resume, unique per distinct invocation, NEVER shared across quorum/best-of-N members. Memoization is OFF unless BOTH store and stepId are present.
 * @returns {Promise<{state:'SUCCEEDED', value:any, history:string[], memoized?:true} | {state:'ABANDONED', history:string[]}>}
 */
export async function runUnit(spec) {
  const {
    work,
    validate = (v) => ({ ok: v != null }),
    timeoutMs,
    maxRetries = 1,
    maxValidationRetries = maxRetries, // default preserves prior single-budget behavior
    onEvent,
    store,
    stepId,
  } = spec;
  const history = [];
  const emit = (state, extra = {}) => { history.push(state); if (onEvent) onEvent({ state, ...extra }); };
  if (store && stepId != null && store.has(stepId)) {
    emit('MEMOIZED', { stepId, memoized: true });
    return { state: 'SUCCEEDED', value: store.get(stepId), history, memoized: true };
  }
  let crashRetriesLeft = maxRetries;
  let validationRetriesLeft = maxValidationRetries;
  let repair = null; // reason string (backward-compatible 1st arg to work)
  let ctx = null;    // structured { reason, value, attempt }
  let attempt = 0;   // counts ALL loop iterations (crash + validation retries), not validation retries alone
  while (true) {
    emit('RUNNING', { attempt });
    const res = await withWatchdog(() => work(repair, ctx), timeoutMs);
    if (res.outcome === 'timeout' || res.outcome === 'error') {
      emit(res.outcome === 'timeout' ? 'TIMED_OUT' : 'FAILED', { attempt });
      if (crashRetriesLeft > 0) { crashRetriesLeft--; attempt++; continue; }
      break;
    }
    emit('VALIDATING', { attempt });
    const verdict = await validate(res.value); // may be sync or async
    if (verdict.ok) {
      emit('SUCCEEDED', { attempt });
      if (store && stepId != null) store.set(stepId, res.value); // only SUCCEEDED writes — every terminal-fail path reaches ABANDONED below, never here
      return { state: 'SUCCEEDED', value: res.value, history };
    }
    if (validationRetriesLeft > 0) {
      validationRetriesLeft--; attempt++;
      repair = verdict.reason ?? 'validation failed';
      ctx = { reason: repair, value: res.value, attempt };
      emit('RETRYING', { attempt, reason: repair });
      continue;
    }
    break; // validation budget exhausted
  }
  emit('ABANDONED', {});
  return { state: 'ABANDONED', history };
}

/**
 * Run all units concurrently and proceed on a QUORUM of SUCCEEDED terminal
 * states — not on all units reaching SUCCEEDED. Because runUnit always reaches a
 * terminal state (SUCCEEDED or ABANDONED) within its watchdog budget, Promise.all
 * here can neither hang nor reject: a straggler is bounded to ABANDONED, so it can
 * never hold the barrier. SUCCEEDED values are captured, so abandoning is non-lossy.
 * @param {Array<object>} units  - runUnit specs
 * @param {number} threshold     - minimum SUCCEEDED count to consider the barrier healthy
 * @returns {Promise<{confirmed:any[], abandoned:number, degraded:boolean}>}
 */
export async function quorumBarrier(units, threshold) {
  const results = await Promise.all(units.map((u) => runUnit(u)));
  const confirmed = results.filter((r) => r.state === 'SUCCEEDED').map((r) => r.value);
  const counts = {};
  for (const r of results) for (const s of r.history) counts[s] = (counts[s] ?? 0) + 1;
  return { confirmed, abandoned: results.length - confirmed.length, degraded: confirmed.length < threshold, counts };
}

