#!/usr/bin/env node

import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PR_TEMPLATE_PATH = resolve(ROOT, ".github", "pull_request_template.md");
const SECTION_DIVIDER = "============================================================";
const USAGE = [
  "Usage: node scripts/compile-task.js <ISSUE_NUMBER>",
  "       node scripts/compile-task.js --help",
].join("\n");

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

const VALID_RISK_LEVELS = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const VALID_PHASES = new Set(["Phase N/A", ...Array.from({ length: 13 }, (_, index) => `Phase ${index}`)]);
const VALID_ACTOR_SURFACES = new Set(["PLATFORM_OWNER", "BUSINESS_ADMIN", "CUSTOMER", "INTERNAL"]);

main();

function main() {
  const args = process.argv.slice(2);

  if (args.length === 1 && args[0] === "--help") {
    writeStdout(`${USAGE}\n`);
    return;
  }

  const issueNumber = parseCliArgs(args);
  if (!issueNumber) {
    process.exit(1);
  }

  const issue = fetchIssue(issueNumber);
  const packet = buildPacket(issue.body ?? "");
  const failures = validatePacket(packet);

  if (failures.length > 0) {
    writeStderr(renderValidationFailures(failures));
    process.exit(1);
  }

  if (!existsSync(PR_TEMPLATE_PATH)) {
    writeStderr("Error: .github/pull_request_template.md not found.\n");
    process.exit(1);
  }

  const prTemplate = readFileSync(PR_TEMPLATE_PATH, "utf8");
  let prBodyDraft = "";

  try {
    prBodyDraft = buildPrBodyDraft(packet, prTemplate);
  } catch (error) {
    writeStderr(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const sections = [
    buildSection(1, "EXECUTOR PROMPT", buildExecutorPrompt(packet)),
    buildSection(2, "FALLBACK PACKET", buildFallbackPacket(packet)),
    buildSection(3, "PR BODY DRAFT", prBodyDraft),
    buildSection(4, "PROOF SKELETON", buildProofSkeleton(packet.validationCommands)),
    buildSection(5, "CLEANUP CHECKLIST", buildCleanupChecklist()),
    buildSection(6, "POST-MERGE CLOSURE CHECKLIST", buildPostMergeChecklist(issueNumber, packet)),
  ];

  writeStdout(`${sections.join("\n\n")}\n`);
}

function parseCliArgs(args) {
  if (args.length === 0) {
    writeUsageError("Usage error: expected exactly one GitHub Issue number.");
    return null;
  }

  if (args.some((arg) => arg.startsWith("-"))) {
    writeUsageError("Usage error: only the --help flag is supported.");
    return null;
  }

  if (args.length !== 1) {
    writeUsageError("Usage error: expected exactly one GitHub Issue number.");
    return null;
  }

  const issueNumber = args[0].trim();
  if (!/^[1-9]\d*$/.test(issueNumber)) {
    writeUsageError("Usage error: ISSUE_NUMBER must be a positive integer.");
    return null;
  }

  return issueNumber;
}

function writeUsageError(message) {
  writeStderr(`${message}\n${USAGE}\n`);
}

function fetchIssue(issueNumber) {
  const result = spawnSync("gh", ["issue", "view", issueNumber, "--json", "title,body"], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (result.error && result.error.code === "ENOENT") {
    writeStderr("Error: gh CLI not found. Install GitHub CLI and authenticate before running this script.\n");
    process.exit(1);
  }

  if (result.error || result.status !== 0) {
    writeStderr("Error: gh issue view failed. Ensure GitHub CLI is installed, authenticated, and the issue number is valid.\n");
    process.exit(1);
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    writeStderr("Error: gh issue view returned invalid JSON.\n");
    process.exit(1);
  }
}

function buildPacket(body) {
  const fields = extractFields(body);
  const actorSurface = parseActorSurface(fields.actor_surface ?? "");
  const allowedFiles = parseListItems(fields.allowed_files ?? "");
  const forbiddenFiles = parseListItems(fields.forbidden_files ?? "");
  const validationCommands = parseValidationCommands(fields.validation_commands ?? "");
  const ledgerUpdateRequired = parseBooleanDetailField(fields.ledger_update_required ?? "");

  return {
    taskId: trimField(fields.task_id),
    taskName: trimField(fields.task_name),
    phase: trimField(fields.phase),
    workflow: trimField(fields.workflow),
    riskLevel: trimField(fields.risk_level),
    actorSurfaceRaw: trimField(fields.actor_surface),
    actorSurface,
    allowedFilesRaw: trimField(fields.allowed_files),
    allowedFiles,
    forbiddenFilesRaw: trimField(fields.forbidden_files),
    forbiddenFiles,
    requiredBehavior: trimField(fields.required_behavior),
    forbiddenBehavior: trimField(fields.forbidden_behavior),
    validationCommandsRaw: trimField(fields.validation_commands),
    validationCommands,
    stopRule: trimField(fields.stop_rule),
    returnFormat: trimField(fields.return_format),
    knownContradictionsRaw: trimOptionalField(fields.known_contradictions),
    knownContradictionIds: extractContradictionIds(fields.known_contradictions ?? ""),
    docsMayChange: trimOptionalField(fields.docs_may_change) || "false",
    ledgerUpdateRequired,
    notes: trimOptionalField(fields.notes) || "None",
  };
}

function extractFields(body) {
  const matches = Array.from(body.matchAll(/^###\s+([^\r\n]+?)\s*$/gim));
  const fields = {};

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const label = current[1].trim().toLowerCase();
    const start = (current.index ?? 0) + current[0].length;
    const end = next?.index ?? body.length;
    fields[label] = body.slice(start, end).trim();
  }

  return fields;
}

function parseActorSurface(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^- \[x\]\s+/i.test(line))
    .map((line) => line.replace(/^- \[x\]\s+/i, "").trim().toUpperCase())
    .filter(Boolean);
}

function parseListItems(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bulleted = lines.filter((line) => /^-\s+/.test(line)).map((line) => line.replace(/^-\s+/, "").trim());
  return bulleted.length > 0 ? bulleted : lines;
}

function parseValidationCommands(raw) {
  const lines = raw.split(/\r?\n/);
  const numbered = [];

  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s*(.+?)\s*$/);
    if (match && match[1].trim()) {
      numbered.push(match[1].trim());
    }
  }

  if (numbered.length > 0) {
    return numbered;
  }

  return lines
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

function parseBooleanDetailField(raw) {
  const value = trimOptionalField(raw);
  if (!value) {
    return { raw: "false", isTrue: false, detail: "" };
  }

  const match = value.match(/^(true|false)\b(?:\s*(?:->|:|\u2192)\s*(.+))?$/i);
  if (!match) {
    return { raw: value, isTrue: false, detail: "" };
  }

  return {
    raw: value,
    isTrue: match[1].toLowerCase() === "true",
    detail: (match[2] ?? "").trim(),
  };
}

function extractContradictionIds(raw) {
  return Array.from(new Set(raw.match(/\b[CD]-\d+\b/g) ?? []));
}

function validatePacket(packet) {
  const failures = [];

  if (!packet.taskId) {
    failures.push(["task_id", "missing or empty"]);
  } else if (!/^T-\S+$/.test(packet.taskId)) {
    failures.push(["task_id", "must match /^T-\\S+$/"]);
  }

  if (!packet.taskName) {
    failures.push(["task_name", "missing or empty"]);
  }

  if (!packet.phase) {
    failures.push(["phase", "missing or empty"]);
  } else if (!VALID_PHASES.has(packet.phase)) {
    failures.push(["phase", "must be one of Phase 0 through Phase 12, or Phase N/A"]);
  }

  if (!packet.workflow) {
    failures.push(["workflow", "missing or empty"]);
  } else if (packet.workflow === "N/A") {
    if (packet.phase !== "Phase N/A" && VALID_PHASES.has(packet.phase)) {
      failures.push(["workflow", "must start with Workflow A through Workflow L when phase is numbered"]);
    }
  } else if (!/^Workflow [A-L](?:\b| .*)/.test(packet.workflow)) {
    failures.push(["workflow", "must start with Workflow A through Workflow L when phase is numbered"]);
  } else if (packet.phase === "Phase N/A") {
    failures.push(["workflow", "must be N/A when phase is Phase N/A"]);
  }

  if (!packet.riskLevel) {
    failures.push(["risk_level", "missing or empty"]);
  } else if (!VALID_RISK_LEVELS.has(packet.riskLevel)) {
    failures.push(["risk_level", "must be one of: CRITICAL, HIGH, MEDIUM, LOW"]);
  }

  if (!packet.actorSurfaceRaw) {
    failures.push(["actor_surface", "missing or empty"]);
  } else if (packet.actorSurface.length === 0) {
    failures.push(["actor_surface", "must include at least one checked item"]);
  } else {
    const invalidActorSurface = packet.actorSurface.filter((value) => !VALID_ACTOR_SURFACES.has(value));
    if (invalidActorSurface.length > 0) {
      failures.push(["actor_surface", `contains invalid value(s): ${invalidActorSurface.join(", ")}`]);
    }
  }

  if (!packet.allowedFilesRaw) {
    failures.push(["allowed_files", "missing or empty"]);
  } else if (packet.allowedFiles.length === 0) {
    failures.push(["allowed_files", "must contain at least one file path"]);
  }

  if (!packet.forbiddenFilesRaw) {
    failures.push(["forbidden_files", "missing or empty"]);
  } else if (packet.forbiddenFiles.length === 0) {
    failures.push(["forbidden_files", "must contain at least one file path or pattern"]);
  }

  if (!packet.requiredBehavior) {
    failures.push(["required_behavior", "missing or empty"]);
  }

  if (!packet.forbiddenBehavior) {
    failures.push(["forbidden_behavior", "missing or empty"]);
  }

  if (!packet.validationCommandsRaw) {
    failures.push(["validation_commands", "missing or empty"]);
  } else if (packet.validationCommands.length === 0) {
    failures.push(["validation_commands", "must contain at least one shell command"]);
  }

  if (!packet.stopRule) {
    failures.push(["stop_rule", "missing or empty"]);
  }

  if (!packet.returnFormat) {
    failures.push(["return_format", "missing or empty"]);
  }

  return failures;
}

function renderValidationFailures(failures) {
  const lines = ["Validation failed:"];
  for (const [field, reason] of failures) {
    lines.push(`- ${field}: ${reason}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildExecutorPrompt(packet) {
  return [
    "Read the task packet below and execute it exactly.",
    "",
    `task_id: ${packet.taskId}`,
    `task_name: ${packet.taskName}`,
    "",
    "ALLOWED FILES (touch only these):",
    ...packet.allowedFiles.map((file) => `- ${file}`),
    "",
    "FORBIDDEN FILES (do not touch):",
    ...packet.forbiddenFiles.map((file) => `- ${file}`),
    "",
    "REQUIRED BEHAVIOR:",
    packet.requiredBehavior,
    "",
    "FORBIDDEN BEHAVIOR:",
    packet.forbiddenBehavior,
    "",
    "VALIDATION COMMANDS (run in order, return exact output):",
    packet.validationCommandsRaw,
    "",
    "STOP RULE:",
    packet.stopRule,
    "",
    "RETURN FORMAT:",
    packet.returnFormat,
    "",
    "KNOWN CONTRADICTIONS:",
    packet.knownContradictionsRaw || "None relevant",
  ].join("\n");
}

function buildFallbackPacket(packet) {
  return [
    "---",
    "TASK PACKET",
    "",
    `task_id:        ${packet.taskId}`,
    `task_name:      ${packet.taskName}`,
    `phase:          ${packet.phase}`,
    `workflow:       ${packet.workflow}`,
    `risk_level:     ${packet.riskLevel}`,
    `actor_surface:  ${packet.actorSurface.join(" | ")}`,
    "",
    "---",
    "",
    "ALLOWED FILES (touch only these):",
    ...packet.allowedFiles.map((file) => `- ${file}`),
    "",
    "FORBIDDEN FILES (do not touch):",
    ...packet.forbiddenFiles.map((file) => `- ${file}`),
    "",
    "REQUIRED BEHAVIOR:",
    packet.requiredBehavior,
    "",
    "FORBIDDEN BEHAVIOR:",
    packet.forbiddenBehavior,
    "",
    "VALIDATION COMMANDS (run in order, return exact output):",
    packet.validationCommandsRaw,
    "",
    "STOP RULE:",
    packet.stopRule,
    "",
    "KNOWN CONTRADICTIONS:",
    packet.knownContradictionsRaw || "None relevant",
    "",
    `DOCS MAY CHANGE: ${packet.docsMayChange}`,
    `LEDGER UPDATE REQUIRED: ${packet.ledgerUpdateRequired.raw}`,
    "",
    `RETURN FORMAT: ${packet.returnFormat}`,
    "",
    "NOTES:",
    packet.notes,
    "---",
  ].join("\n");
}

function buildPrBodyDraft(packet, template) {
  let output = template;

  output = replaceExact(
    output,
    "<!-- SENTINEL:task_id=REPLACE_TASK_ID -->",
    `<!-- SENTINEL:task_id=${packet.taskId} -->`,
    "task_id anchor"
  );
  output = replaceExact(
    output,
    "<!-- SENTINEL:risk=REPLACE_RISK -->",
    `<!-- SENTINEL:risk=${packet.riskLevel} -->`,
    "risk anchor"
  );

  if (packet.ledgerUpdateRequired.isTrue) {
    output = replaceExact(output, "<!-- SENTINEL:ledger=NONE -->", "<!-- SENTINEL:ledger=AFFECTED -->", "ledger anchor");
  }

  output = replaceExact(
    output,
    "- Task ID: <!-- e.g. T-02-C1-assert-business-active -->",
    `- Task ID: ${packet.taskId}`,
    "task reference task_id"
  );
  output = replaceExact(output, "- Phase: <!-- Phase N -->", `- Phase: ${packet.phase}`, "task reference phase");
  output = replaceExact(
    output,
    "- Workflow: <!-- Workflow X \u2014 name -->",
    `- Workflow: ${packet.workflow}`,
    "task reference workflow"
  );
  output = replaceExact(
    output,
    "- Risk level: <!-- CRITICAL | HIGH | MEDIUM | LOW (per docs/SNAPSLOT_RISK_POLICY.md) -->",
    `- Risk level: ${packet.riskLevel}`,
    "task reference risk"
  );

  const filesMatch = output.match(
    /(<!-- SENTINEL:FILES_BEGIN -->)(\r?\n)- <!-- list each file changed, added, or deleted -->(\r?\n)(<!-- SENTINEL:FILES_END -->)/
  );

  if (!filesMatch) {
    throw new Error(".github/pull_request_template.md is missing the files placeholder block.");
  }

  const newline = filesMatch[2];
  const replacementLines = packet.allowedFiles.map((file) => `- ${file}`).join(newline);
  output = output.replace(
    /(<!-- SENTINEL:FILES_BEGIN -->)(\r?\n)- <!-- list each file changed, added, or deleted -->(\r?\n)(<!-- SENTINEL:FILES_END -->)/,
    `$1$2${replacementLines}$3$4`
  );

  return output;
}

function replaceExact(source, searchValue, replacement, label) {
  if (!source.includes(searchValue)) {
    throw new Error(`.github/pull_request_template.md is missing the ${label} placeholder.`);
  }
  return source.replace(searchValue, replacement);
}

function buildProofSkeleton(validationCommands) {
  const extraBlocks = validationCommands.slice(2).map((command) => [`**${command}**:`, "    [paste exact output here]"].join("\n"));

  return [
    "**TypeScript typecheck** (`npx tsc --noEmit`):",
    "    [paste exact output here]",
    "",
    "**Test suite** (`npm test`):",
    "    [paste exact output here]",
    ...(extraBlocks.length > 0 ? ["", ...extraBlocks] : []),
  ].join("\n");
}

function buildCleanupChecklist() {
  return [
    "[ ] No files touched outside the declared allowed_files list",
    "[ ] No deferred features exposed (no_show, partially_refunded,",
    "    staff roles, customer accounts, analytics, add-ons)",
    "[ ] No silent behavior changes",
    "[ ] No fake completion claims",
    "[ ] Scope matches the compiled packet exactly",
    "[ ] git status --short is clean (no unstaged or untracked files",
    "    outside the allowed list)",
    "[ ] Branch is ahead of origin/main with no divergence",
    "[ ] Validation output is exact output, not paraphrased",
  ].join("\n");
}

function buildPostMergeChecklist(issueNumber, packet) {
  const ledgerRows = packet.ledgerUpdateRequired.isTrue
    ? packet.ledgerUpdateRequired.detail || packet.ledgerUpdateRequired.raw
    : "None";
  const contradictionIds = packet.knownContradictionIds.length > 0 ? packet.knownContradictionIds.join(", ") : "None";

  return [
    `[ ] Close source GitHub Issue #${issueNumber}`,
    "[ ] Update ops/TASK_STATE.json if this task advances phase state",
    "[ ] Update docs/SNAPSLOT_ACCEPTANCE_LEDGER.md rows:",
    ...indentBlock(ledgerRows, 4),
    "[ ] Verify docs/SNAPSLOT_CONTRADICTION_LOG.md entries:",
    ...indentBlock(contradictionIds, 4),
    "[ ] Confirm SENTINEL-PASS on the merged PR",
    "[ ] If CRITICAL or HIGH: confirm ops/GOVERNOR_APPROVAL.json has been",
    "    reset to verdict: NONE after merge",
  ].join("\n");
}

function buildSection(number, title, body) {
  return [SECTION_DIVIDER, `SECTION ${number}  ${title}`, SECTION_DIVIDER, body].join("\n");
}

function indentBlock(text, spaces) {
  const prefix = " ".repeat(spaces);
  return text.split(/\r?\n/).map((line) => `${prefix}${line}`);
}

function trimField(value) {
  return (value ?? "").trim();
}

function trimOptionalField(value) {
  return (value ?? "").trim();
}

function writeStdout(text) {
  process.stdout.write(text);
}

function writeStderr(text) {
  process.stderr.write(text);
}
