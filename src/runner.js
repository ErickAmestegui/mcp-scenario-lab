import { isDeepStrictEqual } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const operators = new Set(['equals', 'exists', 'includes']);

/** JSON Pointer, including escaped keys. Never traverses inherited properties. */
export function pointer(value, path) {
  if (path === '') return { found: true, value };
  if (typeof path !== 'string' || !path.startsWith('/') || /~(?![01])/u.test(path)) throw new Error('Invalid JSON Pointer');
  for (const token of path.slice(1).split('/').map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, token)) return { found: false };
    value = value[token];
  }
  return { found: true, value };
}

export function validateScenario(scenario) {
  if (!object(scenario) || scenario.version !== 1 || typeof scenario.name !== 'string' || !scenario.name.trim()) throw new Error('Scenario requires version 1 and a name');
  if (!Array.isArray(scenario.steps) || scenario.steps.length < 1 || scenario.steps.length > 1000) throw new Error('Scenario requires 1–1000 steps');
  if (scenario.requiredTools !== undefined && (!Array.isArray(scenario.requiredTools) || scenario.requiredTools.some(t => typeof t !== 'string'))) throw new Error('requiredTools must be tool names');
  const ids = new Set();
  for (const step of scenario.steps) {
    if (!object(step) || typeof step.id !== 'string' || !step.id || ids.has(step.id) || typeof step.tool !== 'string' || !step.tool) throw new Error('Steps need unique IDs and tool names');
    ids.add(step.id);
    if (step.arguments !== undefined && !object(step.arguments)) throw new Error('Tool arguments must be an object');
    if (step.expectError !== undefined && !['tool', 'protocol'].includes(step.expectError)) throw new Error('expectError must be tool or protocol');
    if (step.assertions !== undefined && !Array.isArray(step.assertions)) throw new Error('assertions must be an array');
    for (const check of step.assertions ?? []) {
      if (!object(check) || !operators.has(check.op) || typeof check.path !== 'string') throw new Error('Invalid assertion');
      pointer({}, check.path);
      if (!Object.hasOwn(check, 'value') || (check.op === 'exists' && typeof check.value !== 'boolean')) throw new Error('Assertions require a value; exists requires boolean');
    }
  }
  return scenario;
}

export function evaluate(result, check) {
  const actual = pointer(result, check.path);
  if (check.op === 'exists') return actual.found === check.value;
  if (!actual.found) return false;
  if (check.op === 'equals') return isDeepStrictEqual(actual.value, check.value);
  return Array.isArray(actual.value) && actual.value.some(item => isDeepStrictEqual(item, check.value));
}

export function endpointUrl(endpoint, allowRemote = false) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Endpoint requires HTTP(S) without credentials, query or fragment');
  if (!allowRemote && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Remote endpoint requires --allow-remote');
  return url;
}

/** Reports intentionally omit arguments, result payloads, session IDs and raw exception text. */
export async function runScenario(scenario, options = {}) {
  validateScenario(scenario);
  const url = endpointUrl(options.endpoint ?? scenario.endpoint, options.allowRemote);
  const timeout = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120_000) throw new Error('timeoutMs must be 1–120000');
  const report = { formatVersion: 1, scenario: scenario.name, startedAt: new Date().toISOString(), endpoint: `${url.origin}${url.pathname}`, passed: false, initialization: null, tools: [], steps: [], cleanup: 'not-connected', errors: [] };
  const client = new Client({ name: 'mcp-scenario-lab', version: '0.1.0' });
  let negotiated;
  let terminationStatus;
  const transport = new StreamableHTTPClientTransport(url, {
    // Reject redirects so local mode cannot silently connect to another host.
    requestInit: { redirect: 'error' },
    fetch: async (input, init) => {
      const response = await fetch(input, { ...init, redirect: 'error', signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) });
      if (init?.method === 'DELETE') terminationStatus = response.status;
      // Never read an SSE clone to completion: event streams may remain open indefinitely.
      // The SDK consumes SSE, and its subsequent requests expose the negotiated version.
      if (init?.method === 'POST' && response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'application/json') {
        try { const body = await response.clone().json(); if (body.result?.protocolVersion) negotiated = body.result.protocolVersion; } catch { /* SSE initialization may be used; header below records later negotiated traffic. */ }
      }
      const version = new Headers(init?.headers).get('mcp-protocol-version');
      if (version) negotiated = version;
      return response;
    },
  });
  try {
    await client.connect(transport, { timeout });
    report.cleanup = 'pending';
    report.initialization = { protocolVersion: negotiated ?? null, server: client.getServerVersion(), transport: 'Streamable HTTP' };
    const tools = new Set();
    const cursors = new Set();
    let cursor;
    do {
      const page = await client.listTools(cursor ? { cursor } : {}, { timeout });
      for (const tool of page.tools) tools.add(tool.name);
      cursor = page.nextCursor;
      if (cursor && (cursors.has(cursor) || cursors.size >= 100)) throw new Error('Discovery pagination did not terminate');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    report.tools = [...tools].sort();
    report.initialization.protocolVersion = negotiated ?? null;
    if ((scenario.requiredTools ?? []).some(tool => !tools.has(tool))) { report.errors.push('Required tool missing from discovery'); return report; }
    for (const step of scenario.steps) {
      const entry = { id: step.id, tool: step.tool, passed: false, outcome: 'not-run', assertions: [] };
      report.steps.push(entry);
      if (!tools.has(step.tool)) { entry.outcome = 'undiscovered-tool'; break; }
      let result;
      try {
        result = await client.callTool({ name: step.tool, arguments: step.arguments ?? {} }, undefined, { timeout });
        entry.outcome = result.isError ? 'tool-error' : 'success';
      } catch (error) {
        // Only MCP JSON-RPC errors count as expected protocol errors; timeouts/network failures never do.
        entry.outcome = error instanceof McpError && ![ErrorCode.RequestTimeout, ErrorCode.ConnectionClosed].includes(error.code) ? 'protocol-error' : 'transport-error';
      }
      entry.passed = entry.outcome === (step.expectError === 'tool' ? 'tool-error' : step.expectError === 'protocol' ? 'protocol-error' : 'success');
      if (result) {
        for (const check of step.assertions ?? []) {
          const passed = evaluate(result, check);
          entry.assertions.push({ path: check.path, op: check.op, passed });
          if (!passed) entry.passed = false;
        }
      } else if (step.assertions?.length) entry.passed = false;
      if (!entry.passed) break; // Stateful scenarios cannot safely continue after an unexpected transition.
    }
    report.passed = report.steps.length === scenario.steps.length && report.steps.every(step => step.passed);
  } catch {
    report.errors.push(report.initialization ? 'Discovery or session operation failed' : 'MCP initialization failed');
  } finally {
    try {
      if (transport.sessionId) { await transport.terminateSession(); report.cleanup = terminationStatus === 405 ? 'termination-unsupported' : 'session-terminated'; }
      else if (report.initialization) report.cleanup = 'stateless-closed';
    } catch { report.cleanup = 'termination-failed'; report.errors.push('Session termination failed'); report.passed = false; }
    await client.close().catch(() => { report.errors.push('Client close failed'); report.passed = false; });
    report.finishedAt = new Date().toISOString();
  }
  return report;
}

export function markdownReport(report) {
  const safe = text => String(text).replace(/[|`<>\r\n]/g, ' ');
  return `# MCP Scenario Lab report\n\nScenario: ${safe(report.scenario)}\n\nResult: **${report.passed ? 'PASS' : 'FAIL'}**\n\nTransport: Streamable HTTP\n\nNegotiated protocol: ${safe(report.initialization?.protocolVersion ?? 'not observed')}\n\nDiscovered tools: ${report.tools.length}\n\n| Step | Tool | Outcome | Result |\n| --- | --- | --- | --- |\n${report.steps.map(step => `| ${safe(step.id)} | ${safe(step.tool)} | ${safe(step.outcome)} | ${step.passed ? 'PASS' : 'FAIL'} |`).join('\n')}\n\nCleanup: ${safe(report.cleanup)}\n${report.errors.map(error => `\n- ${safe(error)}`).join('')}\n\nReports omit raw arguments/results and session identifiers. Scenario labels, tool names, endpoint paths and server metadata are included: use non-sensitive labels.\n`;
}
