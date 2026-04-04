import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// Default transport reads from environment variables.
// In tests, call setMailTransport() to inject a capturing transport.
let transport: Transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 587),
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

export function setMailTransport(t: Transporter): void {
  transport = t;
}

export async function sendBookingConfirmation(params: {
  customerEmail: string;
  businessEmail: string;
  businessName: string;
  customerName: string;
  serviceName: string;
  startTime: string;
}): Promise<void> {
  const subject = `Booking confirmed — ${params.businessName}`;
  const body = `Your booking for ${params.serviceName} at ${params.startTime} is confirmed.`;
  await Promise.all([
    transport.sendMail({ to: params.customerEmail, subject, text: body }),
    transport.sendMail({ to: params.businessEmail, subject: `New booking: ${params.customerName}`, text: body }),
  ]);
}

export async function sendRescheduleNotification(params: {
  customerEmail: string;
  businessEmail: string;
  businessName: string;
  customerName: string;
  serviceName: string;
  newStartTime: string;
}): Promise<void> {
  const subject = `Booking rescheduled — ${params.businessName}`;
  const body = `Your booking for ${params.serviceName} has been rescheduled to ${params.newStartTime}.`;
  await Promise.all([
    transport.sendMail({ to: params.customerEmail, subject, text: body }),
    transport.sendMail({ to: params.businessEmail, subject: `Booking rescheduled: ${params.customerName}`, text: body }),
  ]);
}

export async function sendCancellationNotification(params: {
  customerEmail: string;
  businessEmail: string;
  businessName: string;
  customerName: string;
  serviceName: string;
}): Promise<void> {
  const subject = `Booking cancelled — ${params.businessName}`;
  const body = `Your booking for ${params.serviceName} has been cancelled.`;
  await Promise.all([
    transport.sendMail({ to: params.customerEmail, subject, text: body }),
    transport.sendMail({ to: params.businessEmail, subject: `Booking cancelled: ${params.customerName}`, text: body }),
  ]);
}

// Payment notifications: NOT IMPLEMENTED — payments feature not yet built.
// Placeholders reserved for future Task 6 integration.
export async function sendPaymentRequired(_params: unknown): Promise<void> { /* TODO: Task 6 */ }
export async function sendPaymentReceived(_params: unknown): Promise<void> { /* TODO: Task 6 */ }
export async function sendRefundIssued(_params: unknown): Promise<void> { /* TODO: Task 6 */ }
