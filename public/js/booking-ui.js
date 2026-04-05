import {
  formatCurrency,
  formatCalendarDateLabel,
  formatDatePrettyInTimeZone,
  formatTimeInTimeZone,
  getCurrentDateInTimeZone,
  isPastDateInTimeZone,
  isValidCalendarDateInput,
} from "/js/timezone.js";
import { UI_COPY, clearStatusMessage, setStatusMessage } from "/js/ui-copy.js";

const state = {
  business: null,
  slug: "",
  services: [],
  selectedServiceIds: [],
  selectedDate: "",
  selectedSlot: null,
  slotsRequestId: 0,
};

const businessNameEl = document.getElementById("business-name");
const businessSubtitleEl = document.getElementById("business-subtitle");
const businessTimezoneEl = document.getElementById("business-timezone");
const servicesEl = document.getElementById("services");
const serviceHintEl = document.getElementById("service-hint");
const dateEl = document.getElementById("booking-date");
const dateHintEl = document.getElementById("date-hint");
const summaryEl = document.getElementById("selection-summary");
const reviewSummaryEl = document.getElementById("review-summary");
const slotsEl = document.getElementById("slots");
const slotMessageEl = document.getElementById("slot-message");
const bookingMessageEl = document.getElementById("booking-message");
const confirmButtonEl = document.getElementById("confirm-booking");
const customerNameEl = document.getElementById("customer-name");
const customerPhoneEl = document.getElementById("customer-phone");
const customerEmailEl = document.getElementById("customer-email");
const customerNotesEl = document.getElementById("customer-notes");

initialize().catch((error) => {
  console.error("Failed to initialize booking page:", error);
  showMessage(bookingMessageEl, error.message || UI_COPY.booking.pageLoadFailed, "error");
  confirmButtonEl.disabled = true;
});

async function initialize() {
  state.slug = getBookingSlugFromUrl();

  if (!state.slug) {
    throw new Error("Booking page slug is missing from the URL.");
  }

  await loadBusinessContext();

  const today = getCurrentDateInTimeZone(state.business.timezone);
  dateEl.min = today;
  dateEl.value = today;
  state.selectedDate = today;

  await loadServices();
  renderSummary();
  renderReviewSummary();

  dateEl.addEventListener("change", async () => {
    state.selectedDate = dateEl.value;
    state.selectedSlot = null;
    syncDateHint();
    renderSummary();
    renderReviewSummary();
    await loadSlots();
  });

  dateEl.addEventListener("input", () => {
    state.selectedDate = dateEl.value;
    state.selectedSlot = null;
    syncDateHint();
    renderSummary();
    renderReviewSummary();
  });

  [customerNameEl, customerPhoneEl, customerEmailEl, customerNotesEl].forEach((element) => {
    element.addEventListener("input", renderReviewSummary);
  });

  confirmButtonEl.addEventListener("click", submitBooking);
}

function getBookingSlugFromUrl() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "booking") return "";
  return parts[1] || "";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
  }

  return payload;
}

async function loadBusinessContext() {
  const business = await requestJson(`/api/booking-page/${encodeURIComponent(state.slug)}`);

  state.business = business;
  document.title = `SnapSlot Booking | ${business.name}`;
  businessNameEl.textContent = business.name;
  businessSubtitleEl.textContent = `Book with ${business.name}. Times below are shown in ${business.timezone}.`;
  businessTimezoneEl.textContent = business.timezone;
}

async function loadServices() {
  const services = await requestJson(`/api/booking-page/${encodeURIComponent(state.slug)}/services`);
  state.services = services.filter((service) => service.active);
  renderServices();
}

function renderServices() {
  servicesEl.innerHTML = "";

  if (state.services.length === 0) {
    servicesEl.innerHTML = `<p class="small-text">No services are available right now.</p>`;
    return;
  }

  state.services.forEach((service) => {
    const wrapper = document.createElement("label");
    wrapper.className = "service-card";
    wrapper.dataset.serviceId = service.id;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = service.id;
    input.checked = state.selectedServiceIds.includes(service.id);
    input.setAttribute("aria-describedby", "service-hint");

    input.addEventListener("change", async (event) => {
      const checked = event.target.checked;

      if (checked) {
        if (!state.selectedServiceIds.includes(service.id)) {
          state.selectedServiceIds.push(service.id);
        }
      } else {
        state.selectedServiceIds = state.selectedServiceIds.filter((id) => id !== service.id);
      }

      wrapper.classList.toggle("selected", checked);
      state.selectedSlot = null;
      syncServiceHint();
      renderSummary();
      renderReviewSummary();
      await loadSlots();
    });

    const content = document.createElement("div");

    const name = document.createElement("div");
    name.className = "service-name";
    name.textContent = service.name;

    const meta = document.createElement("div");
    meta.className = "service-meta";
    meta.textContent = `${service.durationMinutes} mins | ${formatCurrency(service.price)} | Buffer ${service.bufferMinutes ?? 0} mins`;

    content.appendChild(name);
    content.appendChild(meta);

    if (typeof service.description === "string" && service.description.trim()) {
      const description = document.createElement("div");
      description.className = "service-description";
      description.textContent = service.description.trim();
      content.appendChild(description);
    }

    wrapper.appendChild(input);
    wrapper.appendChild(content);
    wrapper.classList.toggle("selected", input.checked);
    servicesEl.appendChild(wrapper);
  });
}

function renderSummary() {
  const selectedServices = getSelectedServices();

  if (selectedServices.length === 0) {
    summaryEl.classList.add("hidden");
    summaryEl.innerHTML = "";
    return;
  }

  const totalMinutes = selectedServices.reduce((sum, service) => {
    return sum + service.durationMinutes + (service.bufferMinutes ?? 0);
  }, 0);
  const totalPrice = selectedServices.reduce((sum, service) => sum + Number(service.price || 0), 0);

  summaryEl.classList.remove("hidden");
  summaryEl.innerHTML = `
    <div><strong>Selected services:</strong> ${selectedServices.map((service) => escapeHtml(service.name)).join(", ")}</div>
    <div><strong>Total appointment time:</strong> ${totalMinutes} minutes</div>
    <div><strong>Total price:</strong> ${formatCurrency(totalPrice)}</div>
    <div><strong>Date:</strong> ${escapeHtml(formatCalendarDateLabel(state.selectedDate))}</div>
    <div><strong>Timezone:</strong> ${escapeHtml(state.business?.timezone || "")}</div>
  `;
}

function renderReviewSummary() {
  const selectedServices = getSelectedServices();
  const serviceText =
    selectedServices.length > 0
      ? selectedServices.map((service) => escapeHtml(service.name)).join(", ")
      : "Choose at least one service";
  const timeText = state.selectedSlot
    ? `${escapeHtml(formatCalendarDateLabel(state.selectedDate))} at ${escapeHtml(formatTime(state.selectedSlot))}`
    : "Choose an available time";
  const contactLines = [
    customerNameEl.value.trim() || "Add your full name",
    customerPhoneEl.value.trim() || "Add your phone number",
    customerEmailEl.value.trim() || "Add your email address",
    customerNotesEl.value.trim() || "No notes added",
  ];

  reviewSummaryEl.innerHTML = `
    <div class="review-card">
      <strong>Services</strong>
      <span>${serviceText}</span>
    </div>
    <div class="review-card">
      <strong>Appointment time</strong>
      <span>${timeText}</span>
      <span>${escapeHtml(state.business?.timezone || "")}</span>
    </div>
    <div class="review-card">
      <strong>Your details</strong>
      ${contactLines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
    </div>
  `;
}

async function loadSlots() {
  if (!state.selectedDate) {
    clearSlotSurface();
    setInlineHint(dateHintEl, UI_COPY.booking.chooseDateFirst, "info");
    showMessage(slotMessageEl, UI_COPY.booking.chooseDateFirst, "info");
    return;
  }

  if (!isValidCalendarDateInput(state.selectedDate)) {
    clearSlotSurface();
    setInlineHint(dateHintEl, UI_COPY.booking.invalidDate, "error");
    showMessage(slotMessageEl, UI_COPY.booking.invalidDate, "error");
    return;
  }

  if (isPastDateInTimeZone(state.selectedDate, state.business?.timezone || "UTC")) {
    clearSlotSurface();
    setInlineHint(dateHintEl, UI_COPY.booking.futureDate, "error");
    showMessage(slotMessageEl, UI_COPY.booking.futureDate, "error");
    return;
  }

  if (state.selectedServiceIds.length === 0) {
    clearSlotSurface();
    setInlineHint(serviceHintEl, UI_COPY.booking.selectService, "info");
    showMessage(slotMessageEl, UI_COPY.booking.selectServiceToView, "info");
    return;
  }

  syncDateHint();
  syncServiceHint();

  const requestId = ++state.slotsRequestId;
  // Step 8 (Laws 1, 2, 6, 7): skeleton slots and a dimmed surface make the in-flight state visible without implying real availability.
  renderSlotSkeletons();
  setSlotsLoading(true);
  const params = new URLSearchParams({
    date: state.selectedDate,
    serviceIds: state.selectedServiceIds.join(","),
  });

  let slots;
  try {
    showMessage(slotMessageEl, UI_COPY.booking.slotsLoading, "info");
    slots = await requestJson(`/api/booking-page/${encodeURIComponent(state.slug)}/slots?${params.toString()}`);
  } catch (error) {
    if (requestId !== state.slotsRequestId) {
      return;
    }
    setSlotsLoading(false);
    clearSlotSurface();
    showMessage(slotMessageEl, error.message || UI_COPY.booking.slotsLoadFailed, "error");
    return;
  }

  if (requestId !== state.slotsRequestId) {
    return;
  }

  setSlotsLoading(false);
  slotsEl.innerHTML = "";
  clearMessage(slotMessageEl);

  if (!Array.isArray(slots) || slots.length === 0) {
    showMessage(slotMessageEl, UI_COPY.booking.noAvailableTimes(state.business.timezone), "info");
    return;
  }

  slots.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-button";
    button.textContent = formatTime(slot.start);
    button.setAttribute("aria-pressed", String(state.selectedSlot === slot.start));
    button.classList.toggle("selected", state.selectedSlot === slot.start);

    button.addEventListener("click", () => {
      state.selectedSlot = slot.start;
      clearSelectedSlotButtons();
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
      renderReviewSummary();
    });

    slotsEl.appendChild(button);
  });
}

async function submitBooking() {
  clearMessage(bookingMessageEl);
  syncServiceHint();
  syncDateHint();

  if (state.selectedServiceIds.length === 0) {
    setInlineHint(serviceHintEl, UI_COPY.booking.selectService, "error");
    showMessage(bookingMessageEl, UI_COPY.booking.noServiceSelected, "error");
    return;
  }

  if (!state.selectedDate) {
    setInlineHint(dateHintEl, UI_COPY.booking.chooseDateFirst, "error");
    showMessage(bookingMessageEl, UI_COPY.booking.noDateSelected, "error");
    return;
  }

  if (!isValidCalendarDateInput(state.selectedDate)) {
    setInlineHint(dateHintEl, UI_COPY.booking.invalidDate, "error");
    showMessage(bookingMessageEl, UI_COPY.booking.invalidDate, "error");
    return;
  }

  if (isPastDateInTimeZone(state.selectedDate, state.business?.timezone || "UTC")) {
    setInlineHint(dateHintEl, UI_COPY.booking.futureDate, "error");
    showMessage(bookingMessageEl, UI_COPY.booking.futureDate, "error");
    return;
  }

  if (!state.selectedSlot) {
    showMessage(bookingMessageEl, UI_COPY.booking.noTimeSelected, "error");
    return;
  }

  const customer = {
    name: customerNameEl.value.trim(),
    phone: customerPhoneEl.value.trim(),
    email: customerEmailEl.value.trim(),
    notes: customerNotesEl.value.trim(),
  };

  if (!customer.name || !customer.phone || !customer.email) {
    showMessage(bookingMessageEl, UI_COPY.booking.requiredContact, "error");
    return;
  }

  if (!isValidEmail(customer.email)) {
    showMessage(bookingMessageEl, UI_COPY.booking.validEmail, "error");
    return;
  }

  confirmButtonEl.disabled = true;
  confirmButtonEl.textContent = UI_COPY.booking.bookingPending;

  try {
    const result = await requestJson(`/api/booking-page/${encodeURIComponent(state.slug)}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestedStart: state.selectedSlot,
        serviceIds: state.selectedServiceIds,
        customer,
      }),
    });

    if (result.paymentStatus === "pending") {
      showMessage(
        bookingMessageEl,
        `${result.paymentLabel || "Deposit"} required - your booking is reserved pending payment.`,
        "success"
      );
    } else {
      showMessage(
        bookingMessageEl,
        UI_COPY.booking.bookingConfirmed(
          customer.name,
          formatDatePretty(result.start),
          formatTime(result.start),
          state.business.timezone
        ),
        "success"
      );
    }

    state.selectedSlot = null;
    clearSelectedSlotButtons();
    renderReviewSummary();

    await loadSlots();
  } catch (error) {
    showMessage(bookingMessageEl, error.message || UI_COPY.booking.bookingFailed, "error");
  } finally {
    confirmButtonEl.disabled = false;
    confirmButtonEl.textContent = "Confirm booking";
  }
}

function getSelectedServices() {
  return state.services.filter((service) => state.selectedServiceIds.includes(service.id));
}

function formatTime(value) {
  return formatTimeInTimeZone(value, state.business?.timezone || "UTC");
}

function formatDatePretty(value) {
  return formatDatePrettyInTimeZone(value, state.business?.timezone || "UTC");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function renderSlotSkeletons(count = 6) {
  slotsEl.innerHTML = "";
  for (let index = 0; index < count; index += 1) {
    const skeleton = document.createElement("div");
    skeleton.className = "slot-skeleton";
    skeleton.setAttribute("aria-hidden", "true");
    slotsEl.appendChild(skeleton);
  }
}

function setSlotsLoading(isLoading) {
  slotsEl.classList.toggle("is-loading", isLoading);
  slotsEl.setAttribute("aria-busy", String(isLoading));
}

function clearSlotSurface() {
  slotsEl.innerHTML = "";
  setSlotsLoading(false);
}

function clearSelectedSlotButtons() {
  document.querySelectorAll(".slot-button").forEach((item) => {
    item.classList.remove("selected");
    item.setAttribute("aria-pressed", "false");
  });
}

function syncServiceHint() {
  if (state.selectedServiceIds.length === 0) {
    clearInlineHint(serviceHintEl);
    return;
  }

  clearInlineHint(serviceHintEl);
}

function syncDateHint() {
  if (!state.selectedDate) {
    clearInlineHint(dateHintEl);
    return;
  }

  if (!isValidCalendarDateInput(state.selectedDate)) {
    setInlineHint(dateHintEl, UI_COPY.booking.invalidDate, "error");
    return;
  }

  if (isPastDateInTimeZone(state.selectedDate, state.business?.timezone || "UTC")) {
    setInlineHint(dateHintEl, UI_COPY.booking.futureDate, "error");
    return;
  }

  clearInlineHint(dateHintEl);
}

function setInlineHint(element, text, type = "info") {
  element.textContent = text;
  element.className = `field-hint ${type} visible`;
}

function clearInlineHint(element) {
  element.textContent = "";
  element.className = "field-hint";
}

function showMessage(element, text, type) {
  setStatusMessage(element, text, type);
}

function clearMessage(element) {
  clearStatusMessage(element);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
