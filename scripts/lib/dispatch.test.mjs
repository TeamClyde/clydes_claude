import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parallelFanout, DEFAULT_POLICY } from './dispatch.mjs';

const tick = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));

test('DEFAULT_POLICY: conservative, runtime-derived-ish defaults', () => {
  assert.equal(DEFAULT_POLICY.maxInFlight, 8);
  assert.equal(DEFAULT_POLICY.budgetReserve, 0.9);
  assert.equal(DEFAULT_POLICY.tokenBudget, null);
});

test('parallelFanout: never exceeds maxInFlight concurrent', async () => {
  let inFlight = 0, maxSeen = 0;
  const mk = (i) => ({ work: async () => { inFlight++; maxSeen = Math.max(maxSeen, inFlight); await tick(5); inFlight--; return i; }, timeoutMs: 200 });
  await parallelFanout([0, 1, 2, 3, 4].map(mk), { maxInFlight: 2, perUnitTimeoutMs: 200 });
  assert.ok(maxSeen <= 2, `maxSeen=${maxSeen}`);
});

test('parallelFanout: confirms survivors and reports counts', async () => {
  const units = [
    { work: async () => 'a' },
    { work: async () => 'b' },
    { work: () => new Promise(() => {}), maxRetries: 0 }, // straggler
  ];
  const r = await parallelFanout(units, { maxInFlight: 3, perUnitTimeoutMs: 20, quorum: 2 });
  assert.deepEqual([...r.confirmed].sort(), ['a', 'b']);
  assert.equal(r.degraded, false);
  assert.equal(r.counts.ABANDONED, 1);
  assert.equal(r.abandoned, 1); // numeric abandoned field agrees with the counts aggregate
});

test('parallelFanout: post-hoc token gate stops launching new batches', async () => {
  let calls = 0;
  const units = [0, 1, 2, 3].map((i) => ({ work: async () => { calls++; return i; } }));
  const r = await parallelFanout(units, {
    maxInFlight: 1, perUnitTimeoutMs: 100, tokenBudget: 100, estimatedTokensPerUnit: 60, budgetReserve: 1,
  });
  assert.equal(r.stoppedReason, 'token-budget');
  assert.ok(calls < 4, `calls=${calls}`);
});

test('parallelFanout: getRemainingBudget drives the live gate', async () => {
  let remaining = 100;
  const units = [0, 1, 2, 3].map((i) => ({ work: async () => { remaining -= 60; return i; } }));
  const r = await parallelFanout(units, {
    maxInFlight: 1, perUnitTimeoutMs: 100, tokenBudget: 100, estimatedTokensPerUnit: 60,
    budgetReserve: 1, getRemainingBudget: () => remaining,
  });
  assert.equal(r.stoppedReason, 'token-budget');
  assert.equal(r.confirmed.length, 1); // only the first unit ran before the live gate fired
});

test('parallelFanout: throws if perUnitTimeoutMs is omitted (fast-fail, not silent timeout)', async () => {
  await assert.rejects(
    () => parallelFanout([{ work: async () => 'x' }], { maxInFlight: 1 }),
    /perUnitTimeoutMs is required/,
  );
});
