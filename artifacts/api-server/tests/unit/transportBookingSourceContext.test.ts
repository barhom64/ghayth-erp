import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — closes the user's concern:
//   "النظام لا يستفيد بما يكفي من العمرة / CRM / العقود / المشاريع /
//    الأوقاف / التقويم"
//
// The booking-detail page now displays an at-a-glance source-context
// panel pulling the upstream entity (umrah group dates/supervisor,
// customer phone/email, contract dates/status, project code/status)
// so the operator doesn't need to click through other modules.

const apiSrc = join(import.meta.dirname!, "../../src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const ROUTER = readApi("routes/transport-bookings.ts");
const PANEL  = readSpa("components/shared/booking-source-context-panel.tsx");
const DETAIL = readSpa("pages/fleet/transport-booking-detail.tsx");

describe("#1812 — backend loadSourceContext resolver", () => {
  it("declared in the bookings router", () => {
    expect(ROUTER).toContain("async function loadSourceContext");
    expect(ROUTER).toMatch(/sourceContext = await loadSourceContext/);
  });

  it("returns null for manual_entry (no upstream to resolve)", () => {
    expect(ROUTER).toMatch(/source === "manual_entry"[\s\S]{0,40}return null/);
  });

  it("resolves umrah_group → name + groupNumber + mutamerCount + dates", () => {
    const block = ROUTER.slice(ROUTER.indexOf("async function loadSourceContext"));
    expect(block).toMatch(/FROM umrah_groups[\s\S]{0,400}umrahGroupId/);
    expect(block).toContain("mutamerCount");
    expect(block).toContain("arrivalDate");
    expect(block).toContain("departureDate");
    expect(block).toContain("umrahSupervisor");
  });

  it("resolves customer_request / contract_schedule → clients (with phone/email)", () => {
    const block = ROUTER.slice(ROUTER.indexOf("async function loadSourceContext"));
    expect(block).toMatch(/FROM clients[\s\S]{0,160}customerId/);
    expect(block).toContain("customerType");
  });

  it("resolves contract_schedule → contract (with start/end dates)", () => {
    const block = ROUTER.slice(ROUTER.indexOf("async function loadSourceContext"));
    expect(block).toMatch(/FROM contracts[\s\S]{0,200}contractId/);
    expect(block).toContain("contractNumber");
  });

  it("response includes sourceContext alongside booking/lines/dispatch", () => {
    const block = ROUTER.slice(ROUTER.indexOf('"/transport/bookings/:id"'));
    // #2475-follow-up — the GET response also carries the resolved cancelPolicy
    // (for the SPA's policy-aware cancel confirmation); pin updated to match.
    // شريحة 1 — والآن tripEvents (الجدول الزمني لوقائع الرحلة) كذلك.
    expect(block).toMatch(/res\.json\(maskFields\(req, \{ data: \{ \.\.\.booking, lines, dispatchOrders, tripEvents, deductions, deductionRates, sourceContext, cancelPolicy \} \}\)\)/);
  });

  it("loader is defensive — wraps each query in catch", () => {
    const block = ROUTER.slice(ROUTER.indexOf("async function loadSourceContext"));
    const catchCount = (block.match(/\.catch\(\(\) => \[null\]\)/g) ?? []).length;
    expect(catchCount, "each query should swallow errors").toBeGreaterThanOrEqual(3);
  });
});

describe("#1812 — BookingSourceContextPanel SPA component", () => {
  it("file exists", () => {
    expect(existsSync(join(spaSrc, "components/shared/booking-source-context-panel.tsx"))).toBe(true);
  });

  it("renders nothing when sourceContext is null (manual_entry case)", () => {
    expect(PANEL).toMatch(/if \(!sourceContext \|\| !sourceContext\.entity\) return null/);
  });

  it("Arabic source badges + icons for all 6 sources", () => {
    for (const [src, label] of [
      ["umrah_group", "مجموعة عمرة"],
      ["customer_request", "طلب عميل"],
      ["contract_schedule", "جدول عقد"],
      ["recurring_schedule", "جدول متكرر"],
      ["import_excel", "استيراد"],
      ["api_integration", "تكامل API"],
    ]) {
      // Map key is bare-identifier syntax (`import_excel: { ... }`).
      expect(PANEL, `source ${src} missing`).toMatch(new RegExp(`\\b${src}:\\s*\\{`));
      expect(PANEL, `label ${label} missing`).toContain(label);
    }
  });

  it("umrah_group panel surfaces 7 contextual fields", () => {
    for (const f of [
      "رقم النسك", "عدد المعتمرين", "مدة البرنامج",
      "مشرف المجموعة", "تاريخ الوصول", "تاريخ المغادرة",
      "اسم المجموعة",
    ]) {
      expect(PANEL, `field ${f} missing`).toContain(f);
    }
  });

  it("customer/contract branch surfaces phone + customer type + contract status", () => {
    expect(PANEL).toContain("الهاتف");
    expect(PANEL).toContain("النوع");
    expect(PANEL).toContain("رقم العقد");
    expect(PANEL).toContain("حالة العقد");
    expect(PANEL).toContain("سريان من");
    expect(PANEL).toContain("سريان إلى");
  });

  it("deep-links back to the source module (umrah group / client)", () => {
    expect(PANEL).toMatch(/href=\{`\/umrah\/groups\/\$\{entity\.id\}`\}/);
    expect(PANEL).toMatch(/href=\{`\/clients\/\$\{[\s\S]+?\.id\}`\}/);
    expect(PANEL).toContain("فتح المجموعة");
    expect(PANEL).toContain("فتح ملف العميل");
  });
});

describe("#1812 — booking-detail wires the source context panel", () => {
  it("imports the component", () => {
    expect(DETAIL).toContain("BookingSourceContextPanel");
    expect(DETAIL).toContain('from "@/components/shared/booking-source-context-panel"');
  });

  it("BookingDetail interface gains sourceContext field", () => {
    expect(DETAIL).toMatch(/sourceContext:\s*\{[\s\S]{0,200}source:\s*string/);
  });

  it("renders the panel inside the PageShell body", () => {
    expect(DETAIL).toMatch(/<BookingSourceContextPanel sourceContext=/);
  });
});
