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
const SUBSCRIPTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
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

type ServiceResult = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  active: boolean;
  bufferMinutes?: number;
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

async function requestText(
  port: number,
  pathname: string,
  init: RequestInit = {},
  session?: SessionState
): Promise<{ status: number; text: string; setCookie: string | null }> {
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

  return {
    status: response.status,
    text: await response.text(),
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
  const dataDir = mkdtempSync(path.join(tmpdir(), "booking-subscription-tests-"));
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
    throw new Error(`Subscription server failed health check: ${String(error)}\n${stderr}`);
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
  const slug = overrides.bookingSlug ?? `subscription-${Math.random().toString(36).slice(2, 10)}`;
  const email = overrides.email ?? `${slug}@example.com`;

  const signup = await request<{
    businessId: string;
  }>(
    port,
    "/api/signup",
    {
      method: "POST",
      body: JSON.stringify({
        businessName: overrides.businessName ?? "Subscription Proof Ltd",
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
    slug,
  };
}

async function getBusinessSubscription(
  port: number,
  businessId: string,
  session: SessionState
): Promise<
  RequestResult<{
    subscriptionStatus: string;
    subscriptionStartDate: string;
    nextBillingDate: string;
    cancellationRequestedAt?: string;
    billingHistory: Array<{
      id: string;
      type: string;
      amountPence?: number;
      note?: string;
      createdAt: string;
    }>;
    pricePerMonth: number;
  }>
> {
  return request(port, `/api/business/${businessId}/subscription`, { method: "GET" }, session);
}

async function requestCancellation(
  port: number,
  businessId: string,
  session: SessionState
): Promise<RequestResult<{ message: string }>> {
  return request(
    port,
    `/api/business/${businessId}/subscription/cancel`,
    { method: "POST" },
    session
  );
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

async function listAdminBusinesses(
  port: number,
  session?: SessionState
): Promise<
  RequestResult<
    Array<{
      id: string;
      name: string;
      ownerEmail: string;
      subscriptionStatus: string;
      subscriptionStartDate: string;
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
  >
> {
  return request(port, "/api/snapslot-admin/businesses", { method: "GET" }, session);
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

async function createService(
  port: number,
  businessId: string,
  session: SessionState
): Promise<ServiceResult> {
  const response = await request<ServiceResult>(
    port,
    `/api/business/${businessId}/services`,
    {
      method: "POST",
      body: JSON.stringify({
        name: "Subscription Service",
        durationMinutes: 30,
        price: 2500,
        bufferMinutes: 0,
      }),
    },
    session
  );

  assert.equal(response.status, 201);
  return response.body;
}

async function saveAvailability(
  port: number,
  businessId: string,
  session: SessionState
): Promise<void> {
  const response = await request(
    port,
    `/api/business/${businessId}/availability`,
    {
      method: "PUT",
      body: JSON.stringify({
        availability: [
          {
            dayOfWeek: 2,
            startMinutes: 9 * 60,
            endMinutes: 12 * 60,
            active: true,
          },
        ],
      }),
    },
    session
  );

  assert.equal(response.status, 200);
}

async function createPublicBooking(
  port: number,
  slug: string,
  serviceId: string
): Promise<RequestResult<{ error?: string }>> {
  return request(port, `/api/booking-page/${slug}/bookings`, {
    method: "POST",
    body: JSON.stringify({
      requestedStart: "2099-04-07T09:00:00.000Z",
      serviceIds: [serviceId],
      customer: {
        name: "Subscription Customer",
        phone: "07000000000",
        email: "subscription.customer@example.com",
      },
    }),
  });
}

function assertWithinSixtySeconds(actualMs: number, expectedMs: number, message: string): void {
  assert.ok(Math.abs(actualMs - expectedMs) <= 60 * 1000, message);
}

const tests: TestCase[] = [
  {
    name: "fresh business has subscriptionStatus active and nextBillingDate about 30 days from now",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        const subscription = await getBusinessSubscription(running.port, businessId, businessSession);

        assert.equal(subscription.status, 200);
        assert.equal(subscription.body.subscriptionStatus, "active");

        const deltaMs = new Date(subscription.body.nextBillingDate).getTime() - Date.now();

        assertWithinSixtySeconds(
          deltaMs,
          SUBSCRIPTION_WINDOW_MS,
          `Expected next billing date about 30 days from now, got delta ${deltaMs}`
        );
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "business subscription route returns correct fields including pricePerMonth 60",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        const subscription = await getBusinessSubscription(running.port, businessId, businessSession);

        assert.equal(subscription.status, 200);
        assert.equal(subscription.body.subscriptionStatus, "active");
        assert.equal(typeof subscription.body.subscriptionStartDate, "string");
        assert.equal(typeof subscription.body.nextBillingDate, "string");
        assert.equal(subscription.body.cancellationRequestedAt, undefined);
        assert.ok(Array.isArray(subscription.body.billingHistory));
        assert.equal(subscription.body.pricePerMonth, 60);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "snapslot admin login with correct password returns 200",
    async run() {
      const running = await startServerForTest();

      try {
        const adminSession = { cookie: "" };
        const login = await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);

        assert.equal(login.status, 200);
        assert.equal(login.body.ok, true);
        assert.ok(adminSession.cookie.includes("snapslot_admin_session="));
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "snapslot admin login with wrong password returns 401",
    async run() {
      const running = await startServerForTest();

      try {
        const adminSession = { cookie: "" };
        const login = await adminLogin(running.port, adminSession, "wrong-password");

        assert.equal(login.status, 401);
        assert.equal(login.body.error, "Incorrect password.");
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "unauthenticated GET /api/snapslot-admin/businesses returns 401",
    async run() {
      const running = await startServerForTest();

      try {
        const list = await listAdminBusinesses(running.port);
        assert.equal(list.status, 401);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "authenticated GET /api/snapslot-admin/businesses returns array including the test business",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);

        const list = await listAdminBusinesses(running.port, adminSession);

        assert.equal(list.status, 200);
        assert.ok(Array.isArray(list.body));
        assert.ok(list.body.some((business) => business.id === businessId));
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "mark paid advances nextBillingDate by about 30 days and records payment_received event",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        const before = await getBusinessSubscription(running.port, businessId, businessSession);
        await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);

        const result = await applyBillingAction(running.port, businessId, "mark_paid", adminSession);

        assert.equal(result.status, 200);

        const advancedMs =
          new Date(result.body.nextBillingDate).getTime() - new Date(before.body.nextBillingDate).getTime();

        assertWithinSixtySeconds(
          advancedMs,
          SUBSCRIPTION_WINDOW_MS,
          `Expected next billing date to advance about 30 days, got ${advancedMs}`
        );

        assert.ok(
          result.body.billingHistory.some(
            (event) => event.type === "payment_received" && event.amountPence === 6000
          )
        );
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "suspend sets status suspended and records suspended event",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);

        const result = await applyBillingAction(running.port, businessId, "suspend", adminSession);

        assert.equal(result.status, 200);
        assert.equal(result.body.subscriptionStatus, "suspended");
        assert.ok(result.body.suspendedAt);
        assert.ok(result.body.billingHistory.some((event) => event.type === "suspended"));
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "reactivate from suspended sets status active and clears suspendedAt",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);
        await applyBillingAction(running.port, businessId, "suspend", adminSession);

        const result = await applyBillingAction(running.port, businessId, "reactivate", adminSession);

        assert.equal(result.status, 200);
        assert.equal(result.body.subscriptionStatus, "active");
        assert.equal(result.body.suspendedAt, undefined);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "deactivate from suspended sets status deactivated and sets gdprRetentionFlaggedAt",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);
        await applyBillingAction(running.port, businessId, "suspend", adminSession);

        const result = await applyBillingAction(running.port, businessId, "deactivate", adminSession);

        assert.equal(result.status, 200);
        assert.equal(result.body.subscriptionStatus, "deactivated");
        assert.ok(result.body.gdprRetentionFlaggedAt);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "business requests cancellation and stays active while recording cancellation_requested",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);

        const cancellation = await requestCancellation(running.port, businessId, businessSession);

        assert.equal(cancellation.status, 200);
        assert.match(cancellation.body.message, /Cancellation requested/i);

        const subscription = await getBusinessSubscription(running.port, businessId, businessSession);

        assert.equal(subscription.status, 200);
        assert.equal(subscription.body.subscriptionStatus, "active");
        assert.ok(subscription.body.cancellationRequestedAt);
        assert.ok(
          subscription.body.billingHistory.some((event) => event.type === "cancellation_requested")
        );
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "second cancellation request on the same business returns 400",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);

        const first = await requestCancellation(running.port, businessId, businessSession);
        assert.equal(first.status, 200);

        const second = await requestCancellation(running.port, businessId, businessSession);
        assert.equal(second.status, 400);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "suspended business GET /booking/:slug returns 503",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const { businessId, slug } = await signUpBusiness(running.port, businessSession);
        await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);
        await applyBillingAction(running.port, businessId, "suspend", adminSession);

        const response = await requestText(running.port, `/booking/${slug}`, { method: "GET" });

        assert.equal(response.status, 503);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "suspended business POST /api/booking-page/:slug/bookings returns 503",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const { businessId, slug } = await signUpBusiness(running.port, businessSession);
        const service = await createService(running.port, businessId, businessSession);
        await saveAvailability(running.port, businessId, businessSession);
        await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);
        await applyBillingAction(running.port, businessId, "suspend", adminSession);

        const booking = await createPublicBooking(running.port, slug, service.id);

        assert.equal(booking.status, 503);
      } finally {
        await running.stop();
      }
    },
  },
  {
    name: "invalid billing action returns 400",
    async run() {
      const running = await startServerForTest();

      try {
        const businessSession = { cookie: "" };
        const adminSession = { cookie: "" };
        const { businessId } = await signUpBusiness(running.port, businessSession);
        await adminLogin(running.port, adminSession, TEST_ADMIN_PASSWORD);

        const result = await applyBillingAction(running.port, businessId, "nonsense", adminSession);

        assert.equal(result.status, 400);
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
