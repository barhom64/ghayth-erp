/**
 * #1733 Comments 0 + 8 + 16 — named freight events catalogue.
 *
 * Canonical enum of every event the freight pipeline emits, so the
 * finance side + the audit-log indexer + any future webhook subscriber
 * have ONE source of truth for action strings. Using string literals
 * scattered through emitEvent() calls is how event-naming drift starts.
 *
 * Naming convention: `<module>.<entity>.<verb_past>`.
 *
 * Categories:
 *   • Operational (driver/dispatcher) — cargo lifecycle transitions
 *   • Financial handoff (Comment 0 + 8) — accountant boundary signals
 *   • Aggregate (Comment 3) — multi-line invoice batch outcome
 *
 * Every value in here is the `action` field of an emitEvent() call.
 * If you add a new emit site, add the constant here first; the
 * freightEventsCatalogue.test.ts smoke check pins the mapping.
 */

export const FREIGHT_EVENTS = {
  // ── Operational (driver / dispatcher walks the manifest) ──────────
  ManifestCreated:           "fleet.cargo.manifest.created",
  ManifestStatusChanged:     "fleet.cargo.manifest.status_changed",
  DriverNotified:            "fleet.cargo.driver_notified",
  TripStarted:               "fleet.cargo.trip_started",
  ArrivedPickup:             "fleet.cargo.arrived_pickup",
  Loaded:                    "fleet.cargo.loaded",
  InTransit:                 "fleet.cargo.in_transit",
  ArrivedDelivery:           "fleet.cargo.arrived_delivery",
  Delivered:                 "fleet.cargo.delivered",
  Completed:                 "fleet.cargo.completed",
  ManifestCancelled:         "fleet.cargo.manifest.cancelled",

  // ── Booking + Dispatch (Comment 9 layer) ──────────────────────────
  BookingCreated:            "fleet.booking.created",
  DispatchCreated:           "fleet.dispatch.created",
  DispatchAccepted:          "fleet.dispatch.accepted",
  DispatchDeclined:          "fleet.dispatch.declined",
  DispatchExecuting:         "fleet.dispatch.executing",
  DispatchCompleted:         "fleet.dispatch.completed",

  // ── Operational guards (Blockers #2 + Phase 2) ────────────────────
  VehicleCapacityUnknown:    "fleet.vehicle.capacity.unknown",
  VehicleCapacityException:  "fleet.vehicle.capacity.exception",
  DriverEligibilityUnknown:  "fleet.driver.eligibility.unknown",
  DriverEligibilityException:"fleet.driver.eligibility.exception",
  DriverAssignmentCreated:   "fleet.vehicle.driver_assignment_created",

  // ── Financial handoff (Comment 0 + 8) ─────────────────────────────
  // The dispatcher's "ready for finance" signal — until this fires,
  // NO billing candidate is created and NO JE is posted.
  ReadyForInvoice:           "fleet.cargo.ready_for_invoice",
  // Transport-side handoff to the accountant queue.
  BillingCandidateCreated:   "fleet.cargo.billing_candidate.created",
  // The accountant materialised the candidate into a JE.
  BillingCandidateMaterialized: "finance.transport_billing.materialized",
  // The accountant rejected the candidate — operator action required.
  BillingCandidateRejected:  "finance.transport_billing.rejected",

  // ── Aggregate (Comment 3 — multi-line invoice batch) ──────────────
  // The accountant grouped N service lines into one customer invoice.
  // The finance side listens on this event to create the actual
  // invoice + invoice_lines rows.
  BillingBatchReady:         "finance.transport_billing.batch.ready",

  // ── Vehicle operational events (Comment 8 named) ──────────────────
  VehicleOperationalEventRecorded: "fleet.vehicle.operational_event_recorded",

  // ── TR-016 — cargo driver operational checkpoints ─────────────────
  // The driver tapped a within-step event (weighbridge, rest break,
  // inspection, customs, fueling, unloading milestone) on a cargo
  // manifest. These never change the 7-state lifecycle — they are
  // chronological facts rendered inline on the cargo timeline so the
  // dispatcher can see WHAT happened during in_transit / loaded /
  // arrived_pickup as the trip unfolds.
  CargoCheckpointRecorded:   "fleet.cargo.checkpoint_recorded",
} as const;

/** Type of any value in FREIGHT_EVENTS — the legal `action` strings. */
export type FreightEvent = (typeof FREIGHT_EVENTS)[keyof typeof FREIGHT_EVENTS];

/** Reverse lookup — used by audit-log queries that want the
 *  human-readable constant name from a raw action string. */
export const FREIGHT_EVENT_BY_ACTION: Record<string, keyof typeof FREIGHT_EVENTS> =
  Object.fromEntries(
    Object.entries(FREIGHT_EVENTS).map(([k, v]) => [v, k as keyof typeof FREIGHT_EVENTS]),
  );

/** Arabic labels for the timeline UI (cargo-detail page, dispatch
 *  board). The label set covers EVERY value in FREIGHT_EVENTS so the
 *  SPA never falls back to a raw action string. */
export const FREIGHT_EVENT_LABEL_AR: Record<FreightEvent, string> = {
  [FREIGHT_EVENTS.ManifestCreated]:           "تم إنشاء البوليصة",
  [FREIGHT_EVENTS.ManifestStatusChanged]:     "تغيّرت حالة البوليصة",
  [FREIGHT_EVENTS.DriverNotified]:            "تم إبلاغ السائق",
  [FREIGHT_EVENTS.TripStarted]:               "بدأت الرحلة",
  [FREIGHT_EVENTS.ArrivedPickup]:             "وصل لموقع التحميل",
  [FREIGHT_EVENTS.Loaded]:                    "تم التحميل",
  [FREIGHT_EVENTS.InTransit]:                 "في الطريق",
  [FREIGHT_EVENTS.ArrivedDelivery]:           "وصل لموقع التسليم",
  [FREIGHT_EVENTS.Delivered]:                 "تم التسليم",
  [FREIGHT_EVENTS.Completed]:                 "اكتمل تشغيلياً",
  [FREIGHT_EVENTS.ManifestCancelled]:         "ألغيت البوليصة",
  [FREIGHT_EVENTS.BookingCreated]:            "حجز جديد",
  [FREIGHT_EVENTS.DispatchCreated]:           "تم إنشاء أمر التوزيع",
  [FREIGHT_EVENTS.DispatchAccepted]:          "قَبِل السائق التوزيع",
  [FREIGHT_EVENTS.DispatchDeclined]:          "رفض السائق التوزيع",
  [FREIGHT_EVENTS.DispatchExecuting]:         "أمر التوزيع جارٍ",
  [FREIGHT_EVENTS.DispatchCompleted]:         "اكتمل أمر التوزيع",
  [FREIGHT_EVENTS.VehicleCapacityUnknown]:    "سعة المركبة غير معروفة",
  [FREIGHT_EVENTS.VehicleCapacityException]:  "استثناء تجاوز سعة المركبة",
  [FREIGHT_EVENTS.DriverEligibilityUnknown]:  "أهلية السائق غير معروفة",
  [FREIGHT_EVENTS.DriverEligibilityException]:"استثناء عدم أهلية السائق",
  [FREIGHT_EVENTS.DriverAssignmentCreated]:   "تم إنشاء إسناد سائق",
  [FREIGHT_EVENTS.ReadyForInvoice]:           "جاهزة للمحاسبة",
  [FREIGHT_EVENTS.BillingCandidateCreated]:   "تم تسليم الأثر للمحاسب",
  [FREIGHT_EVENTS.BillingCandidateMaterialized]: "تم ترحيل الأثر للمحاسب",
  [FREIGHT_EVENTS.BillingCandidateRejected]:  "رفض المحاسب الترشيح",
  [FREIGHT_EVENTS.BillingBatchReady]:         "حزمة فواتير جاهزة",
  [FREIGHT_EVENTS.VehicleOperationalEventRecorded]: "حدث تشغيلي للمركبة",
  [FREIGHT_EVENTS.CargoCheckpointRecorded]:         "نقطة تشغيلية مسجَّلة",
};
