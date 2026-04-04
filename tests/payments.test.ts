// @ts-nocheck

const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const fs = require("node:fs").promises;
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const EMPTY_STATE = {
  businesses: [],
  servicesByBusinessId: {},
  availabilityByBusinessId: {},
  blockedTimesByBusinessId: {},
  bookingsByBusinessId: {},
};

const REPO_ROOT = process.cwd();
const TUESDAY = 2;
const BOOKING_START = "2099-04-07T09:00:00.000Z";

function buildUrl(port, pathname) {
  return `http://127.0.0.1:${port}${pathname}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response, got: ${text}`);
  }
}

async function requestJson(port, pathname, init = {}, session) {
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
    redirect: "manual",
  });

  const setCookie = response.headers.get("set-cookie");
  if (session && setCookie) {
    session.cookie = setCookie.split(";")[0];
  }

  const bodyText = await response.text();
  return {
    status: response.status,
    body: bodyText ? parseJson(bodyText) : {},
  };
}

async function waitForHealth(port, timeoutMs = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(buildUrl(port, "/health"));
      if (response.ok) {
        return;
      }
    } catch {
      // Server may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for server health endpoint.");
}

async function startServerForTest() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "booking-payments-tests-"));
  const dataFile = path.join(dataDir, "store.json");
  await fs.writeFile(dataFile, JSON.stringify(EMPTY_STATE, null, 2), "utf-8");

  const port = 4100 + Math.floor(Math.random() * 400);
  const serverProcess = spawn("node", ["--loader", "ts-node/esm", "server.ts"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      BOOKING_SYSTEM_DATA_FILE: dataFile,
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderrBuffer = "";
  serverProcess.stderr.on("data", (chunk) => {
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

      await new Promise((resolve) => {
        serverProcess.once("exit", () => resolve());
        serverProcess.kill();
      });
    },
  };
}

async function signUpBusiness(port, session, overrides = {}) {
  const slug = overrides.slug ?? `payments-${Math.random().toString(36).slice(2, 10)}`;
  const email = overrides.email ?? `${slug}@example.com`;
  const password = overrides.password ?? "auditpass123";

  const signup = await requestJson(
    port,
    "/api/signup",
    {
      method: "POST",
      body: JSON.stringify({
        businessName: overrides.businessName ?? "Payments Proof",
        ownerName: overrides.ownerName ?? "Owner",
        email,
        password,
        timezone: overrides.timezone ?? "UTC",
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

async function createService(port, businessId, session, price = 25) {
  const response = await requestJson(
    port,
    `/api/business/${businessId}/services`,
    {
      method: "POST",
      body: JSON.stringify({
        name: "Deposit Service",
        durationMinutes: 30,
        price,
        bufferMinutes: 0,
      }),
    },
    session
  );

  assert.equal(response.status, 201);
  return response.body;
}

async function saveAvailability(port, businessId, session) {
  const response = await requestJson(
    port,
    `/api/business/${businessId}/availability`,
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

  assert.equal(response.status, 200);
}

async function updatePaymentConfig(port, businessId, session, config) {
  return requestJson(
    port,
    `/api/business/${businessId}/payment-config`,
    {
      method: "PUT",
      body: JSON.stringify(config),
    },
    session
  );
}

async function getPaymentConfig(port, businessId, session) {
  return requestJson(
    port,
    `/api/business/${businessId}/payment-config`,
    { method: "GET" },
    session
  );
}

async function createPublicBooking(port, slug, serviceIds) {
  return requestJson(port, `/api/booking-page/${slug}/bookings`, {
    method: "POST",
    body: JSON.stringify({
      requestedStart: BOOKING_START,
      serviceIds,
      customer: {
        name: "Payment Customer",
        phone: "07000000000",
        email: "payment-customer@example.com",
      },
    }),
  });
}

async function updateBookingPayment(port, businessId, bookingId, session, payload) {
  return requestJson(
    port,
    `/api/business/${businessId}/bookings/${bookingId}/payment`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    session
  );
}

test("payment config defaults to disabled for a fresh business", async () => {
  const running = await startServerForTest();

  try {
    const session = { cookie: "" };
    const { businessId } = await signUpBusiness(running.port, session);
    const config = await getPaymentConfig(running.port, businessId, session);

    assert.equal(config.status, 200);
    assert.deepEqual(config.body, {
      depositEnabled: false,
      depositType: "fixed",
      depositAmount: 0,
    });
  } finally {
    await running.stop();
  }
}, 20000);

test("saving payment config returns 200 and subsequent GET returns the saved values", async () => {
  const running = await startServerForTest();

  try {
    const session = { cookie: "" };
    const { businessId } = await signUpBusiness(running.port, session);
    const saved = await updatePaymentConfig(running.port, businessId, session, {
      depositEnabled: true,
      depositType: "fixed",
      depositAmount: 500,
    });

    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body, {
      depositEnabled: true,
      depositType: "fixed",
      depositAmount: 500,
    });

    const retrieved = await getPaymentConfig(running.port, businessId, session);
    assert.equal(retrieved.status, 200);
    assert.deepEqual(retrieved.body, {
      depositEnabled: true,
      depositType: "fixed",
      depositAmount: 500,
    });
  } finally {
    await running.stop();
  }
}, 20000);

test("booking with deposit disabled creates a confirmed booking with not_required payment status", async () => {
  const running = await startServerForTest();

  try {
    const session = { cookie: "" };
    const { businessId, slug } = await signUpBusiness(running.port, session);
    const service = await createService(running.port, businessId, session, 25);
    await saveAvailability(running.port, businessId, session);
    await updatePaymentConfig(running.port, businessId, session, {
      depositEnabled: false,
      depositType: "fixed",
      depositAmount: 0,
    });

    const booking = await createPublicBooking(running.port, slug, [service.id]);
    assert.equal(booking.status, 201);
    assert.equal(booking.body.status, "confirmed");
    assert.equal(booking.body.paymentStatus, "not_required");
  } finally {
    await running.stop();
  }
}, 20000);

test("booking with deposit enabled creates a pending_payment booking with pending payment status", async () => {
  const running = await startServerForTest();

  try {
    const session = { cookie: "" };
    const { businessId, slug } = await signUpBusiness(running.port, session);
    const service = await createService(running.port, businessId, session, 25);
    await saveAvailability(running.port, businessId, session);
    await updatePaymentConfig(running.port, businessId, session, {
      depositEnabled: true,
      depositType: "fixed",
      depositAmount: 500,
    });

    const booking = await createPublicBooking(running.port, slug, [service.id]);
    assert.equal(booking.status, 201);
    assert.equal(booking.body.status, "pending_payment");
    assert.equal(booking.body.paymentStatus, "pending");
    assert.equal(booking.body.depositAmount, 500);
  } finally {
    await running.stop();
  }
}, 20000);

test("mark paid transitions a pending payment booking to confirmed and paid", async () => {
  const running = await startServerForTest();

  try {
    const session = { cookie: "" };
    const { businessId, slug } = await signUpBusiness(running.port, session);
    const service = await createService(running.port, businessId, session, 25);
    await saveAvailability(running.port, businessId, session);
    await updatePaymentConfig(running.port, businessId, session, {
      depositEnabled: true,
      depositType: "fixed",
      depositAmount: 500,
    });

    const booking = await createPublicBooking(running.port, slug, [service.id]);
    const paid = await updateBookingPayment(running.port, businessId, booking.body.id, session, {
      action: "mark_paid",
      paymentStatus: "paid",
    });

    assert.equal(paid.status, 200);
    assert.equal(paid.body.status, "confirmed");
    assert.equal(paid.body.paymentStatus, "paid");
  } finally {
    await running.stop();
  }
}, 20000);

test("refund transitions a paid booking to cancelled and refunded", async () => {
  const running = await startServerForTest();

  try {
    const session = { cookie: "" };
    const { businessId, slug } = await signUpBusiness(running.port, session);
    const service = await createService(running.port, businessId, session, 25);
    await saveAvailability(running.port, businessId, session);
    await updatePaymentConfig(running.port, businessId, session, {
      depositEnabled: true,
      depositType: "fixed",
      depositAmount: 500,
    });

    const booking = await createPublicBooking(running.port, slug, [service.id]);
    const paid = await updateBookingPayment(running.port, businessId, booking.body.id, session, {
      action: "mark_paid",
      paymentStatus: "paid",
    });
    assert.equal(paid.status, 200);

    const refunded = await updateBookingPayment(running.port, businessId, booking.body.id, session, {
      action: "refund",
      paymentStatus: "refunded",
    });

    assert.equal(refunded.status, 200);
    assert.equal(refunded.body.status, "cancelled");
    assert.equal(refunded.body.paymentStatus, "refunded");
  } finally {
    await running.stop();
  }
}, 20000);

test("invalid payment action is rejected with 400", async () => {
  const running = await startServerForTest();

  try {
    const session = { cookie: "" };
    const { businessId, slug } = await signUpBusiness(running.port, session);
    const service = await createService(running.port, businessId, session, 25);
    await saveAvailability(running.port, businessId, session);
    await updatePaymentConfig(running.port, businessId, session, {
      depositEnabled: true,
      depositType: "fixed",
      depositAmount: 500,
    });

    const booking = await createPublicBooking(running.port, slug, [service.id]);
    const rejected = await updateBookingPayment(running.port, businessId, booking.body.id, session, {
      action: "nonsense",
    });

    assert.equal(rejected.status, 400);
  } finally {
    await running.stop();
  }
}, 20000);
