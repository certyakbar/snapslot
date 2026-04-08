import { clearStatusMessage, setStatusMessage } from "/js/ui-copy.js";

const form = document.getElementById("reset-request-form");
const emailInput = document.getElementById("email");
const submitButton = document.getElementById("submit-button");
const formMessage = document.getElementById("form-message");

const CONFIRMATION_MESSAGE = "If that email is registered, a reset link has been sent.";

form.addEventListener("submit", submitResetRequest);

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

async function submitResetRequest(event) {
  event.preventDefault();
  clearMessage();

  const payload = {
    email: emailInput.value.trim(),
  };

  if (!payload.email) {
    showMessage("Business email is required.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Sending reset link...";

  try {
    const result = await requestJson("/api/request-password-reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    showMessage(result.message || CONFIRMATION_MESSAGE, "success");
  } catch (error) {
    showMessage(error.message || "We couldn't request a password reset.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send reset link";
  }
}

function showMessage(text, type) {
  setStatusMessage(formMessage, text, type);
}

function clearMessage() {
  clearStatusMessage(formMessage);
}
