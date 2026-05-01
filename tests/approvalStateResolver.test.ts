import assert from "node:assert/strict";
import {
  FILE_SCOPED_APPROVAL_STORAGE_REQUIRES_GC_AFTER_MERGE,
  REPOSITORY_PERSISTENT_SCOPED_APPROVAL_ARTIFACTS_MUST_NOT_ACCUMULATE_ON_MAIN,
  resolveApprovalState,
  type ApprovalResolutionInput,
  type ApprovalState,
} from "../tools/governance/approval-state-resolver.ts";

type TestCase = {
  name: string;
  run: () => void;
};

const validApproval: ApprovalState = {
  verdict: "APPROVE",
  governorLogin: "certyakbar",
  prNumber: 29,
  approvedParentSha: "parent-reviewed-sha",
  approvedTreeSha: "tree-reviewed-sha",
  riskTier: "HIGH",
  declaredFiles: ["package.json", "tests/approvalStateResolver.test.ts"],
  issuedAt: "2026-04-30T12:00:00Z",
};

function baseInput(overrides: Partial<ApprovalResolutionInput> = {}): ApprovalResolutionInput {
  return {
    riskTier: "HIGH",
    prNumber: 29,
    requiredGovernorLogin: "certyakbar",
    currentParentSha: "parent-reviewed-sha",
    currentTreeSha: "tree-reviewed-sha",
    changedFiles: ["tests/approvalStateResolver.test.ts", "package.json"],
    approvalState: validApproval,
    latestBlock: null,
    ...overrides,
  };
}

const tests: TestCase[] = [
  {
    name: "valid HIGH approval passes every binding",
    run: () => {
      const result = resolveApprovalState(baseInput());

      assert.equal(result.approved, true);
      assert.equal(result.status, "approved");
      assert.ok(result.reasons.includes("parent sha binding passed"));
      assert.ok(result.reasons.includes("tree sha binding passed"));
      assert.ok(result.reasons.includes("declared files binding passed"));
    },
  },
  {
    name: "no approval required for MEDIUM or LOW",
    run: () => {
      for (const riskTier of ["MEDIUM", "LOW"] as const) {
        const result = resolveApprovalState(
          baseInput({
            riskTier,
            approvalState: null,
          })
        );

        assert.equal(result.approved, true);
        assert.equal(result.status, "no_approval_required");
      }
    },
  },
  {
    name: "rejects stale approval after push",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          currentParentSha: "new-parent-after-push",
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "stale_parent_sha");
    },
  },
  {
    name: "rejects tree sha mismatch",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          currentTreeSha: "different-tree-sha",
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "tree_sha_mismatch");
    },
  },
  {
    name: "rejects PR number mismatch",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          prNumber: 30,
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "pr_number_mismatch");
    },
  },
  {
    name: "rejects governor login mismatch",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          requiredGovernorLogin: "not-governor",
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "governor_login_mismatch");
    },
  },
  {
    name: "rejects risk tier mismatch",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          riskTier: "CRITICAL",
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "risk_tier_mismatch");
    },
  },
  {
    name: "rejects declared files mismatch",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          changedFiles: ["package.json"],
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "declared_files_mismatch");
    },
  },
  {
    name: "BLOCK newer than approval fails",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          latestBlock: {
            issuedAt: "2026-04-30T12:01:00Z",
          },
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "blocked_by_newer_block");
    },
  },
  {
    name: "approval newer than BLOCK passes",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          approvalState: {
            ...validApproval,
            issuedAt: "2026-04-30T12:02:00Z",
          },
          latestBlock: {
            issuedAt: "2026-04-30T12:01:00Z",
          },
        })
      );

      assert.equal(result.approved, true);
      assert.equal(result.status, "approved");
    },
  },
  {
    name: "timestamp equality fails closed",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          latestBlock: {
            issuedAt: validApproval.issuedAt ?? "",
          },
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "blocked_by_equal_timestamp");
    },
  },
  {
    name: "malformed timestamp fails closed",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          approvalState: {
            ...validApproval,
            issuedAt: "not-a-timestamp",
          },
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "missing_or_malformed_approval");
    },
  },
  {
    name: "BLOCK malformed timestamp fails closed",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          latestBlock: {
            issuedAt: "not-a-timestamp",
          },
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "timestamp_order_indeterminate");
    },
  },
  {
    name: "missing approval state fails closed for HIGH and CRITICAL",
    run: () => {
      for (const riskTier of ["HIGH", "CRITICAL"] as const) {
        const result = resolveApprovalState(
          baseInput({
            riskTier,
            approvalState: null,
          })
        );

        assert.equal(result.approved, false);
        assert.equal(result.status, "missing_or_malformed_approval");
      }
    },
  },
  {
    name: "BLOCK still applies to MEDIUM and LOW",
    run: () => {
      for (const riskTier of ["MEDIUM", "LOW"] as const) {
        const result = resolveApprovalState(
          baseInput({
            riskTier,
            approvalState: null,
            latestBlock: {
              issuedAt: "2026-04-30T12:01:00Z",
            },
          })
        );

        assert.equal(result.approved, false);
        assert.equal(result.status, "blocked_by_newer_block");
      }
    },
  },
  {
    name: "file based scoped approval storage requires GC policy before authority switch",
    run: () => {
      const result = resolveApprovalState(
        baseInput({
          storagePlan: {
            storageBackend: "file_scoped",
            repositoryPersistent: true,
            garbageCollectionPolicy: "missing",
          },
        })
      );

      assert.equal(result.approved, false);
      assert.equal(result.status, "storage_policy_requires_gc");
      assert.ok(result.reasons.includes(FILE_SCOPED_APPROVAL_STORAGE_REQUIRES_GC_AFTER_MERGE));
      assert.ok(
        result.reasons.includes(REPOSITORY_PERSISTENT_SCOPED_APPROVAL_ARTIFACTS_MUST_NOT_ACCUMULATE_ON_MAIN)
      );
    },
  },
];

let failed = 0;

for (const currentTest of tests) {
  try {
    currentTest.run();
    console.log(`PASS ${currentTest.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${currentTest.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS ${tests.length} tests`);
}
