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
};

type WriteRouteProbe = {
  name: string;
  method: string;
  path: (businessId: string) => string;
  body?: unknown;
};

const ADMIN_WRITE_ROUTE_PROBES: WriteRouteProbe[] = [
  {
    name: "PUT /api/business/:businessId/payment-config",
    method: "PUT",
    path: (businessId) => `/api/business/${businessId}/payment-config`,
    body: {
      depositEnabled: false,
      depositType: "fixed",
      depositAmount: 0,
      paymentLabel: "Deposit",
    },
  },
  {
    name: "POST /api/business/:businessId/services",
    method: "POST",
    path: (businessId) => `/api/business/${businessId}/services`,
    body: {
      name: "Status Gate Service",
      durationMinutes: 30,
      price: 0,
      bufferMinutes: 0,
    },
  },
  {
    name: "PATCH /api/business/:businessId/services/:serviceId",
    method: "PATCH",
    path: (businessId) => `/api/business/${businessId}/services/status-gate-service`,
    body: {
      name: "Renamed Status Gate Service",
    },
  },
  {
    name: "DELETE /api/business/:businessId/services/:serviceId",
    method: "DELETE",
    path: (businessId) => `/api/business/${businessId}/services/status-gate-service`,
  },
  {
    name: "PUT /api/business/:businessId/availability",
    method: "PUT",
    path: (businessId) => `/api/business/${businessId}/availability`,
    body: {
      availability: [],
    },
  },
  {
    name: "POST /api/business/:businessId/blocked-times",
    method: "POST",
    path: (businessId) => `/api/business/${businessId}/blocked-times`,
    body: {
      start: "2099-04-07T09:00:00.000Z",
      end: "2099-04-07T10:00:00.000Z",
    },
  },
  {
    name: "PATCH /api/business/:businessId/blocked-times/:blockedTimeId",
    method: "PATCH",
    path: (businessId) => `/api/business/${businessId}/blocked-times/status-gate-block`,
    body: {
      start: "2099-04-07T09:00:00.000Z",
      end: "2099-04-07T10:00:00.000Z",
    },
  },
  {
    name: "DELETE /api/business/:businessId/blocked-times/:blockedTimeId",
    method: "DELETE",
    path: (businessId) => `/api/business/${businessId}/blocked-times/status-gate-block`,
  },
  {
    name: "POST /api/business/:businessId/bookings",
    method: "POST",
    path: (businessId) => `/api/business/${businessId}/bookings`,
    body: {
      requestedStart: "2099-04-07T09:00:00.000Z",
      serviceIds: ["status-gate-service"],
      customer: {
        name: "Status Gate Customer",
        phone: "07000000000",
        email: "status-gate.customer@example.com",
      },
    },
  },
  {
    name: "PATCH /api/business/:businessId/bookings/:bookingId/cancel",
    method: "PATCH",
    path: (businessId) => `/api/business/${businessId}/bookings/status-gate-booking/cancel`,
  },
  {
    name: "PATCH /api/business/:businessId/bookings/:bookingId/reschedule",
    method: "PATCH",
    path: (businessId) => `/api/business/${businessId}/bookings/status-gate-booking/reschedule`,
    body: {
      requestedStart: "2099-04-07T10:00:00.000Z",
    },
  },
  {
    name: "PATCH /api/business/:businessId/bookings/:bookingId/payment",
    method: "PATCH",
    path: (businessId) => `/api/business/${businessId}/bookings/status-gate-booking/payment`,
    body: {
      paymentStatus: "paid",
    },
  },
];

const REPRESENTATIVE_READ_ROUTES = [
  {
    name: "GET /api/business/:businessId/services",
    path: (businessId: string) => `/api/business/${businessId}/services`,
  },
  {
    name: "GET /api/business/:businessId/bookings",
    path: (businessId: string) => `/api/business/${businessId}/bookings`,
  },
  {
    name: "GET /api/business/:businessId/availability",
    path: (businessId: string) => `/api/business/${businessId}/availability`,
  },
  {
    name: "GET /api/business/:businessId/blocked-times",
    path: (businessId: string) => `/api/business/${businessId}/blocked-times?date=2099-04-07`,
  },
];

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
  const dataDir = mkdtempSync(path.join(tmpdir(), "booking-status-gating-tests-"));
  const dataFile = path.join(dataDir, "store.json");

  await fs.writeFile(dataFile, JSON.stringify(EMPTY_STATE, null, 2), "utf-8");

  const port = 5200 + Math.floor(Math.random() * 400);

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
    throw new Error(`Business status gating server failed health check: ${String(error)}\n${stderr}`);
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
  const slug = overrides.bookingSlug ?? `status-gating-${Math.random().toString(36).slice(2, 10)}`;
  const email = overrides.email ?? `${slug}@example.com`;

  const signup = await request<{
    businessId: string;
  }>(
    port,
    "/api/signup",
    {
      method: "POST",
      body: JSON.stringify({
        businessName: overrides.businessName ?? "Status Gating Proof Ltd",
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

  return {
    businessId: signup.body.businessId,
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

async function assertAdminWriteRoutesReturn503(
  port: number,
  businessId: string,
  session: SessionState
): Promise<void> {
  for (const route of ADMIN_WRITE_ROUTE_PROBES) {
    const init: RequestInit = {
      method: route.method,
    };

    if (route.body !== undefined) {
      init.body = JSON.stringify(route.body);
    }

    const response = await request<{ error?: string }>(port, route.path(businessId), init, session);

    assert.equal(response.status, 503, `${route.name} should return 503`);
    assert.equal(response.body.error, "This business is not currently active.");
  }
}

async function assertRepresentativeReadsReturn200(
  port: number,
  businessId: string,
  session: SessionState
): Promise<void> {
  for (const route of REPRESENTATIVE_READ_ROUTES) {
    const response = await request(port, route.path(businessId), { method: "GET" }, session);

    assert.equal(response.status, 200, `${route.name} should remain readable for suspended businesses`);
  }
}

const tests: TestCase[] = [
  {
    name: "suspended business admin write routes return 503 while representative reads remain 200",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        const login = await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);
        assert.equal(login.status, 200);

        const suspend = await applyBillingAction(running.port, businessId, "suspend", adminSession);
        assert.equal(suspend.status, 200);
        assert.equal(suspend.body.subscriptionStatus, "suspended");

        await assertAdminWriteRoutesReturn503(running.port, businessId, businessSession);
        await assertRepresentativeReadsReturn200(running.port, businessId, businessSession);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "deactivated business admin write routes return 503",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        const login = await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);
        assert.equal(login.status, 200);

        const suspend = await applyBillingAction(running.port, businessId, "suspend", adminSession);
        assert.equal(suspend.status, 200);
        assert.equal(suspend.body.subscriptionStatus, "suspended");

        const deactivate = await applyBillingAction(running.port, businessId, "deactivate", adminSession);
        assert.equal(deactivate.status, 200);
        assert.equal(deactivate.body.subscriptionStatus, "deactivated");

        await assertAdminWriteRoutesReturn503(running.port, businessId, businessSession);
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
