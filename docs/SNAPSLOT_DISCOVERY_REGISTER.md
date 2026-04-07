# SnapSlot Discovery Register

## 1. Purpose

This register captures newly discovered gaps, inconsistencies, and infrastructure deficiencies
found during Phase 0.5 re-anchor that are not yet formally entered into the Contradiction Log
(`docs/SNAPSLOT_CONTRADICTION_LOG.md`).

### Register rules

- Every entry has a DISC-XXXX ID in sequential order.
- Entries resolved within this Phase 0.5 package are marked `RESOLVED`.
- Entries not yet in the Contradiction Log are labeled:
  - `Unlogged discovery`
  - `Pending contradiction-log normalization`
- Do NOT create C-016+ or D-006+ IDs here. New contradiction IDs require a separate
  Governor-authorized edit to `docs/SNAPSLOT_CONTRADICTION_LOG.md`.
- This file is a staging buffer only. It does not replace the Contradiction Log.
- When a pending entry is formally normalized into the Contradiction Log, update its
  status row here to `NORMALIZED — see C-XXX` or `NORMALIZED — see D-XXX`.

---

## 2. Discovery register

| ID | Discovery | Source | Severity | Status |
| --- | --- | --- | --- | --- |
| DISC-0001 | `ops/` directory does not exist on `main` — no operational state-tracking infrastructure present | Phase 0.5 re-anchor | Operational gap | RESOLVED — created by Phase 0.5 package |
| DISC-0002 | `scripts/system-check.js` does not exist on `main` — no automated pre-flight health checker | Phase 0.5 re-anchor | Operational gap | RESOLVED — created by Phase 0.5 package |
| DISC-0003 | `docs/SNAPSLOT_DISCOVERY_REGISTER.md` does not exist on `main` — no formal inter-cycle discovery staging register | Phase 0.5 re-anchor | Operational gap | RESOLVED — created by Phase 0.5 package |
| DISC-0004 | Phase 0.5 block absent from `docs/SNAPSLOT_PHASE_TASKS.md` — the operational continuity phase is not represented in execution governance | Phase 0.5 re-anchor | Planning gap | RESOLVED — inserted by Phase 0.5 package |
| DISC-0005 | C-001 and C-013 both cover password reset with overlapping but non-identical framing. C-001 frames it as "later-phase per Constitution / UNVERIFIED proof"; C-013 frames it as "planning ambiguity." The two entries could mislead future agents about which framing is canonical. No explicit cross-reference or merge has occurred. | Contradiction Log re-read | Documentation drift | NORMALIZED — bidirectional cross-references added to both C-001 and C-013 in docs/SNAPSLOT_CONTRADICTION_LOG.md; C-001 is the canonical tracking entry |
| DISC-0006 | `docs/SNAPSLOT_SENTINEL_CONTRACT.md` exists and is classified HIGH risk in `docs/SNAPSLOT_RISK_POLICY.md` §4, but is not referenced in the Context Recovery Protocol's recovery hierarchy (§4) or file-role list (§2). The Sentinel contract has no anchor in the recovery order. | Context Recovery Protocol re-read | Documentation gap | NORMALIZED — docs/SNAPSLOT_SENTINEL_CONTRACT.md added as step 3 in docs/SNAPSLOT_CONTEXT_RECOVERY_PROTOCOL.md §4 recovery hierarchy |
| DISC-0007 | `ops/TASK_STATE.json` and `scripts/system-check.js` are new files created by the Phase 0.5 package and are not present in the Risk Policy file map (`docs/SNAPSLOT_RISK_POLICY.md` §4). Because these files do not exist before this PR, no prior classification obligation is violated by this PR. Classification is required before any subsequent PR that modifies these files. | Risk Policy re-read | Planning gap | NORMALIZED — ops/TASK_STATE.json and scripts/system-check.js classified as MEDIUM in docs/SNAPSLOT_RISK_POLICY.md §4 |
| DISC-0008 | In a one-owner repo, requiring approving reviews deadlocks merge: the sole owner (`@certyakbar`) cannot approve their own PR and no other reviewer exists to satisfy the requirement. Discovered empirically during the sacrificial proof exercise when PRs A and B could not be merged despite SENTINEL-PASS. Resolved by removing required approving reviews from branch protection. The active hard merge gate remains the required `Sentinel verdict` status check. | Sacrificial proof exercise (live GitHub) | Governance configuration gap | NORMALIZED — §11.1 of docs/SNAPSLOT_SENTINEL_CONTRACT.md updated to reflect one-owner repo branch protection configuration; required approving reviews removed from protection settings |
| DISC-0009 | Governor APPROVE verdict is stored only as a PR comment. Comments are not bound to any commit SHA. Code pushed after the APPROVE comment causes the Sentinel to pass an unreviewed commit (TOCTOU / stale-approval gap). The existing `governor-empty-commit` mechanism solved the check-suite identity problem but did not bind the approval to a specific code state. Any synchronize event after an APPROVE comment satisfies the Sentinel regardless of what changed. | Phase 0.75 governance review | Critical governance gap | RESOLVED — Phase 0.75 (PR #13) replaces comment-based APPROVE with manifest-bound approval model (`ops/GOVERNOR_APPROVAL.json`). Approval is bound to approved_parent_sha + approved_tree_sha; any commit after the manifest commit automatically invalidates it. |

---

## 3. Normalization protocol

DISC-0005 through DISC-0007 were required as Phase 1 preflight work before implementation begins;
none were done inside the Phase 0.5 package itself. DISC-0008 was discovered during the subsequent
sacrificial proof exercise. All four are now NORMALIZED.

**DISC-0005 — C-001 / C-013 overlap: NORMALIZED**
Bidirectional cross-references added to both C-001 and C-013 in `docs/SNAPSLOT_CONTRADICTION_LOG.md`.
C-001 is the canonical tracking entry. C-013 explicitly defers to C-001 and documents the historical
framing ambiguity. No future agent should be unsure which entry is authoritative. Risk level: MEDIUM.

**DISC-0006 — Sentinel contract not in recovery hierarchy: NORMALIZED**
`docs/SNAPSLOT_SENTINEL_CONTRACT.md` added as step 3 in the recovery hierarchy in
`docs/SNAPSLOT_CONTEXT_RECOVERY_PROTOCOL.md` §4. Steps 3–12 renumbered to 4–13.
Reason clause updated to explain why the Sentinel Contract must be read during recovery.
Risk level: MEDIUM.

**DISC-0007 — New ops files not in risk policy file map: NORMALIZED**
`ops/TASK_STATE.json` and `scripts/system-check.js` classified as MEDIUM in
`docs/SNAPSLOT_RISK_POLICY.md` §4. Any future PR modifying these files must declare
MEDIUM risk and satisfy Sentinel MEDIUM-risk checks. Risk level: MEDIUM.

**DISC-0008 — One-owner approving-reviews deadlock: NORMALIZED**
Discovered during the sacrificial proof exercise when SENTINEL-PASS PRs could not be merged
because the owner cannot approve their own PRs. Required approving reviews removed from branch
protection. §11.1 of `docs/SNAPSLOT_SENTINEL_CONTRACT.md` updated to remove the false claim
that Code Owner review is enforced and to document the one-owner repo configuration with an
explicit note. The active merge gate — the required `Sentinel verdict` status check — is
unchanged. Risk level: HIGH (governance spine file updated).

---

## 4. Universal exit gate for this register

This register is healthy when:
- DISC-0001 through DISC-0004 are marked RESOLVED
- DISC-0005 through DISC-0008 are marked NORMALIZED with truthful references to the destination docs
- DISC-0009 is marked RESOLVED with reference to Phase 0.75 PR
- No entry introduces a C-016+ or D-006+ ID
- No entry silently removes or hides an existing contradiction
- No entry claims proof that does not exist in the Acceptance Ledger