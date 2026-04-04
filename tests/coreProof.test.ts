import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

process.env.BOOKING_SYSTEM_DATA_FILE = path.join(
  mkdtempSync(path.join(tmpdir(), "booking-core-proof-")),
  "store.json"
);

const { BookingStore } = await import("../bookingStore.ts");
const { getDataFilePath } = await import("../Persistence.ts");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const EMPTY_STATE = {
  businesses: [],
  servicesByBusinessId: {},
  availabilityByBusinessId: {},
  blockedTimesByBusinessId: {},
  bookingsByBusinessId: {},
};

async function resetStore(): Promise<void> {
  await fs.writeFile(getDataFilePath(), JSON.stringify(EMPTY_STATE, null, 2), "utf-8");
}

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

type CookieSession = {
  cookie: string;
};

type RunningServer = {
  port: number;
  stop: () => Promise<void>;
};

function buildUrl(port: number, pathname: string): string {
  return `http://127.0.0.1:${port}${pathname}`;
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON response, got: ${text}`);
  }
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

async function startServerForTest(): Promise<RunningServer> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "booking-core-route-tests-"));
  const dataFile = path.join(dataDir, "store.json");
  await fs.writeFile(dataFile, JSON.stringify(EMPTY_STATE, null, 2), "utf-8");

  const port = 3600 + Math.floor(Math.random() * 500);

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

const TUESDAY = 2; // 2099-04-07 is a Tuesday
const TUESDAY_DATE = new Date("2099-04-07");

const tests: TestCase[] = [
  {
    name: "service create persists all fields and list returns them",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_svc_proof",
        name: "Service Proof",
        ownerName: "Owner",
        ownerEmail: "svc-proof@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "svc-proof",
      });

      const svc1 = await store.createService({
        businessId: "biz_svc_proof",
        name: "Haircut",
        durationMinutes: 30,
        price: 20,
        active: true,
        bufferMinutes: 5,
      });

      const svc2 = await store.createService({
        businessId: "biz_svc_proof",
        name: "Beard Trim",
        durationMinutes: 15,
        price: 10,
        active: false,
        bufferMinutes: 0,
      });

      assert.equal(svc1.id.startsWith("svc_"), true);
      assert.equal(svc1.name, "Haircut");
      assert.equal(svc1.durationMinutes, 30);
      assert.equal(svc1.price, 20);
      assert.equal(svc1.active, true);
      assert.equal(svc1.bufferMinutes, 5);

      const services = store.listServices("biz_svc_proof");
      assert.equal(services.length, 2);
      assert.equal(
        services.some(
          (s) =>
            s.id === svc1.id &&
            s.name === "Haircut" &&
            s.active === true &&
            s.durationMinutes === 30 &&
            s.bufferMinutes === 5
        ),
        true
      );
      assert.equal(
        services.some(
          (s) =>
            s.id === svc2.id &&
            s.name === "Beard Trim" &&
            s.active === false &&
            s.durationMinutes === 15
        ),
        true
      );
    },
  },

  {
    name: "service lifecycle route supports edit, activate/deactivate, and remove",
    run: async () => {
      const running = await startServerForTest();

      try {
        const session: CookieSession = { cookie: "" };
        const slug = `service-life-${Math.random().toString(36).slice(2, 10)}`;
        const email = `${slug}@example.com`;

        const signup = await requestJson<{ businessId: string }>(
          running.port,
          "/api/signup",
          {
            method: "POST",
            body: JSON.stringify({
              businessName: "Service Lifecycle",
              ownerName: "Owner",
              email,
              password: "auditpass123",
              timezone: "UTC",
              bookingSlug: slug,
            }),
          },
          session
        );

        assert.equal(signup.status, 201);

        const created = await requestJson<{
          id: string;
          name: string;
          durationMinutes: number;
          price: number;
          active: boolean;
          bufferMinutes: number;
        }>(
          running.port,
          `/api/business/${signup.body.businessId}/services`,
          {
            method: "POST",
            body: JSON.stringify({
              name: "Initial Service",
              durationMinutes: 30,
              price: 20,
              active: true,
              bufferMinutes: 5,
            }),
          },
          session
        );
        assert.equal(created.status, 201);
        assert.equal(created.body.active, true);

        const edited = await requestJson<{
          id: string;
          name: string;
          durationMinutes: number;
          price: number;
          active: boolean;
          bufferMinutes: number;
        }>(
          running.port,
          `/api/business/${signup.body.businessId}/services/${created.body.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: "Updated Service",
              durationMinutes: 45,
              price: 35,
              bufferMinutes: 10,
            }),
          },
          session
        );
        assert.equal(edited.status, 200);
        assert.equal(edited.body.id, created.body.id);
        assert.equal(edited.body.name, "Updated Service");
        assert.equal(edited.body.durationMinutes, 45);
        assert.equal(edited.body.price, 35);
        assert.equal(edited.body.bufferMinutes, 10);
        assert.equal(edited.body.active, true);

        const deactivated = await requestJson<{ id: string; active: boolean }>(
          running.port,
          `/api/business/${signup.body.businessId}/services/${created.body.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ active: false }),
          },
          session
        );
        assert.equal(deactivated.status, 200);
        assert.equal(deactivated.body.id, created.body.id);
        assert.equal(deactivated.body.active, false);

        const reactivated = await requestJson<{ id: string; active: boolean }>(
          running.port,
          `/api/business/${signup.body.businessId}/services/${created.body.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ active: true }),
          },
          session
        );
        assert.equal(reactivated.status, 200);
        assert.equal(reactivated.body.id, created.body.id);
        assert.equal(reactivated.body.active, true);

        const servicesBeforeDelete = await requestJson<Array<{ id: string; active: boolean }>>(
          running.port,
          `/api/business/${signup.body.businessId}/services`,
          { method: "GET" },
          session
        );
        assert.equal(servicesBeforeDelete.status, 200);
        assert.equal(servicesBeforeDelete.body.some((service) => service.id === created.body.id), true);

        const deleted = await fetch(
          buildUrl(running.port, `/api/business/${signup.body.businessId}/services/${created.body.id}`),
          {
            method: "DELETE",
            headers: { Cookie: session.cookie },
            redirect: "manual",
          }
        );
        assert.equal(deleted.status, 204);

        const servicesAfterDelete = await requestJson<Array<{ id: string }>>(
          running.port,
          `/api/business/${signup.body.businessId}/services`,
          { method: "GET" },
          session
        );
        assert.equal(servicesAfterDelete.status, 200);
        assert.equal(servicesAfterDelete.body.some((service) => service.id === created.body.id), false);
      } finally {
        await running.stop();
      }
    },
  },

  {
    name: "weekly availability round-trip: updateWeeklyAvailability persists and listWeeklyAvailability reads back correctly",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_avail_proof",
        name: "Avail Proof",
        ownerName: "Owner",
        ownerEmail: "avail-proof@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "avail-proof",
      });

      const stored = await store.updateWeeklyAvailability({
        businessId: "biz_avail_proof",
        availability: [
          { dayOfWeek: 1, startMinutes: 9 * 60, endMinutes: 12 * 60, active: true },
          { dayOfWeek: 4, startMinutes: 13 * 60, endMinutes: 17 * 60, active: true },
        ],
      });

      assert.equal(stored.length, 2);

      const retrieved = store.listWeeklyAvailability("biz_avail_proof");
      assert.equal(retrieved.length, 2);
      assert.equal(
        retrieved.some(
          (w) => w.dayOfWeek === 1 && w.startMinutes === 540 && w.endMinutes === 720 && w.active === true
        ),
        true
      );
      assert.equal(
        retrieved.some(
          (w) => w.dayOfWeek === 4 && w.startMinutes === 780 && w.endMinutes === 1020 && w.active === true
        ),
        true
      );
    },
  },

  {
    name: "multiple non-overlapping windows on same day are stored and generate slots in each window",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_multi_window",
        name: "Multi Window",
        ownerName: "Owner",
        ownerEmail: "multi-window@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "multi-window",
      });

      const service = await store.createService({
        businessId: "biz_multi_window",
        name: "Slot Service",
        durationMinutes: 60,
        price: 50,
        bufferMinutes: 0,
      });

      // Two non-overlapping windows on Tuesday (dayOfWeek=2)
      const stored = await store.updateWeeklyAvailability({
        businessId: "biz_multi_window",
        availability: [
          { dayOfWeek: TUESDAY, startMinutes: 9 * 60, endMinutes: 11 * 60, active: true },
          { dayOfWeek: TUESDAY, startMinutes: 14 * 60, endMinutes: 16 * 60, active: true },
        ],
      });

      assert.equal(stored.filter((w) => w.dayOfWeek === TUESDAY).length, 2);

      const retrieved = store.listWeeklyAvailability("biz_multi_window");
      assert.equal(retrieved.filter((w) => w.dayOfWeek === TUESDAY).length, 2);

      // 2099-04-07 is a Tuesday (UTC) — same as TUESDAY_DATE
      const slots = store.getAvailableSlots("biz_multi_window", TUESDAY_DATE, [service.id], 60);

      const startTimes = slots.map((s) => s.start.toISOString());
      // Morning window 09:00–11:00: two 60-min slots
      assert.equal(startTimes.includes("2099-04-07T09:00:00.000Z"), true);
      assert.equal(startTimes.includes("2099-04-07T10:00:00.000Z"), true);
      // Afternoon window 14:00–16:00: two 60-min slots
      assert.equal(startTimes.includes("2099-04-07T14:00:00.000Z"), true);
      assert.equal(startTimes.includes("2099-04-07T15:00:00.000Z"), true);
      // No crossover — morning slots not in afternoon and vice versa
      assert.equal(slots.length, 4);
    },
  },

  {
    name: "blocked time create, edit, and remove lifecycle",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_blocked_lifecycle",
        name: "Blocked Lifecycle",
        ownerName: "Owner",
        ownerEmail: "blocked-lifecycle@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "blocked-lifecycle",
      });

      // Create
      const created = await store.createBlockedTime({
        businessId: "biz_blocked_lifecycle",
        start: new Date("2099-06-01T10:00:00.000Z"),
        end: new Date("2099-06-01T10:30:00.000Z"),
        reason: "Original closure",
      });

      assert.equal(created.id.startsWith("blk_"), true);
      assert.equal(created.start.toISOString(), "2099-06-01T10:00:00.000Z");
      assert.equal(created.end.toISOString(), "2099-06-01T10:30:00.000Z");
      assert.equal(created.reason, "Original closure");

      const listedAfterCreate = store.listBlockedTimesForDate(
        "biz_blocked_lifecycle",
        new Date("2099-06-01")
      );
      assert.equal(listedAfterCreate.length, 1);
      assert.equal(listedAfterCreate[0].id, created.id);

      // Edit
      const updated = await store.updateBlockedTime({
        businessId: "biz_blocked_lifecycle",
        blockedTimeId: created.id,
        start: new Date("2099-06-01T14:00:00.000Z"),
        end: new Date("2099-06-01T15:00:00.000Z"),
        reason: "Updated closure",
      });

      assert.equal(updated.id, created.id);
      assert.equal(updated.start.toISOString(), "2099-06-01T14:00:00.000Z");
      assert.equal(updated.end.toISOString(), "2099-06-01T15:00:00.000Z");
      assert.equal(updated.reason, "Updated closure");

      const listedAfterEdit = store.listBlockedTimesForDate(
        "biz_blocked_lifecycle",
        new Date("2099-06-01")
      );
      assert.equal(listedAfterEdit.length, 1);
      assert.equal(listedAfterEdit[0].id, created.id);
      assert.equal(listedAfterEdit[0].reason, "Updated closure");
      assert.equal(listedAfterEdit[0].start.toISOString(), "2099-06-01T14:00:00.000Z");

      // Remove
      await store.deleteBlockedTime("biz_blocked_lifecycle", created.id);

      const listedAfterDelete = store.listBlockedTimesForDate(
        "biz_blocked_lifecycle",
        new Date("2099-06-01")
      );
      assert.equal(listedAfterDelete.length, 0);
    },
  },

  {
    name: "booking cancellation transitions status to cancelled and appears in listing",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_cancel_proof",
        name: "Cancel Proof",
        ownerName: "Owner",
        ownerEmail: "cancel-proof@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "cancel-proof",
      });

      const service = await store.createService({
        businessId: "biz_cancel_proof",
        name: "The Service",
        durationMinutes: 30,
        price: 25,
      });

      await store.updateWeeklyAvailability({
        businessId: "biz_cancel_proof",
        availability: [
          { dayOfWeek: TUESDAY, startMinutes: 9 * 60, endMinutes: 12 * 60, active: true },
        ],
      });

      // 2099-04-07 is a Tuesday, 09:00 UTC is within the availability window
      const booking = await store.createBooking({
        businessId: "biz_cancel_proof",
        requestedStart: new Date("2099-04-07T09:00:00.000Z"),
        serviceIds: [service.id],
        customer: {
          name: "Test Customer",
          phone: "07000000000",
          email: "customer@example.com",
        },
      });

      assert.equal(booking.status, "confirmed");
      assert.equal(booking.businessId, "biz_cancel_proof");
      assert.equal(booking.id.startsWith("bkg_"), true);

      const cancelled = await store.cancelBooking("biz_cancel_proof", booking.id);
      assert.equal(cancelled.id, booking.id);
      assert.equal(cancelled.status, "cancelled");

      const bookings = store.listBookings("biz_cancel_proof");
      const found = bookings.find((b) => b.id === booking.id);
      assert.ok(found, "Cancelled booking must appear in listing");
      assert.equal(found.status, "cancelled");
    },
  },
  {
    name: "public booking page route serves slug page and cancel API marks booking cancelled in response and listing",
    run: async () => {
      const running = await startServerForTest();

      try {
        const session: CookieSession = { cookie: "" };
        const slug = `core-proof-${Math.random().toString(36).slice(2, 10)}`;
        const email = `${slug}@example.com`;

        const signup = await requestJson<{ businessId: string }>(
          running.port,
          "/api/signup",
          {
            method: "POST",
            body: JSON.stringify({
              businessName: "Core Proof Routes",
              ownerName: "Owner",
              email,
              password: "auditpass123",
              timezone: "UTC",
              bookingSlug: slug,
            }),
          },
          session
        );

        assert.equal(signup.status, 201);

        const bookingPage = await fetch(buildUrl(running.port, `/booking/${slug}`), {
          redirect: "manual",
        });
        const bookingPageHtml = await bookingPage.text();
        assert.equal(bookingPage.status, 200);
        assert.match(bookingPageHtml, /<!doctype html>|<html/i);

        const service = await requestJson<{ id: string }>(
          running.port,
          `/api/business/${signup.body.businessId}/services`,
          {
            method: "POST",
            body: JSON.stringify({
              name: "Route Test Service",
              durationMinutes: 30,
              price: 25,
              bufferMinutes: 0,
            }),
          },
          session
        );
        assert.equal(service.status, 201);

        const availability = await requestJson<Array<{ dayOfWeek: number }>>(
          running.port,
          `/api/business/${signup.body.businessId}/availability`,
          {
            method: "PUT",
            body: JSON.stringify({
              availability: [
                { dayOfWeek: TUESDAY, startMinutes: 9 * 60, endMinutes: 12 * 60, active: true },
              ],
            }),
          },
          session
        );
        assert.equal(availability.status, 200);

        const booking = await requestJson<{ id: string; status: string }>(
          running.port,
          `/api/business/${signup.body.businessId}/bookings`,
          {
            method: "POST",
            body: JSON.stringify({
              requestedStart: "2099-04-07T09:00:00.000Z",
              serviceIds: [service.body.id],
              customer: {
                name: "Route Customer",
                phone: "07000000000",
                email: "route-customer@example.com",
              },
            }),
          },
          session
        );
        assert.equal(booking.status, 201);
        assert.equal(booking.body.status, "confirmed");

        const cancelled = await requestJson<{ id: string; status: string }>(
          running.port,
          `/api/business/${signup.body.businessId}/bookings/${booking.body.id}/cancel`,
          { method: "PATCH" },
          session
        );
        assert.equal(cancelled.status, 200);
        assert.equal(cancelled.body.id, booking.body.id);
        assert.equal(cancelled.body.status, "cancelled");

        const bookings = await requestJson<Array<{ id: string; status: string }>>(
          running.port,
          `/api/business/${signup.body.businessId}/bookings`,
          { method: "GET" },
          session
        );
        assert.equal(bookings.status, 200);

        const listedBooking = bookings.body.find((item) => item.id === booking.body.id);
        assert.ok(listedBooking, "Cancelled booking must remain visible in booking list");
        assert.equal(listedBooking.status, "cancelled");
      } finally {
        await running.stop();
      }
    },
  },
];

let failed = 0;

for (const currentTest of tests) {
  try {
    await resetStore();
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
