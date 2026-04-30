#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  printf 'Usage: %s <input-file-or-dash> <profile> <output-json-path>\n' "$0" >&2
  exit 1
fi

INPUT_SOURCE="$1"
PROFILE="$2"
OUTPUT_JSON_PATH="$3"
LABEL="token_budget_check"
ENCODING_POLICY="conservative_byte_count_div3"

case "${PROFILE}" in
  governor_claude_pro_default)
    SOFT_LIMIT_TOKENS=100000
    HARD_LIMIT_TOKENS=120000
    PROVIDER_CONTEXT_REFERENCE_TOKENS=200000
    ;;
  builder_codex_default)
    SOFT_LIMIT_TOKENS=250000
    HARD_LIMIT_TOKENS=300000
    PROVIDER_CONTEXT_REFERENCE_TOKENS=400000
    ;;
  *)
    printf 'Unknown profile: %s\n' "${PROFILE}" >&2
    exit 1
    ;;
esac

if [[ "${INPUT_SOURCE}" == "-" ]]; then
  INPUT_BYTES="$(cat | wc -c)"
else
  if [[ ! -r "${INPUT_SOURCE}" ]]; then
    printf 'Input file is not readable: %s\n' "${INPUT_SOURCE}" >&2
    exit 1
  fi
  INPUT_BYTES="$(cat "${INPUT_SOURCE}" | wc -c)"
fi

INPUT_BYTES="${INPUT_BYTES#"${INPUT_BYTES%%[![:space:]]*}"}"
INPUT_BYTES="${INPUT_BYTES%"${INPUT_BYTES##*[![:space:]]}"}"
MEASURED_TOKENS=$(( (INPUT_BYTES + 2) / 3 ))

if [[ "${MEASURED_TOKENS}" -le "${SOFT_LIMIT_TOKENS}" ]]; then
  WITHIN_SOFT_LIMIT=true
else
  WITHIN_SOFT_LIMIT=false
fi

if [[ "${MEASURED_TOKENS}" -le "${HARD_LIMIT_TOKENS}" ]]; then
  STATUS="PASS"
else
  STATUS="FAIL"
fi

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if ! {
  printf '{\n'
  printf '  "label": "%s",\n' "${LABEL}"
  printf '  "profile": "%s",\n' "${PROFILE}"
  printf '  "counter": "local_offline",\n'
  printf '  "encoding_policy": "%s",\n' "${ENCODING_POLICY}"
  printf '  "input_bytes": %s,\n' "${INPUT_BYTES}"
  printf '  "measured_tokens": %s,\n' "${MEASURED_TOKENS}"
  printf '  "soft_limit_tokens": %s,\n' "${SOFT_LIMIT_TOKENS}"
  printf '  "hard_limit_tokens": %s,\n' "${HARD_LIMIT_TOKENS}"
  printf '  "provider_context_reference_tokens": %s,\n' "${PROVIDER_CONTEXT_REFERENCE_TOKENS}"
  printf '  "within_soft_limit": %s,\n' "${WITHIN_SOFT_LIMIT}"
  printf '  "status": "%s",\n' "${STATUS}"
  printf '  "api_calls": "NONE",\n'
  printf '  "network_calls": "NONE",\n'
  printf '  "timestamp": "%s"\n' "${TIMESTAMP}"
  printf '}\n'
} > "${OUTPUT_JSON_PATH}"; then
  printf 'Failed to write output JSON: %s\n' "${OUTPUT_JSON_PATH}" >&2
  exit 1
fi

if [[ "${STATUS}" == "FAIL" ]]; then
  printf 'Token budget hard limit exceeded: profile=%s measured_tokens=%s hard_limit_tokens=%s output=%s\n' \
    "${PROFILE}" "${MEASURED_TOKENS}" "${HARD_LIMIT_TOKENS}" "${OUTPUT_JSON_PATH}" >&2
  exit 1
fi

printf 'profile=%s input_bytes=%s measured_tokens=%s soft_limit=%s hard_limit=%s status=%s within_soft_limit=%s\n' \
  "${PROFILE}" "${INPUT_BYTES}" "${MEASURED_TOKENS}" "${SOFT_LIMIT_TOKENS}" "${HARD_LIMIT_TOKENS}" "${STATUS}" "${WITHIN_SOFT_LIMIT}"
