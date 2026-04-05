# SnapSlot Constitution

## 1. Product identity
SnapSlot is a multi-tenant booking platform with one shared booking engine serving many separate businesses.

The product exists to do one thing well:
- let a business publish valid availability
- let a customer book valid slots
- let the business manage bookings safely
- let the platform owner control account and billing state safely

Every feature must serve that purpose.
No feature may exist as decoration, drift, or fake capability.

---

## 2. Canonical actors

### 2.1 Platform Owner
The platform owner is the operator of SnapSlot.

Current-phase rule:
- one platform owner account only
- one platform owner login only
- no staff roles yet
- no multi-owner permission model yet

The platform owner must be able to:
- register and log in
- view all business accounts
- activate, suspend, reactivate, or deactivate businesses
- view subscription and billing status for businesses
- view payment and account health at platform level

### 2.2 Business Admin
A business admin is the owner account for one business tenant.

Current-phase rule:
- one business owner login per business
- no team members / staff roles yet
- no multi-admin permission model yet

The business admin must be able to:
- register a business
- log in and out
- manage services
- manage weekly availability
- manage blocked times
- manage bookings
- manage payment settings
- use booking link / QR sharing
- view subscription/account status

### 2.3 Customer
A customer interacts only with the public booking page of the business they are booking with.

Customers must never gain access to:
- another business
- admin actions
- internal billing controls
- platform-owner controls

---

## 3. Non-negotiable laws

### Law 1 — Reliability over everything
The booking engine is the heart of the product.
- no double bookings
- no false available slots
- no missing valid slots
- no booking outside allowed availability
- no booking through blocked time
- no state corruption from admin actions
- no money-state contradiction

### Law 2 — One engine, many isolated businesses
Every business must remain isolated in:
- account
- services
- availability
- blocked times
- customers
- bookings
- payment settings
- public booking page
- QR / booking link
- subscription state

No cross-tenant leakage is acceptable.

### Law 3 — UI, logic, storage, and routing must not drift
- booking logic lives in logic/store files
- routing lives in controller/server files
- UI lives in frontend files
- shared styles live in shared theme files
- no fake UI for unsupported backend
- no backend-only feature may be called complete without matching UI or explicit later-phase classification

### Law 4 — Truth over appearance
No message, button, label, or status may claim stronger truth than the backend actually enforces.

### Law 5 — Smallest safe change
Changes must be minimal, deliberate, and provable.
No cosmetic churn.
No opportunistic refactors inside unrelated work.

---

## 4. Business account status model

### 4.1 BusinessStatus
Current canonical business statuses:
- active
- suspended
- deactivated

### 4.2 Active
Active businesses:
- can log in
- can use admin dashboard normally
- can accept public bookings
- can modify services, availability, blocked times, and payment settings

### 4.3 Suspended
Suspended businesses are read-only.
They are still visible to the business owner, but service use is paused.

Suspended business rules:
- business admin can still log in
- dashboard is viewable
- no write action is allowed
- no service, availability, blocked-time, booking-management, or payment-setting changes are allowed
- public booking page may be viewed
- public booking creation is blocked
- services/slots may be shown only if clearly marked non-bookable, or booking is blocked at source of truth
- UI must show a clear suspension banner/message
- suspension reason and resolution path must be clear

### 4.4 Deactivated
Deactivated businesses are fully offline.

Deactivated business rules:
- business admin login is blocked or redirected to account-status message
- public booking page is unavailable for booking
- no services or slots are bookable
- platform owner controls reactivation

---

## 5. Canonical feature entities

The system must support these core entities:

- PlatformOwner
- Business
- BusinessAuth
- Service
- WeeklyAvailabilityWindow
- BlockedTime
- Booking
- CustomerSnapshot
- PaymentConfig
- Subscription
- BillingEvent
- NotificationEvent

Each entity must have:
- clear ownership
- clear lifecycle
- clear validation
- clear persisted truth
- clear UI meaning if surfaced

---

## 6. Booking state model

### 6.1 Current-phase booking statuses
- pending_payment
- confirmed
- rescheduled
- cancelled
- completed

### 6.2 Deferred booking statuses
- no_show

### 6.3 Booking state rules
- pending_payment means the slot is reserved but not fully confirmed
- confirmed means booking is valid and fully confirmed
- rescheduled means original booking time is no longer active and a new active booking time exists
- cancelled means booking is inactive and must not block future slots
- completed means booking occurred successfully and is closed
- no_show is not current-phase and must not appear as a working feature yet

Illegal transitions must be blocked.

---

## 7. Payment state model

### 7.1 Current-phase payment statuses
- not_required
- pending
- paid
- failed
- refunded

### 7.2 Deferred payment statuses
- partially_refunded

### 7.3 Payment state rules
- not_required means no deposit/payment is required for confirmation
- pending means payment is required and not yet received
- paid means required payment has been confirmed
- failed means attempted payment did not succeed
- refunded means payment has been returned
- partially_refunded is deferred and must not be presented as a live feature yet

Booking state and payment state must never contradict each other.

Examples:
- booking cannot be labelled confirmed in UI if backend truth is pending_payment
- failed payment must not silently produce confirmed booking
- refunded flows must have explicit booking consequences

---

## 8. Subscription and billing rules

### 8.1 Current truth
Subscription and billing must be designed now even if some parts are later-phase.

Current default commercial truth:
- default plan price: £60
- this default must come from one controlled source
- it must not be scattered as hardcoded business logic across the codebase

### 8.2 Subscription requirements
Subscription lifecycle must eventually support:
- active
- suspended
- cancelled
- expired / ended if used
- billing history
- renewal
- reactivation

### 8.3 Billing rule
Plan price may be configurable later, but the system must be built so billing truth does not depend on scattered magic numbers.

---

## 9. Service rules

A service must support:
- name
- durationMinutes
- bufferMinutes
- price
- active

Current-phase requirements:
- create
- edit
- activate
- deactivate
- remove

Validation rules:
- durationMinutes must be integer and > 0
- bufferMinutes must be integer and >= 0
- price must be valid and non-negative
- inactive services must not be offered publicly
- invalid services must never enter slot calculation

---

## 10. Availability and blocked-time rules

Businesses must be able to:
- define weekly availability
- define multiple windows per day
- create blocked times
- edit blocked times
- remove blocked times

Slot generation must always respect:
- business timezone
- service durations
- service buffers
- weekly availability
- blocked times
- existing active bookings
- business status

No slot may be shown unless it is truly bookable under current backend truth.

---

## 11. Public customer booking journey

The customer booking journey must be:

1. open business booking page
2. view active services only
3. choose service(s)
4. choose date
5. engine calculates valid slots
6. choose time
7. enter contact details
8. submit booking
9. receive truthful result message

Truth rules:
- suspended/deactivated businesses must not accept bookings
- pending-payment bookings must not be labelled confirmed
- retry/refresh must not silently duplicate bookings
- public flow must remain scoped to one business only

---

## 12. Business admin dashboard requirements

The business admin dashboard must contain only real, working controls.

Current-phase required areas:
- Services
- Weekly availability
- Blocked times
- Bookings
- Payment settings
- Booking link / QR sharing
- Subscription/account status display

Current-phase booking management actions:
- cancel
- reschedule
- complete

Deferred:
- no_show

Payment management actions:
- mark paid
- mark failed
- refund

Deferred:
- partially refund

Read-only rules:
- suspended businesses may view but not modify
- dangerous actions must show truthful feedback
- unsupported actions must not appear

---

## 13. Platform owner dashboard requirements

The platform owner dashboard must exist as a separate control surface.

Current-phase required capabilities:
- owner registration/login
- see all businesses
- see each business status
- suspend/reactivate/deactivate business
- see billing/subscription status
- see account health / payment status at business level

Current-phase scope:
- one owner account only
- no internal role hierarchy yet

---

## 14. QR code and sharing rules

QR and sharing are core usability features.

Rules:
- QR generation must be internal to SnapSlot
- no permanent third-party dependency for core QR generation
- QR must resolve only to the owning business booking page
- quick share / copy link must be available
- QR/share must not weaken tenant isolation
- suspended/deactivated businesses must not present misleading bookable QR flows

---

## 15. Notifications

Current-phase notification channels:
- email first
- SMS later, optional

Current-phase event requirements:
- booking created
- payment required
- payment received
- payment failed
- booking cancelled
- booking rescheduled
- refund issued

Notification rules:
- notifications are side effects, not source of truth
- notification failure must not corrupt lifecycle truth
- duplicate actions must not silently spam duplicate notifications
- notification wording must match real backend state exactly

---

## 16. Security and trust

Current-phase trust requirements:
- authenticated routes
- session protection
- password hashing
- password reset
- route ownership enforcement
- public flow isolation
- safe server-side validation
- no cross-business access
- no hidden write path for suspended businesses

No feature is acceptable if it weakens trust.

---

## 17. Domain fidelity requirements

A feature is not complete because:
- a route exists
- a button exists
- a test passes once
- a demo works

A feature is complete only when all of the following are true:
1. data model supports it
2. backend lifecycle supports it
3. frontend/admin/public UI supports it truthfully
4. validation is correct
5. failure behavior is safe
6. retry behavior is safe
7. tenant isolation is preserved
8. notifications/side effects are correct
9. copy tells the truth
10. proof exists
11. docs and ledger match reality

If any are missing, the feature is:
- PARTIAL
- UNPROVEN
- or BLOCKED

Never DONE.

---

## 18. Implementation phase order

### Phase 0 — Governance and architecture lock
Tasks:
- one canonical Constitution
- architecture document
- acceptance ledger as proof-only
- lean Claude/Copilot instruction files
- file ownership map

### Phase 1 — Identity, auth, and business status
Tasks:
- platform owner auth
- business signup/login/logout/session
- password reset
- business status model
- suspended/deactivated enforcement

### Phase 2 — Services, availability, blocked times
Tasks:
- service lifecycle
- weekly availability
- multiple windows/day
- blocked-time lifecycle
- slot engine validation alignment

### Phase 3 — Public booking flow
Tasks:
- public booking page
- service/date/slot selection
- customer details
- truthful booking result flow
- suspended/deactivated public behavior

### Phase 4 — Booking lifecycle
Tasks:
- cancel
- reschedule
- complete
- enforce deferred no_show

### Phase 5 — Payment lifecycle
Tasks:
- payment config
- fixed/percentage deposits
- pending / paid / failed / refunded
- truthful booking/payment copy
- defer partially_refunded

### Phase 6 — Notifications
Tasks:
- payment-required
- payment-received
- payment-failed
- booking created
- cancelled
- rescheduled
- refund issued

### Phase 7 — Business admin completion
Tasks:
- remove fake controls
- ensure every backend action has real UI
- ensure every UI action has real backend
- read-only suspended mode

### Phase 8 — Internal QR and quick share
Tasks:
- internal QR generation
- quick share/copy/download
- business-scoped behavior only

### Phase 9 — Platform owner dashboard
Tasks:
- business oversight
- suspend/reactivate/deactivate
- billing visibility
- account health visibility

### Phase 10 — Subscription and billing completion
Tasks:
- plan source of truth
- renewal/cancel/reactivate/suspend lifecycle
- billing history
- owner/business visibility

### Phase 11 — Hardening
Tasks:
- concurrency audit
- idempotency audit
- failure-path audit
- doc/ledger truth audit

No later phase may claim completion while an earlier phase remains structurally incomplete.

---

## 19. Task completion unit

Every task must be completed as one closed unit:

1. data model
2. backend lifecycle
3. route/API
4. frontend/admin/public UI
5. validation
6. error states
7. side effects / notifications
8. tests / proof
9. docs / ledger truth

If one is missing, the task is not done.

---

## 20. Definition of done
A feature is done only if:
- backend logic exists
- frontend flow exists
- validation exists
- error handling exists
- isolation is preserved
- lifecycle states are explicit
- side effects are correct
- tests/proof exist
- docs are honest
- ledger truth matches reality

No AI, human contributor, or agent may mark planned or partial work as implemented.
