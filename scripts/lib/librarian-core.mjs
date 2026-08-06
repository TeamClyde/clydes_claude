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

// ── Rendering ───────────────────────────────────────────────────────────────
// Every table below is a PROJECTION of the findings. An agent never types a URL, a support label,
// or a flag — which is what makes dossier.md and findings.json structurally unable to disagree.

// A literal | terminates a markdown cell, and a newline terminates the row. Claims are free text
// and URLs carry query strings, so both must be neutralised before rendering: an unescaped pipe
// silently shifts every subsequent column, which is exactly the quiet corruption a code-rendered
// evidence table exists to prevent.
const escapeCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

/**
 * @param {string[]} headers
 * @param {Array<Array<unknown>>} rows
 * @returns {string} a GitHub-flavoured markdown table
 */
export function renderTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  // A header with no body renders as a broken stub in most viewers. Emit an explicit placeholder
  // so "no rows" reads as a fact rather than as a rendering failure.
  if (!rows.length) return `${head}\n${sep}\n| ${headers.map((_, i) => (i ? '' : '_none_')).join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(escapeCell).join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

/**
 * The file-level header, written ONCE when research/<slug>/dossier.md is created.
 *
 * No run counter and no "latest" date: dossier.md is append-only, so a later write cannot reach
 * back and update a number at the top of the file. Both values are machine-available from
 * findings.json `runs[]`, which IS rewritten wholesale each run.
 */
export function renderDossierHeader(topic, runDate) {
  return `# Research: ${topic}\n\n`
    + `> Topic first researched ${runDate}\n`
    + `> Machine-readable findings: ./findings.json\n`;
}

/**
 * Render ONE dated entry, to be appended to dossier.md. Prior entries are never edited.
 *
 * @param {{runDate:string, title:string, coverage:{answered:number,total:number,missing:string[]},
 *          evidenceState:string, supersedes:Array, sections:Array, closing:string, integrity:Array}} run
 * @returns {string}
 */
export function renderDossierEntry(run) {
  const out = [];
  out.push(`---`, ``, `## ${run.runDate} — ${run.title}`);
  out.push(`> ${run.coverage.answered} of ${run.coverage.total} sub-questions answered · evidence: ${run.evidenceState}`, ``);

  if (run.supersedes?.length) {
    out.push(`### Supersedes`, ``);
    out.push(renderTable(['Prior finding', 'From', 'Why'],
      run.supersedes.map((s) => [s.claim, s.priorRunDate, s.reason])), ``);
  }

  for (const section of run.sections ?? []) {
    out.push(`### Q: ${section.subQuestion}`, ``);
    // Verbatim. The section writer's prose is the payload; compressing it here would re-create
    // exactly the loss the stitcher was deleted for.
    out.push(section.markdown, ``);
    out.push(`#### Evidence`, ``);
    out.push(renderTable(['Source', 'Covers', 'Support', 'Flags'],
      (section.findings ?? []).map((f) => [
        f.source ?? '',
        f.claim ?? '',
        // `unlabelled` rather than blank: an empty Support cell reads as "no concern found",
        // which is the opposite of "this claim was never judged".
        f.support ?? 'unlabelled',
        [f.thinSource ? 'thin source' : '', f.reframe?.improved ? 'reframed' : ''].filter(Boolean).join(', '),
      ])), ``);
  }

  // Coverage below 100% is reported IN the dossier, not only in the return value — a reader of the
  // file must be able to see which parts of the brief it does not answer.
  if (run.coverage.missing?.length) {
    out.push(`### Unanswered`, ``);
    out.push(run.coverage.missing.map((q) => `- ${q}`).join('\n'), ``);
  }

  out.push(`### What this means`, ``, run.closing, ``);

  // Present ONLY when claims failed the audit after repair — and then never silently omitted.
  if (run.integrity?.length) {
    out.push(`### Integrity`, ``);
    out.push(renderTable(['Sub-question', 'Claim', 'Reason'],
      run.integrity.map((i) => [i.subQuestion, i.claim, i.reason])), ``);
  }

  return out.join('\n');
}

/**
 * Merge this run into the prior findings.json payload.
 *
 * dossier.md is append-only HISTORY; findings.json is DATA, rewritten wholesale each run. That
 * split is what lets supersession be recorded mechanically without editing a prior narrative entry.
 * No finding is ever deleted here — superseded records are STAMPED, so a later session following a
 * stale pointer still sees why it was replaced.
 *
 * The workflow performs this merge, not main context: it is the only place holding both
 * args.priorFindings and this run's output, and handing JSON reconstruction to a model is the same
 * non-deterministic-component-holds-the-payload failure this whole design removes. The workflow
 * still writes no files — main context stringifies this object to disk.
 *
 * @param {object|null} prior - parsed findings.json, or null/garbage on a first run
 * @param {object} run
 * @returns {{topic:string, runs:Array, findings:Array, integrity:Array}}
 */
export function mergeFindingsDoc(prior, run) {
  const base = prior && typeof prior === 'object' && !Array.isArray(prior) ? prior : {};
  const priorRuns = Array.isArray(base.runs) ? base.runs : [];
  const priorFindings = Array.isArray(base.findings) ? base.findings : [];
  const priorIntegrity = Array.isArray(base.integrity) ? base.integrity : [];

  // Key on (runDate, claim). A claim string is not globally unique, but it IS unique within a run,
  // and the supersession pass emits the prior run's own date alongside it.
  const supKey = (d, c) => `${d}::${c}`;
  const superseded = new Map((run.supersedes ?? []).map((s) => [supKey(s.priorRunDate, s.claim), s]));

  const stamped = priorFindings.map((f) => {
    const hit = superseded.get(supKey(f.runDate, f.claim));
    return hit ? { ...f, supersededBy: { runDate: run.runDate, reason: hit.reason } } : f;
  });

  return {
    topic: base.topic ?? run.topic,
    runs: [
      { date: run.runDate, brief: run.brief, coverage: run.coverage, evidenceState: run.evidenceState },
      ...priorRuns,
    ],
    findings: [
      ...(run.findings ?? []).map((f) => ({ runDate: run.runDate, ...f })),
      ...stamped,
    ],
    integrity: [
      ...(run.integrity ?? []).map((i) => ({ runDate: run.runDate, ...i })),
      ...priorIntegrity,
    ],
  };
}
