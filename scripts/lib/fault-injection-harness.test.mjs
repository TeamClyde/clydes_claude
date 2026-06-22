import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quorumBarrier } from './fail-successfully.mjs';
import { injectStall, injectBadOutput, injectCrash, checkInvariants, passK } from './fault-injection-harness.mjs';

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

test('passK: k/k when invariants hold every trial', async () => {
  // Plain always-succeed scenario (no injectors): every trial confirms → invariants hold.
  // NB: injector faults key on (trial+unit)%period===0, so trial 0 would spuriously fault a
  // (0,0) unit at any period — avoid the injectors here; the broken test below uses period:1.
  const healthy = () => quorumBarrier([{ work: async () => 'ok', timeoutMs: 30 }], 1);
  const r = await passK(healthy, 5, { expectProgress: true });
  assert.equal(r.passedAllK, true);
  assert.equal(r.passes, 5);
});

test('passK: < k when an expected invariant cannot hold (no progress possible)', async () => {
  // period 1 → every unit stalls every trial → zero confirmed → makesProgress fails when required
  const broken = (t) => quorumBarrier(
    [{ work: injectStall(t, 0, { period: 1 }), timeoutMs: 20, maxRetries: 0 }], 1);
  const r = await passK(broken, 5, { expectProgress: true });
  assert.equal(r.passedAllK, false);
  assert.ok(r.passes < 5);
});
