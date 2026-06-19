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
 * Validation failure is a CONTROL SIGNAL: the reason is fed back as repair
 * context and the work retried, reaching ABANDONED only after the retry budget.
 * runUnit ALWAYS resolves to a terminal state — it never rejects and never hangs
 * (the watchdog guarantees termination). This is what lets quorumBarrier be safe.
 * @param {object} spec
 * @param {(repairContext: string|null) => Promise<any>} spec.work
 * @param {(value:any) => {ok:boolean, reason?:string}} [spec.validate] default: non-null ⇒ ok
 * @param {number} spec.timeoutMs
 * @param {number} [spec.maxRetries=1]
 * @returns {Promise<{state:'SUCCEEDED', value:any, history:string[]} | {state:'ABANDONED', history:string[]}>}
 */
export async function runUnit(spec) {
  const { work, validate = (v) => ({ ok: v != null }), timeoutMs, maxRetries = 1 } = spec;
  const history = [];
  let repair = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    history.push('RUNNING');
    const res = await withWatchdog(() => work(repair), timeoutMs);
    if (res.outcome === 'timeout') { history.push('TIMED_OUT'); continue; }
    if (res.outcome === 'error') { history.push('FAILED'); continue; }
    history.push('VALIDATING');
    const verdict = validate(res.value);
    if (verdict.ok) { history.push('SUCCEEDED'); return { state: 'SUCCEEDED', value: res.value, history }; }
    repair = verdict.reason ?? 'validation failed';
    history.push('RETRYING');
  }
  history.push('ABANDONED');
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
  return { confirmed, abandoned: results.length - confirmed.length, degraded: confirmed.length < threshold };
}

