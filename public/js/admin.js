import {
  getBusiness,
  getServices,
  createService as createServiceRequest,
  getAvailability,
  saveAvailability as saveAvailabilityRequest,
  createBlockedTime as createBlockedTimeRequest,
  getBlockedTimes,
  updateBlockedTime as updateBlockedTimeRequest,
  deleteBlockedTime as deleteBlockedTimeRequest,
  getBookings,
  cancelBooking as cancelBookingRequest,
  logoutBusiness,
} from "/js/api.js";

const days = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const businessId = getBusinessIdFromUrl();

if (!businessId) {
  document.body.innerHTML = `
    <main style="font-family: Arial, Helvetica, sans-serif; padding: 24px;">
      <h1>Business not found</h1>
      <p>Business id is missing from the admin URL.</p>
    </main>
  `;
  throw new Error("Business id is missing from admin URL.");
}

initialize().catch((error) => {
  console.error("Failed to initialize admin page:", error);
  showMessage("booking-message", error.message || "Failed to load admin page.", "error");
});

async function initialize() {
  renderAvailabilityRows();
  bindEvents();

  await loadBusiness();
  await loadServices();
  await loadAvailability();
  await loadBookings();
}

function bindEvents() {
  document.getElementById("create-service-button").addEventListener("click", createService);
  document.getElementById("create-block-button").addEventListener("click", createBlockedTime);
  document.getElementById("save-availability-button").addEventListener("click", saveAvailability);
  document.getElementById("sign-out-button").addEventListener("click", signOut);
}

function getBusinessIdFromUrl() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[1] || "";
}

async function loadBusiness() {
  const business = await getBusiness(businessId);
  document.getElementById("business-name").textContent = `${business.name} Admin`;
}

async function loadServices() {
  const services = await getServices(businessId);
  const body = document.getElementById("services-table-body");
  body.innerHTML = "";

  services.forEach((service) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(service.name)}</td>
      <td>${service.durationMinutes} mins</td>
      <td>${service.bufferMinutes ?? 0} mins</td>
      <td>£${service.price}</td>
      <td><span class="pill">${service.active ? "Active" : "Inactive"}</span></td>
    `;
    body.appendChild(row);
  });
}

async function loadAvailability() {
  const windows = await getAvailability(businessId);

  windows.forEach((window) => {
    const row = document.querySelector(`[data-day='${window.dayOfWeek}']`);
    if (!row) return;

    row.querySelector(".availability-active").checked = Boolean(window.active);
    row.querySelector(".availability-start").value = minutesToTime(window.startMinutes);
    row.querySelector(".availability-end").value = minutesToTime(window.endMinutes);
  });
}

async function loadBookings() {
  const bookings = await getBookings(businessId);
  const body = document.getElementById("bookings-table-body");
  body.innerHTML = "";

  bookings.forEach((booking) => {
    const row = document.createElement("tr");
    const serviceNames = Array.isArray(booking.services)
      ? booking.services.map((service) => service.name).join(", ")
      : (booking.serviceIds || []).join(", ");

    row.innerHTML = `
      <td>
        <strong>${escapeHtml(booking.customer.name)}</strong><br />
        <span class="muted">${escapeHtml(booking.customer.phone)}</span>
      </td>
      <td>${escapeHtml(serviceNames)}</td>
      <td>${formatDateTime(booking.start)} - ${formatTime(booking.end)}</td>
      <td><span class="pill">${escapeHtml(booking.status)}</span></td>
      <td>
        ${
          booking.status === "confirmed"
            ? `<button class="secondary" data-booking-id="${booking.id}">Cancel</button>`
            : "—"
        }
      </td>
    `;
    body.appendChild(row);
  });

  body.querySelectorAll("button[data-booking-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await cancelBooking(button.dataset.bookingId);
    });
  });
}

function renderAvailabilityRows() {
  const container = document.getElementById("availability-rows");
  container.innerHTML = "";

  days.forEach((day) => {
    const row = document.createElement("div");
    row.className = "grid two-col";
    row.dataset.day = String(day.value);
    row.innerHTML = `
      <div class="inline-row" style="align-items: center;">
        <input class="availability-active" type="checkbox" style="width:auto;" />
        <strong>${day.label}</strong>
      </div>
      <div class="inline-row">
        <input class="availability-start" type="time" value="09:00" />
        <input class="availability-end" type="time" value="17:00" />
      </div>
    `;
    container.appendChild(row);
  });
}

async function createService() {
  clearMessage("service-message");

  const payload = {
    name: document.getElementById("service-name").value.trim(),
    durationMinutes: Number(document.getElementById("service-duration").value),
    price: Number(document.getElementById("service-price").value),
    bufferMinutes: Number(document.getElementById("service-buffer").value || 0),
  };

  try {
    const result = await createServiceRequest(businessId, payload);

    showMessage("service-message", `Service '${result.name}' created.`, "success");
    document.getElementById("service-name").value = "";
    document.getElementById("service-duration").value = "";
    document.getElementById("service-price").value = "";
    document.getElementById("service-buffer").value = "";

    await loadServices();
  } catch (error) {
    showMessage("service-message", error.message || "Failed to create service.", "error");
  }
}

async function saveAvailability() {
  clearMessage("availability-message");

  const availability = Array.from(document.querySelectorAll("[data-day]")).map((row) => ({
    dayOfWeek: Number(row.dataset.day),
    active: row.querySelector(".availability-active").checked,
    startMinutes: timeToMinutes(row.querySelector(".availability-start").value),
    endMinutes: timeToMinutes(row.querySelector(".availability-end").value),
  }));

  try {
    await saveAvailabilityRequest(businessId, availability);
    showMessage("availability-message", "Weekly availability saved.", "success");
  } catch (error) {
    showMessage("availability-message", error.message || "Failed to save availability.", "error");
  }
}

async function createBlockedTime() {
  clearMessage("block-message");

  const payload = {
    start: document.getElementById("block-start").value,
    end: document.getElementById("block-end").value,
    reason: document.getElementById("block-reason").value.trim(),
  };

  try {
    await createBlockedTimeRequest(businessId, payload);

    showMessage("block-message", "Blocked time created.", "success");
    document.getElementById("block-start").value = "";
    document.getElementById("block-end").value = "";
    document.getElementById("block-reason").value = "";
  } catch (error) {
    showMessage("block-message", error.message || "Failed to create blocked time.", "error");
  }
}

async function cancelBooking(bookingId) {
  clearMessage("booking-message");

  try {
    await cancelBookingRequest(businessId, bookingId);
    showMessage("booking-message", "Booking cancelled.", "success");
    await loadBookings();
  } catch (error) {
    showMessage("booking-message", error.message || "Failed to cancel booking.", "error");
  }
}

async function signOut() {
  try {
    await logoutBusiness();
  } finally {
    window.location.href = "/login";
  }
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  const hours = String(Math.floor(value / 60)).padStart(2, "0");
  const minutes = String(value % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showMessage(id, text, type) {
  const element = document.getElementById(id);
  element.textContent = text;
  element.className = `message ${type}`;
}

function clearMessage(id) {
  const element = document.getElementById(id);
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
