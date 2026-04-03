export function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function formatDateTimeInTimeZone(value, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "UTC",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatTimeInTimeZone(value, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatDatePrettyInTimeZone(value, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "UTC",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

// Step 7 and Step 8 (Laws 4, 5, 7): shared date helpers keep admin/client formatting and light validation centralized.
export function isValidCalendarDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function isPastDateInTimeZone(value, timeZone) {
  if (!isValidCalendarDateInput(value)) {
    return false;
  }

  return value < getCurrentDateInTimeZone(timeZone);
}

export function formatCalendarDateLabel(value) {
  if (!value) {
    return "Not selected";
  }

  if (!isValidCalendarDateInput(value)) {
    return "Date not recognized";
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

export function getZonedDateParts(value, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date(value));
  return {
    year: parts.find((part) => part.type === "year")?.value ?? "0000",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
    hour: parts.find((part) => part.type === "hour")?.value ?? "00",
    minute: parts.find((part) => part.type === "minute")?.value ?? "00",
  };
}

export function getCurrentDateInTimeZone(timeZone) {
  const parts = getZonedDateParts(new Date(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDateTimeInputInTimeZone(value, timeZone) {
  const parts = getZonedDateParts(new Date(value), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function buildIsoFromBusinessDateTime(value, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Blocked time must use a valid date and time.");
  }

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  const targetYear = Number(yearValue);
  const targetMonth = Number(monthValue);
  const targetDay = Number(dayValue);
  const targetHour = Number(hourValue);
  const targetMinute = Number(minuteValue);
  const targetTotal = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute);

  let candidate = new Date(targetTotal);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = getZonedDateParts(candidate, timeZone);
    const observedTotal = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    );
    const differenceMinutes = (targetTotal - observedTotal) / 60000;

    if (differenceMinutes === 0) {
      return candidate.toISOString();
    }

    candidate = new Date(candidate.getTime() + differenceMinutes * 60000);
  }

  throw new Error(`Could not resolve that blocked time in ${timeZone}.`);
}
