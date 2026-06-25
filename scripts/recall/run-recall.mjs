// run-recall.mjs — manual recall scorer for the blind-canary harness.
//
// Usage (print detector commands only):
//   node scripts/recall/run-recall.mjs
//
// Usage (score detector output from a file):
//   node scripts/recall/run-recall.mjs <output-file>
//
// Usage (score detector output from stdin — piped, or explicit '-'):
//   cat detector-output.txt | node scripts/recall/run-recall.mjs
//   cat detector-output.txt | node scripts/recall/run-recall.mjs -
//
// This script cannot invoke detectors directly — it orchestrates manual dispatch + scoring.
// Run each printed command, collect the output, then pass it back here for scoring.
//
// IMPORTANT: This is a smoke / contamination signal, not a statistical recall score (n=3).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const recallRoot = fileURLToPath(new URL('.', import.meta.url));
const registry = JSON.parse(readFileSync(new URL('./registry.json', import.meta.url), 'utf8'));

/** Map from family to the detector command template */
const DETECTOR_COMMANDS = {
  'adherence':    (fixture) => `claude -p "run adherence-audit over ${fixture}"`,
  'code-review':  (fixture) => `claude -p "run code-review over ${fixture}"`,
  'web-research': (fixture) => `claude -p "run librarian web-research verify over ${fixture}"`,
};

function printDetectorCommands() {
  console.log('=== Recall Canary — Detector Invocation Commands ===');
  console.log('Run each command below and collect the combined output.');
  console.log('Then pipe the output back: cat output.txt | node scripts/recall/run-recall.mjs');
  console.log('');
  for (const entry of registry) {
    const fixtureAbs = join(recallRoot, entry.fixture);
    const cmd = DETECTOR_COMMANDS[entry.family]?.(fixtureAbs)
      ?? `# (no command template for family "${entry.family}")`;
    console.log(`[${entry.id}] family=${entry.family}`);
    console.log(`  ${cmd}`);
    console.log('');
  }
}

function scoreOutput(output) {
  console.log('=== Recall Score Report ===');
  console.log('NOTE: smoke / contamination signal, not a statistical recall score (n=3)');
  console.log('');

  let hits = 0;
  const results = [];
  for (const entry of registry) {
    const hit = output.toLowerCase().includes(entry.expectedFinding.toLowerCase());
    if (hit) hits++;
    results.push({ id: entry.id, family: entry.family, expectedFinding: entry.expectedFinding, hit });
  }

  for (const r of results) {
    const label = r.hit ? 'HIT ' : 'MISS';
    console.log(`  [${label}] ${r.id} (${r.family}) — expected substring: "${r.expectedFinding}"`);
  }

  console.log('');
  console.log(`Score: ${hits}/${registry.length} canaries detected`);
  if (hits === registry.length) {
    console.log('Result: all planted defects detected — detectors appear to be catching known issues');
  } else {
    console.log('Result: some planted defects missed — possible false-negative regression');
  }
}

async function readStdin() {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk;
  return buf;
}

// Entrypoint
const outputPath = process.argv[2];
if (outputPath === '-' || (!outputPath && !process.stdin.isTTY)) {
  // Explicit '-' OR piped stdin (not a TTY) → score from stdin
  scoreOutput(await readStdin());
} else if (!outputPath) {
  // No arg, interactive terminal → print commands only
  printDetectorCommands();
} else {
  // File path → score from file
  scoreOutput(readFileSync(outputPath, 'utf8'));
}
