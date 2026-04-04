export type BookingStatus = "pending_payment" | "confirmed" | "rescheduled" | "cancelled" | "completed" | "no_show";

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  active: boolean;
  bufferMinutes?: number;
}

export interface WeeklyAvailability {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  startMinutes: number; // minutes from midnight
  endMinutes: number; // minutes from midnight
  active: boolean;
}

export interface TimeBlock {
  start: Date;
  end: Date;
}

export interface BlockedTime extends TimeBlock {
  id: string;
  reason?: string;
}

export interface ExistingBooking extends TimeBlock {
  id: string;
  status: BookingStatus;
}

export interface CustomerDetails {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}

export interface BookingRequest {
  serviceIds: string[];
  customer: CustomerDetails;
  requestedStart: Date;
}

export interface BookingComputation {
  totalDurationMinutes: number;
  start: Date;
  end: Date;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
}

export interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

export interface ZonedDateParts extends CalendarDateParts {
  dayOfWeek: number;
  hour: number;
  minute: number;
}

export interface BusinessDayRange {
  start: Date;
  end: Date;
  date: CalendarDateParts;
  dayOfWeek: number;
}

const MINUTES_IN_DAY = 24 * 60;
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const zonedDateFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function assertValidService(service: Service): void {
  if (!service.id.trim()) throw new Error("Service id is required.");
  if (!service.name.trim()) throw new Error("Service name is required.");
  if (!Number.isInteger(service.durationMinutes) || service.durationMinutes <= 0) {
    throw new Error("Service duration must be a positive whole number.");
  }
  if (service.bufferMinutes !== undefined) {
    if (!Number.isInteger(service.bufferMinutes) || service.bufferMinutes < 0) {
      throw new Error("Service buffer must be a whole number greater than or equal to zero.");
    }
  }
  if (typeof service.price !== "number" || Number.isNaN(service.price) || service.price < 0) {
    throw new Error("Service price must be zero or more.");
  }
}

export function assertValidAvailabilityWindow(window: WeeklyAvailability): void {
  if (!Number.isInteger(window.dayOfWeek) || window.dayOfWeek < 0 || window.dayOfWeek > 6) {
    throw new Error("dayOfWeek must be between 0 and 6.");
  }
  if (!Number.isInteger(window.startMinutes) || !Number.isInteger(window.endMinutes)) {
    throw new Error("Availability minutes must be whole numbers.");
  }
  if (window.startMinutes < 0 || window.endMinutes > MINUTES_IN_DAY) {
    throw new Error("Availability minutes must stay within the day.");
  }
  if (window.startMinutes >= window.endMinutes) {
    throw new Error("Availability start must be before availability end.");
  }
}

export function assertValidAvailabilitySchedule(availability: WeeklyAvailability[]): void {
  const activeWindowsByDay = new Map<number, WeeklyAvailability[]>();

  availability.forEach((window) => {
    assertValidAvailabilityWindow(window);

    if (!window.active) {
      return;
    }

    const dayWindows = activeWindowsByDay.get(window.dayOfWeek) ?? [];
    dayWindows.push(window);
    activeWindowsByDay.set(window.dayOfWeek, dayWindows);
  });

  for (const [dayOfWeek, dayWindows] of activeWindowsByDay.entries()) {
    dayWindows.sort(compareAvailabilityWindows);

    for (let index = 1; index < dayWindows.length; index += 1) {
      const previous = dayWindows[index - 1];
      const current = dayWindows[index];

      if (current.startMinutes < previous.endMinutes) {
        throw new Error(`Availability windows for day ${dayOfWeek} overlap.`);
      }
    }
  }
}

export function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function calculateTotalDuration(services: Service[]): number {
  if (services.length === 0) {
    throw new Error("At least one service must be selected.");
  }

  return services.reduce((total, service) => {
    assertValidService(service);
    const buffer = service.bufferMinutes ?? 0;
    return total + service.durationMinutes + buffer;
  }, 0);
}

export function buildBookingComputation(start: Date, services: Service[]): BookingComputation {
  const totalDurationMinutes = calculateTotalDuration(services);
  return {
    totalDurationMinutes,
    start,
    end: addMinutes(start, totalDurationMinutes),
  };
}

export function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = getZonedDateFormatter(timeZone);
  const partMap = formatter.formatToParts(date).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
    return parts;
  }, {});

  const weekday = WEEKDAY_INDEX[partMap.weekday];
  if (weekday === undefined) {
    throw new Error(`Unsupported weekday '${partMap.weekday}' for time zone conversion.`);
  }

  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    dayOfWeek: weekday,
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
  };
}

export function getCalendarDatePartsFromQueryDate(date: Date): CalendarDateParts {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function buildBusinessDayRange(date: Date, timeZone: string): BusinessDayRange {
  const selectedDate = getCalendarDatePartsFromQueryDate(date);
  const start = buildDateInTimeZone(selectedDate, 0, timeZone);
  const nextDate = addDaysToCalendarDate(selectedDate, 1);
  const end = buildDateInTimeZone(nextDate, 0, timeZone);
  const midday = buildDateInTimeZone(selectedDate, 12 * 60, timeZone);
  const dayOfWeek = getZonedDateParts(midday, timeZone).dayOfWeek;

  return {
    start,
    end,
    date: selectedDate,
    dayOfWeek,
  };
}

export function getLocalDayOfWeek(date: Date, timeZone: string): number {
  return getZonedDateParts(date, timeZone).dayOfWeek;
}

export function getMinutesFromMidnightInTimeZone(date: Date, timeZone: string): number {
  const zonedParts = getZonedDateParts(date, timeZone);
  return zonedParts.hour * 60 + zonedParts.minute;
}

export function getAvailabilityWindowsForDay(
  availability: WeeklyAvailability[],
  dayOfWeek: number
): WeeklyAvailability[] {
  return availability
    .filter((window) => window.active && window.dayOfWeek === dayOfWeek)
    .sort(compareAvailabilityWindows);
}

export function fitsWithinAvailability(
  start: Date,
  end: Date,
  window: WeeklyAvailability,
  timeZone: string
): boolean {
  assertValidAvailabilityWindow(window);

  if (!window.active) return false;

  const startParts = getZonedDateParts(start, timeZone);
  const endParts = getZonedDateParts(end, timeZone);

  if (startParts.dayOfWeek !== window.dayOfWeek || endParts.dayOfWeek !== window.dayOfWeek) {
    return false;
  }

  if (
    startParts.year !== endParts.year ||
    startParts.month !== endParts.month ||
    startParts.day !== endParts.day
  ) {
    return false;
  }

  const startMinutes = startParts.hour * 60 + startParts.minute;
  const endMinutes = endParts.hour * 60 + endParts.minute;

  return startMinutes >= window.startMinutes && endMinutes <= window.endMinutes;
}

export function conflictsWithExistingTime(
  start: Date,
  end: Date,
  bookings: ExistingBooking[],
  blockedTimes: BlockedTime[]
): boolean {
  const activeBookings = bookings.filter(
    (booking) =>
      booking.status === "confirmed" ||
      booking.status === "pending_payment" ||
      booking.status === "rescheduled"
  );

  const bookingConflict = activeBookings.some((booking) =>
    rangesOverlap(start, end, booking.start, booking.end)
  );
  if (bookingConflict) return true;

  const blockedConflict = blockedTimes.some((blocked) =>
    rangesOverlap(start, end, blocked.start, blocked.end)
  );
  return blockedConflict;
}

export function isSlotBookable(params: {
  start: Date;
  services: Service[];
  availability: WeeklyAvailability;
  bookings: ExistingBooking[];
  blockedTimes: BlockedTime[];
  timeZone: string;
}): boolean {
  const { start, services, availability, bookings, blockedTimes, timeZone } = params;
  const computation = buildBookingComputation(start, services);

  if (!fitsWithinAvailability(computation.start, computation.end, availability, timeZone)) {
    return false;
  }

  if (conflictsWithExistingTime(computation.start, computation.end, bookings, blockedTimes)) {
    return false;
  }

  return true;
}

export function generateAvailableSlots(params: {
  date: Date;
  services: Service[];
  availability: WeeklyAvailability[];
  bookings: ExistingBooking[];
  blockedTimes: BlockedTime[];
  stepMinutes: number;
  timeZone: string;
}): AvailableSlot[] {
  const { date, services, availability, bookings, blockedTimes, stepMinutes, timeZone } = params;

  if (!Number.isInteger(stepMinutes) || stepMinutes <= 0) {
    throw new Error("stepMinutes must be a positive whole number.");
  }

  const businessDay = buildBusinessDayRange(date, timeZone);
  const dayWindows = getAvailabilityWindowsForDay(availability, businessDay.dayOfWeek);

  if (dayWindows.length === 0) {
    return [];
  }

  const totalDurationMinutes = calculateTotalDuration(services);
  const slots: AvailableSlot[] = [];
  const seenSlots = new Set<number>();

  for (const window of dayWindows) {
    for (
      let currentMinutes = window.startMinutes;
      currentMinutes + totalDurationMinutes <= window.endMinutes;
      currentMinutes += stepMinutes
    ) {
      const start = tryBuildDateInTimeZone(businessDay.date, currentMinutes, timeZone);

      if (!start) {
        continue;
      }

      const end = addMinutes(start, totalDurationMinutes);

      if (!fitsWithinAvailability(start, end, window, timeZone)) {
        continue;
      }

      if (conflictsWithExistingTime(start, end, bookings, blockedTimes)) {
        continue;
      }

      const slotKey = start.getTime();
      if (seenSlots.has(slotKey)) {
        continue;
      }

      seenSlots.add(slotKey);
      slots.push({ start, end });
    }
  }

  slots.sort((left, right) => left.start.getTime() - right.start.getTime());
  return slots;
}

export function tryBuildDateInTimeZone(
  date: CalendarDateParts,
  minutesFromMidnight: number,
  timeZone: string
): Date | null {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  let candidate = new Date(Date.UTC(date.year, date.month - 1, date.day, hour, minute));

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const localParts = getZonedDateParts(candidate, timeZone);
    const differenceMs =
      Date.UTC(date.year, date.month - 1, date.day, hour, minute) -
      Date.UTC(localParts.year, localParts.month - 1, localParts.day, localParts.hour, localParts.minute);

    if (differenceMs === 0) {
      return candidate;
    }

    candidate = new Date(candidate.getTime() + differenceMs);
  }

  const resolvedParts = getZonedDateParts(candidate, timeZone);
  const matchesRequestedLocalTime =
    resolvedParts.year === date.year &&
    resolvedParts.month === date.month &&
    resolvedParts.day === date.day &&
    resolvedParts.hour === hour &&
    resolvedParts.minute === minute;

  return matchesRequestedLocalTime ? candidate : null;
}

export function buildDateInTimeZone(
  date: CalendarDateParts,
  minutesFromMidnight: number,
  timeZone: string
): Date {
  const resolved = tryBuildDateInTimeZone(date, minutesFromMidnight, timeZone);

  if (!resolved) {
    throw new Error("The selected business-local time could not be resolved.");
  }

  return resolved;
}

export function addDaysToCalendarDate(date: CalendarDateParts, daysToAdd: number): CalendarDateParts {
  const shiftedDate = new Date(Date.UTC(date.year, date.month - 1, date.day + daysToAdd));

  return {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth() + 1,
    day: shiftedDate.getUTCDate(),
  };
}

function compareAvailabilityWindows(left: WeeklyAvailability, right: WeeklyAvailability): number {
  return (
    left.dayOfWeek - right.dayOfWeek ||
    left.startMinutes - right.startMinutes ||
    left.endMinutes - right.endMinutes
  );
}

function getZonedDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cacheKey = timeZone;
  const cachedFormatter = zonedDateFormatterCache.get(cacheKey);

  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  zonedDateFormatterCache.set(cacheKey, formatter);
  return formatter;
}
