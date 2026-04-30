# T-GOV-26 Token Budget Witness

## Scope

Task: `T-GOV-26-WITNESS`

This witness records the live token-budget proof files generated before Codex execution. Codex did not regenerate the proof files and did not run the loop runner.

Ledger credit remains deferred to `T-GOV-26-LEDGER`. This document is witness-only and does not claim ledger completion.

## Stage 3 Proof

Proof file: `proof/stage3-token-budget.json`

Observed values:

| Field | Value |
| --- | --- |
| label | `token_budget_check` |
| profile | `governor_claude_pro_default` |
| counter | `local_offline` |
| encoding_policy | `conservative_byte_count_div3` |
| input_bytes | `5599` |
| measured_tokens | `1867` |
| soft_limit_tokens | `100000` |
| hard_limit_tokens | `120000` |
| provider_context_reference_tokens | `200000` |
| within_soft_limit | `true` |
| status | `PASS` |
| api_calls | `NONE` |
| network_calls | `NONE` |
| timestamp | `2026-04-30T12:32:23Z` |

Validation result: `measured_tokens` is less than or equal to `hard_limit_tokens`; proof is local/offline with no API or network calls.

## Stage 5 Proof

Proof file: `proof/stage5-token-budget.json`

Observed values:

| Field | Value |
| --- | --- |
| label | `token_budget_check` |
| profile | `builder_codex_default` |
| counter | `local_offline` |
| encoding_policy | `conservative_byte_count_div3` |
| input_bytes | `5274` |
| measured_tokens | `1758` |
| soft_limit_tokens | `250000` |
| hard_limit_tokens | `300000` |
| provider_context_reference_tokens | `400000` |
| within_soft_limit | `true` |
| status | `PASS` |
| api_calls | `NONE` |
| network_calls | `NONE` |
| timestamp | `2026-04-30T12:33:40Z` |

Validation result: `measured_tokens` is less than or equal to `hard_limit_tokens`; proof is local/offline with no API or network calls.

## Witness Boundary

- Created witness document only: `docs/SNAPSLOT_TGOV26_TOKEN_BUDGET_WITNESS.md`
- Did not modify proof files.
- Did not modify `docs/SNAPSLOT_ACCEPTANCE_LEDGER.md`.
- Did not modify `ops/GOVERNOR_APPROVAL.json`.
- Did not modify runner scripts, token checker scripts, product code, tests, workflows, or package files.
- Did not implement `T-GOV-27`, `T-GOV-28`, `T-GOV-29`, or Product Phase 5.
