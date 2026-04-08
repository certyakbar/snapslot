import { randomBytes } from "crypto";
import express from "express";
import type { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { hashPassword, verifyPassword } from "./auth.ts";
import { BookingStore } from "./bookingStore.ts";
import type { BusinessProfile, PaymentConfig, UpdatePaymentStatusInput } from "./bookingStore.ts";
import { SUBSCRIPTION_BILLING_WINDOW_MS } from "./bookingCore.ts";
import { HttpError } from "./errors.ts";
import {
  sendBookingConfirmation,
  sendCancellationNotification,
  sendPaymentReceived,
  sendPaymentRequired,
  sendPasswordResetEmail,
  sendRefundIssued,
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

type PasswordResetRequestBody = {
  email: string;
};

type PasswordResetBody = {
  token: string;
  newPassword: string;
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

type PasswordResetToken = {
  businessId: string;
  expiresAt: number;
};

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const SESSION_COOKIE_NAME = "booking_session";
const SNAPSLOT_ADMIN_SESSION_COOKIE_NAME = "snapslot_admin_session";
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const sessions = new Map<string, AuthSession>();
const resetPasswordTokens = new Map<string, PasswordResetToken>();
const snapslotAdminSessions = new Set<string>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RESET_TOKEN_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
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

      if (business.subscriptionStatus === "deactivated") {
        throw new HttpError(403, "Your account has been deactivated. Please contact support.");
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

  app.post("/api/request-password-reset", async (req: Request<{}, {}, PasswordResetRequestBody>, res: Response) => {
    try {
      const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";

      if (!email) {
        throw new HttpError(400, "Business email is required.");
      }

      const business = store.findBusinessByOwnerEmail(email);

      if (business) {
        const token = randomBytes(32).toString("hex");
        resetPasswordTokens.set(token, {
          businessId: business.id,
          expiresAt: Date.now() + RESET_TOKEN_MAX_AGE_MS,
        });

        const resetUrl = `${req.protocol}://${req.get("host")}/reset-password?token=${token}`;

        try {
          await sendPasswordResetEmail({ to: business.ownerEmail, resetUrl });
        } catch (err) {
          console.error("Password reset email failed:", err);
          resetPasswordTokens.delete(token);
        }
      }

      res.json({ message: "If that email is registered, a reset link has been sent." });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/reset-password", async (req: Request<{}, {}, PasswordResetBody>, res: Response) => {
    try {
      const token = typeof req.body.token === "string" ? req.body.token.trim() : "";
      const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";

      if (!token || !newPassword) {
        throw new HttpError(400, "Reset token and new password are required.");
      }

      const entry = resetPasswordTokens.get(token);

      if (!entry) {
        throw new HttpError(400, "Invalid or expired reset token.");
      }

      if (entry.expiresAt <= Date.now()) {
        resetPasswordTokens.delete(token);
        throw new HttpError(400, "Invalid or expired reset token.");
      }

      if (newPassword.length < 8) {
        throw new HttpError(400, "Password must be at least 8 characters.");
      }

      const newSalt = randomBytes(16).toString("hex");
      const newHash = hashPassword(newPassword, newSalt);
      const business = store.getBusiness(entry.businessId);

      await store.updateBusinessAuth({
        businessIdOrSlug: business.id,
        ownerName: business.ownerName,
        ownerEmail: business.ownerEmail,
        passwordHash: newHash,
        passwordSalt: newSalt,
      });

      resetPasswordTokens.delete(token);

      for (const [sessionId, session] of sessions) {
        if (session.businessId === entry.businessId) {
          sessions.delete(sessionId);
        }
      }

      res.json({ message: "Password updated. Please log in with your new password." });
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

  app.post("/api/snapslot-admin/login", (req: Request, res: Response) => {
    const password = String(req.body?.password ?? "");
    const storedCredential = parseSnapslotAdminCredential(
      String(process.env.SNAPSLOT_ADMIN_PASSWORD ?? "")
    );

    if (
      !storedCredential ||
      !verifyPassword(password, storedCredential.salt, storedCredential.expectedHash)
    ) {
      res.status(401).json({ error: "Incorrect password." });
      return;
    }

    const token = randomBytes(32).toString("hex");
    snapslotAdminSessions.add(token);
    setSnapslotAdminSessionCookie(res, token);
    res.json({ ok: true });
  });

  app.post("/api/snapslot-admin/logout", (req: Request, res: Response) => {
    const token = getSnapslotAdminSessionTokenFromRequest(req);

    if (token) {
      snapslotAdminSessions.delete(token);
    }

    clearSnapslotAdminSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/snapslot-admin/businesses", (req: Request, res: Response) => {
    try {
      assertSnapslotAdminSession(req, res);
      res.json(store.listAllBusinessesForAdmin().map(toSnapslotAdminBusinessView));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.patch(
    "/api/snapslot-admin/businesses/:businessId/billing",
    async (req: Request<BusinessParams>, res: Response) => {
      try {
        assertSnapslotAdminSession(req, res);
        const business = await store.applyBillingAction(
          req.params.businessId,
          String(req.body?.action ?? "") as
            | "mark_paid"
            | "suspend"
            | "reactivate"
            | "deactivate"
            | "refund",
          req.body?.note ? String(req.body.note) : undefined
        );
        res.json(toSnapslotAdminBusinessView(business));
      } catch (error) {
        handleError(res, error);
      }
    }
  );

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
      if (!assertBusinessActive(business, res)) {
        return;
      }
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
      const paymentConfig = store.getBusinessView(business.id).paymentConfig;

      if (booking.paymentStatus === "pending") {
        sendPaymentRequired({
          customerEmail: booking.customer.email ?? "",
          businessEmail: business.ownerEmail,
          businessName: business.name,
          customerName: booking.customer.name,
          serviceName: booking.services.map((s) => s.name).join(", "),
          depositAmount: booking.depositAmount,
          paymentLabel: paymentConfig.paymentLabel,
        }).catch(console.error);
      } else {
        sendBookingConfirmation({
          customerEmail: booking.customer.email ?? "",
          businessEmail: business.ownerEmail,
          businessName: business.name,
          customerName: booking.customer.name,
          serviceName: booking.services.map((s) => s.name).join(", "),
          startTime: booking.start.toISOString(),
        }).catch(console.error);
      }

      res.status(201).json({
        ...booking,
        paymentLabel: paymentConfig.paymentLabel,
      });
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

  app.get("/api/business/:businessId/subscription", (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const business = store.getBusinessView(req.params.businessId);
      const billingHistory = business.billingHistory.filter((event) =>
        ["payment_received", "payment_failed", "refund_issued", "cancellation_requested"].includes(event.type)
      );

      res.json({
        subscriptionStatus: business.subscriptionStatus,
        subscriptionStartDate: business.subscriptionStartDate,
        nextBillingDate: business.nextBillingDate,
        cancellationRequestedAt: business.cancellationRequestedAt,
        billingHistory,
        pricePerMonth: 60.0,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post(
    "/api/business/:businessId/subscription/cancel",
    async (req: Request<BusinessParams>, res: Response) => {
      try {
        assertBusinessSession(req, res, req.params.businessId);
        await store.requestCancellation(req.params.businessId);
        res.json({
          message: "Cancellation requested. Your access continues until your next billing date.",
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  app.get("/api/business/:businessId/payment-config", (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const business = store.getBusinessView(req.params.businessId);
      res.json(business.paymentConfig);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/business/:businessId/payment-config", async (req: Request<BusinessParams>, res: Response) => {
    try {
      assertBusinessSession(req, res, req.params.businessId);
      const business = store.getBusiness(req.params.businessId);
      if (!assertBusinessActive(business, res)) return;
      const nextConfig: PaymentConfig = {
        depositEnabled: Boolean(req.body.depositEnabled),
        depositType: req.body.depositType === "percentage" ? "percentage" : "fixed",
        depositAmount: Number(req.body.depositAmount ?? 0),
        paymentLabel: String(req.body.paymentLabel ?? "Deposit").trim() || "Deposit",
      };
      const config = await store.updatePaymentConfig(req.params.businessId, nextConfig);
      res.json(config);
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
      const business = store.getBusiness(req.params.businessId);
      if (!assertBusinessActive(business, res)) return;
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
        const business = store.getBusiness(req.params.businessId);
        if (!assertBusinessActive(business, res)) return;
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
        const business = store.getBusiness(req.params.businessId);
        if (!assertBusinessActive(business, res)) return;
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
      const business = store.getBusiness(req.params.businessId);
      if (!assertBusinessActive(business, res)) return;
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
      const business = store.getBusiness(req.params.businessId);
      if (!assertBusinessActive(business, res)) return;
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
        const business = store.getBusiness(req.params.businessId);
        if (!assertBusinessActive(business, res)) return;
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
        const business = store.getBusiness(req.params.businessId);
        if (!assertBusinessActive(business, res)) return;
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
      const business = store.getBusiness(req.params.businessId);
      if (!assertBusinessActive(business, res)) {
        return;
      }
      const date = parseDateQuery(req.query.date);
      const serviceIds = parseServiceIds(req.query.serviceIds);
      const stepMinutes = req.query.stepMinutes ? Number(req.query.stepMinutes) : 15;

      const slots = store.getAvailableSlots(business.id, date, serviceIds, stepMinutes);
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
      if (!assertBusinessActive(business, res)) return;
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
      const paymentConfig = store.getBusinessView(req.params.businessId).paymentConfig;

      if (booking.paymentStatus === "pending") {
        sendPaymentRequired({
          customerEmail: booking.customer.email ?? "",
          businessEmail: business.ownerEmail,
          businessName: business.name,
          customerName: booking.customer.name,
          serviceName: booking.services.map((s) => s.name).join(", "),
          depositAmount: booking.depositAmount,
          paymentLabel: paymentConfig.paymentLabel,
        }).catch(console.error);
      } else {
        sendBookingConfirmation({
          customerEmail: booking.customer.email ?? "",
          businessEmail: business.ownerEmail,
          businessName: business.name,
          customerName: booking.customer.name,
          serviceName: booking.services.map((s) => s.name).join(", "),
          startTime: booking.start.toISOString(),
        }).catch(console.error);
      }

      res.status(201).json({
        ...booking,
        paymentLabel: paymentConfig.paymentLabel,
      });
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
        if (!assertBusinessActive(business, res)) return;
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
        if (!assertBusinessActive(business, res)) return;
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

  app.patch(
    "/api/business/:businessId/bookings/:bookingId/payment",
    async (req: Request<BookingParams>, res: Response) => {
      try {
        assertBusinessSession(req, res, req.params.businessId);
        const business = store.getBusiness(req.params.businessId);
        if (!assertBusinessActive(business, res)) return;
        const update: UpdatePaymentStatusInput = {
          businessId: req.params.businessId,
          bookingId: req.params.bookingId,
          paymentStatus: req.body.paymentStatus,
        };
        const booking = await store.updateBookingPaymentStatus(update);

        if (booking.paymentStatus === "paid") {
          sendPaymentReceived({
            customerEmail: booking.customer.email ?? "",
            businessEmail: business.ownerEmail,
            businessName: business.name,
            customerName: booking.customer.name,
            serviceName: booking.services.map((s) => s.name).join(", "),
            depositAmount: booking.depositAmount,
          }).catch(console.error);
        } else if (booking.paymentStatus === "refunded" || booking.paymentStatus === "partially_refunded") {
          sendRefundIssued({
            customerEmail: booking.customer.email ?? "",
            businessEmail: business.ownerEmail,
            businessName: business.name,
            customerName: booking.customer.name,
            serviceName: booking.services.map((s) => s.name).join(", "),
          }).catch(console.error);
        }

        res.json(booking);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  app.get("/booking/:slug", (req: Request<BookingPageParams>, res: Response) => {
    try {
      const business = getPublicBusinessBySlug(store, req.params.slug);
      if (!assertBusinessActive(business, res)) {
        return;
      }

      res.sendFile(path.join(__dirname, "public", "index.html"));
    } catch (error) {
      handleError(res, error);
    }
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

  app.get("/snapslot-admin", (req: Request, res: Response) => {
    if (!hasValidSnapslotAdminSession(req)) {
      res.redirect("/snapslot-admin/login");
      return;
    }

    res.sendFile(path.join(__dirname, "public", "snapslot-admin.html"));
  });

  app.get("/snapslot-admin/login", (req: Request, res: Response) => {
    if (hasValidSnapslotAdminSession(req)) {
      res.redirect("/snapslot-admin");
      return;
    }

    res.sendFile(path.join(__dirname, "public", "snapslot-admin-login.html"));
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

  app.get("/reset-request", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "public", "reset-request.html"));
  });

  app.get("/reset-password", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "public", "reset-password.html"));
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

function assertSnapslotAdminSession(req: Request, _res: Response): void {
  const token = getSnapslotAdminSessionTokenFromRequest(req);

  if (!token || !snapslotAdminSessions.has(token)) {
    throw new HttpError(401, "Unauthorised.");
  }
}

function assertBusinessActive(business: BusinessProfile, res: Response): boolean {
  if (business.subscriptionStatus === "suspended" || business.subscriptionStatus === "deactivated") {
    res.status(503).json({ error: "This business is not currently active." });
    return false;
  }

  return true;
}

function parseSnapslotAdminCredential(
  value: string
): { salt: string; expectedHash: string } | null {
  const [salt, expectedHash, extra] = value.split(":");

  if (extra !== undefined || !salt || !expectedHash) {
    return null;
  }

  if (!isHexString(salt) || !isHexString(expectedHash)) {
    return null;
  }

  if (expectedHash.length !== 128) {
    return null;
  }

  return { salt, expectedHash };
}

function isHexString(value: string): boolean {
  return value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

function toSnapslotAdminBusinessView(business: BusinessProfile) {
  return {
    id: business.id,
    name: business.name,
    ownerEmail: business.ownerEmail,
    subscriptionStatus: business.subscriptionStatus ?? "active",
    subscriptionStartDate: business.subscriptionStartDate ?? new Date().toISOString(),
    nextBillingDate:
      business.nextBillingDate ??
      new Date(Date.now() + SUBSCRIPTION_BILLING_WINDOW_MS).toISOString(),
    suspendedAt: business.suspendedAt ?? undefined,
    cancellationRequestedAt: business.cancellationRequestedAt ?? undefined,
    gdprRetentionFlaggedAt: business.gdprRetentionFlaggedAt ?? undefined,
    billingHistory: (business.billingHistory ?? []).map((event) => ({ ...event })),
  };
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

function getSnapslotAdminSessionTokenFromRequest(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[SNAPSLOT_ADMIN_SESSION_COOKIE_NAME] ?? null;
}

function hasValidSnapslotAdminSession(req: Request): boolean {
  const token = getSnapslotAdminSessionTokenFromRequest(req);
  return Boolean(token && snapslotAdminSessions.has(token));
}

function setSessionCookie(res: Response, sessionId: string): void {
  const maxAgeSeconds = Math.floor(SESSION_MAX_AGE_MS / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
  );
}

function setSnapslotAdminSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SNAPSLOT_ADMIN_SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax${secure}`
  );
}

function clearSessionCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`
  );
}

function clearSnapslotAdminSessionCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SNAPSLOT_ADMIN_SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`
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
