#!/usr/bin/env node
// Portable test discovery for Node 20 and Node 22+.
//
// `node --test <dir>` is NOT portable: Node 20 scans the directory, Node 22+
// loads it as a module (MODULE_NOT_FOUND). Glob positional args are the
// mirror image — they work on 22+ and fail on 20. `--test-glob-pattern` is
// rejected by both. Explicit file paths are the only form both versions treat
// identically, so we do the discovery ourselves. See issue #160.
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolve roots against this file's own location, never process.cwd(), so the
// runner and its test agree no matter where either is invoked from.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ROOTS = ['scripts', 'skills', '.claude/hooks'];

export function discover(roots = ROOTS) {
  return roots
    .flatMap((root) => {
      const abs = path.join(REPO_ROOT, root);
      if (!existsSync(abs)) return [];
      return readdirSync(abs, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.test.mjs'))
        // parentPath landed in Node 20.12; `path` is deprecated but still
        // present in 20.18. Both branches are exercised across our two
        // supported majors.
        .map((e) =>
          path
            .relative(REPO_ROOT, path.join(e.parentPath ?? e.path, e.name))
            // Emit posix separators: node --test accepts them on Windows, and
            // it keeps backslash escaping out of the test assertions.
            .split(path.sep)
            .join('/'),
        );
    })
    .sort();
}

function main() {
  // Explicit file arguments win over discovery, so `npm test <file>` still
  // isolates a single file. skills/systematic-debugging/find-polluter.sh relies
  // on exactly that to bisect test pollution; without this passthrough it would
  // silently run the whole suite instead of the one file it asked for.
  const explicit = process.argv.slice(2);
  const files = explicit.length > 0 ? explicit : discover();
  if (files.length === 0) {
    console.error(`run-tests: no *.test.mjs files found under ${ROOTS.join(', ')}`);
    process.exit(1);
  }
  console.error(
    explicit.length > 0
      ? `run-tests: ${files.length} file(s) from arguments`
      : `run-tests: ${files.length} test files`,
  );
  const result = spawnSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
    cwd: REPO_ROOT,
  });
  process.exit(result.status ?? 1);
}

// `process.argv[1]` is undefined under `node -e` / `--input-type=module`, and
// pathToFileURL(undefined) THROWS — which would make importing this module
// crash instead of no-op. The undefined check is required, not defensive
// padding; it was added after a real failure.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) main();
