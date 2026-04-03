import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.BOOKING_SYSTEM_DATA_FILE = path.join(
  mkdtempSync(path.join(tmpdir(), "booking-system-tests-")),
  "store.json"
);

const {
  conflictsWithExistingTime,
  generateAvailableSlots,
} = await import("../bookingCore.ts");

const { BookingStore } = await import("../bookingStore.ts");
const { getDataFilePath } = await import("../Persistence.ts");

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

const tests: TestCase[] = [
  {
    name: "conflictsWithExistingTime detects overlapping confirmed bookings and ignores cancelled ones",
    run: () => {
      const overlapping = conflictsWithExistingTime(
        new Date("2026-04-07T09:15:00.000Z"),
        new Date("2026-04-07T09:45:00.000Z"),
        [
          {
            id: "booking-confirmed",
            start: new Date("2026-04-07T09:00:00.000Z"),
            end: new Date("2026-04-07T09:30:00.000Z"),
            status: "confirmed",
          },
          {
            id: "booking-cancelled",
            start: new Date("2026-04-07T09:30:00.000Z"),
            end: new Date("2026-04-07T10:00:00.000Z"),
            status: "cancelled",
          },
        ],
        []
      );

      assert.equal(overlapping, true);
    },
  },
  {
    name: "generateAvailableSlots uses the business timezone and supports multiple windows in one day",
    run: () => {
      const slots = generateAvailableSlots({
        date: new Date("2026-07-01"),
        services: [
          {
            id: "svc_cut",
            name: "Haircut",
            durationMinutes: 60,
            price: 25,
            active: true,
            bufferMinutes: 0,
          },
        ],
        availability: [
          { dayOfWeek: 3, startMinutes: 9 * 60, endMinutes: 10 * 60, active: true },
          { dayOfWeek: 3, startMinutes: 13 * 60, endMinutes: 14 * 60, active: true },
        ],
        bookings: [],
        blockedTimes: [],
        stepMinutes: 60,
        timeZone: "America/New_York",
      });

      assert.deepEqual(
        slots.map((slot) => slot.start.toISOString()),
        ["2026-07-01T13:00:00.000Z", "2026-07-01T17:00:00.000Z"]
      );
    },
  },
  {
    name: "updateWeeklyAvailability rejects overlapping active windows on the same day",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_overlap_check",
        name: "Overlap Check",
        ownerName: "Owner Example",
        ownerEmail: "overlap@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "Europe/London",
        bookingPageSlug: "overlap-check",
      });

      await assert.rejects(
        () =>
          store.updateWeeklyAvailability({
            businessId: "biz_overlap_check",
            availability: [
              { dayOfWeek: 1, startMinutes: 9 * 60, endMinutes: 12 * 60, active: true },
              { dayOfWeek: 1, startMinutes: 11 * 60, endMinutes: 14 * 60, active: true },
            ],
          }),
        /overlap/i
      );
    },
  },
  {
    name: "blocked times spanning midnight are considered when generating the next day's slots",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_midnight_block",
        name: "Midnight Block",
        ownerName: "Owner Example",
        ownerEmail: "midnight@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "midnight-block",
      });

      const service = await store.createService({
        businessId: "biz_midnight_block",
        name: "Trim",
        durationMinutes: 30,
        price: 20,
      });

      await store.updateWeeklyAvailability({
        businessId: "biz_midnight_block",
        availability: [{ dayOfWeek: 6, startMinutes: 9 * 60, endMinutes: 11 * 60, active: true }],
      });

      await store.createBlockedTime({
        businessId: "biz_midnight_block",
        start: new Date("2026-04-10T23:30:00.000Z"),
        end: new Date("2026-04-11T09:30:00.000Z"),
        reason: "Overnight closure",
      });

      const slots = store.getAvailableSlots(
        "biz_midnight_block",
        new Date("2026-04-11"),
        [service.id],
        30
      );

      assert.deepEqual(
        slots.map((slot) => slot.start.toISOString()),
        ["2026-04-11T09:30:00.000Z", "2026-04-11T10:00:00.000Z", "2026-04-11T10:30:00.000Z"]
      );
    },
  },
  {
    name: "createBooking rejects a second booking that overlaps an existing confirmed booking",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_double_booking",
        name: "Double Booking Check",
        ownerName: "Owner Example",
        ownerEmail: "double-booking@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "double-booking-check",
      });

      const service = await store.createService({
        businessId: "biz_double_booking",
        name: "Cut",
        durationMinutes: 30,
        price: 18,
      });

      await store.updateWeeklyAvailability({
        businessId: "biz_double_booking",
        availability: [{ dayOfWeek: 2, startMinutes: 9 * 60, endMinutes: 12 * 60, active: true }],
      });

      await store.createBooking({
        businessId: "biz_double_booking",
        requestedStart: new Date("2099-04-07T09:00:00.000Z"),
        serviceIds: [service.id],
        customer: {
          name: "First Customer",
          phone: "0001",
          email: "first@example.com",
        },
      });

      await assert.rejects(
        () =>
          store.createBooking({
            businessId: "biz_double_booking",
            requestedStart: new Date("2099-04-07T09:15:00.000Z"),
            serviceIds: [service.id],
            customer: {
              name: "Second Customer",
              phone: "0002",
              email: "second@example.com",
            },
          }),
        /no longer available/i
      );
    },
  },
  {
    name: "createBooking prevents near-simultaneous conflicting requests from both succeeding",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_concurrency_conflict",
        name: "Concurrency Conflict Check",
        ownerName: "Owner Example",
        ownerEmail: "concurrency-conflict@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "concurrency-conflict-check",
      });

      const service = await store.createService({
        businessId: "biz_concurrency_conflict",
        name: "Cut",
        durationMinutes: 30,
        price: 18,
      });

      await store.updateWeeklyAvailability({
        businessId: "biz_concurrency_conflict",
        availability: [{ dayOfWeek: 2, startMinutes: 9 * 60, endMinutes: 12 * 60, active: true }],
      });

      const firstAttempt = store.createBooking({
        businessId: "biz_concurrency_conflict",
        requestedStart: new Date("2099-04-07T09:00:00.000Z"),
        serviceIds: [service.id],
        customer: {
          name: "First Customer",
          phone: "1001",
          email: "first-conflict@example.com",
        },
      });

      const secondAttempt = store.createBooking({
        businessId: "biz_concurrency_conflict",
        requestedStart: new Date("2099-04-07T09:00:00.000Z"),
        serviceIds: [service.id],
        customer: {
          name: "Second Customer",
          phone: "1002",
          email: "second-conflict@example.com",
        },
      });

      const results = await Promise.allSettled([firstAttempt, secondAttempt]);
      const succeeded = results.filter(
        (result): result is PromiseFulfilledResult<Awaited<typeof firstAttempt>> =>
          result.status === "fulfilled"
      );
      const failed = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );

      assert.equal(succeeded.length, 1);
      assert.equal(failed.length, 1);
      assert.match(String(failed[0].reason), /no longer available/i);

      const bookings = store.listBookings("biz_concurrency_conflict");
      assert.equal(bookings.length, 1);
    },
  },
  {
    name: "createBooking still allows near-simultaneous non-conflicting requests",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_concurrency_non_conflict",
        name: "Concurrency Non-Conflict Check",
        ownerName: "Owner Example",
        ownerEmail: "concurrency-non-conflict@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "concurrency-non-conflict-check",
      });

      const service = await store.createService({
        businessId: "biz_concurrency_non_conflict",
        name: "Cut",
        durationMinutes: 30,
        price: 18,
      });

      await store.updateWeeklyAvailability({
        businessId: "biz_concurrency_non_conflict",
        availability: [{ dayOfWeek: 2, startMinutes: 9 * 60, endMinutes: 12 * 60, active: true }],
      });

      const firstAttempt = store.createBooking({
        businessId: "biz_concurrency_non_conflict",
        requestedStart: new Date("2099-04-07T09:00:00.000Z"),
        serviceIds: [service.id],
        customer: {
          name: "First Customer",
          phone: "2001",
          email: "first-non-conflict@example.com",
        },
      });

      const secondAttempt = store.createBooking({
        businessId: "biz_concurrency_non_conflict",
        requestedStart: new Date("2099-04-07T09:30:00.000Z"),
        serviceIds: [service.id],
        customer: {
          name: "Second Customer",
          phone: "2002",
          email: "second-non-conflict@example.com",
        },
      });

      const results = await Promise.allSettled([firstAttempt, secondAttempt]);
      const succeeded = results.filter((result) => result.status === "fulfilled");

      assert.equal(succeeded.length, 2);

      const bookings = store.listBookings("biz_concurrency_non_conflict");
      assert.equal(bookings.length, 2);
    },
  },
  {
    name: "createBooking rejects past requestedStart values server-side",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_past_booking",
        name: "Past Booking Check",
        ownerName: "Owner Example",
        ownerEmail: "past-booking@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "past-booking-check",
      });

      const service = await store.createService({
        businessId: "biz_past_booking",
        name: "Cut",
        durationMinutes: 30,
        price: 18,
      });

      await store.updateWeeklyAvailability({
        businessId: "biz_past_booking",
        availability: [{ dayOfWeek: 2, startMinutes: 9 * 60, endMinutes: 12 * 60, active: true }],
      });

      await assert.rejects(
        () =>
          store.createBooking({
            businessId: "biz_past_booking",
            requestedStart: new Date("2000-01-01T09:00:00.000Z"),
            serviceIds: [service.id],
            customer: {
              name: "Past Customer",
              phone: "0001",
              email: "past@example.com",
            },
          }),
        /must be in the future/i
      );
    },
  },
  {
    name: "createBooking rejects missing customer email server-side",
    run: async () => {
      const store = await BookingStore.create();

      await store.createBusiness({
        id: "biz_missing_email_booking",
        name: "Missing Email Check",
        ownerName: "Owner Example",
        ownerEmail: "missing-email-booking@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        timezone: "UTC",
        bookingPageSlug: "missing-email-check",
      });

      const service = await store.createService({
        businessId: "biz_missing_email_booking",
        name: "Cut",
        durationMinutes: 30,
        price: 18,
      });

      await store.updateWeeklyAvailability({
        businessId: "biz_missing_email_booking",
        availability: [{ dayOfWeek: 2, startMinutes: 9 * 60, endMinutes: 12 * 60, active: true }],
      });

      await assert.rejects(
        () =>
          store.createBooking({
            businessId: "biz_missing_email_booking",
            requestedStart: new Date("2099-04-07T09:00:00.000Z"),
            serviceIds: [service.id],
            customer: {
              name: "Missing Email Customer",
              phone: "0001",
            },
          }),
        /email is required/i
      );
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
