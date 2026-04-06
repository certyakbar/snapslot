# SnapSlot Context Recovery Protocol

## 1. Purpose
This file exists to prevent context rot during planning, coding, review, and approval work across Claude and Codex.

It defines how SnapSlot working truth must be reconstructed when:
- sessions get long
- context compacts
- memory drifts
- scope changes
- proof is unclear
- docs disagree
- code and docs disagree
- Claude or Codex is about to act from partial recall

This file is not product law.
It is execution-memory control.

Document roles:
- Constitution = product law
- Architecture = system design
- Acceptance Ledger = proof truth
- Phase Tasks = execution order and gating
- State / Route / UI Matrices = operational control maps
- Contradiction Log = unresolved mismatch tracker
- Context Recovery Protocol = anti-context-rot operating system

---

## 2. Core rule

When context is weak, compressed, uncertain, stale, or partial:

**stop, re-anchor, reconstruct, then act**

Never continue from memory alone.

---

## 3. Why this file exists

SnapSlot is controlled by layered governance:
- law
- design
- proof
- execution phases
- state truth
- route truth
- UI truth
- contradiction tracking

That structure is powerful, but it creates a context-rot risk:
an agent can remember one layer and forget another.

This file prevents that failure.

---

## 4. Recovery hierarchy

When reconstructing project truth, use this exact order:

1. `CLAUDE.md`
2. `.github/copilot-instructions.md`
3. `docs/SNAPSLOT_SENTINEL_CONTRACT.md`
4. `docs/SNAPSLOT_CONSTITUTION.md`
5. `docs/SNAPSLOT_ARCHITECTURE.md`
6. `docs/SNAPSLOT_PHASE_TASKS.md`
7. `docs/SNAPSLOT_STATE_MATRIX.md`
8. `docs/SNAPSLOT_ROUTE_MATRIX.md`
9. `docs/SNAPSLOT_UI_MATRIX.md`
10. `docs/SNAPSLOT_CONTRADICTION_LOG.md`
11. `docs/SNAPSLOT_ACCEPTANCE_LEDGER.md`
12. exact code files in scope
13. exact tests and runtime proof in scope

Reason:
- agent-control files define how work must be handled
- Sentinel Contract defines the automated enforcement and merge-gate model — agents must know the exact Governor verdict format, risk alignment rules, and check-name requirements before acting on any PR
- Constitution defines intended law
- Architecture defines design
- Phase Tasks define order and gates
- matrices define operational truth
- Contradiction Log defines known unresolved mismatches
- Acceptance Ledger defines current proof
- code/tests define current implementation reality

---

## 5. Mandatory re-anchor triggers

Claude or Codex must stop and re-anchor when any of the following occurs:

- context compaction
- long multi-step session
- switching workflow, phase, or actor surface
- switching from planning to implementation
- switching from implementation to review
- uncertainty about what phase a task belongs to
- uncertainty about whether something is current-phase or deferred
- uncertainty about whether something is proven or merely planned
- uncertainty about route ownership
- uncertainty about state transitions
- uncertainty about UI/backend parity
- uncertainty about business-status behavior
- uncertainty about whether a contradiction already exists
- uncertainty about which file is source of truth
- any moment where an agent is about to rely on memory instead of repo truth

If any trigger is hit, re-anchor is mandatory.

---

## 6. Claude recovery protocol

Claude is the overseer, not the default implementer.

Before any meaningful task, Claude must reconstruct:

### 6.1 Control truth
Read:
- `CLAUDE.md`
- `.github/copilot-instructions.md`

Confirm:
- Claude is scoper / reviewer / approval gate
- Codex is executor
- execution boundary still holds
- fail-closed standard still holds

### 6.2 Product truth
Read:
- Constitution
- Architecture

Confirm:
- actor model
- lifecycle model
- current-phase vs deferred
- business-status rules
- booking/payment/subscription rules
- QR and trust rules

### 6.3 Execution truth
Read:
- Phase Tasks
- State Matrix
- Route Matrix
- UI Matrix
- Contradiction Log

Confirm:
- phase ordering
- workflow boundaries
- transition truth
- route truth
- UI truth
- known contradictions
- owner of open contradictions

### 6.4 Proof truth
Read:
- Acceptance Ledger
- relevant tests/code only after governance files

Confirm:
- what is PASS
- what is UNVERIFIED
- what must not be overstated
- whether current code has outpaced or lagged docs

### 6.5 Scope truth
Before writing any Codex prompt, Claude must answer:

1. What exact workflow is this?
2. What phase owns it?
3. What actor owns it?
4. What states change?
5. What routes change?
6. What UI changes?
7. What validation changes?
8. What failure behavior matters?
9. What notifications matter?
10. What proof is required?
11. What docs must change?
12. What contradictions already exist here?

If one answer is missing, Claude is not ready to task Codex.

---

## 7. Codex recovery protocol

Codex is executor only.

Before touching code, Codex must reconstruct enough truth to execute safely.

### 7.1 Minimum required reads
Codex must read:
- `CLAUDE.md`
- `.github/copilot-instructions.md`
- the relevant sections of Constitution, Architecture, Phase Tasks
- the relevant State / Route / UI Matrix entries
- the relevant Contradiction Log entries
- the exact in-scope code files

### 7.2 Codex stop conditions
Codex must stop and report instead of guessing when:
- allowed files are unclear
- route owner is unclear
- state transition is unclear
- UI/backend parity is unclear
- repo state is dirty/behind/ambiguous
- proof requested cannot be produced
- docs conflict with code and safe interpretation is unclear
- task scope expands beyond the prompt
- a deferred feature would need to be touched
- a contradiction not listed in the log is discovered

### 7.3 Codex report format on recovery stop
If Codex stops because of context uncertainty, it must report:
- exact blocker
- exact file or workflow affected
- what was verified
- what remains unclear
- what repo files were checked

Codex must not patch through uncertainty.

---

## 8. Reconstruction by task type

### 8.1 Planning task
Must read:
- Constitution
- Architecture
- Phase Tasks
- relevant matrices
- Contradiction Log
- Acceptance Ledger

Goal:
- do not invent beyond law
- do not plan against disproven proof
- do not erase contradictions

### 8.2 Implementation task
Must read:
- control files
- Constitution
- Phase Tasks
- relevant matrices
- Contradiction Log
- exact code files
- exact tests in scope

Goal:
- build only inside approved workflow
- do not silently drift across state/route/UI boundaries

### 8.3 Review task
Must read:
- control files
- relevant law/design/proof docs
- exact diff
- exact tests
- exact repo state

Goal:
- prove or block
- never infer

### 8.4 Commit-approval task
Must read:
- control files
- exact diff
- exact validation outputs
- exact repo state

Goal:
- confirm scope cleanliness
- confirm proof
- block mixed or ambiguous commits

---

## 9. Reconstructing project truth

“Reconstruct project truth” means the agent must explicitly recover:

### 9.1 Product identity
SnapSlot is:
- one shared engine
- many isolated businesses
- one platform owner surface
- one business-admin surface
- one customer surface

### 9.2 Current-phase lifecycles
- BusinessStatus: active, suspended, deactivated
- BookingStatus current: pending_payment, confirmed, rescheduled, cancelled, completed
- BookingStatus deferred: no_show
- PaymentStatus current: not_required, pending, paid, failed, refunded
- PaymentStatus deferred: partially_refunded
- Subscription planning set: active, suspended, cancellation_requested, cancelled, expired

### 9.3 Hard laws
- no double bookings
- no false slots
- no cross-tenant leakage
- no fake UI
- no dishonest docs
- suspended = read-only
- deactivated = offline
- internal QR required eventually
- £60 comes from one controlled source
- frontend and backend must describe the same truth

### 9.4 Known open contradictions
The agent must explicitly check the Contradiction Log for:
- password reset
- completed route/UI proof
- failed payment closure
- partially_refunded deferral
- internal QR normalization
- subscription naming normalization
- suspended/deactivated policy mismatches
- billing history proof gaps

If the agent has not refreshed known contradictions, it has not reconstructed project truth.

---

## 10. Handoff protocol between Claude and Codex

### 10.1 Claude -> Codex
Claude must not hand off vague work.

Every Codex prompt must include:
- exact task
- exact workflow and phase context
- exact allowed files
- exact forbidden files
- exact required behavior
- exact forbidden behavior
- exact validation commands
- exact return format
- exact stop rule
- known contradictions relevant to the task
- whether docs may or may not be touched

### 10.2 Codex -> Claude
Codex must return:
- exact files touched
- exact behavior changed
- exact validation run
- exact outputs
- exact remaining gaps
- explicit stop condition reached

No summaries when raw output was requested.

### 10.3 Claude approval gate
Claude must not approve until it has rechecked:
- scope cleanliness
- law alignment
- phase alignment
- matrix alignment
- contradiction impact
- proof quality
- repo state

---

## 11. File-role anti-rot rules

No file may impersonate another file’s role.

- Constitution must not become architecture or execution plan
- Architecture must not become proof ledger
- Acceptance Ledger must not become planning fiction
- Phase Tasks must not become product law
- matrices must not become code proof by themselves
- Contradiction Log must not silently disappear contradictions
- Context Recovery Protocol must not become product law

If a file starts doing another file’s job, context rot has begun.

---

## 12. Anti-rot audit checklist

Before any serious task, Claude should be able to answer all of these:

- What phase owns this?
- What workflow owns this?
- What actor owns this?
- Is the feature current-phase or deferred?
- What states are involved?
- What routes are involved?
- What UI is involved?
- What contradictions already exist?
- What proof already exists?
- What proof is still missing?
- Which file is law here?
- Which file is proof here?
- Which file is planning control here?
- Is Codex supposed to execute, or is this a Claude-only oversight task?

If not, re-anchor again.

---

## 13. Recommended supporting structure

This protocol assumes the repo uses:

- `CLAUDE.md` as Claude control entrypoint
- `.github/copilot-instructions.md` as lean repo-wide executor guidance
- core governance docs in `docs/`
- optional `AGENTS.md` at repo root for Codex/agent alignment
- optional Claude subagents for specialized audits:
  - planning-auditor
  - proof-gate-reviewer
  - route-ui-parity-reviewer
  - contradiction-checker

These helpers are optional.
This recovery protocol is mandatory.

---

## 14. Failure law

If context recovery is incomplete, no important action is valid.

That means:
- no architectural decision
- no Codex tasking
- no approval
- no completion claim
- no commit approval

until recovery is complete.

---

## 15. Universal exit gate

This protocol is only working if:
- agents actually re-read the required files
- task prompts stay phase- and workflow-bound
- contradictions are surfaced instead of buried
- proof is checked before approval
- repo truth is reconstructed before acting

If any of those fail, context rot is still active.
