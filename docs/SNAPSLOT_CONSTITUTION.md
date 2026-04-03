# SnapSlot Constitution

## 1. Product identity
SnapSlot is a multi-tenant booking platform with one shared booking engine serving many separate businesses.

Every business must remain isolated in:
- account
- services
- availability
- blocked times
- customers
- bookings
- payment configuration
- public booking page
- QR code / booking link

Customers must only interact with the booking page belonging to the business they are booking with.

## 2. Non-negotiable laws
### Law 1 — Reliability over everything
The booking engine is the heart of the product.
- no double bookings
- no broken booking flow
- no false available slots
- no missing valid slots
- no booking outside allowed availability
- no booking through blocked time
- no business dashboard actions that corrupt booking state

### Law 2 — Convenience supports reliability
- clear flows
- minimal fields
- no unnecessary complexity
- batch actions only where safe
- no shortcut bypassing validation

### Law 3 — One engine, many businesses
- no cross-business bookings, services, or customers
- no cross-business payment settings
- no route or session leakage
- no shared state contamination

### Law 4 — UI, data, and logic must not mix
- booking logic in logic files
- storage in storage files
- routes in controller files
- theme in shared theme files
- pages not bloated
- no fake UI for unsupported backend features

### Law 5 — Shared theme ownership
- shared component styling in shared theme
- page-local styles only when truly page-specific
- duplication across HTML pages is a violation

### Law 6 — Professionalism
- clear, calm UI
- obvious primary actions
- minimal friction
- helpful error states
- no clutter

## 3. Business journey
- register
- account creation
- subscription selection (later phase)
- login
- password reset (later)
- dashboard professional, reliable

## 4. Service management rules
- service: name, price, duration, buffer, active
- add/edit/remove/activate/deactivate service
- no bloated or fake UI fields

## 5. Availability & blocked times
- define weekly availability
- multiple windows per day
- block, edit, remove times
- slots calculated from services + buffer + availability + blocked times + existing bookings + timezone

## 6. QR code & booking link
- each business unique link
- QR resolves to business only
- must not weaken isolation or route safety

## 7. Customer booking journey
- choose services
- choose date
- engine calculates valid slots
- choose time
- enter contact info
- confirm booking
- receive confirmation
- business sees booking

## 8. Booking engine rules
- combine service durations & buffers
- respect timezone, availability, blocked times, existing bookings
- prevent double booking under near-simultaneous requests
- reject invalid or inactive services, past bookings, bookings outside windows

## 9. Booking state model
- pending_payment
- confirmed
- rescheduled
- cancelled
- completed
- no_show

## 10. Notifications
- email first, SMS optional
- booking created, rescheduled, cancelled, payment required, payment received, refund issued
- notifications to both customer and business

## 11. Payments & deposits
- business-controlled
- configurable per business
- booking blocked until required payment is confirmed
- states: not_required, pending, paid, failed, refunded, partially_refunded

## 12. Subscription & billing (later phase)
- initial plan £60/month
- add-ons, plan changes, billing history, cancellations, refunds (planned)

## 13. Security & trust
- authenticated routes, session checks, password hashing, password reset, safe validation, no cross-business access, isolated payments, logging

## 14. Current implementation truth
- every feature marked: IMPLEMENTED / PARTIALLY IMPLEMENTED / PLANNED / NOT STARTED
- no AI or contributor may mark planned as implemented

## 15. Codex operating rule
- read Constitution first
- read Acceptance Ledger
- identify core/later-phase work
- protect booking engine first
- preserve business isolation
- do not invent unsupported features
- update Acceptance Ledger with PASS / FAIL / UNVERIFIED

## 16. Definition of done
- backend logic exists
- frontend flow exists
- validation exists
- error handling exists
- isolation preserved
- tests/proof exist
- documentation updated honestly