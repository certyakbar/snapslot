# SnapSlot Acceptance Ledger

This ledger records verification truth against the Constitution. Statuses are PASS, FAIL, or UNVERIFIED only. Do not mark PASS without canonical repository evidence. Use UNVERIFIED if proof is missing. Do not treat later-phase or planned work as implemented.

**Note**: This ledger is part of canonical governance and records verification truth against the Constitution. Statuses must remain PASS, FAIL, or UNVERIFIED.

| Area | Status | Proof / Notes |
| --- | --- | --- |
| Business registration | UNVERIFIED | Requires proof of registration flow, persistence, and account creation. |
| Login | UNVERIFIED | Requires proof of authentication, credential validation, and session establishment. |
| Logout | UNVERIFIED | Requires proof of session termination and post-logout verification. |
| Session protection | UNVERIFIED | Requires proof that route guards enforce session presence and validity. |
| Admin route protection | UNVERIFIED | Requires proof that admin routes are protected and enforce ownership. |
| Redirect behaviour | UNVERIFIED | Requires proof of correct auth flow redirects (login required, post-auth destination). |
| Password reset | UNVERIFIED | Later-phase per Constitution; no proof of implementation required yet. |
| Business account isolation | UNVERIFIED | Requires proof that account data is strictly tenant-scoped. |
| Service isolation | UNVERIFIED | Requires proof that services are tenant-scoped and inaccessible cross-tenant. |
| Booking isolation | UNVERIFIED | Requires proof that bookings are tenant-scoped and inaccessible cross-tenant. |
| Route isolation | UNVERIFIED | Requires proof that all routes enforce tenant boundaries in access logic. |
| Session isolation | UNVERIFIED | Requires proof that session-scoped business ID cannot access other businesses. |
| Slug isolation | UNVERIFIED | Requires proof that booking slugs do not collide across businesses. |
| No cross-business leakage | UNVERIFIED | Requires proof across account, service, booking, route, and session boundaries. |
| Service create/list | UNVERIFIED | Requires proof of full service CRUD and listing operations. |
| Service edit/remove/activate/deactivate | UNVERIFIED | Constitution requires state control; needs proof of all operations. |
| Weekly availability | UNVERIFIED | Requires proof of weekly availability definition and persistence model. |
| Multiple windows per day | UNVERIFIED | Requires proof that multiple availability windows per day are supported safely. |
| Blocked times create/edit/remove | UNVERIFIED | Requires proof of blocked-time lifecycle and persistence. |
| Public booking link | UNVERIFIED | Requires proof of public booking-page access via business slug. |
| QR code / booking link isolation | UNVERIFIED | Constitution requires QR/link isolation; needs proof of safe link scoping. |
| Booking creation | UNVERIFIED | Requires proof of booking request acceptance, validation, and persistence. |
| Booking visibility | UNVERIFIED | Requires proof that businesses see only their own bookings. |
| Booking cancellation | UNVERIFIED | Requires proof of cancellation operation and state transitions. |
| Slot generation | UNVERIFIED | Requires proof of accurate available-slot computation. |
| Service duration combination | UNVERIFIED | Requires proof that multiple service durations combine correctly in slots. |
| Buffer handling | UNVERIFIED | Requires proof that service and business buffers are applied correctly. |
| Timezone handling | UNVERIFIED | Requires proof that timezone conversion is correct and consistent. |
| Blocked-time exclusion | UNVERIFIED | Requires proof that blocked ranges properly remove unavailable slots. |
| Existing-booking conflict prevention | UNVERIFIED | Requires proof that overlapping bookings are rejected. |
| Past booking rejection | UNVERIFIED | Requires proof that bookings in the past are rejected. |
| Invalid/inactive service rejection | UNVERIFIED | Requires proof that bookings with invalid or inactive services are rejected. |
| Near-simultaneous / concurrency double-booking protection | PASS | Proven by pushed `origin/main` patch (`a7f6e0c406c4a52f3693109c082a6994dede32cc`) and passing tests (`PASS 9 tests`); protection covers single-process in-memory concurrency. Cross-process / multi-instance concurrency remains unproven. |
| Shared theme ownership | UNVERIFIED | Requires proof that styling is centralized and shared, not duplicated across pages. |
| Inline duplicated shared styles | UNVERIFIED | Requires proof that pages do not contain inline copies of shared theme styles. |
| Fake or unsupported UI | UNVERIFIED | Constitution Law 4 requires this; needs proof that UI never implies unsupported features. |
| UI/data/logic separation | UNVERIFIED | Constitution Law 4 requires this; needs proof of proper file responsibility separation. |
| Dashboard professionalism / clarity | UNVERIFIED | Requires proof that dashboard UI is clear, professional, and non-confusing. |
| Error handling | UNVERIFIED | Requires proof of meaningful error responses across all flows. |
| Validation coverage | UNVERIFIED | Requires proof of validation covering all constraints and required flows. |
| Booking state model | UNVERIFIED | Constitution defines required states; needs proof that model matches. |
| Notifications | UNVERIFIED | Constitution § Notifications; later-phase, pending implementation proof. |
| Payments & deposits | UNVERIFIED | Constitution § Payments; core phase per Constitution, pending implementation proof. |
| Subscription & billing | UNVERIFIED | Constitution § Subscription & Billing; later-phase, pending implementation proof. |
| Payment history | UNVERIFIED | Constitution § Billing history; later-phase, pending implementation proof. |
| Add-ons | UNVERIFIED | Later-phase in Constitution; pending implementation proof or confirmed absence. |
| Definition of done evidence | UNVERIFIED | Requires proof that backend, frontend, validation, errors, isolation, tests, docs meet criteria. |
| Honest documentation truth | UNVERIFIED | Requires proof that docs align with implemented reality and do not overstate status. |
