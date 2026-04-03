const state = {
  business: null,
  slug: "",
  services: [],
  selectedServiceIds: [],
  selectedDate: "",
  selectedSlot: null,
};

const businessNameEl = document.getElementById("business-name");
const businessSubtitleEl = document.getElementById("business-subtitle");
const servicesEl = document.getElementById("services");
const dateEl = document.getElementById("booking-date");
const summaryEl = document.getElementById("selection-summary");
const slotsEl = document.getElementById("slots");
const slotMessageEl = document.getElementById("slot-message");
const bookingMessageEl = document.getElementById("booking-message");
const confirmButtonEl = document.getElementById("confirm-booking");

initialize().catch((error) => {
  console.error("Failed to initialize booking page:", error);
  showMessage(
    bookingMessageEl,
    error.message || "Failed to load booking page.",
    "error"
  );
  confirmButtonEl.disabled = true;
});

async function initialize() {
  state.slug = getBookingSlugFromUrl();

  if (!state.slug) {
    throw new Error("Booking page slug is missing from the URL.");
  }

  const today = new Date();
  dateEl.min = formatDateInput(today);
  dateEl.value = formatDateInput(today);
  state.selectedDate = dateEl.value;

  await loadBusinessContext();
  await loadServices();
  renderSummary();

  dateEl.addEventListener("change", async () => {
    state.selectedDate = dateEl.value;
    state.selectedSlot = null;
    renderSummary();
    await loadSlots();
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
  // Requires backend support:
  // GET /api/booking-page/:slug
  // Expected response:
  // { id, name, timezone, bookingPageSlug }
  const business = await requestJson(`/api/booking-page/${encodeURIComponent(state.slug)}`);

  state.business = business;

  businessNameEl.textContent = business.name;
  businessSubtitleEl.textContent = `Book with ${business.name}. Select your service, date, and time.`;
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
      renderSummary();
      await loadSlots();
    });

    const content = document.createElement("div");

    const name = document.createElement("div");
    name.className = "service-name";
    name.textContent = service.name;

    const meta = document.createElement("div");
    meta.className = "service-meta";
    meta.textContent = `${service.durationMinutes} mins • £${service.price}`;

    content.appendChild(name);
    content.appendChild(meta);

    wrapper.appendChild(input);
    wrapper.appendChild(content);
    servicesEl.appendChild(wrapper);
  });
}

function renderSummary() {
  const selectedServices = state.services.filter((service) =>
    state.selectedServiceIds.includes(service.id)
  );

  if (selectedServices.length === 0) {
    summaryEl.classList.add("hidden");
    summaryEl.innerHTML = "";
    return;
  }

  const totalMinutes = selectedServices.reduce((sum, service) => {
    return sum + service.durationMinutes + (service.bufferMinutes ?? 0);
  }, 0);

  summaryEl.classList.remove("hidden");
  summaryEl.innerHTML = `
    <div><strong>Selected:</strong> ${selectedServices.map((service) => escapeHtml(service.name)).join(", ")}</div>
    <div><strong>Total time:</strong> ${totalMinutes} minutes</div>
    <div><strong>Date:</strong> ${escapeHtml(state.selectedDate || "Not selected")}</div>
  `;
}

async function loadSlots() {
  slotsEl.innerHTML = "";
  clearMessage(slotMessageEl);

  if (!state.selectedDate) {
    showMessage(slotMessageEl, "Please choose a date first.", "error");
    return;
  }

  if (state.selectedServiceIds.length === 0) {
    showMessage(slotMessageEl, "Choose at least one service to view available times.", "error");
    return;
  }

  const params = new URLSearchParams({
    date: state.selectedDate,
    serviceIds: state.selectedServiceIds.join(","),
  });

  const slots = await requestJson(
    `/api/booking-page/${encodeURIComponent(state.slug)}/slots?${params.toString()}`
  );

  if (!Array.isArray(slots) || slots.length === 0) {
    showMessage(slotMessageEl, "No available times for this selection.", "error");
    return;
  }

  slots.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-button";
    button.textContent = formatTime(slot.start);

    button.addEventListener("click", () => {
      state.selectedSlot = slot.start;
      document.querySelectorAll(".slot-button").forEach((item) => {
        item.classList.remove("selected");
      });
      button.classList.add("selected");
    });

    slotsEl.appendChild(button);
  });
}

async function submitBooking() {
  clearMessage(bookingMessageEl);

  if (state.selectedServiceIds.length === 0) {
    showMessage(bookingMessageEl, "Please choose at least one service.", "error");
    return;
  }

  if (!state.selectedDate) {
    showMessage(bookingMessageEl, "Please choose a date.", "error");
    return;
  }

  if (!state.selectedSlot) {
    showMessage(bookingMessageEl, "Please choose an available time.", "error");
    return;
  }

  const customer = {
    name: document.getElementById("customer-name").value.trim(),
    phone: document.getElementById("customer-phone").value.trim(),
    email: document.getElementById("customer-email").value.trim(),
    notes: document.getElementById("customer-notes").value.trim(),
  };

  if (!customer.name || !customer.phone) {
    showMessage(bookingMessageEl, "Name and phone number are required.", "error");
    return;
  }

  confirmButtonEl.disabled = true;
  confirmButtonEl.textContent = "Booking...";

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

    showMessage(
      bookingMessageEl,
      `Booking confirmed for ${customer.name} at ${formatTime(result.start)} on ${formatDatePretty(result.start)}.`,
      "success"
    );

    state.selectedSlot = null;
    document.querySelectorAll(".slot-button").forEach((item) => {
      item.classList.remove("selected");
    });

    await loadSlots();
  } catch (error) {
    showMessage(bookingMessageEl, error.message || "Booking failed.", "error");
  } finally {
    confirmButtonEl.disabled = false;
    confirmButtonEl.textContent = "Confirm booking";
  }
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDatePretty(value) {
  return new Date(value).toLocaleDateString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function showMessage(element, text, type) {
  element.textContent = text;
  element.className = `message ${type}`;
}

function clearMessage(element) {
  element.textContent = "";
  element.className = "message";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
