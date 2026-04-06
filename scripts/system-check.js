#!/usr/bin/env node
/**
 * scripts/system-check.js
 * SnapSlot Phase 0.5 — Operational Continuity Pre-flight Checker
 *
 * Usage:  node scripts/system-check.js
 * Exit 0: all checks pass
 * Exit 1: one or more checks failed
 *
 * No external dependencies. Node.js built-ins only.
 * Requires Node 18+ (ESM, import.meta.url).
 * Package is "type": "module" — ESM imports required.
 */

import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

function exists(rel) {
  return existsSync(resolve(ROOT, rel));
}

console.log("\nSnapSlot System Check — Phase 0.5 Operational Continuity");
console.log("=".repeat(57) + "\n");

console.log("[ Governance spine ]");
check("CLAUDE.md",                                  exists("CLAUDE.md"));
check("AGENTS.md",                                  exists("AGENTS.md"));
check(".github/copilot-instructions.md",            exists(".github/copilot-instructions.md"));
check(".github/CODEOWNERS",                         exists(".github/CODEOWNERS"));
check(".github/pull_request_template.md",           exists(".github/pull_request_template.md"));

console.log("\n[ Core governance docs ]");
check("docs/SNAPSLOT_CONSTITUTION.md",              exists("docs/SNAPSLOT_CONSTITUTION.md"));
check("docs/SNAPSLOT_ACCEPTANCE_LEDGER.md",         exists("docs/SNAPSLOT_ACCEPTANCE_LEDGER.md"));
check("docs/SNAPSLOT_PHASE_TASKS.md",               exists("docs/SNAPSLOT_PHASE_TASKS.md"));
check("docs/SNAPSLOT_ARCHITECTURE.md",              exists("docs/SNAPSLOT_ARCHITECTURE.md"));
check("docs/SNAPSLOT_RISK_POLICY.md",               exists("docs/SNAPSLOT_RISK_POLICY.md"));
check("docs/SNAPSLOT_CONTEXT_RECOVERY_PROTOCOL.md", exists("docs/SNAPSLOT_CONTEXT_RECOVERY_PROTOCOL.md"));
check("docs/SNAPSLOT_SENTINEL_CONTRACT.md",         exists("docs/SNAPSLOT_SENTINEL_CONTRACT.md"));
check("docs/SNAPSLOT_TASK_PACKET_SCHEMA.md",        exists("docs/SNAPSLOT_TASK_PACKET_SCHEMA.md"));

console.log("\n[ Operational control matrices ]");
check("docs/SNAPSLOT_STATE_MATRIX.md",              exists("docs/SNAPSLOT_STATE_MATRIX.md"));
check("docs/SNAPSLOT_ROUTE_MATRIX.md",              exists("docs/SNAPSLOT_ROUTE_MATRIX.md"));
check("docs/SNAPSLOT_UI_MATRIX.md",                 exists("docs/SNAPSLOT_UI_MATRIX.md"));
check("docs/SNAPSLOT_CONTRADICTION_LOG.md",         exists("docs/SNAPSLOT_CONTRADICTION_LOG.md"));

console.log("\n[ Phase 0.5 operational continuity ]");
check("ops/TASK_STATE.json",                        exists("ops/TASK_STATE.json"));
check("scripts/system-check.js",                    exists("scripts/system-check.js"));
check("docs/SNAPSLOT_DISCOVERY_REGISTER.md",        exists("docs/SNAPSLOT_DISCOVERY_REGISTER.md"));

if (exists("ops/TASK_STATE.json")) {
  let valid = false;
  let detail = "parse error";
  try {
    const raw = readFileSync(resolve(ROOT, "ops/TASK_STATE.json"), "utf-8");
    const j   = JSON.parse(raw);
    valid  = typeof j.phase === "string" && Array.isArray(j.tasks);
    detail = valid ? "" : "missing required fields: phase (string), tasks (array)";
  } catch (e) {
    detail = String(e.message ?? e);
  }
  check("ops/TASK_STATE.json — valid JSON with required fields", valid, detail);
}

if (exists("docs/SNAPSLOT_PHASE_TASKS.md")) {
  const content = readFileSync(resolve(ROOT, "docs/SNAPSLOT_PHASE_TASKS.md"), "utf-8");
  check(
    "docs/SNAPSLOT_PHASE_TASKS.md contains Phase 0.5 block",
    content.includes("Phase 0.5"),
    "Phase 0.5 insertion not found"
  );
}

console.log("\n[ Critical source files ]");
check("package.json",    exists("package.json"));
check("server.ts",       exists("server.ts"));
check("bookingStore.ts", exists("bookingStore.ts"));
check("bookingCore.ts",  exists("bookingCore.ts"));
check("Persistence.ts",  exists("Persistence.ts"));
check("auth.ts",         exists("auth.ts"));
check("errors.ts",       exists("errors.ts"));

console.log("\n[ CI workflows ]");
check(".github/workflows/pr-sentinel.yml",          exists(".github/workflows/pr-sentinel.yml"));
check(".github/workflows/reusable-validate.yml",    exists(".github/workflows/reusable-validate.yml"));

const bar = "─".repeat(57);
console.log(`\n${bar}`);
console.log(`  Total : ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`${bar}\n`);

if (failed > 0) {
  console.error(`SYSTEM CHECK FAILED — ${failed} check(s) require attention.\n`);
  process.exit(1);
} else {
  console.log("SYSTEM CHECK PASSED — all checks green.\n");
  process.exit(0);
}