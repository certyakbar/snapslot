# T-GOV-29 Actual Witness

Task ID: T-GOV-29-ACTUAL-WITNESS

## Witness status

T-GOV-29 actual witness is complete only if this PR merges and main is re-anchored afterward.

This witness records current repo-file truth plus Governor/operator-attested GitHub evidence for the scoped approval path. It does not claim manifest retirement.

## Actual witness evidence

PR #97 is the strongest live proof of the new approval path. PR #97 demonstrated the new approval path end-to-end: HIGH-risk scoped approval was emitted as a bot-authored PR comment artifact, Sentinel accepted that scoped approval, and Sentinel reported PASS before the PR merged.

PR #95 and PR #96 are prior enabling evidence. PR #95 switched HIGH/CRITICAL authority to scoped approval comments. PR #96 neutralized approval-comment writes to the retained manifest path. PR #97 then exercised the path after post-merge reset neutralization.

scoped approval comments are authoritative for HIGH/CRITICAL approval.

ops/GOVERNOR_APPROVAL.json is retained but non-authoritative.

approval comments no longer write ops/GOVERNOR_APPROVAL.json.

post-merge reset workflow is neutralized.

ops/GOVERNOR_APPROVAL.json is canonical NONE on main after merge.

## Fail-closed behavior

BLOCK remains enforced at all risk levels. A Governor BLOCK comment newer than or equal to the scoped approval timestamp fails closed. Missing, stale, malformed, mismatched, non-authoritative, or non-bot scoped approval evidence fails closed for HIGH and CRITICAL approval.

## Witness limitation

Local validation can verify repo-file truth, but PR #97 comment history is Governor/operator-attested GitHub evidence unless a future registry command can verify PR comments.
