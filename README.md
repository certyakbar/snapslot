# SnapSlot

SnapSlot is a multi-tenant booking system built around one shared booking engine serving many separate businesses.

The product is designed around three non-negotiables:

1. Reliability over everything
2. Simplicity that supports reliability
3. Strict separation between businesses

## Product intent

Each business has its own account, services, availability, blocked times, customers, bookings, and booking page.

Customers book only through that business’s booking link or QR code.

The system must remain reliable under real usage:
- no double bookings
- no cross-business data leakage
- no fake UI pretending unsupported features exist
- no convenience feature allowed to weaken booking integrity
- Proof PR for governor-empty-commit validation.

## Current direction

SnapSlot is being built in phases.

### Core phase
- business registration
- login
- business dashboard
- service setup
- weekly availability
- blocked times
- public booking page
- booking engine
- booking confirmation
- business-side booking visibility
- email notifications

### Later phases
- subscription and billing
- password reset
- QR code generation
- deposits and payment collection
- refunds
- cancellations and billing policies
- payment history
- add-ons

## Source of truth

The product must always follow:

- `docs/SNAPSLOT_CONSTITUTION.md`
- `docs/SNAPSLOT_ACCEPTANCE_LEDGER.md`

If code, UI, prompts, or tasks conflict with those files, those files win.

## Rule for AI coding agents

Any AI agent working on this repo must:
1. read the Constitution first
2. check the Acceptance Ledger
3. mark features as PASS / FAIL / UNVERIFIED
4. never claim a feature works unless it has been proven

## Development principle

Build the booking engine first. Protect reliability first. Add convenience only when it does not weaken the engine.
