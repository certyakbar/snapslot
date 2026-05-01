import { closeSync, fsyncSync, openSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { createBlockEnvelope } from "./envelope.js";
import { validateTransportEnvelope } from "./schema-validator.js";
import type { BlockEnvelope, SirEnvelope, TransportEnvelope, ValidationResult } from "./types.js";

export function isTransportEnvelope(value: unknown): value is TransportEnvelope {
  return typeof value === "object"
    && value !== null
    && "protocol" in value
    && (value as { protocol?: unknown }).protocol === "sir-transport.v1";
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function validateTransport(value: unknown): ValidationResult {
  return validateTransportEnvelope(value);
}

export function checksumBlock(envelope: TransportEnvelope): BlockEnvelope {
  return createBlockEnvelope(
    envelope,
    "CHECKSUM_MISMATCH",
    ["transport payload checksum mismatch"]
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

function escapeNonAscii(value: string): string {
  return value.replace(/[^\x00-\x7F]/g, (char) => {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      return "";
    }
    if (codePoint <= 0xffff) {
      return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    }
    const adjusted = codePoint - 0x10000;
    const high = 0xd800 + (adjusted >> 10);
    const low = 0xdc00 + (adjusted & 0x3ff);
    return `\\u${high.toString(16)}\\u${low.toString(16)}`;
  });
}

export function canonicalJson(value: unknown): string {
  return `${escapeNonAscii(JSON.stringify(canonicalize(value), null, 2))}\n`;
}

export function writeAtomicJson(path: string, value: SirEnvelope): void {
  const outputPath = resolve(path);
  const outputDir = dirname(outputPath);
  const tempPath = resolve(outputDir, `.${basename(outputPath)}.${process.pid}.tmp`);

  writeFileSync(tempPath, canonicalJson(value), "utf8");

  try {
    const fd = openSync(tempPath, "r");
    try {
      // Best effort only: correctness relies on same-directory rename atomicity.
      fsyncSync(fd);
      closeSync(fd);
    } catch {
      closeSync(fd);
    }
  } catch {
    // fsync is intentionally not a correctness requirement for this compiler.
  }

  renameSync(tempPath, outputPath);
}
