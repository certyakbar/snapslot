# SnapSlot Phase Tasks

## 1. Purpose
This file is SnapSlot’s execution-governance plan.

It exists to decide:
- what gets built
- in what order
- under what dependencies
- under what proof standard
- under what stop conditions

Document roles are fixed:
- Constitution = product law
- Architecture = system design
- Acceptance Ledger = proof truth
- Phase Tasks = execution order and gates

This plan is specialized to SnapSlot’s locked truths:
- one shared multi-tenant booking engine
- one platform owner account only
- one business owner login per business
- suspended = read-only
- deactivated = offline
- `completed` is current-phase
- `no_show` is deferred
- `failed` payment is current-phase
- `partially_refunded` is deferred
- internal QR is required
- default plan price is £60 from one controlled source

---

## 2. Global execution law

### 2.1 Workflow-first rule
Plan by workflow, not by file, page, or random feature.

A workflow is only closed when all 9 exist:
1. data/state model
2. backend lifecycle
3. route/API
4. frontend/admin/public UI
5. validation
6. error behavior
7. notifications/side effects
8. tests/proof
9. docs/ledger truth

If one is missing, the workflow is not done.

### 2.2 Scope freeze rule
A task may solve only the workflow problem it was scoped to solve.

Not allowed inside a normal task:
- unrelated cleanup
- opportunistic refactor
- silent architecture rewrite
- aesthetic churn
- “while I was here” edits
- hidden dependency expansion

### 2.3 Contradiction rule
If Constitution, Architecture, code, and Acceptance Ledger disagree:
- Constitution = law
- Ledger = current proof
- code = current implementation reality
- Architecture = target design

The contradiction must be surfaced explicitly.
It must never be hidden by vague wording.

### 2.4 No-fake-completion rule
A route existing is not completion.
A button existing is not completion.
A passing happy-path test is not completion.

Completion requires:
- lifecycle truth
- UI truth
- validation truth
- failure truth
- proof truth

### 2.5 Change-control rule
Any change that affects:
- state models
- actor permissions
- route ownership
- pricing source of truth
- business status behavior
- public booking behavior

must update the relevant planning/proof docs in the same workflow closure cycle.

### 2.6 Earlier-phase protection
No later phase may be treated as complete while an earlier phase remains structurally incomplete.

### 2.7 Current-phase exclusions
Do not add now:
- staff roles
- multi-admin business permissions
- customer accounts
- `no_show`
- `partially_refunded`
- add-ons
- analytics fluff
- premature pricing complexity
- convenience features that outrun lifecycle truth

That is drift.

---

## 3. Actor surfaces

### 3.1 Platform Owner surface
Purpose: run the platform.

Must do:
- owner login
- see all businesses
- see business status
- suspend/reactivate/deactivate
- see subscription and billing state
- see payment/account health

Must not become:
- a second business dashboard
- a bloated internal admin CMS

### 3.2 Business Admin surface
Purpose: run one business.

Must do:
- register/login/logout
- manage services
- manage weekly availability
- manage blocked times
- manage bookings
- manage payment settings
- use booking link / QR share
- view subscription/account state

Suspended business:
- can log in
- can view
- cannot mutate
- public booking cannot proceed

### 3.3 Customer surface
Purpose: create a valid booking.

Must do:
- view active services
- choose date
- see valid slots only
- enter details
- submit booking
- get truthful result

Must never:
- see false slots
- be told confirmed when pending payment
- interact with another tenant

---

## 4. Canonical lifecycle model

### 4.1 BusinessStatus
- active
- suspended
- deactivated

### 4.2 BookingStatus
Current:
- pending_payment
- confirmed
- rescheduled
- cancelled
- completed

Deferred:
- no_show

### 4.3 PaymentStatus
Current:
- not_required
- pending
- paid
- failed
- refunded

Deferred:
- partially_refunded

### 4.4 SubscriptionStatus
Use only:
- active
- suspended
- cancellation_requested
- cancelled
- expired

No extra cleverness.

---

## 5. Workflow map

### Workflow A — Platform owner identity and control
Covers:
- owner auth
- owner session
- owner business list
- owner business state actions
- owner billing/subscription visibility

Done means:
- one owner account only
- every owner action is auditable
- no tenant data leakage
- no owner action corrupts booking/payment state

### Workflow B — Business onboarding and identity
Covers:
- business signup
- login/logout
- session restore
- password reset
- slug uniqueness
- owner email uniqueness

Done means:
- one owner login per business
- no auth ambiguity
- no password-reset gaps

### Workflow C — Business status enforcement
Covers:
- active behavior
- suspended read-only behavior
- deactivated offline behavior
- public route gating
- admin route gating
- write-action blocking

Done means:
- suspended businesses cannot mutate
- deactivated businesses cannot operate
- public flow reflects status truth

### Workflow D — Service and schedule engine
Covers:
- services
- weekly availability
- multiple windows
- blocked times
- slot generation
- timezone handling
- integer validation alignment

Done means:
- no false slots
- no missing valid slots
- inactive/invalid services never enter booking flow

### Workflow E — Public booking flow
Covers:
- business page
- service selection
- date/slot selection
- customer details
- booking create
- truthful result copy
- retry safety

Done means:
- valid bookings only
- no duplicate submit corruption
- no fake confirmation

### Workflow F — Booking lifecycle
Covers:
- create
- cancel
- reschedule
- complete

Deferred:
- no_show

Done means:
- every current booking state has real backend, real UI, real validation, real proof
- no dead current-phase state remains

### Workflow G — Payment and refund lifecycle
Covers:
- payment config
- deposit enabled/disabled
- fixed/percentage
- pending/paid/failed/refunded
- truthful booking/payment interaction
- refund consequence
- payment copy truth

Deferred:
- partially_refunded

Done means:
- failed is real, not decorative
- refunded is real, not decorative
- payment state and booking state never contradict

### Workflow H — Notifications
Covers:
- booking created
- payment required
- payment received
- payment failed
- cancelled
- rescheduled
- refund issued

Done means:
- notifications reflect true state
- notification failure does not corrupt lifecycle truth

### Workflow I — Business admin dashboard completion
Covers:
- every real backend action has UI
- every UI action has backend
- read-only suspended mode
- status visibility
- payment/deposit visibility
- no fake controls

Done means:
- no backend-only important workflows
- no UI-only fake controls

### Workflow J — QR and sharing
Covers:
- internal QR generation
- quick share
- copy link
- optional download
- business-scoped safety
- suspended/deactivated truth

Done means:
- no third-party permanent QR dependency
- no misleading QR flow for inactive businesses

### Workflow K — Subscription and billing
Covers:
- source-of-truth plan price
- renewal behavior
- suspension behavior
- cancellation behavior
- reactivation behavior
- billing history
- owner/business visibility

Done means:
- £60 comes from one source
- no scattered billing logic
- subscription lifecycle is explicit

### Workflow L — Hardening
Covers:
- concurrency
- idempotency
- failure-path audit
- docs/ledger truth audit

Done means:
- no major hidden lifecycle contradiction remains

---

## 6. Phase order

## Phase 0 — Governance normalization

### Goal
Freeze planning boundaries and eliminate document drift.

### Tasks
- Constitution stays law-only
- Architecture stays design-only
- Acceptance Ledger stays proof-only
- maintain this Phase/Tasks doc
- create State Matrix
- create Route Matrix
- create UI Matrix
- create ADR folder for major architecture decisions only
- define document supersession rule
- define contradiction log

### Entry criteria
- Constitution exists
- Acceptance Ledger exists

### Exit criteria
- every planning file has one role only
- no duplicate constitutions
- no planning ambiguity remains about document purpose
- contradictions are logged, not hidden

### Proof required
- file audit
- document-role audit
- contradiction log existence

---

## Phase 1 — Identity and status

### Goal
Make ownership, access, and business-state truth unbreakable.

### Tasks
- owner auth
- business auth
- password reset
- active/suspended/deactivated enforcement
- **all admin write routes gated by `assertBusinessActive` — services, availability, blocked-times, booking lifecycle, payment-config must all reject writes from suspended or deactivated businesses**
- **platform owner password hashed and salt-stored using the same auth primitives as business auth (scrypt + timingSafeEqual)**
- **deactivated business admin login blocked at the login route with a clear account-status message**
- owner/business session boundary audit

### Entry criteria
- Phase 0 complete enough to prevent planning drift

### Exit criteria
- one owner account only
- one owner login per business
- suspended businesses cannot mutate — enforced at every admin write route, not only public booking routes
- deactivated businesses cannot operate — admin login blocked, not merely advisory
- route gating follows account-status truth for both public AND admin surfaces
- session boundaries are explicit and proven
- platform owner password is hashed and verified with constant-time comparison, not plain-text env-var equality
- no suspended-write bypass possible via direct API call

### Proof required
- auth tests
- route protection tests
- status enforcement tests: every admin write route must be explicitly tested for 503 when business is suspended
- suspended/deactivated UI proof
- deactivated login rejection proof
- owner password hashing proof

---

## Phase 2 — Service and schedule engine

### Goal
Make service and slot truth reliable.

### Tasks
- service lifecycle
- availability lifecycle
- blocked-time lifecycle
- slot truth hardening
- frontend/backend integer validation alignment
- business-status-aware slot gating

### Entry criteria
- Phase 1 business auth and status enforcement stable enough

### Exit criteria
- no false slots
- no missing valid slots
- invalid/inactive services never enter slot calculation
- blocked-time and timezone behavior are explicit and proven
- slot availability respects business-status truth

### Proof required
- service tests
- availability tests
- blocked-time tests
- slot engine tests
- UI validation proof

---

## Phase 3 — Public booking

### Goal
Close the customer booking workflow end to end.

### Tasks
- service/date/slot/customer flow
- truthful booking result
- suspended/deactivated public behavior
- duplicate-submit protection
- public-copy truth audit

### Entry criteria
- Phase 2 slot truth complete enough

### Exit criteria
- valid bookings only
- no duplicate submit corruption
- no fake confirmation
- pending-payment wording is truthful
- inactive business public flow is truthful

### Proof required
- public booking tests
- booking create tests
- message truth proof
- inactive-business public behavior proof

---

## Phase 4 — Booking lifecycle

### Goal
Make all current-phase booking states real.

### Tasks
- cancel
- reschedule
- complete
- keep `no_show` deferred
- current-phase booking-state reachability audit

### Entry criteria
- Phase 3 booking creation stable enough

### Exit criteria
- every current booking state has backend + UI + validation + proof
- no dead current-phase booking state remains

### Proof required
- booking lifecycle tests
- admin UI workflow proof
- state transition proof

---

## Phase 5 — Payment lifecycle

### Goal
Make payment and refund truth exact.

### Tasks
- payment config
- deposit logic
- failed — backend transition, booking-status consequence when payment fails, and UI control
- refunded
- truthful payment/booking state interaction
- **remove `partially_refunded` from `bookingStore.ts` `allowedTransitions` and from `server.ts` notification branch** — it is deferred by law but currently callable in live code
- **define and pin what happens to booking status when payment → failed** (current code leaves booking status unchanged — this must be an explicit documented decision, not a gap)
- **payment action UI: mark-paid, mark-failed, refund controls in admin-ui.js**
- **`api.js` payment action wrapper**
- **payment status and deposit amount displayed in admin bookings table**
- money-copy truth audit

### Entry criteria
- Phase 4 booking lifecycle stable enough

### Exit criteria
- `failed` is real, not decorative — has backend guard, UI control, defined booking consequence, and notification
- `refunded` is real, not decorative
- payment and booking states never contradict
- admin UI supports all current-phase payment actions: mark-paid, mark-failed, refund
- `partially_refunded` is not a callable transition in any current-phase code path
- current-phase payment states are reachable from the admin dashboard, not just via direct API

### Proof required
- payment tests
- refund tests
- payment UI proof
- booking/payment message proof
- mark-failed booking-consequence proof
- `partially_refunded` removed from live transition paths (proof of absence)

---

## Phase 6 — Notifications

### Goal
Make current-phase event communication truthful and safe.

### Tasks
- complete all current-phase event messaging
- booking created
- payment required
- payment received
- **payment failed — `sendPaymentFailed` function does not exist; must be created and wired in `server.ts` payment route**
- cancelled
- rescheduled
- refund issued
- **remove stale "NOT IMPLEMENTED" comment from `notificationService.ts` lines 65–66**
- duplicate-trigger audit

### Entry criteria
- Phases 3–5 stable enough

### Exit criteria
- notifications reflect true state
- notification failure does not corrupt lifecycle truth
- duplicate paths do not silently spam
- **payment-failed notification is implemented, wired, and tested** — not just listed as a requirement
- no stale code comments misrepresenting implementation state

### Proof required
- notification tests
- **explicit payment-failed notification test**
- trigger mapping audit
- failure-isolation proof

---

## Phase 7 — Business admin completion

### Goal
Make the tenant dashboard a truthful operational surface.

### Tasks
- remove drift
- close backend/UI gaps
- finalize suspended read-only dashboard behavior
- ensure every backend action has real UI
- ensure every UI action has real backend
- unsupported-control audit
- **reschedule booking UI control in `admin-ui.js` — reschedule button, date/slot modal, and form submission (backend and store exist; UI is entirely absent)**
- **complete booking UI control in `admin-ui.js` — complete button wired to `/complete` route (route does not exist yet; coordinate with Phase 4 closure)**
- **full cancel UI coverage in `admin-ui.js` — cancel button must be enabled for `pending_payment`, `confirmed`, and `rescheduled` statuses, not `confirmed` only (current gate is `booking.status === "confirmed"`)**
- **`api.js` wrappers for: `rescheduleBooking`, `completeBooking`, `markPaid`, `markFailed`, `refundBooking` — currently none of these exist in `api.js`**
- **suspended read-only enforcement in admin dashboard — suspended business admin must see a visible read-only banner; all mutating controls (create service, edit service, delete service, save availability, add blocked time, cancel/reschedule/complete/pay booking actions) must be visually disabled or hidden**
- **update service and delete service UI controls in `admin-ui.js` — `api.js` has no `updateService` or `deleteService` function; audit whether these controls exist and are wired**
- **payment config UI — verify `updatePaymentConfig` is wired in `api.js` and the payment-config panel is functional for active businesses; disabled for suspended**

### Entry criteria
- Phases 1–6 stable enough
- Phase 4 `completeBooking` route and store method exist (C-017)
- Phase 5 payment action routes proven (C-019)

### Exit criteria
- no backend-only important workflow
- no UI-only fake control
- suspended business admin can view but not mutate — enforced visually at every mutating control, not advisory
- dashboard reflects actual lifecycle truth
- all current-phase booking actions (cancel, reschedule, complete) are reachable from admin UI for all applicable booking states
- all current-phase payment actions (mark paid, mark failed, refund) are reachable from admin UI
- `api.js` has wrappers for every action the admin dashboard exposes

### Proof required
- dashboard audit
- panel-by-panel proof
- suspended read-only proof — every mutating control is disabled or hidden in suspended mode
- cancel UI proof — cancel available for pending_payment, confirmed, rescheduled bookings
- reschedule UI proof — reschedule control exists and submits to correct route
- complete UI proof — complete control exists and submits to correct route
- payment action UI proof — mark paid, mark failed, refund controls exist and submit

---

## Phase 8 — Internal QR/share

### Goal
Make sharing fast without weakening trust.

### Tasks
- internal QR
- quick share/copy/download
- status-aware QR behavior
- inactive-business QR truth audit

### Entry criteria
- Phase 7 admin completion
- Phase 1 status enforcement
- Phase 3 public booking truth

### Exit criteria
- no third-party permanent QR dependency
- QR resolves to correct business only
- inactive businesses do not present misleading QR flows

### Proof required
- QR flow proof
- business-scope proof
- inactive-business QR behavior proof

---

## Phase 9 — Platform owner completion

### Goal
Complete the platform control surface without bloat.

### Tasks
- full owner control surface
- business health/billing oversight
- business status actions
- account health visibility
- owner-surface scope audit

### Entry criteria
- Phase 1 owner auth and business status enough
- subscription visibility available enough

### Exit criteria
- owner can operate platform safely
- every owner action is auditable
- owner panel does not duplicate tenant panel unnecessarily

### Proof required
- owner auth proof
- owner action proof
- owner route protection proof

---

## Phase 10 — Subscription and billing normalization

### Goal
Normalize the billing lifecycle around existing proof and future safety.

This is not greenfield if parts of subscription behavior already exist in proof truth.
Treat this phase as normalization, not fantasy restart.

### Tasks
- centralize plan price source
- finish billing history/visibility
- remove hardcoded drift
- normalize lifecycle:
  - active
  - suspended
  - cancellation_requested
  - cancelled
  - expired
- billing-source-of-truth audit

### Entry criteria
- Phase 9 owner completion enough for visibility/control

### Exit criteria
- £60 comes from one source
- no scattered billing logic
- subscription lifecycle is explicit
- owner and business surfaces show truthful billing state

### Proof required
- subscription tests
- billing visibility proof
- source-of-truth audit for billing constants

---

## Phase 11 — Hardening

### Goal
Remove hidden production contradictions, deferred-feature code leaks, and security gaps that exist in current code.

### Tasks

#### Deferred-feature code cleanup
- **remove `partially_refunded` from `bookingStore.ts` `allowedTransitions` — it is currently a live callable transition from `paid`** (D-002 live runtime leak)
- **remove `partially_refunded` notification branch from `server.ts` payment route line ~773** (D-002 live runtime leak)
- **fix `bookingStore.ts` reschedule guard — replace `booking.status === "no_show"` terminal check with a positive allow-list of states that permit rescheduling; do not name deferred states** (D-006)
- **add state guard to `cancelBooking` store method — reject with an error if current status is already `cancelled` or `completed`; no silent re-cancellation** (C-023)

#### Security hardening
- **HTTP security headers — add `helmet` or equivalent headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy` baseline**
- **request body size limits — add explicit `express.json({ limit: '...' })` cap; current server.ts has no body-size constraint**
- **CSRF review — audit whether session-cookie-based routes require CSRF token protection; document conclusion and implement if required**
- **HTTPS enforcement — document whether TLS termination is done at process or reverse proxy level; ensure HTTP→HTTPS redirect is guaranteed in production**
- **session persistence audit — in-memory session Map is lost on server restart, logging out all active sessions; document this behavior explicitly and decide whether file-backed or external session store is needed**
- **rate limiting — add rate limit on login routes (owner and business) to prevent credential brute-force**

#### Lifecycle truth audit
- concurrency audit — verify `withBusinessBookingCreationLock` covers all mutating paths; check cancel and reschedule are still inside the lock
- idempotency audit — duplicate-submit protection proof for public booking create
- failure-path audit — verify all error handlers return structured errors, not stack traces
- state-reachability audit — every current-phase state must be reachable from a defined actor action
- route-matrix audit — every route in Route Matrix matches current server.ts reality
- UI-matrix audit — every control in UI Matrix matches current admin-ui.js reality
- unresolved-contradiction closure — close or explicitly re-defer every OPEN entry in the Contradiction Log

### Entry criteria
- earlier phases substantially closed

### Exit criteria
- no major hidden lifecycle contradiction remains
- `partially_refunded` is not present in any live code path (transitions, notifications, UI, routes)
- `no_show` is not named in any live transition guard
- `cancelBooking` rejects terminal-status re-cancellation
- HTTP security headers are set
- body size limits are set
- login rate limiting is in place
- session-persistence behavior is explicitly documented
- unsupported states/actions are removed or clearly deferred
- docs match current proof and planned truth
- retry/failure behavior is documented honestly

### Proof required
- audit reports
- matrix review
- updated ledger truth
- deferred-feature code removal proof — grep showing `partially_refunded` and `no_show` absent from live transition/notification logic
- cancelBooking state guard test — cancelled and completed bookings reject re-cancellation
- security header proof — response header audit output

---

## Phase 12 — Production readiness

### Goal
Make SnapSlot safe and legal to operate beyond a local development environment.

This phase does not add features. It closes the gap between a working codebase and a deployable, legally compliant service.

### Tasks

#### Deployment and process management
- **document the canonical deployment target and process manager (e.g., PM2, systemd, Docker) — currently undocumented**
- **ensure `data/store.json` path is configurable via environment variable, not hardcoded**
- **document environment variable schema: every required and optional env var, with description, example, and whether it has a safe default**
- **define graceful shutdown behavior — server must flush in-progress atomic writes before exit**

#### Monitoring and observability
- **structured error logging — unhandled exceptions and rejections must be logged with enough context for diagnosis; `console.error` alone is insufficient for production**
- **health check endpoint — `GET /health` returning 200 OK with no auth required, for process manager and load balancer use**
- **define on-call runbook stub — what to check when bookings fail, when subscription renewal fails, or when the server is unresponsive**

#### GDPR / privacy / legal
- **privacy policy page — required by GDPR for any service processing EU personal data; must describe what customer booking data is collected and retained**
- **terms of service page — required for business signup**
- **cookie / session disclosure — if session cookies are set, the service must disclose their use**
- **customer data deletion mechanism — a business or platform owner must be able to delete all customer booking records on request; no mechanism currently exists**
- **data retention policy — define and document how long booking data is kept; implement automated expiry or document that manual deletion is the current mechanism**

#### Operational safety
- **backup strategy for `data/store.json` — single flat file with no backup is a production data-loss risk; document backup strategy or implement automated copy**
- **atomic write audit — verify `fs.rename` (temp file swap) is the only write path; no direct `writeFileSync` to the canonical store path**

### Entry criteria
- Phase 11 hardening complete enough for lifecycle truth
- Phase 9 platform owner surface operational

### Exit criteria
- deployment target is documented
- environment variable schema is documented
- privacy policy page exists and is accessible to customers at booking time
- terms of service page exists and is accessible to business admins at signup
- customer data deletion mechanism exists
- health check endpoint returns 200
- structured error logging covers unhandled exceptions and rejections
- backup strategy for store.json is documented and implemented or explicitly accepted as a known risk

### Proof required
- privacy policy page reachability proof
- terms of service page reachability proof
- health check endpoint proof
- data deletion flow proof
- environment variable documentation audit
- backup strategy documentation or acceptance record

---

## 7. Planning-only control documents still required

### 7.1 State Matrix
Must define:
- BusinessStatus transitions
- BookingStatus transitions
- PaymentStatus transitions
- SubscriptionStatus transitions

Each row must include:
- from
- to
- allowed?
- actor
- trigger
- route
- notification
- UI effect
- proof required

### 7.2 Route Matrix
Must define for every meaningful route:
- actor
- auth required?
- business status allowed?
- read/write
- validation
- state effects
- notification effects
- tests required

### 7.3 UI Matrix
Must define for every meaningful page/control:
- actor
- visible when
- disabled when
- backend dependency
- success copy
- error copy
- drift risk

### 7.4 Contradiction Log
Must record:
- where docs disagree
- where docs and code disagree
- where code and proof disagree
- owner of resolution
- target phase for closure

### 7.5 ADRs
Use ADRs only for architecturally significant decisions:
- business-status behavior
- internal QR design
- billing source-of-truth design
- owner auth model
- concurrency boundary model

### 7.6 Infrastructure and operational requirements
Must define before Phase 12 closure:

**Deployment target document:**
- process manager and invocation command
- required environment variables (all of them)
- data directory path and permissions
- TLS/HTTPS termination point
- reverse proxy configuration (if used)

**Backup and recovery document:**
- backup target: `data/store.json` and any derived state
- backup frequency and retention
- restore procedure and test cadence
- accepted-risk statement if backup is not automated

**Runbook (stub minimum):**
- what to do when: server is unresponsive, booking create fails, subscription renewal fails, store file is corrupted
- escalation path

**Legal pages checklist:**
- privacy policy URL
- terms of service URL
- cookie policy disclosure (if applicable)
- last-reviewed date
- GDPR lawful basis for processing customer booking data

---

## 8. Universal exit gate
No phase is closed unless:
- dependencies are satisfied
- current-phase states are reachable and truthful
- UI and backend match
- validation is aligned
- failure behavior is defined
- proof exists
- docs and ledger are updated honestly
- contradictions are either resolved or explicitly logged

If one is missing, the phase remains open.
