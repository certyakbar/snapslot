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

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

type CookieSession = {
  cookie: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

function buildUrl(port: number, pathname: string): string {
  return `http://localhost:${port}${pathname}`;
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON response, got: ${text}`);
  }
}

function readBusinessId(body: any): string | undefined {
  if (body && typeof body.id === "string") {
    return body.id;
  }
  if (body && body.business && typeof body.business.id === "string") {
    return body.business.id;
  }
  return undefined;
}

function readBusinessSlug(body: any): string | undefined {
  if (body && typeof body.bookingPageSlug === "string") {
    return body.bookingPageSlug;
  }
  if (body && body.business && typeof body.business.bookingPageSlug === "string") {
    return body.business.bookingPageSlug;
  }
  return undefined;
}

function readSessionBusinessId(body: any): string | undefined {
  if (body && body.business && typeof body.business.id === "string") {
    return body.business.id;
  }
  if (body && typeof body.businessId === "string") {
    return body.businessId;
  }
  if (body && typeof body.id === "string") {
    return body.id;
  }
  return undefined;
}

async function requestJson<T>(
  port: number,
  pathname: string,
  init: RequestInit = {},
  session?: CookieSession
): Promise<{ status: number; body: T; headers: Headers }> {
  const headers = new Headers(init.headers ?? {});

  if (session?.cookie) {
    headers.set("Cookie", session.cookie);
  }

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildUrl(port, pathname), {
    ...init,
    headers,
    redirect: init.redirect ?? "manual",
  });

  const setCookie = response.headers.get("set-cookie");
  if (session && setCookie) {
    session.cookie = setCookie.split(";")[0];
  }

  const bodyText = await response.text();
  const parsed = bodyText ? parseJson<T>(bodyText) : ({} as T);
  return { status: response.status, body: parsed, headers: response.headers };
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
      // Server can still be booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for server health endpoint.");
}

type RunningServer = {
  port: number;
  stop: () => Promise<void>;
};

async function startServerForTest(): Promise<RunningServer> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "booking-auth-tests-"));
  const dataFile = path.join(dataDir, "store.json");
  await fs.writeFile(dataFile, JSON.stringify(EMPTY_STATE, null, 2), "utf-8");

  const port = 3100 + Math.floor(Math.random() * 500);

  const serverProcess = spawn("node", ["--loader", "ts-node/esm", "server.ts"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      BOOKING_SYSTEM_DATA_FILE: dataFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderrBuffer = "";
  serverProcess.stderr.on("data", (chunk: Buffer | string) => {
    stderrBuffer += chunk.toString();
  });

  try {
    await waitForHealth(port);
  } catch (error) {
    serverProcess.kill();
    throw new Error(`Server failed health check: ${String(error)}\n${stderrBuffer}`);
  }

  return {
    port,
    stop: async () => {
      if (serverProcess.exitCode !== null) {
        return;
      }

      await new Promise<void>((resolve) => {
        serverProcess.once("exit", () => resolve());
        serverProcess.kill();
      });
    },
  };
}

const tests: TestCase[] = [
  {
    name: "auth/session and tenant-isolation routes enforce boundaries",
    run: async () => {
      const running = await startServerForTest();

      try {
        const sessionA: CookieSession = { cookie: "" };
        const sessionB: CookieSession = { cookie: "" };
        const loginSession: CookieSession = { cookie: "" };

        const slugA = `auth-a-${Math.random().toString(36).slice(2, 10)}`;
        const slugB = `auth-b-${Math.random().toString(36).slice(2, 10)}`;
        const emailA = `${slugA}@example.com`;
        const emailB = `${slugB}@example.com`;

        const signupA = await requestJson<{ businessId: string; adminUrl: string }>(
          running.port,
          "/api/signup",
          {
            method: "POST",
            body: JSON.stringify({
              businessName: "Auth A",
              ownerName: "Owner A",
              email: emailA,
              password: "auditpass123",
              timezone: "Europe/London",
              bookingSlug: slugA,
            }),
          },
          sessionA
        );

        assert.equal(signupA.status, 201);
        assert.equal(signupA.body.businessId.startsWith("biz_"), true);
        assert.equal(signupA.body.adminUrl, `/admin/${signupA.body.businessId}`);
        assert.equal(Boolean(sessionA.cookie), true);

        const sessionCheckA = await requestJson<{ business: { id: string } }>(
          running.port,
          "/api/session",
          { method: "GET" },
          sessionA
        );
        assert.equal(sessionCheckA.status, 200);
        assert.equal(
          readSessionBusinessId(sessionCheckA.body),
          signupA.body.businessId,
          `Unexpected /api/session payload: ${JSON.stringify(sessionCheckA.body)}`
        );

        const unauthSession = await requestJson<{ error: string }>(running.port, "/api/session", {
          method: "GET",
        });
        assert.equal(unauthSession.status, 401);

        const unauthBusinessApi = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupA.body.businessId}`,
          { method: "GET" }
        );
        assert.equal(unauthBusinessApi.status, 401);

        const unauthBookingComplete = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupA.body.businessId}/bookings/bkg_does_not_exist/complete`,
          { method: "PATCH" }
        );
        assert.equal(unauthBookingComplete.status, 401);

        const unauthAdmin = await fetch(buildUrl(running.port, `/admin/${signupA.body.businessId}`), {
          redirect: "manual",
        });
        assert.equal(unauthAdmin.status, 302);
        assert.equal(
          unauthAdmin.headers.get("location"),
          `/login?redirect=${encodeURIComponent(`/admin/${signupA.body.businessId}`)}`
        );

        const signupB = await requestJson<{ businessId: string }>(
          running.port,
          "/api/signup",
          {
            method: "POST",
            body: JSON.stringify({
              businessName: "Auth B",
              ownerName: "Owner B",
              email: emailB,
              password: "auditpass123",
              timezone: "Europe/London",
              bookingSlug: slugB,
            }),
          },
          sessionB
        );
        assert.equal(signupB.status, 201);

        const sessionCheckAAfterSignupB = await requestJson<{ business: { id: string } }>(
          running.port,
          "/api/session",
          { method: "GET" },
          sessionA
        );
        assert.equal(sessionCheckAAfterSignupB.status, 200);
        assert.equal(readSessionBusinessId(sessionCheckAAfterSignupB.body), signupA.body.businessId);
        assert.notEqual(readSessionBusinessId(sessionCheckAAfterSignupB.body), signupB.body.businessId);

        const crossBusinessAccount = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}`,
          { method: "GET" },
          sessionA
        );
        assert.equal(crossBusinessAccount.status, 403);

        const crossBusinessService = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/services`,
          {
            method: "POST",
            body: JSON.stringify({
              name: "Cut",
              durationMinutes: 30,
              price: 20,
              bufferMinutes: 10,
            }),
          },
          sessionA
        );
        assert.equal(crossBusinessService.status, 403);

        const serviceA = await requestJson<{ id: string; businessId: string }>(
          running.port,
          `/api/business/${signupA.body.businessId}/services`,
          {
            method: "POST",
            body: JSON.stringify({
              name: "Cut A",
              durationMinutes: 30,
              price: 20,
              bufferMinutes: 10,
            }),
          },
          sessionA
        );
        assert.equal(serviceA.status, 201);

        const serviceB = await requestJson<{ id: string; businessId: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/services`,
          {
            method: "POST",
            body: JSON.stringify({
              name: "Cut B",
              durationMinutes: 30,
              price: 25,
              bufferMinutes: 5,
            }),
          },
          sessionB
        );
        assert.equal(serviceB.status, 201);

        const servicesA = await requestJson<Array<{ id: string; businessId: string }>>(
          running.port,
          `/api/business/${signupA.body.businessId}/services`,
          { method: "GET" },
          sessionA
        );
        assert.equal(servicesA.status, 200);
        assert.equal(servicesA.body.some((service) => service.id === serviceA.body.id), true);
        assert.equal(servicesA.body.some((service) => service.id === serviceB.body.id), false);

        const servicesB = await requestJson<Array<{ id: string; businessId: string }>>(
          running.port,
          `/api/business/${signupB.body.businessId}/services`,
          { method: "GET" },
          sessionB
        );
        assert.equal(servicesB.status, 200);
        assert.equal(servicesB.body.some((service) => service.id === serviceB.body.id), true);

        const crossBusinessServiceList = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/services`,
          { method: "GET" },
          sessionA
        );
        assert.equal(crossBusinessServiceList.status, 403);

        const crossBusinessServicePatch = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/services/${serviceB.body.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: "Cross Edit",
              durationMinutes: 45,
              price: 30,
              bufferMinutes: 10,
              active: false,
            }),
          },
          sessionA
        );
        assert.equal(crossBusinessServicePatch.status, 403);

        const crossBusinessServiceDelete = await fetch(
          buildUrl(running.port, `/api/business/${signupB.body.businessId}/services/${serviceB.body.id}`),
          {
            method: "DELETE",
            headers: { Cookie: sessionA.cookie },
            redirect: "manual",
          }
        );
        assert.equal(crossBusinessServiceDelete.status, 403);

        const availabilityUpdateA = await requestJson<Array<{ dayOfWeek: number; startMinutes: number; endMinutes: number }>>(
          running.port,
          `/api/business/${signupA.body.businessId}/availability`,
          {
            method: "PUT",
            body: JSON.stringify({
              availability: [{ dayOfWeek: 1, startMinutes: 540, endMinutes: 720, active: true }],
            }),
          },
          sessionA
        );
        assert.equal(availabilityUpdateA.status, 200);
        assert.equal(availabilityUpdateA.body.length, 1);

        const availabilityUpdateB = await requestJson<Array<{ dayOfWeek: number; startMinutes: number; endMinutes: number }>>(
          running.port,
          `/api/business/${signupB.body.businessId}/availability`,
          {
            method: "PUT",
            body: JSON.stringify({
              availability: [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 780, active: true }],
            }),
          },
          sessionB
        );
        assert.equal(availabilityUpdateB.status, 200);
        assert.equal(availabilityUpdateB.body.length, 1);

        const crossBusinessAvailabilityRead = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/availability`,
          { method: "GET" },
          sessionA
        );
        assert.equal(crossBusinessAvailabilityRead.status, 403);

        const crossBusinessAvailabilityWrite = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/availability`,
          {
            method: "PUT",
            body: JSON.stringify({
              availability: [{ dayOfWeek: 2, startMinutes: 540, endMinutes: 600, active: true }],
            }),
          },
          sessionA
        );
        assert.equal(crossBusinessAvailabilityWrite.status, 403);

        const blockedTimeB = await requestJson<{ id: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/blocked-times`,
          {
            method: "POST",
            body: JSON.stringify({
              start: "2099-04-06T10:00:00.000Z",
              end: "2099-04-06T10:30:00.000Z",
              reason: "B blocked",
            }),
          },
          sessionB
        );
        assert.equal(blockedTimeB.status, 201);

        const blockedTimesB = await requestJson<Array<{ id: string }>>(
          running.port,
          `/api/business/${signupB.body.businessId}/blocked-times?date=2099-04-06`,
          { method: "GET" },
          sessionB
        );
        assert.equal(blockedTimesB.status, 200);
        assert.equal(blockedTimesB.body.some((blocked) => blocked.id === blockedTimeB.body.id), true);

        const crossBusinessBlockedRead = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/blocked-times?date=2099-04-06`,
          { method: "GET" },
          sessionA
        );
        assert.equal(crossBusinessBlockedRead.status, 403);

        const crossBusinessBlockedCreate = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/blocked-times`,
          {
            method: "POST",
            body: JSON.stringify({
              start: "2099-04-06T11:00:00.000Z",
              end: "2099-04-06T11:30:00.000Z",
              reason: "cross blocked",
            }),
          },
          sessionA
        );
        assert.equal(crossBusinessBlockedCreate.status, 403);

        const crossBusinessBlockedPatch = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/blocked-times/${blockedTimeB.body.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              start: "2099-04-06T10:15:00.000Z",
              end: "2099-04-06T10:45:00.000Z",
              reason: "cross patch",
            }),
          },
          sessionA
        );
        assert.equal(crossBusinessBlockedPatch.status, 403);

        const crossBusinessBlockedDelete = await fetch(
          buildUrl(
            running.port,
            `/api/business/${signupB.body.businessId}/blocked-times/${blockedTimeB.body.id}`
          ),
          {
            method: "DELETE",
            headers: { Cookie: sessionA.cookie },
            redirect: "manual",
          }
        );
        assert.equal(crossBusinessBlockedDelete.status, 403);

        const slotsA = await requestJson<Array<{ start: string }>>(
          running.port,
          `/api/business/${signupA.body.businessId}/slots?date=2099-04-06&serviceIds=${serviceA.body.id}`,
          { method: "GET" },
          sessionA
        );
        assert.equal(slotsA.status, 200);
        assert.equal(slotsA.body.length > 0, true);

        const crossBusinessSlots = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/slots?date=2099-04-06&serviceIds=${serviceB.body.id}`,
          { method: "GET" },
          sessionA
        );
        assert.equal(crossBusinessSlots.status, 403);

        const bookingA = await requestJson<{ id: string; businessId: string }>(
          running.port,
          `/api/business/${signupA.body.businessId}/bookings`,
          {
            method: "POST",
            body: JSON.stringify({
              requestedStart: "2099-04-06T09:00:00.000Z",
              serviceIds: [serviceA.body.id],
              customer: {
                name: "Customer A",
                phone: "07000000000",
                email: "customer-a@example.com",
              },
            }),
          },
          sessionA
        );
        assert.equal(bookingA.status, 201);
        assert.equal(bookingA.body.businessId, signupA.body.businessId);

        const bookingB = await requestJson<{ id: string; businessId: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/bookings`,
          {
            method: "POST",
            body: JSON.stringify({
              requestedStart: "2099-04-06T10:30:00.000Z",
              serviceIds: [serviceB.body.id],
              customer: {
                name: "Customer B",
                phone: "07000000001",
                email: "customer-b@example.com",
              },
            }),
          },
          sessionB
        );
        assert.equal(bookingB.status, 201);
        assert.equal(bookingB.body.businessId, signupB.body.businessId);

        const crossBusinessBookings = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/bookings`,
          { method: "GET" },
          sessionA
        );
        assert.equal(crossBusinessBookings.status, 403);

        const ownBookingsA = await requestJson<Array<{ id: string; businessId: string }>>(
          running.port,
          `/api/business/${signupA.body.businessId}/bookings`,
          { method: "GET" },
          sessionA
        );
        assert.equal(ownBookingsA.status, 200);
        assert.equal(ownBookingsA.body.some((booking) => booking.id === bookingA.body.id), true);
        assert.equal(ownBookingsA.body.some((booking) => booking.id === bookingB.body.id), false);

        const crossBusinessBookingCreate = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/bookings`,
          {
            method: "POST",
            body: JSON.stringify({
              requestedStart: "2099-04-06T11:30:00.000Z",
              serviceIds: [serviceB.body.id],
              customer: {
                name: "Cross Customer",
                phone: "07000000009",
                email: "cross@example.com",
              },
            }),
          },
          sessionA
        );
        assert.equal(crossBusinessBookingCreate.status, 403);

        const crossBusinessBookingCancel = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/bookings/${bookingB.body.id}/cancel`,
          { method: "PATCH" },
          sessionA
        );
        assert.equal(crossBusinessBookingCancel.status, 403);

        const crossBusinessBookingReschedule = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/bookings/${bookingB.body.id}/reschedule`,
          {
            method: "PATCH",
            body: JSON.stringify({
              requestedStart: "2099-04-06T12:30:00.000Z",
            }),
          },
          sessionA
        );
        assert.equal(crossBusinessBookingReschedule.status, 403);

        const crossBusinessBookingComplete = await requestJson<{ error: string }>(
          running.port,
          `/api/business/${signupB.body.businessId}/bookings/${bookingB.body.id}/complete`,
          { method: "PATCH" },
          sessionA
        );
        assert.equal(crossBusinessBookingComplete.status, 403);

        const publicBusinessA = await requestJson<{ id: string; bookingPageSlug: string }>(
          running.port,
          `/api/booking-page/${slugA}`,
          { method: "GET" }
        );
        assert.equal(publicBusinessA.status, 200);
        assert.equal(readBusinessId(publicBusinessA.body), signupA.body.businessId);
        assert.equal(readBusinessSlug(publicBusinessA.body), slugA);

        const publicBusinessB = await requestJson<{ id: string; bookingPageSlug: string }>(
          running.port,
          `/api/booking-page/${slugB}`,
          { method: "GET" }
        );
        assert.equal(publicBusinessB.status, 200);
        assert.equal(readBusinessId(publicBusinessB.body), signupB.body.businessId);
        assert.equal(readBusinessSlug(publicBusinessB.body), slugB);

        const publicServicesA = await requestJson<Array<{ id: string }>>(
          running.port,
          `/api/booking-page/${slugA}/services`,
          { method: "GET" }
        );
        assert.equal(publicServicesA.status, 200);
        assert.equal(publicServicesA.body.some((service) => service.id === serviceA.body.id), true);
        assert.equal(publicServicesA.body.some((service) => service.id === serviceB.body.id), false);

        const publicServicesB = await requestJson<Array<{ id: string }>>(
          running.port,
          `/api/booking-page/${slugB}/services`,
          { method: "GET" }
        );
        assert.equal(publicServicesB.status, 200);
        assert.equal(publicServicesB.body.some((service) => service.id === serviceB.body.id), true);
        assert.equal(publicServicesB.body.some((service) => service.id === serviceA.body.id), false);

        const wrongAdminSessionRedirect = await fetch(
          buildUrl(running.port, `/admin/${signupA.body.businessId}`),
          {
            headers: { Cookie: sessionB.cookie },
            redirect: "manual",
          }
        );
        assert.equal(wrongAdminSessionRedirect.status, 302);
        assert.equal(wrongAdminSessionRedirect.headers.get("location"), `/admin/${signupB.body.businessId}`);

        const duplicateSlugSignup = await requestJson<{ error: string }>(running.port, "/api/signup", {
          method: "POST",
          body: JSON.stringify({
            businessName: "Duplicate Slug",
            ownerName: "Owner C",
            email: `dup-${slugA}@example.com`,
            password: "auditpass123",
            timezone: "Europe/London",
            bookingSlug: slugA,
          }),
        });
        assert.equal(duplicateSlugSignup.status, 400);
        assert.match(duplicateSlugSignup.body.error, /slug is already taken/i);

        const logoutA = await requestJson<{ ok: boolean }>(
          running.port,
          "/api/logout",
          { method: "POST" },
          sessionA
        );
        assert.equal(logoutA.status, 200);

        const postLogoutSession = await requestJson<{ error: string }>(
          running.port,
          "/api/session",
          { method: "GET" },
          sessionA
        );
        assert.equal(postLogoutSession.status, 401);

        const loginA = await requestJson<{ businessId: string; adminUrl: string }>(
          running.port,
          "/api/login",
          {
            method: "POST",
            body: JSON.stringify({
              email: emailA,
              password: "auditpass123",
            }),
          },
          loginSession
        );
        assert.equal(loginA.status, 200);
        assert.equal(loginA.body.businessId, signupA.body.businessId);
        assert.equal(loginA.body.adminUrl, `/admin/${signupA.body.businessId}`);

        const loginSessionCheck = await requestJson<{ business: { id: string } }>(
          running.port,
          "/api/session",
          { method: "GET" },
          loginSession
        );
        assert.equal(loginSessionCheck.status, 200);
        assert.equal(readSessionBusinessId(loginSessionCheck.body), signupA.body.businessId);

        const loginPageRedirectWhenAuthed = await fetch(buildUrl(running.port, "/login"), {
          headers: { Cookie: loginSession.cookie },
          redirect: "manual",
        });
        assert.equal(loginPageRedirectWhenAuthed.status, 302);
        assert.equal(loginPageRedirectWhenAuthed.headers.get("location"), `/admin/${signupA.body.businessId}`);
      } finally {
        await running.stop();
      }
    },
  },
];

let failed = 0;

for (const currentTest of tests) {
  try {
    await currentTest.run();
    console.log(`PASS ${currentTest.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${currentTest.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS ${tests.length} tests`);
}
