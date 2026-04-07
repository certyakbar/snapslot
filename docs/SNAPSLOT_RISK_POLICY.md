# SnapSlot Risk Policy

## 1. Purpose

This file defines the risk classification system used by the Governor (Claude) and enforced
by the Sentinel (CI) when reviewing every change to this repository.

Risk level determines:
- what proof is required before merge
- what the Sentinel may auto-pass
- what must escalate to Governor review
- what is blocked regardless of test results

This policy applies to every diff, commit, and PR.

---

## 2. The 10 booking-system review dimensions

Every change must be judged against these dimensions (source: CLAUDE.md):

1. State transitions
2. Validation
3. Tenant isolation
4. Time / timezone correctness
5. Money correctness
6. Side effects / notifications
7. Retry / idempotency
8. Concurrency
9. Failure paths
10. Frontend / backend truth match

The more dimensions a change touches, the higher its risk level.

---

## 3. Risk levels

### CRITICAL

A change is CRITICAL if it directly affects any of:

- Booking creation, conflict detection, or slot generation logic
- Concurrency protection (locking, race-condition guards)
- Tenant isolation (session boundaries, route ownership, cross-tenant access)
- Business-status enforcement on public or admin routes (`assertBusinessActive`, `assertBusinessSession`)
- Payment processing, state transitions, or money calculations
- Authentication or session handling
- Any state transition in BookingStatus, PaymentStatus, or SubscriptionStatus
- Error response contracts used across auth and validation paths

### HIGH

A change is HIGH if it directly affects any of:

- Booking lifecycle actions (cancel, reschedule, complete) in UI or backend
- Admin payment actions (mark paid, refund, mark failed)
- Notification triggers and wiring
- Admin route access control (session checks other than core auth)
- Frontend booking flow logic
- Validation logic for financial fields or booking constraints
- Governance and enforcement control spine files — weakening these files degrades the
  entire control model and must require Governor review before merge

### MEDIUM

A change is MEDIUM if it affects:

- Admin dashboard UI that reflects but does not drive state (display-only panels)
- Subscription/billing visibility (no billing state mutation)
- CSS or layout that controls which UI elements are visible
- Test files
- Operational control maps and docs not in the enforcement spine (see file map below)
- Acceptance Ledger, phase task lists, matrices, architecture docs

### LOW

A change is LOW if it only affects:

- README.md, code comments, or pure prose documentation that carries no state claim
- `.gitignore`, editor config with no governance impact
- Typo fixes that do not affect the meaning of any status copy

---

## 4. File-to-risk map

Source files live at the repo root. There is no `src/` directory.

| File | Default risk | Reason |
|---|---|---|
| `auth.ts` | CRITICAL | Password hashing and verification — auth crypto primitives |
| `server.ts` | CRITICAL | All routes, session guards, `assertBusinessSession`, `assertBusinessActive`, tenant ownership checks, billing actions |
| `bookingStore.ts` | CRITICAL | All domain logic: booking state machine, billing/subscription lifecycle, slot conflict detection, concurrency lock |
| `bookingCore.ts` | CRITICAL | BookingStatus, PaymentStatus, SubscriptionStatus types; SUBSCRIPTION_BILLING_WINDOW_MS constant |
| `Persistence.ts` | CRITICAL | Data persistence layer; initialises nextBillingDate and subscription state |
| `errors.ts` | CRITICAL | HttpError contract used across all auth, validation, and security paths — changing status codes or message exposure weakens enforcement |
| `notificationService.ts` | HIGH | Notification triggers and wiring for all lifecycle events |
| `public/js/booking-ui.js` | HIGH | Customer-facing booking flow; payment/confirmation copy truth |
| `public/js/admin-ui.js` | HIGH | Admin dashboard logic; validation, booking actions, payment actions |
| `public/js/api.js` | HIGH | Admin API wrapper; mismatches here create silent backend/frontend gaps |
| `CLAUDE.md` | HIGH | Supreme engineering law — weakening it undermines the entire governance model; Governor verdict required |
| `AGENTS.md` | HIGH | Codex execution law — weakening it undermines builder control; Governor verdict required |
| `docs/SNAPSLOT_CONSTITUTION.md` | HIGH | Product law — changes must be deliberate; Governor verdict required |
| `docs/SNAPSLOT_SENTINEL_CONTRACT.md` | HIGH | Sentinel law — weakening it bypasses automated enforcement; Governor verdict required |
| `docs/SNAPSLOT_RISK_POLICY.md` | HIGH | This file — weakening risk tiers undermines Sentinel enforcement; Governor verdict required |
| `docs/SNAPSLOT_TASK_PACKET_SCHEMA.md` | HIGH | Governor-Builder contract — weakening it allows malformed tasks; Governor verdict required |
| `.github/workflows/` | HIGH | CI enforcement — weakening workflows bypasses all automated checks; Governor verdict required |
| `.github/CODEOWNERS` | HIGH | Review enforcement — weakening it removes required reviewer gates; Governor verdict required |
| `.github/pull_request_template.md` | HIGH | PR format enforcement — weakening it degrades control fields; Governor verdict required |
| `public/js/login.js` | MEDIUM | Login page logic |
| `public/js/signup.js` | MEDIUM | Signup page logic |
| `public/js/ui-copy.js` | MEDIUM | Shared UI copy — risk escalates if status-bearing copy changes |
| `public/js/timezone.js` | MEDIUM | Timezone helper |
| `public/js/admin.js` | MEDIUM | Admin page bootstrap |
| `public/*.html` | MEDIUM | HTML templates; risk escalates if state-bearing UI is added or removed |
| `public/css/snapslot-theme.css` | MEDIUM | Shared CSS; risk escalates if visibility rules change |
| `tests/` | MEDIUM | Test files — affect proof state |
| `docs/SNAPSLOT_ACCEPTANCE_LEDGER.md` | MEDIUM | Proof truth — PASS/FAIL claims must not be inflated |
| `docs/SNAPSLOT_PHASE_TASKS.md` | MEDIUM | Execution order law — phase gates must not be quietly bypassed |
| `docs/SNAPSLOT_STATE_MATRIX.md` | MEDIUM | Operational control map |
| `docs/SNAPSLOT_ROUTE_MATRIX.md` | MEDIUM | Operational control map |
| `docs/SNAPSLOT_UI_MATRIX.md` | MEDIUM | Operational control map |
| `docs/SNAPSLOT_CONTRADICTION_LOG.md` | MEDIUM | Active contradiction tracker — silent edits can hide known issues |
| `docs/SNAPSLOT_CONTEXT_RECOVERY_PROTOCOL.md` | MEDIUM | Recovery law |
| `docs/SNAPSLOT_ARCHITECTURE.md` | MEDIUM | Design document |
| `ops/TASK_STATE.json` | MEDIUM | Phase operational state tracking — incorrect phase data could mislead execution-governance decisions; not product code but affects planning truth |
| `scripts/system-check.js` | MEDIUM | Pre-flight health checker — weakening or removing checks could hide missing governance or runtime files from detection |
| `README.md` | LOW | Documentation only — no governance or state impact |

If a PR touches files across multiple risk levels, the highest level governs the entire PR.

---

## 5. Required proof per risk level

| Risk level | Typecheck | Tests | Governor diff review | Governor APPROVE verdict required |
|---|---|---|---|---|
| CRITICAL | required | required | required | yes |
| HIGH | required | required | required | yes |
| MEDIUM | required† | required† | not required | no |
| LOW | not required | not required | not required | no |

† For MEDIUM changes to non-TypeScript files (documentation, YAML, templates), typecheck passes
trivially if no TypeScript was changed. The test suite still runs as a baseline integrity check.

Governor verdict for MEDIUM and LOW: not required by policy. SENTINEL-PASS alone is sufficient
for merge. Governor may still block at discretion.

---

## 6. Sentinel authority per risk level

| Risk level | Sentinel may pass without Governor | Sentinel verdict |
|---|---|---|
| CRITICAL | never — valid approval manifest required | SENTINEL-FAIL until valid manifest present |
| HIGH | never — valid approval manifest required | SENTINEL-FAIL until valid manifest present |
| MEDIUM | yes, if all checks green | SENTINEL-PASS |
| LOW | yes, if all checks green | SENTINEL-PASS |

Governor APPROVE is committed as `ops/GOVERNOR_APPROVAL.json` (the approval manifest).
The Sentinel validates the manifest — not PR comments — for APPROVE verdicts on CRITICAL
and HIGH PRs. See `docs/SNAPSLOT_SENTINEL_CONTRACT.md` §12 for the binding algorithm.
Governor BLOCK remains comment-based and applies at all risk levels.

---

## 7. Governor authority

The Governor (Claude) may:
- Block any PR at any risk level for any law-aligned reason
- Downgrade a risk assessment if scope is demonstrably narrower than file default implies
- Upgrade a risk assessment if the actual change touches more dimensions than file label implies

The Governor must block any PR where:
- Scope drift is detected (files changed that were not in the task packet)
- Proof is paraphrased instead of exact
- A deferred feature is exposed
- Validation is mismatched between frontend and backend
- Acceptance Ledger is overclaimed

### 7.1 Governor approval process

For CRITICAL and HIGH PRs, the Governor:
1. Reviews the PR at the current HEAD commit
2. Posts `GOVERNOR VERDICT: APPROVE FOR MERGE` as a PR comment (audit trail)
3. The `governor-manifest-commit` job automatically commits `ops/GOVERNOR_APPROVAL.json`
   with `approved_parent_sha` bound to the exact reviewed commit SHA
4. Any subsequent commit to the PR branch automatically invalidates the approval

For BLOCK:
1. Posts `GOVERNOR VERDICT: BLOCK — [reason]` as a PR comment
2. The `governor-manifest-commit` job pushes an empty commit to trigger re-evaluation
3. The Sentinel scans for BLOCK comments and fails the PR

See `docs/SNAPSLOT_SENTINEL_CONTRACT.md` §12 for the full manifest specification.

---

## 8. Deferred-feature risk rule

Any change that exposes a deferred feature (no_show, partially_refunded, staff roles,
multi-admin, customer accounts, analytics, add-ons) is CRITICAL regardless of file type.

Deferred features must not appear in code, routes, UI, docs, or claims unless the Phase
Tasks doc has been updated by explicit Governor decision.

---

## 9. Constitution override

If this policy conflicts with docs/SNAPSLOT_CONSTITUTION.md, the Constitution wins.
This file is a risk-classification tool, not product law.
