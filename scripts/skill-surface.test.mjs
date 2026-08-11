// Enforces docs/reference/skill-surface-policy.json.
//
// This runs under `npm test` on purpose. hooks/pre-commit is not wired into .git/hooks (#115),
// so a check placed there would never execute -- which is the mechanism by which every previous
// cleanup silently regressed. `npm test` is the only path in this repo with proven execution.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  readPolicy,
  scanLocalSkillDescriptions,
  readInstalledPlugins,
  readEnabledPlugins,
  diffPlugins,
  diffEnabledVsInstalled,
} from './lib/skill-surface.mjs'

const policy = await readPolicy()

// The plugin registry is machine-local (~/.claude), so it is absent on a fresh clone or in CI.
// Absence means "cannot evaluate" -- reported as a skip, never silently treated as a pass.
const installed = await readInstalledPlugins()
const enabled = await readEnabledPlugins()
const noRegistry = installed === null && 'no local plugin registry (fresh clone or CI)'
const noSettings = (installed === null || enabled === null) && 'no local plugin registry or user settings'

describe('local skill description budget', () => {
  test('no single skill exceeds the platform listing cap', async () => {
    const sizes = await scanLocalSkillDescriptions()
    const cap = policy.localSkills.perSkillMaxChars
    const over = Object.entries(sizes)
      .filter(([, n]) => n > cap)
      .map(([name, n]) => `${name} (${n} > ${cap})`)
    assert.deepEqual(
      over,
      [],
      `description + when_to_use is truncated at ${cap} chars in the skill listing, so anything ` +
        `longer is silently cut mid-sentence and loses its trailing trigger keywords:\n  ` +
        over.join('\n  '),
    )
  })

  test('total description budget is within ceiling', async () => {
    const sizes = await scanLocalSkillDescriptions()
    const total = Object.values(sizes).reduce((a, b) => a + b, 0)
    const ceiling = policy.localSkills.totalDescriptionChars
    const worst = Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 5)
    assert.ok(
      total <= ceiling,
      `local skill descriptions total ${total} chars, ceiling is ${ceiling}.\n` +
        `The listing budget is 1% of the context window and drops the LEAST-invoked skills first, ` +
        `so overflow makes rarely-used skills progressively harder to reach.\n` +
        `Largest: ${worst.map(([n, c]) => `${n}=${c}`).join(', ')}\n` +
        `Either trim descriptions or raise the ceiling in docs/reference/skill-surface-policy.json ` +
        `as a deliberate, reviewable change.`,
    )
  })
})

describe('installed plugin surface', () => {
  test('a deleted plugin has not been reinstalled', { skip: noRegistry }, () => {
    const { resurrected } = diffPlugins(installed, policy)
    assert.deepEqual(
      resurrected.map((r) => r.name),
      [],
      `Plugin(s) deleted by policy are installed again:\n` +
        resurrected.map((r) => `  ${r.name} [${r.scopes.join(', ')}]\n    why it was removed: ${r.reason}`).join('\n') +
        `\nIf this is intentional, move the entry from "removed" to "expected" in ` +
        `docs/reference/skill-surface-policy.json in the same commit.`,
    )
  })

  test('no undeclared plugin is installed', { skip: noRegistry }, () => {
    const { unexpected } = diffPlugins(installed, policy)
    assert.deepEqual(
      unexpected.map((u) => `${u.name} [${u.scopes.join(', ')}]`),
      [],
      'Installed but not declared. Every plugin costs skill-listing budget in every session, ' +
        'so adding one is a deliberate act: declare it in docs/reference/skill-surface-policy.json.',
    )
  })

  test('every declared plugin is still installed', { skip: noRegistry }, () => {
    const { missing } = diffPlugins(installed, policy)
    assert.deepEqual(
      missing.map((m) => `${m.name} (expected scope: ${m.expected})`),
      [],
      'Declared but not installed. Drift in this direction is still drift: either reinstall, ' +
        'or remove the entry from docs/reference/skill-surface-policy.json so the declaration ' +
        'matches reality.',
    )
  })

  // Plugin state lives in TWO files -- installed_plugins.json and settings.json enabledPlugins --
  // and nothing reconciles them. Uninstalling leaves the enable flag behind, so the pair drifts
  // silently. Observed 2026-08-06: marketing-skills was uninstalled and stayed flagged enabled.
  test('enabled and installed plugin sets agree', { skip: noSettings }, () => {
    const { enabledNotInstalled, installedNotEnabled } = diffEnabledVsInstalled(enabled, installed)
    assert.deepEqual(
      { enabledNotInstalled, installedNotEnabled },
      { enabledNotInstalled: [], installedNotEnabled: [] },
      'Plugin state disagrees between ~/.claude/plugins/installed_plugins.json and ' +
        '~/.claude/settings.json enabledPlugins. A stale enable flag for an uninstalled plugin ' +
        'is the residue an uninstall leaves behind; an installed-but-not-enabled plugin still ' +
        'occupies disk and reinstalls cleanly on the next enable.',
    )
  })

  test('declared plugins are installed at their declared scope', { skip: noRegistry }, () => {
    const { scopeDrift } = diffPlugins(installed, policy)
    assert.deepEqual(
      scopeDrift.map((d) => `${d.name}: expected [${d.expected}] actual [${d.actual}]`),
      [],
      'Scope drift. A plugin declared project-scoped but installed at user scope loads its ' +
        'entire skill listing into every session in every repo -- exactly how marketing-skills ' +
        'came to cost 58071 chars here.',
    )
  })
})

test('every references exemption carries a non-empty reason', async () => {
  const policy = await readPolicy()
  const refs = policy.references
  assert.ok(refs, 'policy.references must exist')

  const isMeta = k => k.startsWith('$')
  for (const group of ['historicalLedgers', 'localOnlySkills', 'platformAgentTypes', 'knownNamespaces']) {
    const entries = Object.entries(refs[group] ?? {}).filter(([k]) => !isMeta(k))
    assert.ok(entries.length > 0, `${group} must not be empty`)
    for (const [key, reason] of entries) {
      assert.equal(typeof reason, 'string', `${group}.${key} reason must be a string`)
      assert.ok(reason.trim().length > 0, `${group}.${key} requires a reason — an exemption without one is a hiding place`)
    }
  }
})

test('every entryPoints exemption carries a non-empty reason', async () => {
  const policy = await readPolicy()
  const entryPoints = policy.entryPoints
  assert.ok(entryPoints, 'policy.entryPoints must exist')

  const isMeta = k => k.startsWith('$')
  const groups = Object.keys(entryPoints).filter(k => !isMeta(k))
  assert.deepEqual(
    groups.sort(),
    ['harnessInvoked', 'userInvoked'],
    'entryPoints top-level groups changed. A new or deleted group is not a bug, but it is not ' +
      'covered automatically either: update the expected group list in ' +
      'scripts/skill-surface.test.mjs as a deliberate act so its entries get checked for a ' +
      'non-empty reason too.',
  )

  for (const group of groups) {
    const entries = Object.entries(entryPoints[group] ?? {}).filter(([k]) => !isMeta(k))
    assert.ok(entries.length > 0, `${group} must not be empty`)
    for (const [key, reason] of entries) {
      assert.equal(typeof reason, 'string', `${group}.${key} reason must be a string`)
      assert.ok(reason.trim().length > 0, `${group}.${key} requires a reason — an exemption without one is a hiding place`)
    }
  }
})
