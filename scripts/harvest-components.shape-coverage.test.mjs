import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { harvest } from './harvest-components.mjs'
import {
  resolvedNames, tokenize, backtickEdgeName, pathEdgeName, colonEdgeName, suffixedEdgeName,
} from './lib/component-refs.mjs'

// Repo root resolved the portable way (matches existing .claude/hooks/*.mjs).
// Do NOT use `new URL('../', import.meta.url).pathname` — yields /C:/… on Windows.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ===========================================================================
// SHAPE-COVERAGE INVARIANT — the RECALL counterpart to slice 1's gate.
// ===========================================================================
//
// scripts/reference-integrity.test.mjs asks "does this citation resolve to
// something?" — a PRECISION question, and one with a blind spot in exactly the
// opposite direction. A component cited in a shape the tokenizer cannot READ
// emits no token at all, so it is not dangling, fails nothing, and the edge
// simply never exists. Slice 1's gate is structurally incapable of noticing
// that. This invariant asks the mirror question: *is a component cited in a
// shape we cannot see?*
//
// WHY THIS IS NOT "RE-APPLY THE FOUR RULES AND CHECK". An invariant built by
// re-running backtick/path/colon/suffixed over the corpus detects only a
// RESOLVER REGRESSION — a genuinely new shape #5 is BY DEFINITION something
// none of the four rules match, so it would be invisible to such a check,
// which defeats the entire purpose. (Regression detection is already covered,
// by the equivalence oracle in harvest-components.test.mjs.) The rule below
// therefore deliberately does NOT resolve; it CONTAINS.
//
// THE DETECTION RULE, in three steps:
//   1. Take every `backtick` span that resolves under NONE of the four rules.
//   2. Split it on `/`, `.`, `:`, `#` and whitespace, and ask whether any
//      segment — or any contiguous slash-joined run of segments — IS a known
//      node name.
//   3. A span that demonstrably NAMES a real component but resolves to nothing
//      is a candidate unrecognized shape: report component, file:line, span,
//      and the node it appears to name.
//
// Containment is deliberately WEAKER than resolution, and that weakness is the
// feature: it is allowed to be wrong about intent (a span can name a component
// without citing it), which is precisely what lets it see a shape nobody has
// thought of yet. The declared exemptions below are where "wrong about intent"
// is paid for — by name, individually, with a reason.

/**
 * Names a span appears to mention, tested by CONTAINMENT rather than by any
 * resolution rule.
 *
 * Splits on `[.:#\s]` first, then walks contiguous `/`-joined runs inside each
 * chunk. The two-level split exists because two real node names contain a
 * slash — `filesystem/efficiency` and `filesystem/path-portability`
 * (scanRules() prefixes nested rule names with their directory). A flat
 * per-segment split on `/` could never match either of them, so those two
 * nodes would be permanently invisible to this invariant. Measured against the
 * current corpus the runs make no difference to the finding set (13 pairs
 * either way); they are here so that fact stays true if a nested rule ever IS
 * cited in an unreadable shape.
 */
function citedNamesIn(span, nameSet) {
  const out = new Set()
  for (const chunk of span.split(/[.:#\s]+/)) {
    const parts = chunk.split('/').filter(Boolean)
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j <= parts.length; j++) {
        const candidate = parts.slice(i, j).join('/')
        if (nameSet.has(candidate)) out.add(candidate)
      }
    }
  }
  return out
}

/**
 * How many lines `parseFrontmatter` strips off the front of a file.
 *
 * `tokenize()` line numbers are BODY-relative, and every component's `body`
 * came from `parseFrontmatter`, which removes the frontmatter block. So a file
 * line is `bodyLine + frontmatterOffset(raw)`. Without this every citation site
 * this invariant prints is wrong — silently, and by a different amount per
 * file, which is the worst kind of wrong for a message whose whole job is to
 * send a reader to a specific line.
 *
 * Derived by MIRRORING parseFrontmatter's own strip regex rather than by
 * independently scanning for the closing `---`. That is intentional: the offset
 * has to describe the exact text that was removed, and any second
 * implementation of "where does frontmatter end" could disagree with the first
 * on a malformed or unusual header. Reusing the regex cannot.
 *
 * parseFrontmatter returns `{ fields, body }` only — it does not expose the
 * count — and its signature is NOT widened for this, because the need is
 * test-only and it has production callers (scanSkills / scanAgents / scanRules).
 *
 * The offset is NOT a constant. Skills and agents carry frontmatter; several
 * rules (`rules/doc-tools.md`, `rules/plan-docs.md`, ...) open directly with a
 * `#` heading and have none at all, so their offset is 0 and an unconditional
 * `+N` would push every one of their reported lines off the end of the header
 * that isn't there. Both cases are asserted below.
 */
function frontmatterOffset(raw) {
  const norm = raw.replace(/\r\n/g, '\n')
  const body = norm.replace(/^---\n[\s\S]*?\n---\n?/, '')
  return norm.split('\n').length - body.split('\n').length
}

// DECLARED EXEMPTIONS — spans that name a component without citing it.
//
// Calibrated against the full corpus, not chosen a priori. The naive form of
// the rule ("flag every non-resolving span containing a node name") yields 35
// pairs, which by the plan's own bar — "if calibration yields a large exemption
// list, the rule is wrong" — condemns the naive rule rather than the corpus.
//
// The fix is a sharper question, and it is load-bearing:
//
//   Only report when the citing component does NOT ALREADY have an edge to
//   that node from some other token in its body.
//
// The invariant's purpose is GRAPH COMPLETENESS, which is a property of the
// component, not of any individual span. If A cites B in both a readable and an
// unreadable shape, the edge exists and the graph is already correct — the
// unreadable span costs nothing and a finding about it is a finding about
// nothing. Applying the filter drops 35 pairs to 13 and removes exactly that
// class (e.g. `` `subagent_type: architect` `` in plan-gate, whose edge the
// `slot` token has already produced).
//
// ACCEPTED LIMITATION, stated so nobody "discovers" it later and files it as a
// bug: a genuinely new shape that ONLY EVER co-occurs alongside a readable
// citation of the same target is invisible to this invariant. That is the
// deliberate trade for the stated purpose. A new shape used for a target cited
// no other way — the case that actually costs an edge — is still caught.
//
// GRANULARITY is the `from|to` PAIR, not the span. The reason strings below are
// claims about a component's relationship to a node ("doc-author's mentions of
// docs-refresh are slash-command invocations, not dependencies"), which is a
// pair-shaped claim; pinning each entry to verbatim span text would also churn
// the list on every prose edit. The cost is that a second, genuinely new shape
// between an already-exempt pair would be absorbed silently. Accepted: the pair
// is already known not to yield an edge, so no edge can be lost by it.
//
// Both directions are asserted below — an unexempted finding fails, and so does
// a STALE exemption whose finding no longer occurs. An exemption list that is
// never checked for staleness is how an exemption list becomes a hiding place.
const SHAPE_COVERAGE_EXEMPTIONS = [
  // ── Class 1: example-argument text ────────────────────────────────────────
  // The span is an EXAMPLE INVOCATION of the citing skill, and the named
  // component is the SUBJECT of the example sentence, not a dependency.
  // `feedback` does not depend on `brainstorming` because its usage example
  // describes someone reporting that brainstorming got skipped. Genuine false
  // positives — the containment rule seeing a name and not a citation.
  { from: 'different-viewpoint', to: 'writing-plans',
    reason: 'example-argument text: the span is a sample `/different-viewpoint <problem statement>` invocation whose problem statement happens to be about writing-plans' },
  { from: 'feedback', to: 'brainstorming',
    reason: 'example-argument text: sample `/feedback <observation>` invocation; brainstorming is the subject of the reported observation, not a dependency of feedback' },
  { from: 'feedback', to: 'plan-gate',
    reason: 'example-argument text: sample `/feedback <observation>` invocation; plan-gate is the subject of the reported observation' },
  { from: 'feedback', to: 'architect',
    reason: 'example-argument text: same sample `/feedback` line as the plan-gate entry above — the observation names both' },
  { from: 'feedback', to: 'git-manager',
    reason: 'example-argument text: sample `/feedback <observation>` invocation; git-manager is the subject of the reported observation' },

  // ── Class 2: console-output string ────────────────────────────────────────
  // The span is a message the skill PRINTS at runtime. Text a component emits
  // is not a citation the component makes.
  { from: 'doc-author', to: 'infra-init',
    reason: 'console-output string: the span is an error message doc-author prints ("... Run /infra-init first."), not a reference doc-author makes' },

  // ── Class 3: `.claude/` basename collision ────────────────────────────────
  // `.claude/integration-test-constraints.md` is a REPO-LEVEL CONFIG FILE. The
  // rule node of that name lives at `rules/integration-test-constraints.md`.
  // Two different files that happen to share a basename — which is precisely
  // the case Task 1's CONTAINER GUARD in pathEdgeName() was built to exclude
  // (see its comment in scripts/lib/component-refs.mjs: a `.md` span resolves
  // only when the preceding segment is a real container). The guard is working
  // as designed here; containment simply cannot see the distinction, because
  // the basename genuinely is a node name.
  { from: 'e2e-init', to: 'integration-test-constraints',
    reason: '.claude/ basename collision: `.claude/integration-test-constraints.md` is the repo-level config file, not the rule at rules/integration-test-constraints.md — excluded on purpose by pathEdgeName\'s container guard' },
  { from: 'test-builder', to: 'integration-test-constraints',
    reason: '.claude/ basename collision: same repo-level config file as the e2e-init entry — see pathEdgeName\'s container guard' },
  { from: 'test-strategy', to: 'integration-test-constraints',
    reason: '.claude/ basename collision: same repo-level config file as the e2e-init entry — see pathEdgeName\'s container guard' },

  // ── Class 4: known-real, deliberately out of corpus ───────────────────────
  // These two spans name a file OWNED BY a component rather than the component
  // itself. They arguably ARE real dependencies — and are exempted anyway, on a
  // decision already taken rather than a hand-wave: the plan's Open Question 3
  // resolved NOT to widen the edge corpus to skill aux files, because doing so
  // re-opens slice 1's two-corpora decision and would move far more than the
  // enumerated edge set. Recorded there as a `remediation/` finding. If that
  // decision is ever reversed, these are the entries to delete first.
  { from: 'requesting-code-review', to: 'subagent-driven-development',
    reason: 'aux-file citation (known real, out of corpus by Open Question 3): names subagent-driven-development/code-quality-reviewer-prompt.md, a file the component owns, not the component' },
  { from: 'writing-agents', to: 'creating-tools',
    reason: 'aux-file citation (known real, out of corpus by Open Question 3): names creating-tools/frontmatter-reference.md, a file the component owns, not the component' },

  // ── Class 5: shapes the plan deliberately declined to resolve ─────────────
  // Not false positives and not out-of-corpus — real citations in shapes the
  // extractor was deliberately not widened to read. Candidates for a future
  // rule, recorded here so that choice stays visible instead of dissolving into
  // "the graph just doesn't have that edge".
  { from: 'writing-skills', to: 'systematic-debugging',
    reason: 'bare-name-in-prose shape, deliberately not widened (Blueprint: "Not widened: the bare-name shape") — and the span is itself a quoted authoring EXAMPLE of correct cross-skill reference syntax, not writing-skills depending on systematic-debugging' },
  { from: 'doc-author', to: 'docs-refresh',
    reason: 'slash-command + argument (`/docs-refresh feature|architecture`): a real citation whose trailing argument defeats pathEdgeName\'s bare-`/<n>` form — a candidate for a future rule, not a false positive' },
]

// DUPLICATE-EXEMPTION GUARD — two entries sharing the same `from`/`to` collapse
// into one `Set` key below (`exempt`/`stale` are keyed on `from|to`, not on the
// array itself), silently leaving one entry as dead weight no test would catch.
// Asserting the array length equals the derived key-set size closes that gap.
assert.equal(
  SHAPE_COVERAGE_EXEMPTIONS.length,
  new Set(SHAPE_COVERAGE_EXEMPTIONS.map(e => `${e.from}|${e.to}`)).size,
  'SHAPE_COVERAGE_EXEMPTIONS has a duplicate from|to pair — one entry is dead weight',
)

/**
 * Every candidate unrecognized shape in the corpus, BEFORE exemptions.
 * Exemptions are applied by the caller so that the offset test below can
 * verify line numbers on the full candidate set, exempt ones included.
 */
async function collectUnrecognizedShapes() {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const sorted = [...new Set(inv.map(c => c.name).filter(Boolean))].sort((a, b) => b.length - a.length)
  const nameSet = new Set(sorted)

  const findings = []
  for (const c of inv) {
    const body = c.body || ''
    // 10 of 79 nodes are hooks, which scanHooks() gives `body: ''` — they
    // contribute no spans. That is the scanner's design, not a gap here.
    if (!body) continue

    // The component's ACTUAL outbound edge set, straight from the production
    // resolver — this is what makes the "already edged" filter above a
    // statement about the real graph rather than a re-derivation of it.
    const edged = resolvedNames(body, sorted, c.name)
    const raw = (await readFile(join(REPO_ROOT, c.file), 'utf8')).replace(/\r\n/g, '\n')
    const offset = frontmatterOffset(raw)

    for (const t of tokenize(body)) {
      if (t.kind !== 'backtick') continue
      // Same four rules in the same precedence order resolvedNames() applies to
      // a `backtick` token. Kept in step with it deliberately: if a fifth rule
      // is ever added there it must be added here too, or this invariant starts
      // reporting spans production can already read. (It would under-report,
      // never over-report, because a span the resolver reads produces an edge
      // and the `edged` filter then drops the finding — but a quiet
      // under-reporting invariant is still a broken one.)
      const resolves = backtickEdgeName(t.value, nameSet)
        || pathEdgeName(t.value, nameSet)
        || colonEdgeName(t.value, nameSet)
        || suffixedEdgeName(t.value, sorted)
      if (resolves) continue

      for (const named of citedNamesIn(t.value, nameSet)) {
        if (named === c.name) continue      // self-mention is not a citation
        if (edged.has(named)) continue      // the edge already exists — see ACCEPTED LIMITATION
        findings.push({ from: c.name, to: named, file: c.file, line: t.line + offset, span: t.value })
      }
    }
  }
  const key = f => `${f.from}|${f.to}|${f.file}|${String(f.line).padStart(6, '0')}`
  return findings.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

test('no component is cited in a shape the extractor cannot read (shape coverage)', async () => {
  const findings = await collectUnrecognizedShapes()
  const exempt = new Set(SHAPE_COVERAGE_EXEMPTIONS.map(e => `${e.from}|${e.to}`))
  const found = new Set(findings.map(f => `${f.from}|${f.to}`))

  // Direction 1 — a candidate nobody has accounted for. Either the corpus
  // gained a citation shape the four rules cannot read (add a rule), or it
  // gained a span that names a component without citing it (add an exemption,
  // with a reason that would convince a reviewer).
  const unexplained = findings.filter(f => !exempt.has(`${f.from}|${f.to}`))
  // Direction 2 — an exemption whose finding no longer occurs. Delete it. An
  // exemption list that is only ever appended to stops being a declaration and
  // becomes a hiding place.
  const stale = [...exempt].filter(k => !found.has(k)).sort()

  assert.deepEqual(
    {
      unexplained: unexplained.map(f => `${f.from} -> ${f.to} @ ${f.file}:${f.line}`),
      stale,
    },
    { unexplained: [], stale: [] },
    'shape coverage diverged:\n'
      + `  unexplained (component named in an unreadable span, no edge, no exemption):\n${
        unexplained.map(f => `    ${f.from} -> ${f.to}\n      ${f.file}:${f.line}  \`${f.span}\``).join('\n') || '    (none)'}\n`
      + `  stale (declared exemption that no longer matches anything — delete it): ${stale.join(', ') || '(none)'}`,
  )
})

test('frontmatter offset is derived per-file, and is 0 for a file with no frontmatter', async () => {
  // Known-length fixture: 4 header lines (`---`, two fields, `---`), so body
  // line 1 (`# Title`) is file line 5.
  const withFm = '---\nname: x\ndescription: y\n---\n# Title\nbody\n'
  assert.equal(frontmatterOffset(withFm), 4)
  assert.equal(withFm.split('\n')[1 - 1 + 4], '# Title', 'bodyLine 1 + offset must land on the first body line')

  // Zero-frontmatter: an unconditional `+N` would be wrong here, which is the
  // whole reason this is derived per file instead of assumed.
  assert.equal(frontmatterOffset('# Doc Tools\n\nSome text\n'), 0)

  // CRLF: this repo is developed on Windows and parseFrontmatter normalizes
  // line endings before matching, so the offset must too — otherwise the strip
  // regex misses entirely and every skill silently reports offset 0.
  assert.equal(frontmatterOffset('---\r\nname: x\r\n---\r\n# Title\r\n'), 3)

  // Anchored to the real corpus, both cases. rules/doc-tools.md and
  // rules/plan-docs.md open with `# ` and carry no frontmatter at all; every
  // skill does carry it.
  const rawRule = await readFile(join(REPO_ROOT, 'rules/doc-tools.md'), 'utf8')
  const rawPlanDocs = await readFile(join(REPO_ROOT, 'rules/plan-docs.md'), 'utf8')
  const rawSkill = await readFile(join(REPO_ROOT, 'skills/feedback/SKILL.md'), 'utf8')
  assert.equal(frontmatterOffset(rawRule), 0, 'rules/doc-tools.md has no frontmatter')
  assert.equal(frontmatterOffset(rawPlanDocs), 0, 'rules/plan-docs.md has no frontmatter')
  assert.ok(frontmatterOffset(rawSkill) > 0, 'a skill does carry frontmatter')
})

test('every reported citation site lands on the line that actually holds the span', async () => {
  // The end-to-end proof of the offset, and the reason it is worth deriving at
  // all: an invariant that prints `file:line` is only useful if a reader can
  // open that line and see the span. Checked over the WHOLE candidate set,
  // exempt entries included — exempting a finding does not excuse a wrong
  // line number, and the exempt rows are the ones that exercise both the
  // zero-offset (rules/) and non-zero (skills/, agents/) paths.
  const findings = await collectUnrecognizedShapes()
  assert.ok(findings.length > 0, 'no candidates to check — the offset assertion below would be vacuous')

  const wrong = []
  for (const f of findings) {
    const raw = (await readFile(join(REPO_ROOT, f.file), 'utf8')).replace(/\r\n/g, '\n')
    const text = raw.split('\n')[f.line - 1] ?? ''
    if (!text.includes(f.span)) wrong.push(`${f.file}:${f.line} does not contain \`${f.span}\` (found: ${JSON.stringify(text.slice(0, 80))})`)
  }
  assert.deepEqual(wrong, [], `reported line(s) off by the frontmatter offset:\n  ${wrong.join('\n  ')}`)
})
