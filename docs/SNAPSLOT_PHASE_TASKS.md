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
- owner/business session boundary audit

### Entry criteria
- Phase 0 complete enough to prevent planning drift

### Exit criteria
- one owner account only
- one owner login per business
- suspended businesses cannot mutate
- deactivated businesses cannot operate
- route gating follows account-status truth
- session boundaries are explicit and proven

### Proof required
- auth tests
- route protection tests
- status enforcement tests
- suspended/deactivated UI proof

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
- failed
- refunded
- truthful payment/booking state interaction
- keep `partially_refunded` deferred
- money-copy truth audit

### Entry criteria
- Phase 4 booking lifecycle stable enough

### Exit criteria
- `failed` is real, not decorative
- `refunded` is real, not decorative
- payment and booking states never contradict
- admin UI supports all current-phase payment actions
- current-phase payment states are reachable and truthful

### Proof required
- payment tests
- refund tests
- payment UI proof
- booking/payment message proof

---

## Phase 6 — Notifications

### Goal
Make current-phase event communication truthful and safe.

### Tasks
- complete all current-phase event messaging
- booking created
- payment required
- payment received
- payment failed
- cancelled
- rescheduled
- refund issued
- duplicate-trigger audit

### Entry criteria
- Phases 3–5 stable enough

### Exit criteria
- notifications reflect true state
- notification failure does not corrupt lifecycle truth
- duplicate paths do not silently spam

### Proof required
- notification tests
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

### Entry criteria
- Phases 1–6 stable enough

### Exit criteria
- no backend-only important workflow
- no UI-only fake control
- suspended business admin can view but not mutate
- dashboard reflects actual lifecycle truth

### Proof required
- dashboard audit
- panel-by-panel proof
- suspended read-only proof

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
Remove hidden production contradictions.

### Tasks
- concurrency audit
- idempotency audit
- failure-path audit
- doc/ledger truth alignment
- state-reachability audit
- route-matrix audit
- UI-matrix audit
- unresolved-contradiction closure

### Entry criteria
- earlier phases substantially closed

### Exit criteria
- no major hidden lifecycle contradiction remains
- unsupported states/actions are removed or clearly deferred
- docs match current proof and planned truth
- retry/failure behavior is documented honestly

### Proof required
- audit reports
- matrix review
- updated ledger truth

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
