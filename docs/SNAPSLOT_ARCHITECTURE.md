# SnapSlot Architecture

## 1. Purpose
This document defines how SnapSlot works end to end.

The Constitution is the law.
The Acceptance Ledger is proof truth.
This Architecture document explains the operating design between those two.

SnapSlot is a multi-tenant booking platform with one shared engine serving many isolated businesses. Its purpose is to let:
- the platform owner operate the product safely
- a business publish valid availability and manage bookings safely
- a customer make a valid booking through a truthful public flow

No feature may exist without a clear purpose in that chain.

---

## 2. Planning stance
Planning must reflect both:
- product law from the Constitution fileciteturn63file1
- current implementation proof from the Acceptance Ledger fileciteturn63file0

If Constitution and Ledger differ:
- Constitution defines intended law
- Ledger defines current proof
- Architecture must acknowledge both and plan the closure path without pretending drift does not exist

Current locked product decisions:
- one platform owner account only
- one platform owner login only
- one business owner login per business
- no business staff roles yet
- `completed` is current-phase
- `no_show` is deferred
- `failed` payment is current-phase
- `partially_refunded` is deferred
- suspended businesses are read-only
- deactivated businesses are offline
- QR generation must become internal
- default plan price is £60 from one controlled source, not scattered hardcoded logic

---

## 3. Actor model

### 3.1 Platform Owner
The platform owner operates SnapSlot itself.

Current-phase responsibilities:
- platform owner registration/login
- see all business accounts
- see business status
- see subscription/billing status
- suspend / reactivate / deactivate businesses
- see business account health and payment state

Current-phase limitations:
- one owner account only
- no internal team roles
- no staff permission matrix

### 3.2 Business Admin
A business admin owns one tenant.

Current-phase capabilities:
- register business
- login/logout
- manage services
- manage weekly availability
- manage blocked times
- manage bookings
- manage payment settings
- use booking link / QR sharing
- view account/subscription state

Current-phase limitations:
- one login per business
- no extra staff users
- no role hierarchy

### 3.3 Customer
A customer uses only the public booking page for one business.

Customers must never access:
- admin pages
- platform owner controls
- internal billing controls
- another tenant's data

---

## 4. System surfaces

### 4.1 Platform Owner Surface
Purpose: operate the platform.

Core areas:
- owner auth
- business list
- business detail
- status actions
- billing/subscription visibility
- account health visibility

### 4.2 Business Admin Surface
Purpose: operate one business safely.

Core areas:
- dashboard summary
- services
- availability
- blocked times
- bookings
- payment settings
- booking link / QR
- account/subscription status

### 4.3 Public Booking Surface
Purpose: convert a customer into a valid booking.

Core areas:
- business page
- service selection
- date selection
- slot selection
- customer details
- booking submission
- truthful result state

---

## 5. Source-of-truth boundaries

### 5.1 Backend truth
Backend is authoritative for:
- business status
- service validity
- availability validity
- blocked-time validity
- slot validity
- booking creation
- booking state transitions
- payment state transitions
- subscription state
- notification triggers

### 5.2 Frontend truth
Frontend is responsible for:
- reflecting backend state honestly
- guiding the user through valid flows
- disabling or hiding invalid actions
- showing loading, success, and error states truthfully

Frontend is never the source of booking, payment, or subscription truth.

### 5.3 Documentation truth
- Constitution = law
- Architecture = design
- Phase/Task plan = execution order
- Acceptance Ledger = proof only

No file may impersonate another file's role.

---

## 6. Canonical entities
The system revolves around these entities:
- PlatformOwner
- Business
- BusinessAuth
- BusinessStatus
- Service
- WeeklyAvailabilityWindow
- BlockedTime
- Booking
- CustomerSnapshot
- BookingStatus
- PaymentConfig
- PaymentStatus
- Subscription
- SubscriptionStatus
- BillingEvent
- NotificationEvent

Every entity must have:
- ownership
- lifecycle
- validation
- persisted truth
- UI meaning if surfaced

---

## 7. Business status lifecycle

### 7.1 States
- active
- suspended
- deactivated

### 7.2 Active
Rules:
- business admin can login
- dashboard is fully usable
- public booking page is live
- mutations are allowed

### 7.3 Suspended
Rules:
- business admin can login
- dashboard is viewable
- dashboard is read-only
- no create/edit/delete/update actions allowed
- **read-only enforcement must be implemented at every admin write route, not only at the dashboard UI level — a suspended business admin must receive an error if they call any write API directly**
- **the following route categories must all enforce business-active status: services (create, edit, delete), availability (save), blocked times (create, edit, delete), bookings (cancel, reschedule, complete, admin-create), payment (mark paid, mark failed, refund), payment-config (update)**
- **assertBusinessActive (or equivalent) must be applied server-side to every admin write route, not just the public booking routes and slots view**
- public booking page may be viewable
- public booking submission is blocked
- public page must not imply bookability
- suspension reason/resolution must be visible

### 7.4 Deactivated
Rules:
- business admin access is blocked or account-status only
- public booking page is offline for booking
- no services/slots are bookable
- only platform owner may reactivate

### 7.5 Transition authority
- platform owner controls business status transitions
- business admin cannot unsuspend or reactivate itself
- every transition must be auditable

---

## 8. Auth and session architecture

### 8.1 Platform owner auth
Current-phase:
- one owner credential set
- separate owner session
- owner-only routes protected independently from business sessions
- **owner password must be stored and verified using the same cryptographic primitives as business auth: scrypt for hashing, salt stored alongside hash, constant-time comparison (timingSafeEqual) — plain env-var equality comparison is not permitted**
- **the `SNAPSLOT_ADMIN_PASSWORD` env var must hold a hashed credential, not a plain-text password, before any production deployment**

### 8.2 Business admin auth
Current-phase:
- signup creates one business owner account
- login creates one tenant-scoped session
- session must never cross tenant boundary
- admin route must always resolve to the owning business only

### 8.3 Customer auth
No customer auth required in current-phase booking flow.

### 8.4 Password reset
Password reset is required as part of trust architecture even if incomplete in current proof.
It must include:
- reset token
- expiry
- invalidation
- safe user messaging
- server-side verification

---

## 9. Service lifecycle architecture

### 9.1 Service fields
- name
- durationMinutes
- bufferMinutes
- price
- active

### 9.2 Allowed actions
- create
- edit
- activate
- deactivate
- remove

### 9.3 Validation rules
- durationMinutes is integer > 0
- bufferMinutes is integer >= 0
- price is valid and non-negative
- invalid or inactive services must never enter booking or slot calculation

### 9.4 UI rules
- service UI must only expose fields truly supported by backend
- no fake descriptive fields without model support
- service form and backend validation must match exactly

---

## 10. Availability and blocked-time architecture

### 10.1 Availability model
Businesses can define:
- weekly recurring windows
- multiple windows on the same day

### 10.2 Blocked-time model
Businesses can:
- create blocked time
- edit blocked time
- remove blocked time

### 10.3 Slot engine inputs
Valid slot calculation must always respect:
- business timezone
- service durations
- service buffers
- weekly availability
- blocked times
- existing active bookings
- business status

### 10.4 Slot engine output rule
No slot may be shown unless it is actually bookable at backend time of truth.

---

## 11. Public booking architecture

### 11.1 Flow
1. customer opens business booking page
2. customer sees active services only
3. customer selects service(s)
4. customer selects date
5. backend calculates valid slots
6. customer selects slot
7. customer enters contact details
8. customer submits booking
9. system returns truthful outcome

### 11.2 Validation
Backend must reject:
- invalid services
- inactive services
- past bookings
- blocked-time overlap
- out-of-window bookings
- double-booking conflicts
- requests from suspended/deactivated businesses

### 11.3 Result messaging
- `pending_payment` must be presented as reserved pending payment
- `confirmed` must be presented as confirmed
- no retry/refresh may silently duplicate bookings

---

## 12. Booking lifecycle architecture

### 12.1 Current-phase states
- pending_payment
- confirmed
- rescheduled
- cancelled
- completed

### 12.2 Deferred
- no_show

### 12.3 Current-phase actions
- create
- cancel
- reschedule
- complete

### 12.4 Lifecycle rules
- `pending_payment` reserves slot without lying about confirmation
- `confirmed` blocks slot as active booking
- `rescheduled` retires original time and activates new time
- `cancelled` frees the slot
- `completed` closes the booking as finished
- `no_show` must not appear as live control until explicitly implemented

### 12.5 Admin UI rules
Every current-phase booking action must have:
- backend route
- admin UI control
- validation
- state transition guard
- proof
- truthful result message

---

## 13. Payment and deposit architecture

### 13.1 Current-phase payment states
- not_required
- pending
- paid
- failed
- refunded

### 13.2 Deferred
- partially_refunded

### 13.3 Payment config
Each business controls:
- whether deposit/payment is required
- fixed vs percentage logic
- deposit amount
- payment label

### 13.4 Booking/payment interaction
- deposit disabled → booking may become `confirmed` with `not_required`
- deposit enabled → booking may become `pending_payment` with `pending`
- mark paid → booking may transition to `confirmed`
- mark failed → payment must become `failed` with truthful booking consequence
- refund → payment becomes `refunded` with explicit booking consequence

### 13.5 Truth rule
Booking state and payment state must never contradict each other.

### 13.6 UI rule
UI must never imply:
- confirmed when pending
- paid when not actually paid
- refunded when not actually refunded
- partially refunded while that state is deferred

---

## 14. Notification architecture

### 14.1 Current-phase notification events
- booking created
- payment required
- payment received
- payment failed
- booking cancelled
- booking rescheduled
- refund issued

### 14.2 Channel strategy
- email first
- SMS later

### 14.3 Side-effect law
Notifications are side effects, not source of truth.

### 14.4 Failure law
Notification failure must not corrupt core lifecycle truth.

### 14.5 Duplication law
Retry or repeated actions must not silently produce duplicate notification spam.

---

## 15. QR and sharing architecture

### 15.1 Purpose
QR and sharing exist to reduce booking friction.

### 15.2 Rules
- QR generation must become internal
- QR must resolve only to the owning business booking page
- quick share/copy must exist
- quick download may exist
- no third-party dependency should remain as permanent core behavior
- suspended/deactivated businesses must not present misleading booking QR flows

### 15.3 Ownership
Only the owning business admin may fetch/manage its QR/share surface.

---

## 16. Platform owner architecture

### 16.1 Purpose
The owner dashboard runs the platform, not the tenant workflow.

### 16.2 Required current-phase actions
- login
- list businesses
- inspect business state
- suspend
- reactivate
- deactivate
- inspect subscription/billing state
- inspect account/payment health

### 16.3 Boundary law
Platform owner controls must not duplicate tenant controls unless platform operation truly requires it.

---

## 17. Subscription and billing architecture

### 17.1 Pricing source of truth
Current default:
- £60 per month

Architecture rule:
- this must come from one controlled config/source of truth
- it must not be duplicated across business logic

### 17.2 Subscription lifecycle
Target states:
- active
- suspended
- cancelled
- expired/ended if used
- reactivated

### 17.3 Billing requirements
The system must support:
- plan visibility
- billing events/history
- renewal behavior
- suspension behavior
- reactivation behavior
- cancellation behavior

### 17.4 Planning truth
If subscription/billing capability already exists in current proof, architecture must treat the remaining work as completion/hardening/alignment rather than pretending it does not exist.

---

## 18. Error and trust architecture

### 18.1 Error handling
Every important workflow must have:
- validation error handling
- auth/ownership error handling
- business-status error handling
- external dependency failure handling
- safe fallback copy

### 18.2 Trust rules
- no internal detail leakage in user-facing errors
- no hidden write path around suspension rules
- no cross-tenant data access
- no money-state contradiction
- no misleading optimistic copy

### 18.3 Security requirements
These must be in place before production operation:
- **HTTP security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security` (HTTPS only), `Content-Security-Policy` baseline — must be enforced by middleware on every response**
- **request body size limits: all JSON body parsing must have an explicit maximum size limit to prevent request-body amplification attacks**
- **CSRF protection: session-cookie-based write routes must be assessed for CSRF risk; if assessed as required, token-based CSRF protection must be implemented**
- **login rate limiting: owner and business login routes must be rate-limited to prevent credential brute-force**
- **HTTPS enforcement: HTTP→HTTPS redirect must be guaranteed in production, either at process level or via verified reverse-proxy configuration**

---

## 19. Concurrency and idempotency architecture

### 19.1 Booking integrity
The system must prevent:
- duplicate bookings from near-simultaneous requests
- stale slot confirmation
- repeated submit causing duplicate booking creation

### 19.2 Payment integrity
The system must prevent:
- duplicate payment transitions
- duplicate refunds
- repeated failure actions corrupting state

### 19.3 Honest proof rule
If concurrency protection is only single-process proven, documentation must say so honestly.
No multi-instance claims without proof.

---

## 20. File ownership map

### 20.1 Constitution
`docs/SNAPSLOT_CONSTITUTION.md`
- law only

### 20.2 Architecture
`docs/SNAPSLOT_ARCHITECTURE.md`
- system design only

### 20.3 Phase/Tasks
`docs/SNAPSLOT_PHASE_TASKS.md`
- execution plan only

### 20.4 Acceptance Ledger
`docs/SNAPSLOT_ACCEPTANCE_LEDGER.md`
- proof only

### 20.5 Agent control files
- `CLAUDE.md` = overseer behavior
- `.github/copilot-instructions.md` = executor rules

---

## 21. Phase execution model

### Phase 0 — Governance and architecture lock
- one canonical Constitution
- one Architecture doc
- one Phase/Task doc
- one Acceptance Ledger
- state and route matrices later as needed

### Phase 1 — Identity, auth, business status
- platform owner auth
- business auth
- password reset
- business status enforcement

### Phase 2 — Services, availability, blocked times
- service lifecycle
- availability lifecycle
- blocked-time lifecycle
- slot engine validation alignment

### Phase 3 — Public booking flow
- public booking page
- service/date/slot flow
- truthful booking result flow
- suspended/deactivated public behavior

### Phase 4 — Booking lifecycle
- cancel
- reschedule
- complete
- keep no_show deferred

### Phase 5 — Payment lifecycle
- payment config
- deposit logic
- pending / paid / failed / refunded
- defer partially_refunded

### Phase 6 — Notifications
- all current-phase events wired truthfully

### Phase 7 — Business admin completion
- every backend action has real UI
- every UI action has real backend
- suspended read-only mode fully correct

### Phase 8 — Internal QR and quick share
- internal QR
- quick share/copy/download
- business-scoped only

### Phase 9 — Platform owner completion
- business oversight
- billing/account oversight

### Phase 10 — Subscription and billing completion
- lifecycle normalization
- billing source-of-truth cleanup
- history/visibility completion

### Phase 11 — Hardening
- concurrency audit
- idempotency audit
- failure-path audit
- docs/ledger truth audit

---

## 22. Phase execution model update
Architecture §21 lists phases 0–11. Phase 12 (Production readiness) is now added to the execution model:

### Phase 12 — Production readiness
- deployment target documented
- environment variable schema documented
- health check endpoint
- structured error logging for unhandled exceptions
- privacy policy and terms of service pages
- customer data deletion mechanism
- backup strategy for store.json

---

## 23. Infrastructure and operational requirements

These are not application features. They are prerequisites for production safety.

### 23.1 Deployment
- the canonical deployment target, process manager, and start command must be documented before any production claim
- `data/store.json` path must be configurable via environment variable; not hardcoded
- graceful shutdown must flush in-progress atomic writes before process exit

### 23.2 Environment variables
Every environment variable the application reads must be documented with:
- name
- purpose
- required or optional
- safe default (or indication that none exists)
- example value

No undocumented env vars may exist in a production-ready state.

### 23.3 Health check
A `GET /health` endpoint must exist:
- no auth required
- returns HTTP 200 with minimal response body
- usable by process managers, load balancers, and uptime monitors

### 23.4 Observability
- unhandled promise rejections and uncaught exceptions must be caught and logged with structured context
- `console.error` alone is not sufficient for production diagnosis
- error logging must include at minimum: timestamp, route, error type, and enough context to reproduce

### 23.5 Data safety
- `data/store.json` is the single source of persisted truth; a backup strategy must exist
- atomic writes via `fs.rename` from a temp file must be the only write path; no direct `writeFileSync` to the canonical file path
- backup frequency and restore procedure must be documented

### 23.6 Legal compliance
Required before any business or customer data is processed in production:
- privacy policy page: accessible to customers at booking time
- terms of service page: accessible to business admins at signup
- cookie/session disclosure if session cookies are set
- customer data deletion mechanism: platform owner or business admin must be able to delete all records for a given customer on request
- data retention policy: how long booking data is kept must be defined and documented

---

## 24. Workflow completion law
Every workflow must be built as one closed unit:

1. data model
2. backend lifecycle
3. route/API
4. frontend/admin/public UI
5. validation
6. error behavior
7. notifications/side effects
8. tests/proof
9. docs/ledger truth

If one is missing, the workflow is not done.

---

## 25. Architecture-level definition of done
A workflow is architecturally complete only if:
- actor is defined
- state model is defined
- transitions are defined
- backend truth exists
- frontend truth exists
- validation exists
- failure behavior exists
- isolation is preserved
- side effects are correct
- proof exists
- docs match proof

Anything less is:
- PARTIAL
- UNPROVEN
- or BLOCKED
