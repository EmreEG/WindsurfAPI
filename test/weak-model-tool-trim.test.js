// fable's upstream backend hard-fails (UPSTREAM_INTERNAL → breaker → 529) above
// ~9 tools (captured 2026-07-08: Claude Code's 30 tools → "an internal error
// occurred" every turn). trimToolsForWeakModel caps the count for weak models
// only, keeping tool_choice-forced + top agent primitives.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeModelToolLimit,
  trimToolsForNativeLimit,
  trimToolsForWeakModel,
  weakModelToolLimit,
} from '../src/handlers/tool-emulation.js';

const mkTools = (names) => names.map((n) => ({ type: 'function', function: { name: n, description: n, parameters: { type: 'object', properties: {} } } }));

afterEach(() => {
  delete process.env.WINDSURFAPI_WEAK_MODEL_TOOL_LIMIT;
  delete process.env.DEVIN_CONNECT_NATIVE_TOOL_LIMIT;
});

describe('trimToolsForNativeLimit', () => {
  it('caps native tools at the upstream maximum of 128', () => {
    const tools = mkTools(Array.from({ length: 129 }, (_, i) => `tool${i}`));
    const result = trimToolsForNativeLimit(tools);
    assert.equal(nativeModelToolLimit(), 128);
    assert.equal(result.trimmed, true);
    assert.equal(result.kept, 128);
    assert.equal(result.dropped, 1);
  });

  it('keeps a forced tool and priority primitives when native tools overflow', () => {
    const names = Array.from({ length: 127 }, (_, i) => `junk${i}`);
    names.push('Read', 'forced_last');
    const result = trimToolsForNativeLimit(mkTools(names), {
      toolChoice: { type: 'function', function: { name: 'forced_last' } },
    });
    const kept = result.tools.map((tool) => tool.function.name);
    assert.ok(kept.includes('Read'));
    assert.ok(kept.includes('forced_last'));
    assert.equal(kept.length, 128);
  });

  it('never permits configuration above the hard upstream ceiling', () => {
    process.env.DEVIN_CONNECT_NATIVE_TOOL_LIMIT = '1000';
    assert.equal(nativeModelToolLimit(), 128);
  });
});

describe('trimToolsForWeakModel', () => {
  it('is a no-op for a non-weak model (opus keeps all 30)', () => {
    const tools = mkTools(Array.from({ length: 30 }, (_, i) => 'tool' + i));
    const r = trimToolsForWeakModel(tools, 'claude-opus-4-8-medium');
    assert.equal(r.trimmed, false);
    assert.equal(r.tools, tools); // same reference, untouched
    assert.equal(r.tools.length, 30);
  });

  it('is a no-op when a weak model is already within the limit', () => {
    const tools = mkTools(['Read', 'Edit', 'Bash']);
    const r = trimToolsForWeakModel(tools, 'claude-5-fable-medium');
    assert.equal(r.trimmed, false);
    assert.equal(r.tools.length, 3);
  });

  it('trims fable down to the default limit of 8', () => {
    const tools = mkTools(Array.from({ length: 30 }, (_, i) => 'tool' + i));
    const r = trimToolsForWeakModel(tools, 'claude-5-fable-medium');
    assert.equal(r.trimmed, true);
    assert.equal(r.tools.length, 8);
    assert.equal(r.kept, 8);
    assert.equal(r.dropped, 22);
  });

  it('keeps the high-priority agent primitives when trimming', () => {
    // 30 junk tools + the core ones scattered in — the core ones must survive.
    const names = Array.from({ length: 26 }, (_, i) => 'junk' + i);
    names.splice(5, 0, 'Read'); names.splice(12, 0, 'Bash'); names.splice(20, 0, 'Edit');
    const r = trimToolsForWeakModel(mkTools(names), 'claude-5-fable-medium');
    const kept = r.tools.map((t) => t.function.name);
    assert.ok(kept.includes('Read'), 'Read kept');
    assert.ok(kept.includes('Bash'), 'Bash kept');
    assert.ok(kept.includes('Edit'), 'Edit kept');
    assert.equal(r.tools.length, 8);
  });

  it('never drops a tool_choice-forced tool even if low priority', () => {
    const names = ['Read', 'Edit', 'Write', 'Bash', 'grep', 'glob', 'ls', 'search', 'obscure_forced_tool'];
    const tools = mkTools(names); // 9 tools, limit 8 → one must drop
    const r = trimToolsForWeakModel(tools, 'claude-5-fable-medium', {
      toolChoice: { type: 'function', function: { name: 'obscure_forced_tool' } },
    });
    const kept = r.tools.map((t) => t.function.name);
    assert.ok(kept.includes('obscure_forced_tool'), 'forced tool survives the trim');
    assert.equal(r.tools.length, 8);
  });

  it('preserves original request order among kept tools', () => {
    const names = ['Read', 'Edit', 'Write', 'Bash', 'grep', 'glob', 'ls', 'search', 'task', 'extra'];
    const r = trimToolsForWeakModel(mkTools(names), 'claude-5-fable-medium');
    const kept = r.tools.map((t) => t.function.name);
    // kept order must be a subsequence of the original order
    let idx = -1;
    for (const k of kept) { const at = names.indexOf(k); assert.ok(at > idx, 'order preserved: ' + k); idx = at; }
  });

  it('honors WINDSURFAPI_WEAK_MODEL_TOOL_LIMIT', () => {
    process.env.WINDSURFAPI_WEAK_MODEL_TOOL_LIMIT = '5';
    assert.equal(weakModelToolLimit(), 5);
    const r = trimToolsForWeakModel(mkTools(Array.from({ length: 12 }, (_, i) => 't' + i)), 'claude-5-fable-medium');
    assert.equal(r.tools.length, 5);
  });

  it('handles null / empty tools without throwing', () => {
    assert.equal(trimToolsForWeakModel(null, 'claude-5-fable-medium').tools, null);
    assert.deepEqual(trimToolsForWeakModel([], 'claude-5-fable-medium').tools, []);
  });
});
