# MCP Scenario Lab

Run reproducible, stateful scenarios against **any MCP Streamable HTTP server** that exposes tools. Discover its tools, invoke real calls, assert structured results, and save readable Markdown and machine-readable JSON reports.

An MCP tool can return successfully while leaving the wrong state behind. This small CLI tests sequences: withdraw stock, reject an impossible withdrawal, confirm the stock stayed unchanged, restock, and read the recovered state. Tool names and expected state belong to your scenario, not the runner.

This is an independent MIT open source contribution developed alongside [FixPilot X](https://github.com/ErickAmestegui/fixpilot-x). It is **not an official MCP conformance certifier**, Alexa integration, or Amazon product.

Public repository: https://github.com/ErickAmestegui/mcp-scenario-lab . Implementation checkpoint: [`v0.1.0`](https://github.com/ErickAmestegui/mcp-scenario-lab/tree/v0.1.0). The [Ubuntu / Node 22 CI run](https://github.com/ErickAmestegui/mcp-scenario-lab/actions/runs/39310007278) passed at that checkpoint. [Open Source submission fields](docs/OPEN_SOURCE_SUBMISSION.md) describe the separate contribution and its limits; they do not represent a submitted Devpost entry.

## Quick start

Requires Node.js 22+ and npm. No account, API key or paid service.

```sh
npm ci
npm test
```

In terminal 1, start the independent local inventory server:

```sh
npm run fixture
```

In terminal 2:

```sh
npm run demo
```

The fixture listens on `http://127.0.0.1:3102/mcp`. Six steps check initialization, inventory reads, mutations, an expected rejected withdrawal, retained state, and recovery. Reports appear in `reports/inventory.json` and `reports/inventory.md`. Stop the fixture with Ctrl+C.

The CLI runs directly from source without a build:

```sh
node src/cli.js examples/inventory.json --endpoint http://127.0.0.1:3102/mcp --out reports/run --timeout-ms 10000
```

Optionally `npm link` installs `mcp-scenario-lab` as a local command. This repository is not claimed to be published on npm.

## Scenario format

```json
{
  "version": 1,
  "name": "Read a stock count",
  "endpoint": "http://127.0.0.1:3102/mcp",
  "requiredTools": ["inventory_read"],
  "steps": [
    {
      "id": "read-stock",
      "tool": "inventory_read",
      "arguments": {},
      "assertions": [
        { "path": "/structuredContent/quantity", "op": "equals", "value": 3 },
        { "path": "/structuredContent/item", "op": "exists", "value": true }
      ]
    }
  ]
}
```

`path` is a JSON Pointer into the **full MCP call result**, not just `structuredContent`. Empty pointer `""` means the result root; `~1` escapes `/`, and `~0` escapes `~`. `equals` uses deep equality, `exists` requires a boolean, and `includes` checks deep membership in an array. Text-only tools can be checked through `/content/0/text`; text is not automatically parsed as JSON.

`expectError: "tool"` requires `isError: true`. `expectError: "protocol"` requires an MCP JSON-RPC error. Network failures, timeouts, and closed connections never satisfy expected protocol errors. SDK input validation can return a tool error rather than a protocol error. Inspect your server's contract.

All assertions are exact and deterministic. Steps run sequentially in one initialized session. The first unexpected outcome stops the sequence, preserving the failure point instead of sending potentially unsafe dependent mutations. A final read call is the way to check that earlier state persisted in that session. A required tool absent from discovery fails before any calls. Tool discovery follows pagination with loop protection.

## Reports and exit codes

Reports contain the negotiated protocol version observed from actual initialization or subsequent SDK headers, server metadata, discovered names, step outcomes, assertion paths and cleanup status. The official SDK performs initialization and protocol negotiation; this runner does not implement a lookalike REST protocol.

- `0`: every scenario step and cleanup passed.
- `1`: initialization, discovery, assertion, call or cleanup failed.
- `2`: invalid scenario/options, unreadable input or unwritable reports.

Session-based servers receive MCP HTTP DELETE before client close. Stateless servers are closed locally. HTTP 405 is permitted by MCP: it is recorded as `termination-unsupported`, without claiming the server session was deleted; other termination failures fail the report. Reports intentionally omit arguments, raw results, expected values, session IDs and exception text. **Scenario names, IDs, tool names, assertion paths, endpoint paths and server metadata are included:** keep those non-sensitive. Reports are local and gitignored by default.

## Your server

Change only the endpoint, tool names, arguments, and assertions. No FixPilot-specific names are hard-coded in the runner. Remote hosts require `--allow-remote`; that flag explicitly permits contacting and mutating the chosen remote service. Only run trusted scenarios against servers you are authorized to test.

```sh
node src/cli.js your-scenario.json --endpoint https://your-test-server.example/mcp --allow-remote --out reports/staging
```

Endpoints reject embedded credentials, query strings and fragments. Redirects are rejected. Local mode accepts only literal loopback hosts (`localhost`, `127.0.0.1`, `[::1]`); it is a guardrail, not a network sandbox or DNS-rebinding defense. No authentication flow or header/token option is included in this MVP. Do not put secrets into configuration or tool arguments intended for public examples.

## Optional FixPilot X example

This runner is separate from FixPilot X and needs no FixPilot code to execute its own fixture. To run the optional integration, start FixPilot X's loopback MCP server with `npm run mcp` in that repository, then from this repository:

```sh
node src/cli.js examples/fixpilot-b7.json --out reports/fixpilot-b7
```

The example records software confirmations of assembly steps, reports missing B7, checks it remains missing across a separate state read, completes an independent step, and restores B7 without losing confirmations. It does not inspect or certify physical assembly and does not call a native Alexa service.

## Architecture

`src/cli.js` reads trusted local JSON and writes reports. `src/runner.js` validates the scenario, creates the official SDK client and Streamable HTTP transport, discovers tools, calls them, evaluates JSON Pointer expectations and terminates the session. `examples/fixture-server.js` is an original, independent SDK server with per-session inventory and counter state. Node's built-in test runner exercises real HTTP sessions and failures.

## Limitations

- Tools only: no prompts, resources, OAuth, sampling, elicitation or interactive server requests.
- State assertions test server-reported data, not an external database or physical world.
- In-memory fixture state resets between sessions; durable restart persistence is not claimed.
- No automatic result capture/substitution, parallel execution, retries, rollback or destructive-call confirmation. Scenarios are executable trusted input and can mutate real data.
- No process-level signal recovery guarantee. A killed process may leave the server session open until its server-side expiry.
- Per-operation timeouts (1–120000 ms), not a total scenario deadline. At most 1000 steps and 101 discovery pages.
- Reports are intentionally redacted and cannot fully reproduce raw server responses. Keep detailed debug traces private using your own tooling.
- Not a complete protocol or security audit, schema fuzz tester, or official certification.

## Contributing

Open an issue with a minimal scenario and sanitized expected/observed behavior. Run `npm test` before a pull request. Keep the runner independent of any application-specific tool catalog. Do not commit secrets, private endpoints or raw reports containing sensitive labels.

MIT license; dependencies retain their own licenses. No proprietary assets or FixPilot runtime code are bundled.

## Verified evidence

On October 19, 2026, all **15 automated tests passed** on Windows with Node.js 24.16.0. The repository configures a Node.js 22 Ubuntu workflow; a configured workflow alone is not a claim that CI has run.

The [independent inventory report](docs/evidence/inventory.md) records six real calls and negotiated protocol `2025-11-25`. The [optional FixPilot B7 report](docs/evidence/fixpilot-b7.md) records seven real calls against FixPilot X's actual MCP server, including retained confirmations `[1, 2, 6]` after B7 recovery. Both sessions terminated through HTTP DELETE. JSON equivalents are stored beside the Markdown reports. Random loopback ports in those historical reports identify the test sessions and are not hosted endpoints.

Tests cover real HTTP initialization/discovery with both JSON and SSE responses, stock mutation, expected tool and JSON-RPC errors, incorrect-state failures, stop-on-first-failure, missing discovery entries, session isolation, timeout classification, unavailable endpoints, HTTP DELETE failure, allowed HTTP 405 termination policy, and CLI report output. SSE bodies are consumed only by the official SDK; the runner observes the negotiated protocol from subsequent SDK request headers. The fixture models in-session retention; durable restart persistence and native Alexa access were not tested or claimed.
