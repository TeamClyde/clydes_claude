// scripts/lib/frontmatter.mjs
// Minimal, dependency-free. Handles single-line `key: value`,
// `key: "quoted value"`, and YAML block scalars (`key: >` / `key: |`)
// — the forms used in this repo's skill/agent frontmatter.
import { readFile } from 'node:fs/promises'

export async function parseFrontmatter(filePath) {
  // Normalize CRLF so parsing is line-ending agnostic on Windows.
  const raw = (await readFile(filePath, 'utf8')).replace(/\r\n/g, '\n')
  const m = raw.match(/^---\n([\s\S]*?)\n---/)
  const fields = {}
  if (m) {
    const lines = m[1].split('\n')
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx]
      // Skip indented lines — they are block-scalar continuation content, not
      // their own top-level key (prevents a stray colon from forging a field).
      if (/^\s/.test(line)) continue
      const i = line.indexOf(':')
      if (i === -1) continue
      const key = line.slice(0, i).trim()
      let val = line.slice(i + 1).trim()
      if (val === '>' || val === '|') {
        // YAML block scalar: consume the following blank/indented lines and
        // fold them into a single-line value (the inventory wants one line).
        const collected = []
        while (idx + 1 < lines.length && (lines[idx + 1].trim() === '' || /^\s/.test(lines[idx + 1]))) {
          collected.push(lines[++idx].trim())
        }
        val = collected.join(' ').replace(/\s+/g, ' ').trim()
      } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      fields[key] = val
    }
  }
  return { fields, body: raw.replace(/^---\n[\s\S]*?\n---\n?/, '') }
}

export function firstHeading(body) {
  return (body.match(/^#\s+(.+)$/m) || [, ''])[1].trim()
}

export function firstParagraph(body) {
  const stripped = body.replace(/^#.*$/gm, '').trim()
  return (stripped.split(/\n\s*\n/)[0] || '').replace(/\s+/g, ' ').trim().slice(0, 240)
}
