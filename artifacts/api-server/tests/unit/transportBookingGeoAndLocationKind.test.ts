import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — closes two gaps from the user's audit:
//
//   1. "from/to without location type" — operators were typing freeform
//      addresses with no categorical bucket. Booking rules downstream
//      depend on knowing if a stop is an airport / hotel / mazar /
//      warehouse / etc.
//
//   2. "missing maps lat/lng/placeId" on the booking — only
//      transport_locations rows had coordinates, so MapsService could
//      only estimate routes when both endpoints were registered in
//      master-data.
//
// Migration 279 adds eight inline columns to transport_bookings; the
// LOCATION_KINDS enum is now enforced on both the booking router and
// the location-master router. The booking-create form gets a
// LocationKindPicker + optional GPS fields.

const apiSrc = join(import.meta.dirname!, "../../src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const MIGRATION = readApi("migrations/279_transport_booking_inline_geo_and_kind.sql");
const ROUTER    = readApi("routes/transport-bookings.ts");
const PICKER    = readSpa("components/shared/location-kind-picker.tsx");
const CREATE    = readSpa("pages/fleet/transport-booking-create.tsx");
const MAP_PICKER_PATH = "components/shared/map-location-picker.tsx";

describe("#1812 — migration 279: inline geo + location kind on bookings", () => {
  it("migration file exists with @rollback header", () => {
    expect(MIGRATION).toContain("@rollback");
  });

  it("adds the 8 expected columns to transport_bookings", () => {
    for (const col of [
      "fromLocationKind", "toLocationKind",
      "fromLat", "fromLng", "fromPlaceId",
      "toLat", "toLng", "toPlaceId",
    ]) {
      expect(MIGRATION).toContain(`"${col}"`);
    }
  });

  it("partial-indexes the two kind columns", () => {
    expect(MIGRATION).toMatch(/idx_transport_bookings_from_kind/);
    expect(MIGRATION).toMatch(/idx_transport_bookings_to_kind/);
    expect(MIGRATION).toMatch(/WHERE "fromLocationKind" IS NOT NULL/);
    expect(MIGRATION).toMatch(/WHERE "toLocationKind" IS NOT NULL/);
  });
});

describe("#1812 — backend LOCATION_KINDS enum", () => {
  it("declares the 10 canonical kinds", () => {
    for (const k of [
      "airport", "gate", "hotel", "mazar", "warehouse",
      "project", "customer_site", "depot", "mosque", "other",
    ]) {
      expect(ROUTER, `kind ${k} missing from LOCATION_KINDS`).toContain(`"${k}"`);
    }
  });

  it("createBookingSchema enforces the enum on fromLocationKind + toLocationKind", () => {
    expect(ROUTER).toMatch(/fromLocationKind:\s*z\.enum\(LOCATION_KINDS\)\.optional\(\)/);
    expect(ROUTER).toMatch(/toLocationKind:\s*z\.enum\(LOCATION_KINDS\)\.optional\(\)/);
  });

  it("validates lat/lng ranges (-90..90 / -180..180)", () => {
    expect(ROUTER).toMatch(/fromLat:\s*z\.coerce\.number\(\)\.min\(-90\)\.max\(90\)/);
    expect(ROUTER).toMatch(/fromLng:\s*z\.coerce\.number\(\)\.min\(-180\)\.max\(180\)/);
    expect(ROUTER).toMatch(/toLat:\s*z\.coerce\.number\(\)\.min\(-90\)\.max\(90\)/);
    expect(ROUTER).toMatch(/toLng:\s*z\.coerce\.number\(\)\.min\(-180\)\.max\(180\)/);
  });

  it("tightens createLocationSchema.locationType from string to LOCATION_KINDS enum", () => {
    expect(ROUTER).toMatch(/locationType:\s*z\.enum\(LOCATION_KINDS\)\.optional\(\)/);
    // The old freeform definition is gone.
    expect(ROUTER).not.toMatch(/locationType:\s*z\.string\(\)\.max\(32\)\.optional\(\)/);
  });

  it("INSERT INTO transport_bookings writes the 8 new columns", () => {
    for (const col of [
      "\"fromLocationKind\"", "\"toLocationKind\"",
      "\"fromLat\"", "\"fromLng\"", "\"fromPlaceId\"",
      "\"toLat\"", "\"toLng\"", "\"toPlaceId\"",
    ]) {
      expect(ROUTER).toContain(col);
    }
    // The new payload is wired through (sample two).
    expect(ROUTER).toMatch(/b\.fromLocationKind \?\? null/);
    expect(ROUTER).toMatch(/b\.toPlaceId \?\? null/);
  });
});

describe("#1812 — LocationKindPicker SPA component", () => {
  it("file exists", () => {
    expect(existsSync(join(spaSrc, "components/shared/location-kind-picker.tsx"))).toBe(true);
  });

  it("Arabic labels for every kind", () => {
    expect(PICKER).toContain("LOCATION_KIND_LABELS");
    for (const [k, label] of [
      ["airport", "مطار"],
      ["gate", "بوابة / منفذ"],
      ["hotel", "فندق"],
      ["mazar", "مزار / موقع زيارة"],
      ["warehouse", "مستودع"],
      ["project", "مشروع"],
      ["mosque", "مسجد"],
    ]) {
      expect(PICKER, `key ${k} missing`).toMatch(new RegExp(`\\b${k}:\\s*"`));
      expect(PICKER, `arabic for ${k} missing`).toContain(label);
    }
  });

  it("emits undefined on empty selection (so the field stays optional)", () => {
    expect(PICKER).toMatch(/onChange\(v \|\| undefined\)/);
  });
});

describe("#1812 — booking-create wires location kind + optional GPS", () => {
  it("imports LocationKindPicker", () => {
    expect(CREATE).toContain("LocationKindPicker");
    expect(CREATE).toContain('from "@/components/shared/location-kind-picker"');
  });

  it("state hooks for kind + lat/lng + GPS-toggle exist", () => {
    expect(CREATE).toMatch(/setFromLocationKind/);
    expect(CREATE).toMatch(/setToLocationKind/);
    expect(CREATE).toMatch(/setFromLat/);
    expect(CREATE).toMatch(/setFromLng/);
    expect(CREATE).toMatch(/setToLat/);
    expect(CREATE).toMatch(/setToLng/);
    expect(CREATE).toMatch(/setShowGeoFields/);
  });

  it("renders the picker for both endpoints", () => {
    const matches = CREATE.match(/<LocationKindPicker/g) ?? [];
    expect(matches.length, "expected 2 LocationKindPicker usages").toBe(2);
  });

  it("POSTs the new fields in the request body", () => {
    expect(CREATE).toMatch(/fromLocationKind:\s*fromLocationKind \|\| undefined/);
    expect(CREATE).toMatch(/toLocationKind:\s*toLocationKind \|\| undefined/);
    expect(CREATE).toMatch(/fromLat:\s*fromLat \? Number\(fromLat\) : undefined/);
    expect(CREATE).toMatch(/toLng:\s*toLng \? Number\(toLng\) : undefined/);
  });

  it("offers an Arabic GPS toggle (optional fields hidden by default)", () => {
    expect(CREATE).toMatch(/أضف إحداثيات GPS/);
    expect(CREATE).toMatch(/إخفاء إحداثيات GPS/);
  });
});

// #TA-T18 (owner gap #8) — the raw lat/lng inputs are now backed by an
// interactive click-to-pin map so the operator sets a precise point
// instead of typing decimal degrees.
describe("#TA-T18 — precise map location picker", () => {
  const MAP_PICKER = readSpa(MAP_PICKER_PATH);

  it("component file exists", () => {
    expect(existsSync(join(spaSrc, MAP_PICKER_PATH))).toBe(true);
  });

  it("is a real leaflet map with click-to-pin + draggable marker (no map key / new dep)", () => {
    expect(MAP_PICKER).toMatch(/from "leaflet"/);
    expect(MAP_PICKER).toMatch(/L\.tileLayer\(/);
    expect(MAP_PICKER).toMatch(/\.on\(\s*"click"/);          // click to pin
    expect(MAP_PICKER).toMatch(/draggable:\s*true/);          // drag to adjust
    expect(MAP_PICKER).toMatch(/onPickRef\.current\(/);       // reports the edit out
  });

  it("is a controlled component (lat/lng in, onPick out — form keeps the truth)", () => {
    expect(MAP_PICKER).toMatch(/lat\?:\s*number/);
    expect(MAP_PICKER).toMatch(/lng\?:\s*number/);
    expect(MAP_PICKER).toMatch(/onPick:\s*\(lat:\s*number,\s*lng:\s*number\)\s*=>/);
  });

  it("booking-create imports + renders the map picker for both endpoints", () => {
    expect(CREATE).toContain('from "@/components/shared/map-location-picker"');
    const matches = CREATE.match(/<MapLocationPicker/g) ?? [];
    expect(matches.length, "expected 2 MapLocationPicker usages (from + to)").toBe(2);
    // wired to the existing coordinate state (still the single source of truth).
    expect(CREATE).toMatch(/setFromLat\(String\(la\)\);\s*setFromLng\(String\(ln\)\)/);
    expect(CREATE).toMatch(/setToLat\(String\(la\)\);\s*setToLng\(String\(ln\)\)/);
  });
});
