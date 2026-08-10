import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import { harvest, buildGateMap, committedCandidateCounts } from './harvest-components.mjs'
import {
  resolvedNames, tokenize, pathEdgeName, colonEdgeName, suffixedEdgeName,
} from './lib/component-refs.mjs'

// Repo root resolved the portable way (matches existing .claude/hooks/*.mjs).
// Do NOT use `new URL('../', import.meta.url).pathname` — yields /C:/… on Windows.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The known delta between the legacy explicit-only extractor (`legacyEdgeNames`
// below) and the three new resolution rules added in Task 1 — `pathEdgeName`
// (path-form citations), `colonEdgeName` (`<n>:<mode>` dispatch), and
// `suffixedEdgeName` (`<n>.md` / `<n>#anchor` trailing-token citations). The
// rules exist and are unit-tested (scripts/lib/component-refs.test.mjs), but
// as of this task `resolvedNames()` does not call them yet — buildGateMap()
// still runs the legacy path in production. This constant enumerates every
// edge the new rules will add once wired, proven in advance against the live
// corpus.
//
// Rows 1-44 are the plan's original enumeration; rows 45-55 were added after
// Task 1's execution proved the original table incomplete — see the parent
// journal's `[divergence] [decision]` entry (2026-08-10).
//
// RETENTION: this constant SURVIVES past this task. Task 3 Step 3b's
// re-grounded equivalence oracle consumes it as its standing contract, so it
// must remain a module-level constant — do not move it inside a test
// function, and do not delete it when the pre-wiring harness test below is
// removed in Task 6 (that test is a one-time migration proof; this constant
// is not).
// Row numbers below are anchored to the Blueprint table in
// plans/component-reference-integrity/graph-integrity/graph-integrity-plan.md
// § "Expected diff — all 55 new edges" (`| # | from | → to | shape | ... |`).
// Entries appear in strict table order, 2 per line, so each `// rows N-M`
// marker below lines up with that table's `#` column — cross-check a pair
// by row number there, not by hand-walking both lists.
const EXPECTED_NEW_EDGES = new Set([
  // rows 1-10
  'doc-author|plan-management', 'executing-plans|plan-management',
  'writing-plans|plan-management', 'architect|delivery-cadence',
  'architect|stack-hats', 'architecture-decision-records|doc-tools',
  'brainstorming|doc-tools', 'doc-author|doc-tools',
  'doc-tools|doc-backfill', 'doc-tools|docs-refresh',
  // rows 11-20
  'doc-tools|docs-status', 'docs-status|doc-tools',
  'executing-plans|stack-hats', 'finishing-a-development-branch|delivery-cadence',
  'git-manager|delivery-cadence', 'infra-init|filesystem/path-portability',
  'new-repo-setup|stack-hat-directive', 'plan-docs|planning',
  'plan-docs|workflow-phases', 'plan-gate|delivery-cadence',
  // rows 21-30
  'plan-management|doc-tools', 'plan-management|plan-docs',
  'project-setup|delivery-cadence', 'project-setup|install-vetting',
  'stack-hats|stack-hat-directive', 'subagent-driven-development|agent-model-pinning',
  'subagent-driven-development|stack-hats', 'subagent-driven-development|subagent-prefix-prepend',
  'systematic-debugging|filesystem/efficiency', 'vet-capability-fit|install-vetting',
  // rows 31-40
  'vet-install|install-vetting', 'vet-reputation|install-vetting',
  'vet-security|install-vetting', 'writing-agents|architect',
  'writing-agents|researcher', 'writing-plans|architect',
  'writing-plans|delivery-cadence', 'writing-plans|doc-tools',
  'writing-plans|plan-gate', 'writing-rules|cspell',
  // rows 41-44 — end of the plan's original 44-row enumeration
  'writing-rules|mcp-governance', 'writing-rules|new-repo-setup',
  'writing-rules|secrets-handling', 'plan-docs|integration-test-constraints',
  // rows 45-50 — start of the 2026-08-10 correction (see comment above)
  'different-viewpoints-lite|different-viewpoint', 'doc-author|doc-backfill',
  'doc-backfill|infra-init', 'docs-refresh|docs-status',
  'docs-status|docs-refresh', 'e2e-init|infra-init',
  // rows 51-55
  'filesystem/path-portability|infra-init', 'finishing-a-development-branch|docs-status',
  'install-vetting|ai-tool-security-reviewer', 'integration-engineer|infra-init',
  'vet-install|project-setup',
])

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

// ONE-TIME MIGRATION PROOF — deleted in Task 6, once Task 3 has wired the new
// rules into resolvedNames() and the equivalence test above (which calls
// resolvedNames() directly) is re-grounded against EXPECTED_NEW_EDGES instead.
// EXPECTED_NEW_EDGES itself is NOT deleted alongside this test — see its
// comment above.
//
// This harness deliberately does NOT call resolvedNames(). It calls
// pathEdgeName / colonEdgeName / suffixedEdgeName directly against each
// component's backtick tokens, and unions the hits with legacyEdgeNames().
// That is the entire point: resolvedNames() does not wire the three new
// rules yet (Task 3's job), so a version of this test that routed through
// resolvedNames() would assert nothing about the new rules today — it would
// silently start testing something real only once Task 3 lands, which is
// backwards from the goal. Testing the rule functions directly makes the
// assertion true NOW, while the legacy path is still what buildGateMap()
// actually runs in production, which is what proves the 55-edge delta is
// known in advance rather than discovered as a surprise diff after Task 3's
// wiring lands.
//
// Do NOT "fix" this by swapping in resolvedNames() — that is the most likely
// well-intentioned edit a future maintainer would make, and it would destroy
// exactly what this test exists to prove.
test('expected-diff audit: path/colon/suffixed rules produce exactly the known 55-edge delta over the legacy set (pre-wiring)', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const sorted = [...new Set(inv.map(c => c.name).filter(Boolean))].sort((a, b) => b.length - a.length)
  // Built once outside the component loop — not per token — per the task's
  // performance note; pathEdgeName/colonEdgeName take a Set, suffixedEdgeName
  // takes the longest-first array (needed for its prefix-ambiguity walk).
  const nameSet = new Set(sorted)

  // Corpus-wide `from|to` pairs, not per-component sets: EXPECTED_NEW_EDGES is
  // a flat set of strings, so the accumulator has to match its shape.
  const newPairs = new Set()
  for (const c of inv) {
    const body = c.body || ''
    const legacy = legacyEdgeNames(body, sorted, c.name)
    const backticks = tokenize(body).filter(t => t.kind === 'backtick')
    for (const t of backticks) {
      // Precedence order path -> colon -> suffixed, first non-null — the same
      // order the plan's Blueprint table used to assign each pair a single
      // shape, and the same order Task 3 will use inside resolvedNames().
      // (backtickEdgeName is not called: an exact `` `target` `` span is
      // already covered by legacyEdgeNames' own backtick alternative, so
      // calling it here would only ever re-derive names already in `legacy`.)
      // `||` (not `??`) is safe here only because none of the three rules
      // can ever return `''` — each return is either `null` or a value that
      // passed a Set-membership test against real node names, and no node
      // is named the empty string. If that ever stopped holding, `hit === ''`
      // would fall through the `||` chain the same as `null` and be
      // indistinguishable from "no match" below.
      const hit = pathEdgeName(t.value, nameSet)
        || colonEdgeName(t.value, nameSet)
        || suffixedEdgeName(t.value, sorted)
      if (!hit || hit === c.name) continue
      if (!legacy.has(hit)) newPairs.add(`${c.name}|${hit}`)
    }
  }

  // Report both directions by name, so a divergence explains itself instead
  // of surfacing as an opaque byte-diff: `unexpected` means the live rules
  // found something the Blueprint table didn't predict (rules regressed, or
  // the corpus changed under us); `missing` means a predicted pair no longer
  // resolves (same two causes, other direction). Per the task: if either is
  // non-empty, that is a finding to report, not something to paper over by
  // editing EXPECTED_NEW_EDGES to match.
  const unexpected = [...newPairs].filter(p => !EXPECTED_NEW_EDGES.has(p)).sort()
  const missing = [...EXPECTED_NEW_EDGES].filter(p => !newPairs.has(p)).sort()
  assert.deepEqual(
    { unexpected, missing },
    { unexpected: [], missing: [] },
    `expected-diff audit failed:\n  unexpected (found, not predicted): ${unexpected.join(', ') || '(none)'}\n  missing (predicted, not found): ${missing.join(', ') || '(none)'}`,
  )
})

test('every committed skill directory yields a component', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const found = new Set(inv.filter(c => c.type === 'skill').map(c => c.file.split('/')[1]))

  // Committed state, not readdir: skills/git-manager-workspace/ is gitignored and
  // does not exist in a CI checkout, so a working-tree scan would go red here and
  // green in CI -- the inverse of what an enforced invariant is for.
  const committed = new Set(
    execFileSync('git', ['ls-files', '-z', 'skills/'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\0').filter(Boolean)
      .map(p => p.split('/')[1])
      .filter(Boolean),
  )

  const dropped = [...committed].filter(d => !found.has(d)).sort()
  assert.deepEqual(dropped, [], `committed skill director(ies) produced no component: ${dropped.join(', ')} — a missing SKILL.md drops a skill from the inventory silently, and every citation to it then reads as a dead reference`)
})

test('per-root candidate counts match harvested node counts', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const counts = await committedCandidateCounts(REPO_ROOT)
  for (const type of ['skill', 'agent', 'rule', 'hook']) {
    const nodes = inv.filter(c => c.type === type).length
    assert.equal(nodes, counts[type],
      `${type}: ${nodes} node(s) from ${counts[type]} committed candidate(s) — a mismatch means the scanner dropped a file`)
  }
})
