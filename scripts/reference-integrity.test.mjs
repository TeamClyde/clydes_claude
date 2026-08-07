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

test('valid local-skill colon notation is not reported', async () => {
  // 41 in-corpus occurrences of `plan-management:<mode>` are prose notation for
  // "the <mode> mode of plan-management". `plan-management` IS a local skill, so
  // they resolve. Whether the notation should exist at all is slice 4's ADR, not
  // this gate's call.
  const dangling = await collectDangling()
  assert.ok(!dangling.some(d => d.ref.startsWith('plan-management:')),
    'plan-management: notation resolves and must not be flagged')
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

test('the historical-ledger exemption is file-scoped', async () => {
  const policy = await readPolicy()
  const ledgers = declared(policy.references.historicalLedgers)
  assert.ok(ledgers.has('plugins/registry.md'))
  assert.ok(ledgers.has('plugins/history.md'))
})
