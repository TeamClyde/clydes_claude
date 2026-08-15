import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAgent, aggregate, findOrphans, normalise, watchdogMargin, sumAgentUsage } from './measure-workflow-run.mjs';

test('classifies by exact prompt prefix, not by loose keyword', () => {
  // The retrospective's classifier keyed on the word "traceability" and swept 16 section-writer
  // retries into the audit bucket. Prefix matching is what makes the phase table trustworthy.
  assert.equal(classifyAgent('You are auditing a research section for traceability. For EVERY'), 'audit');
  assert.equal(classifyAgent('Write the DETAILED report section for sub-question "X"'), 'section-writer');
  assert.equal(classifyAgent('You are a research analyst. Investigate this'), 'research');
  assert.equal(classifyAgent('Re-check this cluster of related findings'), 'verify:recheck');
  assert.equal(classifyAgent('Triage these findings. For EACH'), 'verify:triage');
  assert.equal(classifyAgent('You are a literalist. Does the cited source'), 'verify:consensus');
  assert.equal(classifyAgent('something unrecognised'), 'other');
});

test('a section-writer retry is a section-writer, not an audit', () => {
  const retry = 'Write the DETAILED report section for sub-question "X"\nPREVIOUS ATTEMPT REJECTED: '
    + 'these claims are not traceable to this section’s findings. Fix it.';
  assert.equal(classifyAgent(retry), 'section-writer');
});

test('aggregate sums usage per phase', () => {
  const agents = [
    { phase: 'research', usage: { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 }, turns: 2, tools: 1 },
    { phase: 'research', usage: { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 }, turns: 3, tools: 2 },
    { phase: 'audit',    usage: { input: 0, output: 5, cacheWrite: 0, cacheRead: 0 }, turns: 1, tools: 0 },
  ];
  const r = aggregate(agents);
  assert.equal(r.research.n, 2);
  assert.equal(r.research.cacheRead, 8);
  assert.equal(r.research.turns, 5);
  assert.equal(r.audit.output, 5);
});

test('orphans are started agents with no result line — paid for and discarded', () => {
  const journal = [
    { type: 'started', agentId: 'a1' },
    { type: 'started', agentId: 'a2' },
    { type: 'result',  agentId: 'a1' },
  ];
  assert.deepEqual(findOrphans(journal), ['a2']);
});

test('per-sub-question normalisation is what the pass bars are measured against', () => {
  const totals = { billed: 884_000 * 4, cacheRead: 3_960_000 * 4 };
  const n = normalise(totals, 4);
  assert.equal(n.billedPerSubQuestion, 884_000);
  assert.equal(n.cacheReadPerSubQuestion, 3_960_000);
});

test('watchdog margin flags above 70% of the configured timeout', () => {
  assert.equal(watchdogMargin(600_000, 900_000).flagged, false);  // 66.7% — under the bar
  assert.equal(watchdogMargin(630_000, 900_000).flagged, true);   // 70.0% — at the bar, flagged
  assert.equal(watchdogMargin(700_000, 900_000).flagged, true);   // 77.8% — over the bar
});

test('an unconfigured phase reports n/a rather than a fabricated percentage', () => {
  const r = watchdogMargin(500_000, undefined);
  assert.equal(r.margin, null);
  assert.equal(r.flagged, false);
});

test('usage is counted ONCE per message id, not once per content block', () => {
  // The transcript emits one line per content block, each repeating the whole message's usage.
  // Summing per line counts one API call N times: on the measured baseline run that inflated cache
  // reads 2.7x. The tell is that it produces impossible values — a call with a 1,000-token context
  // credited with 2,000 cache reads. This assertion is the measurement's correctness crux.
  const lines = [
    { type: 'assistant', message: { id: 'm1', content: [{ type: 'thinking' }],
      usage: { input_tokens: 2, output_tokens: 7, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 } } },
    { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use' }],
      usage: { input_tokens: 2, output_tokens: 216, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 } } },
  ];
  const r = sumAgentUsage(lines);
  assert.equal(r.usage.cacheRead, 1000, 'one API call, one cache-read figure');
  assert.equal(r.usage.cacheWrite, 100);
  assert.equal(r.usage.input, 2);
  assert.equal(r.turns, 1, 'turns counts messages, not lines');
  assert.equal(r.tools, 1, 'tool_use blocks appear once each and are NOT deduped');
});

test('output_tokens takes the LAST line — it is a streaming snapshot, not a per-block value', () => {
  // The one field that varies across a message's repeated copies. First-wins would report 7 tokens
  // for a 216-token response, silently under-reporting the only figure that measures useful work.
  const lines = [
    { type: 'assistant', message: { id: 'm1', content: [{ type: 'thinking' }], usage: { output_tokens: 7 } } },
    { type: 'assistant', message: { id: 'm1', content: [{ type: 'text' }], usage: { output_tokens: 216 } } },
  ];
  assert.equal(sumAgentUsage(lines).usage.output, 216);
});
