#!/usr/bin/env bash
set -euo pipefail

GOVERNOR_PROMPT="${1:?Usage: scripts/loop-runner.sh \"<governor-prompt>\"}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
PROOF_DIR="${REPO_ROOT}/proof"
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
    | grep -v '^node_modules/' \
    | grep -v '^package-lock\.json$' || true
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

# Stage 5 — Codex Builder Invocation
CODEX_OUTPUT_FILE="${PROOF_DIR}/stage5-codex-output.txt"
GOVERNOR_PACKET="$(cat "${GOV_OUTPUT_FILE}")"
set +e
codex exec --full-auto --sandbox workspace-write "${GOVERNOR_PACKET}" > "${CODEX_OUTPUT_FILE}" 2>&1
CODEX_EXIT=$?
set -e
if [[ "${CODEX_EXIT}" -ne 0 ]]; then
  loop_stop 5 "Codex exited non-zero" "exit code ${CODEX_EXIT}; see ${CODEX_OUTPUT_FILE}"
fi

# Stage 6 — Hard Scope Verification
ALLOWED_FILES="$(parse_packet_list 'ALLOWED FILES' "${GOV_OUTPUT_FILE}" | sort -u)"
[[ -n "${ALLOWED_FILES}" ]] || \
  loop_stop 6 "ALLOWED FILES list empty or absent" "${GOV_OUTPUT_FILE}"

CHANGED_FILES="$(
  { git diff --name-only HEAD; git ls-files --others --exclude-standard; } \
    | grep -v '^node_modules/' \
    | grep -v '^package-lock\.json$' \
    | sort -u || true
)"

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
VALIDATION_COMMANDS="$(parse_packet_list 'VALIDATION COMMANDS' "${GOV_OUTPUT_FILE}")"

if [[ -z "${VALIDATION_COMMANDS}" ]]; then
  printf 'Stage 7: no VALIDATION COMMANDS in packet — skipping\n' > "${VALIDATION_OUTPUT_FILE}"
else
  while IFS= read -r validation_command; do
    [[ -z "${validation_command}" ]] && continue
    printf -- '--- CMD: %s\n' "${validation_command}" >> "${VALIDATION_OUTPUT_FILE}"
    bash -lc "${validation_command}" >> "${VALIDATION_OUTPUT_FILE}" 2>&1 || \
      loop_stop 7 "Validation command failed" "${validation_command}"
  done <<< "${VALIDATION_COMMANDS}"
fi

# Stage 8 — Deterministic Repo Checks
CHECKS_FILE="${PROOF_DIR}/stage8-checks-output.txt"
: > "${CHECKS_FILE}"
if grep -Eq 'typecheck|tsc|npm test' "${GOV_OUTPUT_FILE}"; then
  echo "--- typecheck ---" >> "${CHECKS_FILE}"
  npx tsc --noEmit >> "${CHECKS_FILE}" 2>&1 || loop_stop 8 "typecheck failed" "see ${CHECKS_FILE}"
  echo "--- npm test ---" >> "${CHECKS_FILE}"
  npm test >> "${CHECKS_FILE}" 2>&1 || loop_stop 8 "test suite failed" "see ${CHECKS_FILE}"
else
  printf 'Stage 8: typecheck/tests not scoped by active packet — skipping\n' > "${CHECKS_FILE}"
fi

# Stage 9 — Proof Output Collection
for proof_file in \
  "proof/stage1-git-status.txt" \
  "proof/stage1-head-sha.txt" \
  "proof/stage1-origin-sha.txt" \
  "proof/stage2-nokey.txt" \
  "proof/stage3-governor-output.txt" \
  "proof/stage5-codex-output.txt" \
  "proof/stage6-scope.txt" \
  "proof/stage7-validation-output.txt" \
  "proof/stage8-checks-output.txt"
do
  [[ -f "${REPO_ROOT}/${proof_file}" ]] || \
    loop_stop 9 "Expected proof file missing" "${proof_file}"
done

printf 'STAGES 1–9 COMPLETE. Proof bundle at proof/. Stage 10–12 require a separate governed packet.\n'
