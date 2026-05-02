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
For CRITICAL and HIGH PRs, scoped approval PR-comment artifacts are now the
active authority. `ops/GOVERNOR_APPROVAL.json` is retained but non-authoritative.

**D1. Scoped approval authentication and binding rule**

Authentication: only scoped approval artifact comments from configured bot identities
are accepted for CRITICAL/HIGH approval authority. The GitHub API returns
`comment.user.login`, which is controlled by GitHub and cannot be spoofed by any
commenter. A comment from any other account that contains a scoped artifact marker is
ignored for active approval authority.

The latest bot-authored scoped approval artifact is the candidate authority. It passes
only when it is `authority: "authoritative"`, targets the current PR, matches
`GOVERNOR_LOGIN`, risk, task ID, ledger state, exact changed-file scope, parent SHA,
parent tree SHA, and has a valid `issued_at`.

If the comments API call fails, the Sentinel fails closed — it does not silently pass.

**D2. Governor APPROVE required for CRITICAL and HIGH**
Condition: applies when declared risk level is `CRITICAL` or `HIGH`
Rule: A valid authoritative scoped approval PR-comment artifact must be present.
If none is found, the PR is SENTINEL-FAIL regardless of other checks.
Block on failure: yes

`diagnostic_only` scoped artifacts are rejected by executable Sentinel logic.

**D3. Governor BLOCK enforced at all risk levels**
Condition: applies at every risk level, including `MEDIUM` and `LOW`
Rule: A Governor BLOCK comment from `@certyakbar` is always scanned and enforced.
If the latest BLOCK timestamp is newer than or equal to the scoped approval `issued_at`,
the PR is SENTINEL-FAIL. Equal timestamp fails closed.
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

### 6.1 APPROVE — scoped-comment-bound (CRITICAL and HIGH)

For CRITICAL and HIGH risk PRs, both must be true before merge:
1. SENTINEL-PASS
2. A valid authoritative scoped approval PR-comment artifact exists for the current PR

scoped approval comments are authoritative. `ops/GOVERNOR_APPROVAL.json` is retained
but non-authoritative for active HIGH/CRITICAL approval. The Sentinel still reads the
manifest from PR HEAD for write/reset compatibility, but manifest approval alone cannot
pass HIGH/CRITICAL.

The Governor posts `GOVERNOR VERDICT: APPROVE FOR MERGE` as a PR comment (see format
below). The `governor-manifest-commit` job (triggered by this comment) reads the current
PR HEAD SHA and tree SHA, posts the authoritative scoped approval artifact, then pushes
a same-tree synchronize-trigger commit. The Sentinel validates the scoped approval
artifact on the resulting synchronize event.

For MEDIUM and LOW risk PRs, no scoped approval artifact is required. SENTINEL-PASS alone
is sufficient for merge, unless a BLOCK comment is present.

### 6.2 BLOCK — comment-based (all risk levels)

A Governor BLOCK comment from `@certyakbar` overrides scoped approval at all risk
levels. BLOCK remains comment-based because a stale BLOCK is conservative (blocks
something that may now be safe) — whereas a stale APPROVE is dangerous (approves
something that may no longer have been reviewed).

Timeline rule: if `scopedApproval.issued_at > latestBlock.created_at`, the scoped approval
is newer and the BLOCK is considered superseded. If the BLOCK is newer than or equal to
the scoped approval, it wins.

### 6.3 Comment formats

Governor APPROVE format (triggers scoped approval artifact and synchronize commit; also serves as audit trail):
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

`ops/GOVERNOR_APPROVAL.json` is the retained Governor approval manifest (see §12). It is
retained for compatibility, no longer written by approval comments, and excluded from
both C3 (declared scope vs actual diff) and the Group D scope binding check.

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

## 12. Retained approval manifest binding

### 12.1 Purpose

`ops/GOVERNOR_APPROVAL.json` is the retained committed manifest for compatibility with
the existing `governor-manifest-commit` writer and post-merge reset mechanics. It is no
longer the active approval authority for CRITICAL and HIGH risk PRs.

The active authority is the scoped approval PR-comment artifact, which binds approval to
the exact parent commit SHA and tree SHA at the moment of approval. Any subsequent commit
automatically invalidates scoped approval because the current HEAD parent no longer
matches the approved parent SHA.

### 12.2 Manifest schema

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
`verdict` is `"NONE"` and all binding fields are `null`. Approval comments no longer
overwrite it.

### 12.3 Retained manifest read algorithm

When `sentinel-judge` runs, it still attempts to fetch `ops/GOVERNOR_APPROVAL.json` from
the current PR HEAD via the Contents API for write/reset compatibility. The parsed
manifest does not set `governorPassed = true` for any risk tier.

Current CRITICAL/HIGH approval binding is validated from the scoped approval artifact:

1. Comment author must be an accepted scoped approval bot.
2. `artifact.authority === "authoritative"`.
3. `artifact.pr_number === current PR number`.
4. `artifact.governor_login === "certyakbar"`.
5. `artifact.risk_tier === declared risk level`.
6. `artifact.task_id === declared task ID`.
7. `artifact.ledger_state === declared ledger state`.
8. `artifact.declared_files` must exactly match `changedFilesForScope` in both directions.
9. `artifact.approved_parent_sha === parent SHA of current PR HEAD`.
10. `artifact.approved_tree_sha === tree SHA of that parent commit`.
11. `artifact.issued_at` must be a valid date.

If all scoped checks pass and no newer-or-equal BLOCK applies, `governorPassed = true`.

### 12.4 Invalidation conditions

The scoped approval artifact is automatically invalidated (without any Governor action) when:

- Any commit is pushed after the synchronize-trigger commit (parent SHA check fails)
- The PR is retargeted or the manifest is tampered with (tree SHA check fails)
- The PR number changes (scoped approval used on a different PR)
- The risk tier is changed in the PR body after approval
- The declared scope changes in the PR body after approval
- A BLOCK comment is posted at or after the scoped approval `issued_at`

### 12.5 How the Governor approves a PR

1. Governor reviews the PR at the current HEAD commit.
2. Governor posts a comment containing `GOVERNOR VERDICT: APPROVE FOR MERGE`.
3. The `governor-manifest-commit` job (triggered by the `issue_comment` event, using the
   main branch workflow) reads the current PR HEAD SHA and tree SHA, parses `task_id`,
   `risk`, and `declared_files` from the PR body.
4. The job posts an authoritative scoped approval PR-comment artifact with
   `approved_parent_sha = current HEAD SHA` and `approved_tree_sha = current tree SHA`.
5. The job pushes a same-tree synchronize-trigger commit, producing a `pull_request synchronize` event.
6. `sentinel-judge` runs on the new SHA, validates the scoped approval artifact → SENTINEL-PASS.

### 12.6 Bootstrap note

For the Phase 0.75 PR (the PR that introduces this manifest model), the Governor manually
committed `ops/GOVERNOR_APPROVAL.json` directly to the PR branch because the
`governor-manifest-commit` job did not yet exist on main's workflow. This is the only PR
approved via manual manifest creation. All subsequent CRITICAL/HIGH approvals use the
automated `governor-manifest-commit` job triggered by the APPROVE comment to post scoped
approval state and push the synchronize-trigger commit.

### 12.7 BLOCK does not use a manifest

BLOCK verdicts remain comment-based. A BLOCK is a conservative veto — a stale BLOCK
(blocks a now-safe PR) is less harmful than a stale APPROVE (allows an unreviewed diff).
The timeline rule in §6.2 ensures a newer APPROVE manifest supersedes an older BLOCK.

---

## 13. T-GOV-29 Transitional authority state (T-GOV-29-PRE-AUTHORITATIVE-SCOPED-WRITE-PATH)

scoped writer now emits authority: authoritative.

The Sentinel diagnostic reader now accepts both diagnostic_only and authoritative as parseable states.
Neither scoped approval diagnostic state controls governorPassed, sentinelPassed, or allPassed.

scoped artifacts remain non-gating until authority switch.
ops/GOVERNOR_APPROVAL.json remains active authority.

snapslot-governor[bot] is the writer bot identity that must remain in SCOPED_APPROVAL_COMMENT_AUTHOR_LOGINS.

PR #93 authority switch remains blocked until this writer-path task is merged.
manifest retirement remains a later task.
T-GOV-29 actual witness remains not complete.
diagnostic_only was the PR #93 bootstrap blocker.

---

## 14. T-GOV-29-PRE-AUTHORITY-SWITCH

scoped approval comments are authoritative.

ops/GOVERNOR_APPROVAL.json is retained but non-authoritative.

manifest retirement remains a later task.

T-GOV-29 actual witness remains not complete.

diagnostic_only scoped artifacts do not pass.

BLOCK newer than or equal to scoped approval fails closed.

manifest approval alone cannot pass HIGH/CRITICAL.

## 15. T-GOV-29-PRE-MANIFEST-WRITE-NEUTRALIZATION

scoped approval comments are authoritative.

approval comments no longer write ops/GOVERNOR_APPROVAL.json.

approval comments still push a synchronize-trigger commit.

ops/GOVERNOR_APPROVAL.json is retained but non-authoritative.

post-merge reset workflow retirement remains a later task.

manifest retirement remains not fully complete.

T-GOV-29 actual witness remains not complete.

## 16. T-GOV-29-PRE-POST-MERGE-RESET-NEUTRALIZATION

reset workflow neutralized.

The post-merge reset workflow will no longer write ops/GOVERNOR_APPROVAL.json.

ops/GOVERNOR_APPROVAL.json is retained but non-authoritative.

scoped approval comments are authoritative.

actual witness remains not complete.

## 17. T-GOV-29-ACTUAL-WITNESS

scoped approval comments are authoritative for HIGH/CRITICAL approval.

PR #97 is the strongest live proof of the current approval path: an authoritative scoped approval PR-comment artifact was posted, Sentinel accepted it, Sentinel reported PASS, and PR #97 merged.

PR #95 and PR #96 are prior enabling evidence for the authority switch and approval-comment write neutralization.

ops/GOVERNOR_APPROVAL.json is retained but non-authoritative.

approval comments no longer write ops/GOVERNOR_APPROVAL.json.

post-merge reset workflow is neutralized.

ops/GOVERNOR_APPROVAL.json is canonical NONE on main after merge.

T-GOV-29 actual witness is complete only if this PR merges and main is re-anchored afterward.

BLOCK remains fail-closed: a Governor BLOCK comment newer than or equal to scoped approval keeps Sentinel failed.

Local validation can verify repo-file truth. PR #97 comment history remains Governor/operator-attested GitHub evidence unless a future registry command can verify PR comments.
