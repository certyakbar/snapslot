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
import {
  buildIsoFromBusinessDateTime,
  formatCurrency,
  formatDateTimeInTimeZone,
  formatDateTimeInputInTimeZone,
  formatTimeInTimeZone,
  getCurrentDateInTimeZone,
} from "/js/timezone.js";
import { UI_COPY, clearStatusMessage, setStatusMessage } from "/js/ui-copy.js";

const days = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const state = {
  business: null,
  editingBlockedTimeId: "",
  blockedTimes: [],
  blockedTimesLoading: false,
  blockedTimesRequestId: 0,
};

const businessId = getBusinessIdFromUrl();

if (!businessId) {
  document.body.innerHTML = `
    <main style="font-family: Georgia, 'Times New Roman', serif; padding: 24px;">
      <h1>Business not found</h1>
      <p>Business id is missing from the admin URL.</p>
    </main>
  `;
  throw new Error("Business id is missing from admin URL.");
}

initialize().catch((error) => {
  console.error("Failed to initialize admin page:", error);
  showMessage("booking-message", error.message || UI_COPY.admin.pageLoadFailed, "error");
});

async function initialize() {
  renderAvailabilityRows();
  bindEvents();

  await loadBusiness();
  setDefaultBlockedTimesDate();
  await Promise.all([loadServices(), loadAvailability(), loadBlockedTimes(), loadBookings()]);
}

function bindEvents() {
  document.getElementById("create-service-button").addEventListener("click", createService);
  document.getElementById("save-block-button").addEventListener("click", saveBlockedTime);
  document.getElementById("cancel-block-edit-button").addEventListener("click", resetBlockedTimeForm);
  document.getElementById("save-availability-button").addEventListener("click", saveAvailability);
  document.getElementById("sign-out-button").addEventListener("click", signOut);
  document.getElementById("blocked-times-date").addEventListener("change", loadBlockedTimes);
  document.getElementById("block-start").addEventListener("input", syncBlockedTimeOverlapHint);
  document.getElementById("block-end").addEventListener("input", syncBlockedTimeOverlapHint);
}

function getBusinessIdFromUrl() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[1] || "";
}

async function loadBusiness() {
  const business = await getBusiness(businessId);
  state.business = business;
  document.title = `SnapSlot Admin | ${business.name}`;

  const bookingUrl = `${window.location.origin}/booking/${business.bookingPageSlug}`;
  document.getElementById("business-name").textContent = `${business.name} dashboard`;
  document.getElementById("business-summary").textContent =
    "Review bookings, set weekly availability, and manage blocked time with business-safe controls.";
  document.getElementById("business-timezone").textContent = business.timezone;
  document.getElementById("availability-timezone-pill").textContent = `Timezone: ${business.timezone}`;
  document.getElementById("booking-page-link").textContent = bookingUrl;
}

async function loadServices() {
  const body = document.getElementById("services-table-body");
  body.innerHTML = "";
  setServicesSummaryLoading(true);

  try {
    const services = await getServices(businessId);
    renderServicesSummary(services, { hasError: false });

    if (services.length === 0) {
      body.innerHTML = `
        <tr>
          <td colspan="5" class="muted">No services have been added yet.</td>
        </tr>
      `;
      return;
    }

    services.forEach((service) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(service.name)}</td>
        <td>${service.durationMinutes} mins</td>
        <td>${service.bufferMinutes ?? 0} mins</td>
        <td>${formatCurrency(service.price)}</td>
        <td><span class="pill">${service.active ? "Active" : "Inactive"}</span></td>
      `;
      body.appendChild(row);
    });
  } catch (error) {
    renderServicesSummary([], { hasError: true });
    body.innerHTML = `
      <tr>
        <td colspan="5" class="muted">Service details are unavailable right now.</td>
      </tr>
    `;
  }
}

async function loadAvailability() {
  const windows = await getAvailability(businessId);
  clearAvailabilityRows();

  windows
    .filter((window) => window.active)
    .forEach((window) => {
      addAvailabilityWindow(window.dayOfWeek, window);
    });

  days.forEach((day) => updateAvailabilityEmptyState(day.value));
}

async function loadBlockedTimes() {
  // Step 7 and Step 8 (Laws 1, 2, 5, 7): stale-response guards and loading surfaces keep blocked-time review aligned with the latest selected date.
  const requestId = ++state.blockedTimesRequestId;
  const date = document.getElementById("blocked-times-date").value;
  if (!date) {
    if (requestId === state.blockedTimesRequestId) {
      state.blockedTimes = [];
      clearMessage("blocked-times-status");
      setBlockedTimesLoading(false);
      renderBlockedTimes([]);
      syncBlockedTimeOverlapHint();
    }
    return;
  }

  setBlockedTimesLoading(true);
  renderBlockedTimesLoading();
  showMessage("blocked-times-status", UI_COPY.admin.blockedTimesLoading, "info");

  try {
    const blockedTimes = await getBlockedTimes(businessId, date);
    if (requestId !== state.blockedTimesRequestId) {
      return;
    }
    clearMessage("blocked-times-status");
    setBlockedTimesLoading(false);
    renderBlockedTimes(blockedTimes);
  } catch (error) {
    if (requestId !== state.blockedTimesRequestId) {
      return;
    }
    state.blockedTimes = [];
    setBlockedTimesLoading(false);
    renderBlockedTimesError();
    syncBlockedTimeOverlapHint();
    showMessage("blocked-times-status", error.message || UI_COPY.admin.blockedTimesLoadFailed, "error");
  }
}

async function loadBookings() {
  const bookings = await getBookings(businessId);
  const body = document.getElementById("bookings-table-body");
  body.innerHTML = "";

  if (bookings.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="muted">No bookings have been created yet.</td>
      </tr>
    `;
    return;
  }

  bookings.forEach((booking) => {
    const row = document.createElement("tr");
    const serviceNames = Array.isArray(booking.services)
      ? booking.services.map((service) => service.name).join(", ")
      : (booking.serviceIds || []).join(", ");
    const customerEmail = booking.customer.email ? escapeHtml(booking.customer.email) : "No email provided";
    const customerNotes = booking.customer.notes ? escapeHtml(booking.customer.notes) : "No notes";

    row.innerHTML = `
      <td><strong>${escapeHtml(booking.customer.name)}</strong></td>
      <td>
        <div class="detail-list">
          <span>${escapeHtml(booking.customer.phone)}</span>
          <span>${customerEmail}</span>
          <span>${customerNotes}</span>
        </div>
      </td>
      <td>${escapeHtml(serviceNames)}</td>
      <td>
        <div class="detail-list">
          <span>${formatDateTime(booking.start)}</span>
          <span>${formatTime(booking.start)} to ${formatTime(booking.end)}</span>
          <span>${escapeHtml(state.business?.timezone || "")}</span>
        </div>
      </td>
      <td><span class="pill">${escapeHtml(booking.status)}</span></td>
      <td>
        ${
          booking.status === "confirmed"
            ? `<button class="secondary small" data-booking-id="${booking.id}" type="button">Cancel</button>`
            : "Not available"
        }
      </td>
    `;
    body.appendChild(row);
  });

  body.querySelectorAll("button[data-booking-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await cancelBooking(button.dataset.bookingId, button);
    });
  });
}

function renderAvailabilityRows() {
  const container = document.getElementById("availability-rows");
  container.innerHTML = "";

  days.forEach((day) => {
    const card = document.createElement("section");
    card.className = "availability-day";
    card.dataset.day = String(day.value);
    card.innerHTML = `
      <div class="availability-day-header">
        <div>
          <h3>${day.label}</h3>
          <p class="muted">Add one or more working windows for this day.</p>
        </div>
        <button type="button" class="secondary small" data-add-window="${day.value}">Add window</button>
      </div>
      <div class="window-list" data-window-list="${day.value}"></div>
      <div class="empty-state" data-empty-state="${day.value}">Closed for this day.</div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll("button[data-add-window]").forEach((button) => {
    button.addEventListener("click", () => {
      addAvailabilityWindow(Number(button.dataset.addWindow));
    });
  });
}

function clearAvailabilityRows() {
  document.querySelectorAll("[data-window-list]").forEach((container) => {
    container.innerHTML = "";
  });
}

function addAvailabilityWindow(dayOfWeek, window = { startMinutes: 9 * 60, endMinutes: 17 * 60 }) {
  const list = document.querySelector(`[data-window-list='${dayOfWeek}']`);
  const row = document.createElement("div");
  row.className = "window-row";
  row.innerHTML = `
    <div>
      <label>Start</label>
      <input class="availability-start" type="time" value="${minutesToTime(window.startMinutes)}" />
    </div>
    <div>
      <label>End</label>
      <input class="availability-end" type="time" value="${minutesToTime(window.endMinutes)}" />
    </div>
    <div style="margin-left:auto;">
      <label>&nbsp;</label>
      <button class="ghost small remove-window-button" type="button">Remove</button>
    </div>
  `;

  row.querySelector(".remove-window-button").addEventListener("click", () => {
    row.remove();
    updateAvailabilityEmptyState(dayOfWeek);
  });

  list.appendChild(row);
  updateAvailabilityEmptyState(dayOfWeek);
}

function updateAvailabilityEmptyState(dayOfWeek) {
  const list = document.querySelector(`[data-window-list='${dayOfWeek}']`);
  const emptyState = document.querySelector(`[data-empty-state='${dayOfWeek}']`);
  emptyState.hidden = list.children.length > 0;
}

function renderBlockedTimes(blockedTimes) {
  const body = document.getElementById("blocked-times-table-body");
  body.innerHTML = "";
  state.blockedTimes = Array.isArray(blockedTimes) ? blockedTimes.slice() : [];

  if (!Array.isArray(blockedTimes) || blockedTimes.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="3" class="muted">No blocked times overlap the selected date.</td>
      </tr>
    `;
    return;
  }

  blockedTimes
    .slice()
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
    .forEach((blockedTime) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <div class="detail-list">
            <span>${formatDateTime(blockedTime.start)}</span>
            <span>${formatDateTime(blockedTime.end)}</span>
          </div>
        </td>
        <td>${escapeHtml(blockedTime.reason || "No reason provided")}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="secondary small" data-edit-blocked-time="${blockedTime.id}">Edit</button>
            <button type="button" class="ghost small" data-delete-blocked-time="${blockedTime.id}">Delete</button>
          </div>
        </td>
      `;
      body.appendChild(row);
    });

  body.querySelectorAll("[data-edit-blocked-time]").forEach((button) => {
    button.addEventListener("click", () => {
      const blockedTime = blockedTimes.find((item) => item.id === button.dataset.editBlockedTime);
      if (!blockedTime) return;
      populateBlockedTimeForm(blockedTime);
    });
  });

  body.querySelectorAll("[data-delete-blocked-time]").forEach((button) => {
    button.addEventListener("click", async () => {
      const blockedTimeId = button.dataset.deleteBlockedTime;
      if (!blockedTimeId) return;
      await deleteBlockedTime(blockedTimeId);
    });
  });

  syncBlockedTimeOverlapHint();
}

function renderBlockedTimesLoading() {
  const body = document.getElementById("blocked-times-table-body");
  body.innerHTML = "";

  for (let index = 0; index < 3; index += 1) {
    const row = document.createElement("tr");
    row.className = "blocked-time-loading-row";
    row.setAttribute("aria-hidden", "true");
    row.innerHTML = `
      <td>
        <div class="detail-list">
          <span class="skeleton-line long"></span>
          <span class="skeleton-line short"></span>
        </div>
      </td>
      <td><span class="skeleton-line long"></span></td>
      <td><span class="skeleton-chip"></span></td>
    `;
    body.appendChild(row);
  }
}

function renderBlockedTimesError() {
  const body = document.getElementById("blocked-times-table-body");
  body.innerHTML = `
    <tr>
      <td colspan="3" class="muted">${UI_COPY.admin.blockedTimesUnavailable}</td>
    </tr>
  `;
}

function renderServicesSummary(services, options = { hasError: false }) {
  setServicesSummaryLoading(false);
  const totalCount = services.length;
  const activeCount = services.filter((service) => service.active).length;
  const inactiveCount = totalCount - activeCount;
  const averageDuration =
    totalCount === 0
      ? 0
      : Math.round(
          services.reduce((sum, service) => sum + Number(service.durationMinutes || 0), 0) / totalCount
        );

  document.getElementById("services-total-count").textContent = String(totalCount);
  document.getElementById("services-active-count").textContent = String(activeCount);
  document.getElementById("services-inactive-count").textContent = String(inactiveCount);
  document.getElementById("services-average-duration").textContent = `${averageDuration} mins`;

  // Step 7 (Laws 4, 6, 7): summary notes explain empty/error states without duplicating service metrics logic.
  const note = document.getElementById("services-summary-note");
  if (options.hasError) {
    note.textContent = UI_COPY.admin.servicesSummaryUnavailable;
    note.hidden = false;
    return;
  }

  if (totalCount === 0) {
    note.textContent = UI_COPY.admin.servicesSummaryEmpty;
    note.hidden = false;
    return;
  }

  note.textContent = "";
  note.hidden = true;
}

function setServicesSummaryLoading(isLoading) {
  const grid = document.getElementById("services-summary-grid");
  const cards = Array.from(grid.querySelectorAll(".stat-card"));
  const values = [
    document.getElementById("services-total-count"),
    document.getElementById("services-active-count"),
    document.getElementById("services-inactive-count"),
    document.getElementById("services-average-duration"),
  ];
  const note = document.getElementById("services-summary-note");

  grid.classList.toggle("is-loading", isLoading);
  grid.setAttribute("aria-busy", String(isLoading));
  cards.forEach((card) => card.classList.toggle("is-loading", isLoading));

  if (isLoading) {
    values.forEach((value) => {
      value.innerHTML = `<span class="skeleton-stat" aria-hidden="true"></span>`;
    });
    note.textContent = UI_COPY.admin.servicesSummaryLoading;
    note.hidden = false;
  }
}

async function createService() {
  clearMessage("service-message");
  const createButton = document.getElementById("create-service-button");
  const defaultButtonLabel = "Add service";

  if (createButton.disabled) {
    return;
  }

  const payload = {
    name: document.getElementById("service-name").value.trim(),
    durationMinutes: Number(document.getElementById("service-duration").value),
    price: Number(document.getElementById("service-price").value),
    bufferMinutes: Number(document.getElementById("service-buffer").value || 0),
  };

  if (!payload.name) {
    showMessage("service-message", "Service name is required.", "error");
    return;
  }
  if (!Number.isFinite(payload.durationMinutes) || payload.durationMinutes <= 0) {
    showMessage("service-message", "Duration must be greater than 0 minutes.", "error");
    return;
  }
  if (!Number.isFinite(payload.price) || payload.price < 0) {
    showMessage("service-message", "Price must be 0 or higher.", "error");
    return;
  }
  if (!Number.isFinite(payload.bufferMinutes) || payload.bufferMinutes < 0) {
    showMessage("service-message", "Buffer must be 0 or higher.", "error");
    return;
  }

  createButton.disabled = true;
  createButton.textContent = "Adding service...";

  try {
    const result = await createServiceRequest(businessId, payload);

    showMessage("service-message", `Service "${result.name}" created.`, "success");
    document.getElementById("service-name").value = "";
    document.getElementById("service-duration").value = "";
    document.getElementById("service-price").value = "";
    document.getElementById("service-buffer").value = "";

    await loadServices();
  } catch (error) {
    showMessage("service-message", error.message || "Failed to create service.", "error");
  } finally {
    createButton.disabled = false;
    createButton.textContent = defaultButtonLabel;
  }
}

async function saveAvailability() {
  clearMessage("availability-message");

  const availability = [];
  const windowsByDay = new Map(days.map((day) => [day.value, []]));

  for (const day of days) {
    const rows = Array.from(document.querySelectorAll(`[data-window-list='${day.value}'] .window-row`));

    for (const row of rows) {
      const startValue = row.querySelector(".availability-start").value;
      const endValue = row.querySelector(".availability-end").value;

      if (!startValue || !endValue) {
        showMessage("availability-message", `${day.label} has a window with a missing start or end time.`, "error");
        return;
      }

      const startMinutes = timeToMinutes(startValue);
      const endMinutes = timeToMinutes(endValue);

      if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
        showMessage("availability-message", `${day.label} has an invalid time window.`, "error");
        return;
      }

      if (startMinutes >= endMinutes) {
        showMessage("availability-message", `${day.label} has a window where the start must be earlier than the end.`, "error");
        return;
      }

      const window = {
        dayOfWeek: day.value,
        active: true,
        startMinutes,
        endMinutes,
      };

      availability.push(window);
      windowsByDay.get(day.value).push(window);
    }
  }

  for (const day of days) {
    const dayWindows = windowsByDay
      .get(day.value)
      .slice()
      .sort((left, right) => left.startMinutes - right.startMinutes);

    for (let index = 1; index < dayWindows.length; index += 1) {
      const previousWindow = dayWindows[index - 1];
      const currentWindow = dayWindows[index];

      if (currentWindow.startMinutes < previousWindow.endMinutes) {
        showMessage("availability-message", `${day.label} has overlapping windows. Adjust the times before saving.`, "error");
        return;
      }
    }
  }

  try {
    await saveAvailabilityRequest(businessId, availability);
    showMessage("availability-message", "Weekly availability saved.", "success");
    await loadAvailability();
  } catch (error) {
    showMessage("availability-message", error.message || "Failed to save availability.", "error");
  }
}

async function saveBlockedTime() {
  clearMessage("block-message");
  syncBlockedTimeOverlapHint();
  const saveButton = document.getElementById("save-block-button");
  const cancelButton = document.getElementById("cancel-block-edit-button");

  if (saveButton.disabled) {
    return;
  }

  const startValue = document.getElementById("block-start").value;
  const endValue = document.getElementById("block-end").value;
  const reason = document.getElementById("block-reason").value.trim();

  if (!startValue || !endValue) {
    showMessage("block-message", "Start and end are required for blocked time.", "error");
    return;
  }

  let payload;
  try {
    payload = {
      start: buildIsoFromBusinessDateTime(startValue, state.business.timezone),
      end: buildIsoFromBusinessDateTime(endValue, state.business.timezone),
      reason,
    };
  } catch (error) {
    showMessage("block-message", error.message || "Failed to prepare blocked time.", "error");
    return;
  }

  saveButton.disabled = true;
  cancelButton.disabled = true;
  saveButton.textContent = "Saving blocked time...";

  try {
    if (state.editingBlockedTimeId) {
      await updateBlockedTimeRequest(businessId, state.editingBlockedTimeId, payload);
      showMessage("block-message", "Blocked time updated.", "success");
    } else {
      await createBlockedTimeRequest(businessId, payload);
      showMessage("block-message", "Blocked time created.", "success");
    }

    resetBlockedTimeForm(false);
    await loadBlockedTimes();
  } catch (error) {
    showMessage("block-message", error.message || "Failed to save blocked time.", "error");
  } finally {
    saveButton.disabled = false;
    cancelButton.disabled = false;
    saveButton.textContent = state.editingBlockedTimeId ? "Save blocked time" : "Add blocked time";
  }
}

async function deleteBlockedTime(blockedTimeId) {
  clearMessage("block-message");

  if (!window.confirm("Delete this blocked time?")) {
    return;
  }

  try {
    await deleteBlockedTimeRequest(businessId, blockedTimeId);
    showMessage("block-message", "Blocked time deleted.", "success");

    if (state.editingBlockedTimeId === blockedTimeId) {
      resetBlockedTimeForm(false);
    }

    await loadBlockedTimes();
  } catch (error) {
    showMessage("block-message", error.message || "Failed to delete blocked time.", "error");
  }
}

function populateBlockedTimeForm(blockedTime) {
  state.editingBlockedTimeId = blockedTime.id;
  document.getElementById("block-start").value = formatDateTimeInputInTimeZone(
    blockedTime.start,
    state.business?.timezone || "UTC"
  );
  document.getElementById("block-end").value = formatDateTimeInputInTimeZone(
    blockedTime.end,
    state.business?.timezone || "UTC"
  );
  document.getElementById("block-reason").value = blockedTime.reason || "";
  document.getElementById("save-block-button").textContent = "Save blocked time";
  document.getElementById("cancel-block-edit-button").hidden = false;
  syncBlockedTimeOverlapHint();
}

function resetBlockedTimeForm(clearMessageState = true) {
  state.editingBlockedTimeId = "";
  document.getElementById("block-start").value = "";
  document.getElementById("block-end").value = "";
  document.getElementById("block-reason").value = "";
  document.getElementById("save-block-button").textContent = "Add blocked time";
  document.getElementById("cancel-block-edit-button").hidden = true;

  if (clearMessageState) {
    clearMessage("block-message");
  }

  clearInlineHint("block-inline-hint");
}

async function cancelBooking(bookingId, button) {
  clearMessage("booking-message");

  // Step 7 (Laws 1, 2, 7): row-local pending state prevents duplicate cancel actions without blocking the full table.
  const originalLabel = button?.textContent ?? "Cancel";
  if (button) {
    button.disabled = true;
    button.textContent = UI_COPY.admin.cancelPending;
  }

  try {
    await cancelBookingRequest(businessId, bookingId);
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
    showMessage("booking-message", error.message || "Failed to cancel booking.", "error");
    return;
  }

  showMessage("booking-message", UI_COPY.admin.bookingCancelled, "success");

  try {
    await loadBookings();
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
    showMessage("booking-message", UI_COPY.admin.bookingCancelledRefreshError, "error");
  }
}

async function signOut() {
  try {
    await logoutBusiness();
  } finally {
    window.location.href = "/login";
  }
}

function setBlockedTimesLoading(isLoading) {
  state.blockedTimesLoading = isLoading;
  const surface = document.getElementById("blocked-times-surface");
  surface.classList.toggle("is-loading", isLoading);
  surface.setAttribute("aria-busy", String(isLoading));
}

function syncBlockedTimeOverlapHint() {
  const startValue = document.getElementById("block-start").value;
  const endValue = document.getElementById("block-end").value;

  if (!startValue || !endValue || !Array.isArray(state.blockedTimes) || state.blockedTimes.length === 0) {
    clearInlineHint("block-inline-hint");
    return;
  }

  try {
    const startIso = buildIsoFromBusinessDateTime(startValue, state.business?.timezone || "UTC");
    const endIso = buildIsoFromBusinessDateTime(endValue, state.business?.timezone || "UTC");
    const overlapsExisting = state.blockedTimes.some((blockedTime) => {
      if (blockedTime.id === state.editingBlockedTimeId) {
        return false;
      }

      return rangesOverlap(startIso, endIso, blockedTime.start, blockedTime.end);
    });

    if (overlapsExisting) {
      setInlineHint("block-inline-hint", UI_COPY.admin.blockedTimeOverlap, "error");
      return;
    }
  } catch {
    clearInlineHint("block-inline-hint");
    return;
  }

  clearInlineHint("block-inline-hint");
}

function rangesOverlap(startA, endA, startB, endB) {
  return new Date(startA).getTime() < new Date(endB).getTime() && new Date(endA).getTime() > new Date(startB).getTime();
}

function setDefaultBlockedTimesDate() {
  document.getElementById("blocked-times-date").value = getCurrentDateInTimeZone(state.business?.timezone || "UTC");
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
  return formatDateTimeInTimeZone(value, state.business?.timezone || "UTC");
}

function formatTime(value) {
  return formatTimeInTimeZone(value, state.business?.timezone || "UTC");
}

function showMessage(id, text, type) {
  setStatusMessage(document.getElementById(id), text, type);
}

function clearMessage(id) {
  clearStatusMessage(document.getElementById(id));
}

function setInlineHint(id, text, type = "info") {
  const element = document.getElementById(id);
  element.textContent = text;
  element.className = `field-hint ${type} visible`;
}

function clearInlineHint(id) {
  const element = document.getElementById(id);
  element.textContent = "";
  element.className = "field-hint";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
