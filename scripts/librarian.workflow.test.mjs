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
  assert.match(BODY, /const MAX_CONCURRENT = \(cap && cap > 0\) \? Math\.min\(Math\.floor\(cap\), 16\) : 8;/);
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
  // `^ {0,2}return \{` not `^\s*return \{`: the two gate returns sit inside `if` blocks (2-space
  // indent) and the success return sits at column zero, so anchoring at 0-2 leading spaces catches
  // exactly those three. A bare `\s*` anchor also catches the `return {` control-flow statements
  // inside sectionUnits' nested `validate` (Task 4, indented 4-6 spaces) — those are parallelFanout
  // validation signals, not workflow exit paths, and were never meant to carry evidenceState.
  const returns = BODY.match(/^ {0,2}return \{/gm) ?? [];
  const states = BODY.match(/evidenceState/g) ?? [];
  assert.ok(returns.length >= 3, 'expect the two gate returns plus the success return');
  assert.ok(states.length >= returns.length, 'each return must carry an evidenceState');
});

test('args.now is the only time source — Date.now() throws in the Workflow sandbox', () => {
  // Strip `//` comment lines first. These regexes look for CALLS; without the strip they also match
  // the API names written as prose, so a future editor explaining the constraint in a comment would
  // break the build. (That already happened once: the sandbox note above the destructure had to be
  // reworded to drop its parentheses.) Line-level stripping is enough — this file has no block
  // comments, and a `//` inside a string would at worst hide a call from the check, never invent one.
  const CODE = BODY.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(CODE, /Date\.now\(\)/);
  assert.doesNotMatch(CODE, /new Date\(\s*\)/);
  assert.doesNotMatch(CODE, /Math\.random\(\)/);
  assert.match(BODY, /runDate: now \?\? null/);
});

test('section watchdog is 600s — 240s abandoned units that were still paid for (#152.1)', () => {
  assert.match(BODY, /perUnitTimeoutMs: 600_000, maxInFlight: Math\.min\(sections\.length, MAX_CONCURRENT\)/);
  assert.doesNotMatch(BODY, /perUnitTimeoutMs: 240_000/);
});

test('the section validation budget is 2, read from one named constant', () => {
  // The plan asserted /maxValidationRetries: 2/, which cannot match: Step 3 introduces a named
  // constant precisely so Task 8's lastAttempt check cannot drift from the policy value, so the
  // call site reads the identifier and the literal 2 lives only in the declaration. Assert both
  // halves — the value AND the wiring — or the constant could be right while nothing reads it.
  assert.match(BODY, /const SECTION_VALIDATION_RETRIES = 2;/);
  assert.match(BODY, /maxValidationRetries: SECTION_VALIDATION_RETRIES/);
});

test('the no-publish constraint is on the SECTION prompt, not only the assembly stage (#152.3)', () => {
  const sectionPromptBlock = BODY.slice(BODY.indexOf('const sectionPrompt'), BODY.indexOf('const SECTION_VALIDATION_RETRIES'));
  // Matched within a single template literal. The plan asserted the full sentence
  // "Do NOT publish it, do NOT create or update an Artifact", which spans a concatenation
  // boundary (`…do NOT create or ` + `update an Artifact…`) and therefore never appears
  // contiguously in the source text.
  assert.match(sectionPromptBlock, /Do NOT publish it, do NOT create or/);
  assert.match(sectionPromptBlock, /update an Artifact, do NOT design a web page/);
  assert.match(sectionPromptBlock, /Do NOT write source URLs/);
  // Same concatenation-boundary trap as the publish constraint above: the source reads
  // `…do NOT summarize, compress, ` +\n  `abbreviate, or produce a digest…`, so the full sentence
  // never appears contiguously either. Split within each literal, same as the publish assertion.
  assert.match(sectionPromptBlock, /do NOT summarize, compress,/);
  assert.match(sectionPromptBlock, /abbreviate, or produce a digest/);
});

test('section validation calls the deterministic URL-membership check', () => {
  assert.match(BODY, /unknownUrls\(v\.markdown, section\.findings\)/);
});
