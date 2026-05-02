# T-GOV-30 Manifest Retirement Inventory

Task ID: `T-GOV-30-MANIFEST-RETIREMENT-INVENTORY`

## Scope and non-claims

This task performs inventory only and does not claim manifest retirement.

Manifest deletion is forbidden until a later governed codepath-retirement or deletion task explicitly authorizes it. This document does not delete, edit, rename, or neutralize `ops/GOVERNOR_APPROVAL.json`, Sentinel, workflows, scripts, tools, schemas, registries, tests, package files, runtime files, or existing docs.

Final automation state is not claimed. The current findings are based on repository-file inspection and local read-only validation only.

## Current hard facts

- `ops/GOVERNOR_APPROVAL.json` exists and is canonical NONE on current `main`.
- `docs/SNAPSLOT_TGOV29_ACTUAL_WITNESS.md` exists on current `main` and records T-GOV-29 actual witness evidence after PR #97.
- Sentinel can tolerate a missing `ops/GOVERNOR_APPROVAL.json` only in the narrow retained-manifest read path: `.github/workflows/pr-sentinel.yml` treats a 404 as `rawManifest = null`, and `parsedManifest` no longer controls `governorPassed`. That does not make deletion authorized.
- `loop-runner Stage 1` still requires `ops/GOVERNOR_APPROVAL.json` to be readable and requires its verdict to be `NONE`. This is an active deletion blocker.
- The `PR template` still special-cases the manifest and contains stale manifest-authority instructions.
- The `risk policy` still special-cases a valid approval manifest for HIGH/CRITICAL approval and is stale after T-GOV-29 authority switch.
- `reset workflow deletion` is functionally safe only after a later governed deletion task: `.github/workflows/post-merge-manifest-reset.yml` is neutralized with `neutralized-reset`, but deleting a workflow remains out of scope here.

## Classification buckets

Each discovered reference is classified into exactly one bucket:

1. Active code dependency
2. Compatibility-only dependency
3. Documentation stale reference
4. Historical witness/design reference
5. Deletion blocker
6. Safe-to-retain historical reference
7. Obsolete-but-out-of-scope automation/doc reference

## Classification table

| File | Reference type | Active behavior | Blocks manifest deletion | Action |
| --- | --- | --- | --- | --- |
| `ops/GOVERNOR_APPROVAL.json` | Deletion blocker | Canonical retained repository manifest with `"verdict": "NONE"` | Yes | Retain until a later governed deletion task removes all blockers. |
| `.github/workflows/pr-sentinel.yml` | Compatibility-only dependency | Excludes `ops/GOVERNOR_APPROVAL.json` from scope comparison; reads retained manifest from PR HEAD for write/reset compatibility; `parsedManifest` no longer controls `governorPassed`; scoped approval comments are authoritative. | No direct deletion blocker, but should be simplified before deletion. | Later subtask should remove retained-manifest constants, read path, comments, and scope exclusions if deletion is authorized. |
| `.github/workflows/pr-sentinel.yml` | Active code dependency | `governor-manifest-commit` job still defines `MANIFEST_PATH` and filters it from declared scoped files, but APPROVE now posts authoritative scoped approval and does not write the manifest. | No direct deletion blocker. | Retire compatibility naming and manifest filtering in a later workflow task. |
| `.github/workflows/post-merge-manifest-reset.yml` | Obsolete-but-out-of-scope automation/doc reference | Workflow is neutralized: manual dispatch only, read permission only, job `neutralized-reset` is `if: false`. | No active runtime blocker, but deletion itself needs later workflow-deletion scope. | Later governed task may delete the neutralized reset workflow. |
| `.github/pull_request_template.md` | Documentation stale reference | Governor verdict section still says Sentinel validates `ops/GOVERNOR_APPROVAL.json`, approval comments commit the manifest, and BLOCK overrides an approval manifest. | No direct deletion blocker. | Later doc/template task should update PR instructions to scoped approval authority. |
| `scripts/loop-runner.sh` | Deletion blocker | Stage 1 fails if `ops/GOVERNOR_APPROVAL.json` is unreadable or its parsed verdict is not `NONE`. | Yes | Next codepath-retirement task must remove or replace this Stage 1 canonical NONE requirement before deletion. |
| `scripts/pre-pr-guard.js` | Compatibility-only dependency | Excludes `ops/GOVERNOR_APPROVAL.json` from pre-PR dirty/scope checks. | No direct deletion blocker. | Remove compatibility exclusion only after manifest is no longer a permitted side-effect path. |
| `scripts/compile-task.js` | Obsolete-but-out-of-scope automation/doc reference | Post-merge checklist still tells CRITICAL/HIGH tasks to confirm the manifest reset to NONE. | No direct deletion blocker. | Later script/docs task should replace stale checklist language. |
| `scripts/verify-sacrificial-equivalence.js` | Historical witness/design reference | Offline T-GOV-29 pre-sacrificial harness still compares scoped diagnostic behavior to manifest authority fixtures. | No | Retain as historical witness harness unless a later test-harness cleanup task scopes removal. |
| `tools/governance/approval-state-resolver.ts` | Historical witness/design reference | Resolver type vocabulary includes `global_manifest` and storage-policy terms for migration modeling. | No | Retain; it documents resolver-era migration semantics. |
| `docs/SNAPSLOT_SENTINEL_CONTRACT.md` | Compatibility-only dependency | Current sections 10.4 and 12 say the manifest is retained, non-authoritative, always exists, and read for compatibility. | No direct deletion blocker, but contract must be updated before deletion. | Later Sentinel-contract task must remove "always exists" and retained-manifest language if deletion is authorized. |
| `docs/SNAPSLOT_SENTINEL_CONTRACT.md` | Documentation stale reference | T-GOV-29 transitional sections 13-16 still say actual witness remains not complete and/or manifest retirement remains later. Section 17 records actual witness completion evidence. | No | Later stale-doc task should reconcile transitional sections without deleting historical meaning. |
| `docs/SNAPSLOT_GOV_RUNBOOK.md` | Documentation stale reference | Mostly reflects scoped approval, but still references both manifest-writing workflows and canonical NONE compatibility state. | No | Later runbook task should remove stale manifest-writing/reset assumptions after codepath retirement. |
| `docs/SNAPSLOT_RISK_POLICY.md` | Documentation stale reference | Says Sentinel may never pass HIGH/CRITICAL without a valid approval manifest and says Governor APPROVE is committed as `ops/GOVERNOR_APPROVAL.json`. | No direct deletion blocker. | Later risk-policy task should update authority model to scoped approval comments. |
| `docs/SNAPSLOT_AUTONOMOUS_LOOP_CONTRACT.md` | Documentation stale reference | Repo re-anchor requires reading `ops/GOVERNOR_APPROVAL.json` as NONE; GitHub control plane text references approval manifest validation. | No direct deletion blocker, but it documents the Stage 1 blocker. | Later contract task should align with the retired Stage 1 behavior after script change. |
| `docs/SNAPSLOT_PHASE_TASKS.md` | Safe-to-retain historical reference | Phase 0.75 section records historical manifest-binding implementation and proof requirements. | No | Retain as historical phase truth; do not edit in this inventory task. |
| `docs/SNAPSLOT_ACCEPTANCE_LEDGER.md` | Safe-to-retain historical reference | Phase 0.75 and T-GOV-24/T-GOV-26 rows mention manifest proof, reset, and earlier T-GOV-29 deferral. | No | Retain historical proof rows; no ledger update is required by this task. |
| `docs/SNAPSLOT_DISCOVERY_REGISTER.md` | Safe-to-retain historical reference | DISC-0009 records the resolved stale-approval gap and Phase 0.75 manifest-bound model. | No | Retain as historical discovery record. |
| `docs/SNAPSLOT_APPROVAL_STATE_ISOLATION_DESIGN.md` | Historical witness/design reference | Design doc describes the old active manifest model, reset workflow, migration path, and non-authorization boundaries. | No | Remain untouched as design history. |
| `docs/SNAPSLOT_APPROVAL_STATE_EQUIVALENCE_WITNESS.md` | Historical witness/design reference | Pre-equivalence witness says manifest authority was active, reset restored canonical NONE, and T-GOV-29 remained paused at that time. | No | Remain untouched as pre-switch witness history. |
| `docs/SNAPSLOT_SACRIFICIAL_EQUIVALENCE_WITNESS.md` | Historical witness/design reference | Pre-sacrificial CI witness says manifest authority remained active and T-GOV-29 actual witness remained not complete. | No | Remain untouched as historical witness. |
| `docs/SNAPSLOT_TGOV26_TOKEN_BUDGET_WITNESS.md` | Safe-to-retain historical reference | Boundary states it did not modify the manifest and did not implement T-GOV-29. | No | Retain as historical witness. |
| `docs/SNAPSLOT_LOOP_RUNNER_WITNESS.md` | Safe-to-retain historical reference | T-GOV-24 witness says no manifest edit was automated by the runner. | No | Retain as historical witness. |
| `docs/SNAPSLOT_TGOV29_ACTUAL_WITNESS.md` | Safe-to-retain historical reference | Current actual witness records scoped approval authority, approval-comment write neutralization, reset neutralization, and canonical NONE on main. | No | Retain as current witness truth; it does not claim manifest retirement. |
| `docs/SNAPSLOT_INTENT_PACKET_COMPILER_DESIGN.md` | Historical witness/design reference | Compiler design references approval manifest verdicts and manifest-touch risk classification as generic governance vocabulary. | No | Retain as design vocabulary unless a later compiler-design cleanup task scopes edits. |
| `ops/TASK_STATE.json` | Safe-to-retain historical reference | Proof record mentions PR #13 manifest model and PR #16 sacrificial proof. | No | Retain as operational history; not in deletion path. |

## Findings by required question

### Sentinel and missing ops/GOVERNOR_APPROVAL.json

Sentinel can tolerate missing `ops/GOVERNOR_APPROVAL.json` in the retained-manifest read path because `.github/workflows/pr-sentinel.yml` catches a 404 and leaves `rawManifest` null. Since `parsedManifest no longer controls governorPassed`, missing manifest does not itself prevent scoped approval authority from passing.

This is not a deletion approval. The Sentinel contract still says the manifest always exists, and other surfaces still depend on it or document it.

### loop-runner Stage 1

`loop-runner Stage 1` still requires canonical NONE. It checks that `ops/GOVERNOR_APPROVAL.json` is readable and then extracts `"verdict"` from it. If the value is not `NONE`, Stage 1 stops. If the file is deleted, Stage 1 stops earlier as unreadable.

This is the strongest active deletion blocker.

### PR template and risk policy

The `PR template` still special-cases the manifest and is stale after T-GOV-29 completion.

The `risk policy` still special-cases the manifest and is stale after T-GOV-29 completion.

Neither file is an active runtime blocker, but both are governance-truth blockers for any honest retirement claim.

### Post-merge reset workflow deletion

`reset workflow deletion` is not claimed safe in this task. The reset workflow is already neutralized and has no active reset behavior, but deletion must be handled by a later governed workflow-deletion task because workflow edits/deletions are out of scope here.

### Stale docs after T-GOV-29 completion

Stale because of T-GOV-29 completion but not direct manifest-deletion blockers:

- `.github/pull_request_template.md`
- `docs/SNAPSLOT_RISK_POLICY.md`
- `docs/SNAPSLOT_SENTINEL_CONTRACT.md` transitional sections 13-16
- `docs/SNAPSLOT_GOV_RUNBOOK.md` remaining manifest-writing/reset wording
- `docs/SNAPSLOT_AUTONOMOUS_LOOP_CONTRACT.md` manifest-validation and Stage 1 contract wording
- `scripts/compile-task.js` generated post-merge checklist wording
- pre-T-GOV-29 witness statements in `docs/SNAPSLOT_APPROVAL_STATE_EQUIVALENCE_WITNESS.md`, `docs/SNAPSLOT_SACRIFICIAL_EQUIVALENCE_WITNESS.md`, and `docs/SNAPSLOT_TGOV26_TOKEN_BUDGET_WITNESS.md` are historical, not current operating instructions.

### Historical witness/design docs to remain untouched

These should remain untouched unless a later governed historical-doc cleanup task explicitly scopes them:

- `docs/SNAPSLOT_APPROVAL_STATE_ISOLATION_DESIGN.md`
- `docs/SNAPSLOT_APPROVAL_STATE_EQUIVALENCE_WITNESS.md`
- `docs/SNAPSLOT_SACRIFICIAL_EQUIVALENCE_WITNESS.md`
- `docs/SNAPSLOT_TGOV26_TOKEN_BUDGET_WITNESS.md`
- `docs/SNAPSLOT_LOOP_RUNNER_WITNESS.md`
- `docs/SNAPSLOT_DISCOVERY_REGISTER.md`
- historical rows in `docs/SNAPSLOT_ACCEPTANCE_LEDGER.md`
- `docs/SNAPSLOT_PHASE_TASKS.md` Phase 0.75 history

## Counts by classification bucket

| Classification bucket | Count |
| --- | ---: |
| Active code dependency | 1 |
| Compatibility-only dependency | 4 |
| Documentation stale reference | 6 |
| Historical witness/design reference | 5 |
| Deletion blocker | 2 |
| Safe-to-retain historical reference | 7 |
| Obsolete-but-out-of-scope automation/doc reference | 2 |

## Active deletion blockers found

Active deletion blockers were found.

The blockers are:

- `ops/GOVERNOR_APPROVAL.json` itself exists as canonical retained compatibility state.
- `scripts/loop-runner.sh` Stage 1 requires the file to exist and requires canonical NONE.

Sentinel's retained read path alone does not block deletion, but the contract/docs around it still need governed alignment before deletion can be honestly claimed.

## Recommended next T-GOV-30 subtask

The next recommended T-GOV-30 subtask is:

`T-GOV-30-LOOP-RUNNER-MANIFEST-CANONICAL-NONE-RETIREMENT`

Reason: `scripts/loop-runner.sh` is the only inspected active codepath that fails if `ops/GOVERNOR_APPROVAL.json` is missing. Retiring or replacing that Stage 1 canonical NONE requirement should precede workflow deletion or manifest deletion. The subtask should be codepath-retirement only, not manifest deletion, and should include contract/runbook follow-up only if explicitly scoped.

## Final non-claim

Manifest retirement is not claimed. Final automation state is not claimed. Deletion is not claimed safe for execution in this task. This inventory is a map for later governed retirement work, not the retirement itself.
