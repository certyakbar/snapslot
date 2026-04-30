import type { BlockCode, BlockEnvelope, EmitEnvelope, Intent, RepoAnchor } from "./types.js";

const fallbackRepoAnchor: RepoAnchor = {
  branch: "unknown",
  head_sha: "0000000000000000000000000000000000000000"
};

const fallbackIntent: Intent = {
  task_id: "unknown",
  summary: "compiler generated block"
};

function repoAnchorFrom(value: unknown): RepoAnchor {
  if (typeof value === "object" && value !== null && "repo_anchor" in value) {
    return (value as { repo_anchor?: RepoAnchor }).repo_anchor ?? fallbackRepoAnchor;
  }
  return fallbackRepoAnchor;
}

function intentFrom(value: unknown): Intent {
  if (typeof value === "object" && value !== null && "intent" in value) {
    return (value as { intent?: Intent }).intent ?? fallbackIntent;
  }
  return fallbackIntent;
}

export function createBlockEnvelope(
  source: unknown,
  code: BlockCode,
  errors: string[],
  warnings: string[] = []
): BlockEnvelope {
  return {
    schema_version: "sir.v1",
    result_type: "BLOCK",
    repo_anchor: repoAnchorFrom(source),
    intent: intentFrom(source),
    compiler_audit: {
      block_code: code,
      warnings,
      errors
    },
    blocks: errors.length > 0
      ? errors.map((message) => ({ code, message }))
      : [{ code, message: code }],
    warnings
  };
}

export function normalizeEmitEnvelope(envelope: EmitEnvelope, warnings: string[]): EmitEnvelope {
  return {
    ...envelope,
    compiler_audit: {
      block_code: envelope.compiler_audit.block_code,
      warnings: [...envelope.compiler_audit.warnings, ...warnings],
      errors: envelope.compiler_audit.errors
    }
  };
}
