import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Transport UX gaps — follow-up to batch 1 (#2393): the two same-kind
 * ("على شاكلتها") spots deferred there, now closed.
 *   (A) booking-detail line editor uses the unified DateField (not native
 *       datetime-local) — same as the multi-leg editor.
 *   (B) the PRINTED booking confirmation shows the LINKED customer (master
 *       data), matching the on-screen confirmation (#2393).
 */
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const apiSrc = join(import.meta.dirname!, "../../src");
const DETAIL = readFileSync(join(spaSrc, "pages/fleet/transport-booking-detail.tsx"), "utf8");
const LOADER = readFileSync(join(apiSrc, "lib/print/dataLoader.ts"), "utf8");

describe("transport UX follow-up — A: booking-detail line dates unified", () => {
  it("line editor uses DateField mode=datetime, not native datetime-local", () => {
    expect(DETAIL).toMatch(/import \{ DateField \} from "@\/components\/shared\/form-field-wrapper"/);
    expect(DETAIL).toMatch(/<DateField[\s\S]{0,80}mode="datetime"[\s\S]{0,120}scheduledPickupAt/);
    expect(DETAIL).not.toMatch(/type="datetime-local"/);
  });
});

describe("transport UX follow-up — B: printed confirmation uses linked customer", () => {
  it("the confirmation print loader joins clients (soft-delete-safe) + prefers the linked name", () => {
    const i = LOADER.indexOf("async function loadTransportBookingConfirmation");
    const block = LOADER.slice(i, i + 1200);
    expect(block).toMatch(/LEFT JOIN clients c ON c\.id = b\."customerId"[\s\S]{0,90}c\."deletedAt" IS NULL/);
    expect(block).toMatch(/linkedCustomerName/);
    expect(block).toMatch(/booking\.customerName = booking\.linkedCustomerName/);
  });
});
