import { Ajv2020 } from "ajv/dist/2020.js";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandRegistry, CommandRegistryEntry } from "./types.js";

const thisDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(thisDir, "../../..");
const registryPath = resolve(repoRoot, "registries/command-registry.json");

const registrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "defaults", "commands"],
  properties: {
    schema_version: { const: "command-registry.v1" },
    defaults: {
      type: "object",
      additionalProperties: false,
      required: [
        "cwd",
        "shell",
        "timeout_ms",
        "max_buffer_bytes",
        "network",
        "writes",
        "env_allowlist"
      ],
      properties: {
        cwd: { const: "repo_root" },
        shell: { const: false },
        timeout_ms: { type: "integer", minimum: 1 },
        max_buffer_bytes: { type: "integer", minimum: 1 },
        network: { const: "forbidden" },
        writes: { const: "forbidden" },
        env_allowlist: {
          type: "array",
          items: { type: "string" }
        }
      }
    },
    commands: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "program",
          "allowed_argv_patterns",
          "forbidden_flags",
          "cwd_policy",
          "path_policy",
          "timeout_ms",
          "max_buffer_bytes",
          "network",
          "writes",
          "expected_output_class",
          "proof_path_class"
        ],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
          program: { type: "string", minLength: 1 },
          allowed_argv_patterns: {
            type: "array",
            minItems: 1,
            items: {
              type: "array",
              items: { type: "string", minLength: 1 }
            }
          },
          forbidden_flags: {
            type: "array",
            items: { type: "string" }
          },
          cwd_policy: { const: "repo_root" },
          path_policy: { enum: ["relative_no_parent", "none"] },
          timeout_ms: { type: "integer", minimum: 1 },
          max_buffer_bytes: { type: "integer", minimum: 1 },
          network: { const: "forbidden" },
          writes: { const: "forbidden" },
          expected_output_class: { enum: ["text", "json", "none"] },
          proof_path_class: { enum: ["repo_relative", "none"] }
        }
      }
    }
  }
} as const;

export function loadCommandRegistry(): CommandRegistry {
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as unknown;
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true
  });
  const validate = ajv.compile(registrySchema);

  if (!validate(registry)) {
    const errors = (validate.errors ?? [])
      .map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message ?? "failed validation"}`)
      .join("; ");
    throw new Error(`command registry failed schema validation: ${errors}`);
  }

  return registry as CommandRegistry;
}

export function findCommandEntry(registry: CommandRegistry, id: string): CommandRegistryEntry | undefined {
  return registry.commands.find((entry) => entry.id === id);
}

export function resolveRepoPath(relativePath: string): string {
  const resolved = resolve(repoRoot, relativePath);
  const realRoot = realpathSync(repoRoot);

  let target: string;
  try {
    target = realpathSync(resolved);
  } catch {
    target = realpathSync(dirname(resolved));
  }

  if (target !== realRoot && !target.startsWith(`${realRoot}/`)) {
    throw new Error(`path escapes repo root: ${relativePath}`);
  }

  try {
    if (lstatSync(resolved).isSymbolicLink()) {
      throw new Error(`path is a symlink: ${relativePath}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("path is a symlink")) {
      throw error;
    }
  }

  return resolved;
}
