# SnapSlot Token Efficiency Governance

## 1. Purpose and scope

This document defines local offline token-budget measurement for the governed loop runner.

The policy applies only to the internal governed loop surfaces:

- Governor prompt before Stage 3 Governor invocation.
- Builder packet before Stage 5 Codex invocation.

This document does not define product runtime behavior, model selection, provider billing, or merge approval.

## 2. Model profiles

| Profile | Actor | soft_limit_tokens | hard_limit_tokens | provider_context_reference_tokens |
| --- | --- | --- | --- | --- |
| governor_claude_pro_default | Claude Governor prompt measurement | 100000 | 120000 | 200000 |
| builder_codex_default | Codex Builder packet measurement | 250000 | 300000 | 400000 |

The value `250000` is the governed Builder soft limit for this loop only. It is not a claim about the official Codex maximum context window or any provider's official context limit.

## 3. Local counting method

Method name: `conservative_byte_count_div3`

Definition:

1. Count input bytes locally.
2. Divide the byte count by 3.
3. Round up to the next integer.

The bash arithmetic form is:

```text
measured_tokens = (input_bytes + 2) / 3
```

This is a local conservative policy count. It intentionally overcounts by using byte count divided by 3 and does not claim exact Anthropic server tokenization, exact OpenAI server tokenization, or exact provider-side token counting for any model.

## 4. Integration points

The governed loop runner records token-budget proof at two points:

- Pre-Stage-3: the Governor prompt in `GOVERNOR_PROMPT` is measured before `claude -p` runs, and the result is written to `proof/stage3-token-budget.json`.
- Pre-Stage-5: the Builder packet at `proof/stage3-governor-output.txt` is measured before `codex exec` runs, and the result is written to `proof/stage5-token-budget.json`.

The Stage 3 to Stage 5 handoff remains verbatim. The Stage 5 pre-check reads `proof/stage3-governor-output.txt` directly and does not alter the file content passed to Codex.

## 5. Proof file format

Each token-budget proof file must contain one JSON object with at least these fields:

- `label`: string
- `profile`: string, either `governor_claude_pro_default` or `builder_codex_default`
- `counter`: string, always `local_offline`
- `encoding_policy`: string, always `conservative_byte_count_div3`
- `measured_tokens`: integer
- `soft_limit_tokens`: integer
- `hard_limit_tokens`: integer
- `provider_context_reference_tokens`: integer
- `status`: string, `PASS` when `measured_tokens <= hard_limit_tokens`; `FAIL` when `measured_tokens > hard_limit_tokens`
- `api_calls`: string, always `NONE`
- `network_calls`: string, always `NONE`

The proof JSON may include extra local-audit fields such as:

- `input_bytes`: integer
- `within_soft_limit`: JSON boolean
- `timestamp`: string, UTC ISO-8601 timestamp from `date -u +%Y-%m-%dT%H:%M:%SZ`

## 6. Enforcement model

The token-budget checker enforces hard limits fail-closed.

If `measured_tokens` exceeds `hard_limit_tokens`, the checker must write token-budget proof JSON with `status` set to `FAIL`, print a clear stderr message, and exit non-zero. The loop must stop when the checker exits non-zero.

The loop records whether the measured input is within the configured soft limit by writing `within_soft_limit` to the proof JSON when that field is present. The loop does not hard abort solely because `within_soft_limit` is `false`.

The loop also stops if the local token-budget script cannot run successfully or if the expected proof JSON is missing or empty after the pre-check.

## 7. No-network and no-key constraints

Token-budget measurement must remain local and offline.

The checker must not:

- call a provider token-counting endpoint
- call any remote tokenization service
- use network fetch tools
- use an API key variable
- use npm, Node, Python, or third-party token counting libraries

The method is intentionally simple and auditable so that token-budget proof can be produced without any network or provider dependency.

## 8. Versioning

This document is governed law. Changes require a new governed packet with explicit allowed files, validation commands, proof requirements, and stop conditions.
