import { randomBytes } from "crypto";
import express from "express";
import type { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { hashPassword, verifyPassword } from "./auth.ts";
import { BookingStore } from "./bookingStore.ts";
import { HttpError } from "./errors.ts";
import {
  sendBookingConfirmation,
  sendCancellationNotification,
  sendRescheduleNotification,
} from "./notificationService.ts";

type SignupBody = {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
  timezone: string;
  bookingSlug: string;
};

type LoginBody = {
  email: string;
  password: string;
};

type BusinessParams = {
  businessId: string;
};

type ServiceParams = {
  businessId: string;
  serviceId: string;
};

type BookingParams = {
  businessId: string;
  bookingId: string;
};

type BlockedTimeParams = {
  businessId: string;
  blockedTimeId: string;
};

type BookingPageParams = {
  slug: string;
};

type AuthSession = {
  id: string;
  businessId: string;
  expiresAt: number;
};

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const SESSION_COOKIE_NAME = "booking_session";
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const sessions = new Map<string, AuthSession>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

startServer().catch((error) => {
  console.error("Failed to start booking system:", error);
  process.exit(1);
});

async function startServer(): Promise<void> {
  const store = await BookingStore.create();
  const authIncompleteBusinesses = store.listAuthIncompleteBusinesses();

  if (authIncompleteBusinesses.length > 0) {
    console.warn(
      `WARNING: ${authIncompleteBusinesses.length} businesses are auth-incomplete and cannot log in until migrated.`
    );

    for (const business of authIncompleteBusinesses) {
      console.warn(`- ${business.id} (${business.bookingPageSlug})`);
    }
  }

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "booking-system",
      timestamp: new Date().toISOString(),
    });
  });

  app.post("/api/signup", async (req: Request<{}, {}, SignupBody>, res: Response) => {
    try {
      const businessName = String(req.body.businessName ?? "").trim();
      const ownerName = String(req.body.ownerName ?? "").trim();
      const email = String(req.body.email ?? "").trim().toLowerCase();
      const password = String(req.body.password ?? "");
      const timezone = String(req.body.timezone ?? "").trim() || "Europe/London";
      const bookingSlug = sanitizeSlug(String(req.body.bookingSlug ?? ""));

      validateSignupInput({
        businessName,
        ownerName,
        email,
        password,
        bookingSlug,
      });

      if (!isValidTimeZone(timezone)) {
        throw new HttpError(400, "Timezone is invalid.");
      }

      const existingBusinesses = store.listBusinesses();
      const slugTaken = existingBusinesses.some(
        (business) => business.bookingPageSlug.toLowerCase() === bookingSlug.toLowerCase()
      );

      if (slugTaken) {
        throw new HttpError(400, "That booking page slug is already taken.");
      }

      if (store.findBusinessByOwnerEmail(email)) {
        throw new HttpError(400, "That business email is already in use.");
      }

      const businessId = createBusinessId(bookingSlug, existingBusinesses);
      const passwordSalt = randomBytes(16).toString("hex");
      const passwordHash = hashPassword(password, passwordSalt);

      const business = await store.createBusiness({
        id: businessId,
        name: businessName,
        ownerName,
        ownerEmail: email,
        passwordHash,
        passwordSalt,
        timezone,
        bookingPageSlug: bookingSlug,
      });

      const session = createSession(business.id);
      setSessionCookie(res, session.id);

      res.status(201).json({
        ok: true,
        businessId: business.id,
        businessName: business.name,
        adminUrl: `/admin/${business.id}`,
        bookingUrl: `/booking/${business.bookingPageSlug}`,
        message: "Business booking system created.",
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/login", (req: Request<{}, {}, LoginBody>, res: Response) => {
    try {
      const clientIp = req.ip ?? "unknown";
      checkLoginRateLimit(clientIp);

      const email = String(req.body.email ?? "").trim().toLowerCase();
      const password = String(req.body.password ?? "");

      if (!email) {
        throw new HttpError(400, "Business email is required.");
      }

      if (!password) {
        throw new HttpError(400, "Password is required.");
      }

      const business = store.findBusinessByOwnerEmail(email);
      if (!business || !business.passwordHash || !business.passwordSalt) {
        throw new HttpError(401, "Business email or password is incorrect.");
      }

      if (!verifyPassword(password, business.passwordSalt, business.passwordHash)) {
        throw new HttpError(401, "Business email or password is incorrect.");
      }

      const session = createSession(business.id);
      setSessionCookie(res, session.id);
      resetLoginRateLimit(clientIp);

      res.json({
        ok: true,
        businessId: business.id,
        adminUrl: `/admin/${business.id}`,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/logout", (req: Request, res: Response) => {
    const session = getSessionFromRequest(req);

    if (session) {
      sessions.delete(session.id);
    }

    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/session", (req: Request, res: Response) => {
    try {
      const session = getSessionFromRequest(req);
      if (!session) {
        throw new HttpError(401, "You must sign in to continue.");
      }

      res.json({
        ok: true,
        business: store.getBusinessView(session.businessId),
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/business/:businessId/qr", (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const business = store.getBusinessView(req.params.businessId);
      const bookingUrl = `${req.protocol}://${req.get("host")}/booking/${business.bookingPageSlug}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingUrl)}`;
      res.json({ qrUrl, bookingUrl });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/booking-page/:slug", (req: Request<BookingPageParams>, res: Response) => {
    try {
      const slug = sanitizeSlug(req.params.slug);

      if (!slug) {
        throw new HttpError(400, "Booking page slug is required.");
      }

      const business = store.getBusinessBySlug(slug);

      res.json({
        id: business.id,
        name: business.name,
        timezone: business.timezone,
        bookingPageSlug: business.bookingPageSlug,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/booking-page/:slug/services", (req: Request<BookingPageParams>, res: Response) => {
    try {
      const business = getPublicBusinessBySlug(store, req.params.slug);
      const services = store.listServices(business.id).filter((service) => service.active);
      res.json(services);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/booking-page/:slug/slots", (req: Request<BookingPageParams>, res: Response) => {
    try {
      const business = getPublicBusinessBySlug(store, req.params.slug);
      const date = parseDateQuery(req.query.date);
      const serviceIds = parseServiceIds(req.query.serviceIds);
      const stepMinutes = req.query.stepMinutes ? Number(req.query.stepMinutes) : 15;

      const slots = store.getAvailableSlots(business.id, date, serviceIds, stepMinutes);
      res.json(slots);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/booking-page/:slug/bookings", async (req: Request<BookingPageParams>, res: Response) => {
    try {
      const business = getPublicBusinessBySlug(store, req.params.slug);
      const booking = await store.createBooking({
        businessId: business.id,
        requestedStart: new Date(req.body.requestedStart),
        serviceIds: Array.isArray(req.body.serviceIds) ? req.body.serviceIds.map(String) : [],
        customer: {
          name: String(req.body.customer?.name ?? ""),
          phone: String(req.body.customer?.phone ?? ""),
          email: req.body.customer?.email ? String(req.body.customer.email) : undefined,
          notes: req.body.customer?.notes ? String(req.body.customer.notes) : undefined,
        },
      });

      sendBookingConfirmation({
        customerEmail: booking.customer.email ?? "",
        businessEmail: business.ownerEmail,
        businessName: business.name,
        customerName: booking.customer.name,
        serviceName: booking.services.map((s) => s.name).join(", "),
        startTime: booking.start.toISOString(),
      }).catch(console.error);

      res.status(201).json(booking);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/business/:businessId", (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      res.json(store.getBusinessView(req.params.businessId));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/business/:businessId/services", (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const services = store.listServices(req.params.businessId);
      res.json(services);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/business/:businessId/services", async (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const service = await store.createService({
        businessId: req.params.businessId,
        name: String(req.body.name ?? ""),
        durationMinutes: Number(req.body.durationMinutes),
        price: Number(req.body.price),
        active: req.body.active === undefined ? true : Boolean(req.body.active),
        bufferMinutes: req.body.bufferMinutes === undefined ? 0 : Number(req.body.bufferMinutes),
      });

      res.status(201).json(service);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch(
    "/api/business/:businessId/services/:serviceId",
    async (req: Request<ServiceParams>, res: Response) => {
      try {
        assertBusinessSession(req, res, req.params.businessId);
        const service = await store.updateService({
          businessId: req.params.businessId,
          serviceId: req.params.serviceId,
          name: req.body.name === undefined ? undefined : String(req.body.name ?? ""),
          durationMinutes:
            req.body.durationMinutes === undefined ? undefined : Number(req.body.durationMinutes),
          price: req.body.price === undefined ? undefined : Number(req.body.price),
          active: req.body.active === undefined ? undefined : Boolean(req.body.active),
          bufferMinutes:
            req.body.bufferMinutes === undefined ? undefined : Number(req.body.bufferMinutes),
        });

        res.json(service);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  app.delete(
    "/api/business/:businessId/services/:serviceId",
    async (req: Request<ServiceParams>, res: Response) => {
      try {
        assertBusinessSession(req, res, req.params.businessId);
        await store.deleteService(req.params.businessId, req.params.serviceId);
        res.status(204).send();
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  app.get("/api/business/:businessId/availability", (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const availability = store.listWeeklyAvailability(req.params.businessId);
      res.json(availability);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/business/:businessId/availability", async (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const availability = Array.isArray(req.body.availability) ? req.body.availability : [];

      const updated = await store.updateWeeklyAvailability({
        businessId: req.params.businessId,
        availability: availability.map((window: any) => ({
          dayOfWeek: Number(window.dayOfWeek),
          startMinutes: Number(window.startMinutes),
          endMinutes: Number(window.endMinutes),
          active: Boolean(window.active),
        })),
      });

      res.json(updated);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/business/:businessId/blocked-times", (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const date = parseDateQuery(req.query.date);
      const blockedTimes = store.listBlockedTimesForDate(req.params.businessId, date);
      res.json(blockedTimes);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/business/:businessId/blocked-times", async (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const blockedTime = await store.createBlockedTime({
        businessId: req.params.businessId,
        start: new Date(req.body.start),
        end: new Date(req.body.end),
        reason: req.body.reason ? String(req.body.reason) : undefined,
      });

      res.status(201).json(blockedTime);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch(
    "/api/business/:businessId/blocked-times/:blockedTimeId",
    async (req: Request<BlockedTimeParams>, res: Response) => {
      try {
        assertBusinessSession(req, res, req.params.businessId);
        const blockedTime = await store.updateBlockedTime({
          businessId: req.params.businessId,
          blockedTimeId: req.params.blockedTimeId,
          start: new Date(req.body.start),
          end: new Date(req.body.end),
          reason: req.body.reason ? String(req.body.reason) : undefined,
        });

        res.json(blockedTime);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  app.delete(
    "/api/business/:businessId/blocked-times/:blockedTimeId",
    async (req: Request<BlockedTimeParams>, res: Response) => {
      try {
        assertBusinessSession(req, res, req.params.businessId);
        await store.deleteBlockedTime(req.params.businessId, req.params.blockedTimeId);
        res.status(204).send();
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  app.get("/api/business/:businessId/slots", (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const date = parseDateQuery(req.query.date);
      const serviceIds = parseServiceIds(req.query.serviceIds);
      const stepMinutes = req.query.stepMinutes ? Number(req.query.stepMinutes) : 15;

      const slots = store.getAvailableSlots(req.params.businessId, date, serviceIds, stepMinutes);
      res.json(slots);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/business/:businessId/bookings", (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const bookings = store.listBookings(req.params.businessId);
      res.json(bookings);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/business/:businessId/bookings", async (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const business = store.getBusiness(req.params.businessId);
      const booking = await store.createBooking({
        businessId: req.params.businessId,
        requestedStart: new Date(req.body.requestedStart),
        serviceIds: Array.isArray(req.body.serviceIds) ? req.body.serviceIds.map(String) : [],
        customer: {
          name: String(req.body.customer?.name ?? ""),
          phone: String(req.body.customer?.phone ?? ""),
          email: req.body.customer?.email ? String(req.body.customer.email) : undefined,
          notes: req.body.customer?.notes ? String(req.body.customer.notes) : undefined,
        },
      });

      sendBookingConfirmation({
        customerEmail: booking.customer.email ?? "",
        businessEmail: business.ownerEmail,
        businessName: business.name,
        customerName: booking.customer.name,
        serviceName: booking.services.map((s) => s.name).join(", "),
        startTime: booking.start.toISOString(),
      }).catch(console.error);

      res.status(201).json(booking);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch(
    "/api/business/:businessId/bookings/:bookingId/cancel",
    async (req: Request<BookingParams>, res: Response) => {
      try {
        assertBusinessSession(req, res, req.params.businessId);
        const business = store.getBusiness(req.params.businessId);
        const booking = await store.cancelBooking(req.params.businessId, req.params.bookingId);
        sendCancellationNotification({
          customerEmail: booking.customer.email ?? "",
          businessEmail: business.ownerEmail,
          businessName: business.name,
          customerName: booking.customer.name,
          serviceName: booking.services.map((s) => s.name).join(", "),
        }).catch(console.error);
        res.json(booking);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  app.patch(
    "/api/business/:businessId/bookings/:bookingId/reschedule",
    async (req: Request<BookingParams>, res: Response) => {
      try {
        assertBusinessSession(req, res, req.params.businessId);
        const business = store.getBusiness(req.params.businessId);
        const booking = await store.rescheduleBooking(
          req.params.businessId,
          req.params.bookingId,
          new Date(req.body.requestedStart)
        );
        sendRescheduleNotification({
          customerEmail: booking.customer.email ?? "",
          businessEmail: business.ownerEmail,
          businessName: business.name,
          customerName: booking.customer.name,
          serviceName: booking.services.map((s) => s.name).join(", "),
          newStartTime: booking.start.toISOString(),
        }).catch(console.error);
        res.json(booking);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  app.get("/booking/:slug", (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  app.get("/admin/:businessId", (req: Request<BusinessParams>, res: Response) => {
    const session = getSessionFromRequest(req);

    if (!session) {
      res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
      return;
    }

    if (session.businessId !== req.params.businessId) {
      res.redirect(`/admin/${session.businessId}`);
      return;
    }

    res.sendFile(path.join(__dirname, "public", "admin.html"));
  });

  app.get("/signup", (req: Request, res: Response) => {
    const session = getSessionFromRequest(req);

    if (session) {
      res.redirect(`/admin/${session.businessId}`);
      return;
    }

    res.sendFile(path.join(__dirname, "public", "signup.html"));
  });

  app.get("/login", (req: Request, res: Response) => {
    const session = getSessionFromRequest(req);

    if (session) {
      res.redirect(`/admin/${session.businessId}`);
      return;
    }

    res.sendFile(path.join(__dirname, "public", "login.html"));
  });

  app.listen(PORT, () => {
    console.log(`Booking system running at http://localhost:${PORT}`);
  });
}

function validateSignupInput(params: {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
  bookingSlug: string;
}): void {
  if (!params.businessName) {
    throw new HttpError(400, "Business name is required.");
  }

  if (!params.ownerName) {
    throw new HttpError(400, "Owner full name is required.");
  }

  if (!params.email) {
    throw new HttpError(400, "Business email is required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
    throw new HttpError(400, "A valid business email is required.");
  }

  if (params.password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }

  if (!params.bookingSlug) {
    throw new HttpError(400, "Booking page slug is required.");
  }
}

function getPublicBusinessBySlug(store: BookingStore, rawSlug: string) {
  const slug = sanitizeSlug(rawSlug);

  if (!slug) {
    throw new HttpError(400, "Booking page slug is required.");
  }

  return store.getBusinessBySlug(slug);
}

function assertBusinessSession(req: Request, _res: Response, businessId: string): void {
  const session = getSessionFromRequest(req);

  if (!session) {
    throw new HttpError(401, "You must sign in to continue.");
  }

  if (session.businessId !== businessId) {
    throw new HttpError(403, "You do not have access to this business.");
  }
}

function createSession(businessId: string): AuthSession {
  cleanupExpiredSessions();

  const session: AuthSession = {
    id: randomBytes(24).toString("hex"),
    businessId,
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  };

  sessions.set(session.id, session);
  return session;
}

function getSessionFromRequest(req: Request): AuthSession | null {
  cleanupExpiredSessions();

  const cookies = parseCookieHeader(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

function setSessionCookie(res: Response, sessionId: string): void {
  const maxAgeSeconds = Math.floor(SESSION_MAX_AGE_MS / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
  );
}

function clearSessionCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`
  );
}

function cleanupExpiredSessions(): void {
  const now = Date.now();

  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex <= 0) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function parseDateQuery(value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "A valid date query parameter is required.");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "Date query parameter is invalid.");
  }

  return date;
}

function parseServiceIds(value: unknown): string[]  {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function createBusinessId(slug: string, existingBusinesses: Array<{ id: string }>): string {
  const base = `biz_${slug}`;
  let candidate = base;
  let counter = 1;

  const existingIds = new Set(existingBusinesses.map((business) => business.id));

  while (existingIds.has(candidate)) {
    counter += 1;
    candidate = `${base}_${counter}`;
  }

  return candidate;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function checkLoginRateLimit(ip: string): void {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || record.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
    return;
  }

  if (record.count >= LOGIN_RATE_LIMIT_MAX) {
    throw new HttpError(429, "Too many login attempts. Please try again later.");
  }

  record.count += 1;
}

function resetLoginRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
  } else {
    console.error("Unexpected server error:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
}
