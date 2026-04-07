## Governance metadata (machine-read — replace placeholder values, keep key names exact)

<!-- SENTINEL:task_id=REPLACE_TASK_ID -->
<!-- SENTINEL:risk=REPLACE_RISK -->
<!-- SENTINEL:ledger=NONE -->

---

## Task reference

- Task ID: <!-- e.g. T-02-C1-assert-business-active -->
- Phase: <!-- Phase N -->
- Workflow: <!-- Workflow X — name -->
- Risk level: <!-- CRITICAL | HIGH | MEDIUM | LOW (per docs/SNAPSLOT_RISK_POLICY.md) -->

---

## Scope declaration

**Files changed (exact list):**

<!-- SENTINEL:FILES_BEGIN -->
- <!-- list each file changed, added, or deleted -->
<!-- SENTINEL:FILES_END -->

**Files explicitly not touched:**

- <!-- list governance files and any adjacent files at scope-drift risk -->

---

## Required behavior

<!-- What this PR does and why. Reference the Constitution section, Phase Tasks section,
or Contradiction Log entry that drives this change. Be exact. -->

---

## Forbidden behavior confirmation

- [ ] No unrelated edits (no opportunistic cleanup, refactor, or churn)
- [ ] No deferred feature exposure (no_show, partially_refunded, staff roles, customer accounts)
- [ ] No fake completion claim (no PASS without proof)
- [ ] No silent behavior change
- [ ] Scope matches task packet exactly

---

## Validation proof

**TypeScript typecheck** (`npx tsc --noEmit`):

```
<!-- paste exact output — not paraphrased -->
```

**Test suite** (`npm test`):

```
<!-- paste exact output — not paraphrased. Show all suite results. -->
```

---

## Ledger impact

<!-- Which Acceptance Ledger rows are affected?
Use PASS / FAIL / UNVERIFIED only. Do not mark PASS without proof above.
If no rows are affected, write exactly: None
Then set `<!-- SENTINEL:ledger=NONE -->` above.
If one or more rows are affected, set `<!-- SENTINEL:ledger=AFFECTED -->` above
and replace None with a filled table. -->

<!-- SENTINEL:LEDGER_BEGIN -->
None
<!-- SENTINEL:LEDGER_END -->

<!-- Ledger table shape when AFFECTED:
| Area | Previous status | New status | Proof reference |
|---|---|---|---|
| example area | FAIL | PASS | tests/example.test.ts |
-->

---

## Contradiction impact

<!-- Does this PR resolve, introduce, or touch any entry in
docs/SNAPSLOT_CONTRADICTION_LOG.md? List by ID. If none, write: None -->

None.

---

## Blocking conditions

- [ ] Typecheck passes
- [ ] All tests pass
- [ ] Scope is clean — no files touched outside task packet
- [ ] Ledger rows updated honestly
- [ ] No contradiction silently patched
- [ ] Risk level declared correctly per docs/SNAPSLOT_RISK_POLICY.md
- [ ] Proof is exact output, not paraphrased

---

## Governor verdict

<!--
  APPROVE MODEL (CRITICAL and HIGH risk changes):

  The Sentinel validates ops/GOVERNOR_APPROVAL.json — NOT PR comments — for APPROVE.
  Comments are audit trail only.

  To approve:
  1. Post a PR comment from @certyakbar containing:
       GOVERNOR VERDICT: APPROVE FOR MERGE
       Risk level: [CRITICAL | HIGH]
       Proof reviewed: yes
       Scope clean: yes
  2. The governor-manifest-commit job will automatically commit ops/GOVERNOR_APPROVAL.json
     with approved_parent_sha bound to the current HEAD SHA.
  3. Do NOT push any additional commits after posting the APPROVE comment.
     Any commit after the manifest commit automatically invalidates the approval.
     If a fix is required after approval: push the fix, then re-approve.

  BLOCK MODEL (all risk levels):
  Post a PR comment from @certyakbar containing:
    GOVERNOR VERDICT: BLOCK — [reason]
    Required before merge: [exact action]
  A BLOCK comment overrides any approval manifest until a newer manifest is issued.

  MEDIUM and LOW risk changes:
  Governor APPROVE is not required. SENTINEL-PASS is sufficient for merge.
  Governor BLOCK still applies at all risk levels.

  BOOTSTRAP EXCEPTION (Phase 0.75 only):
  The Phase 0.75 PR introduces the manifest model. The Governor committed
  ops/GOVERNOR_APPROVAL.json manually to this branch. No APPROVE comment was posted
  for this PR to avoid triggering the legacy governor-empty-commit job on main.
-->
