import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkContextBudget, attachContextEscalation } from "./context-budget.js";
import { readRepoState, type RepoState } from "./dirty-classifier.js";
import { createBlockEnvelope, normalizeEmitEnvelope } from "./envelope.js";
import { validateBlockEnvelope, validateEmitEnvelope, validateEnvelope } from "./schema-validator.js";
import { validateEmitSemantics } from "./semantic-validator.js";
import {
  checksumBlock,
  isTransportEnvelope,
  sha256Hex,
  validateTransport,
  writeAtomicJson
} from "./transport.js";
import { runNoSecretPreflight } from "./preflight.js";
import { compileLocalLoopPacketFile } from "./local-loop-packet.js";
import { mainLocalLoopCommandRunner } from "./local-loop-command-runner.js";
import type { EmitEnvelope, SirEnvelope, TransportEnvelope } from "./types.js";

interface CliArgs {
  mode: "sir" | "local-loop-preflight" | "local-loop-command-runner";
  input?: string;
  output?: string;
  packet?: string;
}

function parseArgs(argv: string[]): CliArgs {
  if (argv.includes("--local-loop-command-runner")) {
    const packetIndex = argv.indexOf("--packet");
    if (packetIndex === -1 || !argv[packetIndex + 1]) {
      throw new Error("usage: sir-compiler --local-loop-command-runner --packet <path>");
    }
    return {
      mode: "local-loop-command-runner",
      packet: argv[packetIndex + 1]
    };
  }

  if (argv.includes("--local-loop-preflight")) {
    const preflightIndex = argv.indexOf("--local-loop-preflight");
    const outputIndex = argv.indexOf("--output");
    if (!argv[preflightIndex + 1] || outputIndex === -1 || !argv[outputIndex + 1]) {
      throw new Error("usage: sir-compiler --local-loop-preflight <governor-output-path> --output <path>");
    }
    return {
      mode: "local-loop-preflight",
      input: argv[preflightIndex + 1],
      output: argv[outputIndex + 1]
    };
  }

  const inputIndex = argv.indexOf("--input");
  const outputIndex = argv.indexOf("--output");

  if (inputIndex === -1 || outputIndex === -1 || !argv[inputIndex + 1] || !argv[outputIndex + 1]) {
    throw new Error("usage: sir-compiler --input <path> --output <path>");
  }

  return {
    mode: "sir",
    input: argv[inputIndex + 1],
    output: argv[outputIndex + 1]
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
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

function repoMovedBlock(source: unknown, message: string): SirEnvelope {
  return createBlockEnvelope(source, "REPO_MOVED_DURING_COMPILE", [message]);
}

function dirtyRepoBlock(source: unknown, repoState: RepoState): SirEnvelope {
  return createBlockEnvelope(
    source,
    "DIRTY_REPO_STATE",
    [`repo has ${repoState.dirty_summary.length} dirty path(s); details redacted`]
  );
}

function validateRepoAnchor(envelope: TransportEnvelope, repoState: RepoState): SirEnvelope | null {
  if (envelope.repo_anchor.branch !== repoState.branch || envelope.repo_anchor.head_sha !== repoState.head_sha) {
    return repoMovedBlock(envelope, "transport repo anchor does not match current HEAD");
  }

  if (repoState.dirty && envelope.repo_anchor.dirty_allowed !== true) {
    return dirtyRepoBlock(envelope, repoState);
  }

  return null;
}

function parseTransportPayload(envelope: TransportEnvelope): SirEnvelope {
  if (sha256Hex(envelope.payload) !== envelope.payload_sha256) {
    return checksumBlock(envelope);
  }

  const preflightResult = runNoSecretPreflight(envelope.payload);
  if (!preflightResult.valid) {
    return createBlockEnvelope(envelope, "SECRET_PREFLIGHT_FAILED", preflightResult.errors);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(envelope.payload);
  } catch {
    return createBlockEnvelope(envelope, "SCHEMA_VALIDATION_FAILED", ["transport payload is not valid JSON"]);
  }

  const budgetResult = checkContextBudget(envelope, payload);
  if (!budgetResult.valid) {
    const block = createBlockEnvelope(payload, "CONTEXT_BUDGET_EXCEEDED", budgetResult.errors, [
      "partial context emitted",
      "token count is deterministic gpt-tokenizer measurement, not vendor billing-token accuracy"
    ]);
    return budgetResult.partial_context ? attachContextEscalation(block, budgetResult.partial_context) : block;
  }

  return compileEnvelope(payload);
}

function compileInput(input: unknown, repoState: RepoState): SirEnvelope {
  if (!isTransportEnvelope(input)) {
    return compileEnvelope(input);
  }

  const transportSchemaResult = validateTransport(input);
  if (!transportSchemaResult.valid) {
    return createBlockEnvelope(input, "SCHEMA_VALIDATION_FAILED", transportSchemaResult.errors);
  }

  const anchorBlock = validateRepoAnchor(input, repoState);
  if (anchorBlock) {
    return anchorBlock;
  }

  return parseTransportPayload(input);
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
    if (args.mode === "local-loop-command-runner") {
      void mainLocalLoopCommandRunner(process.argv.slice(2)).catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 2;
      });
      return;
    }

    if (args.mode === "local-loop-preflight") {
      try {
        const packet = compileLocalLoopPacketFile(args.input ?? "");
        writeFileSync(resolve(args.output ?? ""), `${JSON.stringify(packet, null, 2)}\n`);
        process.exitCode = 0;
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      }
      return;
    }

    const initialRepoState = readRepoState();
    const outputPath = args.output ?? "";
    const input = readJson(args.input ?? "");
    const output = compileInput(input, initialRepoState);
    const exitCode = exitCodeFor(output);

    if (exitCode === 2) {
      process.exitCode = 2;
      return;
    }

    const finalRepoState = readRepoState();
    if (finalRepoState.head_sha !== initialRepoState.head_sha) {
      const movedOutput = repoMovedBlock(input, "repo HEAD changed before final write");
      writeAtomicJson(outputPath, movedOutput);
      process.exitCode = 1;
      return;
    }

    writeAtomicJson(outputPath, output);
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

main();
