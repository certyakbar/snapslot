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
export async function sendPaymentRequired(params: {
  customerEmail: string;
  businessEmail: string;
  businessName: string;
  customerName: string;
  serviceName: string;
  depositAmount: number;
  paymentLabel: string;
}): Promise<void> {
  const subject = `${params.paymentLabel} required to confirm your booking - ${params.businessName}`;
  const body = `Your booking for ${params.serviceName} requires a ${params.paymentLabel.toLowerCase()} of GBP ${(params.depositAmount / 100).toFixed(2)} to be confirmed. Please contact ${params.businessName} to arrange payment.`;
  await Promise.all([
    transport.sendMail({ to: params.customerEmail, subject, text: body }),
    transport.sendMail({ to: params.businessEmail, subject: `Payment required: ${params.customerName}`, text: body }),
  ]);
}

export async function sendPaymentReceived(params: {
  customerEmail: string;
  businessEmail: string;
  businessName: string;
  customerName: string;
  serviceName: string;
  depositAmount: number;
}): Promise<void> {
  const subject = `Payment received - ${params.businessName}`;
  const body = `Your deposit of GBP ${(params.depositAmount / 100).toFixed(2)} for ${params.serviceName} has been received. Your booking is confirmed.`;
  await Promise.all([
    transport.sendMail({ to: params.customerEmail, subject, text: body }),
    transport.sendMail({ to: params.businessEmail, subject: `Payment received: ${params.customerName}`, text: body }),
  ]);
}

export async function sendRefundIssued(params: {
  customerEmail: string;
  businessEmail: string;
  businessName: string;
  customerName: string;
  serviceName: string;
}): Promise<void> {
  const subject = `Refund issued - ${params.businessName}`;
  const body = `A refund has been issued for your booking of ${params.serviceName}.`;
  await Promise.all([
    transport.sendMail({ to: params.customerEmail, subject, text: body }),
    transport.sendMail({ to: params.businessEmail, subject: `Refund issued: ${params.customerName}`, text: body }),
  ]);
}
