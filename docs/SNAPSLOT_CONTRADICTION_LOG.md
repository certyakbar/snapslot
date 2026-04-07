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
| C-001 | Constitution / Architecture / Phase Tasks | Acceptance Ledger | Password reset is required current-phase trust architecture, but proof is UNVERIFIED | Security/trust workflow is incomplete if claimed as done | Keep password reset as REQUIRED BUT UNVERIFIED. Do not imply implementation. C-001 is the canonical tracking entry for this contradiction. C-013 cross-references this issue from a historical planning-ambiguity angle — track and resolve via C-001. | Auth workflow owner | Phase 1 | OPEN |
| C-002 | Constitution / Architecture / Phase Tasks / State Matrix | Acceptance Ledger / Route Matrix / UI Matrix | `completed` booking state is current-phase law, but exact route/UI/proof are still not fully pinned | Current-phase state cannot remain decorative | Treat `completed` as REQUIRED CURRENT-PHASE but NOT YET PROVEN end to end. No completion claim until route + UI + proof exist. | Booking lifecycle owner | Phase 4 | OPEN |
| C-003 | Constitution / Phase Tasks | code/store reality reflected in State Matrix and Route Matrix | `failed` payment is current-phase, but route/UI/notification closure is not fully proven in the current proof boundary | A current-phase payment state cannot remain half-supported | Keep `failed` as CURRENT-PHASE REQUIRED. Do not mark payment lifecycle complete until admin UI, route behavior, and notification proof are explicit. | Payment lifecycle owner | Phase 5 | OPEN |
| C-004 | Constitution / Phase Tasks | code/store reality reflected in State Matrix | `partially_refunded` exists in code/state references but is deferred by law | Deferred state leaking into current-phase claims causes drift | Treat as DEFERRED. Keep hidden in UI. Do not expose route or claim support. | Payment lifecycle owner | Phase 5 / Hardening | DEFERRED BY LAW |
| C-005 | Constitution / Architecture | Acceptance Ledger / Route Matrix / UI Matrix | QR must become internal, but current proven QR flow is still based on authenticated QR route with external-generation dependency in current implementation path | Current feature is safe enough for isolation but not yet architecturally final | Treat QR/share as CURRENT-PHASE PARTIAL: tenant-safe and proven for ownership, but internal generation normalization still open. | QR/share owner | Phase 8 | OPEN |
| C-006 | Architecture / Phase Tasks / State Matrix | Acceptance Ledger subscription proof | Planning narrows subscription states to `active`, `suspended`, `cancellation_requested`, `cancelled`, `expired`, but proof language still includes current implementation behavior that is not fully normalized to that naming model | Subscription planning and proof can drift if naming is silently rewritten | Treat current subscription behavior as REAL AND PROVEN where ledger says so, but keep naming normalization as explicit Phase 10 work. | Subscription/billing owner | Phase 10 | OPEN |
| C-007 | Constitution / Architecture | Acceptance Ledger public-route proof | Suspended public-booking behavior: Constitution allows viewable-but-non-bookable, while current proof shows suspended booking page returns 503 | Public UX can drift if law/design/proof are not aligned | Current truth follows proof: suspended booking page behavior is 503/blocking. Any later shift to view-only must update all docs and proof together. | Business-status/public-flow owner | Phase 3 / Phase 11 | PARTIALLY RESOLVED |
| C-008 | Architecture | Acceptance Ledger / Route Matrix / UI Matrix | Deactivated business admin behavior is described as blocked or redirected to account-status message, but final UI/route policy is not fully pinned as one canonical behavior everywhere | Business-status UX can drift across login/admin/public flows | Treat deactivated businesses as OFFLINE FOR OPERATION. Exact admin experience must be normalized consistently before closure. | Business-status owner | Phase 1 / Phase 7 | OPEN |
| C-009 | Phase Tasks / UI Matrix | Current exact proof coverage | Business admin booking â€œcompleteâ€ control must exist if state is current-phase, but current local proof set does not yet prove the control end to end | Dashboard completion cannot be called done with missing core action | Treat Bookings panel as PARTIAL until complete-control route/UI/proof exist. | Business admin dashboard owner | Phase 7 | OPEN |
| C-010 | Constitution / Architecture | Acceptance Ledger | Notifications require payment failed event messaging, but full payment-failed notification proof is not yet explicitly surfaced in the uploaded local proof boundary used for matrices | Notification lifecycle cannot be fully closed with missing current-phase event proof | Keep payment-failed notification as REQUIRED BUT NOT FULLY PROVEN. | Notifications owner | Phase 6 | OPEN |
| C-011 | Constitution / Architecture | Acceptance Ledger | Billing history is architecturally required later/currently planned, but Acceptance Ledger marks Payment history UNVERIFIED | Owner/business billing visibility can be overstated | Treat billing history as NOT YET PROVEN. No UI/feature completion claim. | Subscription/billing owner | Phase 10 | OPEN |
| C-012 | Constitution / Architecture / Phase Tasks | Acceptance Ledger / exact route proof | Platform owner registration/login is required as a surface, but exact route naming and full UI policy are not fully spelled out in the current matrix proof set | Owner workflow can drift between implementation and planning docs | Treat platform-owner auth as REAL AND PROVEN at workflow level where ledger proves it, but keep exact route/path normalization open. | Platform owner workflow owner | Phase 9 | PARTIALLY RESOLVED |
| C-013 | Constitution / Architecture | Acceptance Ledger | Password reset is described as trust requirement but also previously treated as later-phase / unverified in proof comments | Planning ambiguity can let contributors over- or under-scope the task | C-001 is the canonical tracking entry for password reset. C-013 documents the historical planning ambiguity — password reset was framed inconsistently as both required current-phase trust work and unverified/later-phase, causing the duplication. Track and resolve via C-001. Constitution/Architecture are authoritative: password reset is required trust work; current proof remains UNVERIFIED. | Auth workflow owner | Phase 1 | OPEN |
| C-014 | Architecture / Phase Tasks | Current implementation proof boundary | Public booking flow and admin booking flow both can create bookings, but admin-create UI exposure is not yet explicitly locked in proof the same way public flow is | UI drift risk between route existence and actual surface | Treat admin-create booking UI as conditional: route may exist, but UI must only claim support once proven in UI matrix and ledger. | Booking/admin UI owner | Phase 7 | OPEN |
| C-015 | Constitution / Architecture / UI Matrix | current implementation path | Suspended businesses are read-only and may view, but exact disabled-vs-hidden behavior for every admin control is not yet proven panel by panel | Read-only policy can be inconsistently enforced visually | Treat suspended mode as REQUIRED CURRENT-PHASE. Keep dashboard completion open until panel-by-panel proof exists. | Business-status/dashboard owner | Phase 7 | OPEN |
| C-016 | Constitution Â§4.3 / Architecture Â§7.3 / Phase Tasks | code reality (`server.ts`) | `assertBusinessActive` is called on only 3 routes: public booking page, public booking create, and admin slots view. ALL admin write routes (services create/edit/delete, availability PUT, blocked-times create/edit/delete, admin booking create, cancel, reschedule, payment PATCH, payment-config PUT) are NOT gated by business status. A suspended business admin can call every write route via direct API. | Constitution Â§4.3 states "no write action is allowed" for suspended businesses. Suspension enforcement is structurally incomplete. | Add `assertBusinessActive` guard to all admin write routes before any further feature work. Do not mark Workflow C or Phase 1 closed until this is proven with explicit tests. | Business-status / auth owner | Phase 1 | OPEN |
| C-017 | Constitution Â§12 / Architecture Â§12.3 / Phase Tasks Phase 4 / State Matrix / Route Matrix / UI Matrix | code reality (server.ts, bookingStore.ts) | `completed` booking state is current-phase law across all planning documents. Neither `completeBooking` store method nor `PATCH /api/business/:businessId/bookings/:bookingId/complete` route exists in code. Admin UI has no complete control. | A current-phase state without route, store method, or UI is entirely decorative â€” Constitution Â§17 explicitly disallows this. | Treat as REQUIRED MISSING IMPLEMENTATION. Do not mark Phase 4 or Workflow F closed until backend, route, UI, and proof exist. C-002 and C-009 are related; this entry supersedes them with a more precise implementation-level statement. | Booking lifecycle owner | Phase 4 | OPEN |
| C-018 | Constitution Â§15 / Architecture Â§14.1 / Phase Tasks Phase 6 | code reality (notificationService.ts, server.ts) | `sendPaymentFailed` function does not exist in `notificationService.ts`. The server.ts payment route branches on `paid` and `refunded/partially_refunded` but has no branch for `failed`. When admin marks payment as failed, no notification is sent to customer or business. | Constitution Â§15 and Architecture Â§14.1 list payment-failed as a required current-phase notification event. The workflow is structurally incomplete. | Do not mark Workflow H or Phase 6 closed. Implement `sendPaymentFailed` and wire it in server.ts before Phase 6 sign-off. Related to C-010 but now more precisely scoped: the function is entirely absent, not just unproven. | Notifications owner | Phase 6 | OPEN |
| C-019 | Architecture Â§13.4 / Phase Tasks Phase 5,7 / UI Matrix Â§11.2 | code reality (admin-ui.js, api.js) | `mark_paid`, `mark_failed`, and `refund` have backend routes and proven store logic. `admin-ui.js` has zero payment action controls. `api.js` has no payment action function. The admin dashboard cannot perform any payment lifecycle action. | Constitution Â§17 requires both backend lifecycle and admin UI for a feature to be complete. Payment workflow is backend-proven but UI is entirely absent â€” not partial, not hidden, absent. | Do not mark Workflow G/I or Phase 5/7 closed. Payment action UI is the next required deliverable after backend proof. | Business admin dashboard owner | Phase 7 | OPEN |
| C-020 | Architecture Â§12.5 / Phase Tasks Phase 7 / UI Matrix Â§10.1 | code reality (admin-ui.js, api.js) | Reschedule has a proven backend route and store method. `admin-ui.js` has no reschedule button, modal, or form. `api.js` has no `rescheduleBooking` function. Admin dashboard cannot reschedule any booking. Additionally, the cancel UI in admin-ui.js gates the cancel button only on `booking.status === "confirmed"`, meaning `pending_payment` and `rescheduled` bookings cannot be cancelled from the UI despite the backend supporting it. | Constitution Â§17 requires both backend lifecycle and admin UI. Reschedule is backend-proven but operationally unreachable for admins. The cancel-only-for-confirmed gap also creates an unrecoverable state for pending-payment bookings. | Do not mark Workflow F/I or Phase 7 closed. Reschedule UI and full-coverage cancel UI are required. | Business admin dashboard owner | Phase 7 | OPEN |
| C-021 | Constitution Â§8.3 / Architecture Â§17.1 / Phase Tasks Phase 10 | code reality (server.ts line 425) | `pricePerMonth: 60.0` is a hardcoded float literal in the `GET /api/business/:businessId/subscription` route. `SUBSCRIPTION_PRICE_PENCE = 6000` is defined in `bookingStore.ts` but is not used by this route. Constitution Â§8.3 requires the plan price to come from one controlled source. | Two independent representations of the same truth â€” the literal `60.0` and the constant `6000` â€” can diverge silently if either is updated without updating the other. | Treat as an active source-of-truth violation. Fix in Phase 10 normalization at the latest, or earlier if subscription route is touched. Derive `pricePerMonth` from `SUBSCRIPTION_PRICE_PENCE / 100`. | Subscription/billing owner | Phase 10 | OPEN |
| C-022 | State Matrix Â§4 (`active â†’ deactivated: YES`) | code reality (bookingStore.ts `applyBillingAction`) | State Matrix declares `active â†’ deactivated: YES` for Platform Owner. Code requires `subscriptionStatus === "suspended"` before deactivation is allowed â€” an active business cannot be directly deactivated. The platform owner must suspend first, then deactivate. | An undocumented two-step requirement for deactivation is invisible to operators and planning. If the two-step is intentional, the State Matrix must say so. If not, the guard is wrong. | Do not silently allow the discrepancy. Either update State Matrix to declare `active â†’ deactivated` blocked with a note that suspension is the required intermediate step, or remove the guard and allow direct deactivation. | Business-status / subscription owner | Phase 9 / Phase 11 | OPEN |
| C-023 | Constitution Â§17 / Architecture Â§12.4 / Phase Tasks Phase 4 | code reality (bookingStore.ts `cancelBooking`) | `cancelBooking` store method has no state guard. It sets `booking.status = "cancelled"` regardless of current state. A booking already `cancelled` or `completed` can be silently re-cancelled with no error. This allows illegal state transitions not defined in the State Matrix. | State transitions must be guarded. A completed booking that is re-cancelled produces corrupted state that contradicts billing and lifecycle truth. | Add a state guard to `cancelBooking`: reject if current status is already terminal (`cancelled`, `completed`). Do not mark Workflow F or Phase 4 closed without this. | Booking lifecycle owner | Phase 4 | OPEN |
| C-024 | Constitution Â§16 / Architecture Â§8.1 | merged repo truth (PR #14; server.ts `POST /api/snapslot-admin/login`) | Platform owner password is no longer compared as a plain environment variable string using `===`. `SNAPSLOT_ADMIN_PASSWORD` is parsed as `salt:hash`, and owner login verifies the supplied password through `verifyPassword`. | Constitution Â§16 and Architecture Â§8.1 require password hashing for owner auth. PR #14 merged on main and aligned owner verification with the business-auth primitive path: scrypt hashing with salt plus timingSafeEqual comparison through `verifyPassword`. | C-024 is resolved by merged implementation PR #14. Do not treat this as Phase 1 closure for unrelated auth/status gaps. | Auth / platform owner owner | Phase 1 | RESOLVED |
| C-025 | Constitution Â§4.4 / Architecture Â§7.4 | code reality (server.ts `POST /api/login`) | Constitution Â§4.4 states deactivated business admin login "is blocked or redirected to account-status message." The business login route does not check `subscriptionStatus`. A deactivated business admin can log in, obtain a session, and access the admin dashboard. | Deactivated businesses are defined as fully offline for operation. Allowing login breaks the deactivated state's purpose and may allow data access that should be unavailable. | Add `subscriptionStatus` check to the business login route. Reject login for `deactivated` businesses with a clear account-status message. Related to C-008. | Business-status / auth owner | Phase 1 | OPEN |

---

## 5. Deferred-by-law register

These are not implementation bugs right now because the Constitution explicitly defers them, but they must stay blocked from current-phase claims.

| ID | Deferred item | Why deferred | Required guard | Target phase | Status |
| --- | --- | --- | --- | --- | --- |
| D-001 | `no_show` booking state/action/UI | Deferred booking state by Constitution and Phase Tasks | no live route, no live UI, no completion claim | Later than Phase 4 | DEFERRED BY LAW |
| D-002 | `partially_refunded` payment state/action/UI | Deferred payment state by Constitution and Phase Tasks | no live UI, no current-phase route claim, no lifecycle completion claim. **LIVE RUNTIME LEAK (C-004):** `partially_refunded` is present in `bookingStore.ts` `allowedTransitions` as a valid target from `paid`, and in `server.ts` line 773 as a notification branch â€” these are live code paths, not type-only declarations. Must be removed from both before Phase 5 closure. | Later than Phase 5 | DEFERRED BY LAW |
| D-003 | staff roles / multi-admin permissions | Excluded from current-phase scope | no role-management UI or route | Later product decision | DEFERRED BY LAW |
| D-004 | customer accounts | Excluded from current-phase scope | no customer profile/auth UI or route | Later product decision | DEFERRED BY LAW |
| D-005 | analytics / add-ons / pricing complexity | Excluded from current-phase execution law | no fake dashboards or plan-complexity UI | Later product decision | DEFERRED BY LAW |
| D-006 | `no_show` in live runtime logic | `no_show` is correctly typed and persisted, but also appears in `bookingStore.ts` reschedule guard (line ~870) as a named terminal status check â€” deferred feature referenced in runtime logic. The guard `booking.status === "no_show"` should be replaced with a positive allowed-statuses check that does not name deferred states. | Deferred state must not be named in live runtime transition logic | Replace terminal-state check with positive allow-list that does not reference `no_show` | Phase 4 / Phase 11 | DEFERRED BY LAW |

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
