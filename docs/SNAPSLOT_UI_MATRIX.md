# SnapSlot UI Matrix

## 1. Purpose
This file locks SnapSlot’s UI truth before further implementation work.

It exists to define, for every meaningful page, panel, and control:
- actor
- visibility rules
- disabled/read-only rules
- backend dependency
- state dependency
- success copy expectation
- error copy expectation
- drift risk
- proof requirement
- current status: current-phase, deferred, proven, unverified, or contradictory

This file is subordinate to:
- Constitution = product law
- Architecture = system design
- Acceptance Ledger = current proof truth
- Phase Tasks = execution order and gates
- State Matrix = state-transition truth
- Route Matrix = route ownership and validation truth

If those sources disagree:
- Constitution defines intended law
- Acceptance Ledger defines current proof
- code defines current implementation reality
- this matrix must surface contradictions, not hide them

---

## 2. Global UI rules

### 2.1 UI truth rule
A UI element is not “done” because it renders.
A UI element is only complete when:
- it maps to a real backend capability
- it reflects real state truth
- its copy is honest
- its disabled/hidden behavior is honest
- its success/error behavior is honest
- proof exists

### 2.2 No-fake-control rule
Do not show:
- a button for an unsupported backend action
- a status label stronger than backend truth
- a control that looks active while the business is suspended
- a “confirmed” message for a pending-payment booking
- a deferred feature as if it is current-phase

### 2.3 Read-only rule
Suspended businesses may view but not mutate.
UI must enforce this visibly:
- controls hidden or disabled
- clear suspension messaging
- no misleading interactive affordance
- no partial write illusion

### 2.4 Deferred-state rule
Deferred features must not gain live UI:
- `no_show`
- `partially_refunded`
- any extra role/permission system
- customer-account controls
- add-on or analytics clutter

### 2.5 UI proof rule
Each page/panel/control must eventually prove:
- it appears for the correct actor
- it hides or disables correctly
- it calls the correct route
- it shows truthful copy
- it handles failure honestly

---

## 3. Actor surfaces

### 3.1 Platform Owner surface
Purpose: run the platform.

Must include:
- owner login
- business list
- business status visibility
- suspend/reactivate/deactivate controls
- subscription/billing visibility
- payment/account health visibility

Must not become:
- a second business dashboard
- a bloated internal admin CMS

### 3.2 Business Admin surface
Purpose: run one business.

Must include:
- signup/login/logout
- services
- weekly availability
- blocked times
- bookings
- payment settings
- booking link / QR share
- subscription/account visibility

Suspended business:
- can log in
- can view
- cannot mutate
- public booking cannot proceed

### 3.3 Customer surface
Purpose: create a valid booking.

Must include:
- business identity
- active services
- valid slots only
- customer details
- truthful booking result

Must never:
- show false slots
- imply confirmation during pending payment
- expose another tenant
- expose admin/operator controls

---

## 4. Public customer UI matrix

### 4.1 Public booking page shell
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Booking page shell (`/booking/:slug`) | Customer | valid business page load | unavailable for deactivated; suspended behavior must match current truth | `GET /booking/:slug`, `GET /api/booking-page/:slug` | shows correct business identity | missing/invalid business handled honestly | misleading live shell for inactive business | page render proof + status behavior proof | Local proof shows suspended booking page currently returns 503; architecture allows either viewable-non-bookable or blocked, but behavior must stay consistent fileciteturn69file0 |
| Business identity header | Customer | valid business found | hidden if page not resolved | public business info route | business name/timezone truthful | “business unavailable” only if true | stale or wrong tenant identity | header proof | Business bootstrap proven in local proof boundary |

### 4.2 Public services area
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Services list | Customer | active services exist | hidden/empty-state if none; inactive services never shown | `GET /api/booking-page/:slug/services` | service name, duration, price truthful | “No services available” if truly none | showing inactive/internal services | active-only service proof | Constitution requires active services only; local proof supports public-service behavior fileciteturn69file2 |
| Service selection control | Customer | services loaded | non-interactive if business inactive or page blocked | public services + slot flow | selected services reflect request truth | validation copy for no services selected | selection UI not matching backend serviceIds | selection proof | Must remain customer-only, no hidden unsupported service metadata |

### 4.3 Public date/slot area
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Date picker | Customer | service selection valid | hidden/disabled if services unavailable or business inactive | slots route | chosen date reflected honestly | invalid date messaging | date UI implying slots before backend says so | date/slot flow proof | Part of proven booking flow |
| Slot list / picker | Customer | valid slots returned | empty state when no slots; blocked if business inactive | `GET /api/booking-page/:slug/slots` | only valid slots shown | “No slots available” truthful empty state | false availability | slot-truth proof | Constitution makes slot truth non-negotiable fileciteturn69file2 |
| Slot loading state | Customer | while slot request pending | N/A | slots route | honest loading only | honest fetch failure message | placeholder treated as real availability | loading/error proof | Must not patch over backend weakness with fake optimism |

### 4.4 Customer details and submit area
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Customer details form | Customer | slot selected / booking flow active | blocked if business inactive | booking create route | captures real required fields only | inline validation for missing/invalid fields | frontend fields drifting from backend requirements | form validation proof | Backend requires name, phone, email in current code truth |
| Submit booking button | Customer | required inputs valid enough | disabled while submitting; blocked for suspended/deactivated business | `POST /api/booking-page/:slug/bookings` | honest post-submit state | honest failure state | duplicate-submit / status lie | duplicate-submit proof + button-state proof | Local proof includes booking creation and suspended submit block fileciteturn69file0 |
| Booking success message — confirmed path | Customer | booking created with `confirmed` / `not_required` | hidden for pending-payment result | booking create response | confirmed only when backend is confirmed | none beyond true success | saying confirmed when not confirmed | copy-truth proof | Constitution explicitly forbids false confirmation fileciteturn69file2 |
| Booking success message — pending payment path | Customer | booking created with `pending_payment` / `pending` | hidden for confirmed result | booking create response | “reserved pending payment” or equivalent truthful wording | none beyond true success | optimistic lie about confirmation | copy-truth proof | Local proof and planning require this exact distinction fileciteturn69file0 |
| Public suspension/unavailable banner | Customer | business suspended or deactivated behavior exposed via UI path | hidden for active business | business-status-aware public behavior | “Bookings temporarily unavailable” or equivalent | same | misleading live-booking UI during suspension | inactive-business public proof | Must stay aligned with final status behavior choice |

---

## 5. Business auth UI matrix

### 5.1 Signup page
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Signup page shell | New Business Admin | user not already signed in | redirect if signed in | `GET /signup` | clear onboarding intent | honest redirect if already signed in | signup page shown to authenticated admin unnecessarily | redirect proof | Current server handles redirect |
| Signup form | New Business Admin | page loaded | submit disabled during request | `POST /api/signup` | created business + admin redirect truth | honest validation and duplicate-slug/email errors | frontend/backend signup validation drift | signup proof | Proven in local ledger |
| Signup success redirect | New Business Admin | signup succeeds | N/A | signup response | admin URL / booking URL truthful | none | false destination after signup | redirect proof | Proven |

### 5.2 Login/logout/session
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Login page shell | Business Admin | not currently signed in | redirect if already signed in | `GET /login` | clear sign-in intent | honest redirect if already signed in | login loop or wrong redirect | redirect proof | Proven |
| Login form | Business Admin | page loaded | submit disabled while authenticating | `POST /api/login` | redirects to correct admin page | invalid credentials / rate limit honest | auth ambiguity | login proof | Proven |
| Logout control | Business Admin | signed in | hidden otherwise | `POST /api/logout` | returns to signed-out state | honest failure if any | stale signed-in illusion | logout proof | Proven |
| Session bootstrap | Business Admin | admin shell load | handles missing session by redirect or 401 path | `GET /api/session` | restores correct tenant context | honest sign-in required state | wrong-tenant restore | session proof | Proven |
| Password reset UI | Business Admin | should exist once route family exists | N/A until implemented | password-reset routes | truthful reset messaging | honest invalid/expired token copy | fake trust surface without route support | route + UI proof | Required by Constitution/Architecture but still unverified/planned |

---

## 6. Business admin dashboard shell UI matrix

### 6.1 Admin shell and account state
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Admin page shell (`/admin/:businessId`) | Business Admin | valid signed-in owner for that business | redirect for no session or wrong tenant; deactivated policy to align | `GET /admin/:businessId`, session route | correct tenant shell only | honest redirect/access denial | cross-tenant admin shell | tenant-isolation proof | Proven in local ledger |
| Business summary header | Business Admin | session/business loaded | hidden if bootstrap fails | `GET /api/business/:businessId` | business identity/payment config/account state truthful | honest load failure | wrong-tenant summary | bootstrap proof | Proven |
| Suspended read-only banner | Business Admin | business is suspended | hidden for active; deactivated handled separately | business status truth | explicit suspension / read-only message | same | muted banner while controls still active | suspended-read-only proof | Required by Constitution/Architecture/Phase Tasks fileciteturn69file2 fileciteturn69file3 |
| Deactivated / account-status banner | Business Admin | deactivated policy routes to account-status page or blocks admin shell | hidden otherwise | business status truth | explicit deactivated/account offline message | same | letting deactivated admin operate | deactivated UX proof | Policy still needs final normalization if not fully surfaced |

---

## 7. Services panel UI matrix

| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Services list/table | Business Admin | admin session valid | read-only if suspended | `GET /api/business/:businessId/services` | service data truthful | honest load-failure state | list not matching backend state | panel proof | Proven in local proof |
| Service create form | Business Admin | active business | disabled/hidden if suspended | `POST /api/business/:businessId/services` | clear creation success | honest validation/load/save failure | create UI allowing invalid integers/values | create + validation proof | Validation alignment remains explicit planning concern |
| Service edit control | Business Admin | active business; service exists | disabled/hidden if suspended | `PATCH /api/business/:businessId/services/:serviceId` | edits reflect backend truth | honest failure | fake inline edit | edit proof | Proven flow in local ledger |
| Activate/deactivate toggle | Business Admin | active business; service exists | disabled/hidden if suspended | same patch route | active status truthful | honest failure | UI active flag drift from backend active flag | toggle proof | Proven |
| Remove/delete control | Business Admin | active business; service exists | disabled/hidden if suspended | `DELETE /api/business/:businessId/services/:serviceId` | removal truthful | honest failure / missing service message | destructive control visible during read-only state | delete proof | Proven |

---

## 8. Availability panel UI matrix

| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Weekly availability display | Business Admin | admin session valid | read-only if suspended | `GET /api/business/:businessId/availability` | windows shown truthfully | honest load failure | stale schedule view | availability-read proof | Proven |
| Availability editor | Business Admin | active business | disabled/hidden if suspended | `PUT /api/business/:businessId/availability` | save success truthful | overlap/validation errors honest | UI permitting impossible windows | save + validation proof | Proven |
| Multiple windows/day UI | Business Admin | editor enabled | hidden only if feature unsupported, which it is not | same availability route | accurate representation of multiple windows | honest validation | one-window UI for multi-window backend | multi-window proof | Proven in local ledger |
| Availability save button | Business Admin | editor has changes | disabled while saving or suspended | availability write route | success truthful | failure truthful | false saved state | button-state proof | Required as part of panel truth |

---

## 9. Blocked times panel UI matrix

| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Blocked-times list | Business Admin | admin session valid | read-only if suspended | `GET /api/business/:businessId/blocked-times` | blocked ranges truthful | honest load failure | stale or missing blocked state | list proof | Proven |
| Blocked-time create form | Business Admin | active business | disabled/hidden if suspended | `POST /api/business/:businessId/blocked-times` | create success truthful | invalid range/errors honest | write affordance during read-only state | create proof | Proven |
| Blocked-time edit control | Business Admin | active business | disabled/hidden if suspended | `PATCH /api/business/:businessId/blocked-times/:blockedTimeId` | edit success truthful | honest failure | edit affordance drift | edit proof | Proven |
| Blocked-time delete control | Business Admin | active business | disabled/hidden if suspended | `DELETE /api/business/:businessId/blocked-times/:blockedTimeId` | delete success truthful | honest failure | delete affordance drift | delete proof | Proven |

---

## 10. Bookings panel UI matrix

### 10.1 Booking visibility and actions
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bookings list/table | Business Admin | admin session valid | read-only if suspended | `GET /api/business/:businessId/bookings` | booking, service, payment, status truth | honest load failure | booking rows not matching backend | bookings panel proof | Proven |
| Cancel control | Business Admin | active business; cancellable booking | disabled/hidden if suspended or terminal booking | `PATCH /api/business/:businessId/bookings/:bookingId/cancel` | cancelled truthfully shown | honest failure | cancellation UI for unsupported state | cancel proof | Proven |
| Reschedule control | Business Admin | active business; active booking | disabled/hidden if suspended or terminal booking | `PATCH /api/business/:businessId/bookings/:bookingId/reschedule` | new time truthfully shown | honest failure | reschedule UI without valid backend/state guard | reschedule proof | Backend/proof present; full UI alignment must stay honest |
| Complete control | Business Admin | active business; completable booking | disabled/hidden if suspended or route not actually implemented | route to confirm in Route Matrix | “completed” only when backend truly completed | honest failure / hidden until supported | fake current-phase complete button | route + UI proof | Current-phase by law, but exact UI/route proof still unverified |
| No-show control | Business Admin | never current-phase | always hidden | none current-phase | none | none | deferred state leaking into UI | hidden-state proof | Must remain deferred |

### 10.2 Booking copy
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Booking status chip/label | Business Admin | booking row visible | N/A | booking list data | exact booking status | none | invented status text | copy proof | Must stay 1:1 with backend state |
| Payment status chip/label | Business Admin | booking row visible | N/A | booking list data | exact payment status | none | status euphemism hiding truth | copy proof | Must stay 1:1 with backend payment state |
| Deposit/payment amount visibility | Business Admin | booking row visible when relevant | hidden only if truly not relevant | booking/payment data | amount truthful | none | missing money truth in admin UI | amount visibility proof | Explicit planning requirement from prior audits/phase tasks |
| Booking error state | Business Admin | mutation fails | N/A | booking routes | no fake success | honest backend error | swallowed route failures | error proof | Required |

---

## 11. Payment settings and payment-action UI matrix

### 11.1 Payment settings panel
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Payment config form | Business Admin | admin session valid | read-only if suspended | `GET/PUT /api/business/:businessId/payment-config` | config truthfully reflected | validation/save failure honest | config UI drifting from backend rules | config proof | Proven |
| Deposit enabled toggle | Business Admin | active business | disabled/hidden if suspended | payment config route | truthful enabled/disabled state | honest failure | toggle lying about deposit requirement | toggle proof | Proven |
| Fixed/percentage selector | Business Admin | deposit enabled or editable | disabled if suspended | payment config route | selected type truthful | honest failure | money logic drift | selector proof | Proven |
| Payment label input | Business Admin | active business | disabled if suspended | payment config route | saved label truthful | validation honest | label implying stronger payment truth than backend | label proof | Proven |

### 11.2 Payment actions on bookings
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mark paid control | Business Admin | active business; pending/failed payment where allowed | hidden/disabled otherwise or when suspended | payment patch route | “paid” only after backend confirms | honest failure | fake paid state | paid proof | Proven |
| Mark failed control | Business Admin | active business; pending payment where allowed | hidden/disabled otherwise or when suspended | payment patch route | “failed” only after backend confirms | honest failure | control absent while state is current-phase or present without real support | failed proof | Current-phase by planning law; proof closure still needed if not fully surfaced |
| Refund control | Business Admin | active business; paid booking where allowed | hidden/disabled otherwise or when suspended | payment patch route | “refunded” only after backend confirms | honest failure | fake refund state | refund proof | Proven |
| Partially refund control | Business Admin | never current-phase | always hidden | none current-phase | none | none | deferred state leaking into UI | hidden-state proof | Must remain deferred |

---

## 12. QR and sharing panel UI matrix

| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Booking URL display | Business Admin | admin session valid | read-only if suspended | `GET /api/business/:businessId/qr` or normalized internal QR route | correct booking URL only | honest load failure | wrong-tenant booking URL | URL proof | Proven as business-scoped current flow |
| QR preview | Business Admin | route returns QR data | hidden if unavailable | QR route / future internal QR generation | QR corresponds to correct business page | honest load failure | external dependency treated as final solution | QR proof | Proven for isolation, but internal generation still required by law |
| Copy link control | Business Admin | booking URL available | hidden if unavailable | booking URL route/data | copy success truthful | honest copy failure if surfaced | wrong/cross-tenant copy target | copy-link proof | Architecture/Constitution require quick share/copy |
| Quick share control | Business Admin | supported environment | hidden if unsupported | booking URL route/data | share target truthful | honest unsupported state | fake share affordance | share proof | Planning-required current-phase feature |
| Download QR control (optional) | Business Admin | if implemented | hidden otherwise | QR data source | download truthfully named | honest failure | optional control treated as guaranteed | optional proof | Optional, not mandatory current-phase |

### QR/share notes
- Suspended/deactivated businesses must not present misleading live-bookable QR/share UI.
- Current route proof is enough for tenant-safe QR access, but internal QR generation remains a normalization requirement.

---

## 13. Platform Owner UI matrix

### 13.1 Owner auth and shell
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Owner login page | Platform Owner | not signed in | redirect/hide when signed in, depending final design | owner auth route(s) | correct owner sign-in flow | invalid credential copy honest | owner auth confused with business auth | auth proof | Local ledger proves platform-admin login exists |
| Owner dashboard shell | Platform Owner | signed in as owner | inaccessible otherwise | owner session + list routes | correct operator surface | honest auth failure | platform owner shell leaking to non-owner | auth/route proof | Proven at workflow level in local ledger |

### 13.2 Owner business oversight
| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Business list | Platform Owner | owner session valid | hidden if fetch fails | owner business list route | truthful business rows | honest load failure | incomplete oversight surface | list proof | Proven in local ledger |
| Business status badge | Platform Owner | business row visible | N/A | owner business list/detail route | exact business status | none | vague account-state wording | status proof | Must match BusinessStatus truth |
| Suspend control | Platform Owner | active business row | hidden/disabled otherwise | owner billing/status action route | suspended only when backend applies it | honest failure | status action without real gating | suspend proof | Proven |
| Reactivate control | Platform Owner | suspended/deactivated business where policy allows | hidden/disabled otherwise | owner action route | reactivated only when backend applies it | honest failure | incorrect allowed-state control | reactivate proof | Proven for suspended; deactivated policy still to normalize if needed |
| Deactivate control | Platform Owner | active or suspended business where policy allows | hidden/disabled otherwise | owner action route | deactivated only when backend applies it | honest failure | destructive action ambiguity | deactivate proof | Proven |
| Billing/subscription visibility | Platform Owner | owner session valid | hidden if no data | owner billing routes/data | exact billing/account truth | honest load failure | owner panel missing money truth | billing proof | Proven at local ledger workflow level |

### Owner-surface notes
- Owner UI must stay narrow and not duplicate tenant controls without need.
- Account health visibility must remain operator-level, not generic CMS clutter.

---

## 14. Subscription/account visibility UI matrix

| UI element | Actor | Visible when | Disabled / hidden when | Backend dependency | Success / truth copy | Error / warning copy | Drift risk | Proof required | Current proof / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Business account/subscription status display | Business Admin | admin session valid | hidden only if data unavailable | business/subscription data route | exact current subscription/account status | honest load failure | fake “active” reassurance | visibility proof | Required current-phase area by Constitution |
| Cancellation request control | Business Admin | active subscription and allowed policy | hidden/disabled if already requested or unsupported | business cancellation route(s) | cancellation-request state truthful | honest failure | fake cancellation workflow | route + UI proof | Local proof says cancellation request behavior exists, exact route to confirm later |
| Owner billing history view | Platform Owner | owner session valid | hidden if not implemented yet | billing history routes/data | truthful event history | honest load failure | history claims outrunning real persisted events | history proof | Phase 10 normalization item |

---

## 15. UI elements that must not exist now

| Forbidden current-phase UI | Reason |
| --- | --- |
| Business staff/user management UI | staff roles are excluded |
| Multi-admin permission UI | multi-admin permissions are excluded |
| Customer account/profile UI | customer accounts are excluded |
| No-show booking action UI | deferred |
| Partial refund UI | deferred |
| Analytics/add-on dashboards | drift |
| Over-complex pricing-tier management UI | premature complexity |

---

## 16. UI-level contradictions to carry forward

1. **Completed booking UI**
   - Current-phase by Constitution/Architecture/Phase Tasks.
   - Exact live admin control and route proof still need confirmation if not already surfaced in latest local implementation evidence.
   - Action: keep required, not silently complete.

2. **Failed payment UI**
   - Current-phase by law/planning.
   - Backend transition exists in code truth.
   - Full UI closure must be proven before sign-off.
   - Action: keep current-phase, proof partly open.

3. **Partially refunded UI**
   - Deferred by law/planning.
   - Code may mention it.
   - Action: must remain hidden in current-phase UI.

4. **Internal QR UI**
   - Current UI may still consume a third-party QR output route.
   - Law requires internal QR generation.
   - Action: current QR UI can be considered tenant-safe but still architecturally partial until normalized.

5. **Suspended public-page behavior**
   - Proof currently shows 503 behavior for suspended booking page.
   - Architecture allows a viewable-but-non-bookable variant if consistently implemented later.
   - Action: current UI truth must follow proof; any future change must update law/design/proof together.

---

## 17. Universal UI-matrix exit gate
The UI Matrix is only considered ready when:
- every current-phase surface is listed
- every deferred surface/control is explicitly blocked from current-phase completion claims
- every control has actor, visibility rule, disabled/read-only rule, backend dependency, and proof requirement
- every contradiction is surfaced
- no unsupported control is silently treated as complete

Anything less means the matrix remains open.
