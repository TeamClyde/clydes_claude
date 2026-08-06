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
  // Excise the sectionUnits block first: its `validate` returns are validation CONTROL FLOW, not
  // exit paths, and counting them compares unrelated things. Marker-slicing rather than an
  // indent-depth regex — indentation is a layout accident, so extracting `validate` to a top-level
  // function, or nesting a real exit path one level deeper, would silently reclassify returns with
  // no test signal. This file already uses the marker-slice technique for sectionPromptBlock.
  const unitsStart = BODY.indexOf('const sectionUnits = sections.map(');
  const unitsEnd = BODY.indexOf('const sectionReview =');
  assert.ok(unitsStart !== -1 && unitsEnd > unitsStart, 'sectionUnits block markers must resolve');
  const EXIT_SCOPE = BODY.slice(0, unitsStart) + BODY.slice(unitsEnd);

  const exits = EXIT_SCOPE.split(/^\s*return \{/m).slice(1);
  assert.equal(exits.length, 3, 'two gate returns plus the success return');

  // Per-return, NOT a bulk count. The previous `states.length >= returns.length` form had slack —
  // the success path mentions evidenceState twice (the const, then the shorthand) — so a fourth
  // exit path carrying NO evidenceState still passed. That was proven by construction in review,
  // and it is the exact hole this assertion exists to close: #96 is a sad path that failed to
  // report why. The 300-char window is ~3x the measured worst case (evidenceState lands at offset
  // 41-100 in all three returns, since it is an early field) and is bounded deliberately, so a
  // mention far downstream cannot satisfy a return that omits it.
  for (const [i, chunk] of exits.entries()) {
    assert.match(chunk.slice(0, 300), /evidenceState/, `exit path ${i + 1} omits evidenceState`);
  }
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

test('the stitcher agent is gone — assembly is concatenation (#152.2)', () => {
  assert.doesNotMatch(BODY, /label: 'synth:stitch'/);
  assert.doesNotMatch(BODY, /Stitch the sections below together/);
  assert.match(BODY, /const body = orderedSections\s*\n?\s*\.map/);
  assert.match(BODY, /const report = `\$\{banner\}\$\{body\}/);
});

test('exactly ONE agent remains in the assembly path, fed the digest not the prose', () => {
  // Bounded at BOTH ends. Open-ended to EOF would make this assert "no agent call anywhere below",
  // so an unrelated later addition would fail it with a bare count mismatch and no clue why.
  const start = BODY.indexOf('const body = orderedSections');
  const end = BODY.indexOf('const report = `');
  assert.ok(start !== -1 && end > start, 'assembly block boundaries must resolve');
  const assembly = BODY.slice(start, end);
  assert.equal((assembly.match(/await agent\(/g) ?? []).length, 1);
  assert.match(assembly, /FINDINGS DIGEST: \$\{JSON\.stringify\(digest\)\}/);
  assert.doesNotMatch(assembly, /JSON\.stringify\(orderedSections\)/);
});

test('the unanswered-brief notice is built in code and leads the report (#96)', () => {
  // Prepended by code rather than requested of the closing agent, whose text is guaranteed to land
  // last — so "open the report with this" was unsatisfiable as an instruction.
  assert.match(BODY, /const banner = gaps\.length/);
  assert.match(BODY, /const report = `\$\{banner\}\$\{body\}/);
  const bannerBlock = BODY.slice(BODY.indexOf('const gaps = []'), BODY.indexOf('const report = `'));
  assert.match(bannerBlock, /missingSubQuestions\.length/);
  assert.match(bannerBlock, /missingSections\.length/);
});

// ── Task 8 — L2 section audit ───────────────────────────────────────────────

test('section validation runs L1 before L2 — the free check gates the paid one', () => {
  const validateBlock = BODY.slice(BODY.indexOf('validate: async (v) => {'), BODY.indexOf('work: async (repair)'));
  const l1 = validateBlock.indexOf('unknownUrls(');
  // The L2 marker is `withWatchdog(`, NOT `await agent(` — the audit call is a thunk passed to the
  // watchdog (`() => agent(`), so no `await agent(` exists here. Asserting on the un-wrapped shape
  // would fail against the only correct implementation.
  const l2 = validateBlock.indexOf('withWatchdog(');
  assert.ok(l1 !== -1 && l2 !== -1, 'both layers must exist');
  assert.ok(l1 < l2, 'the deterministic check must precede the audit agent');
});

test('repair exhaustion KEEPS the section and records integrity — never drops it (#96)', () => {
  assert.match(BODY, /integrity\.push\(\{ subQuestion: section\.subQuestion/);
  const validateBlock = BODY.slice(BODY.indexOf('validate: async (v) => {'), BODY.indexOf('work: async (repair)'));
  // BOTH validation layers preserve on exhaustion — L1 (stray URL) and L2 (untraceable claim).
  assert.equal((validateBlock.match(/if \(lastAttempt\) \{/g) ?? []).length, 2);
});

test('validate takes ONE argument and counts attempts in a closure, never via ctx', () => {
  // runUnit calls `await validate(res.value)` — one argument (fail-successfully.mjs:88). A
  // `ctx.attempt` read here is undefined forever, which would make the keep-and-flag branch
  // unreachable and silently drop sections — the #96 failure this branch exists to prevent.
  assert.doesNotMatch(BODY, /validate: async \(v, ctx\)/);
  assert.doesNotMatch(BODY, /ctx\?\.attempt/);
  assert.match(BODY, /let attempts = 0;/);
});

test('the last-attempt threshold DERIVES from the retry budget — no magic number to drift', () => {
  assert.match(BODY, /const SECTION_VALIDATION_RETRIES = 2;/);
  assert.match(BODY, /const lastAttempt = attempts >= SECTION_VALIDATION_RETRIES \+ 1;/);
  assert.match(BODY, /maxValidationRetries: SECTION_VALIDATION_RETRIES/);
});

test('the audit agent inside validate is watchdog-bounded and fails OPEN', () => {
  // runUnit watchdog-wraps only work() (fail-successfully.mjs:76); validate is awaited bare at
  // :88. quorumBarrier is a plain Promise.all (:118) that depends on runUnit never hanging or
  // rejecting — so an unwrapped agent call here would stall or kill the whole section batch.
  assert.match(BODY, /const audit = await withWatchdog\(\s*\n?\s*\(\) => agent\(/);
  assert.match(BODY, /AUDIT_TIMEOUT_MS/);
  assert.match(BODY, /if \(audit\.outcome !== 'done'\) \{[\s\S]*?return \{ ok: true \};/,
    'an audit that could not run keeps the section and records that it was unaudited');
  assert.match(BODY, /audit\.value\?\.untraceable/, 'withWatchdog returns a discriminated result, not the value');
});

test('the auditor judges traceability only — never truth, never new research', () => {
  // Seam-tolerant: the phrase spans a template-literal concatenation boundary (` + \n + `), so a
  // contiguous regex cannot match it. Where the prompt happens to wrap is layout, not intent — the
  // bounded gap keeps the assertion about the instruction rather than about the line width.
  assert.match(BODY, /do NOT judge whether[\s\S]{0,40}a claim is TRUE in the world/);
});

// ── Task 9 — supersession pass ──────────────────────────────────────────────

test('the supersession pass is skipped entirely on a new topic', () => {
  assert.match(BODY, /if \(priorFindings\.length\) \{/);
  assert.match(BODY, /let supersedes = \[\];/);
});

test('supersession compares claims to claims, so its input does not grow with dossier length', () => {
  const block = BODY.slice(BODY.indexOf('const priorDigest'), BODY.indexOf("label: 'synth:supersede'"));
  assert.match(block, /\.map\(\(f\) => \(\{ runDate: f\.runDate, claim: f\.claim \}\)\)/);
  assert.doesNotMatch(block, /markdown/);
});

test('an already-superseded claim cannot be superseded twice', () => {
  assert.match(BODY, /\.filter\(\(f\) => !f\.supersededBy\)/);
});
