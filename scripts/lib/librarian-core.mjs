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
// `)` is allowed IN the match because it is legitimate URL path content
// (…/wiki/Bird_(disambiguation)), then trailing noise is trimmed off separately below.
// Excluding `)` from the class outright — the obvious move — silently truncates the parenthetical
// case, and because unknownUrls compares against the finding's exact source, a correctly cited
// URL then reads as smuggled.
const PROSE_URL_RE = /https?:\/\/[^\s<>"'`\]]+/gi;

// Trailing noise on a URL in prose nests in both directions — "(see https://x/y.)" buries the
// unbalanced `)` under a period, while "(see https://x/y)," buries it under a comma — so a fixed
// strip-punct-then-strip-paren order fixes one shape and breaks the other. Hence: loop until the
// end index stops moving.
//
// Parens are counted ONCE up front and `closes` is decremented as closers are consumed, rather
// than rescanning the string per iteration. The rescanning version is O(n^2) and measurably hangs
// on a long run of `)` — and this input is agent-generated prose, so a degenerate repeated-character
// run is a real possibility rather than a theoretical one.
const TRAILING_PUNCT = '.,;:!?';

const trimTrailingNoise = (u) => {
  let opens = 0;
  let closes = 0;
  for (let i = 0; i < u.length; i++) {
    if (u[i] === '(') opens++;
    else if (u[i] === ')') closes++;
  }
  let end = u.length;
  for (;;) {
    const before = end;
    while (end > 0 && TRAILING_PUNCT.includes(u[end - 1])) end--;
    // Only an UNBALANCED closer is trimmed, so `.../wiki/Bird_(disambiguation)` keeps its pair
    // while a wrapping `(...)` or a markdown `[t](...)` closer is removed.
    if (end > 0 && u[end - 1] === ')' && closes > opens) {
      end--;
      closes--;
    }
    if (end === before) return u.slice(0, end);
  }
};

/** @param {string} markdown @returns {string[]} deduped URLs appearing in the prose */
export function urlsInProse(markdown) {
  const hits = String(markdown ?? '').match(PROSE_URL_RE) ?? [];
  return [...new Set(hits.map(trimTrailingNoise))];
}

/**
 * URLs the prose cites that are NOT in this section's own findings.
 *
 * This is the free, deterministic half of section validation: set membership, no agent. It catches
 * the section writer inventing or importing a source, which is the mechanism behind a report
 * claiming more provenance than the evidence supports.
 *
 * Comparison is byte-exact: a case difference or a trailing-slash-only difference between the
 * prose citation and the finding's `source` counts as a DIFFERENT url, so it is reported as
 * unknown even though a human would read them as the same page. This is deliberate, not an
 * oversight — the safe failure direction for a provenance gate is over-flagging. Byte-exact can
 * only produce extra (spurious) flags; it can never let a fabricated or substituted citation pass
 * as known. A normalizing comparison (case-fold, trailing-slash-insensitive) would close that gap
 * at the cost of occasionally waving through a URL that merely resembles a known one.
 *
 * @param {string} markdown
 * @param {Array<{source?: unknown}>} findings - THIS section's slice, never the whole run
 * @returns {string[]}
 */
export function unknownUrls(markdown, findings) {
  const known = new Set(
    (findings ?? [])
      .map((f) => (typeof f?.source === 'string' ? trimTrailingNoise(f.source.trim()) : ''))
      .filter(Boolean),
  );
  return urlsInProse(markdown).filter((u) => !known.has(u));
}
