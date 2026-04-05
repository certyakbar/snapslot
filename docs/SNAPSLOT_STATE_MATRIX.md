# SnapSlot State Matrix

## 1. Purpose
This file locks SnapSlot’s state truth before further implementation work.

It exists to define, for every meaningful state transition:
- whether it is allowed
- which actor may trigger it
- what event causes it
- which route/API is responsible
- what UI must expose it
- what notification is expected
- what proof is required
- whether the transition is current-phase, deferred, proven, or still unverified

This file is subordinate to:
- Constitution = product law
- Architecture = system design
- Acceptance Ledger = current proof truth
- Phase Tasks = execution order

If those sources disagree:
- Constitution defines intended law
- Acceptance Ledger defines current proof
- this matrix must surface contradictions, not hide them

---

## 2. Global matrix rules

### 2.1 Current-phase rule
A current-phase state must not remain decorative.
If a state is current-phase, it must eventually have:
- backend truth
- UI truth
- validation truth
- proof truth

### 2.2 Deferred-state rule
A deferred state must not appear as:
- a working UI control
- a claimed completed workflow
- a misleading success message
- an implied supported lifecycle

### 2.3 Transition rule
Every transition must state:
- actor
- trigger
- route owner
- UI owner
- notification impact
- proof requirement

### 2.4 Contradiction rule
If code declares a state but current proof does not prove it, the transition remains:
- UNVERIFIED
- PARTIAL
- or DEFERRED

Never silently upgraded to DONE.

---

## 3. Canonical state sets

### 3.1 BusinessStatus
Current:
- active
- suspended
- deactivated

### 3.2 BookingStatus
Current:
- pending_payment
- confirmed
- rescheduled
- cancelled
- completed

Deferred:
- no_show

### 3.3 PaymentStatus
Current:
- not_required
- pending
- paid
- failed
- refunded

Deferred:
- partially_refunded

### 3.4 SubscriptionStatus
Current planning set:
- active
- suspended
- cancellation_requested
- cancelled
- expired

Planning note:
The local Acceptance Ledger proves active, suspended, deactivated, and cancellation-request behavior in subscription/billing flows, so subscription normalization remains a live planning concern, not greenfield fantasy. Exact naming must be normalized later without lying about current proof.

---

## 4. BusinessStatus transition matrix

| From | To | Allowed? | Phase | Actor | Trigger | Route / API | UI surface | Notification | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| none | active | YES | Current | Platform Owner / signup system | Business account created | Business registration flow | Signup / owner creation | None required | registration + default status proof | Business registration is PASS in ledger; exact status initialization route is implicit in current flow |
| active | suspended | YES | Current | Platform Owner | Account suspension / billing action | Platform-admin business action route; exact path to confirm in Route Matrix | Platform Owner dashboard | Optional account-status message, not customer booking message | status transition proof + route proof + public/admin gating proof | Ledger proves suspended business booking page returns 503 and booking submit returns 503 fileciteturn69file0 |
| suspended | active | YES | Current | Platform Owner | Reactivation action | Platform-admin business action route; exact path to confirm in Route Matrix | Platform Owner dashboard | Optional account reactivated message | reactivation proof + route proof + gating reversal proof | Ledger proves reactivate action exists in subscription tests fileciteturn69file0 |
| active | deactivated | YES | Current | Platform Owner | Deactivate action | Platform-admin business action route; exact path to confirm in Route Matrix | Platform Owner dashboard | Optional internal/account message | deactivation proof + public/admin offlining proof | Ledger proves deactivation action exists in subscription tests and flags GDPR retention timing fileciteturn69file0 |
| suspended | deactivated | YES | Current | Platform Owner | Deactivate suspended business | Platform-admin business action route; exact path to confirm in Route Matrix | Platform Owner dashboard | Optional internal/account message | deactivation proof from suspended state | Not separately proven; treat as logically allowed but exact proof remains UNVERIFIED until matrix/route audit |
| deactivated | active | YES | Current | Platform Owner | Reactivation after deactivation | Platform-admin business action route; exact path to confirm in Route Matrix | Platform Owner dashboard | Optional account restored message | reactivation proof from deactivated state | Constitution allows platform owner reactivation; exact current proof from deactivated -> active remains UNVERIFIED |
| deactivated | suspended | BLOCK by default | Current | Platform Owner | N/A | N/A | No UI control until justified | None | explicit design decision if ever needed | Not required now; avoid extra branching |
| suspended | suspended | BLOCK / no-op | Current | Platform Owner | repeated suspend | same action route if attempted | Platform Owner dashboard should avoid duplicate action or reject clearly | None | duplicate action behavior proof | Should be idempotent or rejected; exact behavior to be proven in owner workflow |
| active | active | BLOCK / no-op | Current | Platform Owner | repeated activate | same action route if attempted | avoid duplicate control or reject clearly | None | duplicate action behavior proof | Same as above |
| deactivated | deactivated | BLOCK / no-op | Current | Platform Owner | repeated deactivate | same action route if attempted | avoid duplicate control or reject clearly | None | duplicate action behavior proof | Same as above |

### BusinessStatus operational rules
- Suspended businesses are read-only: admin can log in and view, but cannot mutate; public booking cannot proceed. This is Constitution law and Architecture law fileciteturn69file2 fileciteturn69file1
- Deactivated businesses are offline for booking and business operation until platform-owner restoration fileciteturn69file2
- Exact platform-admin route names must be confirmed in the Route Matrix because the uploaded proof names actions but not every path explicitly.

---

## 5. BookingStatus transition matrix

| From | To | Allowed? | Phase | Actor | Trigger | Route / API | UI surface | Notification | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| none | pending_payment | YES | Current | Customer or Business Admin | Booking created when deposit/payment required | `POST /api/booking-page/:slug/bookings` and authenticated booking create route | Public booking page / business booking creation | Payment required | booking creation proof + payment-required copy proof | Proven in ledger: deposit-enabled booking creates `pending_payment` / `pending` fileciteturn69file0 |
| none | confirmed | YES | Current | Customer or Business Admin | Booking created when payment not required | `POST /api/booking-page/:slug/bookings` and authenticated booking create route | Public booking page / business booking creation | Booking confirmation | booking creation proof + confirmation copy proof | Proven in ledger: deposit-disabled booking creates `confirmed` / `not_required` fileciteturn69file0 |
| pending_payment | confirmed | YES | Current | Business Admin | Payment marked paid | `PATCH /api/business/:businessId/bookings/:bookingId/payment` | Business Admin dashboard payment action | Payment received | transition proof + UI proof + notification proof | Proven in store logic and ledger `mark_paid` flow fileciteturn70file0 fileciteturn69file0 |
| pending_payment | cancelled | YES | Current | Business Admin | Cancel booking | `PATCH /api/business/:businessId/bookings/:bookingId/cancel` | Business Admin dashboard cancel action | Cancellation notification | cancel proof + UI proof | Cancellation is proven; applies to active bookings broadly fileciteturn71file0 fileciteturn69file0 |
| pending_payment | rescheduled | YES | Current | Business Admin | Reschedule booking before payment completion | `PATCH /api/business/:businessId/bookings/:bookingId/reschedule` | Business Admin dashboard reschedule action | Reschedule notification | reschedule proof + UI proof | Backend and proof exist; UI completion must remain aligned if not yet fully proven in ledger |
| confirmed | cancelled | YES | Current | Business Admin | Cancel confirmed booking | `PATCH /api/business/:businessId/bookings/:bookingId/cancel` | Business Admin dashboard cancel action | Cancellation notification | cancel proof + UI proof | Proven in ledger and server routes fileciteturn71file0 fileciteturn69file0 |
| confirmed | rescheduled | YES | Current | Business Admin | Reschedule confirmed booking | `PATCH /api/business/:businessId/bookings/:bookingId/reschedule` | Business Admin dashboard reschedule action | Reschedule notification | reschedule proof + UI proof | Proven in ledger and store logic fileciteturn70file0 fileciteturn69file0 |
| confirmed | completed | YES | Current | Business Admin | Mark booking as completed after service delivered | Route to confirm in Route Matrix; current code truth not yet verified from fetched server | Business Admin dashboard complete action | Usually none | backend route proof + UI proof + state reachability proof | Constitution/Architecture say `completed` is current-phase; current proof remains UNVERIFIED until route/UI evidence exists fileciteturn69file2 fileciteturn69file1 |
| rescheduled | cancelled | YES | Current | Business Admin | Cancel rescheduled booking | `PATCH /api/business/:businessId/bookings/:bookingId/cancel` | Business Admin dashboard cancel action | Cancellation notification | cancel proof from rescheduled state | Store treats `rescheduled` as active for conflict logic; exact cancel-from-rescheduled proof not separately called out, so keep partially proven |
| rescheduled | completed | YES | Current | Business Admin | Complete rescheduled booking after service delivered | Route to confirm in Route Matrix | Business Admin dashboard complete action | Usually none | complete proof from rescheduled state | Planning-allowed; current proof UNVERIFIED |
| pending_payment | completed | BLOCK | Current | N/A | N/A | N/A | no UI | None | explicit negative proof desirable | Cannot complete unpaid/pending booking without confirmation/payment truth |
| cancelled | anything active | BLOCK | Current | N/A | N/A | N/A | no UI | None | negative transition proof | Store rejects cancellation of already-cancelled booking in reschedule test context; reopening cancelled bookings is not current-phase |
| completed | anything else | BLOCK | Current | N/A | N/A | N/A | no UI | None | negative transition proof | Store treats completed as terminal for reschedule eligibility fileciteturn70file0 |
| none | no_show | BLOCK / deferred | Deferred | N/A | deferred feature | none | none | none | defer explicitly | Must not appear as current-phase UI or claim |
| confirmed | no_show | BLOCK / deferred | Deferred | N/A | deferred feature | none | none | none | defer explicitly | Deferred by Constitution/Phase plan fileciteturn69file2 fileciteturn69file3 |
| rescheduled | no_show | BLOCK / deferred | Deferred | N/A | deferred feature | none | none | none | defer explicitly | Same as above |

### BookingStatus operational rules
- `pending_payment` reserves a slot but must never be labeled confirmed fileciteturn69file2
- `rescheduled` remains active for conflict prevention in current code truth, so the new time continues to block slot availability fileciteturn68file0
- `completed` is product-law current-phase, but proof must still confirm route and UI reachability before it is treated as fully implemented.
- `no_show` remains deferred and must not leak into current UI or completion claims.

---

## 6. PaymentStatus transition matrix

| From | To | Allowed? | Phase | Actor | Trigger | Route / API | UI surface | Notification | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| none | not_required | YES | Current | System | Booking created with deposit disabled | booking create route | Public booking result / admin booking row | Booking confirmation | creation proof + copy truth proof | Proven in payments ledger fileciteturn69file0 |
| none | pending | YES | Current | System | Booking created with deposit enabled | booking create route | Public booking result / admin booking row | Payment required | creation proof + copy truth proof | Proven in payments ledger fileciteturn69file0 |
| pending | paid | YES | Current | Business Admin | Mark paid | `PATCH /api/business/:businessId/bookings/:bookingId/payment` | Business Admin dashboard payment action | Payment received | transition proof + UI proof | Proven in ledger and store allowedTransitions fileciteturn70file0 fileciteturn69file0 |
| pending | failed | YES | Current | Business Admin | Mark failed | `PATCH /api/business/:businessId/bookings/:bookingId/payment` | Business Admin dashboard payment action | Payment failed | transition proof + UI proof + notification proof | Allowed in current code transitions; Constitution says current-phase; full UI/proof must be confirmed because earlier audits flagged reachability gaps fileciteturn70file0 |
| failed | pending | YES | Current | Business Admin | Re-open payment after failure | same payment patch route | Business Admin dashboard payment action if exposed | Usually payment required / retry prompt, exact messaging to confirm | transition proof + UI proof | Allowed in store code; exact current UI exposure/proof still to confirm fileciteturn70file0 |
| failed | paid | YES | Current | Business Admin | Recover payment and mark paid | same payment patch route | Business Admin dashboard payment action | Payment received | transition proof + UI proof | Allowed in store code; exact current proof needs confirmation if not already covered |
| paid | refunded | YES | Current | Business Admin | Refund payment | `PATCH /api/business/:businessId/bookings/:bookingId/payment` | Business Admin dashboard refund action | Refund issued | refund proof + UI proof | Proven in payments ledger and store logic; booking consequence currently becomes cancelled fileciteturn70file0 fileciteturn69file0 |
| paid | partially_refunded | BLOCK / deferred | Deferred | N/A | deferred feature | none for current-phase claims | none | none | defer explicitly | Code union and store transitions allow it, but Constitution defers it; must not be treated as current supported feature fileciteturn70file0 fileciteturn69file2 |
| not_required | any other | BLOCK | Current | N/A | N/A | no route should allow | no UI | none | negative transition proof | Store transition table disallows transitions from `not_required` fileciteturn70file0 |
| refunded | any other | BLOCK | Current | N/A | N/A | no route should allow | no UI | none | negative transition proof | Store transition table treats refunded as terminal fileciteturn70file0 |
| partially_refunded | any other | BLOCK / deferred | Deferred | N/A | deferred feature | none | none | none | defer explicitly | Same as above |

### PaymentStatus operational rules
- Payment state and booking state must never contradict each other fileciteturn69file2
- Current store truth:
  - `paid` forces booking `confirmed`
  - `refunded` forces booking `cancelled` fileciteturn70file0
- `failed` is current-phase by planning law, so route + UI + notification reachability must be explicitly proven before closure.
- `partially_refunded` remains deferred even though code unions and transitions mention it; this is exactly the kind of contradiction the Contradiction Log must track.

---

## 7. SubscriptionStatus planning matrix

| From | To | Allowed? | Phase | Actor | Trigger | Route / API | UI surface | Notification | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| none | active | YES | Current | System / signup provisioning | New business created with live subscription state | signup + subscription initialization path | Platform Owner visibility / Business account status | Optional welcome/billing message | initialization proof | Local Acceptance Ledger proves fresh business has `subscriptionStatus: "active"` and next billing date ~30 days ahead fileciteturn69file0 |
| active | suspended | YES | Current | Platform Owner | Suspend for billing/account action | platform-admin billing/action route (exact path to confirm in Route Matrix) | Platform Owner dashboard + Business account status | Optional account suspended message | suspend proof | Proven in local ledger subscription tests fileciteturn69file0 |
| suspended | active | YES | Current | Platform Owner | Reactivate business subscription | platform-admin billing/action route | Platform Owner dashboard + Business account status | Optional account restored message | reactivate proof | Proven in local ledger subscription tests fileciteturn69file0 |
| active | cancellation_requested | YES | Current | Business Admin | Business requests cancellation | business cancellation request route (exact path to confirm in Route Matrix) | Business Admin account/subscription area | Optional cancellation-request acknowledgement | cancellation request proof | Proven in local ledger: status stays active, `cancellationRequestedAt` set, event recorded fileciteturn69file0 |
| cancellation_requested | cancelled | YES | Current planning / normalization | System or Platform Owner | Billing period end / explicit final cancellation | route/system job to confirm in Route Matrix | Platform Owner + Business account status | Optional cancellation finalization message | final cancellation proof | Architecture/Phase plan require normalization; current exact proof not yet surfaced |
| active | cancelled | YES, if explicit immediate cancellation policy exists | Current planning / normalization | Platform Owner | Immediate platform-side cancellation, if allowed | route to confirm | Platform Owner dashboard | Optional cancellation message | exact policy proof | Not currently asserted in uploaded proof; keep UNVERIFIED until explicit policy |
| cancelled | active | YES, if reactivation policy supports restoration | Current planning / normalization | Platform Owner | Reactivate cancelled subscription | route to confirm | Platform Owner dashboard / Business account status | Optional reactivation message | exact reactivation proof | Architecture expects reactivation behavior eventually; current proof not explicit |
| any active-like state | expired | YES, if non-payment/period end model uses expiry | Current planning / normalization | System | billing period expiry without payment | scheduled/system path to confirm | Business/Admin + Owner status display | Optional expiry message | expiry proof | Planned normalization state; local proof currently uses suspended/deactivated language more than expired |
| suspended | cancelled | YES, if policy allows closure while suspended | Current planning / normalization | Platform Owner or System | cancellation finalization | route/system path to confirm | owner/business status | Optional cancellation message | exact policy proof | UNVERIFIED until normalized |
| cancelled | expired | BLOCK | Current planning | N/A | N/A | none | none | none | none | Avoid redundant end states unless design later justifies them |

### SubscriptionStatus normalization notes
- The local Acceptance Ledger already proves subscription/billing behavior exists, including active, suspended, cancellation request, reactivation, and deactivation-related flows fileciteturn69file0
- The planning set narrows to `active`, `suspended`, `cancellation_requested`, `cancelled`, `expired`, which is cleaner, but this naming must be normalized without denying currently proven behavior.
- Exact route names and final cancellation/expiry mechanics must be nailed down in the Route Matrix and Contradiction Log.

---

## 8. Matrix-level contradictions to carry forward

1. **Booking `completed`**
   - Constitution and Architecture treat it as current-phase.
   - Current fetched code snippets do not yet prove the route/UI path in the same way cancellation/reschedule/payment are proven.
   - Action: keep as current-phase required, but mark route/UI proof UNVERIFIED until Route/UI matrices confirm.

2. **Payment `failed`**
   - Constitution and Phase plan treat it as current-phase.
   - Store code allows it.
   - Full UI and notification proof must still be confirmed if not already surfaced in the latest local proof set.

3. **Payment `partially_refunded`**
   - Code union and store transitions mention it.
   - Constitution and Phase plan defer it.
   - Action: treat as deferred; do not expose in current-phase UI; log contradiction.

4. **Subscription state naming**
   - Local proof includes active/suspended/deactivated/cancellation behavior.
   - Planning set narrows to active/suspended/cancellation_requested/cancelled/expired.
   - Action: normalize names later without falsifying current proof.

---

## 9. Universal matrix exit gate
The State Matrix is only considered ready when:
- every current-phase state is listed
- every deferred state is explicitly blocked from current-phase completion claims
- every allowed transition has actor, trigger, route owner, UI owner, and proof requirement
- every contradiction is surfaced
- no unsupported state is silently treated as complete

Anything less means the matrix remains open.
