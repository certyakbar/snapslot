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

- Claude Governor: plan mode only, invoked with `--permission-mode plan`; produces clearance or `BLOCK` only; does not edit files.
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

### Stage 3 — Governor Invocation (Plan Mode)

- Actor: Claude Governor, invoked via local subscription-authenticated Claude Code CLI.
- Command shape:

```text
claude -p --permission-mode plan "<governor-prompt>"
```

- The `<governor-prompt>` must instruct Claude to act as Governor, re-anchor to repo truth, and produce either an explicit Governor clearance with a complete scoped task packet, or an explicit Governor `BLOCK` with a stated blocking reason.
- `-p` runs non-interactively and exits after printing.
- `--permission-mode plan` enforces read-only plan mode at the CLI level, preventing file edits regardless of prompt content.
- Claude's full output must be captured to a local proof file for inclusion in the PR body.
- Pass: Governor output contains the explicit clearance signal and a complete scoped task packet.
- Stop conditions:
  - Governor produces `BLOCK`
  - Governor output is ambiguous or lacks the clearance signal
  - Governor invocation fails or produces no output

### Stage 4 — Governor Clearance Gate

- Actor: loop automation (shell)
- Action: parse Governor output for the explicit clearance signal; do not infer clearance from the absence of `BLOCK`.
- Defined clearance signal:

```text
GOVERNOR VERDICT: CLEAR TO SCOPE
```

- Pass: the clearance signal is unambiguous.
- Stop conditions:
  - output does not contain the defined clearance signal
  - Governor `BLOCK` is present
  - Governor output is empty or unparseable

### Stage 5 — Codex Builder Invocation

- Actor: Codex Builder, invoked via local subscription-authenticated Codex CLI.
- Command shape:

```text
codex "<executor-prompt>"
```

- The `<executor-prompt>` is the scoped task packet produced by the Governor in Stage 3, passed verbatim, not summarized or paraphrased.
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
- Pass: proof bundle is non-empty and contains exact outputs for all stages.
- Stop conditions:
  - proof bundle is empty
  - any stage output is missing
  - any output was paraphrased or truncated without capturing the raw original

### Stage 10 — PR Body / Proof Summary Preparation

- Actor: loop automation (shell); optionally Claude Governor in a read-only summarize invocation with `claude -p --permission-mode plan` if the active packet authorizes it.
- Action: compose a PR body draft from the active packet's PR body template, populated with task ID, task name, risk level, allowed files, exact validation command outputs, Governor clearance reference, and proof bundle location.
- No claim may appear in the PR body that is not backed by proof from the bundle.
- Pass: PR body draft is complete, factually accurate, and references real proof.
- Stop conditions:
  - PR body contains claims not backed by proof
  - PR body is empty
  - preparation fails

### Stage 11 — Draft PR Creation

- Actor: loop automation (shell, `gh pr create --draft`).
- Action: perform only the operator-authorized branch publication mechanics needed to open a draft PR. The PR must be in draft state and must not be marked ready for review until the operator and Governor have reviewed it.
- The draft PR URL must be reported to the operator.
- Pass: draft PR is created and URL is reported.
- Stop conditions:
  - push fails
  - PR creation fails
  - any step in this stage would auto-mark the PR ready for review or trigger auto-merge

### Stage 12 — Stop for Operator and Governor Review

- Actor: operator (human) and Governor (Claude, invoked manually by operator with `claude -p --permission-mode plan`).
- Action: the loop terminates here. The operator reviews the draft PR, the proof bundle, and the Governor clearance. The Governor issues a final `GOVERNOR VERDICT: APPROVE FOR MERGE` or `GOVERNOR VERDICT: BLOCK`. The operator makes the merge decision.
- The loop must not automate this stage under any condition.
- The loop must not poll for merge completion or take any action after Stage 12 without a new Governor-cleared packet authorizing the next cycle.

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
9. Draft PR URL after Stage 11.

No paraphrasing is allowed. No truncation is allowed unless the raw original has been captured. If raw capture was not possible for any item, the proof bundle is incomplete and Stage 9 must stop.

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

## 10. Versioning and Change Control

Once accepted, this contract is versioned governance law. Changes after acceptance require a new governed packet and cannot be made by informal edit.

Implementation packets that follow this contract must be scoped separately. Each implementation packet must define its own allowed files, forbidden files, validation commands, proof requirements, and stop conditions.

This contract does not implement the loop. It defines the approved design boundary that later implementation packets may cite.
