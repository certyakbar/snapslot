#!/usr/bin/env node

const OUTCOMES = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  INDETERMINATE: "INDETERMINATE",
});

const HIGH_RISK_TIERS = new Set(["HIGH", "CRITICAL"]);
const EXPECTED_SCOPED_APPROVAL_BOT_LOGIN = "github-actions[bot]";
const VALID_VERDICT = "APPROVE";

const doNotSwitchAuthority =
  "This harness does not switch approval authority away from ops/GOVERNOR_APPROVAL.json.";
const doNotModifyRepositoryState =
  "This harness does not create PRs, approve PRs, comment on PRs, or write any repository files.";

const failClosed = {
  defaultOutcome: OUTCOMES.FAIL,
  reason: "Unrecognized, missing, or ambiguous fixture data resolves to FAIL unless the scoped artifact is absent or malformed.",
};

const unimplementedAdapterInterface = Object.freeze({
  name: "FutureSacrificialEquivalenceInputAdapter",
  status: "UNIMPLEMENTED_FOR_THIS_TASK",
  purpose:
    "A future adapter may translate GitHub API or gh-input records into this harness fixture shape without live network execution here.",
  loadCases() {
    throw new Error("FutureSacrificialEquivalenceInputAdapter is unimplemented for this offline harness task.");
  },
});

const baselineCase = Object.freeze({
  risk_tier: "HIGH",
  pr_number: 90,
  governor_login: "certyakbar",
  current_commit_sha: "commit-approved-parent",
  tree_sha: "tree-approved",
  declared_files: ["scripts/verify-sacrificial-equivalence.js"],
  issued_at: "2026-05-01T22:30:00.000Z",
  block_events: [],
});

const fixtureCases = [
  buildCase("no_approval_high", {
    manifest_authority: { verdict: "NONE" },
    scoped_artifacts: [
      scopedArtifact({
        verdict: "NONE",
      }),
    ],
    expected_outcome: OUTCOMES.FAIL,
  }),
  buildCase("no_approval_critical", {
    risk_tier: "CRITICAL",
    manifest_authority: { verdict: "NONE" },
    scoped_artifacts: [
      scopedArtifact({
        verdict: "NONE",
        risk_tier: "CRITICAL",
      }),
    ],
    expected_outcome: OUTCOMES.FAIL,
  }),
  buildCase("valid_approval_passes", {
    expected_outcome: OUTCOMES.PASS,
  }),
  buildCase("push_after_approval_stales", {
    current_commit_sha: "commit-after-approval",
    expected_outcome: OUTCOMES.FAIL,
  }),
  buildCase("risk_change_fails", {
    manifest_authority: { risk_tier: "CRITICAL" },
    expected_outcome: OUTCOMES.FAIL,
  }),
  buildCase("declared_files_scope_change_fails", {
    manifest_authority: { declared_files: ["scripts/compile-task.js"] },
    expected_outcome: OUTCOMES.FAIL,
  }),
  buildCase("tree_mismatch_fails", {
    tree_sha: "tree-after-change",
    expected_outcome: OUTCOMES.FAIL,
  }),
  buildCase("pr_mismatch_fails", {
    manifest_authority: { pr_number: 91 },
    expected_outcome: OUTCOMES.FAIL,
  }),
  buildCase("governor_login_mismatch_fails", {
    manifest_authority: { governor_login: "different-governor" },
    expected_outcome: OUTCOMES.FAIL,
  }),
  buildCase("block_newer_than_approval_fails", {
    block_events: [{ type: "BLOCK", created_at: "2026-05-01T22:31:00.000Z" }],
    expected_outcome: OUTCOMES.FAIL,
  }),
  buildCase("timestamp_equality_fails_closed", {
    block_events: [{ type: "BLOCK", created_at: baselineCase.issued_at }],
    expected_outcome: OUTCOMES.FAIL,
  }),
  buildCase("missing_scoped_artifact_indeterminate", {
    scoped_artifacts: [],
    expected_outcome: OUTCOMES.INDETERMINATE,
  }),
  buildCase("malformed_scoped_artifact_indeterminate", {
    scoped_artifacts: [
      {
        author_login: EXPECTED_SCOPED_APPROVAL_BOT_LOGIN,
        payload: {
          verdict: VALID_VERDICT,
          pr_number: baselineCase.pr_number,
        },
      },
    ],
    expected_outcome: OUTCOMES.INDETERMINATE,
  }),
  buildCase("non_bot_scoped_artifact_ignored", {
    scoped_artifacts: [
      {
        author_login: "certyakbar",
        payload: approvedPayload(),
      },
    ],
    expected_outcome: OUTCOMES.INDETERMINATE,
  }),
];

main();

function main() {
  const results = fixtureCases.map(evaluateCase);
  for (const result of results) {
    process.stdout.write(
      `${result.case_id}: ${result.outcome} scoped_diagnostic_would_pass=${renderPassValue(
        result.scoped_diagnostic_would_pass
      )} manifest_authority_pass=${renderPassValue(result.manifest_authority_pass)} invariant=${result.invariant}\n`
    );
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    process.stderr.write(`Sacrificial equivalence harness failed ${failures.length} case(s).\n`);
    process.exit(1);
  }
}

function buildCase(case_id, overrides = {}) {
  const record = {
    ...baselineCase,
    ...overrides,
  };

  const manifestAuthority = {
    ...approvedPayload(record),
    ...(overrides.manifest_authority ?? {}),
  };
  const scopedArtifacts =
    overrides.scoped_artifacts === undefined
      ? [{ author_login: EXPECTED_SCOPED_APPROVAL_BOT_LOGIN, payload: approvedPayload(record) }]
      : overrides.scoped_artifacts;

  return {
    ...record,
    case_id,
    manifest_authority: manifestAuthority,
    scoped_artifacts: scopedArtifacts,
  };
}

function scopedArtifact(payloadOverrides = {}) {
  return {
    author_login: EXPECTED_SCOPED_APPROVAL_BOT_LOGIN,
    payload: {
      ...approvedPayload(),
      ...payloadOverrides,
    },
  };
}

function approvedPayload(source = baselineCase) {
  return {
    verdict: VALID_VERDICT,
    pr_number: source.pr_number,
    governor_login: source.governor_login,
    approved_parent_sha: baselineCase.current_commit_sha,
    approved_tree_sha: baselineCase.tree_sha,
    risk_tier: source.risk_tier,
    task_id: "T-GOV-29-PRE-SACRIFICIAL-EQUIVALENCE-HARNESS",
    declared_files: [...source.declared_files],
    issued_at: source.issued_at,
  };
}

function evaluateCase(record) {
  const manifest_authority_pass = evaluateApprovalPayload(record, record.manifest_authority).would_pass;
  const scopedDiagnostic = evaluateScopedDiagnostic(record);
  const scoped_diagnostic_would_pass = scopedDiagnostic.would_pass;
  const outcome = resolveOutcome(scoped_diagnostic_would_pass, manifest_authority_pass);
  const invariant = scoped_diagnostic_would_pass === null ? "INDETERMINATE" : String(scoped_diagnostic_would_pass === manifest_authority_pass);

  return {
    case_id: record.case_id,
    outcome,
    scoped_diagnostic_would_pass,
    manifest_authority_pass,
    invariant,
    ok: outcome === record.expected_outcome && (scoped_diagnostic_would_pass === null || scoped_diagnostic_would_pass === manifest_authority_pass),
  };
}

function evaluateScopedDiagnostic(record) {
  if (!Array.isArray(record.scoped_artifacts)) {
    return deterministicFail("scoped_artifacts must be an array");
  }

  const matchingArtifacts = record.scoped_artifacts.filter(
    (artifact) => artifact && artifact.author_login === EXPECTED_SCOPED_APPROVAL_BOT_LOGIN
  );

  if (matchingArtifacts.length === 0) {
    return { would_pass: null, reason: "missing scoped diagnostic artifact from expected bot" };
  }

  const newest = matchingArtifacts[matchingArtifacts.length - 1];
  if (!isPlainObject(newest.payload) || !hasStructuralApprovalFields(newest.payload)) {
    return { would_pass: null, reason: "malformed scoped diagnostic artifact" };
  }

  const manifestComparison = compareScopedArtifactToManifestAuthority(newest.payload, record.manifest_authority);
  if (!manifestComparison.would_pass) {
    return manifestComparison;
  }

  return evaluateApprovalPayload(record, newest.payload);
}

function compareScopedArtifactToManifestAuthority(scopedPayload, manifestAuthority) {
  if (!isPlainObject(manifestAuthority) || !hasStructuralApprovalFields(manifestAuthority)) {
    return deterministicFail("manifest authority record is missing or malformed");
  }

  const comparableFields = ["pr_number", "governor_login", "risk_tier", "approved_parent_sha", "approved_tree_sha"];
  for (const field of comparableFields) {
    if (scopedPayload[field] !== manifestAuthority[field]) {
      return deterministicFail(`scoped artifact ${field} does not match manifest authority record`);
    }
  }

  if (!setsEqual(scopedPayload.declared_files, manifestAuthority.declared_files)) {
    return deterministicFail("scoped artifact declared_files does not match manifest authority record");
  }

  return { would_pass: true, reason: "scoped artifact matches manifest authority record" };
}

function evaluateApprovalPayload(record, approval) {
  if (!isPlainObject(record) || !isPlainObject(approval)) {
    return deterministicFail("record or approval is not an object");
  }

  const riskTier = record.risk_tier;
  if (!isNonEmptyString(riskTier)) {
    return deterministicFail("fixture risk_tier missing");
  }

  if (!HIGH_RISK_TIERS.has(riskTier)) {
    return { would_pass: true, reason: "non-HIGH/CRITICAL risk does not require approval in this harness" };
  }

  if (!hasStructuralApprovalFields(approval)) {
    return deterministicFail("approval missing required fields");
  }

  if (approval.verdict !== VALID_VERDICT) {
    return deterministicFail("approval verdict is not APPROVE");
  }

  if (approval.pr_number !== record.pr_number) {
    return deterministicFail("pr_number mismatch");
  }

  if (approval.governor_login !== record.governor_login) {
    return deterministicFail("governor_login mismatch");
  }

  if (approval.risk_tier !== record.risk_tier) {
    return deterministicFail("risk_tier mismatch");
  }

  if (!setsEqual(approval.declared_files, record.declared_files)) {
    return deterministicFail("declared_files mismatch");
  }

  if (approval.approved_parent_sha !== record.current_commit_sha) {
    return deterministicFail("approved_parent_sha does not match current_commit_sha");
  }

  if (approval.approved_tree_sha !== record.tree_sha) {
    return deterministicFail("approved_tree_sha does not match fixture tree_sha");
  }

  const issuedAtTime = parseTimestamp(approval.issued_at);
  if (issuedAtTime === null) {
    return deterministicFail("approval issued_at missing or invalid");
  }

  const blockResult = hasBlockAtOrAfterApproval(record.block_events, issuedAtTime);
  if (blockResult === null || blockResult === true) {
    return deterministicFail("BLOCK event is newer than or equal to approval issued_at");
  }

  return { would_pass: true, reason: "approval fields are present, internally consistent, and not stale" };
}

function hasStructuralApprovalFields(approval) {
  return (
    isNonEmptyString(approval.verdict) &&
    Number.isInteger(approval.pr_number) &&
    isNonEmptyString(approval.governor_login) &&
    isNonEmptyString(approval.approved_parent_sha) &&
    isNonEmptyString(approval.approved_tree_sha) &&
    isNonEmptyString(approval.risk_tier) &&
    Array.isArray(approval.declared_files) &&
    approval.declared_files.every(isNonEmptyString) &&
    isNonEmptyString(approval.issued_at)
  );
}

function hasBlockAtOrAfterApproval(blockEvents, issuedAtTime) {
  if (!Array.isArray(blockEvents)) {
    return null;
  }

  for (const event of blockEvents) {
    if (!isPlainObject(event) || event.type !== "BLOCK") {
      return null;
    }

    const blockTime = parseTimestamp(event.created_at);
    if (blockTime === null) {
      return null;
    }

    if (blockTime >= issuedAtTime) {
      return true;
    }
  }

  return false;
}

function resolveOutcome(scopedPass, manifestPass) {
  if (scopedPass === null) {
    return OUTCOMES.INDETERMINATE;
  }

  if (scopedPass !== manifestPass) {
    return OUTCOMES.FAIL;
  }

  return scopedPass ? OUTCOMES.PASS : OUTCOMES.FAIL;
}

function deterministicFail(reason) {
  return { would_pass: false, reason: `${failClosed.defaultOutcome}: ${reason}` };
}

function setsEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function parseTimestamp(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function renderPassValue(value) {
  return value === null ? "INDETERMINATE" : String(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
