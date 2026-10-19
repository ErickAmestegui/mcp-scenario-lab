# MCP Scenario Lab report

Scenario: Inventory mutation, rejected withdrawal, and recovery

Result: **PASS**

Transport: Streamable HTTP

Negotiated protocol: 2025-11-25

Discovered tools: 4

| Step | Tool | Outcome | Result |
| --- | --- | --- | --- |
| initial | inventory_read | success | PASS |
| take-two | inventory_take | success | PASS |
| reject-overdraw | inventory_take | tool-error | PASS |
| state-retained | inventory_read | success | PASS |
| restock | inventory_restock | success | PASS |
| retained-recovery | inventory_read | success | PASS |

Cleanup: session-terminated


Reports omit raw arguments/results and session identifiers. Scenario labels, tool names, endpoint paths and server metadata are included: use non-sensitive labels.
