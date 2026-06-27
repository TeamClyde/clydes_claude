// check.mjs — B-recall integrity guard.
// Verifies that all recall fixtures are present and their contents match the registry SHA-256.
// No-forget guarantee: fixtures can't silently drift without this check failing.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Verify that every registry entry's fixture exists and its SHA-256 matches.
 *
 * @param {Array<{id: string, fixture: string, sha256: string}>} registry
 * @param {string} root - absolute path to the recall directory (fixtures are relative to this)
 * @returns {{ ok: boolean, failures: Array<{id: string, fixture: string, reason: string}> }}
 */
export function verifyIntegrity(registry, root) {
  const failures = [];
  for (const entry of registry) {
    const abs = join(root, entry.fixture);
    if (!existsSync(abs)) {
      failures.push({ id: entry.id, fixture: entry.fixture, reason: 'missing' });
      continue;
    }
    const actual = createHash('sha256').update(readFileSync(abs)).digest('hex');
    if (actual !== entry.sha256) {
      failures.push({ id: entry.id, fixture: entry.fixture, reason: `hash mismatch: expected ${entry.sha256}, got ${actual}` });
    }
  }
  return { ok: failures.length === 0, failures };
}

// When run as main: node scripts/recall/check.mjs
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const recallRoot = fileURLToPath(new URL('.', import.meta.url));
  const registry = JSON.parse(readFileSync(new URL('./registry.json', import.meta.url), 'utf8'));
  const { ok, failures } = verifyIntegrity(registry, recallRoot);
  if (ok) {
    console.log(`recall:check OK — all ${registry.length} fixtures present and unmodified`);
    process.exit(0);
  } else {
    console.error(`recall:check FAIL — ${failures.length} integrity failure(s):`);
    for (const f of failures) {
      console.error(`  [${f.id}] ${f.fixture}: ${f.reason}`);
    }
    process.exit(1);
  }
}
