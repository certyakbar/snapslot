# SnapSlot Task Packet Schema

## 1. Purpose

Every task Claude (Governor) assigns to Codex (Builder) must be expressed as a task packet.

A task packet is the formal, complete, unambiguous contract between Governor and Builder.
It is not a suggestion. It is not a conversation. It is a scoped execution order.

This schema defines every required and optional field in a task packet.
If a field marked required is missing, the task packet is invalid and must not be sent.

---

## 2. When to use

A task packet is required whenever:
- Codex is being asked to write, edit, or delete any code file
- Codex is being asked to modify docs that affect proof state (Acceptance Ledger, matrices)
- A change will be committed, pushed to a feature branch, and submitted as a pull request
  for Governor review and merge — direct pushes to origin/main are not permitted

A task packet is NOT required for:
- Claude-only analysis, audit, or read tasks
- Continuity summaries
- Governance doc creation that involves no code change

---

## 3. Repo structure note

Source files live at the repo root. There is no `src/` directory.
Core runtime files: `auth.ts`, `server.ts`, `bookingStore.ts`, `bookingCore.ts`,
`Persistence.ts`, `errors.ts`, `notificationService.ts`.
Frontend files: `public/js/`, `public/css/`, `public/*.html`.
Test files: `tests/`.

---

## 4. Schema fields

### Required fields

**`task_id`**
Type: string
Format: T-{phase}-{sequence}-{descriptor} (e.g. T-02-C1-assert-business-active)
Purpose: Unique identifier for tracking, ledger reference, and contradiction log cross-reference.

**`task_name`**
Type: string
Purpose: Human-readable name. One sentence maximum.

**`phase`**
Type: string (Phase 0 through Phase 12, or Phase N/A for governance-only)
Purpose: Which Phase Tasks phase owns this work.
Rule: must map to an entry in docs/SNAPSLOT_PHASE_TASKS.md.
Exception: Phase N/A is valid for governance-only tasks and has no Phase Tasks entry.
A governance-only task does not belong to any product phase.
Phase N/A is not valid when `workflow` is any value from Workflow A through Workflow L.

**`workflow`**
Type: string (Workflow A through Workflow L, or N/A for governance-only tasks)
Purpose: Which workflow letter from Phase Tasks §5 this task closes or advances.
Rule: must map to a workflow defined in docs/SNAPSLOT_PHASE_TASKS.md §5.
Exception: when `phase` is `Phase N/A`, `workflow` must be `N/A`.
A governance-only task does not advance any product workflow.
N/A is not valid when `phase` is any value from Phase 0 through Phase 12.

**`risk_level`**
Type: CRITICAL | HIGH | MEDIUM | LOW
Purpose: Risk classification per docs/SNAPSLOT_RISK_POLICY.md.
Rule: Governor must justify if risk level is lower than the default for the touched files.

**`actor_surface`**
Type: one or more of: PLATFORM_OWNER | BUSINESS_ADMIN | CUSTOMER | INTERNAL
Purpose: Which actor surface(s) this change affects.

**`allowed_files`**
Type: list of exact file paths
Purpose: The complete and exhaustive list of files Codex may touch.
Rule: Codex must touch no file not in this list. Any file not listed is forbidden.
Note: Use root-relative paths (e.g. `server.ts`, `public/js/admin-ui.js`, not `src/server.ts`).

**`forbidden_files`**
Type: list of exact file paths or patterns
Purpose: Explicit list of files Codex must not touch. Used to prevent scope drift.
Rule: At minimum, list all governance docs and any adjacent runtime file likely to tempt drift.

**`required_behavior`**
Type: freeform text
Purpose: Exact description of what must change, why, and what the correct end state is.
Rule: Must be specific enough that a correct implementation is unambiguous.
Must reference the Constitution section, Phase Tasks section, or Contradiction Log entry
that drives this change.

**`forbidden_behavior`**
Type: freeform text
Purpose: Explicit list of what Codex must not do, including:
- what adjacent code must not be touched
- what deferred features must not be exposed (no_show, partially_refunded, staff roles)
- what architectural patterns must not be introduced
- what must not be claimed as complete

**`validation_commands`**
Type: list of exact shell commands
Purpose: The exact commands Codex must run to produce proof.
Minimum required commands:
- `npx tsc --noEmit`
- `npm test`
Additional grep/readback commands as needed for scope verification.

**`stop_rule`**
Type: freeform text
Purpose: Conditions under which Codex must stop immediately and report instead of continuing.
Rule: must cover at minimum:
- unclear scope
- unexpected file state
- test failure
- discovered contradiction not in the log

**`return_format`**
Type: freeform text
Purpose: Exact output format Codex must use in its response.
Default if not overridden: use AGENTS.md §OUTPUT FORMAT exactly.

### Optional fields

**`known_contradictions`**
Type: list of Contradiction Log IDs (e.g. C-003, D-001)
Purpose: Contradictions from docs/SNAPSLOT_CONTRADICTION_LOG.md relevant to this task.
Rule: Codex must not patch through or silently resolve any listed contradiction.

**`docs_may_change`**
Type: boolean + file list if true
Purpose: Whether Codex is authorized to modify documentation files.
Default: false (Codex must not touch docs unless explicitly listed in allowed_files).

**`ledger_update_required`**
Type: boolean + row names if true
Purpose: Whether the Acceptance Ledger must be updated as part of this task.
Rule: If true, the row name and new status (PASS/FAIL/UNVERIFIED) must be specified.
Governor must verify any ledger change before approving the commit.

**`notes`**
Type: freeform text
Purpose: Any additional context Codex needs to execute safely.
Not a place for vague instructions. Only hard facts relevant to execution.

---

## 5. Full task packet template

Copy this template for every new task sent to Codex.

```
---
TASK PACKET

task_id:        T-{phase}-{seq}-{descriptor}
task_name:      [one sentence]
phase:          Phase {N}  (Phase 0 through Phase 12, or Phase N/A for governance-only)
workflow:       Workflow {Letter} — {name}  (or N/A if and only if phase is Phase N/A)
risk_level:     CRITICAL | HIGH | MEDIUM | LOW
actor_surface:  [PLATFORM_OWNER | BUSINESS_ADMIN | CUSTOMER | INTERNAL]

---

ALLOWED FILES (touch only these):
- [exact/path/to/file.ts]

FORBIDDEN FILES (do not touch):
- CLAUDE.md
- AGENTS.md
- docs/SNAPSLOT_CONSTITUTION.md
- docs/SNAPSLOT_ACCEPTANCE_LEDGER.md
- docs/SNAPSLOT_PHASE_TASKS.md
- docs/SNAPSLOT_STATE_MATRIX.md
- docs/SNAPSLOT_ROUTE_MATRIX.md
- docs/SNAPSLOT_UI_MATRIX.md
- docs/SNAPSLOT_CONTRADICTION_LOG.md
- docs/SNAPSLOT_CONTEXT_RECOVERY_PROTOCOL.md
- docs/SNAPSLOT_ARCHITECTURE.md
- [any other adjacent file at risk of drift]

REQUIRED BEHAVIOR:
[exact description — reference Constitution/Phase Tasks/Contradiction Log entry]

FORBIDDEN BEHAVIOR:
- [explicit list of what must not happen]
- Do not expose deferred features: no_show, partially_refunded, staff roles
- Do not expand scope beyond the listed allowed files

VALIDATION COMMANDS (run in order, return exact output):
1. npx tsc --noEmit
2. npm test
3. [additional grep/readback as needed]

STOP RULE:
Stop immediately and report if:
- [list stop conditions specific to this task]
- a contradiction not in docs/SNAPSLOT_CONTRADICTION_LOG.md is discovered
- repo state is dirty, behind remote, or ambiguous
- scope is unclear

KNOWN CONTRADICTIONS:
- [C-XXX: description — must not be silently resolved]
- (or "None relevant")

DOCS MAY CHANGE: false | true → [list files]
LEDGER UPDATE REQUIRED: false | true → [row name: new status]

RETURN FORMAT: AGENTS.md §OUTPUT FORMAT (exact outputs, not paraphrases)

NOTES:
[hard facts only — no vague instructions]
---
```

---

## 6. Governor pre-send checklist

Before sending a task packet, Governor must confirm:

- [ ] task_id is unique and follows the T-{phase}-{seq}-{descriptor} format
- [ ] allowed_files is a complete and minimal list — root-relative paths, no `src/` prefix
- [ ] forbidden_files includes all governance docs explicitly
- [ ] required_behavior is precise enough to yield one correct implementation
- [ ] forbidden_behavior prevents the most likely scope drifts
- [ ] validation_commands include at minimum typecheck + full test suite
- [ ] stop_rule covers unclear scope, test failure, and discovered contradiction
- [ ] risk_level is correct per docs/SNAPSLOT_RISK_POLICY.md
- [ ] any relevant contradictions from Contradiction Log are listed
- [ ] ledger_update_required is honest (not assumed PASS before proof exists)

If any item is missing, the task packet is not ready to send.

---

## 7. Builder return checklist

Codex must return for every task (per AGENTS.md §OUTPUT FORMAT):

- Files changed / created (exact paths)
- Lines affected / insertion points
- Problem / improvement addressed
- Why this exact fix
- Validation run (exact output — not paraphrased)
- Remaining gaps / considerations
- References to prior code, fixes, or decisions
- Exact diff or exact output
- Stop condition reached (yes/no — if yes, what condition)

If exact output was requested, return exact output.
Paraphrased output is invalid and must be re-requested.
