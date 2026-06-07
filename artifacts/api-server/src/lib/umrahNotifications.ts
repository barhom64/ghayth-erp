// Umrah outbound notifications (#8 of the maturity gap report).
//
// Background: the compliance dashboard ALERTS THE OPERATOR but never
// the pilgrim. The pilgrim doesn't know his visa expires in 5 days
// until ops chases him. SMS / WhatsApp queues + the `sendMessage`
// seam already exist (`lib/messageSender.ts`) — every umrah trigger
// flows through that seam, so DLP + tenant scoping + audit logging
// behave identically to every other outbound message in the system.
//
// This module wires umrah-specific TRIGGERS into the existing seam:
//
//   - Visa expiring in 7 days → SMS the pilgrim ("جوازك ينتهي بعد X أيام")
//   - Trip departure tomorrow → SMS the pilgrim ("غدًا الانطلاق")
//   - Overstay warning        → SMS the pilgrim ("تجاوزت مدة الإقامة")
//
// The body is templated below in Arabic. The actual provider
// (Twilio / AWS SNS / Unifonic / ...) is configured by the queue
// worker, not here — this module just queues.

import { sendMessage } from "./messageSender.js";

export interface UmrahNotifyTarget {
  pilgrimId: number;
  phone: string;
  fullName: string | null;
  companyId: number;
}

/** Days remaining (positive) or days overstayed (negative). */
export interface VisaExpiryPayload {
  daysRemaining: number;
  visaNumber: string | null;
}

/**
 * SMS the pilgrim that their visa is approaching its expiry. The
 * call returns the same `SendMessageResult` shape `sendMessage`
 * returns so the caller can surface DLP blocks or queue confirmations.
 *
 * The body is intentionally short — SMS carriers split long Arabic
 * messages into multiple segments and each segment is billed; staying
 * under one segment keeps the per-pilgrim cost predictable.
 */
export async function notifyVisaExpiringSoon(
  target: UmrahNotifyTarget,
  payload: VisaExpiryPayload,
) {
  const body = payload.daysRemaining <= 0
    ? `عزيزي ${target.fullName ?? "المعتمر"}: انتهت تأشيرتك. يرجى التواصل مع وكيلك فورًا.`
    : `عزيزي ${target.fullName ?? "المعتمر"}: تأشيرتك تنتهي بعد ${payload.daysRemaining} يوم. تواصل مع وكيلك لتنسيق المغادرة.`;
  return sendMessage({
    channel: "sms",
    recipient: target.phone,
    recipientName: target.fullName ?? undefined,
    body,
    companyId: target.companyId,
    userId: null,
    relatedType: "umrah_pilgrims",
    relatedId: target.pilgrimId,
    templateKey: "umrah.visa.expiring",
    eventAction: "umrah.notifications.visa_expiring.sent",
  });
}

export interface DepartureReminderPayload {
  tripDate: string;          // YYYY-MM-DD
  flightNumber?: string | null;
  fromCity?: string | null;
  toCity?: string | null;
}

export async function notifyDepartureReminder(
  target: UmrahNotifyTarget,
  payload: DepartureReminderPayload,
) {
  const segments = [
    `عزيزي ${target.fullName ?? "المعتمر"}: غدًا انطلاق رحلتك`,
    payload.flightNumber ? ` (${payload.flightNumber})` : "",
    payload.fromCity && payload.toCity ? ` من ${payload.fromCity} إلى ${payload.toCity}` : "",
    `. التاريخ: ${payload.tripDate}.`,
  ];
  return sendMessage({
    channel: "sms",
    recipient: target.phone,
    recipientName: target.fullName ?? undefined,
    body: segments.join(""),
    companyId: target.companyId,
    userId: null,
    relatedType: "umrah_pilgrims",
    relatedId: target.pilgrimId,
    templateKey: "umrah.trip.departure_reminder",
    eventAction: "umrah.notifications.departure_reminder.sent",
  });
}

export interface OverstayWarningPayload {
  daysOverstayed: number;
}

export async function notifyOverstayWarning(
  target: UmrahNotifyTarget,
  payload: OverstayWarningPayload,
) {
  const body = `عزيزي ${target.fullName ?? "المعتمر"}: تجاوزت مدة الإقامة المسموح بها بـ${payload.daysOverstayed} يوم. تواصل مع وكيلك لتسوية الوضع قبل أن تتراكم الغرامات.`;
  return sendMessage({
    channel: "sms",
    recipient: target.phone,
    recipientName: target.fullName ?? undefined,
    body,
    companyId: target.companyId,
    userId: null,
    relatedType: "umrah_pilgrims",
    relatedId: target.pilgrimId,
    templateKey: "umrah.pilgrim.overstay_warning",
    eventAction: "umrah.notifications.overstay_warning.sent",
  });
}
