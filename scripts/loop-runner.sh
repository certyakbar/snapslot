#!/usr/bin/env bash
set -euo pipefail

GOVERNOR_PROMPT="${1:?Usage: scripts/loop-runner.sh \"<governor-prompt>\"}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
RUN_ID="$(node -e "process.stdout.write(require('crypto').randomUUID())")"
PROOF_DIR="${REPO_ROOT}/proof/runs/${RUN_ID}"
mkdir -p "${PROOF_DIR}"

loop_stop() {
  local stage="$1" condition="$2" evidence="$3"
  printf 'LOOP STOP REPORT — Stage: %s — Condition: %s — Evidence: %s\n' \
    "${stage}" "${condition}" "${evidence}" >&2
  exit 1
}

parse_packet_list() {
  local section_name="$1" source_file="$2"
  awk -v section="${section_name}" '
    BEGIN {
      in_section = 0
      blank_seen = 0
    }
    {
      lower = tolower($0)
      section_lower = tolower(section)
    }
    lower ~ section_lower "[[:space:]]*:?" {
      in_section = 1
      blank_seen = 0
      next
    }
    in_section && /^[[:space:]]*---+[[:space:]]*$/ {
      next
    }
    in_section && /^[[:space:]]*-/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      gsub(/`/, "", line)
      print line
      blank_seen = 0
      next
    }
    in_section && /^[[:space:]]*$/ {
      blank_seen = 1
      next
    }
    in_section && blank_seen && $0 !~ /^[[:space:]]*-/ {
      exit
    }
    in_section && /^[[:space:]]*(#{1,6}[[:space:]]+|[0-9]+[.][[:space:]]+|[A-Z][A-Z0-9 _-]+[[:space:]]*:)/ {
      exit
    }
  ' "${source_file}"
}

# Deprecated rollback/debug parser only. Future execution authority is the
# compiler-normalized local-loop JSON packet produced in Stage 4b.

collect_changed_files() {
  { git diff --name-only HEAD; git ls-files --others --exclude-standard; } \
    | grep -v '^node_modules/' \
    | sort -u || true
}

# Stage 1 — Repo Re-Anchor
git fetch origin main

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "${CURRENT_BRANCH}" == "main" ]] || \
  loop_stop 1 "Current branch is not main" "${CURRENT_BRANCH}"

HEAD_SHA="$(git rev-parse HEAD)"
ORIGIN_SHA="$(git rev-parse origin/main)"
[[ "${HEAD_SHA}" == "${ORIGIN_SHA}" ]] || \
  loop_stop 1 "HEAD does not equal origin/main" "HEAD=${HEAD_SHA} origin/main=${ORIGIN_SHA}"

git status --short > "${PROOF_DIR}/stage1-git-status.txt"
git rev-parse HEAD > "${PROOF_DIR}/stage1-head-sha.txt"
git rev-parse origin/main > "${PROOF_DIR}/stage1-origin-sha.txt"

DIRTY_PATHS="$(
  git status --short \
    | awk '{print $NF}' \
    | grep -v '^node_modules/' || true
)"
[[ -z "${DIRTY_PATHS}" ]] || \
  loop_stop 1 "Unapproved working-tree paths detected" "${DIRTY_PATHS}"

[[ -r "${REPO_ROOT}/ops/GOVERNOR_APPROVAL.json" ]] || \
  loop_stop 1 "Governor approval manifest unreadable" "ops/GOVERNOR_APPROVAL.json"
GOVERNOR_VERDICT="$(
  grep -o '"verdict"[[:space:]]*:[[:space:]]*"[^"]*"' "${REPO_ROOT}/ops/GOVERNOR_APPROVAL.json" \
    | grep -o '"[^"]*"$' \
    | tr -d '"' || true
)"
[[ "${GOVERNOR_VERDICT}" == "NONE" ]] || \
  loop_stop 1 "Governor approval manifest verdict is not NONE" "${GOVERNOR_VERDICT}"

for required_path in \
  "docs/SNAPSLOT_PHASE_TASKS.md" \
  "docs/SNAPSLOT_ACCEPTANCE_LEDGER.md" \
  "docs/SNAPSLOT_GOV_RUNBOOK.md" \
  "docs/SNAPSLOT_AUTONOMOUS_LOOP_CONTRACT.md"
do
  [[ -r "${REPO_ROOT}/${required_path}" ]] || \
    loop_stop 1 "Required governance file unreadable" "${required_path}"
done

# Stage 2 — No-Key Preflight
for var_name in \
  OPENAI_API_KEY \
  CODEX_API_KEY \
  ANTHROPIC_API_KEY \
  ANTHROPIC_AUTH_TOKEN \
  CLAUDE_API_KEY
do
  [[ -z "${!var_name:-}" ]] || \
    loop_stop 2 "AI API key variable detected in environment" "${var_name}"
done

BILLING_VARS="$(env | grep -E '^(OPENAI_|ANTHROPIC_)' | cut -d= -f1 || true)"
[[ -z "${BILLING_VARS}" ]] || loop_stop 2 "AI billing-path variable detected in environment" "${BILLING_VARS}"

shopt -s nullglob
for env_file in "${REPO_ROOT}"/.env "${REPO_ROOT}"/.env.* "${REPO_ROOT}"/.envrc; do
  [[ -f "${env_file}" ]] || continue
  if grep -qE '^\s*(OPENAI_[A-Z_]+|ANTHROPIC_[A-Z_]+|CODEX_API_KEY|CLAUDE_API_KEY)\s*=' "${env_file}"; then
    loop_stop 2 "AI API key assignment detected in env file" "${env_file#${REPO_ROOT}/}"
  fi
done
shopt -u nullglob

for claude_settings_file in \
  "${REPO_ROOT}/.claude/settings.json" \
  "${REPO_ROOT}/.claude/settings.local.json"
do
  if [[ -f "${claude_settings_file}" ]] && grep -qF 'apiKeyHelper' "${claude_settings_file}"; then
    loop_stop 2 "Claude apiKeyHelper detected" "${claude_settings_file#${REPO_ROOT}/}"
  fi
done

printf 'NO-KEY PREFLIGHT: PASS — no observable AI API key execution path detected\n' | tee "${PROOF_DIR}/stage2-nokey.txt"

# Stage 3 — Governor Invocation
GOV_OUTPUT_FILE="${PROOF_DIR}/stage3-governor-output.txt"
STAGE3_TOKEN_BUDGET_FILE="${PROOF_DIR}/stage3-token-budget.json"
if ! printf '%s' "${GOVERNOR_PROMPT}" | "${REPO_ROOT}/scripts/token-budget-check.sh" - governor_claude_pro_default "${STAGE3_TOKEN_BUDGET_FILE}"; then
  loop_stop 3 "Governor prompt token-budget pre-check failed" "${STAGE3_TOKEN_BUDGET_FILE}"
fi
[[ -s "${STAGE3_TOKEN_BUDGET_FILE}" ]] || \
  loop_stop 3 "Governor prompt token-budget proof missing or empty" "${STAGE3_TOKEN_BUDGET_FILE}"
if ! claude -p "${GOVERNOR_PROMPT}" > "${GOV_OUTPUT_FILE}" 2>&1; then
  loop_stop 3 "Governor invocation failed (non-zero exit)" "see ${GOV_OUTPUT_FILE}"
fi
[[ -s "${GOV_OUTPUT_FILE}" ]] || \
  loop_stop 3 "Governor invocation produced empty output" "${GOV_OUTPUT_FILE}"

# Stage 4 — Governor Clearance Gate
if grep -qF 'GOVERNOR VERDICT: BLOCK' "${GOV_OUTPUT_FILE}"; then
  loop_stop 4 "Governor issued BLOCK" \
    "$(grep -F 'GOVERNOR VERDICT: BLOCK' "${GOV_OUTPUT_FILE}" | head -1)"
fi
if ! grep -qxF 'GOVERNOR VERDICT: CLEAR TO SCOPE' "${GOV_OUTPUT_FILE}"; then
  loop_stop 4 "Governor clearance signal absent" \
    "GOVERNOR VERDICT: CLEAR TO SCOPE not found in ${GOV_OUTPUT_FILE}"
fi

# Stage 4b — Compiler-Backed Local-Loop Packet Extraction and Validation
LOCAL_LOOP_PACKET_FILE="${PROOF_DIR}/stage4b-normalized-local-loop-packet.json"
CODEX_PACKET_FILE="${PROOF_DIR}/stage4b-normalized-codex-packet.json"
NORMALIZED_TASK_ID_FILE="${PROOF_DIR}/stage4b-task-id.txt"
NORMALIZED_RISK_LEVEL_FILE="${PROOF_DIR}/stage4b-risk-level.txt"
NORMALIZED_ALLOWED_FILES_FILE="${PROOF_DIR}/stage4b-allowed-files.txt"
NORMALIZED_FORBIDDEN_FILES_FILE="${PROOF_DIR}/stage4b-forbidden-files.txt"
NORMALIZED_VALIDATION_COMMANDS_FILE="${PROOF_DIR}/stage4b-validation-commands.json"

if ! node --loader ts-node/esm "${REPO_ROOT}/tools/sir-compiler/src/index.ts" \
  --local-loop-preflight "${GOV_OUTPUT_FILE}" \
  --output "${LOCAL_LOOP_PACKET_FILE}"; then
  loop_stop "4b" "local-loop packet compiler validation failed" "see ${LOCAL_LOOP_PACKET_FILE}"
fi
[[ -s "${LOCAL_LOOP_PACKET_FILE}" ]] || \
  loop_stop "4b" "normalized local-loop packet missing or empty" "${LOCAL_LOOP_PACKET_FILE}"

cp "${LOCAL_LOOP_PACKET_FILE}" "${CODEX_PACKET_FILE}"
node -e "const p=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); process.stdout.write(p.task_id + '\n');" "${LOCAL_LOOP_PACKET_FILE}" > "${NORMALIZED_TASK_ID_FILE}"
node -e "const p=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); process.stdout.write(p.risk_level + '\n');" "${LOCAL_LOOP_PACKET_FILE}" > "${NORMALIZED_RISK_LEVEL_FILE}"
node -e "const p=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); process.stdout.write(p.allowed_files.join('\n') + '\n');" "${LOCAL_LOOP_PACKET_FILE}" > "${NORMALIZED_ALLOWED_FILES_FILE}"
node -e "const p=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); process.stdout.write(p.forbidden_files.join('\n') + '\n');" "${LOCAL_LOOP_PACKET_FILE}" > "${NORMALIZED_FORBIDDEN_FILES_FILE}"
node -e "const p=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); process.stdout.write(JSON.stringify(p.validation_commands, null, 2) + '\n');" "${LOCAL_LOOP_PACKET_FILE}" > "${NORMALIZED_VALIDATION_COMMANDS_FILE}"

for stage4b_artifact in \
  "${CODEX_PACKET_FILE}" \
  "${NORMALIZED_TASK_ID_FILE}" \
  "${NORMALIZED_RISK_LEVEL_FILE}" \
  "${NORMALIZED_ALLOWED_FILES_FILE}" \
  "${NORMALIZED_FORBIDDEN_FILES_FILE}" \
  "${NORMALIZED_VALIDATION_COMMANDS_FILE}"
do
  [[ -s "${stage4b_artifact}" ]] || \
    loop_stop "4b" "normalized local-loop artifact missing or empty" "${stage4b_artifact}"
done

# Stage 5 — Codex Builder Invocation
CODEX_OUTPUT_FILE="${PROOF_DIR}/stage5-codex-output.txt"
CODEX_PACKET="$(cat "${CODEX_PACKET_FILE}")"
STAGE5_TOKEN_BUDGET_FILE="${PROOF_DIR}/stage5-token-budget.json"
if ! "${REPO_ROOT}/scripts/token-budget-check.sh" "${CODEX_PACKET_FILE}" builder_codex_default "${STAGE5_TOKEN_BUDGET_FILE}"; then
  loop_stop 5 "Builder packet token-budget pre-check failed" "${STAGE5_TOKEN_BUDGET_FILE}"
fi
[[ -s "${STAGE5_TOKEN_BUDGET_FILE}" ]] || \
  loop_stop 5 "Builder packet token-budget proof missing or empty" "${STAGE5_TOKEN_BUDGET_FILE}"
set +e
codex exec --full-auto --sandbox workspace-write "${CODEX_PACKET}" > "${CODEX_OUTPUT_FILE}" 2>&1
CODEX_EXIT=$?
set -e
if [[ "${CODEX_EXIT}" -ne 0 ]]; then
  loop_stop 5 "Codex exited non-zero" "exit code ${CODEX_EXIT}; see ${CODEX_OUTPUT_FILE}"
fi

# Stage 6 — Hard Scope Verification
ALLOWED_FILES="$(cat "${NORMALIZED_ALLOWED_FILES_FILE}")"
[[ -n "${ALLOWED_FILES}" ]] || \
  loop_stop 6 "normalized allowed files list empty or absent" "${NORMALIZED_ALLOWED_FILES_FILE}"

CHANGED_FILES="$(collect_changed_files)"

{
  printf 'ALLOWED_FILES:\n'
  printf '%s\n' "${ALLOWED_FILES}"
  printf 'CHANGED_FILES:\n'
  printf '%s\n' "${CHANGED_FILES}"
} > "${PROOF_DIR}/stage6-scope.txt"

[[ -n "${CHANGED_FILES}" ]] || \
  loop_stop 6 "No changed files detected after scope filtering" "ALLOWED FILES is non-empty"

while IFS= read -r changed_file; do
  [[ -z "${changed_file}" ]] && continue
  if ! grep -Fxq "${changed_file}" <<< "${ALLOWED_FILES}"; then
    loop_stop 6 "Changed file outside ALLOWED FILES" "${changed_file}"
  fi
done <<< "${CHANGED_FILES}"

# Stage 7 — Packet Validation Commands
VALIDATION_OUTPUT_FILE="${PROOF_DIR}/stage7-validation-output.txt"
: > "${VALIDATION_OUTPUT_FILE}"
if ! node --loader ts-node/esm "${REPO_ROOT}/tools/sir-compiler/src/index.ts" \
  --local-loop-command-runner \
  --packet "${LOCAL_LOOP_PACKET_FILE}" \
  >> "${VALIDATION_OUTPUT_FILE}" 2>&1; then
  loop_stop 7 "registry-backed validation command failed" "see ${VALIDATION_OUTPUT_FILE}"
fi

# Stage 8 — Deterministic Repo Checks
CHECKS_FILE="${PROOF_DIR}/stage8-checks-output.txt"
: > "${CHECKS_FILE}"
if grep -Eq 'typecheck|tsc|npm test' "${CODEX_PACKET_FILE}"; then
  echo "--- typecheck ---" >> "${CHECKS_FILE}"
  npx tsc --noEmit >> "${CHECKS_FILE}" 2>&1 || loop_stop 8 "typecheck failed" "see ${CHECKS_FILE}"
  echo "--- npm test ---" >> "${CHECKS_FILE}"
  npm test >> "${CHECKS_FILE}" 2>&1 || loop_stop 8 "test suite failed" "see ${CHECKS_FILE}"
else
  printf 'Stage 8: typecheck/tests not scoped by active packet — skipping\n' > "${CHECKS_FILE}"
fi

# Stage 9 — Proof Output Collection
for proof_file in \
  "${PROOF_DIR}/stage1-git-status.txt" \
  "${PROOF_DIR}/stage1-head-sha.txt" \
  "${PROOF_DIR}/stage1-origin-sha.txt" \
  "${PROOF_DIR}/stage2-nokey.txt" \
  "${PROOF_DIR}/stage3-token-budget.json" \
  "${PROOF_DIR}/stage3-governor-output.txt" \
  "${PROOF_DIR}/stage4b-normalized-local-loop-packet.json" \
  "${PROOF_DIR}/stage4b-normalized-codex-packet.json" \
  "${PROOF_DIR}/stage4b-task-id.txt" \
  "${PROOF_DIR}/stage4b-risk-level.txt" \
  "${PROOF_DIR}/stage4b-allowed-files.txt" \
  "${PROOF_DIR}/stage4b-forbidden-files.txt" \
  "${PROOF_DIR}/stage4b-validation-commands.json" \
  "${PROOF_DIR}/stage5-token-budget.json" \
  "${PROOF_DIR}/stage5-codex-output.txt" \
  "${PROOF_DIR}/stage6-scope.txt" \
  "${PROOF_DIR}/stage7-validation-output.txt" \
  "${PROOF_DIR}/stage8-checks-output.txt"
do
  [[ -f "${proof_file}" ]] || \
    loop_stop 9 "Expected proof file missing" "${proof_file}"
done

# Stage 10 — PR Body / Proof Draft Generation
stage10_capture() {
  local label="$1"
  shift
  local stderr_file="${PROOF_DIR}/.stage10-${label}.stderr.$$"
  local output stderr exit_code

  : > "${stderr_file}"
  set +e
  output="$("$@" 2>"${stderr_file}")"
  exit_code=$?
  set -e
  stderr="$(<"${stderr_file}")"
  rm -f "${stderr_file}"

  if [[ "${exit_code}" -ne 0 || -n "${stderr}" ]]; then
    if [[ -z "${stderr}" ]]; then
      stderr="exit code ${exit_code}"
    fi
    loop_stop 10 "Stage 10 proof command failed: ${label}" "${stderr}"
  fi

  printf '%s' "${output}"
}

stage10_trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

parse_packet_scalar() {
  local field_name="$1" source_file="$2"
  awk -v field="${field_name}" '
    BEGIN {
      field_lower = tolower(field)
      awaiting_value = 0
    }
    {
      line = $0
      trimmed = line
      sub(/^[[:space:]]+/, "", trimmed)
      sub(/[[:space:]]+$/, "", trimmed)
      lower = tolower(trimmed)
    }
    awaiting_value && trimmed != "" {
      print trimmed
      exit
    }
    lower == field_lower || lower == field_lower ":" {
      awaiting_value = 1
      next
    }
    index(lower, field_lower ":") == 1 {
      value = trimmed
      sub(/^[^:]*:[[:space:]]*/, "", value)
      print value
      exit
    }
  ' "${source_file}"
}

stage10_format_files_markdown() {
  while IFS= read -r stage10_file; do
    [[ -z "${stage10_file}" ]] && continue
    printf -- '- %s\n' "${stage10_file}"
  done
}

STAGE10_ALLOWED_FILES="$(cat "${NORMALIZED_ALLOWED_FILES_FILE}")"
[[ -n "${STAGE10_ALLOWED_FILES}" ]] || \
  loop_stop 10 "Stage 10 normalized allowed files list empty or absent" "${NORMALIZED_ALLOWED_FILES_FILE}"

STAGE10_TASK_ID="$(stage10_trim "$(<"${NORMALIZED_TASK_ID_FILE}")")"
[[ -n "${STAGE10_TASK_ID}" ]] || \
  loop_stop 10 "Stage 10 normalized task_id missing" "${NORMALIZED_TASK_ID_FILE}"

STAGE10_RISK_LEVEL="$(stage10_trim "$(<"${NORMALIZED_RISK_LEVEL_FILE}")")"
case "${STAGE10_RISK_LEVEL}" in
  CRITICAL|HIGH|MEDIUM|LOW) ;;
  *)
    loop_stop 10 "Stage 10 risk_level parse invalid" "${STAGE10_RISK_LEVEL:-missing}"
    ;;
esac

STAGE10_GIT_STATUS="$(stage10_capture "git-status-short" git status --short)"
STAGE10_DIFF_NAME_ONLY="$(stage10_capture "git-diff-name-only" git diff --name-only)"
STAGE10_DIFF_SUMMARY="$(stage10_capture "git-diff-summary" git diff --summary)"
STAGE10_DIFF_RAW="$(stage10_capture "git-diff-raw" git diff --raw)"
STAGE10_CHANGED_FILES="$(collect_changed_files)"

while IFS= read -r stage10_changed_file; do
  [[ -z "${stage10_changed_file}" ]] && continue
  if ! grep -Fxq "${stage10_changed_file}" <<< "${STAGE10_ALLOWED_FILES}"; then
    loop_stop 10 "Stage 10 changed file outside ALLOWED FILES" "${stage10_changed_file}"
  fi
done <<< "${STAGE10_CHANGED_FILES}"

STAGE10_LOOP_RUNNER_GREP=""
if grep -Fxq "scripts/loop-runner.sh" <<< "${STAGE10_CHANGED_FILES}"; then
  STAGE10_LOOP_RUNNER_GREP="$(stage10_capture "loop-runner-stage10-grep" grep -n 'Stage 10' scripts/loop-runner.sh)"
fi

STAGE10_PR_BODY="${PROOF_DIR}/stage10-pr-body.md"
STAGE10_PROOF_SUMMARY="${PROOF_DIR}/stage10-proof-summary.txt"

{
  printf '<!-- SENTINEL:task_id=%s -->\n' "${STAGE10_TASK_ID}"
  printf '<!-- SENTINEL:risk=%s -->\n' "${STAGE10_RISK_LEVEL}"
  printf '<!-- SENTINEL:ledger=NONE -->\n'
  printf '<!-- SENTINEL:FILES_BEGIN -->\n'
  stage10_format_files_markdown <<< "${STAGE10_CHANGED_FILES}"
  printf '<!-- SENTINEL:FILES_END -->\n'
  printf '<!-- SENTINEL:LEDGER_BEGIN -->\n'
  printf 'None\n'
  printf '<!-- SENTINEL:LEDGER_END -->\n\n'
  printf '# %s Stage 10 PR Body Draft\n\n' "${STAGE10_TASK_ID}"
  printf 'Stage 10 generated this local PR body draft and proof summary only. Ledger update remains deferred to T-GOV-25. Stage 11 may use this body to create a draft PR; Stage 12 may generate the operator/Governor handoff report after draft PR creation.\n\n'
  printf 'This draft does not claim Sentinel PASS, Governor approval for merge, merge approval, PR creation, branch creation, commit, push, or ready-for-review status.\n\n'
  printf '## Current execution proof\n\n'
  printf '### git status --short\n\n'
  printf '```text\n%s\n```\n\n' "${STAGE10_GIT_STATUS}"
  printf '### git diff --name-only\n\n'
  printf '```text\n%s\n```\n\n' "${STAGE10_DIFF_NAME_ONLY}"
  printf '### git diff --summary\n\n'
  printf '```text\n%s\n```\n\n' "${STAGE10_DIFF_SUMMARY}"
  printf '### git diff --raw\n\n'
  printf '```text\n%s\n```\n\n' "${STAGE10_DIFF_RAW}"
  if [[ -n "${STAGE10_LOOP_RUNNER_GREP}" ]]; then
    printf '### scripts/loop-runner.sh mode-sensitive Stage 10 proof\n\n'
    printf '```text\n%s\n```\n\n' "${STAGE10_LOOP_RUNNER_GREP}"
  fi
  for stage10_proof_file in \
    "${PROOF_DIR}/stage6-scope.txt" \
    "${PROOF_DIR}/stage7-validation-output.txt" \
    "${PROOF_DIR}/stage8-checks-output.txt"
  do
    if [[ -f "${stage10_proof_file}" ]]; then
      printf '### %s\n\n' "${stage10_proof_file#${REPO_ROOT}/}"
      printf '```text\n'
      cat "${stage10_proof_file}"
      printf '\n```\n\n'
    fi
  done
} > "${STAGE10_PR_BODY}"

{
  printf 'task_id_parsed: %s\n' "${STAGE10_TASK_ID}"
  printf 'risk_level_parsed: %s\n' "${STAGE10_RISK_LEVEL}"
  printf 'ledger_req_parsed: NONE\n'
  printf 'changed_files:\n'
  printf '%s\n' "${STAGE10_CHANGED_FILES}"
} > "${STAGE10_PROOF_SUMMARY}"

[[ -s "${STAGE10_PR_BODY}" ]] || \
  loop_stop 10 "proof/stage10-pr-body.md missing or empty" "${STAGE10_PR_BODY}"
[[ -s "${STAGE10_PROOF_SUMMARY}" ]] || \
  loop_stop 10 "proof/stage10-proof-summary.txt missing or empty" "${STAGE10_PROOF_SUMMARY}"

STAGE10_LEDGER_BLOCK="$(stage10_capture "ledger-block-check" awk '
  /SENTINEL:LEDGER_BEGIN/ { in_block = 1; next }
  /SENTINEL:LEDGER_END/ { in_block = 0; next }
  in_block { print }
' "${STAGE10_PR_BODY}")"
[[ "${STAGE10_LEDGER_BLOCK}" == "None" ]] || \
  loop_stop 10 "Stage 10 Sentinel ledger block is not exactly None" "${STAGE10_LEDGER_BLOCK}"

grep -qxF 'ledger_req_parsed: NONE' "${STAGE10_PROOF_SUMMARY}" || \
  loop_stop 10 "proof/stage10-proof-summary.txt missing ledger_req_parsed: NONE" "${STAGE10_PROOF_SUMMARY}"

# Stage 11 — Branch, Commit, Push, and Draft PR Creation
STAGE11_OUTPUT_FILE="${PROOF_DIR}/stage11-output.txt"
STAGE11_PR_URL_FILE="${PROOF_DIR}/stage11-draft-pr-url.txt"
: > "${STAGE11_OUTPUT_FILE}"

stage11_log() {
  printf '%s\n' "$*" >> "${STAGE11_OUTPUT_FILE}"
}

stage11_run() {
  local label="$1"
  shift
  stage11_log "--- CMD: $*"
  set +e
  "$@" >> "${STAGE11_OUTPUT_FILE}" 2>&1
  local exit_code=$?
  set -e
  if [[ "${exit_code}" -ne 0 ]]; then
    loop_stop 11 "Stage 11 command failed: ${label}" "exit code ${exit_code}; see ${STAGE11_OUTPUT_FILE}"
  fi
}

[[ -s "${STAGE10_PR_BODY}" ]] || \
  loop_stop 11 "proof/stage10-pr-body.md missing or empty before Stage 11" "${STAGE10_PR_BODY}"
[[ -s "${STAGE10_PROOF_SUMMARY}" ]] || \
  loop_stop 11 "proof/stage10-proof-summary.txt missing or empty before Stage 11" "${STAGE10_PROOF_SUMMARY}"

STAGE11_CHANGED_FILES="$(collect_changed_files)"

{
  printf 'task_id: %s\n' "${STAGE10_TASK_ID}"
  printf 'risk_level: %s\n' "${STAGE10_RISK_LEVEL}"
  printf 'allowed_files:\n%s\n' "${STAGE10_ALLOWED_FILES}"
  printf 'changed_files:\n%s\n' "${STAGE11_CHANGED_FILES}"
} >> "${STAGE11_OUTPUT_FILE}"

[[ -n "${STAGE11_CHANGED_FILES}" ]] || \
  loop_stop 11 "Stage 11 changed file list empty before staging" "ALLOWED FILES is non-empty"

while IFS= read -r stage11_changed_file; do
  [[ -z "${stage11_changed_file}" ]] && continue
  if ! grep -Fxq "${stage11_changed_file}" <<< "${STAGE10_ALLOWED_FILES}"; then
    loop_stop 11 "Stage 11 changed file outside ALLOWED FILES before staging" "${stage11_changed_file}"
  fi
done <<< "${STAGE11_CHANGED_FILES}"

while IFS= read -r stage11_allowed_file; do
  [[ -z "${stage11_allowed_file}" ]] && continue
  if ! grep -Fxq "${stage11_allowed_file}" <<< "${STAGE11_CHANGED_FILES}"; then
    loop_stop 11 "Stage 11 allowed file missing from changed files before staging" "${stage11_allowed_file}"
  fi
done <<< "${STAGE10_ALLOWED_FILES}"

STAGE11_BRANCH_TASK="$(printf '%s' "${STAGE10_TASK_ID}" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9._-' '-')"
STAGE11_BRANCH_TASK="${STAGE11_BRANCH_TASK#-}"
STAGE11_BRANCH_TASK="${STAGE11_BRANCH_TASK%-}"
[[ -n "${STAGE11_BRANCH_TASK}" ]] || \
  loop_stop 11 "Stage 11 deterministic branch suffix empty" "${STAGE10_TASK_ID}"
STAGE11_BRANCH="loop/${STAGE11_BRANCH_TASK}"
STAGE11_COMMIT_MESSAGE="${STAGE10_TASK_ID}: governed loop draft PR creation"

stage11_run "git-switch-create-branch" git switch -c "${STAGE11_BRANCH}"

while IFS= read -r stage11_allowed_file; do
  [[ -z "${stage11_allowed_file}" ]] && continue
  stage11_run "git-add-${stage11_allowed_file}" git add -- "${stage11_allowed_file}"
done <<< "${STAGE10_ALLOWED_FILES}"

STAGE11_STAGED_FILES="$(git diff --cached --name-only | sort -u || true)"
stage11_log "staged_files:"
stage11_log "${STAGE11_STAGED_FILES}"
[[ -n "${STAGE11_STAGED_FILES}" ]] || \
  loop_stop 11 "Stage 11 staged file list empty after git add" "see ${STAGE11_OUTPUT_FILE}"

while IFS= read -r stage11_staged_file; do
  [[ -z "${stage11_staged_file}" ]] && continue
  if ! grep -Fxq "${stage11_staged_file}" <<< "${STAGE10_ALLOWED_FILES}"; then
    loop_stop 11 "Stage 11 staged file outside ALLOWED FILES" "${stage11_staged_file}"
  fi
done <<< "${STAGE11_STAGED_FILES}"

stage11_run "git-commit" git commit -m "${STAGE11_COMMIT_MESSAGE}"
stage11_run "git-push" git push -u origin "${STAGE11_BRANCH}"

STAGE11_PR_TITLE="${STAGE10_TASK_ID}: governed loop draft PR creation"
stage11_log "--- CMD: gh pr create --draft --base main --head ${STAGE11_BRANCH} --title ${STAGE11_PR_TITLE} --body-file ${STAGE10_PR_BODY#${REPO_ROOT}/}"
set +e
STAGE11_PR_CREATE_OUTPUT="$(gh pr create --draft --base main --head "${STAGE11_BRANCH}" --title "${STAGE11_PR_TITLE}" --body-file "${STAGE10_PR_BODY}" 2>&1)"
STAGE11_PR_CREATE_EXIT=$?
set -e
printf '%s\n' "${STAGE11_PR_CREATE_OUTPUT}" >> "${STAGE11_OUTPUT_FILE}"
if [[ "${STAGE11_PR_CREATE_EXIT}" -ne 0 ]]; then
  loop_stop 11 "gh pr create --draft failed" "exit code ${STAGE11_PR_CREATE_EXIT}; see ${STAGE11_OUTPUT_FILE}"
fi

STAGE11_PR_URL="$(printf '%s\n' "${STAGE11_PR_CREATE_OUTPUT}" | grep -Eo 'https://github\.com/[^[:space:]]+/pull/[0-9]+' | tail -1 || true)"
[[ -n "${STAGE11_PR_URL}" ]] || \
  loop_stop 11 "gh pr create --draft returned empty URL" "see ${STAGE11_OUTPUT_FILE}"
printf '%s\n' "${STAGE11_PR_URL}" > "${STAGE11_PR_URL_FILE}" || \
  loop_stop 11 "draft PR URL cannot be written" "${STAGE11_PR_URL_FILE}"
[[ -s "${STAGE11_PR_URL_FILE}" ]] || \
  loop_stop 11 "proof/stage11-draft-pr-url.txt missing or empty" "${STAGE11_PR_URL_FILE}"

# Stage 12 — Operator / Governor Handoff Stop
STAGE12_HANDOFF_FILE="${PROOF_DIR}/stage12-handoff.txt"

for stage12_required_proof_file in \
  "${PROOF_DIR}/stage11-draft-pr-url.txt" \
  "${PROOF_DIR}/stage11-output.txt" \
  "${PROOF_DIR}/stage10-proof-summary.txt" \
  "${PROOF_DIR}/stage6-scope.txt" \
  "${PROOF_DIR}/stage7-validation-output.txt" \
  "${PROOF_DIR}/stage8-checks-output.txt"
do
  [[ -s "${stage12_required_proof_file}" ]] || \
    loop_stop 12 "Required Stage 12 proof prerequisite missing or empty" "${stage12_required_proof_file}"
done

stage12_read_draft_pr_url() {
  local draft_pr_url
  draft_pr_url="$(<"${STAGE11_PR_URL_FILE}")"
  draft_pr_url="${draft_pr_url#"${draft_pr_url%%[![:space:]]*}"}"
  draft_pr_url="${draft_pr_url%"${draft_pr_url##*[![:space:]]}"}"
  [[ -n "${draft_pr_url}" ]] || \
    loop_stop 12 "Draft PR URL missing after read" "proof/stage11-draft-pr-url.txt"
  printf '%s' "${draft_pr_url}"
}

STAGE12_DRAFT_PR_URL="$(stage12_read_draft_pr_url)"

{
  printf 'SNAPSLOT GOVERNED LOOP — STAGE 12 HANDOFF REPORT\n'
  printf '\n'
  printf 'Draft PR URL: %s\n' "${STAGE12_DRAFT_PR_URL}"
  printf '\n'
  printf 'Proof bundle path: %s\n' "${PROOF_DIR}"
  printf '\n'
  printf 'Proof files included:\n'
  printf '  proof/runs/%s/stage1-git-status.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage1-head-sha.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage1-origin-sha.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage2-nokey.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage3-token-budget.json\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage3-governor-output.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage4b-normalized-local-loop-packet.json\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage4b-normalized-codex-packet.json\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage4b-task-id.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage4b-risk-level.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage4b-allowed-files.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage4b-forbidden-files.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage4b-validation-commands.json\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage5-token-budget.json\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage5-codex-output.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage6-scope.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage7-validation-output.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage8-checks-output.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage10-pr-body.md\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage10-proof-summary.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage11-output.txt\n' "${RUN_ID}"
  printf '  proof/runs/%s/stage11-draft-pr-url.txt\n' "${RUN_ID}"
  printf '\n'
  printf 'Changed-file summary:\n'
  awk '/^changed_files:/{flag=1;next} flag{print}' "${PROOF_DIR}/stage10-proof-summary.txt"
  printf '\n'
  printf 'Validation summary reference: proof/runs/%s/stage7-validation-output.txt\n' "${RUN_ID}"
  printf 'Checks summary reference: proof/runs/%s/stage8-checks-output.txt\n' "${RUN_ID}"
  printf '\n'
  printf 'Governor final review is required before any ready or merge action.\n'
  printf 'Operator must keep the PR draft until Governor APPROVE FOR MERGE and Sentinel PASS are both present.\n'
  printf 'Operator remains final merge authority.\n'
} > "${STAGE12_HANDOFF_FILE}" || \
  loop_stop 12 "proof/stage12-handoff.txt cannot be written" "${STAGE12_HANDOFF_FILE}"

[[ -s "${STAGE12_HANDOFF_FILE}" ]] || \
  loop_stop 12 "proof/stage12-handoff.txt missing or empty after write" "${STAGE12_HANDOFF_FILE}"

printf '\n'
cat "${STAGE12_HANDOFF_FILE}"
printf '\n'

printf 'STAGES 1-12 COMPLETE. Proof bundle at proof/runs/%s/. Operator/Governor review required before ready or merge.\n' "${RUN_ID}"
