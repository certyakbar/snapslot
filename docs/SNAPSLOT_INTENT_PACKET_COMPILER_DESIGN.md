# SnapSlot Repo-Specific Governance Compiler Design RFC

## 1. Status And Scope

This RFC defines the SnapSlot Repo-Specific Governance Compiler.

Status:
- T-GOV-27: RFC only.
- T-GOV-28: DEFERRED pending T-GOV-27 RFC completion and Governor approval.
- T-GOV-29: DEFERRED pending T-GOV-28 implementation.

This document is design governance only. It does not implement any compiler component, runner component, script, package change, GitHub workflow, validation witness, approval manifest change, or ledger credit.

The SnapSlot Repo-Specific Governance Compiler is a formatter, rejector, and deterministic derivation engine only. It converts governed task intent into a repo-specific packet candidate or a block result. It is not an autonomous reviewer, architect, approval gate, secret manager, runtime proof generator, or semantic authority.

## 2. Rename And Framing

The compiler name is SnapSlot Repo-Specific Governance Compiler throughout all future scoped work.

The SnapSlot Repo-Specific Governance Compiler is non-portable. It is non-portable unless all of the following migrate together:
- FILE_MAP.
- RISK_POLICY.
- governance spine.
- packet schema.
- Sentinel law.
- validation policy.

The SnapSlot Repo-Specific Governance Compiler may produce only:
- EMIT_CANDIDATE: a candidate packet that still requires local validation and Governor/Sentinel enforcement.
- BLOCK: a failure envelope explaining why a packet cannot be honestly emitted.

Transport safety and semantic safety are separate concerns and must be independently enforced. Transport safety proves the bytes arrived intact and parse as the expected local schema. Semantic safety proves the parsed content obeys SnapSlot governance law, scope, risk, validation, and deferral rules.

## 3. Content-Addressed ASCII-Safe Transport Envelope

All previous transport-envelope wording is replaced by a content-addressed ASCII-safe transport envelope.

Transport requirements:
- Canonical JSON is written on disk before transport.
- The canonical JSON receives a SHA-256 digest before transport.
- Transport encoding must use either `base64 --wrap=0` or `jq --rawfile`.
- The digest and transport metadata are included outside the encoded payload.
- The consumer must decode before parsing.

Consumer-side processing order is fixed:
1. Decode the content-addressed ASCII-safe transport envelope.
2. Verify SHA-256 checksum against the decoded canonical JSON bytes.
3. Parse JSON only after checksum verification succeeds.
4. Run local schema validation.
5. Run semantic validation.

No vendor output is trusted before local checksum, schema, semantic, and Command Registry validation all pass.

## 4. Pre-Compile Re-Anchor Hook

The SnapSlot Repo-Specific Governance Compiler must run a Pre-Compile Re-Anchor hook before deriving an EMIT_CANDIDATE or BLOCK result.

The Pre-Compile Re-Anchor record must include:
- branch.
- HEAD SHA.
- origin/main SHA.
- dirty-state classification.
- approval manifest verdict.
- shallow-clone status.
- detached-HEAD status.
- CI mode.

Dirty-state classification must be policy-filtered. The hook must distinguish:
- CLEAN.
- ONLY_ALLOWED_FILE_DIRTY.
- POLICY_EXEMPT_NOISE_ONLY.
- FORBIDDEN_DIRTY.
- STAGED_UNRELATED.
- AMBIGUOUS_DIRTY.

POLICY_EXEMPT_NOISE may cover only deterministic local noise explicitly listed by policy. It must never cover product source, tests, docs outside allowed scope, scripts, executable files, package metadata, GitHub workflows, approval manifests, schema files outside docs, or files that affect runtime behavior. POLICY_EXEMPT_NOISE must be bounded by file path, expected content class, and maximum count. Any unmatched dirty file blocks compile.

If the repo moves during compile, including branch movement, HEAD movement, origin/main movement, or dirty-state reclassification, the compiler must BLOCK.

## 5. Command Registry

Validation commands must be structured validation command objects:

```json
{
  "program": "grep",
  "argv": ["-c", "Command Registry", "docs/SNAPSLOT_INTENT_PACKET_COMPILER_DESIGN.md"],
  "cwd": ".",
  "timeout_class": "short",
  "expected_output_class": "integer_count"
}
```

`program` plus `argv` is not sufficient for safety.

The Command Registry must define, for every allowed command class:
- exact allowed programs.
- allowed argv patterns.
- forbidden flags.
- cwd policy.
- sandbox requirement.
- network policy.
- write policy.
- env policy.
- timeout class.
- expected output class.
- proof path.

All validation commands must run in sandbox or local validation mode. The Command Registry must reject arbitrary command text, shell expansion, command chaining, command substitution, environment-secret reads, network use unless explicitly allowed by a scoped policy, and write operations unless the command class is explicitly write-safe.

## 6. Validation Layers

The SnapSlot Repo-Specific Governance Compiler has three validation layers:

Layer 1: task-specific commands.
- These are commands declared by the governed packet.
- They must be represented as Command Registry objects.
- Prose-only validation is invalid.

Layer 2: repo-baseline deterministic checks.
- These are compiler-owned local checks for scope, protected paths, file declarations, ledger claims, Sentinel compatibility, schema validity, and risk-policy derivation.
- They must be deterministic and reproducible without vendor trust.

Layer 3: policy waivers.
- A waiver may suppress or transform only a known deterministic baseline finding.
- A waiver may not bypass forbidden file edits, approval requirements, secret rules, sandbox requirements, Sentinel law, or Governor approval.

Waiver registry schema:

```json
{
  "waiver_id": "W-TGOV-NNN",
  "applies_to_check": "repo_baseline.check_name",
  "allowed_task_ids": ["T-GOV-28"],
  "allowed_risk_tiers": ["LOW", "MEDIUM"],
  "expires_after": "2026-12-31",
  "derivation_rule": "exact-match",
  "required_evidence": ["governor_packet_reference", "local_readback"],
  "boundaries": ["docs-only", "no-runtime"],
  "proof_path": "proof/waivers/W-TGOV-NNN.json"
}
```

Waiver derivation rules must be deterministic. Waiver evidence must be local and inspectable. Waiver proof must show the original finding, waiver match, boundary check, and final transformed result.

## 7. Context And Excerpt Budgets

The SnapSlot Repo-Specific Governance Compiler must enforce explicit context and excerpt budgets:
- `max_excerpt_lines_per_file`.
- `max_total_excerpt_lines`.
- `max_context_tokens`.
- `max_adjacent_files`.
- `max_excerpt_windows_per_file`.

Allowed files have full-context policy. If a file is in `allowed_files`, the compiler may include full file context subject to the total context budget and honest truncation rules.

Non-allowed adjacent context is line-window excerpts only. Adjacent context may be used only to establish local references, ownership, nearby law, or validation meaning. It must not become an indirect path to edit or summarize unrelated files.

Excerpt windows must include:
- file path.
- start line.
- end line.
- line count.
- reason.
- digest or source revision binding.

Semantic validation must verify excerpt line ordering, non-overlap where required, monotonic ordering inside a file, and that all excerpt windows fit the declared budget. If honest context cannot fit within budget, the required path is BLOCK -> ESCALATE_TO_GOVERNOR_WITH_PARTIAL_CONTEXT. The compiler must not silently omit material context to force an EMIT_CANDIDATE.

## 8. SIR Schema Hardening

The Structured Intent Representation must define `$defs` for:
- `file_path`.
- `sha40`.
- `risk_tier`.
- `command_object`.
- `block_code`.
- `excerpt_window`.

Required `$defs` semantics:
- `file_path`: normalized repo-relative path, no absolute paths, no `..`, no empty segment, no executable-path implication unless allowed by policy.
- `sha40`: exactly 40 lowercase hexadecimal characters.
- `risk_tier`: enum controlled by RISK_POLICY.
- `command_object`: structured validation command object governed by the Command Registry.
- `block_code`: enum with stable machine-readable failure codes.
- `excerpt_window`: file path plus ordered line range, reason, digest binding, and budget accounting.

The schema must define separate or conditional EMIT_CANDIDATE and BLOCK envelopes. A BLOCK envelope must not require full success packet fields. A BLOCK envelope must include enough detail for Governor review without pretending the candidate packet exists.

Envelope semantics:
- EMIT_CANDIDATE means schema validation passed, semantic validation passed, and deterministic derivations are internally consistent.
- BLOCK means one or more fatal conditions prevent honest candidate emission.

`terminal_status` or `triggered_conditions` must have precedence rules. Fatal triggered conditions override nonfatal warnings. BLOCK overrides EMIT_CANDIDATE. Secret exposure, forbidden file collision, repo movement during compile, Command Registry rejection, schema invalidity, checksum mismatch, and Sentinel-law conflict are terminal BLOCK conditions.

## 9. Trust And Security

Vendor output is untrusted until local checksum, schema, semantic, and Command Registry validation all pass.

Prompts are advisory. Enforcement is local validator plus sandbox/hooks plus scope diff plus Sentinel/Governor law.

The SnapSlot Repo-Specific Governance Compiler must prohibit any operator-managed, repo-stored, or env-exposed API key path. It must not request, read, emit, pass through, or validate API keys from repository files, environment variables, packet fields, logs, command output, or operator-managed config.

CLI credential caches are sensitive local state. They must not be copied into packets, proof bundles, docs, logs, schema examples, or transport envelopes.

T-GOV-28 must include a no-secret/no-key preflight design before implementation begins. That preflight must fail closed before any vendor call, transport step, command execution, or proof generation.

## 10. Markdown-To-SIR Migration Path

Current Markdown remains canonical until T-GOV-28 implementation and T-GOV-29 witness complete.

Dual-parse/render is only permitted if explicitly scoped in a later governed packet.

Sentinel cutoff requires a later governed packet. No cutoff is authorized by this RFC.

The migration sequence is:
1. T-GOV-27 RFC approval.
2. T-GOV-28 implementation, still DEFERRED until approval.
3. T-GOV-29 witness, still DEFERRED until T-GOV-28 implementation.
4. Later governed packet may propose Sentinel cutoff after witness evidence exists.

## 11. Rollback And Recovery

Rollback and recovery must be revert-safe.

The implementation path must use a feature flag or isolated entrypoint. The existing loop is preserved and unchanged until explicitly enabled by a later governed packet.

Recovery requirements:
- failed compile leaves no partial packet promoted as valid.
- failed validation emits BLOCK or no output.
- transport checksum mismatch discards decoded content.
- repo movement during compile forces BLOCK.
- feature flag off returns to existing Markdown flow.
- isolated entrypoint can be reverted without editing product runtime.

## 12. T-GOV-28 And T-GOV-29 Deferral

T-GOV-28 is DEFERRED pending T-GOV-27 RFC completion and Governor approval. T-GOV-28 may not implement until a later governed packet explicitly scopes files, validation, stop rules, no-secret/no-key preflight, Command Registry behavior, and rollout boundaries.

T-GOV-29 is DEFERRED pending T-GOV-28 implementation. T-GOV-29 may not claim witness proof until T-GOV-28 exists and a later governed packet scopes witness commands, proof paths, expected failure cases, and acceptance rules.

No ledger PASS, runtime proof, or Sentinel cutoff is claimed by T-GOV-27.

## 13. T-GOV-29 Witness Classes

T-GOV-29 must enumerate and prove all required witness classes before any completion claim:
- transport integrity.
- checksum mismatch.
- re-anchor failure.
- repo moved during compile.
- dirty-state classification.
- validation prose rejected.
- arbitrary command rejected.
- command allow-list bypass rejected.
- sandbox-required enforcement.
- forbidden file collision.
- deterministic risk escalation.
- waiver derivation.
- BLOCK envelope.
- EMIT_CANDIDATE envelope.
- schema regression.
- vendor divergence rejection.
- excerpt budget overflow.
- Governor escalation path.
- allowed-files full-context policy.
- adjacent excerpts.
- Markdown-to-SIR transition.

Each witness class must include command proof, local artifacts where allowed, expected output class, failure-mode proof where relevant, and scope-diff proof. No witness may require editing forbidden files or exposing secrets.

## 14. Risk Policy And Deterministic Derivation

Risk derivation must be deterministic. The compiler may infer risk only from local policy inputs:
- allowed files.
- forbidden files.
- actor surface.
- phase.
- workflow.
- validation command classes.
- write policy.
- executable/script/package/GitHub workflow touch classification.
- product source or test touch classification.
- ledger or approval-manifest touch classification.

Deterministic risk escalation must happen when a task touches protected paths, validation authority, Sentinel law, command execution, scripts, workflows, package metadata, schema, approval manifests, ledger proof, product source, or tests. If deterministic derivation conflicts with the provided packet risk level, the compiler must BLOCK or escalate according to RISK_POLICY.

## 15. Forbidden Claims

This RFC makes no PASS claim.

This RFC creates no runtime proof.

This RFC grants no ledger credit.

This RFC does not approve the prior T-GOV-27 research report as-is. The prior research report remains unapproved and is superseded by this RFC after Governor review.

This RFC does not authorize:
- compiler implementation.
- runner changes.
- script changes.
- token-budget script changes.
- package changes.
- GitHub workflow changes.
- product source changes.
- test changes.
- standalone schema files.
- acceptance ledger updates.
- approval manifest updates.

## 16. Stop And Escalation Conditions

The SnapSlot Repo-Specific Governance Compiler must BLOCK and escalate when:
- required context cannot fit within budget.
- repo state is dirty beyond allowed policy.
- repo moved during compile.
- branch, HEAD SHA, origin/main SHA, shallow-clone status, detached-HEAD status, CI mode, or approval manifest verdict is ambiguous.
- checksum verification fails.
- schema validation fails.
- semantic validation fails.
- Command Registry validation fails.
- sandbox or local validation mode is unavailable for a required command.
- forbidden file collision is detected.
- deferred work would be exposed.
- secret or key path is requested, present, or inferred.
- transport safety passes but semantic safety fails.
- semantic safety passes but transport safety fails.
- Sentinel law conflicts with packet content.
- Governor approval is required but missing.

The required terminal path for partial context is BLOCK -> ESCALATE_TO_GOVERNOR_WITH_PARTIAL_CONTEXT.
