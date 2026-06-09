import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — closes the user's gap #10:
//   "أي نظام نقل محترم يحتاج تأكيد حجز يشمل:
//    العميل / المسار / الفندق / المجموعة / المركبة / السائق / QR."
//
// Confirmation is produced via the canonical Ghaith Print Platform
// (PrintButton → /print/render → loadTransportBookingConfirmation +
// the matching preset). The SPA confirmation page is a screen-only
// preview before printing — no direct window.print().

const apiSrc = join(import.meta.dirname!, "../../src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const ROUTER   = readApi("routes/transport-bookings.ts");
const LOADER   = readApi("lib/print/dataLoader.ts");
const TEMPLATE = readApi("lib/print/templateResolver.ts");
const PAGE     = readSpa("pages/fleet/transport-booking-confirmation.tsx");
const ROUTES   = readSpa("routes/fleetRoutes.tsx");
const DETAIL   = readSpa("pages/fleet/transport-booking-detail.tsx");

describe("#1812 — backend GET /transport/bookings/:id/confirmation", () => {
  it("registers the route", () => {
    expect(ROUTER).toMatch(/transportBookingsRouter\.get\(\s*\n?\s*"\/transport\/bookings\/:id\/confirmation"/);
  });

  it("joins booking + lines + dispatch_orders (with driver phone)", () => {
    const block = ROUTER.slice(ROUTER.indexOf("/transport/bookings/:id/confirmation"));
    expect(block).toMatch(/FROM transport_bookings WHERE id = \$1/);
    expect(block).toMatch(/FROM transport_booking_lines/);
    expect(block).toMatch(/FROM transport_dispatch_orders/);
    expect(block).toMatch(/dr\.phone AS "driverPhone"/);
  });

  it("generates a QR data-URL via the qrcode dep", () => {
    const block = ROUTER.slice(ROUTER.indexOf("/transport/bookings/:id/confirmation"));
    expect(block).toMatch(/await import\("qrcode"\)/);
    expect(block).toMatch(/QRCode\.toDataURL\(qrPayload/);
    expect(block).toMatch(/GHAYTH\|TRANSPORT_BOOKING\|\$\{booking\.bookingNumber\}/);
  });
});

describe("#1812 — Print Engine integration", () => {
  it("dataLoader registers transport_booking_confirmation case", () => {
    expect(LOADER).toMatch(/case "transport_booking_confirmation":/);
    expect(LOADER).toContain("loadTransportBookingConfirmation");
  });

  it("loader function loads booking + lines + dispatch + renders legsHtml/dispatchHtml + QR", () => {
    const block = LOADER.slice(LOADER.indexOf("async function loadTransportBookingConfirmation"));
    expect(block).toMatch(/FROM transport_bookings/);
    expect(block).toMatch(/FROM transport_booking_lines/);
    expect(block).toMatch(/FROM transport_dispatch_orders/);
    expect(block).toMatch(/legsHtml/);
    expect(block).toMatch(/dispatchHtml/);
    expect(block).toMatch(/QRCode\.toDataURL\(qrPayload/);
  });

  it("entity-table profile maps to transport_bookings", () => {
    expect(LOADER).toMatch(/transport_booking_confirmation:\s*"transport_bookings"/);
  });

  it("template preset is registered + key matches", () => {
    expect(TEMPLATE).toMatch(/transport_booking_confirmation:\s*\(\)\s*=>\s*buildTransportBookingConfirmationPreset\(\)/);
    expect(TEMPLATE).toContain("buildTransportBookingConfirmationPreset");
    expect(TEMPLATE).toMatch(/presetKey:\s*"transport_booking_confirmation_classic"/);
    expect(TEMPLATE).toMatch(/entityType:\s*"transport_booking_confirmation"/);
  });

  it("preset body renders the user's required fields + the QR + the legs/dispatch tables", () => {
    expect(TEMPLATE).toMatch(/تأكيد حجز نقل/);
    expect(TEMPLATE).toMatch(/\{\{entity\.bookingNumber\}\}/);
    expect(TEMPLATE).toMatch(/\{\{entity\.qrDataUrl\}\}/);
    expect(TEMPLATE).toMatch(/\{\{\{entity\.legsHtml\}\}\}/);
    expect(TEMPLATE).toMatch(/\{\{\{entity\.dispatchHtml\}\}\}/);
    expect(TEMPLATE).toMatch(/\{\{entity\.flightNumber\}\}/);
    expect(TEMPLATE).toMatch(/\{\{entity\.hotelName\}\}/);
    expect(TEMPLATE).toMatch(/\{\{entity\.supervisorName\}\}/);
  });

  it("registers the Arabic display name", () => {
    expect(TEMPLATE).toMatch(/transport_booking_confirmation:\s*"تأكيد حجز نقل"/);
  });
});

describe("#1812 — SPA confirmation page (screen preview)", () => {
  it("file exists at the canonical path", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-booking-confirmation.tsx"))).toBe(true);
  });

  it("queries the confirmation endpoint (not the generic detail one)", () => {
    expect(PAGE).toMatch(/\/transport\/bookings\/\$\{id\}\/confirmation/);
  });

  it("uses the canonical PrintButton (no direct window.print)", () => {
    expect(PAGE).toContain("PrintButton");
    expect(PAGE).toMatch(/entityType="transport_booking_confirmation"/);
    expect(PAGE).not.toContain("window.print()");
    expect(PAGE).not.toContain("jsPDF");
    expect(PAGE).not.toContain("html2pdf");
  });

  it("renders all required fields per the user's spec", () => {
    expect(PAGE).toMatch(/تأكيد حجز نقل/);
    expect(PAGE).toMatch(/العميل/);
    expect(PAGE).toMatch(/رقم الهاتف/);
    expect(PAGE).toMatch(/مجموعة عمرة/);
    expect(PAGE).toMatch(/الفندق/);
    expect(PAGE).toMatch(/المشرف/);
    expect(PAGE).toMatch(/المركبات والسائقون المُسنَدون/);
    expect(PAGE).toMatch(/امسح للتحقق/);
    expect(PAGE).toMatch(/c\.qrDataUrl &&/);
    expect(PAGE).toMatch(/<img src=\{c\.qrDataUrl\}/);
  });

  it("supports multi-leg display via lines[] (falls back to header from/to)", () => {
    expect(PAGE).toMatch(/مقاطع المسار/);
    expect(PAGE).toMatch(/c\.lines\.length > 0/);
    expect(PAGE).toMatch(/c\.lines\.length === 0 && \(c\.fromLocationText \|\| c\.toLocationText\)/);
  });
});

describe("#1812 — routes + booking-detail link", () => {
  it("fleetRoutes.tsx registers /confirmation BEFORE /:id", () => {
    expect(ROUTES).toContain("TransportBookingConfirmation");
    const confIdx = ROUTES.indexOf("/fleet/transport/bookings/:id/confirmation");
    const idIdx = ROUTES.indexOf('"/fleet/transport/bookings/:id"');
    expect(confIdx).toBeGreaterThan(0);
    expect(idIdx).toBeGreaterThan(0);
    expect(confIdx, "/confirmation must come before /:id").toBeLessThan(idIdx);
  });

  it("booking-detail has a 'تأكيد الحجز' button hot-linking to /confirmation", () => {
    expect(DETAIL).toMatch(/تأكيد الحجز \(طباعة \/ PDF\)/);
    expect(DETAIL).toMatch(/\/fleet\/transport\/bookings\/\$\{id\}\/confirmation/);
  });
});
