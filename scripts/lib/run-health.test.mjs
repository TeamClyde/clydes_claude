import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRunHealth } from './run-health.mjs';

const clean = {
  unitCount: 9,
  modelTier: 'sonnet',
  verify: { triageCoverage: 1, recheckCoverage: 1, consensusCoverage: 1, verifyEmptied: false, degraded: false },
  sections: [{ subQuestion: 'Q1' }],
  report: 'A report mentioning Q1 in full.',
};

test('a clean run is ok with no failures', () => {
  const r = checkRunHealth(clean);
  assert.equal(r.ok, true);
  assert.deepEqual(r.failures, []);
});

test('an unset model pin fails once the fan-out exceeds 10 units', () => {
  const r = checkRunHealth({ ...clean, unitCount: 11, modelTier: null });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.code === 'model-pin-unset'));
});

test('an unset model pin is NOT a failure on a small fan-out', () => {
  const r = checkRunHealth({ ...clean, unitCount: 3, modelTier: null });
  assert.equal(r.ok, true);
});

test('verifyEmptied fails', () => {
  const r = checkRunHealth({ ...clean, verify: { ...clean.verify, verifyEmptied: true } });
  assert.ok(r.failures.some((f) => f.code === 'verify-emptied'));
});

test('partial triage coverage fails and reports the fraction', () => {
  const r = checkRunHealth({ ...clean, verify: { ...clean.verify, triageCoverage: 0.5 } });
  const f = r.failures.find((x) => x.code === 'triage-coverage');
  assert.ok(f);
  assert.match(f.detail, /0\.5/);
});

test('a section missing from the report fails as stitch-incomplete', () => {
  const r = checkRunHealth({ ...clean, sections: [{ subQuestion: 'Q1' }, { subQuestion: 'Q2' }] });
  assert.ok(r.failures.some((f) => f.code === 'stitch-incomplete'));
});

test('a degraded verify is reported but does not double-count as triage-coverage', () => {
  const r = checkRunHealth({ ...clean, verify: { ...clean.verify, degraded: true, triageCoverage: 0 } });
  assert.ok(r.failures.some((f) => f.code === 'verify-degraded'));
  assert.ok(!r.failures.some((f) => f.code === 'triage-coverage'),
    'a degraded verify already explains zero coverage — do not report both');
});

test('a null verify (verify never ran) is tolerated, not crashed on', () => {
  const r = checkRunHealth({ ...clean, verify: null });
  assert.equal(typeof r.ok, 'boolean');
});
