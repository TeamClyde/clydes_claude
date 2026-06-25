// verify-conformance.mjs — B-conformance guard.
// Asserts VERIFY_PROTOCOL (runtime) deep-equals the param block in verify-protocol.md (doc).
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

/**
 * Parse the ## Machine-readable param block JSON from verify-protocol.md.
 * @returns {object}
 */
export function readDocProtocol() {
  const mdPath = fileURLToPath(
    new URL('../skills/dispatching-parallel-agents/references/verify-protocol.md', import.meta.url),
  );
  const src = readFileSync(mdPath, 'utf8');
  const parts = src.split(/^## Machine-readable param block$/m);
  if (parts.length < 2) throw new Error('verify-protocol.md: "## Machine-readable param block" heading not found');
  const slice = parts[1].split(/^## /m)[0];
  const m = slice.match(/```json\s*([\s\S]*?)```/);
  if (!m) throw new Error('verify-protocol.md: json block not found under ## Machine-readable param block');
  return JSON.parse(m[1]);
}

/**
 * Assert that `a` deep-equals `b`. Throws on mismatch.
 * @param {object} a
 * @param {object} b
 */
export function assertConformant(a, b) {
  assert.deepStrictEqual(a, b);
}

// When run as main: node scripts/verify-conformance.mjs
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { VERIFY_PROTOCOL } = await import('./lib/verify.mjs');
  try {
    assertConformant(VERIFY_PROTOCOL, readDocProtocol());
    console.log('verify:check OK — VERIFY_PROTOCOL conforms to verify-protocol.md');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
