# SnapSlot Loop-Runner Witness

T-GOV-17 is the first governed execution intended to be run through `scripts/loop-runner.sh`.

This file is a witness artifact, not product behavior.

This witness artifact does not implement Stages 10–12.

This witness artifact does not update the Acceptance Ledger.

This witness artifact does not prove full autonomous PR/merge flow.

Proof lives in local `proof/` and later PR/Sentinel evidence after operator PR preparation.

## T-GOV-24 witness-in-progress: full Stages 1-12 loop

T-GOV-24 is a witness run for full Stages 1-12 loop execution.

This section creates the scoped docs-only diff required for Stage 6 validation. It does not claim T-GOV-24 PASS. Actual proof for this run must come from the runner proof bundle and the PR body generated during this run.

Required witness checks:
- Stage 1 repo re-anchor must pass.
- Stage 2 no-key preflight must pass.
- Stage 3 Governor output must be captured.
- Stage 4 clearance gate must pass.
- Stage 5 Codex must execute within scope.
- Stage 6 scope must exactly match the allowed file list for this packet.
- Stage 7 command checks must pass.
- Stage 8 deterministic checks must be recorded, or explicitly skipped if not scoped.
- Stage 9 proof bundle must be verified.
- Stage 10 PR body/proof draft must be generated.
- Stage 11 draft PR must be created.
- Stage 12 handoff must be printed and stop.

The PR must remain a draft PR after Stage 12. No ready-for-review action, Governor approval automation, merge, manifest edit, Sentinel bypass, Sentinel polling, Acceptance Ledger update, or product work is automated by this witness.

The operator remains final merge authority.

T-GOV-25 is required after T-GOV-24 is merged and evidence is stable before the Acceptance Ledger can record PASS for full Stages 1-12.

Product Phase 5 remains paused. Token/test-efficiency governance remains deferred.
