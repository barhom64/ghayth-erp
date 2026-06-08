import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — two concrete fixes from the user's audit:
//
// 1. Booking-create form must integrate with umrah groups instead of
//    forcing the operator to remember a group ID. A picker reads
//    /transport/integration/linked-sources, presents the available
//    umrah groups, and on select auto-fills passenger count + customer
//    name + flips bookingSource = 'umrah_group' so audit trail shows
//    the link.
//
// 2. AssignmentSuggestDialog must SURFACE why candidates failed instead
//    of showing "no match" when actually the engine returned 50
//    blocked candidates. The new "dominant blockers" panel aggregates
//    the top 5 blocker reasons by count.

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const PICKER = readSpa("components/shared/umrah-group-picker.tsx");
const BOOKING_CREATE = readSpa("pages/fleet/transport-booking-create.tsx");
const DIALOG = readSpa("components/shared/assignment-suggest-dialog.tsx");

describe("#1812 — umrah group picker", () => {
  it("picker file exists", () => {
    expect(existsSync(join(spaSrc, "components/shared/umrah-group-picker.tsx"))).toBe(true);
  });

  it("reads from /transport/integration/linked-sources (60-day window)", () => {
    expect(PICKER).toMatch(/\/transport\/integration\/linked-sources\?fromDate=/);
    expect(PICKER).toMatch(/60 \* 86_400_000/);
  });

  it("filters by nuskGroupNumber + name", () => {
    expect(PICKER).toMatch(/nuskGroupNumber\.toLowerCase\(\)\.includes/);
    expect(PICKER).toMatch(/g\.name[\s\S]{0,40}\.includes/);
  });

  it("color-codes groups: green if linked, warning if no linked bookings", () => {
    expect(PICKER).toMatch(/existingBookings > 0[\s\S]{0,300}status-success-foreground/);
    expect(PICKER).toMatch(/status-warning-foreground/);
  });

  it("Arabic-first UI", () => {
    expect(PICKER).toMatch(/اختر مجموعة عمرة/);
    expect(PICKER).toMatch(/ابحث برقم نسك أو اسم المجموعة/);
    expect(PICKER).toMatch(/معتمر/);
  });
});

describe("#1812 — booking-create wires the picker", () => {
  it("imports the UmrahGroupPicker component", () => {
    expect(BOOKING_CREATE).toContain('UmrahGroupPicker');
    expect(BOOKING_CREATE).toContain('from "@/components/shared/umrah-group-picker"');
  });

  it("renders the picker inside the isUmrah branch", () => {
    // The picker appears together with the umrahGroupId input.
    expect(BOOKING_CREATE).toMatch(/<UmrahGroupPicker[\s\S]{0,200}onSelect=/);
  });

  it("on select: fills umrahGroupId + passengerCount + customerName + source", () => {
    expect(BOOKING_CREATE).toMatch(/setUmrahGroupId\(String\(g\.id\)\)/);
    expect(BOOKING_CREATE).toMatch(/setPassengerCount\(String\(g\.mutamerCount\)\)/);
    expect(BOOKING_CREATE).toMatch(/setCustomerName\(g\.name\)/);
    expect(BOOKING_CREATE).toMatch(/setBookingSource\("umrah_group"\)/);
  });

  it("shows a confirmation toast with the group number + pax count", () => {
    expect(BOOKING_CREATE).toMatch(/تم ربط المجموعة \$\{g\.nuskGroupNumber\}/);
    expect(BOOKING_CREATE).toMatch(/تم تعبئة عدد الركاب تلقائياً/);
  });

  it("shows an audit-trail hint when a group is linked", () => {
    expect(BOOKING_CREATE).toMatch(/أي تعديل على عدد الركاب موثّق في سجل التدقيق/);
  });
});

describe("#1812 — suggest-assignment dominant-blockers panel", () => {
  it("aggregates blocker reasons when ALL candidates are blocked", () => {
    expect(DIALOG).toMatch(/candidates\.every\(\(c\) => c\.blockers\.length > 0\)/);
    expect(DIALOG).toMatch(/جميع المرشحين البالغ عددهم/);
  });

  it("normalises blocker strings before counting (numeric values → 'N')", () => {
    expect(DIALOG).toMatch(/replace\(\/\\d\+\(\\\.\\d\+\)\?\/g, "N"\)/);
  });

  it("shows the top 5 dominant blockers ranked by count", () => {
    expect(DIALOG).toMatch(/\.sort\(\(a, b\) => b\[1\] - a\[1\]\)/);
    expect(DIALOG).toMatch(/\.slice\(0, 5\)/);
  });

  it("hints to the operator which axes to investigate", () => {
    expect(DIALOG).toMatch(/راحة السائقين/);
    expect(DIALOG).toMatch(/التعارضات الزمنية/);
    expect(DIALOG).toMatch(/اتفاق العميل/);
  });
});
