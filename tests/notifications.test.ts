import assert from "node:assert/strict";
import type { Transporter } from "nodemailer";

const {
  setMailTransport,
  sendBookingConfirmation,
  sendRescheduleNotification,
  sendCancellationNotification,
} = await import("../notificationService.ts");

type CapturedMessage = {
  to?: unknown;
  subject?: unknown;
  text?: unknown;
};

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

const capturedMessages: CapturedMessage[] = [];

const capturingTransport = {
  sendMail: async (message: CapturedMessage) => {
    capturedMessages.push({ ...message });
    return { messageId: `msg_${capturedMessages.length}` };
  },
} as unknown as Transporter;

function resetCapturedMessages(): void {
  capturedMessages.length = 0;
  setMailTransport(capturingTransport);
}

const tests: TestCase[] = [
  {
    name: "sendBookingConfirmation sends customer and business emails",
    run: async () => {
      await sendBookingConfirmation({
        customerEmail: "customer@example.com",
        businessEmail: "business@example.com",
        businessName: "SnapSlot Barbers",
        customerName: "Ada Lovelace",
        serviceName: "Haircut",
        startTime: "2099-04-06T09:00:00.000Z",
      });

      assert.equal(capturedMessages.length, 2);
      assert.equal(capturedMessages[0].to, "customer@example.com");
      assert.equal(capturedMessages[1].to, "business@example.com");
      assert.match(String(capturedMessages[0].subject), /confirmed/i);
      assert.match(String(capturedMessages[1].subject), /New booking/i);
    },
  },
  {
    name: "sendRescheduleNotification sends customer and business emails",
    run: async () => {
      await sendRescheduleNotification({
        customerEmail: "customer@example.com",
        businessEmail: "business@example.com",
        businessName: "SnapSlot Barbers",
        customerName: "Ada Lovelace",
        serviceName: "Haircut",
        newStartTime: "2099-04-06T11:00:00.000Z",
      });

      assert.equal(capturedMessages.length, 2);
      assert.equal(capturedMessages[0].to, "customer@example.com");
      assert.equal(capturedMessages[1].to, "business@example.com");
      assert.match(String(capturedMessages[0].subject), /rescheduled/i);
      assert.match(String(capturedMessages[1].subject), /rescheduled/i);
    },
  },
  {
    name: "sendCancellationNotification sends customer and business emails",
    run: async () => {
      await sendCancellationNotification({
        customerEmail: "customer@example.com",
        businessEmail: "business@example.com",
        businessName: "SnapSlot Barbers",
        customerName: "Ada Lovelace",
        serviceName: "Haircut",
      });

      assert.equal(capturedMessages.length, 2);
      assert.equal(capturedMessages[0].to, "customer@example.com");
      assert.equal(capturedMessages[1].to, "business@example.com");
      assert.match(String(capturedMessages[0].subject), /cancelled/i);
      assert.match(String(capturedMessages[1].subject), /cancelled/i);
    },
  },
  {
    name: "notification failure does not propagate when used fire-and-forget with catch",
    run: async () => {
      const originalConsoleError = console.error;
      const loggedErrors: unknown[][] = [];

      try {
        console.error = (...args: unknown[]) => {
          loggedErrors.push(args);
        };

        const failingTransport = {
          sendMail: async () => {
            throw new Error("Simulated SMTP failure");
          },
        } as unknown as Transporter;

        setMailTransport(failingTransport);

        let threwSynchronously = false;

        try {
          sendBookingConfirmation({
            customerEmail: "customer@example.com",
            businessEmail: "business@example.com",
            businessName: "SnapSlot Barbers",
            customerName: "Ada Lovelace",
            serviceName: "Haircut",
            startTime: "2099-04-06T09:00:00.000Z",
          }).catch(console.error);
        } catch {
          threwSynchronously = true;
        }

        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(threwSynchronously, false);
        assert.equal(loggedErrors.length, 1);
        const firstLogged = loggedErrors[0][0];
        assert.match(firstLogged instanceof Error ? firstLogged.message : String(firstLogged), /Simulated SMTP failure/i);
      } finally {
        console.error = originalConsoleError;
        setMailTransport(capturingTransport);
      }
    },
  },
];

let failed = 0;

for (const currentTest of tests) {
  try {
    resetCapturedMessages();
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
