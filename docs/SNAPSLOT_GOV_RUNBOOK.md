# SnapSlot Governor Runbook

## 1. Purpose and scope

This runbook covers the automated governance lane only: task-packet intake, task dispatch, malformed-packet fail-closed behavior, Sentinel enforcement reference, Governor verdict handling, and the manual fallback issue form. It does not cover booking-runtime behavior, product workflows, or any governance file outside the specific sources cited below.

T-GOV-9 (PR #45) implemented automated intake, T-GOV-10 (PR #47) implemented automated dispatch, and T-GOV-11 (PR #49) added author gates to `workflow_dispatch` and `governor-manifest-commit`. Per T-GOV-12 proof state, all three are on `origin/main`.

## 2. Intake path: /newtask comment

Source of truth: `.github/workflows/create-task-packet.yml`.

The `/newtask` intake path is an `issue_comment` path only. The job-level gate allows execution only when `github.event_name == 'issue_comment'`, `github.event.comment.user.login == 'certyakbar'`, and `!github.event.issue.pull_request`.

Inside `getIssueCommentPayload()`, the workflow normalizes newlines with `normalizeNewlines()`, splits the comment body with `split("\n")`, and requires the first line after trimming to be exactly `/newtask` via `lines[0].trim()`. If the first line does not match, the workflow logs that it is ignoring the comment and returns without creating anything.

The payload is every line after the first line, joined back together and trimmed. That string is parsed as JSON. If the payload is empty, malformed, or fails validation, the workflow routes through `failClosed()`.

Validation is centralized in `collectValidationFailures()`. It validates required fields, optional string fields, risk/phase/workflow constraints, actor-surface values, array fields, and the `task_id` pattern. Any failure is fail-closed.

On failure, `failClosed()` posts an error comment back to the origin issue on the `issue_comment` path and then calls `core.setFailed()`. No task-packet issue is created on failure.

On success, the workflow normalizes the packet with `normalizePacket()`, renders the issue body with `renderIssueBody()`, creates a new issue titled `TASK PACKET: {task_name}`, applies the `task-packet` label, and comments back to the origin issue with the created issue URL and number.

PROVEN: live `/newtask` issue-comment execution success. GitHub Actions `Create Task Packet` run `24730966853` on `main` was triggered by `issue_comment` on 2026-04-21 at `2026-04-21T15:25:12Z` and completed with conclusion `success` (updated `2026-04-21T15:25:23Z`). Display title: "T-GOV-13 proof: /newtask intake trigger". The `/newtask` issue-comment intake path is witnessed working.

## 3. Intake path: workflow_dispatch

Source of truth: `.github/workflows/create-task-packet.yml`.

The manual intake path is `workflow_dispatch`, which can be triggered from the GitHub UI or API. The workflow defines one required input field, `payload`, described as the full task-packet JSON payload.

The author gate is at the job `if:` condition: `github.event_name == 'workflow_dispatch' && github.actor == 'certyakbar'`. This gate was added in T-GOV-11.

The `payload` input is read as a single JSON string. After parsing, it passes through the same `collectValidationFailures()` logic used by the `/newtask` path, so validation behavior is identical across both intake modes.

On success, the workflow creates the same `TASK PACKET: {task_name}` issue with label `task-packet`. On the `workflow_dispatch` path, it records the created issue URL and number in the GitHub Actions summary via `core.summary.addRaw(...).write()` instead of commenting on an origin issue.

PROVEN: live `workflow_dispatch` execution. GitHub Actions `Create Task Packet` workflow run `#2` on `main` was triggered by `workflow_dispatch` on 2026-04-16 at `2026-04-16T19:35:05Z` and completed with conclusion `success`. This intake path is witnessed working.

## 4. Dispatch path: /dispatch command

Sources of truth: `.github/workflows/dispatch-agent.yml`, `scripts/dispatch-agent.js`, and `scripts/compile-task.js`.

The outer workflow gate lives in `.github/workflows/dispatch-agent.yml`. The workflow is triggered by `issue_comment` and the job-level gate requires the comment author to be `certyakbar` and the target to be a non-PR issue. The `command_guard` step normalizes newlines, splits the comment body into lines, and requires the first trimmed line to be exactly `/dispatch`. If it is not, the workflow sets `should_dispatch=false` and stops.

If the command matches, `validate_issue` refetches the issue and enforces the remaining outer gates: the issue must still be a plain issue, it must be open, the title must start with `TASK PACKET:`, and the issue must carry the `task-packet` label. Any failure posts a rejection comment to the issue and calls `core.setFailed()`.

`scripts/dispatch-agent.js` then performs the execution sequence. First, it runs `scripts/compile-task.js` and aborts if compilation or validation fails. Second, it parses `task_id` out of SECTION 1 of the compiled output. Third, it runs a GitHub GraphQL preflight query against `suggestedActors(capabilities: [CAN_BE_ASSIGNED])` and requires `copilot-swe-agent` to appear. Fourth, it checks the issue state again with `gh issue view` and requires `OPEN`. Fifth, it POSTs an assignee request to `/repos/certyakbar/snapslot/issues/{issueNumber}/assignees` with `copilot-swe-agent[bot]` and an `agent_assignment` payload that hardcodes `model: gpt-5.2-codex`, `base_branch: main`, and `target_repo: certyakbar/snapslot`.

`scripts/compile-task.js` validates the task packet and emits six sections in order: SECTION 1 `EXECUTOR PROMPT`, SECTION 2 `FALLBACK PACKET`, SECTION 3 `PR BODY DRAFT`, SECTION 4 `PROOF SKELETON`, SECTION 5 `CLEANUP CHECKLIST`, and SECTION 6 `POST-MERGE CLOSURE CHECKLIST`.

PARTIAL LIVE EVIDENCE: GitHub Actions `Dispatch Agent` run `24730998040` on `main` was triggered by `issue_comment` on 2026-04-21 at `2026-04-21T15:25:48Z` and concluded `failure`. The witnessed evidence from that run:

- `command_guard` step: passed - comment body first line was `/dispatch`, `should_dispatch=true` set
- `validate_issue` step: passed - issue #53 was state `open`, title `TASK PACKET: Governor intake lane live proof`, label `task-packet`
- `Run dispatch-agent.js` step: invoked with `node scripts/dispatch-agent.js 53`
- `compile-task.js` exited 0 for issue #53 (script continued past compile step to preflight)
- `task_id` parse: succeeded (script continued past this step)
- GraphQL preflight (`gh api graphql`): executed and returned valid JSON
- Preflight determination: `copilot-swe-agent` was NOT present in `suggestedActors` - exact stderr: `"Error: copilot-swe-agent is not available as a suggested actor on this repository. Ensure GitHub Copilot coding agent is enabled."`
- `dispatch-agent.js` exit code: 1
- `Comment dispatch result` step: ran (always-condition), posted failure message to issue #53
- Steps NOT reached: `gh issue view` (issue state check), `gh api POST /assignees` (Copilot assignment POST)

UNPROVEN: live `/dispatch` execution success. Run `24730998040` proves the command guard, task-packet issue validation, `dispatch-agent.js` invocation, `compile-task.js` success, `task_id` parse, and GraphQL preflight execution. The remaining unproven steps are the post-preflight `gh issue view` state check and `gh api POST /assignees` Copilot assignment.

BLOCKED: `copilot-swe-agent` actual availability on this repository. T-GOV-14 Copilot availability check output:

```json
{"data":{"repository":{"suggestedActors":{"nodes":[{"login":"certyakbar"}]}}}}
```

Because `copilot-swe-agent` is absent from `suggestedActors`, the live dispatch proof cannot proceed to the final issue-state check or Copilot assignment POST.

UNPROVEN: GitHub Actions runner environment at dispatch execution time. The workflow declares `runs-on: ubuntu-latest`, but the exact live runner environment at the moment of a future dispatch cannot be proven from static repo files.

## 5. Malformed-packet fail-closed behavior

Source of truth: `collectValidationFailures()` and `failClosed()` in `.github/workflows/create-task-packet.yml`.

Status: code-verified.

The intake workflow fails closed on malformed or invalid payloads. `collectValidationFailures()` enforces all of the following:

- The payload must be a JSON object, not `null`, not an array, and not another primitive.
- Required string fields must be present and non-empty: `task_id`, `task_name`, `phase`, `workflow`, `required_behavior`, `forbidden_behavior`, `stop_rule`, and `return_format`.
- Optional string fields, when supplied, must be strings: `known_contradictions`, `docs_may_change`, `ledger_update_required`, and `notes`.
- `risk_level` must be present, must be a string, and must be one of `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW`.
- `phase`, when present, must be `Phase N/A` or one of `Phase 0` through `Phase 12`.
- `workflow`, when `phase` is `Phase N/A`, must be exactly `N/A`; otherwise it must match `^Workflow [A-L](?:\b| .*)`.
- `actor_surface` must be an array of non-empty strings, must contain at least one entry, and every value must be one of `PLATFORM_OWNER`, `BUSINESS_ADMIN`, `CUSTOMER`, or `INTERNAL`.
- `allowed_files`, `forbidden_files`, and `validation_commands` must each be arrays of non-empty strings and must each contain at least one entry.
- `task_id` must match `^T-\S+$`.

`failClosed()` posts an error comment back to the origin issue on the `issue_comment` path only, then calls `core.setFailed()`. Because issue creation is attempted only after validation passes, no issue is ever created on validation failure.

Worked example: submitting `{}` fails closed with these field-level failures:

- `task_id: missing or empty`
- `task_name: missing or empty`
- `phase: missing or empty`
- `workflow: missing or empty`
- `required_behavior: missing or empty`
- `forbidden_behavior: missing or empty`
- `stop_rule: missing or empty`
- `return_format: missing or empty`
- `risk_level: missing or empty`
- `actor_surface: must be an array`
- `allowed_files: must be an array`
- `forbidden_files: must be an array`
- `validation_commands: must be an array`

## 6. Sentinel enforcement reference

Source of truth: `.github/workflows/pr-sentinel.yml`. Definitive contract reference: `docs/SNAPSLOT_SENTINEL_CONTRACT.md`.

Status: code-verified.

Group A runs repository validation: `npx tsc --noEmit` and `npm test`. Either failure blocks the PR.

Group B checks PR template control fields: task ID, declared risk tier, declared file list, and declared ledger impact. It prefers machine-readable HTML comment anchors and section markers, with visible markdown as fallback.

Group C enforces protected-path and scope rules. CRITICAL-path files require declared risk `CRITICAL`. HIGH-path files require declared risk `HIGH` or `CRITICAL`. The declared file list must exactly equal the actual diff in both directions, with `ops/GOVERNOR_APPROVAL.json` excluded from the scope comparison.

Group D enforces Governor verdict rules. For CRITICAL and HIGH risk PRs, Sentinel requires a valid approval manifest bound to `approved_parent_sha` and `approved_tree_sha`. At every risk level, a later authenticated `GOVERNOR VERDICT: BLOCK` comment overrides mergeability. Any commit after approval invalidates the manifest binding.

UNPROVEN: the live `main` branch protection or ruleset state, including whether `require pull request`, `require status checks`, and `dismiss stale approvals` style settings are currently configured. Repo files describe the expected control model, but current repository settings are external to the codebase and cannot be proven from code reading alone.

## 7. Governor verdict workflow

Sources of truth: `.github/workflows/pr-sentinel.yml` and `.github/workflows/post-merge-manifest-reset.yml`.

On the APPROVE path, the Governor posts `GOVERNOR VERDICT: APPROVE FOR MERGE` as a PR comment. The `governor-manifest-commit` job in `pr-sentinel.yml` is author-gated to `certyakbar` on the `issue_comment` event and requires a PR comment containing `GOVERNOR VERDICT`. For APPROVE, it fetches the PR head commit and tree, parses task/risk/scope fields from the PR body, builds `ops/GOVERNOR_APPROVAL.json` with bindings to `approved_parent_sha` and `approved_tree_sha`, commits that manifest to the PR branch, and thereby triggers a `pull_request` `synchronize` event. Sentinel then re-evaluates the manifest on the new head SHA.

On the BLOCK path, the Governor posts `GOVERNOR VERDICT: BLOCK`. The same `governor-manifest-commit` job detects BLOCK and pushes an empty commit on the PR branch instead of creating a manifest. That synchronize event causes Sentinel to run again and re-read the authenticated BLOCK comment.

After merge, `.github/workflows/post-merge-manifest-reset.yml` runs on merged pull requests targeting `main`. It uses the Governor App token path again and resets `ops/GOVERNOR_APPROVAL.json` on `main` back to canonical `verdict: NONE`.

UNPROVEN: `GOVERNOR_APP_ID` and `GOVERNOR_APP_PRIVATE_KEY` are referenced by both manifest-writing workflows, but their current existence and validity in repository secrets cannot be verified from code reading.

## 8. Manual fallback: task packet issue form

Source of truth: `.github/ISSUE_TEMPLATE/01-task-packet.yml`.

Status: code-verified.

The repository contains a structured issue form for task packets. It pre-fills the title with `TASK PACKET: ` and auto-applies the `task-packet` label.

This fallback path does not depend on any workflow run, GitHub App token, or repository secret. It is usable even if intake automation is unavailable.

Any issue created through this form is structurally compatible with the `/dispatch` workflow because the dispatch gate only requires a plain open issue, a title starting with `TASK PACKET:`, the `task-packet` label, and an authorized `/dispatch` comment.

## 9. Known UNPROVEN / BLOCKED items

- UNPROVEN: live `/dispatch` -> `compile-task` -> Copilot assignment success. Run `24730998040` on 2026-04-21 reached and passed command guard, task-packet issue validation, `dispatch-agent.js` invocation, `compile-task.js`, `task_id` parse, and GraphQL preflight execution. It stopped before `gh issue view` and `gh api POST /assignees` because `copilot-swe-agent` was absent from `suggestedActors`.
- BLOCKED: `copilot-swe-agent` actual availability on this repository. T-GOV-14 GraphQL output was `{"data":{"repository":{"suggestedActors":{"nodes":[{"login":"certyakbar"}]}}}}`.
- UNPROVEN: GitHub Actions runner environment at the time of a live dispatch execution.
- UNPROVEN: current existence and validity of `GOVERNOR_APP_ID` and `GOVERNOR_APP_PRIVATE_KEY` repository secrets.
- UNPROVEN: live `main` branch protection or ruleset settings, including require-PR, require-status-checks, and dismiss-stale-approvals style controls.

## 10. Local loop runner

The local loop runner (`scripts/loop-runner.sh`) implements T-GOV-15 Stages 1–9 of the SnapSlot Governed Autonomous Loop Contract (`docs/SNAPSLOT_AUTONOMOUS_LOOP_CONTRACT.md`). Stages 10–12 (PR body preparation, draft PR creation, and operator/Governor review stop) are not implemented in this script and require a separate governed packet.

### 10.1 Invocation syntax

```bash
bash scripts/loop-runner.sh "<governor-prompt>"
```

The sole argument is the full Governor prompt text passed verbatim to `claude -p --permission-mode plan`. Typically this is the contents of the task packet document the operator wants Governor to review.

### 10.2 Stages implemented (1–9)

- **Stage 1 — Repo Re-Anchor**: fetches `origin/main`; verifies HEAD is on `main` and equals `origin/main`; checks for source working-tree modifications (permits `node_modules/` and `package-lock.json` WSL noise only); verifies `ops/GOVERNOR_APPROVAL.json` has `"verdict": "NONE"`; confirms required governance docs are readable. 
- **Stage 2 — No-Key Preflight**: stops if any `OPENAI_API_KEY`, `CODEX_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_API_KEY`, or any `OPENAI_*`/`ANTHROPIC_*` billing-path variable is set in the environment; stops if `.env`, `.env.*`, or `.envrc` in repo root defines AI API key variables; stops if `.claude/settings.json` or `.claude/settings.local.json` contains `apiKeyHelper`. Emits `NO-KEY PREFLIGHT: PASS — no observable AI API key execution path detected` on clean pass.
- **Stage 3 — Governor Invocation**: invokes `claude -p --permission-mode plan "<governor-prompt>"` and captures full output to `proof/stage3-governor-output.txt`. Stops if command fails or output is empty.
- **Stage 4 — Governor Clearance Gate**: parses `proof/stage3-governor-output.txt` for exact string `GOVERNOR VERDICT: CLEAR TO SCOPE`. Stops if absent. Stops if `GOVERNOR VERDICT: BLOCK` is present. Does not infer clearance from absence of BLOCK.
- **Stage 5 — Codex Builder Invocation**: reads Governor output from Stage 3 and passes it verbatim to `codex`. Captures output and exit code to `proof/stage5-codex-output.txt`. Stops on non-zero exit.
- **Stage 6 — Hard Scope Verification**: derives ALLOWED FILES from Governor output; combines `git diff --name-only HEAD` with `git ls-files --others --exclude-standard`; filters out `node_modules/` and `package-lock.json`; sorts and deduplicates; compares against ALLOWED FILES. Stops if actual diff is empty or if any actual file is not in ALLOWED FILES.
- **Stage 7 — Packet Validation Commands**: extracts VALIDATION COMMANDS from Governor output; runs each in order; captures exact output to `proof/stage7-validation-output.txt`; stops on any non-zero exit.
- **Stage 8 — Deterministic Repo Checks**: if active packet references typecheck or tests, runs `npx tsc --noEmit` and `npm test` and captures output to `proof/stage8-checks-output.txt`; otherwise logs skip.
- **Stage 9 — Proof Output Collection**: verifies all expected proof files exist in `proof/`; stops naming the missing file if any is absent; prints completion signal.

### 10.3 Proof bundle location

All proof artifacts are written to `proof/` in the repo root. The `proof/` directory is listed in `.gitignore` and must not be committed.

Expected proof files after a successful run:

- `proof/stage1-git-status.txt`
- `proof/stage1-head-sha.txt`
- `proof/stage1-origin-sha.txt`
- `proof/stage2-nokey.txt`
- `proof/stage3-governor-output.txt`
- `proof/stage5-codex-output.txt`
- `proof/stage6-scope.txt`
- `proof/stage7-validation-output.txt`
- `proof/stage8-checks-output.txt`

### 10.4 Fail-closed behavior

The script stops immediately on any failure and does not continue to the next stage. Every stop prints to stderr:

```
LOOP STOP REPORT — Stage: [N] — Condition: [exact condition] — Evidence: [exact evidence]
```

No self-recovery is attempted. A stopped loop requires a new Governor-cleared corrective packet to authorize a retry.

### 10.5 Completion signal

On successful completion of Stage 9, the script prints exactly:

```
STAGES 1–9 COMPLETE. Proof bundle at proof/. Stage 10–12 require a separate governed packet.
```

### 10.6 Deferred stages

Stages 10–12 (PR body preparation, draft PR creation, and operator/Governor final review) are not implemented. They require a separate governed packet.
