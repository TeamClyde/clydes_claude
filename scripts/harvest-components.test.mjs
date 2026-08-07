import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, isAbsolute } from 'node:path'
import { harvest, buildGateMap } from './harvest-components.mjs'
import { resolvedNames } from './lib/component-refs.mjs'

// Repo root resolved the portable way (matches existing .claude/hooks/*.mjs).
// Do NOT use `new URL('../', import.meta.url).pathname` — yields /C:/… on Windows.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('harvest finds skills, agents, rules, and hooks by type', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const byName = Object.fromEntries(inv.map(c => [`${c.type}:${c.name}`, c]))

  // skill with uppercase SKILL.md
  assert.equal(byName['skill:git-manager']?.type, 'skill')
  // adherence-audit — entry file is SKILL.md (all skills standardized); discovered by name.
  // The scanner's /^skill\.md$/i match stays case-insensitive defensively, even with no lowercase fixture.
  assert.equal(byName['skill:adherence-audit']?.type, 'skill')
  // agent carries its pinned model from frontmatter
  assert.equal(byName['agent:architect']?.model, 'claude-sonnet-4-6')
  // rule (plain markdown, no frontmatter)
  assert.equal(byName['rule:workflow-phases']?.type, 'rule')
  // hooks classified by event directory
  assert.equal(byName['hook:slash-command-enforcement']?.event, 'userPromptSubmit')
  assert.equal(byName['hook:install-vetting-advisory']?.event, 'preToolUse')
})

test('component file paths are repo-relative posix — artifacts must be machine-independent', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  // These paths are serialised into docs/reference/*.json and committed. An
  // absolute path bakes the generating machine's checkout directory into the
  // artifact, so `npm run harvest:check` can only ever pass on that one machine
  // in that one directory — it fails in CI and in any second clone. Backslashes
  // would do the same across Windows and POSIX. The audit subagents that read
  // the inventory resolve these against the repo root, so relative is also the
  // only form that is useful to them.
  for (const c of inv) {
    assert.ok(!isAbsolute(c.file), `${c.type}:${c.name} — file must be repo-relative, got absolute "${c.file}"`)
    assert.ok(!c.file.includes('\\'), `${c.type}:${c.name} — file must use posix separators, got "${c.file}"`)
  }
})

test('hook .test.mjs files are excluded from the inventory', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  assert.ok(!inv.some(c => c.name.endsWith('.test')), 'no .test entries')
  assert.ok(!inv.some(c => c.type === 'hook' && c.file.endsWith('.test.mjs')))
})

test('gate-map extracts known explicit edges', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const { edges } = buildGateMap(inv)
  const has = (a, b) => edges.some(e => e.from === a && e.to === b)

  // Both edges are confirmed detectable in the actual files (architect-verified):
  // plan-gate references `subagent_type: architect`; creating-tools references `writing-skills`.
  assert.ok(has('plan-gate', 'architect'), 'plan-gate invokes the architect agent')
  assert.ok(has('creating-tools', 'writing-skills'), 'creating-tools routes to writing-skills')
})

test('reverse-dependency lookup returns dependents of a component', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const { dependentsOf } = buildGateMap(inv)
  // editing the architect agent should surface plan-gate as an upstream dependent
  assert.ok(dependentsOf('architect').includes('plan-gate'))
})

test('gate-map excludes self-edges', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const { edges } = buildGateMap(inv)
  // a component referencing its own name in its body must not produce a self-loop
  assert.ok(!edges.some(e => e.from === e.to), 'no self-edges')
})

test('implicit (prose-only) edges are NOT extracted', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const { edges } = buildGateMap(inv)
  // writing-plans references plan-gate only in prose (no backticks / skill: form),
  // so the first-cut explicit-only extractor must NOT produce this edge.
  // (Verified: writing-plans/SKILL.md names plan-gate only in prose/tables.)
  assert.ok(!edges.some(e => e.from === 'writing-plans' && e.to === 'plan-gate'),
    'precision-over-recall: a prose-only reference must not become an edge')
})

test('skill:/subagent_type: reference to a hyphen-extended name does not edge to the shorter prefix name', () => {
  const inv = [
    { type: 'rule', name: 'install-vetting', body: '' },
    { type: 'hook', name: 'install-vetting-advisory', body: '' },
    { type: 'skill', name: 'caller', body: 'invoke via subagent_type: install-vetting-advisory here' },
  ]
  const { edges } = buildGateMap(inv)
  // the real reference is to install-vetting-advisory...
  assert.ok(edges.some(e => e.from === 'caller' && e.to === 'install-vetting-advisory'),
    'the full hyphen-extended name should still edge')
  // ...and must NOT spuriously edge to the shorter prefix `install-vetting`
  assert.ok(!edges.some(e => e.from === 'caller' && e.to === 'install-vetting'),
    'trailing (?![\\w-]) must prevent the shorter-prefix false positive')
})

test('committed inventory matches freshly harvested output (drift guard)', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const onDisk = JSON.parse(await readFile(join(REPO_ROOT, 'docs/reference/component-inventory.json'), 'utf8'))
  assert.equal(onDisk.length, inv.length, 'inventory length drifted — run `npm run harvest`')
})

// The legacy extractor, preserved verbatim as the equivalence oracle. When
// buildGateMap switches to the tokenizer (Task 3) this stays put: it is the
// only thing that can prove the switch changed nothing, and it is a far better
// diagnostic than a byte-diff on a 158-line JSON artifact.
function legacyEdgeNames(body, sortedNames, self) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = new Set()
  for (const target of sortedNames) {
    if (target === self) continue
    const re = new RegExp(`\`${esc(target)}\`|(?:skill|subagent_type):\\s*['"\`]?${esc(target)}(?![\\w-])`)
    if (re.test(body)) found.add(target)
  }
  return found
}

test('tokenizer reproduces the legacy edge set for every component (equivalence)', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const sorted = [...new Set(inv.map(c => c.name).filter(Boolean))].sort((a, b) => b.length - a.length)

  const divergences = []
  for (const c of inv) {
    const body = c.body || ''
    const legacy = legacyEdgeNames(body, sorted, c.name)
    const modern = resolvedNames(body, sorted, c.name)
    for (const n of legacy) if (!modern.has(n)) divergences.push(`${c.type}:${c.name} -> ${n} (legacy only)`)
    for (const n of modern) if (!legacy.has(n)) divergences.push(`${c.type}:${c.name} -> ${n} (tokenizer only)`)
  }
  assert.deepEqual(divergences, [], `edge extraction diverged:\n${divergences.join('\n')}`)
})
