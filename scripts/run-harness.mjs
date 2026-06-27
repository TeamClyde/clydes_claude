// Runnable fault-injection invariant report. Run: npm run harness
import { quorumBarrier } from './lib/fail-successfully.mjs';
import { injectStall, injectBadOutput, injectCrash, checkInvariants, passK } from './lib/fault-injection-harness.mjs';

// Baseline scenario: 6 units, mixed fault types, quorum 3, short timeouts.
function baselineScenario(trialIndex) {
  const units = [];
  for (let i = 0; i < 6; i++) {
    let work;
    if (i % 3 === 0) work = injectStall(trialIndex, i, { period: 4 });
    else if (i % 3 === 1) work = injectCrash(trialIndex, i, { period: 4 });
    else work = injectBadOutput(trialIndex, i, { period: 4 });
    units.push({ work, timeoutMs: 20, maxRetries: 0 });
  }
  return quorumBarrier(units, 3);
}

const K = 10;
const report = await passK(baselineScenario, K, { expectProgress: true });
const sample = await baselineScenario(0);
const inv = checkInvariants(sample, { expectProgress: true });

console.log('Fault-injection invariant harness — baseline scenario (6 units, quorum 3)');
console.log(`pass^k (invariants held across ${report.k} distinct fault patterns): ${report.passes}/${report.k}  passedAllK=${report.passedAllK}`);
console.log(`sample trial 0: confirmed=${sample.confirmed.length} degraded=${sample.degraded} counts=${JSON.stringify(sample.counts)}`);
console.log(`invariants: ${JSON.stringify(inv)}`);
console.log('NOTE: this measures FSM fault-coverage, NOT real-LLM reliability (that smoke is deferred to Wave 3).');
process.exitCode = report.passedAllK ? 0 : 1;
