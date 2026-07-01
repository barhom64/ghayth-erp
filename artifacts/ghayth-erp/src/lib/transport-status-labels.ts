/**
 * Transport status labels — TA-T18-06 (#2079).
 *
 * Single source of truth for Arabic labels + Tailwind tone classes
 * across the six transport entities. The drift test in
 * `transportStatusLabelsDictionary.test.ts` parses the server enums
 * and fails the build if a value loses its label here.
 *
 * Scope:
 *   • booking   ← BOOKING_STATUSES   (transport-bookings.ts:91)
 *   • dispatch  ← DISPATCH_STATUSES  (transport-bookings.ts:120)
 *   • cargo     ← CARGO_STATUSES     (cargo.ts:62)
 *   • leg       ← transport_itinerary_legs status check (271)
 *   • vehicle   ← VEHICLE_STATUS_OPTIONS canonical set
 *   • rental    ← fleet_rental_contracts states + the two derived
 *                 sub-stages classified on the client (#2001 / #2002)
 *   • navigation ← driver_navigation_sessions lifecycle (ملاحة السائق)
 *   • trip       ← driver trips (شاشة me-driver)
 *   • driver     ← fleet_drivers availability / duty status
 *
 * Owner's rule (RM-03): «صفر fallback إنجليزي خام». Every status
 * returned by the API must surface in Arabic on the operator screen.
 *
 * ── علاقتها بـ STATUS_MAP (page-status-badge.tsx) — فصل مقصود لا تكرار ──
 * هذا القاموس هو المصدر الموحّد لحالات مسار **النقل/الأسطول اللوجستي**
 * (٩ كيانات)، وهو ثمرة توحيد مقصود سابق (TA-T18، انظر
 * transportDriverStatusUnification.test.ts) ومحروس بـ ٨ ملفات اختبار +
 * اختبار انحراف يقرأ enums الخادم. يملك لوحة ألوان لوجستية أغنى
 * (purple/orange/rose لمراحل الشحن) وتسميات مناسبة للسياق (rental active=
 * «فعّال» لا «نشط» العام). بينما STATUS_MAP هو السجل العام عبر-المسارات
 * بألوان دلالية (success/info/…). التقاطع في trip/vehicle/driver مقصود:
 * التسمية تتبع السياق. **لا تُدمَج القسريّة بينهما** — الدمج يكسر الاختبارات
 * الثمانية ويفقد اللوحة اللوجستية ويهدم توحيدًا قائمًا. (قرار معماري
 * معتمد من إبراهيم 2026-07-01.)
 */

export type TransportEntity =
  | "booking"
  | "dispatch"
  | "cargo"
  | "leg"
  | "vehicle"
  | "rental"
  | "navigation"
  | "trip"
  | "driver";

export interface StatusLabel {
  /** Arabic, direct user-facing. */
  label: string;
  /** Tailwind class set for the status badge tone. */
  tone: string;
}

const POSITIVE  = "bg-status-success-surface text-status-success-foreground";
const INFO      = "bg-status-info-surface text-status-info-foreground";
const WARNING   = "bg-status-warning-surface text-status-warning-foreground";
const ERROR     = "bg-status-error-surface text-status-error-foreground";
const NEUTRAL   = "bg-surface-subtle text-muted-foreground";
const PURPLE    = "bg-purple-50 text-purple-700";
const ORANGE    = "bg-orange-50 text-orange-700";
const ROSE      = "bg-rose-100 text-rose-700";

/* ── booking (transport_bookings) ────────────────────────────── */
const BOOKING: Record<string, StatusLabel> = {
  draft:            { label: "مسوّدة",         tone: NEUTRAL },
  submitted:        { label: "مُقدَّمة",         tone: INFO },
  pending_approval: { label: "بانتظار الاعتماد", tone: WARNING },
  approved:         { label: "معتمدة",         tone: POSITIVE },
  scheduled:        { label: "مجدولة",         tone: INFO },
  dispatched:       { label: "مُسندة للتنفيذ",   tone: INFO },
  in_progress:      { label: "قيد التنفيذ",    tone: WARNING },
  completed:        { label: "مكتملة",         tone: POSITIVE },
  cancelled:        { label: "ملغاة",          tone: ROSE },
  rejected:         { label: "مرفوضة",         tone: ERROR },
};

/* ── dispatch (transport_dispatch_orders) ────────────────────── */
const DISPATCH: Record<string, StatusLabel> = {
  pending:   { label: "بانتظار التبليغ", tone: NEUTRAL },
  notified:  { label: "تم تبليغ السائق", tone: INFO },
  accepted:  { label: "قبلها السائق",   tone: INFO },
  declined:  { label: "رفضها السائق",   tone: ERROR },
  executing: { label: "قيد التنفيذ",   tone: WARNING },
  completed: { label: "مكتملة",        tone: POSITIVE },
  closed:    { label: "مُغلَقة",         tone: POSITIVE },
  cancelled: { label: "ملغاة",         tone: ROSE },
};

/* ── cargo (cargo_manifests) ─────────────────────────────────── */
const CARGO: Record<string, StatusLabel> = {
  draft:               { label: "مسوّدة",            tone: NEUTRAL },
  requested:           { label: "مطلوبة",            tone: INFO },
  approved:            { label: "معتمدة",            tone: POSITIVE },
  assigned_to_driver:  { label: "مُسندة للسائق",      tone: INFO },
  driver_accepted:     { label: "قبلها السائق",       tone: INFO },
  trip_started:        { label: "انطلقت الرحلة",      tone: WARNING },
  arrived_pickup:      { label: "وصل لنقطة التحميل",  tone: PURPLE },
  loaded:              { label: "تم التحميل",        tone: PURPLE },
  in_transit:          { label: "في الطريق",         tone: WARNING },
  arrived_delivery:    { label: "وصل لنقطة التفريغ",  tone: INFO },
  delivered:           { label: "مُسلَّمة",            tone: POSITIVE },
  completed:           { label: "مكتملة",            tone: POSITIVE },
  ready_for_invoice:   { label: "جاهزة للفوترة",     tone: ORANGE },
  financially_closed:  { label: "مغلقة ماليًّا",      tone: POSITIVE },
  cancelled:           { label: "ملغاة",             tone: ROSE },
};

/* ── leg (transport_itinerary_legs) ──────────────────────────── */
const LEG: Record<string, StatusLabel> = {
  pending:     { label: "بانتظار الجدولة", tone: NEUTRAL },
  scheduled:   { label: "مجدولة",         tone: INFO },
  assigned:    { label: "مُسندة",           tone: INFO },
  in_progress: { label: "قيد التنفيذ",     tone: WARNING },
  completed:   { label: "مكتملة",         tone: POSITIVE },
  cancelled:   { label: "ملغاة",          tone: ROSE },
  skipped:     { label: "متخطّاة",          tone: NEUTRAL },
};

/* ── vehicle (fleet_vehicles) ────────────────────────────────── */
const VEHICLE: Record<string, StatusLabel> = {
  available:      { label: "متاحة",         tone: POSITIVE },
  in_use:         { label: "قيد الاستخدام", tone: INFO },
  maintenance:    { label: "في الصيانة",   tone: ORANGE },
  out_of_service: { label: "خارج الخدمة",   tone: ERROR },
  retired:        { label: "متوقفة",       tone: NEUTRAL },
  sold:           { label: "مُباعة",        tone: NEUTRAL },
  // Pre-canonical alias kept for legacy rows.
  active:         { label: "نشطة",          tone: POSITIVE },
};

/* ── rental (fleet_rental_contracts) ─────────────────────────── */
const RENTAL: Record<string, StatusLabel> = {
  draft:             { label: "مسوّدة",             tone: NEUTRAL },
  // Two derived sub-stages classified client-side (#2001 / #2002).
  awaiting_handover: { label: "في انتظار التسليم", tone: WARNING },
  awaiting_return:   { label: "في انتظار الإرجاع", tone: WARNING },
  active:            { label: "فعّال",              tone: POSITIVE },
  completed:         { label: "مُغلَق",              tone: POSITIVE },
  cancelled:         { label: "ملغى",              tone: ROSE },
};

/* ── navigation (driver_navigation_sessions) ─────────────────── */
// #TA-T18-UX-AUDIT-01 — ملاحة السائق داخل التطبيق (شاشة me-driver-navigation).
const NAVIGATION: Record<string, StatusLabel> = {
  active:          { label: "في الطريق",          tone: INFO },
  arrived_pickup:  { label: "وصلت موقع التحميل",  tone: PURPLE },
  loaded:          { label: "تم التحميل",         tone: WARNING },
  arrived_dropoff: { label: "وصلت موقع التسليم",  tone: PURPLE },
  delivered:       { label: "تم التسليم",         tone: POSITIVE },
  ended:           { label: "انتهت",              tone: NEUTRAL },
  cancelled:       { label: "ملغاة",              tone: ROSE },
};

/* ── trip (driver trips — شاشة me-driver) ────────────────────── */
const TRIP: Record<string, StatusLabel> = {
  scheduled:   { label: "مجدولة", tone: INFO },
  planned:     { label: "مخططة",  tone: INFO },
  in_progress: { label: "جارية",  tone: WARNING },
  completed:   { label: "مكتملة", tone: POSITIVE },
  cancelled:   { label: "ملغاة",  tone: ROSE },
};

/* ── driver (fleet_drivers availability / duty) ──────────────── */
const DRIVER: Record<string, StatusLabel> = {
  available: { label: "متاح",        tone: POSITIVE },
  on_trip:   { label: "في رحلة",     tone: INFO },
  off_duty:  { label: "خارج الدوام", tone: WARNING },
  suspended: { label: "موقوف",       tone: ROSE },
};

const ALL: Record<TransportEntity, Record<string, StatusLabel>> = {
  booking:    BOOKING,
  dispatch:   DISPATCH,
  cargo:      CARGO,
  leg:        LEG,
  vehicle:    VEHICLE,
  rental:     RENTAL,
  navigation: NAVIGATION,
  trip:       TRIP,
  driver:     DRIVER,
};

/**
 * Look up the Arabic label + tone for a status value within an
 * entity. Falls back to `{ label: raw, tone: neutral }` — never
 * an empty string — so an unknown status surfaces visibly to the
 * dispatcher rather than rendering blank.
 *
 * The drift test ensures every server-enum value has an explicit
 * label here; the fallback only fires on (a) genuinely new server
 * values not yet covered, (b) NULL/empty input from a malformed row.
 */
export function statusLabel(entity: TransportEntity, value: string | null | undefined): StatusLabel {
  if (!value) return { label: "—", tone: NEUTRAL };
  return ALL[entity][value] ?? { label: value, tone: NEUTRAL };
}

/** Direct dictionary access for surfaces that iterate (e.g. filter chips). */
export function statusDict(entity: TransportEntity): Readonly<Record<string, StatusLabel>> {
  return ALL[entity];
}
