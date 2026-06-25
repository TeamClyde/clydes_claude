import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parallelFanout, sequentialChain, dimensionalReview, DEFAULT_POLICY } from './dispatch.mjs';

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

test('sequentialChain: chains prior output and halts on abandon', async () => {
  const steps = [
    { work: async (prior) => (prior ?? 0) + 1 },          // undefined → 1
    { work: async (prior) => prior + 10 },                // 1 → 11
    { work: async () => { throw new Error('boom'); }, maxRetries: 0 }, // abandons
    { work: async (prior) => prior + 100 },               // never runs
  ];
  const r = await sequentialChain(steps, { perUnitTimeoutMs: 50 });
  assert.equal(r.completed, 2);
  assert.equal(r.stoppedReason, 'abandoned');
  assert.equal(r.results[1].value, 11);
  assert.equal(r.results.length, 3); // 2 succeeded + 1 abandoned; 4th not run
});

test('dimensionalReview: fans out lenses and runs a single batched verify', async () => {
  let verifyCalls = 0;
  const dims = [
    { work: async () => ['a', 'b'] },
    { work: async () => ['c'] },
  ];
  const r = await dimensionalReview(dims, {
    perUnitTimeoutMs: 50,
    verify: async (findings) => { verifyCalls++; return findings.filter((f) => f !== 'b'); },
  });
  assert.equal(verifyCalls, 1); // batched: ONE verify over all findings (not per-finding)
  assert.deepEqual([...r.findings].sort(), ['a', 'c']);
});

test('sequentialChain: throws if perUnitTimeoutMs is omitted (fast-fail)', async () => {
  await assert.rejects(
    () => sequentialChain([{ work: async () => 'x' }], {}),
    /perUnitTimeoutMs is required/,
  );
});

test('parallelFanout: degraded=true when quorum=0 but a unit abandoned (zero-quorum does not mask abandons)', async () => {
  // With an explicit quorum:0, confirmed.length < 0 is always false — the extra check catches the abandon.
  const units = [
    { work: async () => 'ok' },
    { work: () => new Promise(() => {}), maxRetries: 0 }, // straggler → abandoned
  ];
  const r = await parallelFanout(units, { maxInFlight: 2, perUnitTimeoutMs: 20, quorum: 0 });
  assert.equal(r.abandoned, 1, 'one unit abandoned');
  assert.equal(r.degraded, true, 'degraded must be true when quorum=0 but an abandon occurred');
});

test('parallelFanout: token gate is inert when estimatedTokensPerUnit=0 (est unknown → gate disabled)', async () => {
  let calls = 0;
  const units = [0, 1, 2, 3].map((i) => ({ work: async () => { calls++; return i; } }));
  // tokenBudget set but est=0 and no getRemainingBudget → gate must NOT arm → all units run
  const r = await parallelFanout(units, {
    maxInFlight: 4, perUnitTimeoutMs: 100, tokenBudget: 1, estimatedTokensPerUnit: 0,
  });
  assert.equal(r.stoppedReason, undefined, 'gate must not fire when est=0 and no live budget');
  assert.equal(calls, 4, 'all units must run when gate is disabled');
});

test('dimensionalReview: flags verifyDegraded and keeps unverified findings when verify abandons', async () => {
  const dims = [{ work: async () => ['a'] }, { work: async () => ['b'] }];
  const r = await dimensionalReview(dims, {
    perUnitTimeoutMs: 30, maxRetries: 0,
    verify: async () => { throw new Error('verify boom'); },
  });
  assert.equal(r.verifyDegraded, true);
  assert.deepEqual([...r.findings].sort(), ['a', 'b']); // unfiltered pre-verify findings retained
});
