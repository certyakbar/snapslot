import {
  findCommandEntry,
  loadCommandRegistry,
  resolveRepoPath
} from "./command-registry.js";
import type { CommandObject, CommandRegistry, CommandRegistryEntry, EmitEnvelope, ValidationResult } from "./types.js";

const shellControlPattern = /(?:&&|\|\||;|\||`|\$\(|\$\{|\n|\r)/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasParentOrEmptySegment(value: string): boolean {
  return value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function validateExecutable(entry: CommandRegistryEntry, errors: string[]): void {
  if (entry.program.startsWith("/") && !["/usr/bin/env"].includes(entry.program)) {
    errors.push(`command ${entry.id} uses an unapproved absolute executable path`);
  }

  if (shellControlPattern.test(entry.program)) {
    errors.push(`command ${entry.id} program contains shell control syntax`);
  }
}

function argvMatches(entry: CommandRegistryEntry, argv: string[]): boolean {
  return entry.allowed_argv_patterns.some((patternSet) => {
    if (patternSet.length !== argv.length) {
      return false;
    }

    return patternSet.every((pattern, index) => new RegExp(pattern, "u").test(argv[index] ?? ""));
  });
}

function validateArgPathPolicy(entry: CommandRegistryEntry, argv: string[], errors: string[]): void {
  if (entry.path_policy !== "relative_no_parent") {
    return;
  }

  const pathArgs = entry.id === "grep_literal" ? argv.slice(2) : argv.filter((arg) => !arg.startsWith("-"));

  for (const arg of pathArgs) {
    if (arg.startsWith("-")) {
      continue;
    }
    if (arg.startsWith("/")) {
      errors.push(`command ${entry.id} rejects absolute path argument: ${arg}`);
      continue;
    }
    if (hasParentOrEmptySegment(arg)) {
      errors.push(`command ${entry.id} rejects parent, current, or empty path segment: ${arg}`);
      continue;
    }
    if (/[.*+?^${}()|[\]\\]/u.test(arg) && entry.id !== "grep_literal") {
      continue;
    }
    try {
      resolveRepoPath(arg);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
}

export function validateCommandObject(
  command: unknown,
  registry: CommandRegistry = loadCommandRegistry()
): ValidationResult {
  const errors: string[] = [];

  if (!isObject(command)) {
    return {
      valid: false,
      errors: ["command must be a structured command object"]
    };
  }

  if (typeof command.id !== "string") {
    errors.push("command.id must be a registry command id");
  }
  if (!Array.isArray(command.argv) || !command.argv.every((arg) => typeof arg === "string" && arg.length > 0)) {
    errors.push("command.argv must be a non-empty string array");
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  const structuredCommand = command as unknown as CommandObject;
  const entry = findCommandEntry(registry, structuredCommand.id);
  if (!entry) {
    return {
      valid: false,
      errors: [`command id is not approved by registry: ${structuredCommand.id}`]
    };
  }

  validateExecutable(entry, errors);

  for (const arg of structuredCommand.argv) {
    if (shellControlPattern.test(arg)) {
      errors.push(`command ${entry.id} rejects shell control syntax in argument: ${arg}`);
    }
    if (entry.forbidden_flags.includes(arg)) {
      errors.push(`command ${entry.id} rejects forbidden flag: ${arg}`);
    }
  }

  if (!argvMatches(entry, structuredCommand.argv)) {
    errors.push(`command ${entry.id} argv does not match allowed registry patterns`);
  }

  validateArgPathPolicy(entry, structuredCommand.argv, errors);

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateEmitSemantics(envelope: EmitEnvelope): ValidationResult {
  const registry = loadCommandRegistry();
  const errors: string[] = [];

  for (const command of envelope.validation.commands) {
    const result = validateCommandObject(command, registry);
    errors.push(...result.errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
