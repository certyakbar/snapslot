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
  For CRITICAL and HIGH risk changes:
  Post your verdict as a dedicated PR comment from @certyakbar using the exact format
  from docs/SNAPSLOT_SENTINEL_CONTRACT.md §6. Do NOT embed the verdict here —
  the Sentinel scans PR comments, verifies the author is @certyakbar, and uses the
  latest Governor verdict if multiple verdict comments exist.
  Posting this comment automatically re-triggers the Sentinel so the PR check updates immediately.

  For MEDIUM and LOW risk changes:
  Governor APPROVE is not required. SENTINEL-PASS is sufficient for merge.
  A GOVERNOR VERDICT: BLOCK comment from @certyakbar blocks merge at any risk level.
  A later APPROVE from @certyakbar overrides an earlier BLOCK, and vice versa.
-->
