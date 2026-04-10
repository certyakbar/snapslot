import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "Usage: node scripts/dispatch-agent.js <issue-number>";
const TASK_ID_REGEX = /^task_id:\s*(.+)$/m;
const SECTION_HEADER_REGEX = /^SECTION 1\s+EXECUTOR PROMPT\s*$/m;
const NEXT_SECTION_REGEX = /^SECTION \d+\s+/m;

const writeStdout = (message) => {
  process.stdout.write(message);
};

const writeStderr = (message) => {
  process.stderr.write(message);
};

const writeUsageError = () => {
  writeStderr(`${USAGE}\n`);
};

const parseCliArgs = (argv) => {
  if (argv.length === 1 && argv[0] === "--help") {
    return { help: true };
  }

  if (argv.length !== 1) {
    return { error: true };
  }

  if (!/^[1-9]\d*$/.test(argv[0])) {
    return { error: true };
  }

  return { issueNumber: argv[0] };
};

const extractExecutorPromptSection = (output) => {
  const headerMatch = SECTION_HEADER_REGEX.exec(output);
  if (!headerMatch) {
    return null;
  }

  const sectionStart = headerMatch.index + headerMatch[0].length;
  const remainder = output.slice(sectionStart);
  const nextMatch = NEXT_SECTION_REGEX.exec(remainder);
  const sectionEnd = nextMatch ? sectionStart + nextMatch.index : output.length;

  return output.slice(sectionStart, sectionEnd);
};

const extractTaskId = (output) => {
  const section = extractExecutorPromptSection(output);
  if (!section) {
    return null;
  }
  const match = TASK_ID_REGEX.exec(section);
  if (!match) {
    return null;
  }
  return match[1].trim();
};

const main = () => {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed?.help) {
    writeStdout(`${USAGE}\n`);
    return;
  }

  if (parsed?.error || !parsed?.issueNumber) {
    writeUsageError();
    process.exit(1);
  }

  const issueNumber = parsed.issueNumber;
  const compileResult = spawnSync("node", ["scripts/compile-task.js", issueNumber], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (compileResult.error || compileResult.status !== 0) {
    if (compileResult.stderr) {
      writeStderr(compileResult.stderr);
    }
    writeStderr(
      "Error: compile-task failed. Resolve validation errors before dispatching.\n"
    );
    process.exit(1);
  }

  const taskId = extractTaskId(compileResult.stdout || "");
  if (!taskId) {
    writeStderr("Error: failed to extract task_id from compile-task output.\n");
    process.exit(1);
  }

  const suggestedActorsResult = spawnSync(
    "gh api graphql -f query='{ repository(owner: \"certyakbar\", name: \"snapslot\") { suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 20) { nodes { login } } } }'",
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
    }
  );

  if (suggestedActorsResult.error || suggestedActorsResult.status !== 0) {
    if (suggestedActorsResult.stderr) {
      writeStderr(suggestedActorsResult.stderr);
    }
    if (suggestedActorsResult.error) {
      writeStderr(`${suggestedActorsResult.error.message}\n`);
    }
    process.exit(1);
  }

  let suggestedActors;
  try {
    suggestedActors = JSON.parse(suggestedActorsResult.stdout);
  } catch (error) {
    writeStderr(`Error: failed to parse suggested actors response. ${error.message}\n`);
    process.exit(1);
  }

  const actorNodes = suggestedActors?.repository?.suggestedActors?.nodes;
  const hasCopilotActor =
    Array.isArray(actorNodes) &&
    actorNodes.some((node) => node?.login === "copilot-swe-agent");

  if (!hasCopilotActor) {
    writeStderr(
      "Error: copilot-swe-agent is not available as a suggested actor on this repository. Ensure GitHub Copilot coding agent is enabled.\n"
    );
    process.exit(1);
  }

  const issueStateResult = spawnSync(
    "gh",
    ["issue", "view", issueNumber, "--json", "state"],
    {
      cwd: ROOT,
      encoding: "utf8",
    }
  );

  if (issueStateResult.error || issueStateResult.status !== 0) {
    if (issueStateResult.stderr) {
      writeStderr(issueStateResult.stderr);
    }
    if (issueStateResult.error) {
      writeStderr(`${issueStateResult.error.message}\n`);
    }
    process.exit(1);
  }

  let issueStatePayload;
  try {
    issueStatePayload = JSON.parse(issueStateResult.stdout);
  } catch (error) {
    writeStderr(`Error: failed to parse issue state response. ${error.message}\n`);
    process.exit(1);
  }

  if (issueStatePayload?.state !== "OPEN") {
    writeStderr(
      "Error: issue  is not open. Cannot assign a closed or merged issue.\n"
    );
    process.exit(1);
  }

  const dispatchPayload = {
    assignees: ["copilot-swe-agent[bot]"],
    agent_assignment: {
      target_repo: "certyakbar/snapslot",
      base_branch: "main",
      custom_instructions: "",
      custom_agent: "",
      model: "gpt-5.2-codex",
    },
  };

  const dispatchResult = spawnSync(
    "gh",
    [
      "api",
      "--method",
      "POST",
      `/repos/certyakbar/snapslot/issues/${issueNumber}/assignees`,
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
      shell: true,
      input: JSON.stringify(dispatchPayload, null, 2),
    }
  );

  if (dispatchResult.error || dispatchResult.status !== 0) {
    if (dispatchResult.stdout) {
      writeStderr(dispatchResult.stdout);
    }
    if (dispatchResult.stderr) {
      writeStderr(dispatchResult.stderr);
    }
    writeStderr("Error: GitHub agent assignment failed.\n");
    process.exit(1);
  }

  writeStdout(`DISPATCH COMPLETE
task_id: ${taskId}
issue: ${issueNumber}
assigned_to: copilot-swe-agent[bot]
model: gpt-5.2-codex
base_branch: main
target_repo: certyakbar/snapslot
`);
};

main();
