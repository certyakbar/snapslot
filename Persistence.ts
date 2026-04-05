import { promises as fs } from "fs";
import path from "path";
import { SUBSCRIPTION_BILLING_WINDOW_MS } from "./bookingCore.ts";

export interface PersistedBusinessProfile {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  passwordHash: string;
  passwordSalt: string;
  timezone: string;
  bookingPageSlug: string;
  depositEnabled: boolean;
  depositType: "fixed" | "percentage";
  depositAmount: number;
  paymentLabel?: string;
  subscriptionStatus: "active" | "suspended" | "deactivated";
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
}

export interface PersistedService {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  active: boolean;
  bufferMinutes?: number;
}

export interface PersistedWeeklyAvailability {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  active: boolean;
}

export interface PersistedBlockedTime {
  id: string;
  start: string;
  end: string;
  reason?: string;
}

export interface PersistedCustomerDetails {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}

export interface PersistedBookingRecord {
  id: string;
  businessId: string;
  customer: PersistedCustomerDetails;
  serviceIds: string[];
  totalDurationMinutes: number;
  paymentStatus: "not_required" | "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
  depositAmount: number;
  start: string;
  end: string;
  status: "pending_payment" | "confirmed" | "rescheduled" | "cancelled" | "completed" | "no_show";
  createdAt: string;
  updatedAt: string;
}

export interface PersistedStoreState {
  businesses: PersistedBusinessProfile[];
  servicesByBusinessId: Record<string, PersistedService[]>;
  availabilityByBusinessId: Record<string, PersistedWeeklyAvailability[]>;
  blockedTimesByBusinessId: Record<string, PersistedBlockedTime[]>;
  bookingsByBusinessId: Record<string, PersistedBookingRecord[]>;
}

const DATA_FILE = process.env.BOOKING_SYSTEM_DATA_FILE
  ? path.resolve(process.env.BOOKING_SYSTEM_DATA_FILE)
  : path.join(process.cwd(), "data", "store.json");
const DATA_DIR = path.dirname(DATA_FILE);

const EMPTY_STATE: PersistedStoreState = {
  businesses: [],
  servicesByBusinessId: {},
  availabilityByBusinessId: {},
  blockedTimesByBusinessId: {},
  bookingsByBusinessId: {},
};

export async function ensureDataFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(EMPTY_STATE, null, 2), "utf-8");
  }
}

export async function readStoreFile(): Promise<PersistedStoreState> {
  await ensureDataFile();

  const raw = await fs.readFile(DATA_FILE, "utf-8");
  const parsed = JSON.parse(raw) as Partial<PersistedStoreState>;
  const defaultSubscriptionStartDate = new Date().toISOString();
  const defaultNextBillingDate = new Date(
    Date.now() + SUBSCRIPTION_BILLING_WINDOW_MS
  ).toISOString();

  return {
    businesses: Array.isArray(parsed.businesses)
      ? parsed.businesses.map((b: any) => ({
          ...b,
          depositEnabled: b.depositEnabled ?? false,
          depositType: b.depositType ?? "fixed",
          depositAmount: b.depositAmount ?? 0,
          paymentLabel: b.paymentLabel ?? "Deposit",
          subscriptionStatus: b.subscriptionStatus ?? "active",
          subscriptionStartDate: b.subscriptionStartDate ?? defaultSubscriptionStartDate,
          nextBillingDate: b.nextBillingDate ?? defaultNextBillingDate,
          suspendedAt: b.suspendedAt ?? undefined,
          cancellationRequestedAt: b.cancellationRequestedAt ?? undefined,
          gdprRetentionFlaggedAt: b.gdprRetentionFlaggedAt ?? undefined,
          billingHistory: Array.isArray(b.billingHistory) ? b.billingHistory : [],
        }))
      : [],
    servicesByBusinessId: parsed.servicesByBusinessId ?? {},
    availabilityByBusinessId: parsed.availabilityByBusinessId ?? {},
    blockedTimesByBusinessId: parsed.blockedTimesByBusinessId ?? {},
    bookingsByBusinessId: Object.fromEntries(
      Object.entries(parsed.bookingsByBusinessId ?? {}).map(([id, bookings]) => [
        id,
        (bookings as any[]).map((b) => ({
          ...b,
          paymentStatus: b.paymentStatus ?? "not_required",
          depositAmount: b.depositAmount ?? 0,
        })),
      ])
    ),
  };
}

export async function writeStoreFile(state: PersistedStoreState): Promise<void> {
  await ensureDataFile();
  const tempFile = path.join(
    DATA_DIR,
    `${path.basename(DATA_FILE)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  const payload = JSON.stringify(state, null, 2);

  try {
    await fs.writeFile(tempFile, payload, "utf-8");
    await fs.rename(tempFile, DATA_FILE);
  } catch (error) {
    try {
      await fs.unlink(tempFile);
    } catch {
      // Best-effort cleanup only.
    }

    throw error;
  }
}

export function getDataFilePath(): string {
  return DATA_FILE;
}
