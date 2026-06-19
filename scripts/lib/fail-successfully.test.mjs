import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withWatchdog, runUnit, quorumBarrier } from './fail-successfully.mjs';

const tick = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));
const hang = () => new Promise(() => {}); // never resolves

test('withWatchdog: work resolves before deadline → { outcome: "done", value }', async () => {
  const r = await withWatchdog(() => tick(5, 'ok'), 50);
  assert.deepEqual(r, { outcome: 'done', value: 'ok' });
});

test('withWatchdog: deadline passes first → { outcome: "timeout" } (never rejects)', async () => {
  const r = await withWatchdog(hang, 10);
  assert.deepEqual(r, { outcome: 'timeout' });
});

test('withWatchdog: work throws → { outcome: "error" }', async () => {
  const r = await withWatchdog(async () => { throw new Error('boom'); }, 50);
  assert.equal(r.outcome, 'error');
});

test('runUnit: immediate value → SUCCEEDED with value', async () => {
  const r = await runUnit({ work: async () => 'ok', timeoutMs: 50 });
  assert.equal(r.state, 'SUCCEEDED');
  assert.equal(r.value, 'ok');
});

test('runUnit: resolves after delay < deadline → SUCCEEDED', async () => {
  const r = await runUnit({ work: () => tick(10, 'ok'), timeoutMs: 100 });
  assert.equal(r.state, 'SUCCEEDED');
  assert.equal(r.value, 'ok');
});

test('runUnit: hang → watchdog → ABANDONED, and the call terminates (liveness)', async () => {
  const r = await runUnit({ work: hang, timeoutMs: 20, maxRetries: 1 });
  assert.equal(r.state, 'ABANDONED');
  assert.ok(r.history.includes('TIMED_OUT'));
});

test('runUnit: crash → FAILED, retried (budget actually consumed), then ABANDONED', async () => {
  let calls = 0;
  const r = await runUnit({ work: async () => { calls++; throw new Error('boom'); }, timeoutMs: 50, maxRetries: 1 });
  assert.equal(r.state, 'ABANDONED');
  assert.equal(calls, 2); // initial attempt + one retry — proves the budget was used, not immediate abandon
  assert.equal(r.history.filter((s) => s === 'FAILED').length, 2);
});

test('runUnit: malformed then valid on retry → RETRYING(repair) → SUCCEEDED with repair injected', async () => {
  let calls = 0;
  const r = await runUnit({
    work: async (repair) => { calls++; return calls === 1 ? { ok: false } : { ok: true, sawRepair: repair }; },
    validate: (v) => v.ok ? { ok: true } : { ok: false, reason: 'missing ok' },
    timeoutMs: 50, maxRetries: 1,
  });
  assert.equal(r.state, 'SUCCEEDED');
  assert.ok(r.history.includes('RETRYING'));
  assert.equal(r.value.sawRepair, 'missing ok'); // validation reason fed back as repair context
});

test('quorumBarrier: K of N hang, rest succeed → proceeds on survivors, non-lossy', async () => {
  const units = [
    { work: async () => 'a', timeoutMs: 30 },
    { work: async () => 'b', timeoutMs: 30 },
    { work: () => new Promise(() => {}), timeoutMs: 20, maxRetries: 0 }, // straggler
  ];
  const { confirmed, abandoned, degraded } = await quorumBarrier(units, 2);
  assert.deepEqual([...confirmed].sort(), ['a', 'b']); // survivors' work preserved (non-lossiness)
  assert.equal(abandoned, 1);
  assert.equal(degraded, false); // 2 confirmed ≥ threshold 2
});

test('quorumBarrier: below threshold → degraded flagged but still returns (no deadlock)', async () => {
  const units = [
    { work: async () => 'a', timeoutMs: 30 },
    { work: () => new Promise(() => {}), timeoutMs: 20, maxRetries: 0 },
    { work: () => new Promise(() => {}), timeoutMs: 20, maxRetries: 0 },
  ];
  const { confirmed, degraded } = await quorumBarrier(units, 2);
  assert.deepEqual(confirmed, ['a']);
  assert.equal(degraded, true); // 1 < threshold 2 — reported, not thrown
});
