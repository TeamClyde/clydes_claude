// scripts/orchestration-audit.workflow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('./orchestration-audit.workflow.mjs', import.meta.url)), 'utf8');

test('input is declared before its first use (TDZ guard — regression for A1)', () => {
  const declIdx = SRC.search(/const\s+input\s*=\s*typeof\s+args/);
  const useIdx  = SRC.search(/\binput\.cap\b/);
  assert.ok(declIdx !== -1, 'const input declaration must exist');
  assert.ok(useIdx !== -1, 'input.cap usage must exist');
  assert.ok(declIdx < useIdx, `const input (idx ${declIdx}) must be declared before first use input.cap (idx ${useIdx})`);
});

test('the audit consumer forwards degradedAtTier (#119) — a consumer-body edit no gate covers', () => {
  // Slice from the end marker so the assertion cannot match inside the GENERATED block and pass
  // vacuously — the generated engine defines degradedAtTier, the consumer body must forward it.
  const BODY = SRC.slice(SRC.indexOf('// <ENGINE-BUNDLE:end>'));
  assert.match(BODY, /verifyDegradedAtTier: verified\.degradedAtTier/);
});
