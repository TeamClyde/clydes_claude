// run-health.mjs — dependency-free post-run health check over signals the engine ALREADY returns.
// Named exports only — never export default (engine bundle strip regex).
//
// Every real incident in this repo was caught by a human reading a failed run, and in every case
// the signal needed to catch it automatically was already computed and returned, then rendered as
// a prose note a reader skims past (#141). This module is the consumer those signals never had.
//
// PURE. No I/O, no timers, no Date.now() — it is inlined into the Workflow sandbox, where
// Date.now()/Math.random()/new Date() all THROW. Duration-based checks (watchdog margin) therefore
// live in scripts/measure-workflow-run.mjs, which reads transcripts offline.
//
// `ok: false` means REPORT UNHEALTHY, not DISCARD. The caller always still hands over its
// artifacts — dropping paid-for work is the failure this codebase has refused since #96.

// Above this many units, an unpinned fan-out is the 290-agent / 6.4M-token incident waiting to
// happen. Below it, the blast radius is small enough that an unset pin is not worth failing on.
const PIN_REQUIRED_ABOVE_UNITS = 10;

/**
 * @param {object} s
 * @param {number} s.unitCount      - units dispatched in the largest fan-out of the run
 * @param {string|null} s.modelTier - the pin echoed back by parallelFanout
 * @param {object|null} s.verify    - tieredVerify's return, or null if verify never ran
 * @param {Array<{subQuestion:string}>} [s.sections] - sections the run intended to publish
 * @param {string} [s.report]       - the assembled prose, for stitch-completeness
 * @returns {{ok: boolean, failures: Array<{code:string, detail:string}>, warnings: Array<{code:string, detail:string}>}}
 */
export function checkRunHealth(s) {
  const failures = [];
  const warnings = [];

  // ── Model pin ────────────────────────────────────────────────────────────
  if ((s?.unitCount ?? 0) > PIN_REQUIRED_ABOVE_UNITS && (s?.modelTier ?? null) === null) {
    failures.push({
      code: 'model-pin-unset',
      detail: `${s.unitCount} units dispatched with modelTier: null — leaf agents inherit the caller's model`,
    });
  }

  // ── Verify signals ───────────────────────────────────────────────────────
  const v = s?.verify ?? null;
  if (v) {
    if (v.verifyEmptied === true) {
      failures.push({ code: 'verify-emptied', detail: 'verify judged nothing; findings are unverified' });
    }
    if (v.degraded === true) {
      // Reported on its own. A degraded verify already explains a zero coverage fraction, so the
      // coverage check below is skipped — two failures for one cause reads as two problems.
      failures.push({
        code: 'verify-degraded',
        detail: `verify fell back at tier: ${v.degradedAtTier ?? 'unknown'}`,
      });
    } else {
      for (const [code, key] of [
        ['triage-coverage', 'triageCoverage'],
        ['recheck-coverage', 'recheckCoverage'],
        ['consensus-coverage', 'consensusCoverage'],
      ]) {
        const frac = v.counts?.[key] ?? v[key];
        if (typeof frac === 'number' && frac < 1) {
          failures.push({ code, detail: `${key} = ${frac} — the tier did not cover every finding` });
        }
      }
    }
  }

  // ── Stitch completeness ──────────────────────────────────────────────────
  // Catches silent truncation exactly: a section the run paid to write that never reached the
  // assembled output. ~5 lines against data already in scope.
  if (Array.isArray(s?.sections) && typeof s?.report === 'string') {
    const missing = s.sections
      .map((x) => x?.subQuestion)
      .filter((q) => typeof q === 'string' && q.length > 0 && !s.report.includes(q));
    if (missing.length) {
      failures.push({
        code: 'stitch-incomplete',
        detail: `sections absent from the assembled report: ${missing.join('; ')}`,
      });
    }
  }

  return { ok: failures.length === 0, failures, warnings };
}
