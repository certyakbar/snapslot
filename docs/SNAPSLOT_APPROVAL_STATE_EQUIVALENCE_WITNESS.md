# SnapSlot Approval State Equivalence Witness

Task ID: `T-GOV-29-PRE-EQUIVALENCE-WITNESS`

This witness is documentation only. It does not edit code, workflows, schemas, registries, package files, ops files, product files, tests, or the acceptance ledger. It does not approve, mark ready, merge, switch authority, implement scoped approval storage, implement garbage collection, or run sacrificial PRs.

T-GOV-29 witness remains paused. Approval-state isolation is not fully implemented. Scoped approval state is diagnostic-only, and scoped approval state is diagnostic-only for the current Sentinel path. Scoped approval state does not affect `governorPassed`. Scoped approval state does not affect `sentinelPassed`. `ops/GOVERNOR_APPROVAL.json` remains the active Sentinel authority.

## Current PR #88 Interpretation

PR #88 is valid under current manifest-bound Sentinel law.

ops/GOVERNOR_APPROVAL.json appearing in PR diffs is expected under the current model because Sentinel excludes it from declared scope comparison. The approval manifest commit intentionally changes PR HEAD and binds approval to the parent commit under current Sentinel law. That parent binding is the stale-approval protection: a later push changes the HEAD relationship and requires re-approval.

governor_login currently records the GitHub-authenticated Governor login certyakbar. Cleaner Governor identity separation remains future migration debt.

These points are not PR #88 defects. They are deferred approval-state isolation architecture debt.

## Current Authority

- ops/GOVERNOR_APPROVAL.json remains the active Sentinel authority.
- For HIGH and CRITICAL PRs, current merge-gate approval is manifest-bound through `approved_parent_sha`, `approved_tree_sha`, `pr_number`, `governor_login`, `risk_tier`, `task_id`, `declared_files`, `ledger_state`, and `issued_at`.
- BLOCK remains comment-based and conservative.
- Scoped approval state is diagnostic-only.
- The scoped approval artifact backend is `github_pr_comment`.
- `repository_persistent is false`.
- `authority is diagnostic_only`.
- `SNAPSLOT_SCOPED_APPROVAL_STATE_BEGIN` and `SNAPSLOT_SCOPED_APPROVAL_STATE_END` are the scoped approval artifact markers.
- File based scoped approval storage requires garbage collection after merge and is not implemented.
- Repository-persistent scoped approval artifacts must not accumulate on main.
- Timestamp equality fails closed for future scoped approval authority.

## Completed Pre-Equivalence Chain

The completed chain leading to this diagnostic witness is:

1. `T-GOV-29-PRE-COMPILER-GATE`
2. `T-GOV-29-PRE-APPROVAL-STATE-DESIGN`
3. `T-GOV-29-PRE-APPROVAL-STATE-RESOLVER`
4. `T-GOV-29-PRE-SENTINEL-DIAGNOSTIC`
5. `T-GOV-29-PRE-GOVERNOR-WRITE`

This chain does not complete T-GOV-29. It establishes pre-equivalence compiler gating, design, resolver vocabulary, Sentinel diagnostic reporting, and Governor diagnostic scoped-state writing while preserving the global manifest as authority.

## Automation Path

Current end-to-end automation path:

1. Operator creates or supplies the Governor prompt.
2. Operator runs the local loop.
3. Governor output is captured by the loop.
4. The compiler normalizes the Governor output into `compiler-backed local-loop-packet.v1 JSON`.
5. Codex receives the compiler-normalized packet and may only operate inside the packet scope.
6. Stage 7 validation command execution is registry-backed and not raw bash -lc validation string execution.
7. Sentinel evaluates the PR body anchors, validation result, protected-path risk alignment, declared scope versus actual diff, Governor manifest authority, and BLOCK override state.
8. On Governor approval, the Governor manifest workflow commits `ops/GOVERNOR_APPROVAL.json` to the PR branch and writes a non-authoritative scoped approval PR comment artifact.
9. After merge, the post-merge reset workflow restores `ops/GOVERNOR_APPROVAL.json` on main to canonical `verdict: NONE` when needed.

What is automated now:

- Local-loop repo re-anchor, no-key preflight, Governor invocation, compiler packet normalization, Codex execution, hard scope verification, registry-backed validation commands, deterministic checks when scoped, proof collection, PR body/proof draft generation, branch/commit/push/draft-PR creation, and handoff stop.
- Sentinel enforcement for PR metadata, risk alignment, exact declared-scope comparison, manifest-bound approval, and BLOCK comments.
- Governor manifest commit after an authenticated Governor APPROVE comment.
- Diagnostic scoped approval artifact creation as a PR comment.
- Post-merge manifest reset.

What remains manual:

- The operator still manually creates or supplies the Governor prompt.
- The operator still manually runs the local loop.
- The operator still manually posts Governor approval comments.
- The operator still manually merges only after Sentinel PASS.
- The operator/Governor still reviews proof before ready or merge decisions.

Packet shape enforcement is now `compiler-backed local-loop-packet.v1 JSON`, not freeform Markdown execution authority.

## Witness Matrix

| Surface | Current authoritative behavior | Scoped diagnostic behavior | Equivalence status | Evidence source | Result |
|---|---|---|---|---|---|
| HIGH/CRITICAL approval authority | `ops/GOVERNOR_APPROVAL.json` is the active Sentinel authority. | Scoped approval state is diagnostic-only. | PROVEN for current authority; DEFERRED for authority switch. | `docs/SNAPSLOT_SENTINEL_CONTRACT.md` §12; `.github/workflows/pr-sentinel.yml` diagnostic row. | Current manifest authority preserved. |
| Scope comparison | Sentinel excludes `ops/GOVERNOR_APPROVAL.json` from declared scope comparison and Group D scope binding. | Scoped artifact is a PR comment and not part of repo diff scope. | PROVEN for current manifest behavior; UNPROVEN for future scoped authority. | `docs/SNAPSLOT_SENTINEL_CONTRACT.md` §10.4; `.github/workflows/pr-sentinel.yml`. | PR #88 manifest diff appearance is expected. |
| Approval commit binding | Governor manifest commit changes PR HEAD and stores reviewed HEAD as `approved_parent_sha`. | Scoped comment carries the same manifest-derived fields diagnostically. | PROVEN for manifest binding; UNPROVEN as scoped authority. | `docs/SNAPSLOT_SENTINEL_CONTRACT.md` §12.3-§12.5; `.github/workflows/pr-sentinel.yml` Governor write path. | Later push invalidation remains manifest-bound. |
| Governor identity | `governor_login` must match `certyakbar`. | Scoped comment records the same GitHub-authenticated Governor login. | PROVEN for current identity binding; DEFERRED for cleaner identity separation. | `docs/SNAPSLOT_SENTINEL_CONTRACT.md` §12.3; `docs/SNAPSLOT_APPROVAL_STATE_ISOLATION_DESIGN.md` §5.4. | Current identity behavior is not a PR #88 defect. |
| Scoped artifact backend | No scoped artifact affects Sentinel authority. | Backend is `github_pr_comment`; `repository_persistent is false`; `authority is diagnostic_only`. | PROVEN for diagnostic write; UNPROVEN for gating use. | `.github/workflows/pr-sentinel.yml` Governor write path. | Diagnostic artifact is PR-scoped and non-authoritative. |
| Scoped artifact markers | No current authoritative parser consumes scoped markers for gating. | Markers are `SNAPSLOT_SCOPED_APPROVAL_STATE_BEGIN` and `SNAPSLOT_SCOPED_APPROVAL_STATE_END`. | PROVEN for write markers; UNPROVEN for future authority parsing. | `.github/workflows/pr-sentinel.yml` Governor write path. | Markers exist only for diagnostic artifact boundaries. |
| Sentinel diagnostic row | `governorPassed` and `sentinelPassed` are computed from current authoritative checks. | Scoped approval diagnostic row is non-gating. | PROVEN. | `.github/workflows/pr-sentinel.yml` scoped diagnostic comments and result row. | Scoped approval state does not affect `governorPassed` or `sentinelPassed`. |
| Storage garbage collection | Global manifest is reset after merge by post-merge reset. | File based scoped approval storage requires garbage collection after merge and is not implemented. | PROVEN for current reset; DEFERRED for file-scoped storage. | `.github/workflows/post-merge-manifest-reset.yml`; `tools/governance/approval-state-resolver.ts`. | Repository-persistent scoped approval artifacts must not accumulate on main. |
| Timestamp ties | Current BLOCK/approval ordering uses manifest `issued_at` versus BLOCK timestamp. | Timestamp equality fails closed for future scoped approval authority. | PROVEN in resolver vocabulary; UNPROVEN as active scoped authority. | `tools/governance/approval-state-resolver.ts`; `.github/workflows/pr-sentinel.yml` diagnostic note. | Future authority must fail closed on equality. |
| Packet execution authority | Local loop uses compiler-normalized packet data and registry commands. | No scoped approval authority is involved. | PROVEN for local-loop compiler and command runner behavior. | `schemas/local-loop-packet.schema.json`; `tools/sir-compiler/src/local-loop-command-runner.ts`; `scripts/loop-runner.sh`. | Packet execution is not freeform Markdown authority. |
| T-GOV-29 completion | T-GOV-29 witness remains paused. | Diagnostic scoped approval behavior exists only as pre-equivalence work. | DEFERRED. | `docs/SNAPSLOT_APPROVAL_STATE_ISOLATION_DESIGN.md`; this witness. | Do not claim T-GOV-29 complete. |

## Non-Claims

This witness does not claim scoped approval authority is active.

This witness does not claim approval-state isolation is complete.

This witness does not claim T-GOV-29 is complete.

This witness does not claim Sentinel final PASS for any PR.

This witness does not claim merge approval.
