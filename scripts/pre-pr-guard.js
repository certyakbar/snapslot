#!/usr/bin/env node

import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SECTION_DIVIDER = "============================================================";
const EXCLUDED_SCOPE_FILE = "ops/GOVERNOR_APPROVAL.json";
const GIT_STATUS_COMMAND = "git status --short";
const AHEAD_COMMAND = "git rev-list --count origin/main..HEAD";
const BEHIND_COMMAND = "git rev-list --count HEAD..origin/main";
const DIFF_COMMAND = "git diff --name-only origin/main...HEAD";
const USAGE = [
  "Usage: node scripts/pre-pr-guard.js <ISSUE_NUMBER>",
  "       node scripts/pre-pr-guard.js --help",
].join("\n");

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

  const packet = fetchAndParseIssue(issueNumber);
  const guardResults = [
    runRepoDirtyGuard(packet.allowedFiles),
    runBranchPositionGuard(),
    runScopeVsDiffGuard(packet.allowedFiles),
  ];
  const proofResults = runProofCapture(packet.validationCommands);
  const failedItems = collectFailedItems(guardResults, proofResults);

  const sections = [
    buildSection(1, "GUARD RESULTS", buildGuardResults(packet.taskId, guardResults)),
    buildSection(2, "PROOF CAPTURE", buildProofCaptureSection(proofResults)),
    buildSection(3, "OVERALL VERDICT", buildOverallVerdict(failedItems)),
  ];

  writeStdout(`${sections.join("\n\n")}\n`);
  process.exit(failedItems.length === 0 ? 0 : 1);
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

function fetchAndParseIssue(issueNumber) {
  const result = spawnSync("gh", ["issue", "view", issueNumber, "--json", "title,body"], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (result.error && result.error.code === "ENOENT") {
    writeStderr("Error: gh CLI not found. Install GitHub CLI and authenticate before running this script.\n");
    process.exit(1);
  }

  if (result.error || result.status !== 0) {
    writeStderr("Error: gh issue view failed or returned invalid JSON.\n");
    process.exit(1);
  }

  let issue;

  try {
    issue = JSON.parse(result.stdout);
  } catch {
    writeStderr("Error: gh issue view failed or returned invalid JSON.\n");
    process.exit(1);
  }

  const fields = extractFields(issue.body ?? "");
  const allowedFiles = parseListItems(fields.allowed_files ?? "").map(normalizePath);
  const validationCommands = parseValidationCommands(fields.validation_commands ?? "");

  if (allowedFiles.length === 0) {
    writeStderr("Error: allowed_files is empty after parsing.\n");
    process.exit(1);
  }

  if (validationCommands.length === 0) {
    writeStderr("Error: validation_commands is empty after parsing.\n");
    process.exit(1);
  }

  return {
    taskId: trimField(fields.task_id) || "(missing task_id)",
    allowedFiles,
    validationCommands,
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

function runRepoDirtyGuard(allowedFiles) {
  const result = runRequiredCommand("git", ["status", "--short"], `Error: ${GIT_STATUS_COMMAND} failed.\n`);
  const rawOutput = trimTrailingNewlines(result.stdout ?? "");
  const lines = splitLines(rawOutput);

  if (lines.length === 0) {
    return {
      label: "G1  Repo dirty",
      status: "WARN",
      evidence: "git status output is empty; no local changes detected",
      failureLabel: "",
    };
  }

  const allowedSet = new Set(filterExcludedPaths(allowedFiles));
  const filenames = filterExcludedPaths(lines.map(parseStatusFilename).filter(Boolean));
  const offendingFiles = filenames.filter((filename) => !allowedSet.has(filename));

  if (offendingFiles.length > 0) {
    return {
      label: "G1  Repo dirty",
      status: "FAIL",
      evidence: offendingFiles.join(", "),
      failureLabel: `G1 Repo dirty: ${offendingFiles.join(", ")}`,
    };
  }

  return {
    label: "G1  Repo dirty",
    status: "PASS",
    evidence: rawOutput,
    failureLabel: "",
  };
}

function runBranchPositionGuard() {
  const ahead = parseCount(
    runRequiredCommand("git", ["rev-list", "--count", "origin/main..HEAD"], `Error: ${AHEAD_COMMAND} failed.\n`).stdout,
    AHEAD_COMMAND
  );
  const behind = parseCount(
    runRequiredCommand("git", ["rev-list", "--count", "HEAD..origin/main"], `Error: ${BEHIND_COMMAND} failed.\n`).stdout,
    BEHIND_COMMAND
  );
  const reasons = [];

  if (ahead === 0) {
    reasons.push("no commits ahead of origin/main; confirm correct branch");
  }

  if (behind > 0) {
    reasons.push(`branch is ${behind} commit(s) behind origin/main; rebase required`);
  }

  return {
    label: "G2  Branch position",
    status: reasons.length === 0 ? "PASS" : "FAIL",
    evidence: `ahead: ${ahead}, behind: ${behind}`,
    failureLabel: reasons.length === 0 ? "" : `G2 Branch position: ${reasons.join("; ")}`,
  };
}

function runScopeVsDiffGuard(allowedFiles) {
  const result = runRequiredCommand("git", ["diff", "--name-only", "origin/main...HEAD"], `Error: ${DIFF_COMMAND} failed.\n`);
  const declaredSet = new Set(filterExcludedPaths(allowedFiles));
  const actualSet = new Set(filterExcludedPaths(splitLines(result.stdout ?? "").map(normalizePath).filter(Boolean)));
  const scopeDrift = Array.from(actualSet).filter((filename) => !declaredSet.has(filename)).sort();
  const phantomScope = Array.from(declaredSet).filter((filename) => !actualSet.has(filename)).sort();
  const evidence = [
    `scope_drift: ${scopeDrift.length > 0 ? scopeDrift.join(", ") : "none"}`,
    `phantom_scope: ${phantomScope.length > 0 ? phantomScope.join(", ") : "none"}`,
  ].join("; ");
  const failures = [];

  if (scopeDrift.length > 0) {
    failures.push(`scope_drift: ${scopeDrift.join(", ")}`);
  }

  if (phantomScope.length > 0) {
    failures.push(`phantom_scope: ${phantomScope.join(", ")}`);
  }

  return {
    label: "G3  Scope vs diff",
    status: failures.length === 0 ? "PASS" : "FAIL",
    evidence,
    failureLabel: failures.length === 0 ? "" : `G3 Scope vs diff: ${failures.join("; ")}`,
  };
}

function runRequiredCommand(command, args, errorMessage) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    writeStderr(errorMessage);
    process.exit(1);
  }

  return result;
}

function parseCount(output, commandLabel) {
  const text = trimField(output);

  if (!/^\d+$/.test(text)) {
    writeStderr(`Error: ${commandLabel} returned an invalid count.\n`);
    process.exit(1);
  }

  return Number.parseInt(text, 10);
}

function runProofCapture(validationCommands) {
  return validationCommands.map((command, index) => runValidationCommand(command, index + 1));
}

function runValidationCommand(command, index) {
  const result = spawnSync(command, {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const exitCode = Number.isInteger(result.status) ? result.status : 1;

  return {
    index,
    command,
    exitCode,
    status: exitCode === 0 ? "PASS" : "FAIL",
    output,
  };
}

function collectFailedItems(guardResults, proofResults) {
  const failedGuards = guardResults.filter((guard) => guard.status === "FAIL").map((guard) => guard.failureLabel);
  const failedCommands = proofResults
    .filter((proof) => proof.status === "FAIL")
    .map((proof) => `Command ${proof.index}: ${proof.command}`);

  return [...failedGuards, ...failedCommands];
}

function buildGuardResults(taskId, guardResults) {
  const lines = [
    `PRE-PR GUARD  task ${taskId}`,
    "",
    "Guard | Status | Evidence",
    "Guard | ------ | --------",
  ];

  for (const guard of guardResults) {
    lines.push(`${guard.label} | ${guard.status} | ${formatRowEvidence(guard.evidence)}`);
  }

  return lines.join("\n");
}

function buildProofCaptureSection(proofResults) {
  return proofResults
    .map((proof) =>
      [
        `Command ${proof.index}: ${proof.command}`,
        `Exit: ${proof.exitCode}  ${proof.status}`,
        "[paste this block into the PR body proof section for this command]",
        buildOutputFence(proof.output),
      ].join("\n")
    )
    .join("\n\n");
}

function buildOverallVerdict(failedItems) {
  if (failedItems.length === 0) {
    return "OVERALL: PASS  ready to open PR. Paste Section 2 into the PR body.";
  }

  return [
    `OVERALL: FAIL  ${failedItems.length} issue(s) require resolution before opening PR.`,
    ...failedItems.map((item) => `- ${item}`),
  ].join("\n");
}

function buildSection(number, title, body) {
  return [SECTION_DIVIDER, `SECTION ${number}  ${title}`, SECTION_DIVIDER, body].join("\n");
}

function buildOutputFence(output) {
  if (output.length === 0) {
    return "```text\n```";
  }

  return `\`\`\`text\n${output}${output.endsWith("\n") ? "" : "\n"}\`\`\``;
}

function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function parseStatusFilename(line) {
  const pathText = line.slice(3).trim();
  const destination = pathText.includes(" -> ") ? pathText.split(" -> ").pop() : pathText;
  return normalizePath(destination ?? "");
}

function filterExcludedPaths(paths) {
  return paths.filter((path) => path && path !== EXCLUDED_SCOPE_FILE);
}

function normalizePath(value) {
  return trimField(value).replace(/^"(.*)"$/, "$1").replace(/\\/g, "/");
}

function formatRowEvidence(value) {
  return value.replace(/\r?\n/g, " <br> ");
}

function trimField(value) {
  return (value ?? "").trim();
}

function trimTrailingNewlines(value) {
  return value.replace(/[\r\n]+$/, "");
}

function writeStdout(text) {
  process.stdout.write(text);
}

function writeStderr(text) {
  process.stderr.write(text);
}
