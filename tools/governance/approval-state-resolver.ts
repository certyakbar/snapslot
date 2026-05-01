export type ApprovalRiskTier = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ApprovalVerdict = "APPROVE" | "NONE";

export type ApprovalStorageBackend =
  | "global_manifest"
  | "pr_scoped"
  | "run_scoped"
  | "file_scoped";

export type ApprovalStoragePlan = {
  storageBackend: ApprovalStorageBackend;
  repositoryPersistent: boolean;
  garbageCollectionPolicy: "required_after_merge" | "not_required" | "missing";
};

export type ApprovalState = {
  verdict: ApprovalVerdict;
  governorLogin: string | null;
  prNumber: number | null;
  approvedParentSha: string | null;
  approvedTreeSha: string | null;
  riskTier: ApprovalRiskTier | null;
  declaredFiles: string[] | null;
  issuedAt: string | null;
};

export type BlockState = {
  issuedAt: string;
};

export type ApprovalResolutionInput = {
  riskTier: ApprovalRiskTier;
  prNumber: number;
  requiredGovernorLogin: string;
  currentParentSha: string;
  currentTreeSha: string;
  changedFiles: string[];
  approvalState: ApprovalState | null;
  latestBlock: BlockState | null;
  storagePlan?: ApprovalStoragePlan;
};

type ValidApprovalState = ApprovalState & {
  governorLogin: string;
  prNumber: number;
  approvedParentSha: string;
  approvedTreeSha: string;
  riskTier: ApprovalRiskTier;
  declaredFiles: string[];
  issuedAt: string;
};

export type ApprovalResolutionStatus =
  | "approved"
  | "no_approval_required"
  | "blocked_by_newer_block"
  | "blocked_by_equal_timestamp"
  | "timestamp_order_indeterminate"
  | "missing_or_malformed_approval"
  | "stale_parent_sha"
  | "tree_sha_mismatch"
  | "pr_number_mismatch"
  | "governor_login_mismatch"
  | "risk_tier_mismatch"
  | "declared_files_mismatch"
  | "storage_policy_requires_gc";

export type ApprovalResolution = {
  approved: boolean;
  status: ApprovalResolutionStatus;
  reasons: string[];
};

// file based scoped approval storage requires garbage collection after merge.
// repository-persistent scoped approval artifacts must not accumulate on main.
export const FILE_SCOPED_APPROVAL_STORAGE_REQUIRES_GC_AFTER_MERGE =
  "file based scoped approval storage requires garbage collection after merge";

export const REPOSITORY_PERSISTENT_SCOPED_APPROVAL_ARTIFACTS_MUST_NOT_ACCUMULATE_ON_MAIN =
  "repository-persistent scoped approval artifacts must not accumulate on main";

function highOrCritical(riskTier: ApprovalRiskTier): boolean {
  return riskTier === "HIGH" || riskTier === "CRITICAL";
}

function validTimestamp(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.size !== left.length || rightSet.size !== right.length) {
    return false;
  }

  for (const item of leftSet) {
    if (!rightSet.has(item)) {
      return false;
    }
  }

  return true;
}

function storagePolicyFailure(storagePlan: ApprovalStoragePlan | undefined): ApprovalResolution | null {
  if (!storagePlan) {
    return null;
  }

  if (
    storagePlan.storageBackend === "file_scoped" &&
    storagePlan.repositoryPersistent &&
    storagePlan.garbageCollectionPolicy !== "required_after_merge"
  ) {
    return {
      approved: false,
      status: "storage_policy_requires_gc",
      reasons: [
        FILE_SCOPED_APPROVAL_STORAGE_REQUIRES_GC_AFTER_MERGE,
        REPOSITORY_PERSISTENT_SCOPED_APPROVAL_ARTIFACTS_MUST_NOT_ACCUMULATE_ON_MAIN,
        "storage backend selection is modeled only as resolver input vocabulary",
      ],
    };
  }

  return null;
}

function isValidApproval(approvalState: ApprovalState | null): approvalState is ValidApprovalState {
  return (
    approvalState !== null &&
    approvalState.verdict === "APPROVE" &&
    approvalState.governorLogin !== null &&
    approvalState.prNumber !== null &&
    approvalState.approvedParentSha !== null &&
    approvalState.approvedTreeSha !== null &&
    approvalState.riskTier !== null &&
    approvalState.declaredFiles !== null &&
    approvalState.issuedAt !== null &&
    validTimestamp(approvalState.issuedAt) !== null
  );
}

function resolveBlockTimeline(
  approvalState: ApprovalState | null,
  latestBlock: BlockState | null
): ApprovalResolution | null {
  if (!latestBlock) {
    return null;
  }

  const blockTimestamp = validTimestamp(latestBlock.issuedAt);
  if (blockTimestamp === null) {
    return {
      approved: false,
      status: "timestamp_order_indeterminate",
      reasons: ["BLOCK timestamp order is indeterminate"],
    };
  }

  if (!approvalState || approvalState.verdict !== "APPROVE") {
    return {
      approved: false,
      status: "blocked_by_newer_block",
      reasons: ["BLOCK comment override applies"],
    };
  }

  const approvalTimestamp = validTimestamp(approvalState.issuedAt);
  if (approvalTimestamp === null) {
    return {
      approved: false,
      status: "timestamp_order_indeterminate",
      reasons: ["approval and BLOCK timestamp order is indeterminate"],
    };
  }

  if (approvalTimestamp === blockTimestamp) {
    return {
      approved: false,
      status: "blocked_by_equal_timestamp",
      reasons: ["timestamp equality fails closed"],
    };
  }

  if (blockTimestamp > approvalTimestamp) {
    return {
      approved: false,
      status: "blocked_by_newer_block",
      reasons: ["BLOCK newer than approval fails"],
    };
  }

  return null;
}

export function resolveApprovalState(input: ApprovalResolutionInput): ApprovalResolution {
  const storageFailure = storagePolicyFailure(input.storagePlan);
  if (storageFailure) {
    return storageFailure;
  }

  if (!highOrCritical(input.riskTier)) {
    const blockFailure = resolveBlockTimeline(input.approvalState, input.latestBlock);
    if (blockFailure) {
      return blockFailure;
    }

    return {
      approved: true,
      status: "no_approval_required",
      reasons: ["no approval required for MEDIUM or LOW"],
    };
  }

  if (!isValidApproval(input.approvalState)) {
    return {
      approved: false,
      status: "missing_or_malformed_approval",
      reasons: ["missing or malformed approval state fails closed for HIGH and CRITICAL"],
    };
  }

  const approvalState = input.approvalState;

  if (approvalState.approvedParentSha !== input.currentParentSha) {
    return {
      approved: false,
      status: "stale_parent_sha",
      reasons: ["parent sha binding rejects stale approval after push"],
    };
  }

  if (approvalState.approvedTreeSha !== input.currentTreeSha) {
    return {
      approved: false,
      status: "tree_sha_mismatch",
      reasons: ["tree sha binding failed"],
    };
  }

  if (approvalState.prNumber !== input.prNumber) {
    return {
      approved: false,
      status: "pr_number_mismatch",
      reasons: ["PR number binding failed"],
    };
  }

  if (approvalState.governorLogin !== input.requiredGovernorLogin) {
    return {
      approved: false,
      status: "governor_login_mismatch",
      reasons: ["governor login binding failed"],
    };
  }

  if (approvalState.riskTier !== input.riskTier) {
    return {
      approved: false,
      status: "risk_tier_mismatch",
      reasons: ["risk tier binding failed"],
    };
  }

  if (!sameStringSet(approvalState.declaredFiles, input.changedFiles)) {
    return {
      approved: false,
      status: "declared_files_mismatch",
      reasons: ["declared files binding failed"],
    };
  }

  const blockFailure = resolveBlockTimeline(approvalState, input.latestBlock);
  if (blockFailure) {
    return blockFailure;
  }

  return {
    approved: true,
    status: "approved",
    reasons: [
      "parent sha binding passed",
      "tree sha binding passed",
      "PR number binding passed",
      "governor login binding passed",
      "risk tier binding passed",
      "declared files binding passed",
      "BLOCK override check passed",
    ],
  };
}
