import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertConformant, readDocProtocol } from './verify-conformance.mjs';
import { VERIFY_PROTOCOL } from './lib/verify.mjs';

test('verify.mjs VERIFY_PROTOCOL conforms to verify-protocol.md', () => {
  assert.doesNotThrow(() => assertConformant(VERIFY_PROTOCOL, readDocProtocol()));
});
test('a mutated protocol fails conformance', () => {
  const bad = JSON.parse(JSON.stringify(VERIFY_PROTOCOL));
  bad.consensus.surviveAtLeast = 1;
  assert.throws(() => assertConformant(bad, readDocProtocol()));
});
