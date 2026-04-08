import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { promises as fs } from "node:fs";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { hashPassword } from "../auth.ts";
import { setMailTransport, sendPasswordResetEmail } from "../notificationService.ts";
import type { Transporter } from "nodemailer";

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

type RunningSmtpServer = {
  port: number;
  messages: string[];
  close: () => Promise<void>;
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

async function waitForMessage(messages: string[], timeoutMs = 5000): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (messages[0]) {
      return messages[0];
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for password reset email.");
}

async function startServerForTest(smtpPort: number): Promise<RunningServer> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "booking-password-reset-tests-"));
  const dataFile = path.join(dataDir, "store.json");

  await fs.writeFile(dataFile, JSON.stringify(EMPTY_STATE, null, 2), "utf-8");

  const port = 5100 + Math.floor(Math.random() * 400);

  const serverProcess = spawn("node", ["--loader", "ts-node/esm", "server.ts"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      BOOKING_SYSTEM_DATA_FILE: dataFile,
      SNAPSLOT_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD_CREDENTIAL,
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(smtpPort),
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
    throw new Error(`Password reset server failed health check: ${String(error)}\n${stderr}`);
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

async function startSmtpCaptureServer(): Promise<RunningSmtpServer> {
  const messages: string[] = [];
  const server = createServer((socket: Socket) => {
    let mode: "command" | "data" = "command";
    let buffer = "";
    let data = "";

    socket.setEncoding("utf8");
    socket.write("220 snapslot.test ESMTP\r\n");

    socket.on("data", (chunk: string) => {
      buffer += chunk;

      while (buffer.includes("\r\n")) {
        const lineEnd = buffer.indexOf("\r\n");
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);

        if (mode === "data") {
          if (line === ".") {
            messages.push(data);
            data = "";
            mode = "command";
            socket.write("250 Message accepted\r\n");
          } else {
            data += `${line}\n`;
          }
          continue;
        }

        const command = line.toUpperCase();

        if (command.startsWith("EHLO") || command.startsWith("HELO")) {
          socket.write("250-snapslot.test\r\n250 8BITMIME\r\n");
        } else if (command.startsWith("MAIL FROM")) {
          socket.write("250 OK\r\n");
        } else if (command.startsWith("RCPT TO")) {
          socket.write("250 OK\r\n");
        } else if (command === "DATA") {
          mode = "data";
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (command === "QUIT") {
          socket.write("221 Bye\r\n");
          socket.end();
        } else if (command === "RSET") {
          data = "";
          mode = "command";
          socket.write("250 OK\r\n");
        } else {
          socket.write("250 OK\r\n");
        }
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  assert.equal(typeof address, "object");
  assert.ok(address);
  const addressInfo = address as AddressInfo;

  return {
    port: addressInfo.port,
    messages,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
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
  const slug = overrides.bookingSlug ?? `password-reset-${Math.random().toString(36).slice(2, 10)}`;
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
        businessName: overrides.businessName ?? "Password Reset Proof Ltd",
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

function extractResetToken(message: string): string {
  const decodedMessage = message.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  const match = decodedMessage.match(/\/reset-password\?token=([a-f0-9]{64})/);

  if (!match) {
    throw new Error(`Reset token was not found in email:\n${decodedMessage}`);
  }

  return match[1];
}

function withMockTransport<T>(run: () => Promise<T>): Promise<T> {
  const messages: Array<{ to?: unknown; subject?: unknown; text?: unknown }> = [];
  const transport = {
    sendMail: async (message: { to?: unknown; subject?: unknown; text?: unknown }) => {
      messages.push({ ...message });
      return { messageId: `msg_${messages.length}` };
    },
  } as unknown as Transporter;

  setMailTransport(transport);

  return run().finally(() => {
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, "owner@example.com");
    assert.equal(messages[0].subject, "Reset your SnapSlot password");
    assert.match(String(messages[0].text), /https:\/\/snapslot\.test\/reset-password\?token=abc123/);
  });
}

const tests: TestCase[] = [
  {
    name: "sendPasswordResetEmail supports setMailTransport injection",
    async run() {
      await withMockTransport(async () => {
        await sendPasswordResetEmail({
          to: "owner@example.com",
          resetUrl: "https://snapslot.test/reset-password?token=abc123",
        });
      });
    },
  },
  {
    name: "password reset request is indistinguishable and successful reset invalidates sessions",
    async run() {
      const smtp = await startSmtpCaptureServer();
      const running = await startServerForTest(smtp.port);

      try {
        const signupSession = { cookie: "" };
        const oldLoginSession = { cookie: "" };
        const newLoginSession = { cookie: "" };
        const business = await signUpBusiness(running.port, signupSession);

        const unknownReset = await request<{ message?: string }>(running.port, "/api/request-password-reset", {
          method: "POST",
          body: JSON.stringify({ email: "unknown@example.com" }),
        });
        assert.equal(unknownReset.status, 200);
        assert.equal(unknownReset.body.message, "If that email is registered, a reset link has been sent.");

        const knownReset = await request<{ message?: string }>(running.port, "/api/request-password-reset", {
          method: "POST",
          body: JSON.stringify({ email: business.email }),
        });
        assert.equal(knownReset.status, 200);
        assert.deepEqual(knownReset.body, unknownReset.body);

        const message = await waitForMessage(smtp.messages);
        assert.match(message, new RegExp(`To: ${business.email}`));
        assert.match(message, /Subject: Reset your SnapSlot password/);
        const token = extractResetToken(message);

        const beforeResetSession = await request<{ business?: { id: string }; error?: string }>(
          running.port,
          "/api/session",
          { method: "GET" },
          signupSession
        );
        assert.equal(beforeResetSession.status, 200);
        assert.equal(beforeResetSession.body.business?.id, business.businessId);

        const shortPassword = await request<{ error?: string }>(running.port, "/api/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, newPassword: "short" }),
        });
        assert.equal(shortPassword.status, 400);
        assert.equal(shortPassword.body.error, "Password must be at least 8 characters.");

        const reset = await request<{ message?: string }>(running.port, "/api/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, newPassword: "newpassword123" }),
        });
        assert.equal(reset.status, 200);
        assert.equal(reset.body.message, "Password updated. Please log in with your new password.");

        const oldSessionCheck = await request<{ error?: string }>(
          running.port,
          "/api/session",
          { method: "GET" },
          signupSession
        );
        assert.equal(oldSessionCheck.status, 401);

        const oldPasswordLogin = await businessLogin(running.port, business.email, business.password, oldLoginSession);
        assert.equal(oldPasswordLogin.status, 401);

        const newPasswordLogin = await businessLogin(running.port, business.email, "newpassword123", newLoginSession);
        assert.equal(newPasswordLogin.status, 200);
        assert.equal(newPasswordLogin.body.businessId, business.businessId);

        const reusedToken = await request<{ error?: string }>(running.port, "/api/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, newPassword: "anotherpassword123" }),
        });
        assert.equal(reusedToken.status, 400);
        assert.equal(reusedToken.body.error, "Invalid or expired reset token.");
      } finally {
        await running.stop();
        await smtp.close();
      }
    },
  },
  {
    name: "password reset email failure returns generic 200",
    async run() {
      const running = await startServerForTest(1);

      try {
        const signupSession = { cookie: "" };
        const business = await signUpBusiness(running.port, signupSession);

        const response = await request<{ message?: string }>(running.port, "/api/request-password-reset", {
          method: "POST",
          body: JSON.stringify({ email: business.email }),
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.message, "If that email is registered, a reset link has been sent.");
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
