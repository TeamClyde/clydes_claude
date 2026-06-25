import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyIntegrity } from './check.mjs';

const recallRoot = fileURLToPath(new URL('.', import.meta.url));
const registry = JSON.parse(readFileSync(new URL('./registry.json', import.meta.url), 'utf8'));

test('verifyIntegrity returns ok:true when all fixtures are present with correct hashes', () => {
  const result = verifyIntegrity(registry, recallRoot);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.failures, []);
});

test('verifyIntegrity returns ok:false with failures when a sha256 is wrong', () => {
  const tampered = registry.map((entry, i) =>
    i === 0 ? { ...entry, sha256: 'deadbeef'.repeat(8) } : entry,
  );
  const result = verifyIntegrity(tampered, recallRoot);
  assert.strictEqual(result.ok, false);
  assert.ok(result.failures.length > 0, 'expected at least one failure');
  assert.ok(result.failures[0].id === tampered[0].id || result.failures[0].fixture === tampered[0].fixture);
});

test('verifyIntegrity returns ok:false with failures when a fixture path is wrong', () => {
  const missing = registry.map((entry, i) =>
    i === 1 ? { ...entry, fixture: 'fixtures/code-review/does-not-exist.mjs' } : entry,
  );
  const result = verifyIntegrity(missing, recallRoot);
  assert.strictEqual(result.ok, false);
  assert.ok(result.failures.length > 0, 'expected at least one failure');
});
