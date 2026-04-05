# SnapSlot Contradiction Log

## 1. Purpose
This file records contradictions between:
- Constitution law
- Architecture design
- Phase Tasks execution law
- State Matrix
- Route Matrix
- UI Matrix
- Acceptance Ledger proof truth
- current implementation reality

This file exists so contradictions are:
- surfaced explicitly
- owned
- phased
- resolved deliberately

They must never be hidden by vague wording, silent assumptions, or fake completion claims.

Document role:
- Constitution = law
- Architecture = design
- Acceptance Ledger = proof truth
- Contradiction Log = unresolved mismatch tracker

---

## 2. Status rules

Use only these statuses:
- OPEN
- PARTIALLY RESOLVED
- RESOLVED
- DEFERRED BY LAW

### Meaning
- **OPEN** = contradiction exists now and affects planning or implementation truth
- **PARTIALLY RESOLVED** = some sides are aligned, but not all
- **RESOLVED** = contradiction is closed in law, design, proof, and implementation truth
- **DEFERRED BY LAW** = not a bug right now because the Constitution explicitly defers it, but it must stay blocked from current-phase claims

---

## 3. Resolution rules

Each contradiction must state:
- source A
- source B
- contradiction summary
- why it matters
- current safe interpretation
- owner of resolution
- target phase
- status

Safe interpretation rule:
When sources disagree, use:
1. Constitution for intended law
2. Acceptance Ledger for current proof
3. matrices for planning control
4. code reality only when explicitly verified

Never silently promote a feature to DONE just because one source is ahead of the others.

---

## 4. Contradiction register

| ID | Source A | Source B | Contradiction | Why it matters | Current safe interpretation | Owner | Target phase | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-001 | Constitution / Architecture / Phase Tasks | Acceptance Ledger | Password reset is required current-phase trust architecture, but proof is UNVERIFIED | Security/trust workflow is incomplete if claimed as done | Keep password reset as REQUIRED BUT UNVERIFIED. Do not imply implementation. | Auth workflow owner | Phase 1 | OPEN |
| C-002 | Constitution / Architecture / Phase Tasks / State Matrix | Acceptance Ledger / Route Matrix / UI Matrix | `completed` booking state is current-phase law, but exact route/UI/proof are still not fully pinned | Current-phase state cannot remain decorative | Treat `completed` as REQUIRED CURRENT-PHASE but NOT YET PROVEN end to end. No completion claim until route + UI + proof exist. | Booking lifecycle owner | Phase 4 | OPEN |
| C-003 | Constitution / Phase Tasks | code/store reality reflected in State Matrix and Route Matrix | `failed` payment is current-phase, but route/UI/notification closure is not fully proven in the current proof boundary | A current-phase payment state cannot remain half-supported | Keep `failed` as CURRENT-PHASE REQUIRED. Do not mark payment lifecycle complete until admin UI, route behavior, and notification proof are explicit. | Payment lifecycle owner | Phase 5 | OPEN |
| C-004 | Constitution / Phase Tasks | code/store reality reflected in State Matrix | `partially_refunded` exists in code/state references but is deferred by law | Deferred state leaking into current-phase claims causes drift | Treat as DEFERRED. Keep hidden in UI. Do not expose route or claim support. | Payment lifecycle owner | Phase 5 / Hardening | DEFERRED BY LAW |
| C-005 | Constitution / Architecture | Acceptance Ledger / Route Matrix / UI Matrix | QR must become internal, but current proven QR flow is still based on authenticated QR route with external-generation dependency in current implementation path | Current feature is safe enough for isolation but not yet architecturally final | Treat QR/share as CURRENT-PHASE PARTIAL: tenant-safe and proven for ownership, but internal generation normalization still open. | QR/share owner | Phase 8 | OPEN |
| C-006 | Architecture / Phase Tasks / State Matrix | Acceptance Ledger subscription proof | Planning narrows subscription states to `active`, `suspended`, `cancellation_requested`, `cancelled`, `expired`, but proof language still includes current implementation behavior that is not fully normalized to that naming model | Subscription planning and proof can drift if naming is silently rewritten | Treat current subscription behavior as REAL AND PROVEN where ledger says so, but keep naming normalization as explicit Phase 10 work. | Subscription/billing owner | Phase 10 | OPEN |
| C-007 | Constitution / Architecture | Acceptance Ledger public-route proof | Suspended public-booking behavior: Constitution allows viewable-but-non-bookable, while current proof shows suspended booking page returns 503 | Public UX can drift if law/design/proof are not aligned | Current truth follows proof: suspended booking page behavior is 503/blocking. Any later shift to view-only must update all docs and proof together. | Business-status/public-flow owner | Phase 3 / Phase 11 | PARTIALLY RESOLVED |
| C-008 | Architecture | Acceptance Ledger / Route Matrix / UI Matrix | Deactivated business admin behavior is described as blocked or redirected to account-status message, but final UI/route policy is not fully pinned as one canonical behavior everywhere | Business-status UX can drift across login/admin/public flows | Treat deactivated businesses as OFFLINE FOR OPERATION. Exact admin experience must be normalized consistently before closure. | Business-status owner | Phase 1 / Phase 7 | OPEN |
| C-009 | Phase Tasks / UI Matrix | Current exact proof coverage | Business admin booking “complete” control must exist if state is current-phase, but current local proof set does not yet prove the control end to end | Dashboard completion cannot be called done with missing core action | Treat Bookings panel as PARTIAL until complete-control route/UI/proof exist. | Business admin dashboard owner | Phase 7 | OPEN |
| C-010 | Constitution / Architecture | Acceptance Ledger | Notifications require payment failed event messaging, but full payment-failed notification proof is not yet explicitly surfaced in the uploaded local proof boundary used for matrices | Notification lifecycle cannot be fully closed with missing current-phase event proof | Keep payment-failed notification as REQUIRED BUT NOT FULLY PROVEN. | Notifications owner | Phase 6 | OPEN |
| C-011 | Constitution / Architecture | Acceptance Ledger | Billing history is architecturally required later/currently planned, but Acceptance Ledger marks Payment history UNVERIFIED | Owner/business billing visibility can be overstated | Treat billing history as NOT YET PROVEN. No UI/feature completion claim. | Subscription/billing owner | Phase 10 | OPEN |
| C-012 | Constitution / Architecture / Phase Tasks | Acceptance Ledger / exact route proof | Platform owner registration/login is required as a surface, but exact route naming and full UI policy are not fully spelled out in the current matrix proof set | Owner workflow can drift between implementation and planning docs | Treat platform-owner auth as REAL AND PROVEN at workflow level where ledger proves it, but keep exact route/path normalization open. | Platform owner workflow owner | Phase 9 | PARTIALLY RESOLVED |
| C-013 | Constitution / Architecture | Acceptance Ledger | Password reset is described as trust requirement but also previously treated as later-phase / unverified in proof comments | Planning ambiguity can let contributors over- or under-scope the task | Use Constitution/Architecture as authority: password reset is required trust work; current proof remains UNVERIFIED. | Auth workflow owner | Phase 1 | OPEN |
| C-014 | Architecture / Phase Tasks | Current implementation proof boundary | Public booking flow and admin booking flow both can create bookings, but admin-create UI exposure is not yet explicitly locked in proof the same way public flow is | UI drift risk between route existence and actual surface | Treat admin-create booking UI as conditional: route may exist, but UI must only claim support once proven in UI matrix and ledger. | Booking/admin UI owner | Phase 7 | OPEN |
| C-015 | Constitution / Architecture / UI Matrix | current implementation path | Suspended businesses are read-only and may view, but exact disabled-vs-hidden behavior for every admin control is not yet proven panel by panel | Read-only policy can be inconsistently enforced visually | Treat suspended mode as REQUIRED CURRENT-PHASE. Keep dashboard completion open until panel-by-panel proof exists. | Business-status/dashboard owner | Phase 7 | OPEN |

---

## 5. Deferred-by-law register

These are not implementation bugs right now because the Constitution explicitly defers them, but they must stay blocked from current-phase claims.

| ID | Deferred item | Why deferred | Required guard | Target phase | Status |
| --- | --- | --- | --- | --- | --- |
| D-001 | `no_show` booking state/action/UI | Deferred booking state by Constitution and Phase Tasks | no live route, no live UI, no completion claim | Later than Phase 4 | DEFERRED BY LAW |
| D-002 | `partially_refunded` payment state/action/UI | Deferred payment state by Constitution and Phase Tasks | no live UI, no current-phase route claim, no lifecycle completion claim | Later than Phase 5 | DEFERRED BY LAW |
| D-003 | staff roles / multi-admin permissions | Excluded from current-phase scope | no role-management UI or route | Later product decision | DEFERRED BY LAW |
| D-004 | customer accounts | Excluded from current-phase scope | no customer profile/auth UI or route | Later product decision | DEFERRED BY LAW |
| D-005 | analytics / add-ons / pricing complexity | Excluded from current-phase execution law | no fake dashboards or plan-complexity UI | Later product decision | DEFERRED BY LAW |

---

## 6. Resolution protocol

A contradiction may be marked RESOLVED only when:
- Constitution is aligned or intentionally updated
- Architecture is aligned
- Phase Tasks are aligned
- relevant matrix entries are aligned
- Acceptance Ledger truth is aligned
- proof exists where proof is required
- no current UI/route/state claim remains misleading

If even one of those is missing, do not mark RESOLVED.

---

## 7. Universal contradiction-log exit gate
The Contradiction Log is only considered healthy when:
- all known contradictions are recorded
- all deferred items are separated from real defects
- every open contradiction has an owner and target phase
- no contradiction is hidden inside vague wording
- no source disagreement is silently ignored

Anything less means planning drift still exists.
