# SnapSlot Sacrificial Equivalence CI Witness

Task: T-GOV-29-PRE-SACRIFICIAL-EQUIVALENCE-CI-WITNESS

This witness records the CI wiring step for the pre-sacrificial equivalence harness.

## Scope

`package.json` now wires `node scripts/verify-sacrificial-equivalence.js` into `npm test`.

Execution proof is not the prose document itself; execution proof is local Stage 8 and Sentinel Group A running `npm test`.

This is not the authority switch. There is no authority switch in this witness.

`ops/GOVERNOR_APPROVAL.json remains authoritative`.

`scoped approval comments remain diagnostic-only`.

## Harness Witness Cases

The following witness cases are documented as CI-enforced through the harness:

- `no_approval_high`
- `no_approval_critical`
- `valid_approval_passes`
- `push_after_approval_stales`
- `risk_change_fails`
- `declared_files_scope_change_fails`
- `tree_mismatch_fails`
- `pr_mismatch_fails`
- `governor_login_mismatch_fails`
- `block_newer_than_approval_fails`
- `timestamp_equality_fails_closed`
- `missing_scoped_artifact_indeterminate`
- `malformed_scoped_artifact_indeterminate`
- `non_bot_scoped_artifact_ignored`

The `npm test` invariant is:

`scoped_diagnostic_would_pass == manifest_authority_pass` for every non-INDETERMINATE case.

INDETERMINATE cases are diagnostic-only and do not approve or fail a PR.

A future harness failure exits non-zero and fails `npm test`.

## Non-Claims

T-GOV-29 actual witness remains not complete.

There is no manifest retirement readiness claimed here and no manifest retirement.

The live PR matrix was not executed.

This document does not claim Sentinel Group A PASS.

This document does not claim Stage 8 PASS.

This document does not claim authority-switch readiness.

This document does not claim T-GOV-29 completion.
