# SnapSlot Sentinel Contract

## 1. Role definition

The Sentinel is the automated enforcement layer in GitHub Actions.

The Sentinel is:
- Orchestrator: runs validation on every PR
- Judge: validates PR template fields, classifies the result, and posts a structured verdict
- Gatekeeper: blocks merge on any failed check or missing required control field

The Sentinel is not:
- the product authority (that is the user)
- the architectural authority (that is the Governor)
- an approver of CRITICAL or HIGH risk changes
- a replacement for Governor review

Sentinel verdicts are one input to the merge decision.
Governor verdict is required for CRITICAL and HIGH risk PRs.

---

## 2. Trigger conditions

The Sentinel runs on:

**pull_request** — types: opened, synchronize, reopened, edited — targeting `main`
- The `edited` trigger ensures PR body changes (task ID, risk level, declared files) are
  re-evaluated immediately without a new commit.

**issue_comment** — types: created — on any issue or PR
- Top-level PR conversation comments are `issue_comment` events in GitHub's API.
  (`pull_request_review_comment` is the separate event for inline diff comments — not used here.)
- The job gate restricts execution to: comments on PRs (`event.issue.pull_request.url` is set)
  whose body contains `GOVERNOR VERDICT`. Ordinary discussion comments do not re-trigger the Sentinel.
- When a Governor verdict comment is posted, the Sentinel re-runs the full validation
  (typecheck + tests) against the PR head SHA, then re-evaluates all checks including Group D.
  This allows a HIGH/CRITICAL PR to turn green immediately after the Governor posts APPROVE
  without requiring a new commit push.

The Sentinel does not run on:
- Direct pushes to main (those are Governor-controlled)
- PRs targeting non-main branches
- Ordinary PR comments that do not contain `GOVERNOR VERDICT`

---

## 3. Mandatory checks (in order)

The Sentinel must run these checks on every PR:

### Group A — Validation checks

**A1. TypeScript typecheck**
Command: `npx tsc --noEmit`
Pass condition: exit code 0
Block on failure: yes

**A2. Full test suite**
Command: `npm test`
Pass condition: exit code 0
Block on failure: yes

### Group B — PR template field checks

The Sentinel inspects the PR body for required control fields.
A PR that does not contain these fields is SENTINEL-FAIL regardless of A1 and A2.

For each Group B check, the Sentinel uses machine-readable HTML comment anchors and section
markers as the primary source (see §10 for the full anchor contract). Visible markdown fields
are used as a fallback only, for PRs authored before the machine-readable layer was introduced.
See §10.3 for the exact parsing precedence.

**B1. Task packet ID**
Primary: machine-readable anchor `<!-- SENTINEL:task_id=... -->` — value must match `T-\S+`
Fallback: `Task ID:` followed by a `T-` prefixed value (not a placeholder comment)
Block on failure: yes

**B2. Risk tier declared**
Primary: machine-readable anchor `<!-- SENTINEL:risk=... -->` — value must be one of `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
Fallback: `Risk level:` followed by one of: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
Block on failure: yes

**B3. Allowed files declaration**
Primary: content between `<!-- SENTINEL:FILES_BEGIN -->` and `<!-- SENTINEL:FILES_END -->` markers — must contain at least one file path line
Fallback: `Files changed` section with at least one line beginning with `- ` or `* ` (not just a placeholder comment)
Block on failure: yes

**B4. Ledger / doc impact declared**
Primary: anchor `<!-- SENTINEL:ledger=NONE -->` with body exactly `None` between `LEDGER_BEGIN` / `LEDGER_END` markers,
or anchor `<!-- SENTINEL:ledger=AFFECTED -->` with a real markdown table (at least one non-placeholder row) between those markers
Fallback: `Ledger impact` section with the word `None` explicitly present, or a real table row not containing placeholder markers
Block on failure: yes

### Group C — Protected-path / risk alignment checks

The Sentinel fetches the complete list of changed files in the PR (paginated) and checks:

**C1. Critical-path risk alignment**
Protected CRITICAL files:
`auth.ts`, `server.ts`, `bookingStore.ts`, `bookingCore.ts`, `Persistence.ts`, `errors.ts`

Rule: If any CRITICAL-path file is changed, the declared risk level must be `CRITICAL`.
Block on failure: yes

**C2. High-path risk alignment**
Protected HIGH files (runtime):
`notificationService.ts`, `public/js/booking-ui.js`, `public/js/admin-ui.js`, `public/js/api.js`

Protected HIGH files (governance control spine — weakening these degrades the enforcement model):
`CLAUDE.md`, `AGENTS.md`, `docs/SNAPSLOT_CONSTITUTION.md`, `docs/SNAPSLOT_SENTINEL_CONTRACT.md`,
`docs/SNAPSLOT_RISK_POLICY.md`, `docs/SNAPSLOT_TASK_PACKET_SCHEMA.md`,
`.github/CODEOWNERS`, `.github/pull_request_template.md`

Protected HIGH path prefix: `.github/workflows/` (all files under this prefix)

Rule: If any HIGH-path file is changed and no CRITICAL-path file is changed,
the declared risk level must be `CRITICAL` or `HIGH`.
Block on failure: yes

**C3. Declared scope vs actual diff — exact equivalence**
The Sentinel parses the file list from between the `FILES_BEGIN` / `FILES_END` section markers
(falling back to the "Files changed" section heading if markers are absent) and compares it
to the actual changed files fetched from the GitHub API.

The comparison is exact in both directions:
- Files in the actual diff but missing from the declared list → scope-drift violation
- Files in the declared list but absent from the actual diff → phantom-scope violation

Both must be empty for the check to pass. A file declared but never changed is as wrong
as an undeclared file that was changed.

Block on failure: yes

If the changed-files API call fails, the Sentinel fails closed — it does not silently pass.

### Group D — Governor verdict checks

Governor verdict comments are scanned at **all risk levels** on every PR.
The rules differ by risk level, but the scan and authentication are universal.

**D1. Verdict authentication and latest-wins rule**

Authentication: Only PR comments from `@certyakbar` are accepted as Governor verdicts.
The GitHub API returns `comment.user.login`, which is controlled by GitHub and cannot
be spoofed by any commenter. A comment from any other account that contains the verdict
pattern is ignored.

Latest wins: All matching authenticated verdict comments are collected across all comment
pages. The comment posted most recently (last in ascending creation order) is used as the
active verdict. This correctly handles:
- BLOCK then APPROVE: the later APPROVE overrides — merge may proceed
- APPROVE then BLOCK: the later BLOCK overrides — merge is blocked
- Single verdict: that verdict is used directly

If the comments API call fails, the Sentinel fails closed — it does not silently pass.

**D2. Governor APPROVE required for CRITICAL and HIGH**
Condition: applies when declared risk level is `CRITICAL` or `HIGH`
Rule: An authenticated Governor APPROVE verdict comment must be present.
If none is found, the PR is SENTINEL-FAIL regardless of other checks.
Block on failure: yes

Pattern for APPROVE: `GOVERNOR VERDICT:` followed by `APPROVE FOR MERGE`
Must appear in a comment from `@certyakbar`.

**D3. Governor BLOCK enforced at all risk levels**
Condition: applies at every risk level, including `MEDIUM` and `LOW`
Rule: If the latest authenticated Governor verdict is a BLOCK, the PR is SENTINEL-FAIL.
A BLOCK overrides any prior APPROVE. A later APPROVE overrides a prior BLOCK.
Block on failure: yes — at every risk level

Pattern for BLOCK: `GOVERNOR VERDICT:` followed by `BLOCK`
Must appear in a comment from `@certyakbar`.

---

## 4. Verdict taxonomy

### SENTINEL-PASS
Conditions: all Group A, B, C, and D checks pass
Meaning: Sentinel has no technical or structural objection
Action: post SENTINEL-PASS comment on PR

### SENTINEL-FAIL
Conditions: any check in Group A, B, C, or D fails
Meaning: PR does not meet the structural or technical minimum
Action: post SENTINEL-FAIL comment listing exact failing checks; mark PR check red

---

## 5. What the Sentinel cannot do

The Sentinel must never:
- Auto-merge a PR
- Override a Governor BLOCK verdict
- Mark a feature as complete
- Suppress test failures
- Paraphrase or summarize test output — it reports pass/fail exactly
- Make assumptions about proof when output is missing
- Pass silently when required data is missing or API calls fail
- Accept Governor verdicts from accounts other than `@certyakbar`
- Use a Governor verdict other than the most recent authenticated one
- Modify any source or governance file
- Store or print secrets

---

## 6. Integration with Governor

### 6.1 APPROVE — scoped approval authority (CRITICAL and HIGH)

For CRITICAL and HIGH risk PRs, both must be true before merge:
1. SENTINEL-PASS
2. A valid authoritative scoped approval PR-comment artifact exists and is bound to the
   current PR HEAD parent commit and tree (see §12)

Scoped approval comments are now authoritative for HIGH/CRITICAL PRs. The Sentinel
validates the latest bot-authored scoped approval artifact before allowing
`governorPassed` to be true.

`ops/GOVERNOR_APPROVAL.json` is retained but non-authoritative. The workflow still
writes and reads it for compatibility and rerun mechanics, but manifest approval alone
cannot pass HIGH/CRITICAL after this switch.

The Governor posts `GOVERNOR VERDICT: APPROVE FOR MERGE` as a PR comment (see format
below). The `governor-manifest-commit` job (triggered by this comment) reads the current
PR HEAD SHA and tree SHA, then commits `ops/GOVERNOR_APPROVAL.json` to the PR branch.
The same job also writes the authoritative scoped approval artifact as a bot-authored PR
comment. The Sentinel validates the scoped approval artifact on the resulting
synchronize event.

For MEDIUM and LOW risk PRs, no manifest is required. SENTINEL-PASS alone is sufficient
for merge, unless a BLOCK comment is present. No scoped approval is required for
MEDIUM or LOW risk PRs.

#### 6.1.1 T-GOV-29 pre-authority switch note

T-GOV-29-PRE-AUTHORITY-SWITCH is the task that performed this authority model switch
in workflow code and contract text. After this task, scoped approval comments are
authoritative for HIGH/CRITICAL PRs; ops/GOVERNOR_APPROVAL.json is retained but
non-authoritative; manifest retirement remains a later task; T-GOV-29 actual witness
remains not complete.

diagnostic_only scoped artifacts do not pass. BLOCK newer than or equal to scoped
approval fails closed. Manifest approval alone cannot pass HIGH/CRITICAL after this
switch.

Implementation notes:
- scoped approval comments are authoritative after this task.
- ops/GOVERNOR_APPROVAL.json is retained but non-authoritative.
- manifest retirement remains a later task.
- T-GOV-29 actual witness remains not complete.
- diagnostic_only scoped artifacts do not pass.
- BLOCK newer than or equal to scoped approval fails closed.
- manifest approval alone cannot pass HIGH/CRITICAL after this switch.

### 6.2 BLOCK — comment-based (all risk levels)

A Governor BLOCK comment from `@certyakbar` overrides scoped approval authority at all
risk levels. BLOCK remains comment-based because a stale BLOCK is conservative (blocks
something that may now be safe) — whereas a stale APPROVE is dangerous (approves
something that may no longer have been reviewed).

Timeline rule: if `scopedApproval.issued_at > latestBlock.created_at`, the scoped
approval is newer and the BLOCK is considered superseded. If the BLOCK is newer than or
equal to scoped approval `issued_at`, it wins and fails closed.

### 6.3 Comment formats

Governor APPROVE format (triggers manifest commit; also serves as audit trail):
```
GOVERNOR VERDICT: APPROVE FOR MERGE
Risk level: [CRITICAL | HIGH | MEDIUM | LOW]
Proof reviewed: yes
Scope clean: yes
```

Governor BLOCK format:
```
GOVERNOR VERDICT: BLOCK — [reason]
Required before merge: [exact action]
```

### 6.4 Governance violations

A merge without a valid authoritative scoped approval artifact on a CRITICAL or HIGH PR
is a governance violation, even if SENTINEL-PASS is present.

A Governor BLOCK on any risk level PR is a governance violation to merge, even if
SENTINEL-PASS is present, because the Sentinel enforces the BLOCK automatically.

---

## 7. CI environment requirements

The reusable-validate.yml workflow requires:
- Runner: ubuntu-latest
- Node.js: 24
- `npm ci` (lockfile-based install — `package-lock.json` exists in this repo)
- `mkdir -p data` before running tests (data/store.json is gitignored; tests write to this dir)
- No external service dependencies — tests must be self-contained

Test runner note:
- Most suites use `node --loader ts-node/esm`
- `tests/payments.test.ts` uses `npx jest` with no jest config file
- Both must pass for a green result
- Node.js 24 is the canonical CI environment; deviations are gaps to surface, not suppress

---

## 8. Sentinel failure is not feature failure

SENTINEL-FAIL means the change broke the test or typecheck contract, or a required PR
field is missing.
It does not mean the underlying feature is broken in production.

If tests were already failing before this PR, the Sentinel will still report SENTINEL-FAIL.
This is correct. Pre-existing failures must be resolved separately.
They must not be masked or suppressed inside the current PR.

---

## 9. Document role

This file is operational control, not product law.
If this file conflicts with docs/SNAPSLOT_CONSTITUTION.md, the Constitution wins.
If this file conflicts with CLAUDE.md, CLAUDE.md wins.


---

## 10. PR template machine-readable anchors

The PR body contains a small machine-readable control layer in HTML comments.
These anchors are the Sentinel's preferred source of truth for Group B checks.

### 10.1 Required anchors

The PR template must contain these exact comment keys:

```html
<!-- SENTINEL:task_id=REPLACE_TASK_ID -->
<!-- SENTINEL:risk=REPLACE_RISK -->
<!-- SENTINEL:ledger=NONE -->
```

Allowed values:

- `task_id`: must match `T-\S+`
- `risk`: one of `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
- `ledger`: one of `NONE`, `AFFECTED`

The Sentinel reads these anchors first.
Legacy visible markdown fields remain in the template for human review and are used only as a fallback during transition.

### 10.2 Section markers

The PR template also contains explicit section markers for machine extraction:

```html
<!-- SENTINEL:FILES_BEGIN -->
<!-- SENTINEL:FILES_END -->
<!-- SENTINEL:LEDGER_BEGIN -->
<!-- SENTINEL:LEDGER_END -->
```

Rules:

- The declared changed-file list must live between `FILES_BEGIN` and `FILES_END`
- The ledger body must live between `LEDGER_BEGIN` and `LEDGER_END`
- If `ledger=NONE`, the ledger body must be exactly `None`
- If `ledger=AFFECTED`, the ledger body must contain a real markdown table with at least one non-placeholder data row

### 10.3 Parser precedence

Group B parsing order:

1. machine-readable anchors / section markers
2. legacy visible markdown fields as fallback only

This keeps the PR readable for the Governor while reducing wording-sensitive failures for honest PRs.

### 10.4 ops/GOVERNOR_APPROVAL.json and scope checks

`ops/GOVERNOR_APPROVAL.json` is the Governor approval manifest (see §12). It is
committed to the PR branch by the `governor-manifest-commit` job (or manually during
bootstrap) and is excluded from both C3 (declared scope vs actual diff) and the Group D
scope binding check.

For B3 (allowed files declaration), `ops/GOVERNOR_APPROVAL.json` may be listed in the
PR body FILES section. When it is listed there, the Sentinel must not count it as a
scope-drift violation or a phantom-scope violation in C3. The C3 exclusion and the
Group D scope-binding exclusion are unchanged.

When `ops/GOVERNOR_APPROVAL.json` is the only file changed in a PR (manifest-only PR),
it must be listed in the FILES section so that B3 is satisfied.

### 10.5 Why HTML comments are used

HTML comments are:

- present in raw PR body text for deterministic parsing
- invisible in the rendered PR view
- resilient to section reordering and prose edits
- part of the light machine-readable layer that complements the committed manifest

---

## 11. Branch protection and check-run requirements

Repo files alone do not create a hard merge gate.
SnapSlot enforcement is only real when GitHub branch protection (or an equivalent ruleset) is configured on `main`.

### 11.1 Required repository settings

At minimum, `main` must enforce:

- Require a pull request before merging
- Require status checks to pass before merging
- Do not allow bypassing the above settings
- Block force pushes
- Block deletions

**One-owner repo note:** Required approving reviews and Code Owner review enforcement are not
active in this repository. In a one-owner repo, the sole owner (`@certyakbar`) cannot approve
their own pull requests; requiring approving reviews creates an unresolvable deadlock — there is
no eligible reviewer to request. This was discovered empirically during the sacrificial proof
exercise and the branch protection configuration was adjusted to remove required approving reviews.
The active hard merge gate is the required Sentinel status check, not approving reviews.

### 11.2 Required status check name

The required status check name is set by the `sentinel-judge` job in `.github/workflows/pr-sentinel.yml`
and by the explicit Checks API call in the comment-trigger path.

- Required check name: **`Sentinel verdict`**

This name was empirically verified during the sacrificial proof exercise: the `Sentinel verdict` check
turned green when a Governor APPROVE comment was posted and turned red when a Governor BLOCK comment
was posted. The comment-trigger path explicitly creates a Checks API run with this exact name on the
PR head SHA so that branch protection is satisfied.

Any workflow/job rename that changes the live check name must be treated as a governance change and must be synchronized with GitHub branch protection settings.

### 11.3 Comment-triggered rechecks

`issue_comment` workflows do not naturally attach their implicit workflow check to the PR head SHA.
To keep Governor verdict comments operationally useful, the Sentinel uses the Checks API from the comment-trigger path.

Required conditions:

- workflow permission `checks: write`
- PR head SHA fetched explicitly from the PR API
- explicit check run created with the canonical Sentinel check name on that PR head SHA

Without this, a Governor APPROVE comment can re-run the Sentinel but still fail to satisfy branch protection.

### 11.4 Enforcement proof required

Before the system may be called hardened, SnapSlot must prove all of the following on a sacrificial test PR:

- malformed governance metadata fails
- valid governance metadata passes
- a HIGH or CRITICAL PR without Governor APPROVE stays blocked
- a Governor APPROVE comment produces a passing Sentinel check on the correct PR head SHA
- a Governor BLOCK comment forces failure at any risk level
- branch protection prevents even `@certyakbar` from merging a failing PR

---

## 12. Scoped approval binding and retained manifest

### 12.1 Purpose

Scoped approval PR-comment artifacts are the active machine-readable source of truth
for Governor APPROVE verdicts on CRITICAL and HIGH risk PRs. They eliminate the
TOCTOU (stale-approval) gap by binding approval to the exact parent commit SHA and
tree SHA at the moment of approval.

`ops/GOVERNOR_APPROVAL.json` is retained but non-authoritative. Manifest write is
retained for compatibility. Manifest read is retained but non-authoritative. Manifest
approval alone cannot pass HIGH/CRITICAL after this switch.

### 12.2 Retained manifest and scoped approval schema

```json
{
  "schema_version": "1",
  "verdict": "APPROVE | NONE",
  "governor_login": "certyakbar",
  "pr_number": 42,
  "approved_parent_sha": "<SHA of the HEAD commit that was reviewed>",
  "approved_tree_sha": "<tree SHA of the reviewed HEAD commit>",
  "risk_tier": "HIGH",
  "task_id": "T-xxx",
  "declared_files": ["file1.ts", "file2.ts"],
  "ledger_state": "NONE | AFFECTED",
  "issued_at": "2026-04-07T12:00:00Z"
}
```

`ops/GOVERNOR_APPROVAL.json` always exists in the repository. When no approval is active,
`verdict` is `"NONE"` and all binding fields are `null`. The `governor-manifest-commit`
job overwrites it with `verdict: "APPROVE"` when the Governor posts an APPROVE comment.
The job also writes a scoped approval PR-comment artifact with the same binding fields,
`storage_backend: "github_pr_comment"`, `repository_persistent: false`, and
`authority: "authoritative"`. Diagnostic_only scoped artifacts do not pass.

### 12.3 Binding validation algorithm

When `sentinel-judge` runs on a CRITICAL or HIGH risk PR it executes:

1. Read `ops/GOVERNOR_APPROVAL.json` for compatibility. This read is retained but
   non-authoritative.
2. Use native Octokit pagination to read PR comments before selecting the latest
   bot-authored scoped approval artifact.
3. Require the scoped approval comment author to be an allowed bot login.
4. Parse the scoped approval artifact. If absent or malformed → no approval → FAIL.
5. Check `scopedApproval.authority === 'authoritative'`. If `diagnostic_only` or any
   other value → FAIL.
6. Fetch the current HEAD commit. Get `parentSha = headCommit.parents[0].sha`.
7. **Parent SHA binding**: `scopedApproval.approved_parent_sha === parentSha`.
   If not equal, code was pushed after approval → FAIL.
8. Fetch the parent commit. Get `parentCommit.tree.sha`.
9. **Tree SHA binding**: `scopedApproval.approved_tree_sha === parentCommit.tree.sha`.
   Defense-in-depth against state mutation → FAIL if mismatch.
10. **PR binding**: `scopedApproval.pr_number === current PR number` → FAIL if mismatch.
11. **Identity binding**: `scopedApproval.governor_login === 'certyakbar'` → FAIL if mismatch.
12. **Risk binding**: `scopedApproval.risk_tier === declared risk level` → FAIL if mismatch.
13. **Task binding**: `scopedApproval.task_id === declared task ID` → FAIL if mismatch.
14. **Ledger binding**: `scopedApproval.ledger_state === declared ledger state` → FAIL if mismatch.
15. **Scope binding**: `scopedApproval.declared_files` (excluding `ops/GOVERNOR_APPROVAL.json`)
    must exactly match `changedFilesForScope` (actual diff minus `ops/GOVERNOR_APPROVAL.json`),
    both directions. Undeclared files in diff or phantom files in manifest → FAIL.
16. Validate `scopedApproval.issued_at`. Missing or invalid timestamp → FAIL.
17. Scan for BLOCK comments. If latest BLOCK is newer than or equal to
    `scopedApproval.issued_at`, BLOCK overrides → FAIL.

If all checks pass → `governorPassed = SCOPED_APPROVAL_AUTHORITY_PASSED`.

### 12.4 Invalidation conditions

The scoped approval artifact is automatically invalidated (without any Governor action)
when:

- Any commit is pushed after the approval artifact is issued (parent SHA check fails)
- The PR is retargeted or the approval artifact is tampered with (tree SHA check fails)
- The PR number changes (approval artifact used on a different PR)
- The risk tier is changed in the PR body after approval
- The task ID is changed in the PR body after approval
- The ledger state is changed in the PR body after approval
- The declared scope changes in the PR body after approval
- A BLOCK comment is posted at or after the scoped approval artifact's `issued_at`

### 12.5 How the Governor approves a PR

1. Governor reviews the PR at the current HEAD commit.
2. Governor posts a comment containing `GOVERNOR VERDICT: APPROVE FOR MERGE`.
3. The `governor-manifest-commit` job (triggered by the `issue_comment` event, using the
   main branch workflow) reads the current PR HEAD SHA and tree SHA, parses `task_id`,
   `risk`, and `declared_files` from the PR body, and commits `ops/GOVERNOR_APPROVAL.json`
   with `approved_parent_sha = current HEAD SHA`.
4. The same job writes an authoritative scoped approval PR-comment artifact with the
   same binding fields.
5. The manifest commit produces a `pull_request synchronize` event.
6. `sentinel-judge` runs on the new SHA and validates the scoped approval artifact.

### 12.6 Bootstrap note

For the Phase 0.75 PR (the PR that introduces this manifest model), the Governor manually
committed `ops/GOVERNOR_APPROVAL.json` directly to the PR branch because the
`governor-manifest-commit` job did not yet exist on main's workflow. This is the only PR
approved via manual manifest creation. All subsequent CRITICAL/HIGH approvals use the
automated `governor-manifest-commit` job triggered by the APPROVE comment.

### 12.7 BLOCK does not use a manifest

BLOCK verdicts remain comment-based. A BLOCK is a conservative veto — a stale BLOCK
(blocks a now-safe PR) is less harmful than a stale APPROVE (allows an unreviewed diff).
The timeline rule in §6.2 ensures a newer APPROVE manifest supersedes an older BLOCK.
