import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runRegistryCommand } from "./command-runner.js";
import type { LocalLoopPacket } from "./types.js";

interface CliArgs {
  packet: string;
}

function parseArgs(argv: string[]): CliArgs {
  const packetIndex = argv.indexOf("--packet");
  if (packetIndex === -1 || !argv[packetIndex + 1]) {
    throw new Error("usage: sir-compiler --local-loop-command-runner --packet <path>");
  }
  return {
    packet: argv[packetIndex + 1]
  };
}

async function runLocalLoopCommands(packet: LocalLoopPacket): Promise<number> {
  for (const command of packet.validation_commands) {
    process.stdout.write(`--- CMD: ${command.id} ${command.argv.join(" ")}\n`);
    const result = await runRegistryCommand(command);
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    if (result.exit_code !== 0 || result.timed_out) {
      process.stderr.write(`local-loop command failed: ${command.id}\n`);
      return 1;
    }
  }
  return 0;
}

export async function mainLocalLoopCommandRunner(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const packet = JSON.parse(readFileSync(resolve(args.packet), "utf8")) as LocalLoopPacket;
  process.exitCode = await runLocalLoopCommands(packet);
}
