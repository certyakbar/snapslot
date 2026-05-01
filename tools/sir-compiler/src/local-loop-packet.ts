import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateLocalLoopPacketSchema } from "./schema-validator.js";
import { loadCommandRegistry } from "./command-registry.js";
import type { CommandObject, LocalLoopPacket, ValidationResult } from "./types.js";

export const LOCAL_LOOP_BEGIN_MARKER = "SNAPSLOT_LOCAL_LOOP_PACKET_JSON_BEGIN";
export const LOCAL_LOOP_END_MARKER = "SNAPSLOT_LOCAL_LOOP_PACKET_JSON_END";

const shellControlPattern = /(?:\$\(|`|;|&&|\|\||[|&<>]|\r|\n)/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countOccurrences(source: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    const found = source.indexOf(needle, index);
    if (found === -1) {
      return count;
    }
    count += 1;
    index = found + needle.length;
  }
}

function hasParentOrEmptySegment(value: string): boolean {
  return value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function stripOptionalOuterJsonFence(block: string): string {
  const trimmed = block.trim();
  const fenced = trimmed.match(/^```(?:json|JSON)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/u);
  if (!fenced) {
    if (trimmed.includes("```")) {
      throw new Error("local-loop packet rejects nested or partial markdown fences");
    }
    return trimmed;
  }

  const inner = fenced[1].trim();
  if (inner.includes("```")) {
    throw new Error("local-loop packet rejects nested markdown fences");
  }
  return inner;
}

function extractMarkedJson(source: string): string {
  const beginCount = countOccurrences(source, LOCAL_LOOP_BEGIN_MARKER);
  const endCount = countOccurrences(source, LOCAL_LOOP_END_MARKER);

  if (beginCount === 0 || endCount === 0) {
    throw new Error("local-loop packet markers missing");
  }
  if (beginCount > 1) {
    throw new Error("local-loop packet duplicate begin marker");
  }
  if (endCount > 1) {
    throw new Error("local-loop packet duplicate end marker");
  }

  const beginIndex = source.indexOf(LOCAL_LOOP_BEGIN_MARKER);
  const endIndex = source.indexOf(LOCAL_LOOP_END_MARKER);
  if (endIndex < beginIndex) {
    throw new Error("local-loop packet end marker appears before begin marker");
  }

  return stripOptionalOuterJsonFence(source.slice(beginIndex + LOCAL_LOOP_BEGIN_MARKER.length, endIndex));
}

function parseLocalLoopJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("local-loop packet block is not exact JSON");
  }
}

function validateCommand(command: CommandObject): string[] {
  const registry = loadCommandRegistry();
  const entry = registry.commands.find((candidate) => candidate.id === command.id);
  const errors: string[] = [];

  if (!entry) {
    return [`unknown command ID: ${command.id}`];
  }
  if (entry.writes !== "forbidden") {
    errors.push(`command ${command.id} is write-capable without local-loop approval`);
  }
  if (entry.network !== "forbidden") {
    errors.push(`command ${command.id} is network-capable without local-loop approval`);
  }

  for (const arg of command.argv) {
    if (shellControlPattern.test(arg)) {
      errors.push(`command ${command.id} rejects shell metacharacter argument: ${arg}`);
    }
    if (entry.forbidden_flags.includes(arg)) {
      errors.push(`command ${command.id} rejects forbidden flag: ${arg}`);
    }
  }

  const matchesPattern = entry.allowed_argv_patterns.some((patternSet) => {
    if (patternSet.length !== command.argv.length) {
      return false;
    }
    return patternSet.every((pattern, index) => new RegExp(pattern, "u").test(command.argv[index] ?? ""));
  });
  if (!matchesPattern) {
    errors.push(`command ${command.id} argv does not match allowed registry patterns`);
  }

  if (entry.path_policy === "relative_no_parent") {
    const pathArgs = command.id === "grep_literal" ? command.argv.slice(2) : command.argv.filter((arg) => !arg.startsWith("-"));
    for (const pathArg of pathArgs) {
      if (pathArg.startsWith("/")) {
        errors.push(`command ${command.id} rejects absolute path: ${pathArg}`);
      }
      if (hasParentOrEmptySegment(pathArg)) {
        errors.push(`command ${command.id} rejects parent, current, or empty path segment: ${pathArg}`);
      }
    }
  }

  return errors;
}

function validateLocalLoopCommands(packet: LocalLoopPacket): ValidationResult {
  const errors = packet.validation_commands.flatMap((command) => validateCommand(command));
  return {
    valid: errors.length === 0,
    errors
  };
}

function normalizeStringArray(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function normalizeLocalLoopPacket(packet: LocalLoopPacket): LocalLoopPacket {
  return {
    ...packet,
    allowed_files: normalizeStringArray(packet.allowed_files),
    forbidden_files: normalizeStringArray(packet.forbidden_files),
    validation_commands: packet.validation_commands.map((command) => ({
      id: command.id,
      argv: [...command.argv]
    }))
  };
}

export function compileLocalLoopPacketSource(source: string): LocalLoopPacket {
  const jsonText = extractMarkedJson(source);
  const parsed = parseLocalLoopJson(jsonText);

  if (!isObject(parsed)) {
    throw new Error("local-loop packet must be a JSON object");
  }

  const schemaResult = validateLocalLoopPacketSchema(parsed);
  if (!schemaResult.valid) {
    throw new Error(`local-loop packet schema validation failed: ${schemaResult.errors.join("; ")}`);
  }

  const normalized = normalizeLocalLoopPacket(parsed as unknown as LocalLoopPacket);
  const commandResult = validateLocalLoopCommands(normalized);
  if (!commandResult.valid) {
    throw new Error(`local-loop packet command validation failed: ${commandResult.errors.join("; ")}`);
  }

  return normalized;
}

export function compileLocalLoopPacketFile(path: string): LocalLoopPacket {
  return compileLocalLoopPacketSource(readFileSync(resolve(path), "utf8"));
}
