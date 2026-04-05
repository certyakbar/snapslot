import type {
  AvailableSlot,
  BillingEvent,
  BlockedTime,
  BookingComputation,
  CustomerDetails,
  ExistingBooking,
  PaymentStatus,
  Service,
  SubscriptionStatus,
  WeeklyAvailability,
} from "./bookingCore.ts";

import {
  assertValidAvailabilitySchedule,
  buildBusinessDayRange,
  buildBookingComputation,
  conflictsWithExistingTime,
  SUBSCRIPTION_BILLING_WINDOW_MS,
  getAvailabilityWindowsForDay,
  getLocalDayOfWeek,
  generateAvailableSlots,
  fitsWithinAvailability,
  rangesOverlap,
} from "./bookingCore.ts";

import type {
  PersistedBlockedTime,
  PersistedBookingRecord,
  PersistedBusinessProfile,
  PersistedService,
  PersistedStoreState,
  PersistedWeeklyAvailability,
} from "./Persistence.ts";

import { readStoreFile, writeStoreFile } from "./Persistence.ts";
import { HttpError } from "./errors.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBSCRIPTION_PRICE_PENCE = 6000;

export interface BusinessProfile {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  passwordHash: string;
  passwordSalt: string;
  timezone: string;
  bookingPageSlug: string;
  depositEnabled?: boolean;
  depositType?: "fixed" | "percentage";
  depositAmount?: number;
  paymentLabel?: string;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionStartDate?: string;
  nextBillingDate?: string;
  suspendedAt?: string;
  cancellationRequestedAt?: string;
  gdprRetentionFlaggedAt?: string;
  billingHistory?: BillingEvent[];
}

export interface BusinessView {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  timezone: string;
  bookingPageSlug: string;
  paymentConfig: PaymentConfig;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStartDate: string;
  nextBillingDate: string;
  suspendedAt?: string;
  cancellationRequestedAt?: string;
  billingHistory: BillingEvent[];
}

export interface PaymentConfig {
  depositEnabled: boolean;
  depositType: "fixed" | "percentage";
  depositAmount: number;
  paymentLabel: string;
}

export interface BookingRecord extends ExistingBooking {
  businessId: string;
  customer: CustomerDetails;
  serviceIds: string[];
  totalDurationMinutes: number;
  paymentStatus: PaymentStatus;
  depositAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceSnapshot {
  serviceId: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
}

export interface BookingDetails extends BookingRecord {
  services: ServiceSnapshot[];
}

export interface CreateBookingInput {
  businessId: string;
  requestedStart: Date;
  serviceIds: string[];
  customer: CustomerDetails;
}

export interface UpdateBusinessScheduleInput {
  businessId: string;
  availability: WeeklyAvailability[];
}

export interface CreateBlockedTimeInput {
  businessId: string;
  start: Date;
  end: Date;
  reason?: string;
}

export interface UpdateBlockedTimeInput {
  businessId: string;
  blockedTimeId: string;
  start: Date;
  end: Date;
  reason?: string;
}

export interface UpdateBusinessAuthInput {
  businessIdOrSlug: string;
  ownerName: string;
  ownerEmail: string;
  passwordHash: string;
  passwordSalt: string;
}

export interface CreateServiceInput {
  businessId: string;
  name: string;
  durationMinutes: number;
  price: number;
  active?: boolean;
  bufferMinutes?: number;
}

export interface UpdatePaymentStatusInput {
  businessId: string;
  bookingId: string;
  paymentStatus: PaymentStatus;
}

export interface UpdateServiceInput {
  businessId: string;
  serviceId: string;
  name?: string;
  durationMinutes?: number;
  price?: number;
  active?: boolean;
  bufferMinutes?: number;
}

interface StoreState {
  businesses: BusinessProfile[];
  services: Map<string, Service[]>;
  availability: Map<string, WeeklyAvailability[]>;
  blockedTimes: Map<string, BlockedTime[]>;
  bookings: Map<string, BookingRecord[]>;
}

export class BookingStore {
  private readonly state: StoreState = {
    businesses: [],
    services: new Map(),
    availability: new Map(),
    blockedTimes: new Map(),
    bookings: new Map(),
  };

  private readonly bookingCreationLocks = new Map<string, Promise<void>>();

  static async create(): Promise<BookingStore> {
    const store = new BookingStore();
    await store.loadFromDisk();
    return store;
  }

  async createBusiness(profile: BusinessProfile): Promise<BusinessProfile> {
    if (!profile.id.trim()) throw new HttpError(400, "Business id is required.");
    if (!profile.name.trim()) throw new HttpError(400, "Business name is required.");
    if (!profile.ownerName.trim()) throw new HttpError(400, "Owner full name is required.");
    if (!profile.ownerEmail.trim()) throw new HttpError(400, "Business email is required.");
    if (!profile.passwordHash.trim()) throw new HttpError(400, "Password hash is required.");
    if (!profile.passwordSalt.trim()) throw new HttpError(400, "Password salt is required.");
    if (!profile.bookingPageSlug.trim()) throw new HttpError(400, "Booking page slug is required.");

    const alreadyExists = this.state.businesses.some((business) => business.id === profile.id);
    if (alreadyExists) {
      throw new HttpError(400, `Business with id '${profile.id}' already exists.`);
    }

    const emailTaken = this.state.businesses.some(
      (business) => business.ownerEmail.toLowerCase() === profile.ownerEmail.toLowerCase()
    );
    if (emailTaken) {
      throw new HttpError(400, "That business email is already in use.");
    }

    const now = new Date();
    const normalizedProfile: BusinessProfile = {
      ...profile,
      depositEnabled: profile.depositEnabled ?? false,
      depositType: profile.depositType ?? "fixed",
      depositAmount: profile.depositAmount ?? 0,
      paymentLabel: profile.paymentLabel ?? "Deposit",
      subscriptionStatus: profile.subscriptionStatus ?? "active",
      subscriptionStartDate: profile.subscriptionStartDate ?? now.toISOString(),
      nextBillingDate:
        profile.nextBillingDate ??
        new Date(now.getTime() + SUBSCRIPTION_BILLING_WINDOW_MS).toISOString(),
      suspendedAt: profile.suspendedAt ?? undefined,
      cancellationRequestedAt: profile.cancellationRequestedAt ?? undefined,
      gdprRetentionFlaggedAt: profile.gdprRetentionFlaggedAt ?? undefined,
      billingHistory: this.cloneBillingHistory(profile.billingHistory ?? []),
    };

    const nextState = this.cloneState();
    nextState.businesses.push({ ...normalizedProfile });
    nextState.services.set(normalizedProfile.id, []);
    nextState.availability.set(normalizedProfile.id, []);
    nextState.blockedTimes.set(normalizedProfile.id, []);
    nextState.bookings.set(normalizedProfile.id, []);

    await this.persistState(nextState);
    return normalizedProfile;
  }

  listBusinesses(): BusinessProfile[] {
    return [...this.state.businesses];
  }

  listAllBusinessesForAdmin(): BusinessProfile[] {
    return this.state.businesses.map((business) => ({
      ...business,
      billingHistory: this.cloneBillingHistory(business.billingHistory ?? []),
    }));
  }

  listAuthIncompleteBusinesses(): Array<Pick<BusinessProfile, "id" | "name" | "bookingPageSlug">> {
    return this.state.businesses
      .filter((business) => this.isAuthIncompleteBusiness(business))
      .map((business) => ({
        id: business.id,
        name: business.name,
        bookingPageSlug: business.bookingPageSlug,
      }));
  }

  getBusiness(businessId: string): BusinessProfile {
    const business = this.state.businesses.find((item) => item.id === businessId);
    if (!business) throw new HttpError(400, `Business '${businessId}' was not found.`);
    return business;
  }

  getBusinessView(businessId: string): BusinessView {
    return this.toBusinessView(this.getBusiness(businessId));
  }

  getBusinessBySlug(bookingPageSlug: string): BusinessProfile {
    const normalizedSlug = bookingPageSlug.trim().toLowerCase();

    const business = this.state.businesses.find(
      (item) => item.bookingPageSlug.toLowerCase() === normalizedSlug
    );

    if (!business) {
      throw new HttpError(400, `Business with booking slug '${bookingPageSlug}' was not found.`);
    }

    return business;
  }

  findBusinessByOwnerEmail(ownerEmail: string): BusinessProfile | undefined {
    const normalizedEmail = ownerEmail.trim().toLowerCase();

    return this.state.businesses.find(
      (business) => business.ownerEmail.toLowerCase() === normalizedEmail
    );
  }

  async updateBusinessAuth(input: UpdateBusinessAuthInput): Promise<BusinessProfile> {
    const businessIdOrSlug = input.businessIdOrSlug.trim();
    const ownerName = input.ownerName.trim();
    const ownerEmail = input.ownerEmail.trim().toLowerCase();
    const passwordHash = input.passwordHash.trim();
    const passwordSalt = input.passwordSalt.trim();

    if (!businessIdOrSlug) {
      throw new HttpError(400, "Business id or booking page slug is required.");
    }
    if (!ownerName) {
      throw new HttpError(400, "Owner full name is required.");
    }
    if (!ownerEmail) {
      throw new HttpError(400, "Business email is required.");
    }
    if (!EMAIL_PATTERN.test(ownerEmail)) {
      throw new HttpError(400, "A valid business email is required.");
    }
    if (!passwordHash) {
      throw new HttpError(400, "Password hash is required.");
    }
    if (!passwordSalt) {
      throw new HttpError(400, "Password salt is required.");
    }

    const nextState = this.cloneState();
    const normalizedSlug = businessIdOrSlug.toLowerCase();
    const businessIndex = nextState.businesses.findIndex(
      (business) => business.id === businessIdOrSlug || business.bookingPageSlug.toLowerCase() === normalizedSlug
    );

    if (businessIndex === -1) {
      throw new HttpError(400, "Business was not found.");
    }

    const emailTaken = nextState.businesses.some(
      (business, index) => index !== businessIndex && business.ownerEmail.toLowerCase() === ownerEmail
    );

    if (emailTaken) {
      throw new HttpError(400, "That business email is already in use.");
    }

    const updatedBusiness: BusinessProfile = {
      ...nextState.businesses[businessIndex],
      ownerName,
      ownerEmail,
      passwordHash,
      passwordSalt,
    };

    nextState.businesses[businessIndex] = updatedBusiness;
    await this.persistState(nextState);

    return updatedBusiness;
  }

  async updatePaymentConfig(businessId: string, config: PaymentConfig): Promise<PaymentConfig> {
    if (config.depositAmount < 0) {
      throw new HttpError(400, "Deposit amount must be zero or more.");
    }
    if (config.depositType === "percentage" && config.depositAmount > 100) {
      throw new HttpError(400, "Deposit percentage must be between 0 and 100.");
    }
    if (!config.paymentLabel.trim() || config.paymentLabel.trim().length > 30) {
      throw new HttpError(400, "Payment label must be between 1 and 30 characters.");
    }

    const nextState = this.cloneState();
    const business = nextState.businesses.find((b) => b.id === businessId);
    if (!business) throw new HttpError(400, "Business was not found.");

    business.depositEnabled = config.depositEnabled;
    business.depositType = config.depositType;
    business.depositAmount = config.depositAmount;
    business.paymentLabel = config.paymentLabel.trim();

    await this.persistState(nextState);
    return {
      ...config,
      paymentLabel: config.paymentLabel.trim(),
    };
  }

  async applyBillingAction(
    businessId: string,
    action: "mark_paid" | "suspend" | "reactivate" | "deactivate" | "refund",
    note?: string
  ): Promise<BusinessProfile> {
    const nextState = this.cloneState();
    const business = nextState.businesses.find((item) => item.id === businessId);

    if (!business) {
      throw new HttpError(400, "Business was not found.");
    }

    const now = new Date();
    const trimmedNote = typeof note === "string" && note.trim() ? note.trim() : undefined;
    const appendBillingEvent = (type: BillingEvent["type"], amountPence?: number) => {
      const history = business.billingHistory ?? [];
      history.push({
        id: this.createId("bill"),
        type,
        amountPence,
        note: trimmedNote,
        createdAt: now.toISOString(),
      });
      business.billingHistory = history;
    };

    switch (action) {
      case "mark_paid": {
        if (business.subscriptionStatus === "deactivated") {
          throw new HttpError(
            400,
            `Cannot apply '${action}' to a business with status '${business.subscriptionStatus}'.`
          );
        }

        const currentBillingDate = new Date(business.nextBillingDate ?? now.toISOString());
        const baseBillingTime = Number.isNaN(currentBillingDate.getTime())
          ? now.getTime()
          : currentBillingDate.getTime();
        business.nextBillingDate = new Date(
          baseBillingTime + SUBSCRIPTION_BILLING_WINDOW_MS
        ).toISOString();
        business.suspendedAt = undefined;
        business.cancellationRequestedAt = undefined;
        business.subscriptionStatus = "active";
        appendBillingEvent("payment_received", SUBSCRIPTION_PRICE_PENCE);
        break;
      }
      case "suspend":
        if (business.subscriptionStatus !== "active") {
          throw new HttpError(
            400,
            `Cannot apply '${action}' to a business with status '${business.subscriptionStatus}'.`
          );
        }
        business.subscriptionStatus = "suspended";
        business.suspendedAt = now.toISOString();
        appendBillingEvent("suspended");
        break;
      case "reactivate":
        if (business.subscriptionStatus !== "suspended") {
          throw new HttpError(
            400,
            `Cannot apply '${action}' to a business with status '${business.subscriptionStatus}'.`
          );
        }
        business.subscriptionStatus = "active";
        business.suspendedAt = undefined;
        appendBillingEvent("reactivated");
        break;
      case "deactivate":
        if (business.subscriptionStatus !== "suspended") {
          throw new HttpError(
            400,
            `Cannot apply '${action}' to a business with status '${business.subscriptionStatus}'.`
          );
        }
        business.subscriptionStatus = "deactivated";
        business.gdprRetentionFlaggedAt = now.toISOString();
        appendBillingEvent("deactivated");
        break;
      case "refund":
        appendBillingEvent("refund_issued", SUBSCRIPTION_PRICE_PENCE);
        break;
      default:
        throw new HttpError(400, "Invalid billing action.");
    }

    await this.persistState(nextState);
    return {
      ...business,
      billingHistory: this.cloneBillingHistory(business.billingHistory ?? []),
    };
  }

  async requestCancellation(businessId: string): Promise<BusinessProfile> {
    const nextState = this.cloneState();
    const business = nextState.businesses.find((item) => item.id === businessId);

    if (!business) {
      throw new HttpError(400, "Business was not found.");
    }

    if (business.subscriptionStatus !== "active") {
      throw new HttpError(
        400,
        `Cannot apply 'cancellation_requested' to a business with status '${business.subscriptionStatus}'.`
      );
    }

    if (business.cancellationRequestedAt) {
      throw new HttpError(400, "Cancellation has already been requested.");
    }

    const now = new Date().toISOString();
    business.cancellationRequestedAt = now;
    const history = business.billingHistory ?? [];
    history.push({
      id: this.createId("bill"),
      type: "cancellation_requested",
      createdAt: now,
    });
    business.billingHistory = history;

    await this.persistState(nextState);
    return {
      ...business,
      billingHistory: this.cloneBillingHistory(business.billingHistory ?? []),
    };
  }

  async createService(input: CreateServiceInput): Promise<Service> {
    this.getBusiness(input.businessId);

    const service: Service = {
      id: this.createId("svc"),
      name: input.name.trim(),
      durationMinutes: input.durationMinutes,
      price: input.price,
      active: input.active ?? true,
      bufferMinutes: input.bufferMinutes ?? 0,
    };

    this.assertValidService(service);

    const nextState = this.cloneState();
    const current = nextState.services.get(input.businessId) ?? [];
    current.push({ ...service });
    nextState.services.set(input.businessId, current);

    await this.persistState(nextState);
    return service;
  }

  listServices(businessId: string): Service[] {
    this.getBusiness(businessId);
    return [...(this.state.services.get(businessId) ?? [])];
  }

  async updateService(input: UpdateServiceInput): Promise<Service> {
    this.getBusiness(input.businessId);

    const nextState = this.cloneState();
    const services = nextState.services.get(input.businessId) ?? [];
    const index = services.findIndex((service) => service.id === input.serviceId);

    if (index === -1) {
      throw new HttpError(400, "Service was not found.");
    }

    const current = services[index];
    const updated: Service = {
      ...current,
      name: input.name === undefined ? current.name : input.name.trim(),
      durationMinutes:
        input.durationMinutes === undefined ? current.durationMinutes : input.durationMinutes,
      price: input.price === undefined ? current.price : input.price,
      active: input.active === undefined ? current.active : input.active,
      bufferMinutes: input.bufferMinutes === undefined ? current.bufferMinutes : input.bufferMinutes,
    };

    this.assertValidService(updated);

    services[index] = updated;
    nextState.services.set(input.businessId, services);

    await this.persistState(nextState);
    return updated;
  }

  async deleteService(businessId: string, serviceId: string): Promise<void> {
    this.getBusiness(businessId);

    const nextState = this.cloneState();
    const services = nextState.services.get(businessId) ?? [];
    const nextServices = services.filter((service) => service.id !== serviceId);

    if (nextServices.length === services.length) {
      throw new HttpError(400, "Service was not found.");
    }

    nextState.services.set(businessId, nextServices);
    await this.persistState(nextState);
  }

  async updateWeeklyAvailability(input: UpdateBusinessScheduleInput): Promise<WeeklyAvailability[]> {
    this.getBusiness(input.businessId);

    const sanitized = input.availability
      .map((window) => ({ ...window }))
      .sort((left, right) => {
        return (
          left.dayOfWeek - right.dayOfWeek ||
          left.startMinutes - right.startMinutes ||
          left.endMinutes - right.endMinutes
        );
      });

    assertValidAvailabilitySchedule(sanitized);

    const nextState = this.cloneState();
    nextState.availability.set(input.businessId, sanitized);

    await this.persistState(nextState);
    return sanitized;
  }

  listWeeklyAvailability(businessId: string): WeeklyAvailability[] {
    this.getBusiness(businessId);
    return [...(this.state.availability.get(businessId) ?? [])];
  }

  async createBlockedTime(input: CreateBlockedTimeInput): Promise<BlockedTime> {
    this.getBusiness(input.businessId);

    this.assertValidBlockedTimeRange(input.start, input.end);

    const blockedTime: BlockedTime = {
      id: this.createId("blk"),
      start: input.start,
      end: input.end,
      reason: input.reason?.trim(),
    };

    const nextState = this.cloneState();
    const current = nextState.blockedTimes.get(input.businessId) ?? [];
    current.push({
      ...blockedTime,
      start: new Date(blockedTime.start),
      end: new Date(blockedTime.end),
    });
    nextState.blockedTimes.set(input.businessId, current);

    await this.persistState(nextState);
    return blockedTime;
  }

  async updateBlockedTime(input: UpdateBlockedTimeInput): Promise<BlockedTime> {
    this.getBusiness(input.businessId);
    this.assertValidBlockedTimeRange(input.start, input.end);

    const nextState = this.cloneState();
    const blockedTimes = nextState.blockedTimes.get(input.businessId) ?? [];
    const index = blockedTimes.findIndex((blockedTime) => blockedTime.id === input.blockedTimeId);

    if (index === -1) {
      throw new HttpError(400, "Blocked time was not found.");
    }

    const updated: BlockedTime = {
      ...blockedTimes[index],
      start: input.start,
      end: input.end,
      reason: input.reason?.trim(),
    };

    blockedTimes[index] = updated;
    nextState.blockedTimes.set(input.businessId, blockedTimes);

    await this.persistState(nextState);
    return updated;
  }

  async deleteBlockedTime(businessId: string, blockedTimeId: string): Promise<void> {
    this.getBusiness(businessId);

    const nextState = this.cloneState();
    const blockedTimes = nextState.blockedTimes.get(businessId) ?? [];
    const nextBlockedTimes = blockedTimes.filter((blockedTime) => blockedTime.id !== blockedTimeId);

    if (nextBlockedTimes.length === blockedTimes.length) {
      throw new HttpError(400, "Blocked time was not found.");
    }

    nextState.blockedTimes.set(businessId, nextBlockedTimes);
    await this.persistState(nextState);
  }

  listBlockedTimesForDate(businessId: string, date: Date): BlockedTime[] {
    const business = this.getBusiness(businessId);
    const businessDay = buildBusinessDayRange(date, business.timezone);

    return (this.state.blockedTimes.get(businessId) ?? []).filter((blockedTime) =>
      rangesOverlap(blockedTime.start, blockedTime.end, businessDay.start, businessDay.end)
    );
  }

  listBookings(businessId: string): BookingDetails[] {
    this.getBusiness(businessId);
    const services = this.state.services.get(businessId) ?? [];
    return (this.state.bookings.get(businessId) ?? []).map((booking) =>
      this.attachServiceSnapshots(booking, services)
    );
  }

  getAvailableSlots(businessId: string, date: Date, serviceIds: string[], stepMinutes = 15): AvailableSlot[] {
    const business = this.getBusiness(businessId);

    const services = this.resolveRequestedServices(businessId, serviceIds);
    const availabilityWindows = this.resolveAvailabilityForDate(businessId, date);
    if (availabilityWindows.length === 0) {
      return [];
    }

    const bookings = this.listActiveBookingsForDate(businessId, date);
    const blockedTimes = this.listBlockedTimesForDate(businessId, date);

    return generateAvailableSlots({
      date,
      services,
      availability: availabilityWindows,
      bookings,
      blockedTimes,
      stepMinutes,
      timeZone: business.timezone,
    });
  }

  async createBooking(input: CreateBookingInput): Promise<BookingDetails> {
    return this.withBusinessBookingCreationLock(input.businessId, async () => {
      const business = this.getBusiness(input.businessId);

      if (!(input.requestedStart instanceof Date)) {
        throw new HttpError(400, "Requested booking time is invalid.");
      }

      const requestedStartTime = input.requestedStart.getTime();

      if (Number.isNaN(requestedStartTime)) {
        throw new HttpError(400, "Requested booking time is invalid.");
      }
      if (requestedStartTime <= Date.now()) {
        throw new HttpError(400, "Requested booking time must be in the future.");
      }

      const customer = {
        name: input.customer.name.trim(),
        phone: input.customer.phone.trim(),
        email: input.customer.email?.trim() ?? "",
        notes: input.customer.notes?.trim(),
      };

      if (!customer.name) throw new HttpError(400, "Customer name is required.");
      if (!customer.phone) throw new HttpError(400, "Customer phone is required.");
      if (!customer.email) throw new HttpError(400, "Customer email is required.");
      if (!EMAIL_PATTERN.test(customer.email)) {
        throw new HttpError(400, "Customer email is invalid.");
      }

      const services = this.resolveRequestedServices(input.businessId, input.serviceIds);
      const totalPrice = services.reduce((sum, service) => sum + Number(service.price || 0), 0);
      const paymentConfig = {
        depositEnabled: business.depositEnabled ?? false,
        depositType: business.depositType ?? "fixed",
        depositAmount: business.depositAmount ?? 0,
      };
      const bookingPaymentStatus: PaymentStatus = paymentConfig.depositEnabled ? "pending" : "not_required";
      const bookingStatus = paymentConfig.depositEnabled ? "pending_payment" : "confirmed";
      const snapshotDepositAmount = paymentConfig.depositEnabled
        ? paymentConfig.depositType === "fixed"
          ? paymentConfig.depositAmount
          : Math.round((totalPrice * paymentConfig.depositAmount) / 100)
        : 0;
      const availabilityWindows = this.resolveAvailabilityForInstant(input.businessId, input.requestedStart);
      if (availabilityWindows.length === 0) {
        throw new HttpError(400, "No working availability exists for the selected date.");
      }

      const computation: BookingComputation = buildBookingComputation(input.requestedStart, services);
      const activeBookings = this.listActiveBookings(input.businessId);
      const blockedTimes = this.listBlockedTimes(input.businessId);

      const fitsAvailability = availabilityWindows.some((window) =>
        this.fitsWithinAvailabilityWindow(computation.start, computation.end, window, business.timezone)
      );

      if (!fitsAvailability) {
        throw new HttpError(400, "Booking does not fit within business working hours.");
      }

      if (conflictsWithExistingTime(computation.start, computation.end, activeBookings, blockedTimes)) {
        throw new HttpError(400, "Selected booking time is no longer available.");
      }

      const now = new Date();
      const booking: BookingRecord = {
        id: this.createId("bkg"),
        businessId: input.businessId,
        customer,
        serviceIds: [...input.serviceIds],
        start: computation.start,
        end: computation.end,
        totalDurationMinutes: computation.totalDurationMinutes,
        paymentStatus: bookingPaymentStatus,
        depositAmount: snapshotDepositAmount,
        status: bookingStatus,
        createdAt: now,
        updatedAt: now,
      };

      const nextState = this.cloneState();
      const current = nextState.bookings.get(input.businessId) ?? [];
      current.push({
        ...booking,
        customer: { ...booking.customer },
        serviceIds: [...booking.serviceIds],
        start: new Date(booking.start),
        end: new Date(booking.end),
        createdAt: new Date(booking.createdAt),
        updatedAt: new Date(booking.updatedAt),
      });
      nextState.bookings.set(input.businessId, current);

      await this.persistState(nextState);
      return this.attachServiceSnapshots(booking, services);
    });
  }

  async cancelBooking(businessId: string, bookingId: string): Promise<BookingDetails> {
    this.getBusiness(businessId);

    const nextState = this.cloneState();
    const bookings = nextState.bookings.get(businessId) ?? [];
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) {
      throw new HttpError(400, `Booking '${bookingId}' was not found.`);
    }

    booking.status = "cancelled";
    booking.updatedAt = new Date();

    await this.persistState(nextState);

    const services = nextState.services.get(businessId) ?? [];
    return this.attachServiceSnapshots(booking, services);
  }

  async rescheduleBooking(
    businessId: string,
    bookingId: string,
    newStart: Date
  ): Promise<BookingDetails> {
    return this.withBusinessBookingCreationLock(businessId, async () => {
      const business = this.getBusiness(businessId);

      if (!(newStart instanceof Date) || Number.isNaN(newStart.getTime())) {
        throw new HttpError(400, "Requested reschedule time is invalid.");
      }

      if (newStart.getTime() <= Date.now()) {
        throw new HttpError(400, "Requested reschedule time must be in the future.");
      }

      const nextState = this.cloneState();
      const bookings = nextState.bookings.get(businessId) ?? [];
      const booking = bookings.find((item) => item.id === bookingId);

      if (!booking) {
        throw new HttpError(400, `Booking '${bookingId}' was not found.`);
      }

      if (
        booking.status === "cancelled" ||
        booking.status === "completed" ||
        booking.status === "no_show"
      ) {
        throw new HttpError(400, "Only active bookings can be rescheduled.");
      }

      const services = this.resolveRequestedServices(businessId, booking.serviceIds);
      const computation = buildBookingComputation(newStart, services);

      const availabilityWindows = this.resolveAvailabilityForInstant(businessId, newStart);
      if (availabilityWindows.length === 0) {
        throw new HttpError(400, "No working availability exists for the selected date.");
      }

      const fitsAvailability = availabilityWindows.some((window) =>
        this.fitsWithinAvailabilityWindow(computation.start, computation.end, window, business.timezone)
      );

      if (!fitsAvailability) {
        throw new HttpError(400, "Reschedule time does not fit within business working hours.");
      }

      const otherActiveBookings = this.listActiveBookings(businessId).filter((item) => item.id !== bookingId);
      const blockedTimes = this.listBlockedTimes(businessId);

      if (conflictsWithExistingTime(computation.start, computation.end, otherActiveBookings, blockedTimes)) {
        throw new HttpError(400, "Selected reschedule time is not available.");
      }

      booking.start = computation.start;
      booking.end = computation.end;
      booking.totalDurationMinutes = computation.totalDurationMinutes;
      booking.status = "rescheduled";
      booking.updatedAt = new Date();

      await this.persistState(nextState);

      const currentServices = nextState.services.get(businessId) ?? [];
      return this.attachServiceSnapshots(booking, currentServices);
    });
  }

  async updateBookingPaymentStatus(input: UpdatePaymentStatusInput): Promise<BookingDetails> {
    const nextState = this.cloneState();
    const bookings = nextState.bookings.get(input.businessId) ?? [];
    const booking = bookings.find((b) => b.id === input.bookingId);

    if (!booking) throw new HttpError(400, "Booking was not found.");

    const allowedTransitions: Record<string, PaymentStatus[]> = {
      pending: ["paid", "failed"],
      paid: ["refunded", "partially_refunded"],
      failed: ["pending", "paid"],
      not_required: [],
      refunded: [],
      partially_refunded: [],
    };

    const allowed = allowedTransitions[booking.paymentStatus] ?? [];
    if (!allowed.includes(input.paymentStatus)) {
      throw new HttpError(
        400,
        `Cannot transition payment from '${booking.paymentStatus}' to '${input.paymentStatus}'.`
      );
    }

    booking.paymentStatus = input.paymentStatus;

    if (input.paymentStatus === "paid") {
      booking.status = "confirmed";
    } else if (input.paymentStatus === "refunded") {
      booking.status = "cancelled";
    }

    booking.updatedAt = new Date();

    await this.persistState(nextState);
    const services = nextState.services.get(input.businessId) ?? [];
    return this.attachServiceSnapshots(booking, services);
  }

  private assertValidService(service: Service): void {
    if (!service.name) throw new HttpError(400, "Service name is required.");
    if (!Number.isInteger(service.durationMinutes) || service.durationMinutes <= 0) {
      throw new HttpError(400, "Service duration must be a positive whole number.");
    }
    if (
      service.bufferMinutes !== undefined &&
      (!Number.isInteger(service.bufferMinutes) || service.bufferMinutes < 0)
    ) {
      throw new HttpError(400, "Service buffer must be zero or more.");
    }
    if (typeof service.price !== "number" || Number.isNaN(service.price) || service.price < 0) {
      throw new HttpError(400, "Service price must be zero or more.");
    }
  }

  private resolveRequestedServices(businessId: string, serviceIds: string[]): Service[] {
    if (serviceIds.length === 0) {
      throw new HttpError(400, "At least one service must be selected.");
    }

    const services = this.state.services.get(businessId) ?? [];
    return serviceIds.map((serviceId) => {
      const service = services.find((item) => item.id === serviceId && item.active);
      if (!service) {
        throw new HttpError(400, `Service '${serviceId}' is invalid or inactive.`);
      }
      return service;
    });
  }

  private resolveAvailabilityForDate(businessId: string, date: Date): WeeklyAvailability[] {
    const business = this.getBusiness(businessId);
    const businessDay = buildBusinessDayRange(date, business.timezone);
    return getAvailabilityWindowsForDay(this.state.availability.get(businessId) ?? [], businessDay.dayOfWeek);
  }

  private listActiveBookingsForDate(businessId: string, date: Date): ExistingBooking[] {
    const business = this.getBusiness(businessId);
    const businessDay = buildBusinessDayRange(date, business.timezone);

    return this.listActiveBookings(businessId).filter((booking) =>
      rangesOverlap(booking.start, booking.end, businessDay.start, businessDay.end)
    );
  }

  private attachServiceSnapshots(booking: BookingRecord, services: Service[]): BookingDetails {
    const snapshots: ServiceSnapshot[] = booking.serviceIds.map((serviceId) => {
      const service = services.find((item) => item.id === serviceId);
      if (!service) {
        return {
          serviceId,
          name: "Unknown service",
          durationMinutes: 0,
          bufferMinutes: 0,
          price: 0,
        };
      }

      return {
        serviceId: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        bufferMinutes: service.bufferMinutes ?? 0,
        price: service.price,
      };
    });

    return {
      ...booking,
      services: snapshots,
    };
  }

  private resolveAvailabilityForInstant(businessId: string, instant: Date): WeeklyAvailability[] {
    const business = this.getBusiness(businessId);
    const dayOfWeek = getLocalDayOfWeek(instant, business.timezone);
    return getAvailabilityWindowsForDay(this.state.availability.get(businessId) ?? [], dayOfWeek);
  }

  private listActiveBookings(businessId: string): ExistingBooking[] {
    return (this.state.bookings.get(businessId) ?? []).filter(
      (booking) =>
        booking.status === "pending_payment" ||
        booking.status === "confirmed" ||
        booking.status === "rescheduled"
    );
  }

  private listBlockedTimes(businessId: string): BlockedTime[] {
    return [...(this.state.blockedTimes.get(businessId) ?? [])];
  }

  private fitsWithinAvailabilityWindow(
    start: Date,
    end: Date,
    window: WeeklyAvailability,
    timeZone: string
  ): boolean {
    return fitsWithinAvailability(start, end, window, timeZone);
  }

  private async withBusinessBookingCreationLock<T>(
    businessId: string,
    action: () => Promise<T>
  ): Promise<T> {
    const previousTail = this.bookingCreationLocks.get(businessId) ?? Promise.resolve();
    let releaseCurrentLock: (() => void) | undefined;
    const currentLock = new Promise<void>((resolve) => {
      releaseCurrentLock = resolve;
    });
    const lockTail = previousTail.then(() => currentLock);
    this.bookingCreationLocks.set(businessId, lockTail);

    await previousTail;

    try {
      return await action();
    } finally {
      releaseCurrentLock?.();
      if (this.bookingCreationLocks.get(businessId) === lockTail) {
        this.bookingCreationLocks.delete(businessId);
      }
    }
  }

  private assertValidBlockedTimeRange(start: Date, end: Date): void {
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
      throw new HttpError(400, "Blocked time start must be a valid date.");
    }
    if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
      throw new HttpError(400, "Blocked time end must be a valid date.");
    }
    if (start >= end) {
      throw new HttpError(400, "Blocked time start must be before blocked time end.");
    }
  }

  private createId(prefix: string): string {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now()}_${random}`;
  }

  private isAuthIncompleteBusiness(business: BusinessProfile): boolean {
    return (
      !business.ownerName.trim() ||
      !business.ownerEmail.trim() ||
      !business.passwordHash.trim() ||
      !business.passwordSalt.trim()
    );
  }

  private async loadFromDisk(): Promise<void> {
    const persisted = await readStoreFile();
    const defaultSubscriptionStartDate = new Date().toISOString();
    const defaultNextBillingDate = new Date(
      Date.now() + SUBSCRIPTION_BILLING_WINDOW_MS
    ).toISOString();

    this.state.businesses = persisted.businesses.map((business) => ({
      ...business,
      ownerName: business.ownerName ?? "",
      ownerEmail: business.ownerEmail ?? "",
      passwordHash: business.passwordHash ?? "",
      passwordSalt: business.passwordSalt ?? "",
      depositEnabled: business.depositEnabled ?? false,
      depositType: business.depositType ?? "fixed",
      depositAmount: business.depositAmount ?? 0,
      paymentLabel: business.paymentLabel ?? "Deposit",
      subscriptionStatus: business.subscriptionStatus ?? "active",
      subscriptionStartDate: business.subscriptionStartDate ?? defaultSubscriptionStartDate,
      nextBillingDate: business.nextBillingDate ?? defaultNextBillingDate,
      suspendedAt: business.suspendedAt ?? undefined,
      cancellationRequestedAt: business.cancellationRequestedAt ?? undefined,
      gdprRetentionFlaggedAt: business.gdprRetentionFlaggedAt ?? undefined,
      billingHistory: this.cloneBillingHistory(business.billingHistory ?? []),
    }));
    this.state.services = new Map(
      Object.entries(persisted.servicesByBusinessId).map(([businessId, services]) => [
        businessId,
        services.map((service) => ({ ...service })),
      ])
    );

    this.state.availability = new Map(
      Object.entries(persisted.availabilityByBusinessId).map(([businessId, availability]) => [
        businessId,
        availability.map((window) => ({ ...window })),
      ])
    );

    this.state.blockedTimes = new Map(
      Object.entries(persisted.blockedTimesByBusinessId).map(([businessId, blockedTimes]) => [
        businessId,
        blockedTimes.map((blocked) => ({
          ...blocked,
          start: new Date(blocked.start),
          end: new Date(blocked.end),
        })),
      ])
    );

    this.state.bookings = new Map(
      Object.entries(persisted.bookingsByBusinessId).map(([businessId, bookings]) => [
        businessId,
        bookings.map((booking) => ({
          ...booking,
          start: new Date(booking.start),
          end: new Date(booking.end),
          createdAt: new Date(booking.createdAt),
          updatedAt: new Date(booking.updatedAt),
        })),
      ])
    );
  }

  private cloneState(): StoreState {
    return {
      businesses: this.state.businesses.map((business) => ({
        ...business,
        billingHistory: this.cloneBillingHistory(business.billingHistory ?? []),
      })),
      services: new Map(
        Array.from(this.state.services.entries()).map(([businessId, services]) => [
          businessId,
          services.map((service) => ({ ...service })),
        ])
      ),
      availability: new Map(
        Array.from(this.state.availability.entries()).map(([businessId, availability]) => [
          businessId,
          availability.map((window) => ({ ...window })),
        ])
      ),
      blockedTimes: new Map(
        Array.from(this.state.blockedTimes.entries()).map(([businessId, blockedTimes]) => [
          businessId,
          blockedTimes.map((blockedTime) => ({
            ...blockedTime,
            start: new Date(blockedTime.start),
            end: new Date(blockedTime.end),
          })),
        ])
      ),
      bookings: new Map(
        Array.from(this.state.bookings.entries()).map(([businessId, bookings]) => [
          businessId,
          bookings.map((booking) => ({
            ...booking,
            customer: { ...booking.customer },
            serviceIds: [...booking.serviceIds],
            start: new Date(booking.start),
            end: new Date(booking.end),
            createdAt: new Date(booking.createdAt),
            updatedAt: new Date(booking.updatedAt),
          })),
        ])
      ),
    };
  }

  private async persistState(nextState: StoreState): Promise<void> {
    await writeStoreFile(this.serializeState(nextState));
    this.state.businesses = nextState.businesses;
    this.state.services = nextState.services;
    this.state.availability = nextState.availability;
    this.state.blockedTimes = nextState.blockedTimes;
    this.state.bookings = nextState.bookings;
  }

  private serializeState(state: StoreState): PersistedStoreState {
    return {
      businesses: state.businesses.map((business): PersistedBusinessProfile => ({
        ...business,
        depositEnabled: business.depositEnabled ?? false,
        depositType: business.depositType ?? "fixed",
        depositAmount: business.depositAmount ?? 0,
        paymentLabel: business.paymentLabel ?? "Deposit",
        subscriptionStatus: business.subscriptionStatus ?? "active",
        subscriptionStartDate: business.subscriptionStartDate ?? new Date().toISOString(),
        nextBillingDate:
          business.nextBillingDate ??
          new Date(Date.now() + SUBSCRIPTION_BILLING_WINDOW_MS).toISOString(),
        suspendedAt: business.suspendedAt ?? undefined,
        cancellationRequestedAt: business.cancellationRequestedAt ?? undefined,
        gdprRetentionFlaggedAt: business.gdprRetentionFlaggedAt ?? undefined,
        billingHistory: this.cloneBillingHistory(business.billingHistory ?? []),
      })),
      servicesByBusinessId: Object.fromEntries(
        Array.from(state.services.entries()).map(([businessId, services]) => [
          businessId,
          services.map((service): PersistedService => ({ ...service })),
        ])
      ),
      availabilityByBusinessId: Object.fromEntries(
        Array.from(state.availability.entries()).map(([businessId, availability]) => [
          businessId,
          availability.map((window): PersistedWeeklyAvailability => ({ ...window })),
        ])
      ),
      blockedTimesByBusinessId: Object.fromEntries(
        Array.from(state.blockedTimes.entries()).map(([businessId, blockedTimes]) => [
          businessId,
          blockedTimes.map((blocked): PersistedBlockedTime => ({
            ...blocked,
            start: blocked.start.toISOString(),
            end: blocked.end.toISOString(),
          })),
        ])
      ),
      bookingsByBusinessId: Object.fromEntries(
        Array.from(state.bookings.entries()).map(([businessId, bookings]) => [
          businessId,
          bookings.map((booking): PersistedBookingRecord => ({
            ...booking,
            customer: { ...booking.customer },
            serviceIds: [...booking.serviceIds],
            start: booking.start.toISOString(),
            end: booking.end.toISOString(),
            createdAt: booking.createdAt.toISOString(),
            updatedAt: booking.updatedAt.toISOString(),
          })),
        ])
      ),
    };
  }

  private toBusinessView(business: BusinessProfile): BusinessView {
    return {
      id: business.id,
      name: business.name,
      ownerName: business.ownerName,
      ownerEmail: business.ownerEmail,
      timezone: business.timezone,
      bookingPageSlug: business.bookingPageSlug,
      paymentConfig: {
        depositEnabled: business.depositEnabled ?? false,
        depositType: business.depositType ?? "fixed",
        depositAmount: business.depositAmount ?? 0,
        paymentLabel: business.paymentLabel ?? "Deposit",
      },
      subscriptionStatus: business.subscriptionStatus ?? "active",
      subscriptionStartDate: business.subscriptionStartDate ?? new Date().toISOString(),
      nextBillingDate:
        business.nextBillingDate ??
        new Date(Date.now() + SUBSCRIPTION_BILLING_WINDOW_MS).toISOString(),
      suspendedAt: business.suspendedAt ?? undefined,
      cancellationRequestedAt: business.cancellationRequestedAt ?? undefined,
      billingHistory: this.cloneBillingHistory(business.billingHistory ?? []),
    };
  }

  private cloneBillingHistory(
    events: Array<{
      id: string;
      type: string;
      amountPence?: number;
      note?: string;
      createdAt: string;
    }>
  ): BillingEvent[] {
    return events.map((event) => ({
      id: event.id,
      type: event.type as BillingEvent["type"],
      amountPence: event.amountPence,
      note: event.note,
      createdAt: event.createdAt,
    }));
  }
}
