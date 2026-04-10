#!/usr/bin/env node

import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SECTION_DIVIDER = "============================================================";
const USAGE = [
  "Usage: node scripts/open-pr.js <ISSUE_NUMBER>",
  "       node scripts/open-pr.js --help",
].join("\n");
const SECTION_1_TITLE = "EXECUTOR PROMPT";
const SECTION_2_FALLBACK_TITLE = "FALLBACK PACKET";
const SECTION_2_TITLE = "PROOF CAPTURE";
const SECTION_3_TITLE = "PR BODY DRAFT";
const TYPECHECK_HEADING = "**TypeScript typecheck** (`npx tsc --noEmit`):";
const TEST_HEADING = "**Test suite** (`npm test`):";
const TYPECHECK_PLACEHOLDER = "<!-- paste exact output \u2014 not paraphrased -->";
const TEST_PLACEHOLDER = "<!-- paste exact output \u2014 not paraphrased. Show all suite results. -->";
const SCOPE_HEADING = "## Scope declaration";
const REQUIRED_BEHAVIOR_HEADING = "## Required behavior";
const FORBIDDEN_BEHAVIOR_HEADING = "## Forbidden behavior confirmation";
const VALIDATION_PROOF_HEADING = "## Validation proof";
const BLOCKING_CONDITIONS_HEADING = "## Blocking conditions";
const FORBIDDEN_BEHAVIOR_CHECKLIST = [
  "- [x] No unrelated edits (no opportunistic cleanup, refactor, or churn)",
  "- [x] No deferred feature exposure (no_show, partially_refunded, staff roles, customer accounts)",
  "- [x] No fake completion claim (no PASS without proof)",
  "- [x] No silent behavior change",
  "- [x] Scope matches task packet exactly",
];
const BLOCKING_CONDITIONS_CHECKLIST = [
  "- [x] Typecheck passes",
  "- [x] All tests pass",
  "- [x] Scope is clean \u2014 no files touched outside task packet",
  "- [x] Ledger rows updated honestly",
  "- [x] No contradiction silently patched",
  "- [x] Risk level declared correctly per docs/SNAPSLOT_RISK_POLICY.md",
  "- [x] Proof is exact output, not paraphrased",
];

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

  const compileTaskResult = spawnSync("node", ["scripts/compile-task.js", issueNumber], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (compileTaskResult.status !== 0 || compileTaskResult.error) {
    if (compileTaskResult.stderr) {
      writeStderr(compileTaskResult.stderr);
    }
    writeStderr("Error: compile-task failed. Resolve validation errors before opening a PR.\n");
    process.exit(1);
  }

  let prBodyDraft;
  let compiledPacket;

  try {
    prBodyDraft = extractSection(compileTaskResult.stdout ?? "", 3, SECTION_3_TITLE, "compile-task output");
    compiledPacket = parseCompiledPacket(compileTaskResult.stdout ?? "");
  } catch (error) {
    writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  let taskMetadata;

  try {
    taskMetadata = parseTaskMetadataFromCompileOutput(compileTaskResult.stdout ?? "");
  } catch {
    try {
      taskMetadata = fetchIssueTaskMetadata(issueNumber);
    } catch (error) {
      writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  }

  const prePrGuardResult = spawnSync("node", ["scripts/pre-pr-guard.js", issueNumber], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (prePrGuardResult.status !== 0 || prePrGuardResult.error) {
    if (prePrGuardResult.stdout) {
      writeStdout(prePrGuardResult.stdout);
    }
    writeStderr("GUARD FAILED \u2014 do not open PR. Resolve all guard failures before retrying.\n");
    process.exit(1);
  }

  let proofSection;

  try {
    proofSection = extractSection(prePrGuardResult.stdout ?? "", 2, SECTION_2_TITLE, "pre-pr-guard output");
  } catch (error) {
    writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  let assembledBody;

  try {
    const proofEntries = parseProofEntries(proofSection);
    assembledBody = assemblePrBody(prBodyDraft, compiledPacket, proofEntries);
  } catch (error) {
    writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const prTitle = buildPrTitle(taskMetadata.taskId, taskMetadata.taskName);
  const prCreateResult = spawnSync("gh", ["pr", "create", "--title", prTitle, "--body", assembledBody], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (prCreateResult.error && prCreateResult.error.code === "ENOENT") {
    writeStderr("Error: gh CLI not found. Install GitHub CLI and authenticate before running this script.\n");
    process.exit(1);
  }

  if (prCreateResult.stdout) {
    writeStdout(prCreateResult.stdout);
  }

  if (prCreateResult.status !== 0 || prCreateResult.error) {
    if (prCreateResult.stderr) {
      writeStderr(prCreateResult.stderr);
    }
    process.exit(1);
  }
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

function extractSection(output, sectionNumber, title, sourceLabel) {
  const pattern = new RegExp(
    `${escapeRegExp(SECTION_DIVIDER)}\\r?\\nSECTION ${sectionNumber}  ${escapeRegExp(title)}\\r?\\n${escapeRegExp(
      SECTION_DIVIDER
    )}\\r?\\n([\\s\\S]*?)(?=\\r?\\n${escapeRegExp(SECTION_DIVIDER)}\\r?\\nSECTION \\d+  |$)`
  );
  const match = output.match(pattern);

  if (!match) {
    throw new Error(`Error: failed to parse SECTION ${sectionNumber}  ${title} from ${sourceLabel}.`);
  }

  return match[1];
}

function parseTaskMetadataFromCompileOutput(output) {
  const section = extractSection(output, 1, SECTION_1_TITLE, "compile-task output");
  const taskIdMatch = section.match(/^task_id:\s*(.+)$/m);
  const taskNameMatch = section.match(/^task_name:\s*(.+)$/m);

  if (!taskIdMatch || !taskNameMatch) {
    throw new Error("Error: failed to parse task metadata from compile-task output.");
  }

  return {
    taskId: taskIdMatch[1].trim(),
    taskName: taskNameMatch[1].trim(),
  };
}

function parseCompiledPacket(output) {
  const section = extractSection(output, 2, SECTION_2_FALLBACK_TITLE, "compile-task output");

  return {
    allowedFiles: parseBulletList(extractLabeledBlock(section, "ALLOWED FILES (touch only these):", "FORBIDDEN FILES (do not touch):")),
    forbiddenFiles: parseBulletList(extractLabeledBlock(section, "FORBIDDEN FILES (do not touch):", "REQUIRED BEHAVIOR:")),
    requiredBehavior: extractLabeledBlock(section, "REQUIRED BEHAVIOR:", "FORBIDDEN BEHAVIOR:"),
  };
}

function fetchIssueTaskMetadata(issueNumber) {
  const result = spawnSync("gh", ["issue", "view", issueNumber, "--json", "title,body"], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (result.error && result.error.code === "ENOENT") {
    throw new Error("Error: gh CLI not found. Install GitHub CLI and authenticate before running this script.");
  }

  if (result.error || result.status !== 0) {
    throw new Error("Error: gh issue view failed. Ensure GitHub CLI is installed, authenticated, and the issue number is valid.");
  }

  let issue;

  try {
    issue = JSON.parse(result.stdout);
  } catch {
    throw new Error("Error: gh issue view returned invalid JSON.");
  }

  const taskId = extractIssueField(issue.body ?? "", "task_id");
  const taskName = extractIssueField(issue.body ?? "", "task_name");

  if (!taskId) {
    throw new Error("Error: failed to parse task_id from issue body.");
  }

  if (!taskName) {
    throw new Error("Error: failed to parse task_name from issue body.");
  }

  return {
    taskId,
    taskName,
  };
}

function extractIssueField(body, fieldName) {
  const pattern = new RegExp(`^###\\s+${escapeRegExp(fieldName)}\\s*$\\r?\\n([\\s\\S]*?)(?=^###\\s+|$)`, "m");
  const match = body.match(pattern);
  return match ? match[1].trim() : "";
}

function extractLabeledBlock(sectionBody, startLabel, endLabel) {
  const pattern = new RegExp(
    `^${escapeRegExp(startLabel)}\\r?\\n([\\s\\S]*?)(?=^${escapeRegExp(endLabel)}\\r?$)`,
    "m"
  );
  const match = sectionBody.match(pattern);

  if (!match) {
    throw new Error(`Error: failed to parse ${startLabel} from SECTION 2  FALLBACK PACKET.`);
  }

  return match[1].trim();
}

function parseBulletList(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim());
}

function parseProofEntries(sectionBody) {
  const entryPattern =
    /Command (\d+): ([^\r\n]+)\r?\n(Exit: \d+  (?:PASS|FAIL))\r?\n\[paste this block into the PR body proof section for this command\]\r?\n(```text[\s\S]*?```)(?=\r?\n\r?\nCommand \d+:|(?:\r?\n)*$)/g;
  const entries = [];
  let match = entryPattern.exec(sectionBody);

  while (match) {
    entries.push({
      index: Number.parseInt(match[1], 10),
      command: match[2],
      exitLine: match[3],
      fence: match[4],
    });
    match = entryPattern.exec(sectionBody);
  }

  if (entries.length === 0) {
    throw new Error("Error: failed to parse proof blocks from SECTION 2  PROOF CAPTURE.");
  }

  return entries.sort((left, right) => left.index - right.index);
}

function assemblePrBody(prBodyDraft, compiledPacket, proofEntries) {
  const newline = detectNewline(prBodyDraft);
  ensurePlaceholder(prBodyDraft, TYPECHECK_PLACEHOLDER);
  ensurePlaceholder(prBodyDraft, TEST_PLACEHOLDER);

  let output = replaceSectionBody(prBodyDraft, SCOPE_HEADING, buildScopeSection(compiledPacket, newline));
  output = replaceSectionBody(output, REQUIRED_BEHAVIOR_HEADING, compiledPacket.requiredBehavior);
  output = replaceSectionBody(output, FORBIDDEN_BEHAVIOR_HEADING, FORBIDDEN_BEHAVIOR_CHECKLIST.join(newline));
  output = replaceSectionBody(output, VALIDATION_PROOF_HEADING, buildValidationProofSection(proofEntries, newline));
  output = replaceSectionBody(output, BLOCKING_CONDITIONS_HEADING, BLOCKING_CONDITIONS_CHECKLIST.join(newline));
  return output;
}

function ensurePlaceholder(body, placeholder) {
  if (!body.includes(placeholder)) {
    throw new Error(`Error: missing placeholder ${placeholder}.`);
  }
}

function replaceSectionBody(body, heading, replacement) {
  const pattern = new RegExp(`(${escapeRegExp(heading)}\\r?\\n\\r?\\n)([\\s\\S]*?)(\\r?\\n\\r?\\n---)`);
  const match = body.match(pattern);

  if (!match) {
    throw new Error(`Error: missing section ${heading}.`);
  }

  return body.replace(pattern, (_, prefix, _existingBody, suffix) => `${prefix}${replacement}${suffix}`);
}

function buildScopeSection(compiledPacket, newline) {
  return [
    "**Files changed (exact list):**",
    "",
    "<!-- SENTINEL:FILES_BEGIN -->",
    ...compiledPacket.allowedFiles.map((file) => `- ${file}`),
    "<!-- SENTINEL:FILES_END -->",
    "",
    "**Files explicitly not touched:**",
    "",
    ...compiledPacket.forbiddenFiles.map((file) => `- ${file}`),
  ].join(newline);
}

function buildValidationProofSection(proofEntries, newline) {
  const typecheckProof = proofEntries.find((entry) => entry.index === 1);
  const testProof = proofEntries.find((entry) => entry.index === 2);

  if (!typecheckProof) {
    throw new Error("Error: failed to parse Command 1 proof block from SECTION 2  PROOF CAPTURE.");
  }

  if (!testProof) {
    throw new Error("Error: failed to parse Command 2 proof block from SECTION 2  PROOF CAPTURE.");
  }

  const extraProofBlocks = proofEntries
    .filter((entry) => entry.index >= 3)
    .map((entry) => [`**${entry.command}**:`, "", entry.exitLine, entry.fence].join(newline))
    .join(`${newline}${newline}`);

  return [
    TYPECHECK_HEADING,
    "",
    typecheckProof.exitLine,
    typecheckProof.fence,
    "",
    TEST_HEADING,
    "",
    testProof.exitLine,
    testProof.fence,
    ...(extraProofBlocks.length > 0 ? ["", extraProofBlocks] : []),
  ].join(newline);
}

function buildPrTitle(taskId, taskName) {
  const fullTitle = `${taskId}: ${taskName}`;

  if (fullTitle.length <= 72) {
    return fullTitle;
  }

  const prefix = `${taskId}: `;
  const availableTaskNameLength = 72 - prefix.length - 1;

  if (availableTaskNameLength <= 0) {
    return `${fullTitle.slice(0, 71)}\u2026`;
  }

  return `${prefix}${taskName.slice(0, availableTaskNameLength)}\u2026`;
}

function detectNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeStdout(text) {
  process.stdout.write(text);
}

function writeStderr(text) {
  process.stderr.write(text);
}
