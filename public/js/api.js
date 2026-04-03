async function requestJson(url, options = {}) {
  const response = await fetch(url, options);

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || "Request failed.";

    if ((response.status === 401 || response.status === 403) && window.location.pathname.startsWith("/admin/")) {
      const redirect = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?redirect=${redirect}`;
    }

    throw new Error(message);
  }

  return payload;
}

export function getBusiness(businessId) {
  return requestJson(`/api/business/${businessId}`);
}

export function getServices(businessId) {
  return requestJson(`/api/business/${businessId}/services`);
}

export function createService(businessId, payload) {
  return requestJson(`/api/business/${businessId}/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getAvailability(businessId) {
  return requestJson(`/api/business/${businessId}/availability`);
}

export function saveAvailability(businessId, availability) {
  return requestJson(`/api/business/${businessId}/availability`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ availability }),
  });
}

export function createBlockedTime(businessId, payload) {
  return requestJson(`/api/business/${businessId}/blocked-times`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getBlockedTimes(businessId, date) {
  const params = new URLSearchParams({ date });
  return requestJson(`/api/business/${businessId}/blocked-times?${params.toString()}`);
}

export function updateBlockedTime(businessId, blockedTimeId, payload) {
  return requestJson(`/api/business/${businessId}/blocked-times/${blockedTimeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteBlockedTime(businessId, blockedTimeId) {
  return requestJson(`/api/business/${businessId}/blocked-times/${blockedTimeId}`, {
    method: "DELETE",
  });
}

export function getBookings(businessId) {
  return requestJson(`/api/business/${businessId}/bookings`);
}

export function cancelBooking(businessId, bookingId) {
  return requestJson(`/api/business/${businessId}/bookings/${bookingId}/cancel`, {
    method: "PATCH",
  });
}

export function logoutBusiness() {
  return requestJson("/api/logout", {
    method: "POST",
  });
}
