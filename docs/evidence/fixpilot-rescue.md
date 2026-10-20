# MCP Scenario Lab report

Scenario: FixPilot Rescue Intelligence: preview, compare, explicitly apply, partially recover

Result: **PASS**

Transport: Streamable HTTP

Negotiated protocol: 2025-11-25

Discovered tools: 22

| Step | Tool | Outcome | Result |
| --- | --- | --- | --- |
| load-table | load_assembly | success | PASS |
| confirm-base | complete_step | success | PASS |
| confirm-panels | complete_step | success | PASS |
| preview-double-loss | preview_scenario | success | PASS |
| compare-independent-scenarios | compare_scenarios | success | PASS |
| explicitly-apply-double-loss | apply_scenario | success | PASS |
| explain-resource-recovery | explain_recovery | success | PASS |
| preview-partial-recovery | preview_scenario | success | PASS |
| explicitly-apply-partial-recovery | apply_scenario | success | PASS |
| independent-feet-confirmation | complete_step | success | PASS |
| preview-tool-recovery | preview_scenario | success | PASS |
| explicitly-apply-tool-recovery | apply_scenario | success | PASS |
| retained-progress-and-inventory | get_assembly_state | success | PASS |

Cleanup: session-terminated


Reports omit raw arguments/results and session identifiers. Scenario labels, tool names, endpoint paths and server metadata are included: use non-sensitive labels.
