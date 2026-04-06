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
| DISC-0005 | C-001 and C-013 both cover password reset with overlapping but non-identical framing. C-001 frames it as "later-phase per Constitution / UNVERIFIED proof"; C-013 frames it as "planning ambiguity." The two entries could mislead future agents about which framing is canonical. No explicit cross-reference or merge has occurred. | Contradiction Log re-read | Documentation drift | Unlogged discovery — Pending contradiction-log normalization |
| DISC-0006 | `docs/SNAPSLOT_SENTINEL_CONTRACT.md` exists and is classified HIGH risk in `docs/SNAPSLOT_RISK_POLICY.md` §4, but is not referenced in the Context Recovery Protocol's recovery hierarchy (§4) or file-role list (§2). The Sentinel contract has no anchor in the recovery order. | Context Recovery Protocol re-read | Documentation gap | Unlogged discovery — Pending contradiction-log normalization |
| DISC-0007 | `ops/TASK_STATE.json` and `scripts/system-check.js` are new files created by the Phase 0.5 package and are not present in the Risk Policy file map (`docs/SNAPSLOT_RISK_POLICY.md` §4). Because these files do not exist before this PR, no prior classification obligation is violated by this PR. Classification is required before any subsequent PR that modifies these files. | Risk Policy re-read | Planning gap | Unlogged discovery — Pending contradiction-log normalization — does not block this PR |

---

## 3. Normalization protocol

Before Phase 1 implementation begins, the following must be addressed as Phase 1 preflight
work. None of these may be done inside the Phase 0.5 package itself.

**DISC-0005 — C-001 / C-013 overlap:**
Governor must review both entries and either merge them into a single entry or add an explicit
cross-reference note in both. This requires a scoped edit to `docs/SNAPSLOT_CONTRADICTION_LOG.md`
authorized by the Governor. Risk level: MEDIUM.

**DISC-0006 — Sentinel contract not in recovery hierarchy:**
Governor must add `docs/SNAPSLOT_SENTINEL_CONTRACT.md` to the recovery hierarchy in
`docs/SNAPSLOT_CONTEXT_RECOVERY_PROTOCOL.md` §4 in a scoped doc edit. Risk level: MEDIUM.

**DISC-0007 — New ops files not in risk policy file map:**
Governor must assign risk classifications for `ops/TASK_STATE.json` and `scripts/system-check.js`
in `docs/SNAPSLOT_RISK_POLICY.md` §4 in a scoped doc edit. This does not block the Phase 0.5
PR — the files do not exist before this PR merges, so no prior classification obligation applies.
Classification must be present before any subsequent PR that modifies these files.
Risk level of that future edit: MEDIUM.

---

## 4. Universal exit gate for this register

This register is healthy when:
- DISC-0001 through DISC-0004 are marked RESOLVED
- DISC-0005 through DISC-0007 are explicitly labeled `Unlogged discovery — Pending contradiction-log normalization`
- No entry introduces a C-016+ or D-006+ ID
- No entry silently removes or hides an existing contradiction
- No entry claims proof that does not exist in the Acceptance Ledger