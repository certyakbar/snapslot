import { UI_COPY, clearStatusMessage, setStatusMessage } from "/js/ui-copy.js";

const form = document.getElementById("signup-form");
const businessNameInput = document.getElementById("business-name");
const ownerNameInput = document.getElementById("owner-name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const timezoneInput = document.getElementById("timezone");
const bookingIdInput = document.getElementById("booking-id");
const idPreview = document.getElementById("id-preview");
const submitButton = document.getElementById("submit-button");
const formMessage = document.getElementById("form-message");
let signupLocked = false;
let lastAutoSlug = makeSafeId(businessNameInput.value);
let slugManuallyControlled = false;

businessNameInput.addEventListener("input", syncBookingIdFromBusinessName);
bookingIdInput.addEventListener("input", syncSlugManualControl);
form.addEventListener("submit", submitSignup);

syncSlugManualControl();

function syncBookingIdFromBusinessName() {
  const currentSlug = makeSafeId(bookingIdInput.value);
  const nextAutoSlug = makeSafeId(businessNameInput.value);

  if (!slugManuallyControlled || currentSlug === lastAutoSlug) {
    bookingIdInput.value = nextAutoSlug;
    slugManuallyControlled = false;
  }

  lastAutoSlug = nextAutoSlug;
  updateIdPreview();
}

function makeSafeId(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function updateIdPreview() {
  const bookingId = makeSafeId(bookingIdInput.value);
  idPreview.textContent = `Your booking link: /booking/${bookingId || "your-id"}`;
}

function syncSlugManualControl() {
  const sanitizedSlug = makeSafeId(bookingIdInput.value);
  const generatedSlug = makeSafeId(businessNameInput.value);
  slugManuallyControlled = Boolean(sanitizedSlug) && sanitizedSlug !== generatedSlug;
  lastAutoSlug = generatedSlug;
  updateIdPreview();
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

async function submitSignup(event) {
  event.preventDefault();

  if (signupLocked) {
    return;
  }

  clearMessage();

  const payload = {
    businessName: businessNameInput.value.trim(),
    ownerName: ownerNameInput.value.trim(),
    email: emailInput.value.trim(),
    password: passwordInput.value,
    timezone: timezoneInput.value.trim(),
    bookingSlug: makeSafeId(bookingIdInput.value),
  };

  const validationError = validatePayload(payload);
  if (validationError) {
    showMessage(validationError, "error");
    return;
  }

  signupLocked = true;
  submitButton.disabled = true;
  submitButton.textContent = UI_COPY.signup.creating;

  try {
    const result = await requestJson("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    showMessage(UI_COPY.signup.success, "success");

    const redirectTo = result.adminUrl || `/admin/${result.businessId || payload.bookingSlug}`;

    window.setTimeout(() => {
      window.location.href = redirectTo;
    }, 900);
  } catch (error) {
    showMessage(error.message || UI_COPY.signup.genericError, "error");
    signupLocked = false;
    submitButton.disabled = false;
    submitButton.textContent = UI_COPY.signup.submit;
  }
}

function validatePayload(payload) {
  if (!payload.businessName) return "Business name is required.";
  if (!payload.ownerName) return "Full name is required.";
  if (!payload.email) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return "Please enter a valid email address.";
  }
  if (!payload.password || payload.password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!payload.timezone) return "Timezone is required.";
  if (!payload.bookingSlug) return "Booking ID is required.";
  if (!/^[a-z0-9-]+$/.test(payload.bookingSlug)) {
    return "Booking ID can only contain lowercase letters, numbers, and hyphens.";
  }
  return "";
}

function showMessage(text, type) {
  setStatusMessage(formMessage, text, type);
}

function clearMessage() {
  clearStatusMessage(formMessage);
}
