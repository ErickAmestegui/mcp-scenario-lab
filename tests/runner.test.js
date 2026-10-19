import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScenario, evaluate, pointer, validateScenario, endpointUrl, markdownReport } from '../src/runner.js';
import { startFixture } from '../examples/fixture-server.js';

const scenario = JSON.parse(await readFile(new URL('../examples/inventory.json', import.meta.url), 'utf8'));
async function againstFixture(run) { const server = await startFixture(); try { await run(server); } finally { await server.close(); } }
const one = step => ({ version: 1, name: 'test', steps: [{ id: 'one', ...step }] });

test('JSON Pointer escaped keys, arrays, root, missing and inherited keys', () => {
  assert.deepEqual(pointer({ 'a/b': { '~': [7] } }, '/a~1b/~0/0'), { found: true, value: 7 });
  assert.deepEqual(pointer({ x: null }, '/x/no'), { found: false });
  assert.equal(pointer({}, '/toString').found, false);
  assert.equal(pointer([1], '').value[0], 1);
  assert.throws(() => pointer({}, '/bad~2'));
});
test('assertions distinguish absence, deep equality and array membership', () => {
  assert.equal(evaluate({ x: null }, { path: '/x', op: 'exists', value: true }), true);
  assert.equal(evaluate({}, { path: '/x', op: 'equals', value: null }), false);
  assert.equal(evaluate({ a: [{ x: 1 }] }, { path: '/a', op: 'includes', value: { x: 1 } }), true);
});
test('input validation rejects ambiguous steps and unsafe endpoints', () => {
  assert.throws(() => validateScenario({ version: 1, name: 'x', steps: [{ id: 'x', tool: 'x' }, { id: 'x', tool: 'x' }] }));
  assert.throws(() => validateScenario(one({ tool: 'x', assertions: [{ path: 'bad', op: 'equals', value: 1 }] })));
  assert.throws(() => endpointUrl('https://example.com/mcp'));
  assert.throws(() => endpointUrl('http://user:password@localhost/mcp', true));
  assert.throws(() => endpointUrl('http://localhost/mcp?token=secret'));
  assert.equal(endpointUrl('https://example.com/mcp', true).hostname, 'example.com');
});
test('real Streamable HTTP initialization, discovery, mutation, expected error, recovery and DELETE', async () => {
  await againstFixture(async server => {
    const report = await runScenario(scenario, { endpoint: server.url });
    assert.equal(report.passed, true, JSON.stringify(report));
    assert.equal(report.initialization.protocolVersion, '2025-11-25');
    assert.equal(report.steps.length, 6);
    assert.equal(report.cleanup, 'session-terminated');
    assert.equal(server.metrics.terminated, 1);
    assert.equal(server.metrics.calls, 6);
    assert.match(markdownReport(report), /\*\*PASS\*\*/);
    assert.equal(JSON.stringify(report).includes('"amount"'), false);
  });
});
test('failed state expectation halts before another mutating call and still terminates', async () => {
  await againstFixture(async server => {
    const changed = structuredClone(scenario);
    changed.steps[0].assertions[0].value = 99;
    const report = await runScenario(changed, { endpoint: server.url });
    assert.equal(report.passed, false);
    assert.equal(report.steps.length, 1);
    assert.equal(server.metrics.calls, 1);
    assert.equal(report.cleanup, 'session-terminated');
  });
});
test('real SSE initialization, discovery and stateful calls do not await stream completion', async () => {
  const server = await startFixture(0, { enableJsonResponse: false });
  try {
    const report = await runScenario(scenario, { endpoint: server.url, timeoutMs: 2000 });
    assert.equal(report.passed, true, JSON.stringify(report));
    assert.equal(report.initialization.protocolVersion, '2025-11-25');
    assert.equal(report.steps.length, 6);
    assert.equal(report.cleanup, 'session-terminated');
    assert.equal(server.metrics.calls, 6);
    assert.equal(server.metrics.terminated, 1);
  } finally { await server.close(); }
});
test('unexpected tool error fails; expected SDK validation tool error passes', async () => {
  await againstFixture(async server => {
    assert.equal((await runScenario(one({ tool: 'inventory_take', arguments: { amount: 99 } }), { endpoint: server.url })).passed, false);
    const report = await runScenario(one({ tool: 'inventory_take', arguments: { amount: -1 }, expectError: 'tool' }), { endpoint: server.url });
    assert.equal(report.passed, true);
  });
});
test('missing required tools fail before calls; unknown scenario tools fail explicitly', async () => {
  await againstFixture(async server => {
    const missing = { ...one({ tool: 'inventory_read' }), requiredTools: ['unavailable'] };
    assert.equal((await runScenario(missing, { endpoint: server.url })).passed, false);
    assert.equal(server.metrics.calls, 0);
    const report = await runScenario(one({ tool: 'unavailable' }), { endpoint: server.url });
    assert.equal(report.steps[0].outcome, 'undiscovered-tool');
    assert.equal(report.cleanup, 'session-terminated');
  });
});
test('session state isolated between scenario runs', async () => {
  await againstFixture(async server => {
    assert.equal((await runScenario(scenario, { endpoint: server.url })).passed, true);
    assert.equal((await runScenario(scenario, { endpoint: server.url })).passed, true);
    assert.equal(server.metrics.initialized, 2);
    assert.equal(server.metrics.terminated, 2);
  });
});
test('timeouts never pass as expected protocol errors', async () => {
  await againstFixture(async server => {
    const report = await runScenario(one({ tool: 'fixture_slow', arguments: { milliseconds: 1000 }, expectError: 'protocol' }), { endpoint: server.url, timeoutMs: 500 });
    assert.equal(report.passed, false);
    assert.equal(report.steps[0]?.outcome, 'transport-error');
  });
});
test('connection failure returns failure report without raw secret exception text', async () => {
  const report = await runScenario(scenario, { endpoint: 'http://127.0.0.1:1/mcp', timeoutMs: 100 });
  assert.equal(report.passed, false);
  assert.deepEqual(report.errors, ['MCP initialization failed']);
});
test('real JSON-RPC error can be required and distinguished from a tool error', async () => {
  const server = await startFixture(0, { protocolError: true });
  try {
    const expected = await runScenario(one({ tool: 'inventory_read', expectError: 'protocol' }), { endpoint: server.url });
    assert.equal(expected.passed, true, JSON.stringify(expected));
    assert.equal(expected.steps[0].outcome, 'protocol-error');
    assert.equal((await runScenario(one({ tool: 'inventory_read', expectError: 'tool' }), { endpoint: server.url })).passed, false);
  } finally { await server.close(); }
});
test('failed termination is reported as failure even after successful calls', async () => {
  const server = await startFixture(0, { rejectDelete: 500 });
  try {
    const report = await runScenario(one({ tool: 'inventory_read' }), { endpoint: server.url });
    assert.equal(report.steps[0].passed, true);
    assert.equal(report.passed, false);
    assert.equal(report.cleanup, 'termination-failed');
  } finally { await server.close(); }
});
test('valid MCP 405 termination policy is recorded without claiming deletion', async () => {
  const server = await startFixture(0, { rejectDelete: true });
  try {
    const report = await runScenario(one({ tool: 'inventory_read' }), { endpoint: server.url });
    assert.equal(report.passed, true);
    assert.equal(report.cleanup, 'termination-unsupported');
    assert.equal(server.metrics.terminated, 0);
  } finally { await server.close(); }
});
test('CLI writes machine and human reports and returns documented exit code', async () => {
  await againstFixture(async server => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-lab-'));
    try {
      const child = spawn(process.execPath, ['src/cli.js', 'examples/inventory.json', '--endpoint', server.url, '--out', join(dir, 'actual')], { cwd: new URL('..', import.meta.url) });
      let output = ''; child.stdout.on('data', data => { output += data; });
      const code = await new Promise(resolve => child.on('close', resolve));
      assert.equal(code, 0, output);
      assert.equal(JSON.parse(await readFile(join(dir, 'actual.json'), 'utf8')).passed, true);
      assert.match(await readFile(join(dir, 'actual.md'), 'utf8'), /session-terminated/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
