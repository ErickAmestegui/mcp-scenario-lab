import express from 'express';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, CallToolRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/** Independent, in-memory per-session inventory fixture. Not a production service. */
export async function startFixture(port = 0, { protocolError = false, rejectDelete = false, enableJsonResponse = true } = {}) {
  const app = express();
  const sessions = new Map();
  const metrics = { initialized: 0, terminated: 0, calls: 0 };
  app.use((req, res, next) => {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname) || req.headers.origin) return res.status(403).end();
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.all('/mcp', async (req, res) => {
    try {
      if (rejectDelete && req.method === 'DELETE') return res.status(typeof rejectDelete === 'number' ? rejectDelete : 405).end();
      const id = req.headers['mcp-session-id'];
      let session = sessions.get(id);
      if (id && !session) return res.status(404).json({ error: 'Unknown session' });
      if (!session) {
        if (req.method !== 'POST' || !isInitializeRequest(req.body)) return res.status(400).json({ error: 'Initialize first' });
        if (sessions.size >= 32) return res.status(503).end();
        let quantity = 3;
        let counter = 0;
        const server = new McpServer({ name: 'scenario-lab-inventory-fixture', version: '0.1.0' });
        const reply = (error = false) => ({ isError: error, content: [{ type: 'text', text: error ? 'Insufficient stock' : 'Inventory state' }], structuredContent: { quantity, counter, item: 'washer' } });
        server.registerTool('inventory_read', { inputSchema: {} }, async () => { metrics.calls++; return reply(); });
        server.registerTool('fixture_echo', { inputSchema: { payload: z.unknown() } }, async ({ payload }) => {
          metrics.calls++;
          return { content: [{ type: 'text', text: 'Fixture echo' }], structuredContent: { echoed: payload, duplicated: payload, marker: { $var: 'notCaptured' } } };
        });
        server.registerTool('inventory_take', { inputSchema: { amount: z.number().int().positive() } }, async ({ amount }) => {
          metrics.calls++;
          if (amount > quantity) return reply(true);
          quantity -= amount;
          counter++;
          return reply();
        });
        server.registerTool('inventory_restock', { inputSchema: { amount: z.number().int().positive() } }, async ({ amount }) => { metrics.calls++; quantity += amount; counter++; return reply(); });
        server.registerTool('fixture_slow', { inputSchema: { milliseconds: z.number().int().min(1).max(1000) } }, async ({ milliseconds }) => { await new Promise(resolve => setTimeout(resolve, milliseconds)); return reply(); });
        if (protocolError) server.server.setRequestHandler(CallToolRequestSchema, async () => { throw new McpError(ErrorCode.InvalidParams, 'Intentional fixture JSON-RPC rejection'); });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), enableJsonResponse, onsessioninitialized: sid => { sessions.set(sid, { server, transport }); metrics.initialized++; } });
        transport.onclose = () => { if (transport.sessionId && sessions.delete(transport.sessionId)) metrics.terminated++; };
        await server.connect(transport);
        session = { server, transport };
      }
      await session.transport.handleRequest(req, res, req.body);
    } catch { if (!res.headersSent) res.status(500).json({ error: 'Fixture operation failed' }); }
  });
  const listener = await new Promise(resolve => { const listener = app.listen(port, '127.0.0.1', () => resolve(listener)); });
  return {
    url: `http://127.0.0.1:${listener.address().port}/mcp`, metrics,
    close: async () => {
      await Promise.all([...sessions.values()].map(session => session.server.close()));
      listener.closeAllConnections();
      await new Promise(resolve => listener.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await startFixture(3102);
  console.log(`Independent inventory fixture: ${fixture.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void fixture.close().then(() => process.exit(0)); });
}
