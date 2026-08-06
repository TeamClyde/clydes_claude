// Reads the declared skill surface (docs/reference/skill-surface-policy.json) and compares it
// to what is actually on disk. Pure functions; the assertions live in skill-surface.test.mjs so
// they run under `npm test` -- hooks/pre-commit is not wired into .git/hooks (#115), so a check
// placed there would never execute.
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { parseFrontmatter } from './frontmatter.mjs'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const POLICY_PATH = join(REPO_ROOT, 'docs', 'reference', 'skill-surface-policy.json')
export const INSTALLED_PLUGINS_PATH = join(homedir(), '.claude', 'plugins', 'installed_plugins.json')
export const USER_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

export async function readPolicy(path = POLICY_PATH) {
  return JSON.parse(await readFile(path, 'utf8'))
}

/** Description length per local skill, keyed by directory name. */
export async function scanLocalSkillDescriptions(root = REPO_ROOT) {
  const dir = join(root, 'skills')
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e }

  const out = {}
  for (const d of entries) {
    if (!d.isDirectory()) continue
    const file = join(dir, d.name, 'SKILL.md')
    let fields
    try { ({ fields } = await parseFrontmatter(file)) }
    catch (e) { if (e.code === 'ENOENT') continue; throw e }
    // when_to_use shares the listing entry's 1536-char cap with description.
    const combined = `${fields.description ?? ''}${fields.when_to_use ?? ''}`
    out[d.name] = combined.length
  }
  return out
}

/**
 * Installed plugin -> sorted scopes, read from the machine-local plugin registry.
 * Returns null when the file is absent (fresh clone / CI), which callers treat as
 * "cannot evaluate" rather than "nothing installed" -- absence must never read as a pass.
 */
export async function readInstalledPlugins(path = INSTALLED_PLUGINS_PATH) {
  let raw
  try { raw = await readFile(path, 'utf8') }
  catch (e) { if (e.code === 'ENOENT') return null; throw e }

  const parsed = JSON.parse(raw)
  const out = {}
  for (const [name, installs] of Object.entries(parsed.plugins ?? {})) {
    const scopes = [...new Set(installs.map((i) => i.scope).filter(Boolean))].sort()
    if (scopes.length) out[name] = scopes
  }
  return out
}

/**
 * Plugin names flagged true in ~/.claude/settings.json `enabledPlugins`, or null if absent.
 * This is a SECOND source of plugin state alongside installed_plugins.json, and nothing
 * reconciles them -- uninstalling leaves the enable flag behind, so the two silently diverge.
 */
export async function readEnabledPlugins(path = USER_SETTINGS_PATH) {
  let raw
  try { raw = await readFile(path, 'utf8') }
  catch (e) { if (e.code === 'ENOENT') return null; throw e }
  const enabled = JSON.parse(raw).enabledPlugins ?? {}
  return Object.entries(enabled).filter(([, v]) => v === true).map(([k]) => k).sort()
}

/**
 * Names enabled but not installed, and installed but not enabled.
 *
 * Scoped to USER installs only. Project- and local-scope plugins are enabled through their own
 * project settings and never appear in user-level `enabledPlugins` -- comparing them produces a
 * guaranteed false positive (verified: frontend-design, marketing-skills, superpowers and
 * feature-dev are all project/local scope and all absent from the user map while installed).
 */
export function diffEnabledVsInstalled(enabled, installed) {
  const userScoped = Object.entries(installed)
    .filter(([, scopes]) => scopes.includes('user'))
    .map(([name]) => name)
  const userSet = new Set(userScoped)
  return {
    enabledNotInstalled: enabled.filter((n) => !userSet.has(n)),
    installedNotEnabled: userScoped.filter((n) => !enabled.includes(n)).sort(),
  }
}

const sameScopes = (a, b) => a.length === b.length && a.every((s, i) => s === b[i])

/**
 * Compare installed plugins to policy. Returns { unexpected, missing, scopeDrift, resurrected }.
 * `resurrected` is the sharpest signal: a plugin listed under policy.plugins.removed that is
 * installed again. That is the regression this whole mechanism exists to catch.
 */
export function diffPlugins(installed, policy) {
  const removed = policy.plugins.removed ?? {}
  // `$`-prefixed keys are documentation embedded in the JSON, not plugin names.
  const isMeta = (k) => k.startsWith('$')
  const expected = Object.fromEntries(
    Object.entries(policy.plugins.expected).filter(([k]) => !isMeta(k)),
  )

  const unexpected = []
  const resurrected = []
  const scopeDrift = []

  for (const [name, scopes] of Object.entries(installed)) {
    if (name in removed) { resurrected.push({ name, scopes, reason: removed[name] }); continue }
    if (!(name in expected)) { unexpected.push({ name, scopes }); continue }
    if (!sameScopes(scopes, [...expected[name]].sort())) {
      scopeDrift.push({ name, actual: scopes, expected: [...expected[name]].sort() })
    }
  }

  const missing = Object.keys(expected)
    .filter((n) => !(n in installed))
    .map((name) => ({ name, expected: expected[name] }))

  return { unexpected, missing, scopeDrift, resurrected }
}
