export type ResultType = "EMIT_CANDIDATE" | "BLOCK";

export type BlockCode =
  | "SCHEMA_VALIDATION_FAILED"
  | "SEMANTIC_VALIDATION_FAILED"
  | "COMMAND_REJECTED"
  | "CONTEXT_BUDGET_EXCEEDED"
  | "COMPILER_RUNTIME_FAILURE";

export interface CommandObject {
  id: string;
  argv: string[];
  cwd?: "repo_root";
  timeout_ms?: number;
}

export interface CompilerAudit {
  block_code?: BlockCode;
  warnings: string[];
  errors: string[];
}

export interface RepoAnchor {
  branch: string;
  head_sha: string;
  base_sha?: string;
  dirty_allowed?: boolean;
}

export interface Intent {
  task_id: string;
  summary: string;
  actor_surface?: string;
}

export interface PartialContext {
  reason: string;
  included_files: string[];
  omitted_files: string[];
  excerpt_windows?: Array<{
    path: string;
    start_line: number;
    end_line: number;
    sha?: string;
  }>;
}

export interface EmitEnvelope {
  schema_version: "sir.v1";
  result_type: "EMIT_CANDIDATE";
  task: {
    id: string;
    name: string;
  };
  repo_anchor: RepoAnchor;
  intent: Intent;
  scope: {
    allowed_files: string[];
    forbidden_files: string[];
  };
  risk: {
    tier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    notes?: string[];
  };
  validation: {
    commands: CommandObject[];
  };
  context: {
    files: string[];
    partial_context?: PartialContext;
  };
  governance: {
    workflow: string;
    docs_may_change: boolean;
    ledger_update_required: boolean;
  };
  compiler_audit: CompilerAudit;
}

export interface BlockEnvelope {
  schema_version: "sir.v1";
  result_type: "BLOCK";
  repo_anchor: RepoAnchor;
  intent: Intent;
  compiler_audit: CompilerAudit;
  blocks: Array<{
    code: BlockCode;
    message: string;
  }>;
  warnings: string[];
  escalation?: {
    subtype: "ESCALATE_TO_GOVERNOR_WITH_PARTIAL_CONTEXT";
    partial_context: PartialContext;
  };
}

export type SirEnvelope = EmitEnvelope | BlockEnvelope;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CommandRegistry {
  schema_version: "command-registry.v1";
  defaults: {
    cwd: "repo_root";
    shell: false;
    timeout_ms: number;
    max_buffer_bytes: number;
    network: "forbidden";
    writes: "forbidden";
    env_allowlist: string[];
  };
  commands: CommandRegistryEntry[];
}

export interface CommandRegistryEntry {
  id: string;
  program: string;
  allowed_argv_patterns: string[][];
  forbidden_flags: string[];
  cwd_policy: "repo_root";
  path_policy: "relative_no_parent" | "none";
  timeout_ms: number;
  max_buffer_bytes: number;
  network: "forbidden";
  writes: "forbidden";
  expected_output_class: "text" | "json" | "none";
  proof_path_class: "repo_relative" | "none";
}

export interface CommandExecutionResult {
  command: CommandObject;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}
