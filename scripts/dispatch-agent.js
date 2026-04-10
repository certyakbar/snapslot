#!/usr/bin/env node

import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SECTION_DIVIDER = "============================================================";
const SECTION_1_TITLE = "EXECUTOR PROMPT";
const COPILOT_LOGIN = "copilot-swe-agent";
const COPILOT_ASSIGNEE = "copilot-swe-agent[bot]";
const TARGET_REPO = "certyakbar/snapslot";
const BASE_BRANCH = "main";
const MODEL = "gpt-5.2-codex";
const CUSTOM_INSTRUCTIONS =
  "You are Codex, the execution agent for the SnapSlot repository. Read AGENTS.md before taking any action. Execute only the scoped task defined in this issue. Touch only the files listed in allowed_files. Do not modify docs, governance files, or any files outside allowed_files. Run npx tsc --noEmit and npm test after implementation. Return exact outputs, not paraphrases. Do not self-commit or self-approve. If scope is unclear, stop and report.";
const GRAPHQL_QUERY =
  '{ repository(owner: "certyakbar", name: "snapslot") { suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 20) { nodes { login } } } }';
const USAGE = [
  "Usage: node scripts/dispatch-agent.js <ISSUE_NUMBER>",
  "       node scripts/dispatch-agent.js --help",
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

  const compileTaskResult = spawnSync("node", ["scripts/compile-task.js", issueNumber], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (compileTaskResult.status !== 0 || compileTaskResult.error) {
    if (compileTaskResult.stderr) {
      writeStderr(compileTaskResult.stderr);
    }
    writeStderr("Error: compile-task failed. Resolve validation errors before dispatching.\n");
    process.exit(1);
  }

  let taskId;

  try {
    taskId = parseTaskIdFromCompileOutput(compileTaskResult.stdout ?? "");
  } catch (error) {
    writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const copilotPreflightResult = spawnSync(
    "gh",
    ["api", "graphql", "-f", `query=${GRAPHQL_QUERY}`],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: false,
    }
  );

  if (copilotPreflightResult.error || copilotPreflightResult.status !== 0) {
    writeGhFailure(copilotPreflightResult, "Error: gh api graphql failed.");
    process.exit(1);
  }

  let copilotAvailable;

  try {
    copilotAvailable = hasSuggestedActor(copilotPreflightResult.stdout ?? "", COPILOT_LOGIN);
  } catch (error) {
    writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  if (!copilotAvailable) {
    writeStderr(
      "Error: copilot-swe-agent is not available as a suggested actor on this repository. Ensure GitHub Copilot coding agent is enabled.\n"
    );
    process.exit(1);
  }

  const issueViewResult = spawnSync("gh", ["issue", "view", issueNumber, "--json", "state"], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (issueViewResult.error || issueViewResult.status !== 0) {
    writeGhFailure(issueViewResult, "Error: gh issue view failed.");
    process.exit(1);
  }

  let state;

  try {
    state = parseIssueState(issueViewResult.stdout ?? "");
  } catch (error) {
    writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  if (state !== "OPEN") {
    writeStderr(`Error: issue ${issueNumber} is not open. Cannot assign a closed or merged issue.\n`);
    process.exit(1);
  }

  const requestBody = JSON.stringify(
    {
      assignees: [COPILOT_ASSIGNEE],
      agent_assignment: {
        target_repo: TARGET_REPO,
        base_branch: BASE_BRANCH,
        custom_instructions: CUSTOM_INSTRUCTIONS,
        custom_agent: "",
        model: MODEL,
      },
    },
    null,
    2
  );
  const dispatchResult = spawnSync(
    "gh",
    [
      "api",
      "--method",
      "POST",
      `/repos/${TARGET_REPO}/issues/${issueNumber}/assignees`,
      "--header",
      "Accept: application/vnd.github+json",
      "--header",
      "X-GitHub-Api-Version: 2022-11-28",
      "--input",
      "-",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      input: requestBody,
      shell: false,
    }
  );

  if (dispatchResult.status !== 0 || dispatchResult.error) {
    const combinedOutput = `${dispatchResult.stdout ?? ""}${dispatchResult.stderr ?? ""}`;
    if (combinedOutput) {
      writeStderr(combinedOutput);
      if (!combinedOutput.endsWith("\n")) {
        writeStderr("\n");
      }
    }
    writeStderr("Error: GitHub agent assignment failed.\n");
    process.exit(1);
  }

  writeStdout(
    [
      "DISPATCH COMPLETE",
      `task_id: ${taskId}`,
      `issue: ${issueNumber}`,
      `assigned_to: ${COPILOT_ASSIGNEE}`,
      `model: ${MODEL}`,
      `base_branch: ${BASE_BRANCH}`,
      `target_repo: ${TARGET_REPO}`,
    ].join("\n") + "\n"
  );
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

function parseTaskIdFromCompileOutput(output) {
  const section = extractSection(output, 1, SECTION_1_TITLE, "compile-task output");
  const match = section.match(/^task_id:\s*(.+)$/m);

  if (!match) {
    throw new Error("Error: failed to parse task_id from SECTION 1  EXECUTOR PROMPT.");
  }

  return match[1].trim();
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

function hasSuggestedActor(rawJson, login) {
  let parsed;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Error: gh api graphql returned invalid JSON.");
  }

  const nodes = parsed?.data?.repository?.suggestedActors?.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error("Error: gh api graphql returned an unexpected response shape.");
  }

  return nodes.some((node) => node?.login === login);
}

function parseIssueState(rawJson) {
  let parsed;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Error: gh issue view returned invalid JSON.");
  }

  if (typeof parsed?.state !== "string") {
    throw new Error("Error: gh issue view returned an unexpected response shape.");
  }

  return parsed.state;
}

function writeGhFailure(result, fallbackMessage) {
  if (result.error && result.error.code === "ENOENT") {
    writeStderr("Error: gh CLI not found. Install GitHub CLI and authenticate before running this script.\n");
    return;
  }

  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (combinedOutput) {
    writeStderr(combinedOutput);
    if (!combinedOutput.endsWith("\n")) {
      writeStderr("\n");
    }
    return;
  }

  writeStderr(`${fallbackMessage}\n`);
}

function writeUsageError(message) {
  writeStderr(`${message}\n${USAGE}\n`);
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
