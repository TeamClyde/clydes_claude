import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCoverage, deriveEvidenceState, hasAnySource, urlsInProse, unknownUrls,
  COVERAGE_MIN_RATIO, COVERAGE_MIN_ANSWERED,
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
