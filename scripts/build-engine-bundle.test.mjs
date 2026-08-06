import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildBundle } from './build-engine-bundle.mjs';
import { buildExtras, EXTRAS, extrasMarkers } from './build-engine-bundle.mjs';

test('bundle has no import/export and exposes a working parallelFanout', async () => {
  const block = await buildBundle();            // returns the inlinable source string
  assert.ok(!/^\s*import\s/m.test(block), 'bundle must contain no import statement');
  assert.ok(!/^\s*export\s/m.test(block), 'bundle must contain no export statement');
  // eval the block in a fresh scope (mimics the sandbox: no module system), then exercise it
  const fn = new Function(`${block}\n return { parallelFanout, runUnit, quorumBarrier };`);
  const { parallelFanout } = fn();
  const units = [{ work: () => 1 }, { work: () => 2 }];
  const r = await parallelFanout(units, { perUnitTimeoutMs: 1000 });
  assert.equal(r.confirmed.length, 2);
  assert.equal(r.degraded, false);
});

test('bundle exposes a working tieredVerify with VERIFY_PROTOCOL', async () => {
  const block = await buildBundle();
  // tieredVerify + VERIFY_PROTOCOL are first-class bundle components — smoke-test that the
  // concat/strip left them callable (guards against an omitted const or a scoping defect).
  const fn = new Function(`${block}\n return { tieredVerify, VERIFY_PROTOCOL };`);
  const { tieredVerify, VERIFY_PROTOCOL } = fn();
  assert.equal(VERIFY_PROTOCOL.consensus.surviveAtLeast, 2);
  // a `supported` finding survives Tier 1 with no escalation (one batched triage call)
  const agent = async (prompt, opts) =>
    opts.label === 'verify:triage' ? { verdicts: [{ index: 0, support: 'supported' }] } : {};
  const out = await tieredVerify(
    [{ id: 'x', where: 'a.mjs:1', summary: 's' }],
    { profile: 'audit', agent, perTierTimeoutMs: 1000 },
  );
  assert.equal(out.findings.length, 1);
  assert.equal(out.degraded, false);
});

test('librarian extras block is import/export-free and exposes the core helpers', async () => {
  const block = await buildExtras('./librarian.workflow.mjs');
  assert.ok(block, 'librarian.workflow.mjs must have an extras block');
  assert.ok(!/^\s*import\s/m.test(block), 'extras block must contain no import statement');
  assert.ok(!/^\s*export\s/m.test(block), 'extras block must contain no export statement');
  const fn = new Function(`${block}\n return { assessCoverage, deriveEvidenceState, unknownUrls };`);
  const { assessCoverage } = fn();
  assert.equal(assessCoverage(['a', 'b'], [{ subQuestion: 'a' }]).ok, false);
});

test('orchestration-audit has NO extras block — librarian helpers stay out of it', async () => {
  assert.equal(await buildExtras('./orchestration-audit.workflow.mjs'), null);
});

test('every EXTRAS target carries its marker pair (a missing pair would silently skip injection)', () => {
  for (const [target, spec] of Object.entries(EXTRAS)) {
    const src = readFileSync(fileURLToPath(new URL(target, import.meta.url)), 'utf8');
    assert.ok(src.includes(`// <${spec.name}:start>`), `${target} missing <${spec.name}:start>`);
    assert.ok(src.includes(`// <${spec.name}:end>`), `${target} missing <${spec.name}:end>`);
  }
});

test('an EXTRAS name with a regex metacharacter is rejected loudly, not silently mismatched', () => {
  // The name is interpolated into `new RegExp` in inject(); a metacharacter would change matching
  // semantics rather than fail, and `engine:check` cannot catch a skipped injection because it
  // produces no git diff. So the guard must throw.
  assert.throws(() => extrasMarkers('BAD.NAME'), /must match/);
  assert.throws(() => extrasMarkers('BAD+NAME'), /must match/);
  assert.deepEqual(extrasMarkers('LIBRARIAN-CORE'), {
    start: '// <LIBRARIAN-CORE:start>',
    end: '// <LIBRARIAN-CORE:end>',
  });
});
