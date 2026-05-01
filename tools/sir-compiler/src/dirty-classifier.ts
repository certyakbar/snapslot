import { execFileSync } from "node:child_process";

export interface RepoState {
  branch: string;
  head_sha: string;
  dirty: boolean;
  dirty_summary: string[];
}

function git(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

export function readRepoState(): RepoState {
  const branch = git(["branch", "--show-current"]) || "HEAD";
  const head_sha = git(["rev-parse", "HEAD"]);
  const porcelain = git(["status", "--porcelain"]);
  const dirty_summary = porcelain.length === 0 ? [] : porcelain.split("\n");

  return {
    branch,
    head_sha,
    dirty: dirty_summary.length > 0,
    dirty_summary
  };
}
