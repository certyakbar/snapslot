import { clearStatusMessage, setStatusMessage } from "/js/ui-copy.js";

const form = document.getElementById("reset-password-form");
const newPasswordInput = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const submitButton = document.getElementById("submit-button");
const formMessage = document.getElementById("form-message");
const params = new URLSearchParams(window.location.search);
const token = params.get("token") || "";

if (!token) {
  submitButton.disabled = true;
  showMessage("Invalid or expired reset token.", "error");
}

form.addEventListener("submit", submitResetPassword);

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

async function submitResetPassword(event) {
  event.preventDefault();
  clearMessage();

  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!token) {
    showMessage("Invalid or expired reset token.", "error");
    return;
  }

  if (!newPassword) {
    showMessage("Password is required.", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Updating password...";

  try {
    await requestJson("/api/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, newPassword }),
    });

    window.location.href = "/login";
  } catch (error) {
    showMessage(error.message || "We couldn't update your password.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Update password";
  }
}

function showMessage(text, type) {
  setStatusMessage(formMessage, text, type);
}

function clearMessage() {
  clearStatusMessage(formMessage);
}
