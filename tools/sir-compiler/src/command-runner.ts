import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  findCommandEntry,
  loadCommandRegistry,
  repoRoot
} from "./command-registry.js";
import { validateCommandObject } from "./semantic-validator.js";
import type { CommandExecutionResult, CommandObject } from "./types.js";

const execFileAsync = promisify(execFile);

function confinedEnv(allowlist: string[]): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  for (const key of allowlist) {
    if (key === "PATH" && process.env.PATH) {
      env.PATH = process.env.PATH;
    }
  }

  return env;
}

export async function runRegistryCommand(command: CommandObject): Promise<CommandExecutionResult> {
  const registry = loadCommandRegistry();
  const validation = validateCommandObject(command, registry);
  if (!validation.valid) {
    throw new Error(`command rejected: ${validation.errors.join("; ")}`);
  }

  const entry = findCommandEntry(registry, command.id);
  if (!entry) {
    throw new Error(`command missing after validation: ${command.id}`);
  }

  try {
    const result = await execFileAsync(entry.program, command.argv, {
      cwd: repoRoot,
      shell: false,
      timeout: command.timeout_ms ?? entry.timeout_ms,
      maxBuffer: entry.max_buffer_bytes,
      env: confinedEnv(registry.defaults.env_allowlist)
    });

    return {
      command,
      exit_code: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      timed_out: false
    };
  } catch (error) {
    const execError = error as {
      code?: number;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
    };

    return {
      command,
      exit_code: typeof execError.code === "number" ? execError.code : null,
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      timed_out: execError.killed === true
    };
  }
}
