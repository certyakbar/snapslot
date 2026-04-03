export const BRAND_NAME = "SnapSlot";

export const UI_COPY = {
  signup: {
    creating: "Creating SnapSlot account...",
    submit: "Create SnapSlot account",
    success: "Your SnapSlot account is ready. Taking you to the dashboard...",
    genericError: "We couldn't create your SnapSlot account.",
  },
  login: {
    signingIn: "Signing in...",
    submit: "Sign in",
    success: "Signed in. Taking you to the dashboard...",
    genericError: "We couldn't sign you in.",
    emailRequired: "Business email is required.",
    passwordRequired: "Password is required.",
  },
  booking: {
    pageLoadFailed: "Failed to load booking page.",
    chooseDateFirst: "Please choose a date first.",
    invalidDate: "Date format not recognized.",
    futureDate: "Please pick a future date.",
    selectService: "Select at least one service.",
    selectServiceToView: "Select at least one service to view available times.",
    slotsLoading: "Checking available times...",
    slotsLoadFailed: "Failed to load available times.",
    noDateSelected: "Please choose a date.",
    noTimeSelected: "Please choose an available time.",
    noServiceSelected: "Please choose at least one service.",
    requiredContact: "Name, phone number, and email address are required.",
    validEmail: "Please enter a valid email address.",
    bookingPending: "Confirming booking...",
    bookingFailed: "Booking failed.",
    noAvailableTimes(timeZone) {
      return `No available times match this selection in ${timeZone}.`;
    },
    bookingConfirmed(customerName, prettyDate, prettyTime, timeZone) {
      return `Booking confirmed for ${customerName} on ${prettyDate} at ${prettyTime} (${timeZone}).`;
    },
  },
  admin: {
    pageLoadFailed: "Failed to load admin page.",
    servicesSummaryLoading: "Loading service summary...",
    servicesSummaryUnavailable: "Service summary unavailable.",
    servicesSummaryEmpty: "No services configured yet.",
    blockedTimesLoading: "Loading blocked times...",
    blockedTimesLoadFailed: "Failed to load blocked times.",
    blockedTimesUnavailable: "Blocked times are unavailable right now.",
    blockedTimeOverlap: "This block overlaps an existing time.",
    cancelPending: "Cancelling...",
    bookingCancelled: "Booking cancelled.",
    bookingCancelledRefreshError: "Booking cancelled, but the list could not be refreshed.",
  },
};

export function setStatusMessage(element, text, type) {
  if (!element) {
    return;
  }

  element.textContent = text;
  element.className = `message ${type}`;

  if (type === "error") {
    element.setAttribute("role", "alert");
    element.setAttribute("aria-live", "assertive");
    return;
  }

  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
}

export function clearStatusMessage(element) {
  if (!element) {
    return;
  }

  element.textContent = "";
  element.className = "message";
  element.removeAttribute("role");
  element.setAttribute("aria-live", "polite");
}
