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

test('all three exits share ONE contract — a caller never branches on which gate stopped the run', () => {
  // Excise the sectionUnits block first: its `validate` returns are validation CONTROL FLOW, not
  // exit paths, and counting them compares unrelated things. Marker-slicing rather than an
  // indent-depth regex — indentation is a layout accident, so extracting `validate` to a top-level
  // function, or nesting a real exit path one level deeper, would silently reclassify returns with
  // no test signal. This file already uses the marker-slice technique for sectionPromptBlock.
  // Task 18 added a SECOND unit-construction block (reframeUnits), whose `return {` is the same
  // validation control flow, not an exit path. Excised on the same grounds and by the same
  // technique — any future unit block must be added here too, or it inflates the count.
  const reframeStart = BODY.indexOf('const reframeUnits = thinQs.map(');
  const reframeEnd = BODY.indexOf('const reframePlans =');
  const unitsStart = BODY.indexOf('const sectionUnits = sections.map(');
  const unitsEnd = BODY.indexOf('const sectionReview =');
  assert.ok(reframeStart !== -1 && reframeEnd > reframeStart, 'reframeUnits block markers must resolve');
  assert.ok(unitsStart !== -1 && unitsEnd > unitsStart, 'sectionUnits block markers must resolve');
  const EXIT_SCOPE = BODY.slice(0, reframeStart) + BODY.slice(reframeEnd, unitsStart) + BODY.slice(unitsEnd);

  // The count is asserted so the loop below can never pass vacuously: if the split stopped matching,
  // an empty `exits` would satisfy every per-item check without testing anything.
  const exits = EXIT_SCOPE.split(/^\s*return \{/m).slice(1)
    // Bound each return at BOTH ends — the closing `};` line — so a key found in the code BETWEEN
    // two returns cannot satisfy the return above it. `\s*` keeps this indent-independent.
    .map((chunk) => chunk.split(/^\s*\};$/m)[0]);
  assert.equal(exits.length, 3, 'two gate returns plus the success return');

  // Per-return AND per-key. Every exit carries the same keys, so a caller reads one shape rather
  // than branching on `stoppedAt` — the sad paths are the ones #96 was about, and they are exactly
  // the ones most likely to quietly lose a field.
  for (const [i, chunk] of exits.entries()) {
    for (const key of ['dossierEntry', 'findingsDoc', 'findings', 'supersedes', 'coverage', 'evidenceState', 'runDate', 'verify', 'integrity']) {
      // Anchored at the start of a property line and accepting BOTH forms — `coverage,` (shorthand)
      // and `findings: vetted,` — because the returns mix them. A plain `includes(key)` would let
      // `rawFindings` satisfy `findings`; the line anchor is what rules that out.
      assert.match(chunk, new RegExp(`^\\s*${key}\\s*[,:]`, 'm'), `exit path ${i + 1} omits ${key}`);
    }
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
  // Scoped to the SECTION fan-out. A bare /perUnitTimeoutMs: 240_000/ ban was equivalent only while
  // that literal appeared nowhere else; Task 18's reframe PLANNING stage legitimately uses 240s
  // (it plans queries, it does not run them), so the global form now bans an unrelated budget.
  // #152.1 is about this fan-out reverting, and that is what this guard asserts.
  assert.doesNotMatch(BODY, /perUnitTimeoutMs: 240_000, maxInFlight: Math\.min\(sections\.length/);
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

test('the stitcher agent is gone — the entry is rendered by code (#152.2)', () => {
  assert.doesNotMatch(BODY, /label: 'synth:stitch'/);
  assert.doesNotMatch(BODY, /Stitch the sections below together/);
  // Slice 2: `const body = ...` concatenation is superseded by renderDossierEntry, which is still
  // code — the property under test is "no agent assembles the document", not the mechanism.
  assert.match(BODY, /const dossierEntry = renderDossierEntry\(\{/);
});

test('exactly ONE agent remains in the assembly path, fed the digest not the prose', () => {
  // Bounded at BOTH ends. Open-ended to EOF would make this assert "no agent call anywhere below",
  // so an unrelated later addition would fail it with a bare count mismatch and no clue why.
  const start = BODY.indexOf('const digest = orderedSections');
  const end = BODY.indexOf('const dossierEntry = renderDossierEntry({');
  assert.ok(start !== -1 && end > start, 'assembly block boundaries must resolve');
  const assembly = BODY.slice(start, end);
  assert.equal((assembly.match(/await agent\(/g) ?? []).length, 1);
  assert.match(assembly, /FINDINGS DIGEST: \$\{JSON\.stringify\(digest\)\}/);
  assert.doesNotMatch(assembly, /JSON\.stringify\(orderedSections\)/);
});

test('BOTH gap classes reach the dossier entry — coverage.missing is not enough (#96)', () => {
  // The slice-1 banner reported missingSubQuestions AND missingSections. renderDossierEntry derives
  // "### Unanswered" from coverage.missing, which is computed from FINDINGS — so a sub-question
  // whose research succeeded but whose section writer was abandoned is absent from it. Passing only
  // coverage would drop that sub-question from the entry while the coverage line still claims it.
  const call = BODY.slice(BODY.indexOf('const dossierEntry = renderDossierEntry({'), BODY.indexOf('const findingsDoc ='));
  assert.ok(call.length > 0, 'the renderDossierEntry call must resolve');
  assert.match(call, /^\s*coverage,$/m, 'coverage carries the no-findings gaps');
  assert.match(call, /^\s*missingSections,$/m, 'missingSections carries the failed-write-up gaps');
});

test('the closing synthesis is passed HEADING-STRIPPED — the renderer writes the heading', () => {
  // renderDossierEntry emits "### What this means" itself. Passing the raw `closing` shorthand
  // instead of `closingBody` doubles the heading whenever the agent writes one of its own, which
  // is exactly what the strip below exists to absorb.
  assert.match(BODY, /const closingBody = String\(closing \?\? ''\)\.replace\(/);
  assert.match(BODY, /^\s*closing: closingBody,$/m);
  assert.doesNotMatch(BODY, /^\s*closing,$/m, 'the raw agent output must never be passed through');
});

// ── Task 8 — L2 section audit ───────────────────────────────────────────────

test('section validation runs L1 before L2 — the free check gates the paid one', () => {
  // The end marker is searched FROM the start marker, not from 0. Task 18's reframe units also use
  // `work: async (repair)` and sit earlier in the file, so an unanchored indexOf resolves the end
  // BEFORE the start and `slice` silently yields '' — every assertion below would then fail with a
  // bare -1 and no clue why. Any unit block added above the section fan-out has the same effect.
  const validateStart = BODY.indexOf('validate: async (v) => {');
  const validateEnd = BODY.indexOf('work: async (repair)', validateStart);
  // Both ends asserted before the slice. An unfound end marker is -1, and `slice(start, -1)` does
  // not mean "not found" — it means "to the second-to-last character", so the block would silently
  // run to EOF and the ordering check below would still pass while bounding nothing.
  assert.ok(validateStart !== -1 && validateEnd > validateStart, 'the validate block markers must resolve');
  const validateBlock = BODY.slice(validateStart, validateEnd);
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
  // End marker searched from the start marker, and both ends asserted before the slice — see the
  // note in the L1-before-L2 test above for why an unguarded end marker bounds nothing.
  const validateStart = BODY.indexOf('validate: async (v) => {');
  const validateEnd = BODY.indexOf('work: async (repair)', validateStart);
  assert.ok(validateStart !== -1 && validateEnd > validateStart, 'the validate block markers must resolve');
  const validateBlock = BODY.slice(validateStart, validateEnd);
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

// ── Task 10 — return contract ───────────────────────────────────────────────

test('the report string is gone — the artifact is a dossier entry plus a findings doc', () => {
  // No `$` anchor: these are shorthand properties carrying trailing `//` comments, so the line does
  // not end at the comma. Anchoring the end would assert the comment away, not the property.
  assert.doesNotMatch(BODY, /^\s*report,/m);
  assert.doesNotMatch(BODY, /^\s*report: null,/m);
  assert.match(BODY, /^\s*dossierEntry,/m);
  assert.match(BODY, /^\s*findingsDoc,/m);
});

test('findingsDoc is merged in the workflow, not handed to main context to reconstruct (D3)', () => {
  assert.match(BODY, /mergeFindingsDoc\(input\.priorFindings, \{/);
});

test('the dossier header is rendered on a FIRST run only, and by code', () => {
  assert.match(BODY, /dossierHeader: input\.priorFindings \? null : renderDossierHeader\(/);
});

// ── Task 18 — reframe stage ─────────────────────────────────────────────────

test('the reframe stage is skipped when nothing is thin OR when verify degraded', () => {
  // A degraded verify returns unstamped findings, and reframing on the ABSENCE of a signal is a
  // different thing from reframing on one. Belt-and-braces: thinSubQuestions already refuses to
  // classify an unjudged thread as thin, so this guard makes the intent explicit at the call site
  // rather than leaving it implicit in a helper's filtering. It saves no meaningful work —
  // thinSubQuestions is a synchronous filter over an in-memory array, not an agent call — so the
  // value here is clarity, not spend.
  assert.match(BODY, /const thinQs = verifyDegraded \? \[\] : thinSubQuestions\(subQuestions, vetted\);/);
  assert.match(BODY, /if \(thinQs\.length\) \{/);
});

test('reframe stages use quorum: 0 — an optional stage must never degrade the run', () => {
  // Comment-stripped before counting, for the same reason as the time-source test above: the
  // stage's own rationale comment spells `quorum: 0` out in prose, so an unstripped count reads 3
  // and the assertion fails against the only correct implementation. The property under test is
  // the two CALL SITES, and the rationale comment is load-bearing — the test bends, not the code.
  const start = BODY.indexOf('const thinQs');
  const end = BODY.indexOf('reframed = reResearch');
  // Both ends asserted before the slice. An unfound end marker is -1 and `slice(start, -1)` runs to
  // EOF−1, which for a COUNT assertion is the worst case: the count happens to be right today, so
  // the test would keep passing while bounding nothing at all.
  assert.ok(start !== -1 && end > start, 'the reframe stage markers must resolve');
  const block = BODY.slice(start, end)
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.equal((block.match(/quorum: 0/g) ?? []).length, 2, 'both the plan and re-research fan-outs');
});

test('reframe results are reconstructed by KEY, never by position in the compact confirmed array', () => {
  // PRE-FLIGHTED 2026-08-06. The end marker was originally `'if (reframed.length)'` — which is
  // TASK 19's code, not Task 18's. Verified: it has ZERO occurrences in the file at Task 18's own
  // commit point. `indexOf` returns -1, and `slice(start, -1)` does not mean "not found" — it means
  // "to the second-to-last character", so the block silently expands to the whole rest of the file
  // and the two `doesNotMatch` guards below stop bounding anything. Failure shape 6: a slice bounded
  // at one end silently changes meaning. Re-anchored to Task 18's own last line, which also spans
  // both fan-outs — the two shapes this test asserts.
  // Comment-stripped: the block's own rule comment cites `thinQs[i]` as the shape to AVOID, which
  // the guard below then reads as the violation itself. Same trap, same fix as the quorum count.
  const start = BODY.indexOf('const reframeUnits');
  const end = BODY.indexOf('reframed = reResearch');
  // Both ends asserted before the slice, closing the -1 hole the note above describes rather than
  // only documenting it.
  assert.ok(start !== -1 && end > start, 'the reframe unit block markers must resolve');
  const block = BODY.slice(start, end)
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  // parallelFanout's `confirmed` omits abandoned units, so any thinQs[i] / plans[i] lookup
  // mislabels every neighbour after the first abandon.
  assert.doesNotMatch(block, /thinQs\[i\]/);
  assert.doesNotMatch(block, /plans\[i\]/);
  // The plan unit still carries its OWN key — but the stamp must come AFTER the spread, or it is
  // not code-owned at all. REFRAME_SCHEMA sets no `additionalProperties: false` and the prompt
  // prints the sub-question verbatim, so an agent that echoes back a paraphrased `subQuestion`
  // silently overwrites a stamp placed first; every downstream exact-match on this key then finds
  // nothing and the re-researched findings are dropped without a signal. Asserted in three parts —
  // the literal opens with the spread, the code-owned key closes it, and the clobberable order is
  // banned outright so a revert cannot pass.
  assert.match(block, /work: async \(repair\) => \(\{ \.\.\.await agent\(/, 'the agent result is spread FIRST');
  assert.match(block, /\}\), subQuestion: q \}\),/, 'the code-owned key is stamped LAST, so it wins');
  assert.doesNotMatch(block, /=> \(\{ subQuestion: q,/, 'a stamp before the spread is clobberable by the agent');
  assert.match(block, /work: async \(repair\) => \(\{ plan,/, 'the re-research carries its own plan');
});

test('both reframe fan-outs keep their budget AND their caller-controlled maxInFlight', () => {
  // Same guard shape as the #152.1 section-watchdog test: the timeout and the maxInFlight are
  // asserted TOGETHER in one pattern. Dropping maxInFlight is the silent failure — parallelFanout
  // defaults it to 8, so args.cap stops being read and the batch barrier moves back to the 9th
  // unit with nothing failing. The two budgets are also asymmetric on purpose (planning does no web
  // work, re-research does), so an edit that flattens them to one number must fail here.
  assert.match(BODY, /perUnitTimeoutMs: 240_000, maxInFlight: Math\.min\(thinQs\.length, MAX_CONCURRENT\)/,
    'the planning fan-out: 240s and a cap-derived maxInFlight');
  assert.match(BODY, /perUnitTimeoutMs: 900_000, maxInFlight: Math\.min\(researchUnits\.length, MAX_CONCURRENT\)/,
    'the re-research fan-out: 900s, matching the primary web-facing leaves');
});

test('the reframe agent must diagnose before it selects a move', () => {
  assert.match(BODY, /STEP 1 — DIAGNOSE/);
  assert.match(BODY, /STEP 2 — SELECT the single matching move/);
});

test('the plan validator ENFORCES the diagnosis, it does not only name it in the reason', () => {
  // Scoped to the reframe unit block: the re-research units below carry a `validate` of their own,
  // so a whole-BODY assertion could keep passing on the wrong predicate.
  // REFRAME_SCHEMA lists `diagnosis` under `required`, so this predicate is the SECOND line of
  // defence — which is precisely why deleting `v?.diagnosis &&` leaves every other test green. It
  // is kept because the recorded diagnosis is the one observability mitigation the stage's
  // accepted-risk note names as its own, and because the rejection reason below claims to demand a
  // diagnosis: a reason must not claim more than its predicate checks.
  const start = BODY.indexOf('const reframeUnits = thinQs.map(');
  const end = BODY.indexOf('const reframePlans =');
  assert.ok(start !== -1 && end > start, 'the reframe unit block markers must resolve');
  const block = BODY.slice(start, end);
  assert.match(block, /validate: \(v\) => \(v\?\.diagnosis && v\?\.shift &&/);
});

test('the PLANNING prompt forbids web work — its 240s budget assumes the stage does none', () => {
  // Split at the concatenation seams, same as the #152.3 no-publish assertions: the paragraph spans
  // three template literals (`…not running ` + `them: reason over…` + `else to run.`), so no
  // contiguous regex can cover it. Bounded to the reframe unit block at both ends so the assertion
  // stays about THIS prompt.
  // The planning fan-out is budgeted at 240s because it only plans; the surrounding prompt also
  // tells the agent to "mine these for terminology", which invites the searching that budget does
  // not cover. Nothing else in the prompt forbids it, so deleting this paragraph is silent.
  const start = BODY.indexOf('const reframeUnits = thinQs.map(');
  const end = BODY.indexOf('const reframePlans =');
  assert.ok(start !== -1 && end > start, 'the reframe unit block markers must resolve');
  const block = BODY.slice(start, end);
  assert.match(block, /Do NOT search the web and do NOT fetch any page\./);
  assert.match(block, /You are PLANNING queries, not running/);
  assert.match(block, /them: reason over the thin sources already provided below/);
});

test('the re-research leaf keeps the anti-memory contract AND the caller-set search budget', () => {
  // Scope is the whole point here: BOTH strings appear TWICE in BODY, because the primary research
  // leaf carries them too. A whole-BODY assertion passes on the primary copy regardless of what the
  // re-research prompt says, so it would lock nothing.
  // Anti-memory: this stage exists to obtain BETTER SOURCES, and a memory-answered finding arrives
  // with a plausible-looking URL that can survive the re-verify — success-shaped, but no new source.
  // Budget: this is the other web-facing fan-out, so a cap that binds the primary leaf and not this
  // one is not a cap. The conditional is asserted whole, not just the identifier, because the
  // identifier alone also appears in the destructure and in prose above.
  const start = BODY.indexOf('const researchUnits = plans.map(');
  const end = BODY.indexOf('const reResearch = await parallelFanout(');
  assert.ok(start !== -1 && end > start, 'the re-research unit block markers must resolve');
  const block = BODY.slice(start, end);
  assert.match(block, /do NOT answer from memory\. Run ONLY these queries/);
  assert.match(block, /\(maxSearchesPerLeaf != null \? `Search budget: perform at most \$\{maxSearchesPerLeaf\} WebSearch calls/);
});

test('the reframe stage runs before the evidence floor, so a rescue is counted', () => {
  // PRE-FLIGHTED 2026-08-06. Both indices are asserted present BEFORE they are compared. The plan's
  // form was the bare ordering comparison, which passes vacuously: `indexOf` returns -1 when the
  // marker is absent, and -1 < anything is true — so it held against the pre-change file, which has
  // no reframe stage at all. That is the state this test exists to rule out. Same -1 family as the
  // slice bug pre-flighted in the by-KEY test above; the coverage-gate test guards it the same way.
  const reframeIdx = BODY.indexOf('const thinQs =');
  const floorIdx = BODY.indexOf("stoppedAt: 'evidence-floor'");
  assert.ok(reframeIdx !== -1, 'the reframe stage must exist');
  assert.ok(floorIdx !== -1, 'the evidence floor must exist');
  assert.ok(reframeIdx < floorIdx, 'a reframe that rescues a sub-question must be counted by the floor');
});
