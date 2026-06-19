import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseFrontmatter, firstHeading, firstParagraph } from './lib/frontmatter.mjs'

async function listDir(dir) {
  try { return await readdir(dir, { withFileTypes: true }) }
  catch (e) { if (e.code === 'ENOENT') return []; throw e }
}

async function scanSkills(root) {
  const out = []
  for (const d of await listDir(join(root, 'skills'))) {
    if (!d.isDirectory()) continue
    for (const f of await listDir(join(root, 'skills', d.name))) {
      if (/^skill\.md$/i.test(f.name)) {
        const file = join(root, 'skills', d.name, f.name)
        const { fields, body } = await parseFrontmatter(file)
        out.push({ type: 'skill', name: fields.name || d.name, description: fields.description || firstParagraph(body), file, body })
      }
    }
  }
  return out
}

async function scanAgents(root) {
  const out = []
  for (const f of await listDir(join(root, 'agents'))) {
    if (!f.isFile() || !f.name.endsWith('.md')) continue
    const file = join(root, 'agents', f.name)
    const { fields, body } = await parseFrontmatter(file)
    out.push({ type: 'agent', name: fields.name || f.name.replace(/\.md$/, ''), description: fields.description, model: fields.model, file, body })
  }
  return out
}

async function scanRules(root, dir = join(root, 'rules'), prefix = '') {
  const out = []
  for (const e of await listDir(dir)) {
    if (e.isDirectory()) { out.push(...await scanRules(root, join(dir, e.name), `${prefix}${e.name}/`)); continue }
    if (!e.name.endsWith('.md')) continue
    const file = join(dir, e.name)
    const { body } = await parseFrontmatter(file)
    out.push({ type: 'rule', name: `${prefix}${e.name.replace(/\.md$/, '')}`, description: firstParagraph(body), title: firstHeading(body), file, body })
  }
  return out
}

async function scanHooks(root) {
  const out = []
  const base = join(root, '.claude', 'hooks')
  for (const e of await listDir(base)) {
    // Top-level hooks (e.g. session-start.mjs) sit directly under .claude/hooks/,
    // wired by settings.json. Classify as sessionStart (the only top-level case today).
    if (e.isFile() && e.name.endsWith('.mjs') && !e.name.endsWith('.test.mjs')) {
      out.push({ type: 'hook', name: e.name.replace(/\.mjs$/, ''), event: 'sessionStart', file: join(base, e.name), body: '' })
      continue
    }
    if (!e.isDirectory()) continue
    for (const f of await listDir(join(base, e.name))) {
      if (!f.name.endsWith('.mjs') || f.name.endsWith('.test.mjs')) continue
      out.push({ type: 'hook', name: f.name.replace(/\.mjs$/, ''), event: e.name, file: join(base, e.name, f.name), body: '' })
    }
  }
  return out
}

export async function harvest({ repoRoot }) {
  const [skills, agents, rules, hooks] = await Promise.all([
    scanSkills(repoRoot), scanAgents(repoRoot), scanRules(repoRoot), scanHooks(repoRoot),
  ])
  const all = [...skills, ...agents, ...rules, ...hooks]
  if (all.length === 0) {
    throw new Error(`harvest: 0 components found under ${repoRoot} — check repoRoot (Windows path mis-resolution yields an empty scan).`)
  }
  return all
}

export function buildGateMap(inventory) {
  const names = inventory.map(c => c.name).filter(Boolean)
  // longest-first so multi-word names match before any shorter prefix
  const sorted = [...new Set(names)].sort((a, b) => b.length - a.length)
  const edges = []
  for (const c of inventory) {
    const body = c.body || ''
    for (const target of sorted) {
      if (target === c.name) continue
      const ref = new RegExp(`\`${escapeRe(target)}\`|(?:skill|subagent_type):\\s*['"\`]?${escapeRe(target)}(?![\\w-])`)
      if (ref.test(body)) edges.push({ from: c.name, to: target })
    }
  }
  const dependentsOf = name => edges.filter(e => e.to === name).map(e => e.from)
  const dependenciesOf = name => edges.filter(e => e.from === name).map(e => e.to)
  return { nodes: inventory.map(({ body, ...rest }) => rest), edges, dependentsOf, dependenciesOf }
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
