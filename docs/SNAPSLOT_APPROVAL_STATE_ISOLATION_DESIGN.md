# SnapSlot Approval State Isolation Design

Task ID: `T-GOV-29-PRE-APPROVAL-STATE-DESIGN`

This document is design governance only. It does not implement approval state changes, replace `ops/GOVERNOR_APPROVAL.json`, edit workflows, edit scripts, edit schemas, edit registries, edit product code, edit tests, approve a PR, mark a PR ready for merge, or merge.

T-GOV-29 witness remains paused.

## 1. Purpose

The current Governor approval model uses one committed repository file, `ops/GOVERNOR_APPROVAL.json`, as the machine-readable source of truth for HIGH and CRITICAL approval. That model proves stale-approval protection by binding an approval to the reviewed commit and invalidating it after a later push.

The weakness is not the binding algorithm. The weakness is approval-state locality: a single global file on a branch is used to represent approval for a specific PR review event. This design defines a migration path to PR scoped approval state, or run scoped approval state, without weakening parent sha binding, tree sha binding, PR number binding, governor login binding, risk tier binding, declared files binding, stale approval invalidation, or BLOCK comment override behavior.

## 2. Current Roles To Preserve

### 2.1 `ops/GOVERNOR_APPROVAL.json`

Current role:

- It is the committed Governor approval manifest.
- It always exists in the repository.
- `verdict: "NONE"` means no active approval.
- `verdict: "APPROVE"` means a HIGH or CRITICAL PR has an active approval only if every binding check passes.
- It stores `governor_login`, `pr_number`, `approved_parent_sha`, `approved_tree_sha`, `risk_tier`, `task_id`, `declared_files`, `ledger_state`, and `issued_at`.
- Sentinel reads it from the current PR HEAD for HIGH and CRITICAL PRs.
- Sentinel excludes `ops/GOVERNOR_APPROVAL.json` from declared-scope comparison because the manifest commit is Governor-controlled approval state, not task implementation scope.

The file is therefore approval state, not local run proof state and not product state.

### 2.2 Governor manifest commit workflow

Current role:

- The `governor-manifest-commit` job in `.github/workflows/pr-sentinel.yml` runs from `issue_comment` only when the comment is on a PR, is authored by `certyakbar`, and contains `GOVERNOR VERDICT`.
- On `GOVERNOR VERDICT: APPROVE FOR MERGE`, it fetches the PR head SHA and tree SHA, parses Sentinel metadata from the PR body, writes `ops/GOVERNOR_APPROVAL.json` with approval bindings, and commits that manifest to the PR branch.
- The manifest commit creates a real `pull_request synchronize` event.
- On `GOVERNOR VERDICT: BLOCK`, it does not create a manifest; it pushes an empty commit with the same tree to force Sentinel to re-read the authenticated BLOCK comment.

The workflow currently turns a human Governor comment into committed branch-local approval state.

### 2.3 Sentinel verdict workflow

Current role:

- The `sentinel-judge` job in `.github/workflows/pr-sentinel.yml` runs on pull request events targeting `main`.
- It evaluates validation, PR metadata, risk alignment, declared scope versus actual diff, and Governor approval rules.
- For HIGH and CRITICAL risk, it requires a valid approval manifest.
- It checks the manifest against the current PR HEAD's parent commit and that parent's tree.
- It checks PR number, Governor login, risk tier, and declared files.
- It scans authenticated Governor BLOCK comments from `certyakbar` at all risk levels.
- A newer BLOCK comment overrides approval state; an approval manifest whose `issued_at` is newer than the latest BLOCK supersedes that older BLOCK.

The Sentinel verdict workflow is the merge-gate judge. It must remain fail-closed.

### 2.4 Post merge manifest reset workflow

Current role:

- `.github/workflows/post-merge-manifest-reset.yml` runs when a PR targeting `main` is closed and merged.
- It reads `ops/GOVERNOR_APPROVAL.json` on `main`.
- If the manifest is already canonical `NONE`, it exits without a commit.
- If the manifest is not canonical `NONE`, it commits the canonical `NONE` object back to `main` with the Governor App token.

The reset workflow cleans global approval residue after merge. It exists because the current model stores approval in a repository-global path that can land on `main`.

## 3. State Separation

Approval state and local run proof must stay separate.

Local run proof isolation:

- Belongs to runner proof files, terminal output, validation logs, or PR body evidence.
- Proves what a local or CI execution did.
- Must not grant merge approval.
- Must not mutate `ops/GOVERNOR_APPROVAL.json`.
- Must not override Sentinel or Governor authority.

Merge approval state:

- Belongs to a Governor-controlled approval artifact.
- Applies only to a specific PR review state.
- Must be validated by Sentinel at merge-gate time.
- Must preserve commit, tree, PR, identity, risk, and scope bindings.
- Must be invalidated automatically when the reviewed state changes.

A safe design may move approval state out of `ops/GOVERNOR_APPROVAL.json`, but it must not merge it into local proof state.

## 4. Target Design Options

### 4.1 PR scoped approval state

PR scoped approval state stores the approval artifact under a namespace that includes the PR number, for example an internal approval record keyed as:

- `repository`
- `pr_number`
- `approved_parent_sha`
- `approved_tree_sha`
- `governor_login`
- `risk_tier`
- `task_id`
- `declared_files`
- `ledger_state`
- `issued_at`

The storage can be a GitHub-native PR-bound artifact, check-run output, deployment/status metadata, or a future committed path whose pathname includes the PR number. The design requirement is locality: approval for PR #A must be unusable for PR #B by construction and by validation.

### 4.2 Run scoped approval state

Run scoped approval state stores the approval artifact under a specific Governor approval run or workflow run identity, then links it back to the PR number and reviewed commit.

Required keys are the same as PR scoped approval state, with additional run identity:

- `approval_run_id`
- `approval_attempt`
- `workflow_sha` or equivalent workflow provenance

Run scoped state is useful if the Governor approval action should be immutable per approval attempt. Sentinel still must resolve the latest valid approval for the PR and reject any stale approval after a push.

## 5. Binding Requirements

Any replacement for the current global manifest must preserve these bindings exactly.

### 5.1 parent sha binding

The approval artifact must store the exact PR HEAD SHA reviewed by the Governor as `approved_parent_sha` or an equivalent field.

Sentinel must validate the current PR HEAD's first parent against that stored SHA when approval is represented by a follow-up approval commit. If approval is stored outside the branch and no approval commit is added, Sentinel must instead validate that the current PR HEAD SHA equals the reviewed SHA. The invariant is the same: any code push after approval changes the SHA relationship and requires re-approval.

### 5.2 tree sha binding

The approval artifact must store the tree SHA of the reviewed commit.

Sentinel must fetch the reviewed commit and compare its tree SHA to the stored `approved_tree_sha` or equivalent. This remains a defense-in-depth check that the reviewed repository state is exactly the state represented by the approval.

### 5.3 PR number binding

The approval artifact must store the PR number.

Sentinel must compare the stored PR number to the current PR number. Approval state for one PR must never validate another PR, even if branches or commits are reused.

### 5.4 governor login binding

The approval artifact must store the authenticated Governor login.

Sentinel must compare the stored login to the required Governor login, currently `certyakbar`. User-supplied text in a comment body is not identity proof; only GitHub-controlled actor identity may be used.

### 5.5 risk tier binding

The approval artifact must store the declared risk tier at the time of approval.

Sentinel must compare that value to the current PR body risk tier. If the risk tier changes after approval, the approval is stale and must fail.

### 5.6 declared files binding

The approval artifact must store the declared files reviewed by the Governor, excluding the approval-state artifact itself when the artifact is branch-committed.

Sentinel must compare stored declared files to the current actual diff scope in both directions. Files in the diff but absent from approval state and files in approval state but absent from the diff both invalidate approval.

## 6. Staleness And BLOCK Rules

stale approvals must be invalidated after any push.

For branch-committed approval artifacts, this is preserved by the current parent SHA model: the approval commit's parent is the reviewed commit. Any later push makes the current HEAD parent different from the stored reviewed SHA, so Sentinel fails and requires re-approval.

For non-committed PR scoped or run scoped artifacts, Sentinel must compare the current PR HEAD SHA directly to the stored reviewed SHA. Any synchronize event that changes the PR HEAD SHA after approval makes the stored approval stale.

BLOCK comments continue to override unsafe approval states:

- Authenticated `GOVERNOR VERDICT: BLOCK` comments from `certyakbar` must be scanned at all risk levels.
- BLOCK remains comment-based because a stale BLOCK is conservative and cannot approve unreviewed code.
- If the latest BLOCK is newer than the approval artifact `issued_at`, Sentinel must fail.
- If a later valid approval artifact is newer than the latest BLOCK, Sentinel may treat that BLOCK as superseded.
- API failure while scanning BLOCK comments must fail closed.

## 7. Safe Migration Path

The migration must be additive before it is substitutive.

1. Introduce read-only design and tests for the new approval artifact resolver.
2. Add a Sentinel-compatible parser for PR scoped or run scoped approval state while keeping `ops/GOVERNOR_APPROVAL.json` as the active authority.
3. Add dual-read diagnostics: Sentinel can report whether the new scoped state would pass, but merge gating still depends on the existing manifest.
4. Add dual-write from the Governor approval path: write the existing manifest and the new scoped approval state in the same approval event.
5. Prove equivalence on sacrificial PRs: no approval fails, valid approval passes, push after approval fails, risk change fails, scope change fails, PR number mismatch fails, Governor login mismatch fails, tree mismatch fails, and BLOCK override fails.
6. Switch Sentinel authority to the scoped approval state only after equivalence proof is reviewed.
7. Keep writing `ops/GOVERNOR_APPROVAL.json` as a compatibility artifact for at least one transition window with `verdict: NONE` on `main`.
8. Remove or demote the global manifest only after a separate authorized task explicitly allows replacement.

`ops/GOVERNOR_APPROVAL.json` replacement is not authorized by this task.

Workflow edits are not authorized by this task.

## 8. Implementation sequence

The implementation sequence must be split into atomic packets:

1. Design packet: create this document only. No implementation.
2. Resolver packet: add a pure approval-state resolver module and tests, with no workflow edits and no authority switch.
3. Sentinel diagnostic packet: add non-gating diagnostic output for scoped approval state.
4. Governor write packet: add scoped approval state write support while preserving current manifest behavior.
5. Equivalence witness packet: run sacrificial PR checks proving current manifest and scoped approval state agree.
6. Authority switch packet: make scoped approval state authoritative only after proof and Governor approval.
7. Manifest retirement packet: remove or neutralize global manifest behavior only if separately authorized.

Each packet must declare exact files, forbidden files, validation, and stop rules. Any packet that edits workflows, schemas, scripts, approval manifests, product files, or tests must be separately scoped and risk-classified.

## 9. Non-Authorization Boundary

This task authorizes only this design file.

Not authorized:

- replacing `ops/GOVERNOR_APPROVAL.json`
- editing `.github/workflows/pr-sentinel.yml`
- editing `.github/workflows/post-merge-manifest-reset.yml`
- editing any workflow
- editing scripts
- editing schemas
- editing registries
- editing product files
- editing tests
- implementing PR scoped approval state
- implementing run scoped approval state
- claiming approval state isolation is implemented
- claiming T-GOV-29 is complete
- claiming Sentinel final PASS
- marking ready for merge
- merging

T-GOV-29 witness remains paused.
