import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBundle } from './build-engine-bundle.mjs';

test('bundle has no import/export and exposes a working parallelFanout', async () => {
  const block = await buildBundle();            // returns the inlinable source string
  assert.ok(!/\bimport\b/.test(block), 'bundle must contain no import');
  assert.ok(!/\bexport\b/.test(block), 'bundle must contain no export');
  // eval the block in a fresh scope (mimics the sandbox: no module system), then exercise it
  const fn = new Function(`${block}\n return { parallelFanout, runUnit, quorumBarrier };`);
  const { parallelFanout } = fn();
  const units = [{ work: () => 1 }, { work: () => 2 }];
  const r = await parallelFanout(units, { perUnitTimeoutMs: 1000 });
  assert.equal(r.confirmed.length, 2);
  assert.equal(r.degraded, false);
});
