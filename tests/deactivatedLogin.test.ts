import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { hashPassword } from "../auth.ts";

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
const TEST_ADMIN_PASSWORD = "test-admin-pass";
const TEST_ADMIN_PASSWORD_SALT = "746573742d61646d696e2d73616c74";
const TEST_ADMIN_PASSWORD_CREDENTIAL = `${TEST_ADMIN_PASSWORD_SALT}:${hashPassword(
  TEST_ADMIN_PASSWORD,
  TEST_ADMIN_PASSWORD_SALT
)}`;

type SessionState = {
  cookie: string;
};

type RunningServer = {
  port: number;
  stop: () => Promise<void>;
};

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

type RequestResult<T> = {
  status: number;
  body: T;
  text: string;
  setCookie: string | null;
};

type SignupResult = {
  businessId: string;
  slug: string;
  email: string;
  password: string;
};

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

async function request<T>(
  port: number,
  pathname: string,
  init: RequestInit = {},
  session?: SessionState
): Promise<RequestResult<T>> {
  const headers = new Headers(init.headers ?? {});

  if (session?.cookie) {
    headers.set("Cookie", session.cookie);
  }

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildUrl(port, pathname), {
    ...init,
    headers,
    redirect: "manual",
  });

  const setCookie = response.headers.get("set-cookie");

  if (session && setCookie) {
    session.cookie = setCookie.split(";")[0];
  }

  const text = await response.text();

  return {
    status: response.status,
    body: text ? parseJson<T>(text) : ({} as T),
    text,
    setCookie,
  };
}

async function waitForHealth(port: number, timeoutMs = 10000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(buildUrl(port, "/health"));
      if (response.ok) {
        return;
      }
    } catch {
      // Server may still be booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for server health.");
}

async function startServerForTest(): Promise<RunningServer> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "booking-deactivated-login-tests-"));
  const dataFile = path.join(dataDir, "store.json");

  await fs.writeFile(dataFile, JSON.stringify(EMPTY_STATE, null, 2), "utf-8");

  const port = 4900 + Math.floor(Math.random() * 400);

  const serverProcess = spawn("node", ["--loader", "ts-node/esm", "server.ts"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      BOOKING_SYSTEM_DATA_FILE: dataFile,
      SNAPSLOT_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD_CREDENTIAL,
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";

  serverProcess.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth(port);
  } catch (error) {
    serverProcess.kill("SIGTERM");
    throw new Error(`Deactivated login server failed health check: ${String(error)}\n${stderr}`);
  }

  return {
    port,
    stop: () =>
      new Promise((resolve) => {
        if (serverProcess.exitCode !== null) {
          resolve();
          return;
        }

        serverProcess.once("exit", () => resolve());
        serverProcess.kill("SIGTERM");
      }),
  };
}

async function signUpBusiness(
  port: number,
  session: SessionState,
  overrides: Partial<{
    businessName: string;
    ownerName: string;
    email: string;
    password: string;
    timezone: string;
    bookingSlug: string;
  }> = {}
): Promise<SignupResult> {
  const slug = overrides.bookingSlug ?? `deactivated-login-${Math.random().toString(36).slice(2, 10)}`;
  const email = overrides.email ?? `${slug}@example.com`;
  const password = overrides.password ?? "password123";

  const signup = await request<{
    businessId: string;
  }>(
    port,
    "/api/signup",
    {
      method: "POST",
      body: JSON.stringify({
        businessName: overrides.businessName ?? "Deactivated Login Proof Ltd",
        ownerName: overrides.ownerName ?? "Owner",
        email,
        password,
        timezone: overrides.timezone ?? "Europe/London",
        bookingSlug: slug,
      }),
    },
    session
  );

  assert.equal(signup.status, 201);

  return {
    businessId: signup.body.businessId,
    slug,
    email,
    password,
  };
}

async function adminLogin(
  port: number,
  session: SessionState,
  password: string
): Promise<RequestResult<{ ok?: boolean; error?: string }>> {
  return request(
    port,
    "/api/snapslot-admin/login",
    {
      method: "POST",
      body: JSON.stringify({ password }),
    },
    session
  );
}

async function businessLogin(
  port: number,
  email: string,
  password: string,
  session: SessionState
): Promise<RequestResult<{ ok?: boolean; businessId?: string; error?: string }>> {
  return request(
    port,
    "/api/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    session
  );
}

async function applyBillingAction(
  port: number,
  businessId: string,
  action: string,
  session: SessionState,
  note?: string
): Promise<
  RequestResult<{
    id: string;
    subscriptionStatus: string;
    nextBillingDate: string;
    suspendedAt?: string;
    cancellationRequestedAt?: string;
    gdprRetentionFlaggedAt?: string;
    billingHistory: Array<{
      id: string;
      type: string;
      amountPence?: number;
      note?: string;
      createdAt: string;
    }>;
  }>
> {
  return request(
    port,
    `/api/snapslot-admin/businesses/${businessId}/billing`,
    {
      method: "PATCH",
      body: JSON.stringify({
        action,
        note,
      }),
    },
    session
  );
}

const tests: TestCase[] = [
  {
    name: "deactivated business login returns 403",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const loginSession = { cookie: "" };
        const business = await signUpBusiness(running.port, businessSession, {
          businessName: "Business A",
        });

        const ownerLogin = await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);
        assert.equal(ownerLogin.status, 200);

        const suspend = await applyBillingAction(running.port, business.businessId, "suspend", adminSession);
        assert.equal(suspend.status, 200);
        assert.equal(suspend.body.subscriptionStatus, "suspended");

        const deactivate = await applyBillingAction(
          running.port,
          business.businessId,
          "deactivate",
          adminSession
        );
        assert.equal(deactivate.status, 200);
        assert.equal(deactivate.body.subscriptionStatus, "deactivated");

        const login = await businessLogin(running.port, business.email, business.password, loginSession);

        assert.equal(login.status, 403);
        assert.match(login.body.error ?? "", /deactivated/i);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "suspended business login returns 200",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const loginSession = { cookie: "" };
        const business = await signUpBusiness(running.port, businessSession, {
          businessName: "Business B",
        });

        const ownerLogin = await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);
        assert.equal(ownerLogin.status, 200);

        const suspend = await applyBillingAction(running.port, business.businessId, "suspend", adminSession);
        assert.equal(suspend.status, 200);
        assert.equal(suspend.body.subscriptionStatus, "suspended");

        const login = await businessLogin(running.port, business.email, business.password, loginSession);

        assert.equal(login.status, 200);
        assert.equal(login.body.ok, true);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "active business login returns 200",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const loginSession = { cookie: "" };
        const business = await signUpBusiness(running.port, businessSession, {
          businessName: "Business C",
        });

        const login = await businessLogin(running.port, business.email, business.password, loginSession);

        assert.equal(login.status, 200);
        assert.equal(login.body.ok, true);
        assert.ok(login.body.businessId);
      } finally {
        await running.stop();
      }
    },
  },
];

let failed = 0;

for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS  ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${test.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS ${tests.length} tests`);
}
