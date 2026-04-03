import { UI_COPY, clearStatusMessage, setStatusMessage } from "/js/ui-copy.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("submit-button");
const formMessage = document.getElementById("form-message");

form.addEventListener("submit", submitLogin);

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

async function submitLogin(event) {
  event.preventDefault();
  clearMessage();

  const payload = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
  };

  if (!payload.email) {
    showMessage(UI_COPY.login.emailRequired, "error");
    return;
  }

  if (!payload.password) {
    showMessage(UI_COPY.login.passwordRequired, "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = UI_COPY.login.signingIn;

  try {
    const result = await requestJson("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    showMessage(UI_COPY.login.success, "success");

    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    const redirectTo =
      redirect && redirect.startsWith("/") ? redirect : result.adminUrl || `/admin/${result.businessId}`;

    window.setTimeout(() => {
      window.location.href = redirectTo;
    }, 600);
  } catch (error) {
    showMessage(error.message || UI_COPY.login.genericError, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = UI_COPY.login.submit;
  }
}

function showMessage(text, type) {
  setStatusMessage(formMessage, text, type);
}

function clearMessage() {
  clearStatusMessage(formMessage);
}
