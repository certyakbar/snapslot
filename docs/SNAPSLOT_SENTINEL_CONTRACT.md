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

**B1. Task packet ID**
Pattern: `Task ID:` followed by a `T-` prefixed value (not a placeholder comment)
Block on failure: yes

**B2. Risk tier declared**
Pattern: `Risk level:` followed by one of: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
Block on failure: yes

**B3. Allowed files declaration**
Pattern: `Files changed` section with at least one line beginning with `- ` or `* `
(not just a placeholder comment)
Block on failure: yes

**B4. Ledger / doc impact declared**
Pattern: `Ledger impact` section present and the placeholder row is replaced with real content
or the word `None` explicitly appears in the section
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
The Sentinel parses the file list from the "Files changed" section of the PR body and
compares it to the actual changed files fetched from the GitHub API.

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

For CRITICAL and HIGH risk PRs, both must be true before merge:
1. SENTINEL-PASS
2. Governor posts explicit APPROVE verdict as a PR comment from `@certyakbar`

For MEDIUM and LOW risk PRs, SENTINEL-PASS alone is sufficient for merge, unless the
Governor has posted a BLOCK comment — a Governor BLOCK fails the PR at all risk levels.

Governor verdict is a PR comment, not embedded in the PR body. The Sentinel scans all
comments, verifies the author is `@certyakbar`, collects all matching verdict comments,
and uses the latest one as the active verdict.

Governor APPROVE format (must appear verbatim in a PR comment from `@certyakbar`):
```
GOVERNOR VERDICT: APPROVE FOR MERGE
Risk level: [CRITICAL | HIGH | MEDIUM | LOW]
Proof reviewed: yes
Scope clean: yes
```

Governor BLOCK format (must appear verbatim in a PR comment from `@certyakbar`):
```
GOVERNOR VERDICT: BLOCK — [reason]
Required before merge: [exact action]
```

A merge without Governor APPROVE on a CRITICAL or HIGH PR is a governance violation,
even if SENTINEL-PASS is present.

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
