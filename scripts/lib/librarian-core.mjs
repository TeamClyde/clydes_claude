// librarian-core.mjs — PURE helpers for the librarian workflow consumer body.
//
// NO IMPORTS. This module is inlined verbatim into scripts/librarian.workflow.mjs by
// scripts/build-engine-bundle.mjs (the Workflow sandbox has no module system), so an import
// here would survive the strip pass and crash the workflow at load.
//
// NAMED EXPORTS ONLY — the bundle's strip regex rewrites `export ` to ``; `export default`
// would be corrupted (see build-engine-bundle.mjs:11).
//
// Everything here is a PURE FUNCTION of its arguments. That is the property that makes the
// coverage gate and the evidence-state enum unit-testable at all: the workflow file itself
// cannot be imported by a test (top-level `args`/`agent` globals, top-level `return`), so any
// logic left inline in it can only ever be regex-asserted.

// ── Coverage ────────────────────────────────────────────────────────────────
// Proportional threshold with an absolute floor, so the rule scales from 4 sub-questions to 20:
// losing 3 of 4 stops the run; losing 3 of 20 is reported in the dossier, not fatal.
export const COVERAGE_MIN_RATIO = 0.6;
export const COVERAGE_MIN_ANSWERED = 2;

/**
 * How much of the BRIEF the fan-out actually answered.
 *
 * @param {string[]} subQuestions - the brief, as agreed with the user in main context
 * @param {Array<{subQuestion?: string}>} findings - raw findings across the whole fan-out
 * @returns {{answered:number, total:number, missing:string[], ratio:number, ok:boolean}}
 */
export function assessCoverage(subQuestions, findings) {
  const list = Array.isArray(subQuestions) ? subQuestions : [];
  const answeredSet = new Set((findings ?? []).map((f) => f?.subQuestion).filter(Boolean));
  // `missing` drives `answered`, never the other way round. A research leaf that drifts and stamps
  // a sub-question string not in the brief must NOT count as coverage — that is how a run reports
  // itself complete while leaving part of the brief unanswered.
  const missing = list.filter((q) => !answeredSet.has(q));
  const total = list.length;
  const answered = total - missing.length;
  const ratio = total ? answered / total : 0;
  // min(2, total): a bare `>= 2` is unsatisfiable for a 1-sub-question brief, and the workflow
  // accepts any non-empty subQuestions array — the gate would fail every such run on arity alone.
  const floor = Math.min(COVERAGE_MIN_ANSWERED, total);
  return { answered, total, missing, ratio, ok: total > 0 && ratio >= COVERAGE_MIN_RATIO && answered >= floor };
}

// ── Sources ─────────────────────────────────────────────────────────────────
// Anchored: a "source" is only resolvable if the WHOLE field is an http(s) URL. A finding whose
// source is prose containing a URL is not a citation.
const RESOLVABLE_SOURCE_RE = /^https?:\/\/\S+$/i;

/** @param {Array<{source?: unknown}>} findings */
export function hasAnySource(findings) {
  return (findings ?? []).some(
    (f) => typeof f?.source === 'string' && RESOLVABLE_SOURCE_RE.test(f.source.trim()),
  );
}

// ── Evidence state — the cause-bearing enum ─────────────────────────────────
/**
 * Derive WHY the evidence looks the way it does, from data the pipeline already has.
 *
 * Order is load-bearing: the enum is cause-bearing, so the MOST UPSTREAM cause wins. A run with
 * no reachable web produced no findings and tripped the coverage gate — reporting that as
 * `research-incomplete` would send the reader to fix their sub-questions when the real advice is
 * "re-run, the web was unreachable".
 *
 * `web-unavailable` derives from the fan-out's own output rather than a start-of-run probe. That
 * probe was analyzed and rejected (plans/phoenix/librarian-web-access-probe.md) partly because its
 * failure branch could not be tested in this environment; this derivation is a count over an array,
 * so a unit test constructs the input directly.
 *
 * @returns {'verified'|'unverified'|'no-results'|'web-unavailable'|'research-incomplete'}
 */
export function deriveEvidenceState({ findings, rawFindings, verifyDegraded, coverage }) {
  if (!hasAnySource(rawFindings)) return 'web-unavailable';
  if (!coverage?.ok) return 'research-incomplete';
  if ((findings ?? []).length === 0) return 'no-results';
  if (verifyDegraded) return 'unverified';
  return 'verified';
}

// ── URL membership (section validation layer 1) ─────────────────────────────
// Stops at whitespace and at the closers that wrap a URL in prose or markdown, so
// `(https://x/y)` and `[t](https://x/y)` yield the bare URL rather than one with a trailing `)`.
const PROSE_URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;

// Sentence-final punctuation is not part of a URL. Without this, "see https://x/y." never matches
// the finding's own `https://x/y` and every section would fail validation on its last sentence.
const stripTrailingPunct = (u) => u.replace(/[.,;:!?]+$/, '');

/** @param {string} markdown @returns {string[]} deduped URLs appearing in the prose */
export function urlsInProse(markdown) {
  const hits = String(markdown ?? '').match(PROSE_URL_RE) ?? [];
  return [...new Set(hits.map(stripTrailingPunct))];
}

/**
 * URLs the prose cites that are NOT in this section's own findings.
 *
 * This is the free, deterministic half of section validation: set membership, no agent. It catches
 * the section writer inventing or importing a source, which is the mechanism behind a report
 * claiming more provenance than the evidence supports.
 *
 * @param {string} markdown
 * @param {Array<{source?: unknown}>} findings - THIS section's slice, never the whole run
 * @returns {string[]}
 */
export function unknownUrls(markdown, findings) {
  const known = new Set(
    (findings ?? [])
      .map((f) => (typeof f?.source === 'string' ? stripTrailingPunct(f.source.trim()) : ''))
      .filter(Boolean),
  );
  return urlsInProse(markdown).filter((u) => !known.has(u));
}
