import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCoverage, deriveEvidenceState, hasAnySource, urlsInProse, unknownUrls, exciseGuard,
  COVERAGE_MIN_RATIO, COVERAGE_MIN_ANSWERED,
  renderTable, renderDossierEntry, renderDossierHeader, mergeFindingsDoc,
  selectHarvestTargets, excerptGuard, MIN_EXCERPT_CHARS, roundsConverged,
  needsLiveRecheck,
} from './librarian-core.mjs';

const Q = ['q1', 'q2', 'q3', 'q4'];
const f = (subQuestion, source = 'https://example.com/a') => ({ subQuestion, claim: 'c', source });

test('coverage: every sub-question answered', () => {
  const c = assessCoverage(Q, Q.map((q) => f(q)));
  assert.deepEqual(c, { answered: 4, total: 4, missing: [], ratio: 1, ok: true });
});

test('coverage: 3 of 4 answered clears the 0.6 ratio', () => {
  const c = assessCoverage(Q, [f('q1'), f('q2'), f('q3')]);
  assert.equal(c.answered, 3);
  assert.deepEqual(c.missing, ['q4']);
  assert.equal(c.ok, true);
});

test('coverage: 1 of 4 answered trips the gate (#96 — losing 3 of 4 is fatal)', () => {
  const c = assessCoverage(Q, [f('q1')]);
  assert.equal(c.ratio, 0.25);
  assert.equal(c.ok, false, 'below the 0.6 ratio');
});

test('coverage: 2 of 4 trips the ratio even though it clears the absolute floor', () => {
  const c = assessCoverage(Q, [f('q1'), f('q2')]);
  assert.equal(c.ratio, 0.5);
  assert.equal(c.ok, false);
});

test('coverage: 17 of 20 answered is reported, not fatal (scales to 20 sub-questions)', () => {
  const big = Array.from({ length: 20 }, (_, i) => `q${i}`);
  const c = assessCoverage(big, big.slice(0, 17).map((q) => f(q)));
  assert.equal(c.missing.length, 3);
  assert.equal(c.ok, true, 'losing 3 of 20 is reported in the dossier, not fatal');
});

test('coverage floor is min(2, total) — a 1-sub-question brief is not structurally impossible (D2)', () => {
  assert.equal(assessCoverage(['only'], [f('only')]).ok, true);
  assert.equal(assessCoverage(['only'], []).ok, false, 'zero findings still fails');
});

test('coverage: a finding whose subQuestion is not in the brief does not inflate answered', () => {
  const c = assessCoverage(Q, [f('q1'), f('drifted-elsewhere'), f('drifted-again')]);
  assert.equal(c.answered, 1, 'answered counts BRIEF sub-questions covered, never findings');
  assert.equal(c.ok, false);
});

test('coverage: empty sub-question list never divides by zero', () => {
  const c = assessCoverage([], []);
  assert.equal(c.ratio, 0);
  assert.equal(c.ok, false);
});

test('exported thresholds match the design rule', () => {
  assert.equal(COVERAGE_MIN_RATIO, 0.6);
  assert.equal(COVERAGE_MIN_ANSWERED, 2);
});

test('hasAnySource: true when any finding carries a resolvable http(s) URL', () => {
  assert.equal(hasAnySource([{ source: 'not-a-url' }, { source: 'https://ok.example/x' }]), true);
});

test('hasAnySource: false for an empty set, blank sources, and non-http schemes', () => {
  assert.equal(hasAnySource([]), false);
  assert.equal(hasAnySource([{ source: '' }, { source: '   ' }, {}]), false);
  assert.equal(hasAnySource([{ source: 'file:///etc/passwd' }]), false);
});

test('evidenceState: web-unavailable when NO sub-question produced a resolvable URL', () => {
  const state = deriveEvidenceState({
    findings: [], rawFindings: [{ claim: 'x' }, { claim: 'y', source: '' }],
    verifyDegraded: false, coverage: { ok: true },
  });
  assert.equal(state, 'web-unavailable');
});

test('evidenceState: web-unavailable outranks research-incomplete (most upstream cause wins)', () => {
  const state = deriveEvidenceState({
    findings: [], rawFindings: [], verifyDegraded: true, coverage: { ok: false },
  });
  assert.equal(state, 'web-unavailable');
});

test('evidenceState: research-incomplete when the coverage gate tripped but the web worked', () => {
  const state = deriveEvidenceState({
    findings: [], rawFindings: [f('q1')], verifyDegraded: false, coverage: { ok: false },
  });
  assert.equal(state, 'research-incomplete');
});

test('evidenceState: no-results when sources existed but nothing survived', () => {
  const state = deriveEvidenceState({
    findings: [], rawFindings: [f('q1')], verifyDegraded: false, coverage: { ok: true },
  });
  assert.equal(state, 'no-results');
});

test('evidenceState: unverified when verify degraded but findings survived', () => {
  const state = deriveEvidenceState({
    findings: [f('q1')], rawFindings: [f('q1')], verifyDegraded: true, coverage: { ok: true },
  });
  assert.equal(state, 'unverified');
});

test('evidenceState: verified on the clean path', () => {
  const state = deriveEvidenceState({
    findings: [f('q1')], rawFindings: [f('q1')], verifyDegraded: false, coverage: { ok: true },
  });
  assert.equal(state, 'verified');
});

test('urlsInProse: extracts and dedupes, stripping trailing sentence punctuation', () => {
  const md = 'See https://a.example/x. Also https://a.example/x and (https://b.example/y), done!';
  assert.deepEqual(urlsInProse(md), ['https://a.example/x', 'https://b.example/y']);
});

test('urlsInProse: returns [] for prose with no URLs', () => {
  assert.deepEqual(urlsInProse('no links at all'), []);
});

test('unknownUrls: flags a URL the section findings do not contain (L1 validation)', () => {
  const findings = [{ source: 'https://known.example/a' }];
  assert.deepEqual(
    unknownUrls('cites https://known.example/a and https://smuggled.example/b', findings),
    ['https://smuggled.example/b'],
  );
});

test('unknownUrls: [] when every cited URL is in the slice', () => {
  const findings = [{ source: 'https://known.example/a' }, { source: 'https://known.example/b' }];
  assert.deepEqual(unknownUrls('see https://known.example/b.', findings), []);
});

test('unknownUrls: tolerates findings with a missing or non-string source', () => {
  assert.deepEqual(unknownUrls('see https://x.example/1', [{}, { source: 42 }]), ['https://x.example/1']);
});

test('urlsInProse: keeps a balanced parenthetical URL intact (Wikipedia-style)', () => {
  const md = 'See https://en.wikipedia.org/wiki/Bird_(disambiguation) for details.';
  assert.deepEqual(urlsInProse(md), ['https://en.wikipedia.org/wiki/Bird_(disambiguation)']);
});

test('urlsInProse: trims the unbalanced closer from a markdown-wrapped parenthetical URL', () => {
  const md = '[t](https://x/wiki/Bird_(disambiguation))';
  assert.deepEqual(urlsInProse(md), ['https://x/wiki/Bird_(disambiguation)']);
});

test('unknownUrls: does not flag a parenthetical URL that IS in the section findings', () => {
  const findings = [{ source: 'https://en.wikipedia.org/wiki/Bird_(disambiguation)' }];
  assert.deepEqual(
    unknownUrls('see https://en.wikipedia.org/wiki/Bird_(disambiguation) for context', findings),
    [],
  );
});

test('unknownUrls: a case or trailing-slash difference counts as a different source (byte-exact policy)', () => {
  const findings = [{ source: 'https://known.example/path' }];
  assert.deepEqual(
    unknownUrls('see https://known.example/PATH and https://known.example/path/', findings),
    ['https://known.example/PATH', 'https://known.example/path/'],
  );
});

test('assessCoverage tolerates duplicate subQuestion values; hasAnySource rejects whitespace-embedded URLs', () => {
  const c = assessCoverage(Q, [f('q1'), f('q1'), f('q2')]);
  assert.equal(c.answered, 2, 'duplicate q1 findings must not inflate answered beyond unique brief coverage');
  assert.deepEqual(c.missing, ['q3', 'q4']);

  assert.equal(
    hasAnySource([{ source: 'https://x.com/a fake trailing text' }]),
    false,
    'prose containing a URL is not itself a citation',
  );
});

test('urlsInProse: strips a sentence period nested INSIDE a wrapping paren (regression guard)', () => {
  const md = '(for more, see https://x.example/y.) Next sentence.';
  assert.deepEqual(urlsInProse(md), ['https://x.example/y']);
});

test('urlsInProse: strips a comma nested INSIDE a wrapping paren (regression guard)', () => {
  const md = '(see https://x.example/y,) and more';
  assert.deepEqual(urlsInProse(md), ['https://x.example/y']);
});

test('unknownUrls: [] for the ".)" shape when the URL IS in the findings (regression guard)', () => {
  const findings = [{ source: 'https://x.example/y' }];
  assert.deepEqual(unknownUrls('(for more, see https://x.example/y.) Next sentence.', findings), []);
});

// Time bound guards ALGORITHMIC COMPLEXITY, not raw speed: linear extraction over 50,000 trailing
// closers is ~1ms, so a 2000ms budget has a huge margin and will not flake on a slow machine. The
// quadratic implementation this replaces would take well over a minute on this input.
test('urlsInProse: stays linear on a degenerate run of trailing closers', () => {
  const md = `see https://x.example/y${')'.repeat(50_000)}`;
  const start = Date.now();
  const result = urlsInProse(md);
  const elapsed = Date.now() - start;
  assert.deepEqual(result, ['https://x.example/y']);
  assert.ok(elapsed < 2000, `expected under 2000ms, took ${elapsed}ms`);
});

// ── Rendering ───────────────────────────────────────────────────────────────

test('renderTable escapes pipes and newlines so a free-text claim cannot shift columns', () => {
  const md = renderTable(['A', 'B'], [['x|y', 'line1\nline2']]);
  assert.match(md, /\| x\\\|y \| line1 line2 \|/);
  assert.equal(md.split('\n').length, 3, 'header + separator + one row');
});

test('renderTable emits a placeholder row rather than a headless table when there are no rows', () => {
  assert.match(renderTable(['A'], []), /_none_/);
});

const RUN = {
  runDate: '2026-11-02',
  title: 'follow-up: pgvector 0.9 changed the cost curve',
  coverage: { answered: 2, total: 2, missing: [] },
  evidenceState: 'verified',
  supersedes: [],
  integrity: [],
  closing: 'It means the cost curve moved.',
  sections: [
    {
      subQuestion: 'Has pgvector closed the recall gap?',
      markdown: 'Detailed prose about recall.',
      findings: [
        { source: 'https://arxiv.org/abs/2401.x', claim: 'HNSW recall vs index size', support: 'supported', thinSource: false },
        { source: 'https://zylos.ai/research/1', claim: 'cost-per-query', support: 'uncertain', thinSource: true },
      ],
    },
  ],
};

test('dossier entry: dated heading, coverage line, section prose verbatim, evidence table', () => {
  const md = renderDossierEntry(RUN);
  assert.match(md, /^## 2026-11-02 — follow-up: pgvector 0\.9 changed the cost curve$/m);
  assert.match(md, /^> 2 of 2 sub-questions answered · evidence: verified$/m);
  assert.match(md, /^### Q: Has pgvector closed the recall gap\?$/m);
  assert.ok(md.includes('Detailed prose about recall.'), 'prose is verbatim, never compressed');
  assert.match(md, /^#### Evidence$/m);
  assert.match(md, /\| https:\/\/arxiv\.org\/abs\/2401\.x \| HNSW recall vs index size \| supported \|  \|/);
  assert.match(md, /\| https:\/\/zylos\.ai\/research\/1 \| cost-per-query \| uncertain \| thin source \|/);
});

test('dossier entry: Supersedes block appears only when there is something to supersede', () => {
  assert.doesNotMatch(renderDossierEntry(RUN), /### Supersedes/);
  const withSup = { ...RUN, supersedes: [{ claim: 'old claim', priorRunDate: '2026-08-05', reason: '0.9 rewrote index build' }] };
  const md = renderDossierEntry(withSup);
  assert.match(md, /### Supersedes/);
  assert.match(md, /\| old claim \| 2026-08-05 \| 0\.9 rewrote index build \|/);
});

test('dossier entry: Integrity block is present ONLY when claims failed audit — never silently omitted', () => {
  assert.doesNotMatch(renderDossierEntry(RUN), /### Integrity/);
  const flagged = { ...RUN, integrity: [{ subQuestion: 'q', claim: 'unbacked', reason: 'not traceable to any finding' }] };
  assert.match(renderDossierEntry(flagged), /### Integrity[\s\S]*not traceable to any finding/);
});

test('dossier entry: unanswered sub-questions are named in the entry, never silently dropped', () => {
  const partial = { ...RUN, coverage: { answered: 1, total: 3, missing: ['q2', 'q3'] } };
  const md = renderDossierEntry(partial);
  assert.match(md, /^> 1 of 3 sub-questions answered/m);
  assert.match(md, /### Unanswered[\s\S]*- q2[\s\S]*- q3/);
});

test('dossier entry: a finding with no support label renders `unlabelled`, never blank', () => {
  const bare = { ...RUN, sections: [{ subQuestion: 'q', markdown: 'p', findings: [{ source: 'https://x/1', claim: 'c' }] }] };
  assert.match(renderDossierEntry(bare), /\| https:\/\/x\/1 \| c \| unlabelled \|  \|/);
});

test('dossier entry: the Flags cell separates reframed-and-improved from reframed-with-no-better-evidence', () => {
  // A `reframe` stamp with `improved: false` is the RECORD that the stage fired and did not help —
  // `mergeReframed` stamps it on every surviving thin finding precisely so that outcome is visible.
  // Rendering it as a blank cell reads as "never reframed", erasing the one result that makes the
  // stage improvable, and leaving the dossier disagreeing with findings.json about the same finding.
  const reframed = { ...RUN, sections: [{
    subQuestion: 'q', markdown: 'p',
    findings: [
      { source: 'https://x/1', claim: 'better', support: 'supported', thinSource: false, reframe: { diagnosis: 'd', shift: 'vocabulary', improved: true } },
      { source: 'https://x/2', claim: 'stepping-stone', support: 'supported', thinSource: true, reframe: { diagnosis: 'd', shift: 'vocabulary', improved: true } },
      { source: 'https://x/3', claim: 'tried-nothing-better', support: 'uncertain', thinSource: false, reframe: { diagnosis: 'd', shift: 'evidence-type', improved: false } },
      { source: 'https://x/4', claim: 'thin-and-no-better', support: 'supported', thinSource: true, reframe: { diagnosis: 'd', shift: 'evidence-type', improved: false } },
      { source: 'https://x/5', claim: 'never-reframed', support: 'supported', thinSource: false },
    ],
  }] };
  const md = renderDossierEntry(reframed);
  assert.match(md, /\| https:\/\/x\/1 \| better \| supported \| reframed \|/);
  assert.match(md, /\| https:\/\/x\/2 \| stepping-stone \| supported \| thin source, reframed \|/);
  assert.match(md, /\| https:\/\/x\/3 \| tried-nothing-better \| uncertain \| reframed, no better evidence \|/);
  assert.match(md, /\| https:\/\/x\/4 \| thin-and-no-better \| supported \| thin source, reframed, no better evidence \|/);
  assert.match(md, /\| https:\/\/x\/5 \| never-reframed \| supported \|  \|/, 'no reframe key leaves the cell untouched');
});

test('dossier header carries the immutable first-researched date and no mutable counter (D4)', () => {
  const h = renderDossierHeader('vector DB selection', '2026-08-05');
  assert.match(h, /^# Research: vector DB selection$/m);
  assert.match(h, /Topic first researched 2026-08-05/);
  assert.match(h, /\.\/findings\.json/);
  assert.doesNotMatch(h, /entries/, 'an append-only file cannot rewrite a run counter at its top');
});

test('mergeFindingsDoc: first run seeds topic, runs[], findings[]', () => {
  const doc = mergeFindingsDoc(null, {
    topic: 't', runDate: '2026-08-05', brief: 'b', coverage: { answered: 1, total: 1, missing: [] },
    evidenceState: 'verified', findings: [{ subQuestion: 'q', claim: 'c', source: 'https://x/1' }],
    supersedes: [], integrity: [],
  });
  assert.equal(doc.topic, 't');
  assert.equal(doc.runs.length, 1);
  assert.equal(doc.findings[0].runDate, '2026-08-05', 'runDate is stamped on every finding');
});

test('mergeFindingsDoc: newest run first; NO prior finding is ever deleted', () => {
  const prior = {
    topic: 't',
    runs: [{ date: '2026-08-05', brief: 'b1', coverage: { answered: 1, total: 1, missing: [] } }],
    findings: [{ runDate: '2026-08-05', claim: 'old', source: 'https://x/1' }],
    integrity: [],
  };
  const doc = mergeFindingsDoc(prior, {
    topic: 't', runDate: '2026-11-02', brief: 'b2', coverage: { answered: 1, total: 1, missing: [] },
    evidenceState: 'verified', findings: [{ claim: 'new', source: 'https://x/2' }],
    supersedes: [], integrity: [],
  });
  assert.deepEqual(doc.runs.map((r) => r.date), ['2026-11-02', '2026-08-05']);
  assert.equal(doc.findings.length, 2, 'no finding is ever deleted from findings.json');
  assert.equal(doc.findings[0].claim, 'new', 'this run first');
});

test('mergeFindingsDoc: supersession is STAMPED onto the prior record, not a deletion', () => {
  const prior = {
    topic: 't', runs: [{ date: '2026-08-05' }],
    findings: [{ runDate: '2026-08-05', claim: 'old', source: 'https://x/1' }], integrity: [],
  };
  const doc = mergeFindingsDoc(prior, {
    topic: 't', runDate: '2026-11-02', brief: 'b', coverage: { answered: 1, total: 1, missing: [] },
    evidenceState: 'verified', findings: [],
    supersedes: [{ priorRunDate: '2026-08-05', claim: 'old', reason: '0.9 rewrote index build' }],
    integrity: [],
  });
  const stamped = doc.findings.find((f) => f.claim === 'old');
  assert.deepEqual(stamped.supersededBy, { runDate: '2026-11-02', reason: '0.9 rewrote index build' });
  assert.equal(stamped.source, 'https://x/1', 'the original record is otherwise untouched');
});

test('mergeFindingsDoc: a supersedes entry matching nothing is a no-op, not a crash', () => {
  const doc = mergeFindingsDoc(
    { topic: 't', runs: [], findings: [{ runDate: '2026-08-05', claim: 'other' }], integrity: [] },
    { topic: 't', runDate: '2026-11-02', brief: 'b', coverage: { answered: 1, total: 1, missing: [] },
      evidenceState: 'verified', findings: [], supersedes: [{ priorRunDate: '2020-01-01', claim: 'ghost', reason: 'r' }], integrity: [] },
  );
  assert.equal(doc.findings.length, 1);
  assert.equal(doc.findings[0].supersededBy, undefined);
});

test('mergeFindingsDoc: integrity accumulates across runs with runDate stamps', () => {
  const doc = mergeFindingsDoc(
    { topic: 't', runs: [], findings: [], integrity: [{ runDate: '2026-08-05', claim: 'a', reason: 'r1' }] },
    { topic: 't', runDate: '2026-11-02', brief: 'b', coverage: { answered: 1, total: 1, missing: [] },
      evidenceState: 'verified', findings: [], supersedes: [], integrity: [{ subQuestion: 'q', claim: 'b', reason: 'r2' }] },
  );
  assert.equal(doc.integrity.length, 2);
  assert.equal(doc.integrity[0].runDate, '2026-11-02');
});

test('mergeFindingsDoc: a malformed or partial prior doc degrades to empty arrays, never throws', () => {
  const run = { topic: 't', runDate: '2026-11-02', brief: 'b', coverage: { answered: 1, total: 1, missing: [] },
    evidenceState: 'verified', findings: [], supersedes: [], integrity: [] };
  for (const bad of [undefined, null, 'garbage', 42, {}, { findings: 'not-an-array' }]) {
    const doc = mergeFindingsDoc(bad, run);
    assert.ok(Array.isArray(doc.findings) && Array.isArray(doc.runs) && Array.isArray(doc.integrity));
  }
});

test('dossier entry: a section whose prose could not be written is NAMED, never silently absent', () => {
  // coverage.missing is computed from FINDINGS; a sub-question can have findings and still lose its
  // section when the writer is abandoned. That case is invisible to coverage.missing, so without
  // this block the entry drops a paid-for sub-question while claiming full coverage (#96).
  const lost = { ...RUN, missingSections: ['q2: what does it cost?'] };
  const md = renderDossierEntry(lost);
  assert.match(md, /### Sections not written/);
  assert.match(md, /- q2: what does it cost\?/);
  // Absent when nothing was lost — no empty scaffolding on the clean path.
  assert.doesNotMatch(renderDossierEntry(RUN), /### Sections not written/);
});

import { thinSubQuestions, REFRAME_MOVES, mergeReframed } from './librarian-core.mjs';

const g = (subQuestion, support, thinSource, claim = 'c', source = 'https://x/1') =>
  ({ subQuestion, support, thinSource, claim, source });

test('trigger: a sub-question with ONE supported non-thin finding is grounded — no reframe', () => {
  const findings = [
    g('q1', 'supported', false),
    g('q1', 'supported', true), g('q1', 'uncertain', true), g('q1', 'supported', true),
  ];
  assert.deepEqual(thinSubQuestions(['q1'], findings), []);
});

test('trigger: a sub-question with only thin or unsupported findings qualifies', () => {
  const findings = [g('q1', 'supported', true), g('q1', 'uncertain', false)];
  assert.deepEqual(thinSubQuestions(['q1'], findings), ['q1']);
});

test('trigger: a sub-question with NO findings does not qualify — that is a coverage problem', () => {
  // The coverage gate and coverage.missing already own this case. Reframing a question that
  // returned nothing at all conflates "found weak evidence" with "found none", which are different
  // failures with different fixes.
  assert.deepEqual(thinSubQuestions(['q1', 'q2'], [g('q1', 'supported', true)]), ['q1']);
});

test('trigger: operates per sub-question, never per finding', () => {
  const findings = [g('q1', 'supported', false), g('q2', 'supported', true)];
  assert.deepEqual(thinSubQuestions(['q1', 'q2'], findings), ['q2']);
});

test('the move set is exactly the six shipped moves, each naming its prior-art status', () => {
  assert.equal(REFRAME_MOVES.length, 6);
  const keys = REFRAME_MOVES.map((m) => m.key).sort();
  assert.deepEqual(keys, ['abstraction', 'discipline', 'entity-anchored', 'evidence-type', 'inversion', 'vocabulary']);
  // 2 of the 6 KEYS are grounded in Huang & Efthimiadis (CIKM 2009) — 3 of that paper's operations,
  // since `abstraction` merges specialization and generalization. The other four are ungrounded for
  // TWO different reasons (see librarian-core.mjs above REFRAME_MOVES): `entity-anchored` and
  // `evidence-type` change the retrieval target rather than the query string, so the taxonomy does
  // not reach them; `inversion` and `discipline` ARE query-string substitutions, but the paper does
  // not name or study them as strategies. Classifiable is not the same as validated.
  assert.equal(REFRAME_MOVES.filter((m) => m.priorArt).length, 2);
  assert.deepEqual(REFRAME_MOVES.filter((m) => m.priorArt).map((m) => m.key).sort(), ['abstraction', 'vocabulary'],
    'entity-anchored changes the retrieval target, not the query string — the cited paper does not ground it');
  for (const m of REFRAME_MOVES) {
    assert.ok(m.diagnosis && m.instruction, `${m.key} needs a diagnosis and an instruction`);
  }
});

test('merge: a reframed finding that clears the bar is added and flagged improved', () => {
  const thin = [g('q1', 'supported', true, 'weak')];
  const candidates = [g('q1', 'supported', false, 'strong')];
  const out = mergeReframed(thin, candidates, { subQuestion: 'q1', diagnosis: 'weak-query', shift: 'vocabulary' });
  assert.equal(out.length, 2, 'thin findings are NEVER dropped — they were the stepping stone');
  const added = out.find((f) => f.claim === 'strong');
  assert.deepEqual(added.reframe, { diagnosis: 'weak-query', shift: 'vocabulary', improved: true });
});

test('merge: a candidate that is merely DIFFERENT, not better, does not enter the dossier', () => {
  const thin = [g('q1', 'supported', true, 'weak')];
  const candidates = [g('q1', 'supported', true, 'also weak'), g('q1', 'uncertain', false, 'shaky')];
  const out = mergeReframed(thin, candidates, { subQuestion: 'q1', diagnosis: 'no-literature', shift: 'evidence-type' });
  assert.equal(out.length, 1, 'only the original thin finding stands');
  assert.equal(out[0].claim, 'weak');
});

test('merge: failing to improve is RECORDED on the thin findings, not silently forgotten', () => {
  const thin = [g('q1', 'supported', true, 'weak')];
  const out = mergeReframed(thin, [], { subQuestion: 'q1', diagnosis: 'no-literature', shift: 'evidence-type' });
  assert.deepEqual(out[0].reframe, { diagnosis: 'no-literature', shift: 'evidence-type', improved: false });
});

test('merge: a candidate answering a DIFFERENT sub-question is drift and is refused', () => {
  const thin = [g('q1', 'supported', true, 'weak')];
  const candidates = [g('q-other', 'supported', false, 'excellent but off-target')];
  const out = mergeReframed(thin, candidates, { subQuestion: 'q1', diagnosis: 'weak-query', shift: 'vocabulary' });
  assert.equal(out.length, 1);
  assert.equal(out[0].reframe.improved, false);
});

test('merge: a reframed finding is never itself re-reframed — exactly one round', () => {
  const already = [{ ...g('q1', 'supported', true, 'weak'), reframe: { diagnosis: 'd', shift: 's', improved: false } }];
  assert.deepEqual(thinSubQuestions(['q1'], already), [], 'a sub-question already reframed is excluded');
});

test('trigger: findings verify never JUDGED do not qualify — that is an absent signal, not a thin one', () => {
  // `tieredVerify` stamps `support: 'unjudged'` and deliberately leaves `thinSource` absent when
  // triage returns no verdict for a finding (verify.mjs:274-277). Absent reads as falsy, so without
  // the judged-guard these would satisfy "not (supported && !thin)" and fire the reframe on a
  // sub-question verify never assessed. Task 18's `verifyDegraded` guard is run-level and does not
  // cover this — a run can report healthy while individual findings come back unjudged.
  const unjudged = [
    { subQuestion: 'q1', support: 'unjudged', claim: 'c', source: 'https://x/1' },
    { subQuestion: 'q1', support: 'unjudged', claim: 'c2', source: 'https://x/2' },
  ];
  assert.deepEqual(thinSubQuestions(['q1'], unjudged), []);

  // One judged-and-thin finding alongside unjudged ones IS a real signal, and still qualifies.
  assert.deepEqual(thinSubQuestions(['q1'], [...unjudged, g('q1', 'supported', true)]), ['q1']);

  // A finding with no `support` key at all (raw, never through verify) is likewise not a signal.
  assert.deepEqual(thinSubQuestions(['q1'], [{ subQuestion: 'q1', claim: 'c', source: 'https://x/1' }]), []);
});

test('merge: `shift` is stamped from the closed move-key set, never from what the agent typed', () => {
  // An agent never types a flag — a free-text `shift` column cannot be aggregated, and the
  // distribution of diagnosed conditions across real runs is the only mitigation this slice has for
  // its accepted measurability risk. Unrecognized values are recorded, not dropped, so the run
  // still counts.
  const thin = [g('q1', 'supported', true, 'weak')];
  const ctx = { subQuestion: 'q1', diagnosis: 'weak-query' };
  const bogus = mergeReframed(thin, [], { ...ctx, shift: 'reword-it-a-bit' });
  assert.equal(bogus[0].reframe.shift, 'unrecognized');
  const valid = mergeReframed(thin, [], { ...ctx, shift: 'entity-anchored' });
  assert.equal(valid[0].reframe.shift, 'entity-anchored', 'a real move key passes through unchanged');
});

// ── exciseGuard ─────────────────────────────────────────────────────────────

const findings = [{ source: 'https://a.example/doc', claim: 'x' }];

test('excised prose that is shorter and adds no URL passes', () => {
  const r = exciseGuard('one two three', 'one two', findings);
  assert.equal(r.ok, true);
});

test('excised prose that grew is rejected — an excise that grows is not an excise', () => {
  const r = exciseGuard('one two', 'one two three four', findings);
  assert.equal(r.ok, false);
  assert.match(r.reason, /longer/i);
});

test('excised prose that introduces an unknown URL is rejected', () => {
  // PRE-FLIGHTED. The plan's fixture was `before: 'one two three'` (13 chars) against
  // `after: 'one two https://evil.example/x'` (30) — which trips the LENGTH guard first and returns
  // the "longer" reason, so the /URL/i assertion could never pass. The fixture, not the guard, was
  // wrong: a test for the URL check must not also violate the length check, or it tests whichever
  // check happens to run first. `before` is padded so `after` is genuinely shorter.
  const before = 'one two three four five six seven eight nine ten eleven twelve thirteen';
  const r = exciseGuard(before, 'one two https://evil.example/x', findings);
  assert.equal(r.ok, false);
  assert.match(r.reason, /URL/i);
});

test('when an excise both grows AND adds a URL, length is reported first', () => {
  // Pins the precedence the test above deliberately avoids depending on. Both guards reject, so
  // only the REASON differs — but a reason that silently changes is a diagnostic that lies about
  // which rule was broken.
  const r = exciseGuard('one two', 'one two three https://evil.example/x', findings);
  assert.equal(r.ok, false);
  assert.match(r.reason, /longer/i);
});

test('a URL already in the findings is not "unknown" — excising must not require dropping citations', () => {
  const before = 'one two three four five six seven eight nine ten eleven twelve thirteen';
  const r = exciseGuard(before, 'one two https://a.example/doc', findings);
  assert.equal(r.ok, true);
});

test('equal length is allowed — softening a claim need not shorten it', () => {
  const r = exciseGuard('aaaa bbbb', 'aaaa cccc', findings);
  assert.equal(r.ok, true);
});

test('empty output is rejected — excision must not delete the section', () => {
  const r = exciseGuard('one two three', '', findings);
  assert.equal(r.ok, false);
});

test('a non-string output is rejected rather than crashing', () => {
  const r = exciseGuard('one two three', null, findings);
  assert.equal(r.ok, false);
});

// ── selectHarvestTargets ─────────────────────────────────────────────────────

test('selectHarvestTargets: caps at the requested count', () => {
  const r = [1, 2, 3, 4, 5, 6].map((n) => ({ url: `https://a.example/${n}` }));
  assert.equal(selectHarvestTargets(r, 4, []).length, 4);
});

test('selectHarvestTargets: dedupes on host+path, ignoring query and fragment', () => {
  const r = [
    { url: 'https://a.example/x?utm=1' },
    { url: 'https://a.example/x#frag' },
    { url: 'https://b.example/x' },
  ];
  assert.deepEqual(selectHarvestTargets(r, 4, []).map((t) => t.url),
    ['https://a.example/x?utm=1', 'https://b.example/x']);
});

test('selectHarvestTargets: drops non-http schemes and unparseable urls', () => {
  const r = [
    { url: 'ftp://a.example/x' },
    { url: 'not a url' },
    { url: 'javascript:alert(1)' },
    { url: 'https://ok.example/y' },
  ];
  assert.deepEqual(selectHarvestTargets(r, 4, []).map((t) => t.url), ['https://ok.example/y']);
});

test('selectHarvestTargets: excludes already-harvested urls by host+path', () => {
  const r = [{ url: 'https://a.example/x?a=1' }, { url: 'https://b.example/y' }];
  assert.deepEqual(selectHarvestTargets(r, 4, ['https://a.example/x']).map((t) => t.url),
    ['https://b.example/y']);
});

test('selectHarvestTargets: preserves search rank order', () => {
  const r = [{ url: 'https://c.example/3' }, { url: 'https://a.example/1' }];
  assert.deepEqual(selectHarvestTargets(r, 4, []).map((t) => t.url),
    ['https://c.example/3', 'https://a.example/1']);
});

test('selectHarvestTargets: tolerates a null/empty result list', () => {
  assert.deepEqual(selectHarvestTargets(null, 4, []), []);
  assert.deepEqual(selectHarvestTargets([], 4, []), []);
  assert.deepEqual(selectHarvestTargets([{ }, { url: '' }], 4, []), []);
});

// ── excerptGuard ─────────────────────────────────────────────────────────────

const SPANS = {
  'https://a.example/x': [
    'The transition rate rose from 4.2 percent in 2023 to 7.8 percent in 2024, the largest single-year move on record.',
  ],
};
const URLS = ['https://a.example/x', 'https://b.example/y'];
const fnd = (over = {}) => ({
  subQuestion: 'q1', claim: 'c', source: 'https://a.example/x',
  excerpt: 'The transition rate rose from 4.2 percent in 2023 to 7.8 percent in 2024, the largest single-year move on record.',
  ...over,
});

test('excerptGuard: a verbatim span passes', () => {
  assert.deepEqual(excerptGuard(fnd(), SPANS, URLS), { ok: true });
});

test('excerptGuard: a verbatim SUBSTRING of a span passes', () => {
  const r = excerptGuard(fnd({ excerpt: 'rose from 4.2 percent in 2023 to 7.8 percent in 2024, the largest single-year move' }), SPANS, URLS);
  assert.equal(r.ok, true);
});

test('excerptGuard: whitespace differences are normalised away', () => {
  const r = excerptGuard(fnd({ excerpt: 'The transition rate rose from 4.2 percent\n  in 2023 to 7.8 percent in 2024, the largest single-year move on record.' }), SPANS, URLS);
  assert.equal(r.ok, true);
});

test('excerptGuard: a paraphrase fails with the paraphrase reason', () => {
  const r = excerptGuard(fnd({ excerpt: 'The transition rate nearly doubled between 2023 and 2024, which was a record annual increase.' }), SPANS, URLS);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not a verbatim span/);
});

test('excerptGuard: an excerpt shorter than MIN_EXCERPT_CHARS fails even though it is verbatim', () => {
  const r = excerptGuard(fnd({ excerpt: 'The transition rate rose' }), SPANS, URLS);
  assert.equal(r.ok, false);
  assert.match(r.reason, /too short/);
  assert.ok('The transition rate rose'.length < MIN_EXCERPT_CHARS);
});

test('excerptGuard: a missing or empty excerpt fails', () => {
  assert.equal(excerptGuard(fnd({ excerpt: '' }), SPANS, URLS).ok, false);
  assert.equal(excerptGuard(fnd({ excerpt: undefined }), SPANS, URLS).ok, false);
});

test('excerptGuard: a span belonging to a DIFFERENT source does not satisfy this finding', () => {
  const spans = { 'https://b.example/y': SPANS['https://a.example/x'] };
  const r = excerptGuard(fnd(), spans, URLS);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not a verbatim span/);
});

test('excerptGuard: a source the search stage never returned fails with the source reason', () => {
  const r = excerptGuard(fnd({ source: 'https://evil.example/z' }), SPANS, URLS);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not among the searched URLs/);
});

test('excerptGuard: the source check runs before the excerpt check', () => {
  // An unsourced finding with a good-looking excerpt must report the SOURCE failure — reporting
  // "too short" would send a reader looking at the wrong defect.
  const r = excerptGuard(fnd({ source: 'https://evil.example/z', excerpt: 'x' }), SPANS, URLS);
  assert.match(r.reason, /not among the searched URLs/);
});

test('excerptGuard: MIN_EXCERPT_CHARS is 80', () => {
  assert.equal(MIN_EXCERPT_CHARS, 80);
});

// ── roundsConverged ──────────────────────────────────────────────────────────

const u = (n) => `https://s${n}.example/p`;

test('roundsConverged: identical url sets converge', () => {
  const a = [u(1), u(2), u(3), u(4), u(5)];
  assert.equal(roundsConverged(a, a), true);
});

test('roundsConverged: 4 of 5 repeated is 80% and does NOT converge (strictly greater than)', () => {
  assert.equal(roundsConverged([u(1), u(2), u(3), u(4), u(5)], [u(1), u(2), u(3), u(4), u(9)]), false);
});

test('roundsConverged: 5 of 6 repeated is 83% and converges', () => {
  assert.equal(roundsConverged([u(1), u(2), u(3), u(4), u(5), u(6)],
    [u(1), u(2), u(3), u(4), u(5), u(9)]), true);
});

test('roundsConverged: a disjoint round 2 does not converge', () => {
  assert.equal(roundsConverged([u(1), u(2)], [u(3), u(4)]), false);
});

test('roundsConverged: overlap is measured on host+path, so tracking params do not hide a repeat', () => {
  assert.equal(roundsConverged(['https://a.example/x'], ['https://a.example/x?utm_source=q']), true);
});

test('roundsConverged: an empty round 2 converges — there is nothing new to harvest', () => {
  assert.equal(roundsConverged([u(1)], []), true);
});

test('roundsConverged: an empty round 1 does not converge', () => {
  assert.equal(roundsConverged([], [u(1)]), false);
});

// ── needsLiveRecheck ─────────────────────────────────────────────────────────

const USABLE_EXCERPT = 'a verbatim span of real length that comfortably clears the eighty character minimum excerpt threshold for reuse';

test('a finding with a usable excerpt and no objection does not need the live source', () => {
  assert.equal(needsLiveRecheck({ excerpt: USABLE_EXCERPT }, { needsSource: false }), false);
});

test('a finding with no excerpt always escalates', () => {
  assert.equal(needsLiveRecheck({ }, { needsSource: false }), true);
});

test('an empty or whitespace excerpt escalates', () => {
  assert.equal(needsLiveRecheck({ excerpt: '   ' }, { needsSource: false }), true);
});

test('an excerpt shorter than MIN_EXCERPT_CHARS but non-empty escalates', () => {
  assert.equal(needsLiveRecheck({ excerpt: 'too short' }, { needsSource: false }), true);
});

test('the recheck agent raising needsSource escalates', () => {
  assert.equal(needsLiveRecheck({ excerpt: USABLE_EXCERPT }, { needsSource: true }), true);
});

test('a missing verdict escalates — silence is not evidence the excerpt sufficed', () => {
  assert.equal(needsLiveRecheck({ excerpt: USABLE_EXCERPT }, undefined), true);
});

test('a contested finding escalates regardless of excerpt quality', () => {
  assert.equal(needsLiveRecheck({ excerpt: USABLE_EXCERPT, contested: true }, { needsSource: false }), true);
});
