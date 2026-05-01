import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema, ErrorObject } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ValidationResult } from "./types.js";

const thisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(thisDir, "../../..");

function readSchema(relativePath: string): AnySchema {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8")) as AnySchema;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return [];
  }

  return errors.map((error) => {
    const location = error.instancePath || "/";
    return `${location} ${error.message ?? "failed validation"}`;
  });
}

export function createSchemaValidator(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true
  });

  ajv.addSchema(readSchema("schemas/sir-base.json"));
  ajv.addSchema(readSchema("schemas/sir-emit.json"));
  ajv.addSchema(readSchema("schemas/sir-block.json"));
  ajv.addSchema(readSchema("schemas/sir-transport.json"));
  ajv.addSchema(readSchema("schemas/local-loop-packet.schema.json"));

  return ajv;
}

export function validateLocalLoopPacketSchema(value: unknown): ValidationResult {
  const ajv = createSchemaValidator();
  const valid = ajv.validate("https://snapslot.local/schemas/local-loop-packet.schema.json", value);
  return {
    valid,
    errors: formatAjvErrors(ajv.errors)
  };
}

export function validateTransportEnvelope(value: unknown): ValidationResult {
  const ajv = createSchemaValidator();
  const valid = ajv.validate("https://snapslot.local/schemas/sir-transport.json", value);
  return {
    valid,
    errors: formatAjvErrors(ajv.errors)
  };
}

export function validateEmitEnvelope(value: unknown): ValidationResult {
  const ajv = createSchemaValidator();
  const valid = ajv.validate("https://snapslot.local/schemas/sir-emit.json", value);
  return {
    valid,
    errors: formatAjvErrors(ajv.errors)
  };
}

export function validateBlockEnvelope(value: unknown): ValidationResult {
  const ajv = createSchemaValidator();
  const valid = ajv.validate("https://snapslot.local/schemas/sir-block.json", value);
  return {
    valid,
    errors: formatAjvErrors(ajv.errors)
  };
}

export function validateEnvelope(value: unknown): ValidationResult {
  if (typeof value !== "object" || value === null || !("result_type" in value)) {
    return {
      valid: false,
      errors: ["/result_type must be EMIT_CANDIDATE or BLOCK"]
    };
  }

  const resultType = (value as { result_type?: unknown }).result_type;
  if (resultType === "EMIT_CANDIDATE") {
    return validateEmitEnvelope(value);
  }
  if (resultType === "BLOCK") {
    return validateBlockEnvelope(value);
  }

  return {
    valid: false,
    errors: ["/result_type must be EMIT_CANDIDATE or BLOCK"]
  };
}
