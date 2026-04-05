# SnapSlot Route Matrix

## 1. Purpose
This file locks SnapSlot’s route truth before further implementation work.

It exists to define, for every meaningful route:
- actor
- auth requirement
- business-status allowance
- read/write classification
- validation responsibility
- state effects
- notification effects
- proof requirement
- current status: current-phase, deferred, proven, unverified, or contradictory

This file is subordinate to:
- Constitution = product law
- Architecture = system design
- Acceptance Ledger = current proof truth
- Phase Tasks = execution order and gates
- State Matrix = state-transition truth

If those sources disagree:
- Constitution defines intended law
- Acceptance Ledger defines current proof
- code defines current implementation reality
- this matrix must surface contradictions, not hide them

---

## 2. Global route rules

### 2.1 Route truth rule
A route is not “done” because it exists.
A route is only considered complete when:
- auth is correct
- ownership is correct
- business-status behavior is correct
- validation is correct
- state effects are correct
- UI usage is truthful
- proof exists

### 2.2 Public-route rule
Public routes must never break:
- tenant isolation
- booking truth
- business-status truth
- payment-copy truth

### 2.3 Admin-route rule
Business admin routes must never:
- leak another tenant’s data
- mutate while business is suspended
- expose unsupported lifecycle actions
- silently bypass backend truth

### 2.4 Owner-route rule
Platform-owner routes must:
- stay separate from business-admin routes
- control account/subscription/platform truth only
- not become a second business dashboard without reason

### 2.5 Deferred-route rule
Deferred features must not gain:
- live routes
- exposed UI
- completion claims
unless the Constitution, Architecture, Phase Tasks, and proof boundary are updated together.

---

## 3. Route categories

### 3.1 Public customer routes
Purpose:
- render public booking page
- return business public info
- return active services
- return valid slots
- create truthful bookings

### 3.2 Business admin routes
Purpose:
- operate one tenant’s booking system
- manage services, availability, blocked times, bookings, and payment settings
- fetch QR/share info
- view account and booking truth

### 3.3 Business auth/session routes
Purpose:
- signup
- login
- logout
- session restore

### 3.4 Platform-owner routes
Purpose:
- operate the platform
- inspect businesses
- enforce business/subscription/account status

### 3.5 Static page routes
Purpose:
- serve signup/login/admin/public pages
- enforce redirect/session behavior truthfully

---

## 4. Business auth and session routes

| Route | Actor | Auth required | Business status allowed | Read/Write | Validation | State effects | Notification | UI surface | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /api/signup` | Business Admin (new business owner) | No | N/A (creates business) | Write | businessName, ownerName, email, password, timezone, bookingSlug; slug uniqueness; email uniqueness; timezone validity | creates business; creates initial business session | None required | Signup page | signup proof + session creation proof | Proven PASS in local ledger fileciteturn69file0 |
| `POST /api/login` | Business Admin | No | Active only by product law; suspended/deactivated handling must be aligned if implemented | Write | email/password required; rate limit; password verification | creates business session | None required | Login page | login proof + rate-limit behavior proof + status-gating proof | Login PASS in ledger; exact suspended/deactivated login behavior still needs explicit route proof if added later fileciteturn69file0 |
| `POST /api/logout` | Business Admin | Session required to have effect; safe if absent | active / suspended session if present | Write | none beyond session parsing | destroys session cookie/session | None | Login/Admin logout control | logout proof | Proven PASS in local ledger fileciteturn69file0 |
| `GET /api/session` | Business Admin | Yes | active / suspended session view allowed; deactivated behavior to normalize with auth policy | Read | session cookie parsing | none | None | Admin/session bootstrap | session proof + business-status behavior proof | Proven PASS in local ledger for session protection and session truth fileciteturn69file0 |

### Auth/session route notes
- Current server code proves signup/login/logout/session behavior for business owners and uses a tenant-scoped session cookie route family.
- Password reset is required by Constitution and Architecture, but no route is currently proven in the uploaded proof set, so it remains planning-required and route-UNVERIFIED fileciteturn69file2 fileciteturn69file1

---

## 5. Public customer routes

| Route | Actor | Auth required | Business status allowed | Read/Write | Validation | State effects | Notification | UI surface | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /booking/:slug` | Customer | No | active = allowed; suspended = viewable but non-bookable / 503 policy per proof; deactivated = unavailable | Read | slug resolution | none | None | Public booking page | page availability proof by status | Local ledger proves suspended business page returns 503 in current proof boundary fileciteturn69file0 |
| `GET /api/booking-page/:slug` | Customer | No | active; suspended/deactivated behavior must align with public visibility law | Read | slug required/sanitized | none | None | Public booking page bootstrap | slug/business lookup proof | Public booking page resolution and slug isolation proven in ledger fileciteturn69file0 |
| `GET /api/booking-page/:slug/services` | Customer | No | active; suspended may be viewable but must not imply bookability; deactivated unavailable | Read | slug resolution | none | None | Public services list | active-only services proof + status-gating proof | Service isolation and active-public-service rules are proven at a higher level; exact suspended/deactivated services route behavior must be normalized |
| `GET /api/booking-page/:slug/slots` | Customer | No | active only for live slot booking truth; suspended/deactivated must not present misleading bookable slots | Read | slug; date; serviceIds; stepMinutes | none | None | Public slot picker | slot truth proof + status-gating proof | Slot generation is PASS in local proof; suspended/deactivated slot-route behavior must align with business-status law fileciteturn69file0 |
| `POST /api/booking-page/:slug/bookings` | Customer | No | active only; suspended/deactivated blocked | Write | requestedStart; serviceIds; customer name/phone/email; backend booking validation | creates booking; booking/payment status set | booking confirmation or payment required | Public booking submit | booking creation proof + payment-dependent copy proof + inactive-business blocking proof | Proven PASS in local ledger; suspended booking submit returns 503 in local proof boundary fileciteturn69file0 |

### Public-route notes
- Public booking flow must remain scoped to one business and must never say “confirmed” when the booking is actually `pending_payment` / `pending` fileciteturn69file2
- Exact 503 vs view-only behavior for suspended public routes must stay consistent across page, services, slots, and booking create once normalized.

---

## 6. Business account and configuration routes

| Route | Actor | Auth required | Business status allowed | Read/Write | Validation | State effects | Notification | UI surface | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /api/business/:businessId` | Business Admin (own tenant only) | Yes | active + suspended read-only; deactivated per auth policy | Read | business session ownership | none | None | Admin bootstrap/account view | ownership proof | Proven through session/tenant isolation tests in ledger fileciteturn69file0 |
| `GET /api/business/:businessId/payment-config` | Business Admin | Yes | active + suspended read-only | Read | business session ownership | none | None | Payment Settings panel | config read proof | Payment config flow proven via payments ledger fileciteturn69file0 |
| `PUT /api/business/:businessId/payment-config` | Business Admin | Yes | active only; suspended blocked | Write | depositEnabled, depositType, depositAmount, paymentLabel length/rules | updates business payment config | None | Payment Settings panel | config write proof + suspended-write blocking proof | Payment config save/read proven; suspended-write enforcement remains a cross-cutting route requirement fileciteturn69file0 |
| `GET /api/business/:businessId/qr` | Business Admin | Yes | active + suspended read-only | Read | business session ownership | none | None | QR / share panel | tenant isolation proof + QR ownership proof | QR isolation PASS in local ledger; current implementation uses third-party QR URL and must later be normalized to internal QR generation per Constitution/Architecture fileciteturn69file0 |

### Business account/config route notes
- QR/share remains current-phase, but internal generation is still an architectural requirement even though the current proof boundary passes with an authenticated business-scoped QR endpoint.
- Suspended businesses may view but must not mutate configuration.

---

## 7. Service routes

| Route | Actor | Auth required | Business status allowed | Read/Write | Validation | State effects | Notification | UI surface | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /api/business/:businessId/services` | Business Admin | Yes | active + suspended read-only | Read | business session ownership | none | None | Services panel | service visibility proof | PASS in local ledger, including tenant isolation fileciteturn69file0 |
| `POST /api/business/:businessId/services` | Business Admin | Yes | active only; suspended blocked | Write | name, durationMinutes integer > 0, bufferMinutes integer >= 0, price >= 0 | creates service | None | Services panel create flow | create proof + validation proof + suspended-write blocking proof | Service create/list PASS in local ledger fileciteturn69file0 |
| `PATCH /api/business/:businessId/services/:serviceId` | Business Admin | Yes | active only; suspended blocked | Write | partial service update validation; integer alignment | updates service | None | Services panel edit/activate/deactivate flow | edit proof + validation proof + suspended-write blocking proof | Service edit/activate/deactivate PASS in local ledger fileciteturn69file0 |
| `DELETE /api/business/:businessId/services/:serviceId` | Business Admin | Yes | active only; suspended blocked | Write | ownership + service existence | removes service | None | Services panel remove flow | delete proof + suspended-write blocking proof | Service remove PASS in local ledger fileciteturn69file0 |

### Service-route notes
- Frontend/backend validation alignment on integer duration/buffer remains an explicit planning requirement from Phase Tasks and Architecture.
- Inactive services must never enter public booking flow.

---

## 8. Availability and blocked-time routes

| Route | Actor | Auth required | Business status allowed | Read/Write | Validation | State effects | Notification | UI surface | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /api/business/:businessId/availability` | Business Admin | Yes | active + suspended read-only | Read | business session ownership | none | None | Availability panel | availability read proof | Weekly availability PASS in local ledger fileciteturn69file0 |
| `PUT /api/business/:businessId/availability` | Business Admin | Yes | active only; suspended blocked | Write | weekly window validation, overlap rules, active flags | replaces weekly availability | None | Availability panel save flow | availability write proof + validation proof + suspended-write blocking proof | Weekly availability and multiple windows PASS in local ledger fileciteturn69file0 |
| `GET /api/business/:businessId/blocked-times` | Business Admin | Yes | active + suspended read-only | Read | business ownership + date query | none | None | Blocked Times panel | blocked-time read proof | Blocked-time lifecycle PASS in local ledger fileciteturn69file0 |
| `POST /api/business/:businessId/blocked-times` | Business Admin | Yes | active only; suspended blocked | Write | start/end validity, reason optional | creates blocked time | None | Blocked Times panel create flow | create proof + suspended-write blocking proof | PASS in local ledger fileciteturn69file0 |
| `PATCH /api/business/:businessId/blocked-times/:blockedTimeId` | Business Admin | Yes | active only; suspended blocked | Write | start/end validity; existence | updates blocked time | None | Blocked Times panel edit flow | edit proof + suspended-write blocking proof | PASS in local ledger fileciteturn69file0 |
| `DELETE /api/business/:businessId/blocked-times/:blockedTimeId` | Business Admin | Yes | active only; suspended blocked | Write | existence + ownership | deletes blocked time | None | Blocked Times panel delete flow | delete proof + suspended-write blocking proof | PASS in local ledger fileciteturn69file0 |
| `GET /api/business/:businessId/slots` | Business Admin | Yes | active + suspended read-only | Read | date; serviceIds; stepMinutes; ownership | none | None | Admin slot preview / booking tools | slot generation proof + status behavior proof | Slot generation PASS in local ledger; suspended read-only policy should allow view if truthful |

### Availability/blocked-time route notes
- Slot generation must always respect business status, even on admin-facing slot previews, to avoid showing live-bookable behavior for inactive businesses where that would mislead.

---

## 9. Booking routes (business-admin surface)

| Route | Actor | Auth required | Business status allowed | Read/Write | Validation | State effects | Notification | UI surface | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /api/business/:businessId/bookings` | Business Admin | Yes | active + suspended read-only | Read | ownership | none | None | Bookings panel | booking visibility proof | PASS in local ledger with tenant isolation fileciteturn69file0 |
| `POST /api/business/:businessId/bookings` | Business Admin | Yes | active only; suspended blocked | Write | same booking validation as public create | creates booking; sets booking/payment status | booking confirmation or payment required | Admin booking creation flow if exposed | booking create proof + suspended-write blocking proof | Booking creation PASS in local ledger; exact admin-create UI exposure to confirm in UI Matrix fileciteturn69file0 |
| `PATCH /api/business/:businessId/bookings/:bookingId/cancel` | Business Admin | Yes | active only; suspended blocked | Write | ownership; booking existence | booking -> cancelled | Cancellation notification | Bookings panel cancel action | cancel proof + UI proof + suspended-write blocking proof | PASS in local ledger and route code fileciteturn69file0 |
| `PATCH /api/business/:businessId/bookings/:bookingId/reschedule` | Business Admin | Yes | active only; suspended blocked | Write | new requestedStart; future time; availability/conflict checks; active booking only | booking -> rescheduled, updates times | Reschedule notification | Bookings panel reschedule action | reschedule proof + UI proof + suspended-write blocking proof | PASS in local ledger for backend/proof; UI closure must remain aligned fileciteturn69file0 |
| `PATCH /api/business/:businessId/bookings/:bookingId/complete` | Business Admin | Yes | active only; suspended blocked | Write | booking existence; valid active booking only | booking -> completed | Usually none | Bookings panel complete action | route proof + UI proof + state reachability proof | Required by Constitution/Architecture/Phase Tasks, but exact current route not proven in fetched server file or uploaded proof; mark UNVERIFIED until confirmed |
| `PATCH /api/business/:businessId/bookings/:bookingId/no-show` | Business Admin | N/A for current-phase | Deferred | N/A | none now | none now | none now | none | defer explicitly | Must not exist as current-phase supported route |

### Booking-route notes
- `complete` is a current-phase requirement by planning law, but must not be treated as implemented without exact route/UI/proof confirmation.
- `no_show` is deferred and must not leak into current-phase claims.

---

## 10. Payment-action routes

| Route | Actor | Auth required | Business status allowed | Read/Write | Validation | State effects | Notification | UI surface | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PATCH /api/business/:businessId/bookings/:bookingId/payment` with `paymentStatus=paid` | Business Admin | Yes | active only; suspended blocked | Write | allowed transition only | payment -> paid; booking -> confirmed | Payment received | Bookings / Payment UI | paid proof + UI proof | PASS in local ledger and store/server code fileciteturn69file0 |
| same route with `paymentStatus=failed` | Business Admin | Yes | active only; suspended blocked | Write | allowed transition only | payment -> failed; booking consequence must remain truthful | Payment failed | Bookings / Payment UI | failed proof + UI proof + notification proof | Allowed in current code and current-phase by planning law; exact current route/UI proof still requires closure |
| same route with `paymentStatus=refunded` | Business Admin | Yes | active only; suspended blocked | Write | allowed transition only | payment -> refunded; booking -> cancelled | Refund issued | Bookings / Payment UI | refund proof + UI proof | PASS in local ledger and code truth fileciteturn69file0 |
| same route with `paymentStatus=partially_refunded` | Business Admin | Deferred for current-phase | Deferred | N/A current-phase | none current-phase | none current-phase | none current-phase | none current-phase | defer explicitly | Current code may mention it, but Constitution defers it; do not expose now |

### Payment-route notes
- This route is powerful and must remain tightly validated.
- Current server notification logic already branches on paid and refunded/partially_refunded, which is why deferred-state contradiction handling matters.
- `failed` is current-phase in planning and must have route/UI/proof closure before sign-off.

---

## 11. Platform-owner and subscription/billing routes

| Route / Action family | Actor | Auth required | Business status allowed | Read/Write | Validation | State effects | Notification | UI surface | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Platform-owner login route(s) | Platform Owner | No | N/A | Write | owner credential validation | creates owner session | None required | Platform Owner login | auth proof | Local ledger proves platform admin login exists and wrong password returns 401; exact route path to confirm in Route Matrix follow-up if needed fileciteturn69file0 |
| Platform-owner business list route(s) | Platform Owner | Yes | all business records | Read | owner session | none | None | Platform Owner dashboard | list proof | Local ledger proves unauthenticated access blocked and authenticated list includes test business fileciteturn69file0 |
| Platform-owner billing action: `mark_paid` | Platform Owner | Yes | applicable active/suspended subscription contexts | Write | valid action only | advances next billing date; records payment event | optional billing/account message | Platform Owner dashboard | billing action proof | PASS in local ledger subscription tests fileciteturn69file0 |
| Platform-owner billing action: `suspend` | Platform Owner | Yes | active | Write | valid action only | subscription/account -> suspended; blocks booking activity | optional suspension/account message | Platform Owner dashboard | suspend proof + public/admin gating proof | PASS in local ledger subscription tests fileciteturn69file0 |
| Platform-owner billing action: `reactivate` | Platform Owner | Yes | suspended / deactivated depending policy | Write | valid action only | subscription/account -> active; restores operation | optional reactivation message | Platform Owner dashboard | reactivate proof | PASS in local ledger subscription tests fileciteturn69file0 |
| Platform-owner billing action: `deactivate` | Platform Owner | Yes | active or suspended | Write | valid action only | business -> deactivated; booking unavailable | optional account message | Platform Owner dashboard | deactivate proof | PASS in local ledger subscription tests fileciteturn69file0 |
| Business-admin cancellation request route(s) | Business Admin | Yes | active subscription | Write | prevent duplicate requests | subscription -> cancellation_requested (or equivalent fields) | optional acknowledgement | Business account/subscription area | cancellation request proof | PASS in local ledger subscription tests, but exact route path to confirm in Route Matrix or follow-up extraction fileciteturn69file0 |

### Platform-owner / billing route notes
- The uploaded local proof set is enough to treat these workflows as real.
- Exact route path names may still need confirmation from code extraction, but the matrix is honest about that instead of inventing them.
- Owner routes must stay narrow and not duplicate tenant operations without need.

---

## 12. Static page and redirect routes

| Route | Actor | Auth required | Business status allowed | Read/Write | Validation | State effects | Notification | UI surface | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /signup` | Business Admin (new) | No; redirects if already signed in | N/A / active signed-in session redirect | Read | session check | none | None | Signup page | redirect proof | Current server code redirects signed-in business user to own admin |
| `GET /login` | Business Admin | No; redirects if already signed in | active/suspended session redirect policy must stay truthful | Read | session check | none | None | Login page | redirect proof | Current server code redirects signed-in business user to own admin |
| `GET /admin/:businessId` | Business Admin | Yes | active + suspended read-only; deactivated policy to align | Read | session ownership check | none | None | Admin page shell | admin-route protection proof | PASS in local ledger for ownership/redirect behavior fileciteturn69file0 |
| `GET /booking/:slug` | Customer | No | active; suspended/deactivated per status policy | Read | slug resolved later by page JS/API | none | None | Public booking page shell | public page proof | Covered above and in local ledger fileciteturn69file0 |
| `GET /health` | System / operator | No | N/A | Read | none | none | None | health check | simple route proof | Exists in current server code; not product-facing workflow route |

### Static-route notes
- Redirect behavior is already explicitly proven in the local ledger for signup/login/admin flows.
- Deactivated business admin page behavior needs final policy normalization if not already pinned elsewhere.

---

## 13. Routes that must exist but remain unverified or planned

| Route / family | Why required | Current status |
| --- | --- | --- |
| Password reset request + reset submit routes | Constitution and Architecture require password reset for trust | UNVERIFIED / not proven in uploaded local proof set |
| Booking complete route if separate from generic booking patch | Constitution, Architecture, and Phase Tasks make `completed` current-phase | UNVERIFIED until route/UI/proof confirmed |
| Internal QR generation endpoint or normalized QR implementation | Constitution and Architecture require internal QR, while current proof passes with authenticated QR endpoint using third-party generation | PARTIAL / normalization required |
| Final subscription normalization routes for `cancelled` / `expired` naming if different from current proof language | Phase 10 normalization requires it | PLANNED / normalization required |

---

## 14. Route-level contradictions to carry forward

1. **Password reset**
   - Constitution/Architecture require it.
   - Local proof boundary marks it UNVERIFIED.
   - Action: keep as required but not implemented/proven.

2. **Booking complete**
   - Current-phase by Constitution/Architecture/Phase Tasks.
   - Exact route and proof not surfaced in the uploaded local proof set used for this planning pass.
   - Action: keep route requirement explicit; do not mark PASS.

3. **Internal QR**
   - Constitution/Architecture require internal QR generation.
   - Local proof boundary passes current QR isolation with authenticated QR route.
   - Action: keep current route as proven isolation mechanism, but mark internal-generation normalization still open.

4. **Payment failed**
   - Current-phase in law/planning.
   - Store code supports it.
   - Exact UI/notification closure still needs full proof if not already surfaced in later local implementation evidence.
   - Action: keep route current-phase, proof partly open.

5. **Subscription route naming**
   - Local proof proves billing/subscription operations.
   - Planning wants narrower normalized naming.
   - Action: route behavior is real; naming normalization remains future cleanup, not denial of proof.

---

## 15. Universal route-matrix exit gate
The Route Matrix is only considered ready when:
- every current-phase route family is listed
- every deferred route family is explicitly blocked from current-phase completion claims
- every route row includes actor, auth, business-status behavior, validation, state effects, and proof requirement
- every contradiction is surfaced
- no missing current-phase route is silently assumed complete

Anything less means the matrix remains open.
