import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { tokenize, isPlaceholder } from './lib/component-refs.mjs'
import { harvest } from './harvest-components.mjs'
import { readPolicy } from './lib/skill-surface.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Committed state, not the working tree. The CI runner checks out the repo and
// has no ~/.claude and no gitignored scratch files, so a working-tree scan would
// resolve differently there than here -- and a check that disagrees with the CI
// running it is worse than no check.
const CORPUS_ROOTS = ['skills/', 'agents/', 'rules/']

function committedMarkdown() {
  return execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter(p => CORPUS_ROOTS.some(r => p.startsWith(r)))
    .sort()
}

const isMeta = k => k.startsWith('$')
const declared = obj => new Set(Object.keys(obj ?? {}).filter(k => !isMeta(k)))

// An inline marker exempts the line it sits on or the line immediately after it.
// Line-scoped rather than file-scoped on purpose: hooks-reference.md and
// frontmatter-reference.md are live reference docs whose derivation record is the
// reason they are trustworthy. Blanket-exempting the file would stop checking two
// documents that should otherwise be fully checked.
const REF_OK = /<!--\s*ref-ok:\s*(\S.*?)\s*-->/

function exemptLines(src) {
  const out = new Set()
  const lines = src.split('\n')
  lines.forEach((text, i) => {
    if (REF_OK.test(text)) { out.add(i + 1); out.add(i + 2) }
  })
  return out
}

async function collectDangling() {
  const policy = await readPolicy()
  const refs = policy.references
  const inv = await harvest({ repoRoot: REPO_ROOT })

  // The resolution set: everything a citation is allowed to name.
  const componentNames = new Set(inv.map(c => c.name).filter(Boolean))
  const localOnly = declared(refs.localOnlySkills)
  const platform = declared(refs.platformAgentTypes)
  const ledgers = declared(refs.historicalLedgers)
  const shortName = s => new Set([...s].map(k => k.split('@')[0]))
  const expectedNs = shortName(declared(policy.plugins.expected))
  const removedNs = shortName(declared(policy.plugins.removed))

  // KNOWN namespaces -- the positive declaration. A `ns:name` pair is a component
  // CITATION only when `ns` is declared to be a component namespace. Everything
  // else is ordinary prose that happens to contain a colon.
  //
  // This is the epic's own governing principle applied to itself: "without a
  // committed declaration there is nothing to diff and nothing to fail." The
  // inverse rule -- "ns is not a known skill or plugin, therefore dead" -- is not
  // provable, and measured over this corpus it produces 48 findings of which 17
  // are real: file:line, node:test, type:feat, status:created, language:dart,
  // release:minor, toml:version, spectral:oas, and the CSS in a visual-companion
  // doc (display:flex, align-items:center, justify-content:center) all read as
  // dead references under it. A gate with a 3:1 false-positive ratio teaches its
  // readers to ignore it, which is the failure this epic exists to end.
  const knownNs = new Set([
    ...componentNames, ...localOnly, ...expectedNs, ...removedNs,
    ...declared(refs.knownNamespaces),
  ])
  // RESOLVABLE namespaces -- of the known ones, those that still exist. `removed`
  // is deliberately absent: a removed plugin's namespace is exactly what must
  // stop resolving.
  const resolvableNs = new Set([...componentNames, ...localOnly, ...expectedNs])
  const resolvableName = new Set([...componentNames, ...localOnly, ...platform])

  const dangling = []
  for (const file of committedMarkdown()) {
    if (ledgers.has(file)) continue
    const src = await readFile(join(REPO_ROOT, file), 'utf8')
    const exempt = exemptLines(src)

    for (const t of tokenize(src)) {
      if (exempt.has(t.line)) continue

      // Shape: a DECLARED namespace that no longer resolves. An undeclared
      // namespace is not a citation at all -- it is prose containing a colon --
      // and is left to the semantic layer.
      if (t.kind === 'nsref') {
        if (!knownNs.has(t.ns) || resolvableNs.has(t.ns)) continue
        dangling.push({ file, line: t.line, ref: t.value, why: `namespace "${t.ns}" is a declared component namespace that no longer resolves` })
        continue
      }

      // Shape: a QUOTED invocation slot naming something that does not exist.
      // Quoted only -- unquoted `subagent_type:` in narrative prose is not a
      // dispatch. Placeholders are a documented convention, not a citation.
      if (t.kind === 'qslot') {
        if (isPlaceholder(t.value) || resolvableName.has(t.value)) continue
        dangling.push({ file, line: t.line, ref: t.value, why: 'quoted invocation slot names no component, local-only skill, or declared platform agent type' })
      }
    }
  }
  return dangling.sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line))
}

test('no committed component reference resolves to nothing', async () => {
  const dangling = await collectDangling()
  const report = dangling.map(d => `  ${d.file}:${d.line}  ${d.ref}\n      ${d.why}`).join('\n')
  assert.equal(dangling.length, 0, `${dangling.length} dangling component reference(s):\n${report}`)
})

test('a bare namespace prefix with no name is not reported', async () => {
  // skills/writing-plans/SKILL.md:236 instructs readers NOT to use `superpowers:`.
  // Requiring ns:name excludes it; this asserts the corpus-level behaviour, not
  // just the tokenizer's.
  const dangling = await collectDangling()
  assert.ok(!dangling.some(d => d.file === 'skills/writing-plans/SKILL.md' && d.line === 236),
    'the counter-example prefix must not be flagged')
})

test('the retired colon notation is reported by ADR-0014, not by the dangling gate', async () => {
  // Was: "41 in-corpus occurrences of plan-management:<mode> resolve, so the dangling
  // gate must not flag them; whether the notation should exist is slice 4's ADR."
  // Slice 4 answered: ADR-0014 retires it, and the check below owns the finding.
  // The dangling gate must STILL stay silent here -- two gates reporting one defect
  // with two different explanations is how a reader learns to ignore both.
  const dangling = await collectDangling()
  assert.ok(!dangling.some(d => d.ref.startsWith('plan-management:')),
    'the dangling gate must not double-report what the ADR-0014 check owns')
})

// ADR-0014: a local component name may never appear as the HEAD of an `ns:name`
// token. `:` addresses the NAMESPACE axis and nothing else, so a component name
// in the head position is either a mode written as a namespace (the notation
// this ADR retires) or a genuine foreign-namespace collision. Both are defects.
//
// CORPUS IS WIDER THAN CORPUS_ROOTS -- repo-wide, minus `plans/`. Deliberate: this
// asks a far narrower question than the dangling-reference gate above (one
// membership test on the head, no resolution attempt), so it does not carry the
// unmeasured-corpus risk that got the adherence-audit slice cut. 29 of the 70
// original sites lived in `docs/`, which CORPUS_ROOTS does not read at all, so
// scoping this check to CORPUS_ROOTS would leave 41% of the migration ungated.
//
// `plans/` is excluded because it is gitignored working state (.gitignore:10);
// the two occurrences that remain there sit in a committed leftover plan doc
// that RECORDS a past state, and editing it would make the record lie.
//
// COLLISION CLASS -- read before adding a component named `harvest`, `verify`,
// `recall`, `engine` or `build`. npm script references tokenize as nsrefs:
// measured over the committed markdown, `harvest:` appears 6 times, `verify:` 6,
// `recall:` 1 (all currently undeclared prose, and so ignored). Naming a
// component after one of those heads would fire this check on every mention of
// `npm run harvest:check`. That is not hypothetical -- scripts/harvest-components.mjs
// already exists. The escape hatch is an inline `<!-- ref-ok: ... -->` marker,
// honored here exactly as it is by the dangling gate above.
const NSREF_CHECK_ROOT_EXCLUDE = 'plans/'

async function collectComponentHeadedNsrefs() {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const componentNames = new Set(inv.map(c => c.name).filter(Boolean))

  const files = execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter(p => !p.startsWith(NSREF_CHECK_ROOT_EXCLUDE))
    .sort()

  const found = []
  for (const file of files) {
    const src = await readFile(join(REPO_ROOT, file), 'utf8')
    const exempt = exemptLines(src)
    for (const t of tokenize(src)) {
      if (t.kind !== 'nsref') continue
      if (exempt.has(t.line)) continue
      if (componentNames.has(t.ns)) found.push({ file, line: t.line, ref: t.value, ns: t.ns })
    }
  }
  return found.sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line))
}

test('no local component name is used as a namespace prefix (ADR-0014)', async () => {
  const found = await collectComponentHeadedNsrefs()
  const report = found.map(f => `  ${f.file}:${f.line}  ${f.ref}`).join('\n')
  assert.equal(
    found.length,
    0,
    `${found.length} reference(s) use a local component name as a namespace prefix:\n${report}\n` +
      `ADR-0014: \`:\` qualifies a reference into a DIFFERENT namespace. A local component is in ` +
      `the current namespace, so it is cited BARE. A mode is an argument, not an addressing axis — ` +
      `write \`plan-management\` with \`status: divergence\` (the space after the colon is ` +
      `load-bearing; \`status:divergence\` would itself tokenize).\n` +
      `If this is a genuine foreign namespace that happens to collide with a local component name ` +
      `(e.g. an npm script like \`harvest:check\`), mark the line with ` +
      `\`<!-- ref-ok: <reason> -->\` — the same escape hatch the dangling gate uses.`,
  )
})

test('an inline ref-ok marker exempts only its own line, not the file', async () => {
  const src = [
    '<!-- ref-ok: provenance -->',
    'Derived from `nosuchns:nosuchname`, removed 2026-08-06.',
    'But `othernosuchns:othernosuchname` here is NOT exempt.',
  ].join('\n')
  const exempt = exemptLines(src)
  assert.ok(exempt.has(2), 'the line after the marker is exempt')
  assert.ok(!exempt.has(3), 'the next line is not — exemption is line-scoped, never file-scoped')
})

test('the historical-ledger exemption is declared, and currently dormant by construction', async () => {
  const policy = await readPolicy()
  const ledgers = declared(policy.references.historicalLedgers)
  assert.ok(ledgers.has('plugins/registry.md'))
  assert.ok(ledgers.has('plugins/history.md'))

  // DORMANCY, asserted rather than assumed. Every declared ledger sits outside
  // CORPUS_ROOTS, so collectDangling()'s `if (ledgers.has(file)) continue` skip
  // has never executed -- committedMarkdown() never yields a file it could match.
  // That is fine, and it is deliberately NOT deleted: the branch is what would
  // keep the ledgers exempt the moment CORPUS_ROOTS widens. Asserting the
  // dormancy is what stops it activating silently -- widen CORPUS_ROOTS and this
  // fails, telling you a previously-dead branch just became live and needs a
  // test that actually exercises it.
  const reachable = [...ledgers].filter(f => CORPUS_ROOTS.some(r => f.startsWith(r)))
  assert.deepEqual(
    reachable,
    [],
    `historicalLedgers now names ${reachable.length} file(s) inside CORPUS_ROOTS, so the skip ` +
      `branch in collectDangling() is live for the first time. It has never run before and has ` +
      `no coverage — add a test that exercises it before relying on it.`,
  )
})
