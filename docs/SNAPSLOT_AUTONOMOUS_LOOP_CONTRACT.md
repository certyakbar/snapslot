# SnapSlot Local Subscription-Only Governed Autonomous Loop Contract

## 1. Purpose

This document is the SnapSlot Local Subscription-Only Governed Autonomous Loop Contract.

It defines the loop as a repeatable governed cycle, not a free-running agent. The loop exists to execute one Governor-cleared task packet at a time, collect proof, create a draft PR, and then stop for human and Governor review.

This contract does not replace or weaken Sentinel, the Acceptance Ledger, the Risk Policy, or final operator authority.

Implementation of scripts, shell wrappers, and workflow changes is out of scope for this document and must be governed by separate implementation packets.

## 2. Hard Constraints

The constraints in this section are mandatory and apply before any loop behavior, automation, invocation, validation, PR preparation, or retry.

### 2.1 Subscription-Only Execution Constraint

- Claude must run locally through subscription-authenticated Claude Code CLI only.
- Codex must run locally through subscription-authenticated Codex CLI only.
- No `OPENAI_API_KEY`, `CODEX_API_KEY`, `ANTHROPIC_API_KEY`, or `ANTHROPIC_AUTH_TOKEN` is permitted in any execution environment where the loop runs.
- No Anthropic `apiKeyHelper` or equivalent cloud-provider fallback path is permitted.
- No repo secret, CI/CD variable, or workflow path may route Claude or Codex through API billing.
- No dependency on GitHub Copilot coding agent (`copilot-swe-agent`) availability is permitted; that lane is separately blocked per T-GOV-14.
- No GitHub-hosted AI execution using any AI API key is permitted.
- No public-repo self-hosted runner may be used as the AI execution path.

### 2.2 Role Separation Constraint

- Claude Governor: invoked non-interactively with `claude -p`; produces clearance or `BLOCK` only; does not edit files.
- Codex Builder: executes only after explicit Governor clearance; touches only files listed in the active packet's `ALLOWED FILES`; does not self-approve, self-commit, self-push, or self-merge unless a future packet explicitly authorizes commit mechanics and preserves operator final authority.
- GitHub Actions / Sentinel: deterministic verification only; does not execute AI.
- Operator: final authority on task-packet acceptance, Governor verdict, and merge decision. This authority cannot be automated or delegated to the loop.

### 2.3 Fail-Closed Constraint

- At every stage, the loop must stop on any failure condition and must not continue to the next stage.
- A stopped loop must produce a human-readable failure report identifying the exact stage, the exact stop condition code, and the exact evidence that triggered it.
- The loop must not attempt self-recovery unless a new Governor-cleared corrective packet explicitly authorizes a retry and defines a new `ALLOWED FILES` scope.

## 3. No-Key Preflight Specification

The no-key preflight is a mandatory stage that runs before any AI invocation.

The preflight must stop the loop immediately if any of the following are set, exported, or otherwise accessible in the execution environment:

- `OPENAI_API_KEY`
- `CODEX_API_KEY`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`
- `CLAUDE_API_KEY`
- Any `ANTHROPIC_*` or `OPENAI_*` variable that could route AI execution through API billing
- Any `.env`, `.env.*`, or `.envrc` file in the repo root that contains an AI API key assignment
- Any `.github/workflows/` file that references a `secrets.*KEY` variable in an AI-execution job step
- Any Claude Code `settings.json` or project configuration that defines `apiKeyHelper` or an equivalent cloud-provider fallback path

On stop, the preflight report must name the exact variable name, file path, or config key found.

A clean preflight must emit this positive confirmation line before proceeding:

```text
NO-KEY PREFLIGHT: PASS — no observable AI API key execution path detected
```

The preflight checks only conditions visible to the loop's shell process at execution time. It cannot certify the absence of keys that are not in the environment, not in repo-tracked files, and not in the config paths it reads. The loop's no-key guarantee is limited to what the preflight can observe. This is not a gap; it is an honest constraint.

## 4. Repo Re-Anchor Specification

The repo re-anchor is a mandatory stage. It must:

1. Fetch `origin/main` with `git fetch origin main`.
2. Verify `HEAD` is on `main` and that `git rev-parse HEAD` equals `git rev-parse origin/main`; stop if behind, ahead, or detached.
3. Verify the working tree has no modifications to any of: `src/`, `tests/`, `public/`, `scripts/`, `.github/`, `ops/`, `*.ts`, `*.js` outside `node_modules/`, and `package.json`. Pre-existing `node_modules/` path artifacts from WSL/Windows environment translation are the only permitted working-tree noise at this stage.
4. Read and confirm current content of these files, in order:
   - `docs/SNAPSLOT_PHASE_TASKS.md`
   - `docs/SNAPSLOT_ACCEPTANCE_LEDGER.md`
   - `docs/SNAPSLOT_GOV_RUNBOOK.md`
5. Read and confirm `ops/GOVERNOR_APPROVAL.json` has `"verdict": "NONE"`.
6. Verify no open task-packet issues exist for the current cycle's task and no open PRs exist for a current cycle branch.

The re-anchor must stop on any failure.

## 5. Ordered Loop Stages

The loop is a twelve-stage, ordered, fail-closed sequence. No stage may begin unless every prior stage passed and its proof was captured.

### Stage 1 — Repo Re-Anchor

- Actor: loop automation (shell)
- Action: execute the re-anchor in Section 4.
- Pass: all re-anchor checks succeed and are logged.
- Stop conditions:
  - `HEAD` not on `main`
  - `HEAD` behind or ahead of `origin/main`
  - source working-tree modifications detected
  - any required governance doc unreadable
  - `GOVERNOR_APPROVAL.json` has a non-`NONE` verdict
  - open task-packet issue or PR for this cycle exists

### Stage 2 — No-Key Preflight

- Actor: loop automation (shell)
- Action: execute the preflight in Section 3.
- Pass: no key variable, `.env` key, secrets-referencing workflow step, or `apiKeyHelper` config is detected; positive confirmation line emitted.
- Stop conditions:
  - any key variable detected
  - any `.env` or `.envrc` AI key detected
  - any workflow step references AI key secrets
  - `apiKeyHelper` found in config

### Stage 3 — Governor Invocation

- Actor: Claude Governor, invoked via local subscription-authenticated Claude Code CLI.
- Command shape:

```text
claude -p "<governor-prompt>"
```

- The `<governor-prompt>` must instruct Claude to act as Governor, re-anchor to repo truth, and produce either an explicit Governor clearance with a complete scoped task packet, or an explicit Governor `BLOCK` with a stated blocking reason.
- `-p` runs non-interactively and exits after printing.
- Claude's full output must be captured to a local proof file for inclusion in the PR body.
- Pass: Governor output contains the explicit clearance signal and a complete scoped task packet.
- Stop conditions:
  - Governor produces `BLOCK`
  - Governor output is ambiguous or lacks the clearance signal
  - Governor invocation fails or produces no output

### Stage 4 — Governor Clearance Gate

- Actor: loop automation (shell)
- Action: parse Governor output for the explicit clearance signal; do not infer clearance from the absence of the Governor block verdict phrase.
- Defined clearance signal:

```text
GOVERNOR VERDICT: CLEAR TO SCOPE
```

- Parsing order and match behavior:
  - The Governor block verdict phrase is checked first using `grep -qF`, as a substring match anywhere in the file. If found, the runner stops immediately.
  - `GOVERNOR VERDICT: CLEAR TO SCOPE` is checked second using `grep -qxF`, as an exact standalone full-line match. Leading or trailing whitespace causes a miss.
  - The runner does not infer clearance from the absence of the Governor block verdict phrase. Both checks are fail-closed.
- Pass: the clearance signal is present as an exact standalone full line.
- Stop conditions:
  - output does not contain the defined clearance signal
  - Governor `BLOCK` is present
  - Governor output is empty or unparseable

### Stage 5 — Codex Builder Invocation

- Actor: Codex Builder, invoked via local subscription-authenticated Codex CLI.
- Command shape:

```text
codex exec --full-auto --sandbox workspace-write "<executor-prompt>"
```

- The `<executor-prompt>` is the scoped task packet produced by the Governor in Stage 3, read verbatim from `proof/stage3-governor-output.txt` and passed to Codex, not summarized or paraphrased.
- Codex may only modify or create files listed in the active packet's `ALLOWED FILES`.
- Codex must not commit, push, stage, or self-approve in this stage. Those actions require separate explicit authorization in a future packet.
- Pass: Codex exits `0` and reports files changed or created.
- Stop conditions:
  - Codex exits non-zero
  - Codex reports touching forbidden files
  - Codex invocation fails

### Stage 6 — Hard Scope Verification

- Actor: loop automation (shell)
- Action: combine tracked changed files from `git diff --name-only HEAD` with untracked new files from `git ls-files --others --exclude-standard`, filter out `node_modules/` paths and `package-lock.json`, deduplicate, and compare the result against the active packet's `ALLOWED FILES` list.
- Packet list parsing skips markdown horizontal rule separator lines matching `^[[:space:]]*---+[[:space:]]*$`; these lines are silently ignored and do not terminate section parsing or split list entries.
- The result must be an exact match: no extra files, no missing expected files.
- A new untracked file that was not staged is a valid changed file for this check.
- Pass: combined tracked-plus-untracked diff matches `ALLOWED FILES` exactly.
- Stop conditions:
  - any file not in `ALLOWED FILES` appears in the combined diff
  - combined diff is empty when changes were expected
  - combined diff cannot be read

### Stage 7 — Packet Validation Commands

- Actor: loop automation (shell)
- Action: run every command listed in the active packet's `VALIDATION COMMANDS` section, in order, capturing exact output to the proof bundle.
- Pass: all validation commands exit `0` and produce the expected output.
- Stop conditions:
  - any validation command exits non-zero
  - any command cannot be run
  - output indicates failures

### Stage 8 — Deterministic Repo Checks (If Scoped)

- Actor: loop automation (shell)
- Action: run any deterministic checks scoped by the active packet, including typecheck, test suite, and grep proofs; capture exact output.
- Pass: all checks pass.
- Stop conditions:
  - typecheck fails
  - tests fail
  - any scoped grep proof fails

### Stage 9 — Proof Output Collection

- Actor: loop automation (shell)
- Action: collect and store all proof artifacts from Stages 1 through 8 into a local proof bundle; include exact command outputs, not paraphrases.
- Current `scripts/loop-runner.sh` implementation proceeds to Stage 10 proof draft generation after Stage 9 proof collection.
- Pass: proof bundle is non-empty and contains exact outputs for all stages.
- Stop conditions:
  - proof bundle is empty
  - any stage output is missing
  - any output was paraphrased or truncated without capturing the raw original

### Stage 10 — PR Body / Proof Draft Generation

Implementation status: Stage 10 is implemented by T-GOV-21 in `scripts/loop-runner.sh`.

- Actor: loop automation (shell).
- Action: generate a draft PR body and proof summary only. Stage 10 must not create a branch, stage files, commit, push, create a PR, request review, approve, mark ready, or merge.
- Required proof capture at execution time from the current working tree:
  - exact `git status --short` output
  - exact `git diff --name-only` output
  - exact `git diff --summary` output
  - exact `git diff --raw` output
  - exact mode-sensitive proof for `scripts/loop-runner.sh` whenever that file is in packet scope or appears in the working tree diff
- The proof used for the draft PR body must be captured during the current Stage 10 execution. It must not be reconstructed from session memory, prior terminal scrollback, stale proof files, or any previous loop run state.
- The draft PR body must be assembled from exact proof captures only.
- The draft PR body must include:
  - Sentinel anchors: `SENTINEL:task_id`, `SENTINEL:risk`, `SENTINEL:ledger`, `SENTINEL:FILES_BEGIN`, `SENTINEL:FILES_END`, `SENTINEL:LEDGER_BEGIN`, and `SENTINEL:LEDGER_END`
  - changed-file scope from current execution proof
  - the proof bundle with exact terminal output
  - the Governor clearance reference from Stage 3 as proof of scope clearance only
- The draft PR body must not claim merge approval, Governor approval, Sentinel pass, or implementation proof that is not present in the current execution proof bundle.
- Pass: the PR body draft exists, all claims are backed by exact proof captured during this Stage 10 execution, Sentinel anchors are present, changed-file scope matches current proof, and no approval or merge claim is present.
- Stop conditions:
  - any required proof command fails or cannot be captured
  - any proof output is stale, paraphrased, truncated without raw capture, or sourced from a different repo state
  - `git status --short`, `git diff --name-only`, `git diff --summary`, or `git diff --raw` contradicts the expected repo state or changed-file scope
  - mode-sensitive proof is missing when `scripts/loop-runner.sh` is relevant
  - the draft PR body contains any claim not backed by exact current-execution proof
  - the draft PR body claims merge approval or Governor approval
  - the draft PR body is empty or missing Sentinel anchors

### Stage 11 — Branch, Commit, Push, and Draft PR Creation

Implementation status: Stage 11 is implemented by T-GOV-22 in `scripts/loop-runner.sh`.

- Actor: loop automation (shell, including `git` and `gh pr create --draft`).
- Action: perform only the branch, commit, push, and draft PR creation mechanics needed to publish the already-proven scoped diff.
- Stage 11 may create a branch only from one of these exact states:
  - exact clean synced `main`, proven before branch creation, or
  - exact allowed post-builder diff state, with clean-state proof recorded before branch creation and current diff proof matching the active packet scope
- Stage 11 must stop if the repo is dirty before branch creation outside the exact allowed post-builder diff state. It must not proceed through ambiguity.
- Stage 11 may commit only scoped allowed files from the active packet. No unrelated file may be staged. Staging must be explicit and scope-checked before commit.
- Stage 11 must push the branch to remote.
- Stage 11 must create a draft PR only, using the proof bundle produced by Stage 10. It must not synthesize new claims during PR creation.
- Stage 11 must stop and report if `gh pr create --draft` fails. It must not retry blindly or alter scope to make the command pass.
- Stage 11 writes the full command output to `proof/stage11-output.txt` and writes the draft PR URL to `proof/stage11-draft-pr-url.txt`.
- Stage 11 stops after draft PR creation. Stage 12 remains separate and is not implemented by Stage 11.
- Pass: branch is created from a permitted proven state, only allowed files are committed, push succeeds, draft PR is created, and the draft PR URL is captured.
- Stop conditions:
  - clean synced `main` proof is missing when required
  - allowed post-builder diff proof is missing or contradicts current state
  - repo state is dirty before branch creation outside the allowed post-builder diff state
  - any file outside the active packet's `ALLOWED FILES` would be staged or committed
  - branch creation, commit, push, or draft PR creation fails
  - `gh pr create --draft` fails
  - any step would mark the PR ready, approve the PR, merge the PR, edit `ops/GOVERNOR_APPROVAL.json`, bypass Sentinel, or continue after failure

### Stage 12 — Operator / Governor Handoff Stop

Design status: design only. Stage 12 is not implemented in `scripts/loop-runner.sh`; implementation is deferred to T-GOV-23.

- Actor: loop automation (shell) for reporting only; operator and Governor for all review and approval decisions after the loop stops.
- Action: print the draft PR URL, print the proof bundle summary, print exact next manual commands or review requirements, and stop.
- Required handoff output:
  - draft PR URL
  - changed-file scope summary from the Stage 10 proof bundle
  - exact proof bundle location and exact proof files included
  - exact next manual Governor review command or review requirement
  - exact operator review requirement
- Stage 12 must stop after reporting. It must not continue into monitoring, polling, approval, merge, manifest editing, or retry behavior.
- Pass: handoff report is printed and the loop exits without further action.
- Stop conditions:
  - PR URL is missing
  - proof bundle summary cannot be printed from current proof
  - next manual commands or review requirements are missing
  - any step would mark the PR ready, approve the PR, merge the PR, edit `ops/GOVERNOR_APPROVAL.json`, bypass Sentinel, rerun after failure, or continue after handoff

## 6. Automation Boundary Table

┌────────────────────────────────────────────────────────────────────────┬────────────────────┐
│                                Activity                                │ Loop may automate? │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Repo re-anchor checks                                                  │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ No-key preflight                                                       │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Claude Governor invocation                                             │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Governor clearance gate (parse output)                                 │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Codex Builder invocation after clearance                               │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Hard scope verification                                                │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Validation command execution                                           │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Proof capture                                                          │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ PR draft body generation                                               │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Draft PR creation                                                      │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Failure reports                                                        │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Repeatable retry when a new Governor-cleared corrective packet exists  │ YES                │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Task-packet invention without Governor scope                           │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Governor approval / APPROVE verdict                                    │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Final merge decision                                                   │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Self-merge                                                             │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Bypassing or weakening Sentinel                                        │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Converting FAIL rows to PASS without witnessed proof                   │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Continuing after Governor BLOCK                                        │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Continuing after scope drift                                           │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Continuing after failed validation                                     │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Continuing after API-key detection                                     │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Continuing from dirty source working tree                              │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Continuing after missing proof                                         │ NO — never         │
├────────────────────────────────────────────────────────────────────────┼────────────────────┤
│ Taking any action after Stage 12 without a new Governor-cleared packet │ NO — never         │
└────────────────────────────────────────────────────────────────────────┴────────────────────┘

## 7. GitHub Control-Plane Boundary

GitHub is the control plane and proof record for all packets, PRs, Sentinel runs, and Governor verdicts.

GitHub Actions / Sentinel runs deterministic checks only: typecheck, tests, scope verification, and approval manifest validation. They must not execute AI.

No GitHub-hosted AI execution using any OpenAI or Anthropic API key is permitted.

No dependency on `copilot-swe-agent` availability is permitted; that lane is separately blocked per T-GOV-14 and Runbook Section 9.

No public-repo self-hosted runner may be used as the AI execution path for signed-in local Claude or Codex sessions.

Final PR merge requires all three distinct acts:

1. Sentinel passing.
2. Governor `APPROVE FOR MERGE` verdict.
3. Operator-initiated merge.

These acts are distinct and none can be collapsed into automation.

## 8. Proof Capture Requirements

The proof bundle for every loop cycle must contain:

1. Exact `git status --short` output at Stage 1.
2. Exact `git rev-parse HEAD` and `git rev-parse origin/main` output at Stage 1.
3. No-key preflight exit status and confirmation line, or the exact key/path name that caused a stop.
4. Governor full output captured to file, not summarized.
5. Exact Codex exit code and any Codex output.
6. Exact combined tracked-plus-untracked scope diff after Codex, the full output of the Stage 6 check.
7. Exact output of every validation command.
8. Exact typecheck output and exact test suite output.
9. Full Stage 11 command output in `proof/stage11-output.txt`.
10. Draft PR URL after Stage 11 in `proof/stage11-draft-pr-url.txt`.

No paraphrasing is allowed. No truncation is allowed unless the raw original has been captured. If raw capture was not possible for any item, the proof bundle is incomplete and Stage 9 must stop.

### 8.1 Stage 10-12 Proof-Honesty Requirements

Stages 10-12 carry the T-GOV-19 proof-honesty observations forward as contract requirements. These requirements are design only until T-GOV-21, T-GOV-22, and T-GOV-23 implement them.

- No stale proof: every proof item used for PR body generation, branch publication, draft PR creation, or handoff must be captured at execution time from the current working tree.
- No repo-state mismatch: proof captured from one repo state must not be submitted for an action performed in another repo state.
- No mode-drift ambiguity: file mode must be explicitly captured and included in proof when relevant, including for `scripts/loop-runner.sh`.
- Exact terminal output is required over summary claims.
- Any contradiction between proof and current repo state must stop the loop and surface the blocker. The loop must fail closed.
- Token/test-efficiency governance remains deferred to T-GOV-26 and must not be bundled into T-GOV-21, T-GOV-22, T-GOV-23, T-GOV-24, or T-GOV-25.

### 8.2 Draft PR Body Requirements

The Stage 10 draft PR body must satisfy these requirements before Stage 11 may use it:

- All claims must be backed by exact proof from current execution.
- Sentinel anchors must be present and populated from current execution proof.
- Changed-file scope must be present and must match current execution proof.
- The proof bundle must include exact terminal output, not summary claims.
- The body must not claim merge approval.
- The body must not claim Governor approval.
- The body must not imply Stages 10-12 are implemented or witnessed before the relevant implementation and witness packets complete.

## 9. Forbidden Loop Behavior

The loop must never:

1. Run as a free-running infinite agent with no human checkpoint.
2. Automate Governor approval or an `APPROVE FOR MERGE` verdict.
3. Automate the final merge decision.
4. Execute AI on GitHub-hosted infrastructure using any AI API key.
5. Depend on `copilot-swe-agent` availability.
6. Bypass or weaken Sentinel verification.
7. Weaken Acceptance Ledger truth or proof standards.
8. Weaken Risk Policy or risk tier requirements.
9. Weaken phase-gate proof requirements.
10. Continue after a Governor `BLOCK`.
11. Continue after any failed validation command.
12. Continue after source working-tree modifications are detected at Stage 1.
13. Continue after forbidden file drift at Stage 6.
14. Continue after API-key detection at Stage 2.
15. Continue after missing proof at Stage 9.
16. Convert the existence of this design document into a `PASS` row in the Acceptance Ledger.
17. Add implementation scripts under this contract without a separate governed implementation packet.
18. Modify `.github/workflows/*.yml` under this contract without a separate governed implementation packet.
19. Modify `docs/SNAPSLOT_SENTINEL_CONTRACT.md` under this contract without a separate governed implementation packet.
20. Modify `docs/SNAPSLOT_ACCEPTANCE_LEDGER.md` under this contract without a separate governed implementation packet.
21. Modify `docs/SNAPSLOT_GOV_RUNBOOK.md` under this contract without a separate governed implementation packet.
22. Introduce any dependency on `OPENAI_API_KEY`, `CODEX_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, or any API-key billing path.
23. Allow Codex to commit, push, stage files, or self-approve as Builder work. Commit mechanics require a future packet and must preserve operator final authority.
24. Retry without a new Governor-cleared corrective packet authorizing the retry.
25. Claim that Stage 2 preflight certifies the absence of keys outside the shell environment, outside repo-tracked files, and outside the config paths the preflight reads.
26. Treat Stage 10 or Stage 11 as implemented before T-GOV-21 and T-GOV-22 complete with proof, or treat Stage 12 as implemented before T-GOV-23 completes with proof.
27. Bundle token/test-efficiency governance into the Stage 10-12 implementation sequence before T-GOV-26.
28. Introduce mark-ready automation, auto-approval, auto-merge, direct Governor approval manifest edits, Sentinel bypass, or blind rerun after failure as a permitted capability.

## 10. Versioning and Change Control

Once accepted, this contract is versioned governance law. Changes after acceptance require a new governed packet and cannot be made by informal edit.

Implementation packets that follow this contract must be scoped separately. Each implementation packet must define its own allowed files, forbidden files, validation commands, proof requirements, and stop conditions.

The Stage 10-12 implementation sequence is fixed unless a later governed packet changes it:

1. T-GOV-21: Implement Stage 10 PR body/proof draft generation only.
2. T-GOV-22: Implement Stage 11 draft PR creation only. Status: implemented in `scripts/loop-runner.sh`.
3. T-GOV-23: Implement Stage 12 stop/report handoff only.
4. T-GOV-24: Witness full Stages 1-12 loop execution.
5. T-GOV-25: Ledger update for proven Stages 1-12.
6. T-GOV-26: Token/test-efficiency governance remains deferred and separate.

This contract does not implement the loop. It defines the approved design boundary that later implementation packets may cite.
