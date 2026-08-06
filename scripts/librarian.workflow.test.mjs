// scripts/librarian.workflow.test.mjs
// The workflow file cannot be imported — it reads top-level `args`/`agent` globals and ends in a
// top-level `return`, so `import()` throws and `node --check` reports a false syntax error. Its
// pure logic lives in lib/librarian-core.mjs and is unit-tested there; what remains testable here
// is the WIRING: that the gates are present, in order, and reading the right values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('./librarian.workflow.mjs', import.meta.url)), 'utf8');
// Consumer body only — everything after the generated blocks. Asserting against the whole file
// would match text inside the inlined librarian-core copy and pass vacuously.
const BODY = SRC.slice(SRC.indexOf('// <LIBRARIAN-CORE:end>'));

test('the LIBRARIAN-CORE marker pair is present and non-empty', () => {
  const start = SRC.indexOf('// <LIBRARIAN-CORE:start>');
  const end = SRC.indexOf('// <LIBRARIAN-CORE:end>');
  assert.ok(start !== -1 && end !== -1, 'both markers must exist');
  assert.ok(end - start > 500, 'the block must be filled — run `npm run build:engine`');
});

test('input is destructured before its first use (TDZ guard)', () => {
  const declIdx = BODY.search(/const\s+input\s*=\s*typeof\s+args/);
  const useIdx = BODY.search(/\bMAX_CONCURRENT\b/);
  assert.ok(declIdx !== -1 && useIdx !== -1);
  assert.ok(declIdx < useIdx, 'const input must be declared before MAX_CONCURRENT reads cap');
});

test('args.cap feeds maxInFlight — the >8 batching cliff is caller-controlled', () => {
  assert.match(BODY, /const MAX_CONCURRENT = \(cap && cap > 0\) \? cap : 8;/);
  assert.match(BODY, /maxInFlight: Math\.min\(subQuestions\.length, MAX_CONCURRENT\)/);
  assert.doesNotMatch(BODY, /maxInFlight: Math\.min\(subQuestions\.length, 8\)/,
    'the hardcoded 8 must be gone — it is a moved cliff, not a removed one');
});

test('the coverage gate runs BEFORE tieredVerify, so a failed brief costs no verify spend', () => {
  const gateIdx = BODY.indexOf('assessCoverage(subQuestions, allFindings)');
  const verifyIdx = BODY.indexOf('await tieredVerify(');
  assert.ok(gateIdx !== -1, 'coverage gate must exist');
  assert.ok(verifyIdx !== -1, 'tieredVerify call must exist');
  assert.ok(gateIdx < verifyIdx, 'the gate must precede verify — that is the point of the gate');
});

test('the coverage gate early-returns rather than falling through', () => {
  assert.match(BODY, /if \(!coverage\.ok\) \{[\s\S]{0,600}?stoppedAt: 'coverage-gate'/);
});

test('the evidence floor runs after verify and before the synthesis phase', () => {
  const floorIdx = BODY.indexOf("stoppedAt: 'evidence-floor'");
  const synthIdx = BODY.indexOf("phase('Synthesize')");
  assert.ok(floorIdx !== -1, 'evidence floor must exist');
  assert.ok(floorIdx < synthIdx, 'nothing may reach synthesis over an empty vetted set');
});

test('every exit path reports evidenceState — trust signals are never omitted on the sad path', () => {
  // `^\s*return \{` not `^return \{`: the two gate returns sit inside `if` blocks and are indented,
  // so a column-zero anchor would see only the final top-level return and pass vacuously at 1.
  const returns = BODY.match(/^\s*return \{/gm) ?? [];
  const states = BODY.match(/evidenceState/g) ?? [];
  assert.ok(returns.length >= 3, 'expect the two gate returns plus the success return');
  assert.ok(states.length >= returns.length, 'each return must carry an evidenceState');
});

test('args.now is the only time source — Date.now() throws in the Workflow sandbox', () => {
  assert.doesNotMatch(BODY, /Date\.now\(\)/);
  assert.doesNotMatch(BODY, /new Date\(\s*\)/);
  assert.doesNotMatch(BODY, /Math\.random\(\)/);
  assert.match(BODY, /runDate: now \?\? null/);
});
