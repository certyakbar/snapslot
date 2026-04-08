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
const BUSINESS_SESSION_COOKIE_NAME = "booking_session";
const OWNER_SESSION_COOKIE_NAME = "snapslot_admin_session";
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
};

class CrossSurfaceAuthorizationError extends Error {}

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
  const dataDir = mkdtempSync(path.join(tmpdir(), "booking-session-boundary-tests-"));
  const dataFile = path.join(dataDir, "store.json");

  await fs.writeFile(dataFile, JSON.stringify(EMPTY_STATE, null, 2), "utf-8");

  const port = 4500 + Math.floor(Math.random() * 400);

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
    throw new Error(`Session boundary server failed health check: ${String(error)}\n${stderr}`);
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
  const slug = overrides.bookingSlug ?? `session-boundary-${Math.random().toString(36).slice(2, 10)}`;
  const email = overrides.email ?? `${slug}@example.com`;

  const signup = await request<{
    businessId: string;
  }>(
    port,
    "/api/signup",
    {
      method: "POST",
      body: JSON.stringify({
        businessName: overrides.businessName ?? "Session Boundary Ltd",
        ownerName: overrides.ownerName ?? "Owner",
        email,
        password: overrides.password ?? "password123",
        timezone: overrides.timezone ?? "Europe/London",
        bookingSlug: slug,
      }),
    },
    session
  );

  assert.equal(signup.status, 201);
  assert.ok(session.cookie.startsWith(`${BUSINESS_SESSION_COOKIE_NAME}=`));

  return {
    businessId: signup.body.businessId,
    slug,
  };
}

async function adminLogin(
  port: number,
  session: SessionState,
  password: string
): Promise<RequestResult<{ ok?: boolean; error?: string }>> {
  const login = await request<{ ok?: boolean; error?: string }>(
    port,
    "/api/snapslot-admin/login",
    {
      method: "POST",
      body: JSON.stringify({ password }),
    },
    session
  );

  assert.equal(login.status, 200);
  assert.equal(login.body.ok, true);
  assert.ok(session.cookie.startsWith(`${OWNER_SESSION_COOKIE_NAME}=`));

  return login;
}

function assertCrossSurfaceStatus<T>(
  response: RequestResult<T>,
  expectedStatus: number,
  context: {
    testCase: string;
    route: string;
    cookieSent: string;
    serverArea: string;
  }
): void {
  if (response.status === 200) {
    throw new CrossSurfaceAuthorizationError(
      [
        "Cross-surface route returned 200.",
        `test case: ${context.testCase}`,
        `route: ${context.route}`,
        `cookie sent: ${context.cookieSent}`,
        `response body: ${response.text}`,
        `server.ts area implicated: ${context.serverArea}`,
      ].join("\n")
    );
  }

  assert.equal(response.status, expectedStatus);
}

const tests: TestCase[] = [
  {
    name: "owner session cookie cannot access business admin routes",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const ownerSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        await adminLogin(running.port, ownerSession, TEST_ADMIN_PASSWORD);

        const businessRoute = `/api/business/${businessId}`;
        const business = await request<{ error?: string }>(
          running.port,
          businessRoute,
          { method: "GET" },
          ownerSession
        );

        assertCrossSurfaceStatus(business, 401, {
          testCase: "owner session cookie cannot access business admin routes",
          route: `GET ${businessRoute}`,
          cookieSent: ownerSession.cookie,
          serverArea: "assertBusinessSession/getSessionFromRequest business-session lookup",
        });

        const servicesRoute = `/api/business/${businessId}/services`;
        const services = await request<{ error?: string }>(
          running.port,
          servicesRoute,
          { method: "GET" },
          ownerSession
        );

        assertCrossSurfaceStatus(services, 401, {
          testCase: "owner session cookie cannot access business admin routes",
          route: `GET ${servicesRoute}`,
          cookieSent: ownerSession.cookie,
          serverArea: "assertBusinessSession/getSessionFromRequest business-session lookup",
        });
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "business session cookie cannot access owner admin routes",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);

        const ownerBusinessesRoute = "/api/snapslot-admin/businesses";
        const ownerBusinesses = await request<{ error?: string }>(
          running.port,
          ownerBusinessesRoute,
          { method: "GET" },
          businessSession
        );

        assertCrossSurfaceStatus(ownerBusinesses, 401, {
          testCase: "business session cookie cannot access owner admin routes",
          route: `GET ${ownerBusinessesRoute}`,
          cookieSent: businessSession.cookie,
          serverArea: "assertSnapslotAdminSession/getSnapslotAdminSessionTokenFromRequest owner-session lookup",
        });

        const billingRoute = `/api/snapslot-admin/businesses/${businessId}/billing`;
        const billing = await request<{ error?: string }>(
          running.port,
          billingRoute,
          {
            method: "PATCH",
            body: JSON.stringify({ action: "suspend" }),
          },
          businessSession
        );

        assertCrossSurfaceStatus(billing, 401, {
          testCase: "business session cookie cannot access owner admin routes",
          route: `PATCH ${billingRoute}`,
          cookieSent: businessSession.cookie,
          serverArea: "assertSnapslotAdminSession/getSnapslotAdminSessionTokenFromRequest owner-session lookup",
        });
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "no session on admin routes",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);

        const business = await request<{ error?: string }>(
          running.port,
          `/api/business/${businessId}`,
          { method: "GET" }
        );
        assert.equal(business.status, 401);

        const ownerBusinesses = await request<{ error?: string }>(
          running.port,
          "/api/snapslot-admin/businesses",
          { method: "GET" }
        );
        assert.equal(ownerBusinesses.status, 401);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "business A session accessing business B route returns 403",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSessionA = { cookie: "" };
        const businessSessionB = { cookie: "" };
        await signUpBusiness(running.port, businessSessionA, {
          businessName: "Session Boundary A Ltd",
        });
        const businessB = await signUpBusiness(running.port, businessSessionB, {
          businessName: "Session Boundary B Ltd",
        });

        const response = await request<{ error?: string }>(
          running.port,
          `/api/business/${businessB.businessId}`,
          { method: "GET" },
          businessSessionA
        );

        assert.equal(response.status, 403);
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
    const isStopCondition = error instanceof CrossSurfaceAuthorizationError;
    console.error(`${isStopCondition ? "STOP" : "FAIL"}  ${test.name}`);
    console.error(error);

    if (isStopCondition) {
      break;
    }
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS ${tests.length} tests`);
}
