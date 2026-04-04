import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const EMPTY_STATE = {
  businesses: [],
  servicesByBusinessId: {},
  availabilityByBusinessId: {},
  blockedTimesByBusinessId: {},
  bookingsByBusinessId: {},
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

type TestCase = { name: string; run: () => Promise<void> | void };

function buildUrl(port: number, pathname: string): string {
  return `http://127.0.0.1:${port}${pathname}`;
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON, got: ${text}`);
  }
}

async function post<T>(port: number, pathname: string, body: unknown): Promise<{ status: number; body: T; setCookie: string | null }> {
  const response = await fetch(buildUrl(port, pathname), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? parseJson<T>(text) : ({} as T),
    setCookie: response.headers.get("set-cookie"),
  };
}

async function waitForHealth(port: number, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(buildUrl(port, "/health"));
      if (response.ok) return;
    } catch { /* still booting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for server health.");
}

type RunningServer = { port: number; stop: () => Promise<void> };

async function startServerForTest(env: Record<string, string> = {}): Promise<RunningServer> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "booking-security-tests-"));
  const dataFile = path.join(dataDir, "store.json");
  await fs.writeFile(dataFile, JSON.stringify(EMPTY_STATE, null, 2), "utf-8");

  const port = 3700 + Math.floor(Math.random() * 200);

  const serverProcess = spawn("node", ["--loader", "ts-node/esm", "server.ts"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      BOOKING_SYSTEM_DATA_FILE: dataFile,
      ...env,
    },
    stdio: "pipe",
  });

  await waitForHealth(port);

  return {
    port,
    stop: () =>
      new Promise((resolve) => {
        serverProcess.kill("SIGTERM");
        serverProcess.on("exit", () => resolve());
      }),
  };
}

const tests: TestCase[] = [
  {
    name: "login rate limiter blocks the 6th attempt within the window with 429",
    async run() {
      const server = await startServerForTest();
      try {
        // Sign up so a real account exists
        await post(server.port, "/api/signup", {
          businessName: "Rate Test Co",
          ownerName: "Tester",
          email: "ratetest@example.com",
          password: "password123",
          timezone: "Europe/London",
          bookingSlug: "rate-test",
        });

        // 5 failed login attempts — all should return 401
        for (let i = 1; i <= 5; i++) {
          const res = await post<{ error: string }>(server.port, "/api/login", {
            email: "ratetest@example.com",
            password: "wrongpassword",
          });
          assert.equal(res.status, 401, `Attempt ${i} should return 401`);
        }

        // 6th attempt — must return 429 regardless of password correctness
        const blocked = await post<{ error: string }>(server.port, "/api/login", {
          email: "ratetest@example.com",
          password: "wrongpassword",
        });
        assert.equal(blocked.status, 429, "6th attempt must return 429");
        assert.match(blocked.body.error, /too many login attempts/i);
      } finally {
        await server.stop();
      }
    },
  },
  {
    name: "successful login resets the rate limit counter",
    async run() {
      const server = await startServerForTest();
      try {
        await post(server.port, "/api/signup", {
          businessName: "Reset Test Co",
          ownerName: "Tester",
          email: "resettest@example.com",
          password: "password123",
          timezone: "Europe/London",
          bookingSlug: "reset-test",
        });

        // 3 failed attempts
        for (let i = 0; i < 3; i++) {
          await post(server.port, "/api/login", {
            email: "resettest@example.com",
            password: "wrong",
          });
        }

        // Successful login resets counter
        const success = await post<{ ok: boolean }>(server.port, "/api/login", {
          email: "resettest@example.com",
          password: "password123",
        });
        assert.equal(success.status, 200, "Correct credentials must return 200");

        // Should be able to attempt again without being blocked
        const after = await post<{ error: string }>(server.port, "/api/login", {
          email: "resettest@example.com",
          password: "wrong",
        });
        assert.equal(after.status, 401, "After reset, wrong password returns 401 not 429");
      } finally {
        await server.stop();
      }
    },
  },
  {
    name: "session cookie includes Secure flag when NODE_ENV is production",
    async run() {
      const server = await startServerForTest({ NODE_ENV: "production" });
      try {
        const res = await post<{ ok: boolean; businessId: string }>(server.port, "/api/signup", {
          businessName: "Secure Cookie Co",
          ownerName: "Owner",
          email: "securecookie@example.com",
          password: "password123",
          timezone: "Europe/London",
          bookingSlug: "secure-cookie",
        });
        assert.equal(res.status, 201);
        assert.ok(res.setCookie, "Set-Cookie header must be present");
        assert.ok(
          res.setCookie!.includes("; Secure"),
          `Cookie must include '; Secure' in production. Got: ${res.setCookie}`
        );
      } finally {
        await server.stop();
      }
    },
  },
  {
    name: "session cookie does not include Secure flag outside production",
    async run() {
      const server = await startServerForTest({ NODE_ENV: "development" });
      try {
        const res = await post<{ ok: boolean }>(server.port, "/api/signup", {
          businessName: "Dev Cookie Co",
          ownerName: "Owner",
          email: "devcookie@example.com",
          password: "password123",
          timezone: "Europe/London",
          bookingSlug: "dev-cookie",
        });
        assert.equal(res.status, 201);
        assert.ok(res.setCookie, "Set-Cookie header must be present");
        assert.ok(
          !res.setCookie!.includes("; Secure"),
          `Cookie must NOT include '; Secure' outside production. Got: ${res.setCookie}`
        );
      } finally {
        await server.stop();
      }
    },
  },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS  ${test.name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL  ${test.name}`);
    console.error(error);
    failed += 1;
  }
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
