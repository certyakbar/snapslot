import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUIRED_FIELDS = [
  "task_id",
  "task_name",
  "phase",
  "workflow",
  "risk_level",
  "actor_surface",
  "allowed_files",
  "forbidden_files",
  "required_behavior",
  "forbidden_behavior",
  "validation_commands",
  "stop_rule",
  "return_format",
];

const OPTIONAL_FIELDS = [
  "known_contradictions",
  "docs_may_change",
  "ledger_update_required",
  "notes",
];

const ALLOWED_FIELDS = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
const VALID_PHASES = new Set(["Phase N/A", ...Array.from({ length: 13 }, (_, index) => `Phase ${index}`)]);
const VALID_RISK_LEVELS = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const VALID_ACTOR_SURFACES = new Set(["PLATFORM_OWNER", "BUSINESS_ADMIN", "CUSTOMER", "INTERNAL"]);
const TASK_ID_PATTERN = /^T-\S+$/;
const WORKFLOW_PATTERN = /^Workflow [A-L](?:\b.*)?$/;
const CONTRADICTION_ID_PATTERN = /^[CD]-\d+$/;

main();

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    process.stderr.write("Usage: node scripts/validate-task-packet.js <path-to-packet.json>\n");
    process.exit(1);
  }

  const schemaPath = resolve(__dirname, "..", "schemas", "task-packet.schema.json");
  if (!existsSync(schemaPath)) {
    process.stderr.write("Error: schemas/task-packet.schema.json not found.\n");
    process.exit(1);
  }

  if (readJsonFile(schemaPath, "schema") === null) {
    process.exit(1);
  }

  const packetPath = resolve(args[0]);
  const packet = readJsonFile(packetPath, "packet");
  if (packet === null) {
    process.exit(1);
  }

  const failures = validatePacket(packet);
  if (failures.length > 0) {
    process.stderr.write(renderValidationFailures(failures));
    process.exit(1);
  }

  process.stdout.write("Validation passed.\n");
}

function readJsonFile(filePath, label) {
  let raw;

  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      process.stderr.write(`Error: ${label} file not found.\n`);
    } else {
      process.stderr.write(`Error: unable to read ${label} file.\n`);
    }
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    process.stderr.write(`Error: ${label} file is not valid JSON.\n`);
    return null;
  }
}

function validatePacket(packet) {
  const failures = [];

  if (!isPlainObject(packet)) {
    failures.push(["packet", "must be a JSON object"]);
    return failures;
  }

  for (const key of Object.keys(packet)) {
    if (!ALLOWED_FIELDS.has(key)) {
      failures.push([`unknown field '${key}'`, "additional property not allowed"]);
    }
  }

  validateTaskId(packet.task_id, failures);
  validateRequiredString(packet.task_name, "task_name", failures);
  validatePhase(packet.phase, failures);
  validateWorkflow(packet.workflow, packet.phase, failures);
  validateRiskLevel(packet.risk_level, failures);
  validateActorSurface(packet.actor_surface, failures);
  validateStringArray(packet.allowed_files, "allowed_files", "must contain at least one file path", failures);
  validateStringArray(packet.forbidden_files, "forbidden_files", "must contain at least one file path", failures);
  validateRequiredString(packet.required_behavior, "required_behavior", failures);
  validateRequiredString(packet.forbidden_behavior, "forbidden_behavior", failures);
  validateStringArray(
    packet.validation_commands,
    "validation_commands",
    "must contain at least one shell command",
    failures
  );
  validateRequiredString(packet.stop_rule, "stop_rule", failures);
  validateRequiredString(packet.return_format, "return_format", failures);

  if (Object.prototype.hasOwnProperty.call(packet, "docs_may_change")) {
    validateDocsMayChange(packet.docs_may_change, failures);
  }

  if (Object.prototype.hasOwnProperty.call(packet, "ledger_update_required")) {
    validateLedgerUpdateRequired(packet.ledger_update_required, failures);
  }

  if (Object.prototype.hasOwnProperty.call(packet, "known_contradictions")) {
    validateKnownContradictions(packet.known_contradictions, failures);
  }

  if (Object.prototype.hasOwnProperty.call(packet, "notes") && typeof packet.notes !== "string") {
    failures.push(["notes", "must be a string"]);
  }

  return failures;
}

function validateTaskId(value, failures) {
  if (!isNonEmptyString(value)) {
    failures.push(["task_id", "missing or empty"]);
  } else if (!TASK_ID_PATTERN.test(value)) {
    failures.push(["task_id", "must match /^T-\\S+$/"]);
  }
}

function validateRequiredString(value, fieldName, failures) {
  if (!isNonEmptyString(value)) {
    failures.push([fieldName, "missing or empty"]);
  }
}

function validatePhase(value, failures) {
  if (!isNonEmptyString(value)) {
    failures.push(["phase", "missing or empty"]);
  } else if (!VALID_PHASES.has(value)) {
    failures.push(["phase", "must be one of Phase 0 through Phase 12, or Phase N/A"]);
  }
}

function validateWorkflow(value, phase, failures) {
  if (!isNonEmptyString(value)) {
    failures.push(["workflow", "missing or empty"]);
    return;
  }

  const isPhaseNA = phase === "Phase N/A";
  const isKnownNumberedPhase = VALID_PHASES.has(phase) && !isPhaseNA;
  const isWorkflowNA = value === "N/A";

  if ((isKnownNumberedPhase && isWorkflowNA) || (!isWorkflowNA && !WORKFLOW_PATTERN.test(value))) {
    failures.push(["workflow", "must start with Workflow A through Workflow L when phase is numbered"]);
  }

  if (isPhaseNA && !isWorkflowNA) {
    failures.push(["workflow", "must be N/A when phase is Phase N/A"]);
  }
}

function validateRiskLevel(value, failures) {
  if (!isNonEmptyString(value)) {
    failures.push(["risk_level", "missing or empty"]);
  } else if (!VALID_RISK_LEVELS.has(value)) {
    failures.push(["risk_level", "must be one of: CRITICAL, HIGH, MEDIUM, LOW"]);
  }
}

function validateActorSurface(value, failures) {
  if (value === undefined || value === null || value === "") {
    failures.push(["actor_surface", "missing or empty"]);
    return;
  }

  if (!Array.isArray(value)) {
    failures.push(["actor_surface", "must be a non-empty array"]);
    return;
  }

  if (value.length === 0) {
    failures.push(["actor_surface", "must include at least one checked item"]);
    return;
  }

  const invalidValues = value.filter((item) => !VALID_ACTOR_SURFACES.has(item));
  if (invalidValues.length > 0) {
    failures.push(["actor_surface", `contains invalid value(s): ${invalidValues.join(", ")}`]);
  }

  const duplicateValues = findDuplicateValues(value);
  if (duplicateValues.length > 0) {
    failures.push(["actor_surface", `contains duplicate value(s): ${duplicateValues.join(", ")}`]);
  }
}

function validateStringArray(value, fieldName, emptyReason, failures) {
  if (value === undefined || value === null || value === "") {
    failures.push([fieldName, "missing or empty"]);
    return;
  }

  if (!Array.isArray(value)) {
    failures.push([fieldName, "must be an array"]);
    return;
  }

  if (value.length === 0) {
    failures.push([fieldName, emptyReason]);
    return;
  }

  const invalidIndexes = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!isNonEmptyString(value[index])) {
      invalidIndexes.push(index);
    }
  }

  if (invalidIndexes.length > 0) {
    failures.push([fieldName, `contains invalid value(s) at index(es): ${invalidIndexes.join(", ")}`]);
  }
}

function validateDocsMayChange(value, failures) {
  if (typeof value === "boolean") {
    return;
  }

  if (!isPlainObject(value)) {
    failures.push(["docs_may_change", "must be a boolean or an object with value/files"]);
    return;
  }

  validateObjectKeys(value, "docs_may_change", ["value", "files"], failures);

  if (!Object.prototype.hasOwnProperty.call(value, "value")) {
    failures.push(["docs_may_change", "object form requires 'value'"]);
  } else if (value.value !== true) {
    failures.push(["docs_may_change", "object form 'value' must be true"]);
  }

  if (!Object.prototype.hasOwnProperty.call(value, "files")) {
    failures.push(["docs_may_change", "object form requires 'files'"]);
  } else if (!Array.isArray(value.files)) {
    failures.push(["docs_may_change", "object form 'files' must be an array"]);
  } else if (value.files.length === 0) {
    failures.push(["docs_may_change", "object form 'files' must contain at least one file path"]);
  } else {
    const invalidIndexes = [];
    for (let index = 0; index < value.files.length; index += 1) {
      if (!isNonEmptyString(value.files[index])) {
        invalidIndexes.push(index);
      }
    }
    if (invalidIndexes.length > 0) {
      failures.push([
        "docs_may_change",
        `object form 'files' contains invalid value(s) at index(es): ${invalidIndexes.join(", ")}`,
      ]);
    }
  }
}

function validateLedgerUpdateRequired(value, failures) {
  if (typeof value === "boolean") {
    return;
  }

  if (!isPlainObject(value)) {
    failures.push(["ledger_update_required", "must be a boolean or an object with value/detail"]);
    return;
  }

  validateObjectKeys(value, "ledger_update_required", ["value", "detail"], failures);

  if (!Object.prototype.hasOwnProperty.call(value, "value")) {
    failures.push(["ledger_update_required", "object form requires 'value'"]);
  } else if (value.value !== true) {
    failures.push(["ledger_update_required", "object form 'value' must be true"]);
  }

  if (!Object.prototype.hasOwnProperty.call(value, "detail")) {
    failures.push(["ledger_update_required", "object form requires 'detail'"]);
  } else if (!isNonEmptyString(value.detail)) {
    failures.push(["ledger_update_required", "object form 'detail' must be a non-empty string"]);
  }
}

function validateKnownContradictions(value, failures) {
  if (!Array.isArray(value)) {
    failures.push(["known_contradictions", "must be an array"]);
    return;
  }

  const invalidValues = value.filter((item) => typeof item !== "string" || !CONTRADICTION_ID_PATTERN.test(item));
  if (invalidValues.length > 0) {
    failures.push(["known_contradictions", `contains invalid value(s): ${invalidValues.join(", ")}`]);
  }
}

function validateObjectKeys(value, fieldName, allowedKeys, failures) {
  const extras = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  for (const key of extras) {
    failures.push([fieldName, `object form contains unknown key '${key}'`]);
  }
}

function renderValidationFailures(failures) {
  const lines = ["Validation failed:"];
  for (const [field, reason] of failures) {
    lines.push(`- ${field}: ${reason}`);
  }
  return `${lines.join("\n")}\n`;
}

function findDuplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(String(value));
    } else {
      seen.add(value);
    }
  }

  return Array.from(duplicates);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
