import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — closes the user's #1 explicit gap:
//   "لا يوجد Multi-leg Booking. الواقع التشغيلي:
//    مطار جدة ↓ فندق مكة ↓ الحرم ↓ المدينة ↓ الفندق ↓ المطار."
//
// The booking-create form now exposes a MultiLegBookingEditor.
// Operator can:
//   - Append legs one at a time, or apply the 6-step umrah template.
//   - Edit from/to text + categorical kind per leg.
//   - Set pickup/dropoff timestamps per leg.
//   - Set per-leg route type (umrah-specific).
//   - Reorder via up/down arrows.
//   - Delete individual legs.
//
// On submit, the array is POSTed as `lines: []` to /transport/bookings.
// The server inserts the booking header + all lines inside withTransaction
// so a leg-validation failure rolls back the orphan header.

const apiSrc = join(import.meta.dirname!, "../../src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const MIGRATION = readApi("migrations/292_transport_booking_lines_geo_and_kind.sql");
const ROUTER    = readApi("routes/transport-bookings.ts");
const EDITOR    = readSpa("components/shared/multi-leg-booking-editor.tsx");
const CREATE    = readSpa("pages/fleet/transport-booking-create.tsx");

describe("#1812 — migration 281: line-level geo + kind + freeform + legRouteType", () => {
  it("migration file has @rollback header", () => {
    expect(MIGRATION).toContain("@rollback");
  });

  it("adds 11 expected columns to transport_booking_lines", () => {
    for (const col of [
      "fromLocationText", "toLocationText",
      "fromLocationKind", "toLocationKind",
      "fromLat", "fromLng", "fromPlaceId",
      "toLat", "toLng", "toPlaceId",
      "legRouteType",
    ]) {
      expect(MIGRATION, `column ${col} missing`).toContain(`"${col}"`);
    }
  });
});

describe("#1812 — backend createBookingSchema accepts lines[]", () => {
  it("bookingLineSchema gains the 11 new optional fields", () => {
    for (const f of [
      "fromLocationText", "toLocationText",
      "fromLocationKind", "toLocationKind",
      "fromLat", "fromLng", "fromPlaceId",
      "toLat", "toLng", "toPlaceId",
      "legRouteType",
    ]) {
      expect(ROUTER, `field ${f} missing from bookingLineSchema`).toContain(f);
    }
  });

  it("bookingLineSchema makes lineNumber optional (server auto-numbers)", () => {
    expect(ROUTER).toMatch(/lineNumber:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
  });

  it("createBookingSchema declares lines as optional array (max 20)", () => {
    expect(ROUTER).toMatch(/lines:\s*z\.lazy\(\(\) => z\.array\(nestedBookingLineSchema\)\.max\(20\)\)\.optional\(\)/);
  });

  it("POST /transport/bookings wraps header + lines in withTransaction", () => {
    const createBlock = ROUTER.slice(ROUTER.indexOf('"/transport/bookings"'));
    expect(createBlock).toMatch(/withTransaction\(async \(\) => \{/);
    expect(createBlock).toMatch(/lineNumber\s*=\s*leg\.lineNumber \?\? i \+ 1/);
    expect(createBlock).toMatch(/INSERT INTO transport_booking_lines/);
    expect(createBlock).toMatch(/return \{ insertId: bookingId, legsInserted: inserted \}/);
  });

  it("response payload includes legsInserted count", () => {
    const createBlock = ROUTER.slice(ROUTER.indexOf('"/transport/bookings"'));
    expect(createBlock).toMatch(/res\.status\(201\)\.json\(\{ data: \{ id: insertId, legsInserted \} \}\)/);
    expect(createBlock).toMatch(/legsCount:\s*legsInserted/);
  });
});

describe("#1812 — MultiLegBookingEditor SPA component", () => {
  it("file exists", () => {
    expect(existsSync(join(spaSrc, "components/shared/multi-leg-booking-editor.tsx"))).toBe(true);
  });

  it("ships the 6-step umrah template (the canonical KSA loop)", () => {
    expect(EDITOR).toMatch(/UMRAH_TEMPLATE:\s*BookingLeg\[\]/);
    expect(EDITOR).toContain("مطار جدة الدولي");
    expect(EDITOR).toContain("الحرم المكي");
    expect(EDITOR).toContain("المسجد النبوي");
    expect(EDITOR).toContain("مطار المدينة");
    // 6 legs in the template.
    const matches = EDITOR.match(/\{\s*\.\.\.EMPTY_LEG/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(6);
  });

  it("offers all 10 KSA location kinds", () => {
    for (const k of [
      "airport", "gate", "hotel", "mazar", "warehouse",
      "project", "customer_site", "depot", "mosque", "other",
    ]) {
      expect(EDITOR, `kind ${k} missing`).toContain(`value: "${k}"`);
    }
  });

  it("supports reorder (up/down) + delete + append", () => {
    expect(EDITOR).toMatch(/const move = \(idx: number, dir: -1 \| 1\)/);
    expect(EDITOR).toMatch(/const remove = \(idx: number\)/);
    expect(EDITOR).toMatch(/const append = \(\) => onChange\(\[\.\.\.legs, \{ \.\.\.EMPTY_LEG \}\]\)/);
  });

  it("Arabic-first labels (no English fallbacks)", () => {
    expect(EDITOR).toMatch(/مقاطع المسار/);
    expect(EDITOR).toMatch(/مقطع جديد/);
    expect(EDITOR).toMatch(/قالب عمرة \(6 مقاطع\)/);
    expect(EDITOR).toMatch(/المقطع/);
    expect(EDITOR).toMatch(/نوع موقع الانطلاق/);
    expect(EDITOR).toMatch(/نوع موقع الوصول/);
  });

  it("exports legsToApiPayload helper that maps editor → API shape", () => {
    expect(EDITOR).toContain("export function legsToApiPayload");
    expect(EDITOR).toMatch(/fromLocationText:\s*l\.fromText\?\.trim\(\)/);
    expect(EDITOR).toMatch(/toLocationKind:\s*l\.toKind/);
    expect(EDITOR).toMatch(/legRouteType:\s*l\.legRouteType/);
  });
});

describe("#1812 — booking-create wires the multi-leg editor", () => {
  it("imports MultiLegBookingEditor + legsToApiPayload", () => {
    expect(CREATE).toContain("MultiLegBookingEditor");
    expect(CREATE).toContain("legsToApiPayload");
  });

  it("state hook for legs exists", () => {
    expect(CREATE).toMatch(/const \[legs, setLegs\] = useState<BookingLeg\[\]>\(\[\]\)/);
  });

  it("renders the editor under its own card", () => {
    expect(CREATE).toMatch(/مقاطع المسار \(Multi-leg\)/);
    expect(CREATE).toMatch(/<MultiLegBookingEditor legs=\{legs\} onChange=\{setLegs\}/);
  });

  it("POSTs lines array when non-empty", () => {
    expect(CREATE).toMatch(/lines:\s*legs\.length > 0 \? legsToApiPayload\(legs\) : undefined/);
  });
});
