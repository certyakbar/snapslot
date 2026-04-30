import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBlockEnvelope, normalizeEmitEnvelope } from "./envelope.js";
import { validateBlockEnvelope, validateEmitEnvelope, validateEnvelope } from "./schema-validator.js";
import { validateEmitSemantics } from "./semantic-validator.js";
import type { EmitEnvelope, SirEnvelope } from "./types.js";

interface CliArgs {
  input: string;
  output: string;
}

function parseArgs(argv: string[]): CliArgs {
  const inputIndex = argv.indexOf("--input");
  const outputIndex = argv.indexOf("--output");

  if (inputIndex === -1 || outputIndex === -1 || !argv[inputIndex + 1] || !argv[outputIndex + 1]) {
    throw new Error("usage: sir-compiler --input <path> --output <path>");
  }

  return {
    input: argv[inputIndex + 1],
    output: argv[outputIndex + 1]
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function compileEnvelope(input: unknown): SirEnvelope {
  const schemaResult = validateEnvelope(input);
  if (!schemaResult.valid) {
    return createBlockEnvelope(input, "SCHEMA_VALIDATION_FAILED", schemaResult.errors);
  }

  const envelope = input as SirEnvelope;
  if (envelope.result_type === "BLOCK") {
    return envelope;
  }

  const semanticResult = validateEmitSemantics(envelope as EmitEnvelope);
  if (!semanticResult.valid) {
    return createBlockEnvelope(envelope, "COMMAND_REJECTED", semanticResult.errors);
  }

  return normalizeEmitEnvelope(envelope as EmitEnvelope, []);
}

function exitCodeFor(envelope: SirEnvelope): 0 | 1 | 2 {
  if (envelope.result_type === "EMIT_CANDIDATE") {
    return validateEmitEnvelope(envelope).valid ? 0 : 2;
  }

  return validateBlockEnvelope(envelope).valid ? 1 : 2;
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const input = readJson(args.input);
    const output = compileEnvelope(input);
    const exitCode = exitCodeFor(output);

    if (exitCode === 2) {
      process.exitCode = 2;
      return;
    }

    writeJson(args.output, output);
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

main();
