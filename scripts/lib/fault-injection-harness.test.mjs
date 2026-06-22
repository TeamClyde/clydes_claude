import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quorumBarrier } from './fail-successfully.mjs';
import { injectStall, injectBadOutput, injectCrash, checkInvariants } from './fault-injection-harness.mjs';

test('injectStall: faults deterministically by (trial,unit) and is reproducible', async () => {
  const w = injectStall(0, 0, { period: 3 }); // (0+0)%3===0 → faulty (hangs)
  const race = await Promise.race([w(), new Promise((r) => setTimeout(() => r('timeout'), 20))]);
  assert.equal(race, 'timeout');
  const ok = injectStall(0, 1, { period: 3 }); // (0+1)%3!==0 → resolves
  assert.equal(await ok(), 'u1');
});

test('injectCrash: throws on the faulted (trial,unit), resolves otherwise', async () => {
  await assert.rejects(async () => injectCrash(0, 0, { period: 3 })());
  assert.equal(await injectCrash(0, 1, { period: 3 })(), 'u1');
});

test('injectBadOutput: yields null on the faulted (trial,unit)', async () => {
  assert.equal(await injectBadOutput(0, 0, { period: 3 })(), null);
  assert.deepEqual(await injectBadOutput(0, 1, { period: 3 })(), { ok: true, u: 1 });
});

test('checkInvariants: all hold for a healthy quorum result', async () => {
  const r = await quorumBarrier([{ work: async () => 'a', timeoutMs: 30 }], 1);
  const inv = checkInvariants(r, { expectProgress: true });
  assert.equal(inv.allHold, true);
});

test('checkInvariants: flags a malformed (broken) result', () => {
  const inv = checkInvariants({ nope: true }, { expectProgress: true });
  assert.equal(inv.validShape, false);
  assert.equal(inv.allHold, false);
});
