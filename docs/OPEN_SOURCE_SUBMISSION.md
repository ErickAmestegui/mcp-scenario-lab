# Open Source Mini Challenge — ready-to-paste fields

## Contribution title

MCP Scenario Lab — Reproducible stateful tests for MCP tools

## Contribution URL

https://github.com/ErickAmestegui/mcp-scenario-lab/tree/v0.1.0

## Independent repository URL

https://github.com/ErickAmestegui/mcp-scenario-lab

## GitHub username

ErickAmestegui

## Description of the work

I built MCP Scenario Lab as a new, additional MIT-licensed developer tool alongside FixPilot X. A successful tool response does not necessarily mean a stateful workflow is correct. This CLI makes those workflows reproducible: initialize a real MCP Streamable HTTP session, discover tools, execute a trusted JSON scenario, validate structured results with JSON Pointer assertions, and generate JSON and Markdown pass/fail reports.

The runner is independent of FixPilot X. Its tool names and expectations come from scenario files; it does not recognize a hard-coded assembly catalog. An original inventory fixture demonstrates stock mutation, an expected rejected withdrawal, unchanged state after rejection, and recovery. An optional FixPilot X scenario verifies missing-B7 recovery without losing already confirmed work.

The implementation uses the official MCP TypeScript SDK from JavaScript. Both JSON and SSE responses are tested against actual HTTP servers. Expected tool errors and JSON-RPC errors are distinguished from timeouts or network failures. A failed state expectation stops dependent calls. Session termination is reported explicitly, and reports omit raw arguments, results, session identifiers and exception text by default.

Fifteen automated tests passed locally. The real independent inventory scenario passed 6/6 calls, and the optional real FixPilot B7 scenario passed 7/7 calls. Negotiated protocol `2025-11-25` and HTTP DELETE cleanup were observed. The public Ubuntu/Node 22 workflow also passed at the implementation checkpoint: https://github.com/ErickAmestegui/mcp-scenario-lab/actions/runs/39310007278. Evidence reports and complete setup instructions are included in the repository.

This contribution helps MCP developers detect regressions that discovery-only smoke tests miss: incorrect post-call state, successful-looking error responses, lost prior work and cleanup failures. It is a small scenario regression tool, not an official MCP conformance certifier or a security audit. OAuth, resources, prompts, rollback and arbitrary JSON Schema validation are outside this initial release.

## Submission boundary

Created and publicly published on October 19, 2026, separately from the primary application. The public API returned HTTP 200, `private: false`, MIT license and default branch `main`. The runtime checkpoint is `a6cbf15cc93a872baeb8ab5330f7dc8ac6e48a1a`, tagged `v0.1.0`. Documentation may advance after that checkpoint. No npm-registry publication is claimed.

Prepared for review under the [official Open Source Mini Challenge rules](https://amazonappdev2026.devpost.com/rules). The organizer determines final eligibility; these materials do not constitute an entered or accepted submission. Submit this additional contribution alongside the primary Alexa+ project, not as a claim that FixPilot X's MIT license alone satisfies the mini challenge. AWS Builder is not claimed.
