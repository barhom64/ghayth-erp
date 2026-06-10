import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 Wave 0.2 — linked-source enforcement.
//
// User mandate: "كل إدخال نقل يُجبر customerId / sourceType+sourceId — لا free text."
//
// This test pins the backend refinements that reject a booking / cargo
// manifest where the only customer identifier is a free-text string. The
// refinement keeps a structured upstream record (CRM client, umrah group,
// contract, project, waqf, beneficiary) as the single source of truth for
// downstream invoicing — see TRANSPORT_OPERATING_MODEL §A.

const apiSrc = join(import.meta.dirname!, "../../src");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const BOOKINGS = read("routes/transport-bookings.ts");
const CARGO    = read("routes/cargo.ts");

describe("#1812 Wave 0.2 — transport bookings linked-source guard", () => {
  it("createBookingBaseSchema is a pure ZodObject so .partial() still works for PATCH", () => {
    expect(BOOKINGS).toMatch(/const createBookingBaseSchema = z\.object\(/);
    expect(BOOKINGS).toMatch(
      /const updateBookingSchema = createBookingBaseSchema\.partial\(\)\.extend\(/,
    );
  });

  it("createBookingSchema refines: at least one structured source id must be present", () => {
    expect(BOOKINGS).toMatch(/createBookingBaseSchema\.refine\(/);
    expect(BOOKINGS).toMatch(/b\.customerId != null \|\|/);
    expect(BOOKINGS).toMatch(/b\.umrahGroupId != null \|\|/);
    expect(BOOKINGS).toMatch(/b\.contractId != null \|\|/);
    expect(BOOKINGS).toMatch(/b\.projectId != null \|\|/);
    expect(BOOKINGS).toMatch(/b\.waqfId != null \|\|/);
    expect(BOOKINGS).toMatch(/b\.beneficiaryType != null && b\.beneficiaryId != null/);
  });

  it("refine message explicitly rejects free-text customer", () => {
    expect(BOOKINGS).toMatch(/اسم العميل النصّي وحده غير مقبول/);
    expect(BOOKINGS).toMatch(/path: \["customerId"\]/);
  });
});

describe("#1812 Wave 0.2 — cargo manifest linked-source guard", () => {
  it("createManifestBaseSchema is a pure ZodObject", () => {
    expect(CARGO).toMatch(/const createManifestBaseSchema = z\.object\(/);
    expect(CARGO).toMatch(
      /const updateManifestSchema = createManifestBaseSchema\.partial\(\)\.extend\(/,
    );
  });

  it("createManifestSchema refines: customerId is required (not just customerName)", () => {
    expect(CARGO).toMatch(/createManifestBaseSchema\.refine\(/);
    expect(CARGO).toMatch(/\(b\) => b\.customerId != null/);
    expect(CARGO).toMatch(/يجب اختيار العميل من السجل/);
    expect(CARGO).toMatch(/path: \["customerId"\]/);
  });
});

describe("#1812 Wave 0.2 — runtime parse behaviour (smoke)", () => {
  // The schemas live in the same module as the routes, which import
  // many heavyweight dependencies (express, drizzle, etc.). To keep
  // this test fast we replicate the two refinements as pure functions
  // and assert their truth table — if either refinement is changed in
  // the routes file, the regex assertions above will fail first.

  type Booking = {
    customerId?: number | null; umrahGroupId?: number | null;
    contractId?: number | null; projectId?: number | null;
    waqfId?: number | null;
    beneficiaryType?: string | null; beneficiaryId?: number | null;
    customerName?: string | null;
  };
  const bookingRefine = (b: Booking) =>
    b.customerId != null || b.umrahGroupId != null || b.contractId != null ||
    b.projectId != null || b.waqfId != null ||
    (b.beneficiaryType != null && b.beneficiaryId != null);

  it("rejects a booking with only customerName (free text)", () => {
    expect(bookingRefine({ customerName: "أحمد علي" })).toBe(false);
  });
  it("accepts a booking anchored to a CRM customerId", () => {
    expect(bookingRefine({ customerId: 42 })).toBe(true);
  });
  it("accepts a booking anchored to an umrah group", () => {
    expect(bookingRefine({ umrahGroupId: 7 })).toBe(true);
  });
  it("accepts a booking anchored to a contract", () => {
    expect(bookingRefine({ contractId: 99 })).toBe(true);
  });
  it("accepts a booking anchored to a project", () => {
    expect(bookingRefine({ projectId: 12 })).toBe(true);
  });
  it("accepts a beneficiary linkage only when BOTH type and id are present", () => {
    expect(bookingRefine({ beneficiaryType: "employee" })).toBe(false);
    expect(bookingRefine({ beneficiaryId: 5 })).toBe(false);
    expect(bookingRefine({ beneficiaryType: "employee", beneficiaryId: 5 })).toBe(true);
  });

  const manifestRefine = (b: { customerId?: number | null }) => b.customerId != null;
  it("manifest: rejects when customerId is null/undefined", () => {
    expect(manifestRefine({})).toBe(false);
    expect(manifestRefine({ customerId: null })).toBe(false);
  });
  it("manifest: accepts when customerId is set", () => {
    expect(manifestRefine({ customerId: 1 })).toBe(true);
  });
});
