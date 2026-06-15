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
// #1812 audit fix — the inline umrah picker on booking-create was a
// duplicate of the UmrahContextQuestionnaire. The duplicate inline
// form was removed; these assertions now target the canonical
// questionnaire component instead.
const QUESTIONNAIRE = readSpa("components/shared/umrah-context-questionnaire.tsx");

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

describe("#1812 — booking-create wires the umrah picker via the questionnaire (audit-fixed)", () => {
  it("UmrahContextQuestionnaire is imported by booking-create + carries UmrahGroupPicker", () => {
    expect(BOOKING_CREATE).toContain("UmrahContextQuestionnaire");
    expect(QUESTIONNAIRE).toContain("UmrahGroupPicker");
  });

  it("questionnaire renders the picker via trigger prop", () => {
    expect(QUESTIONNAIRE).toMatch(/<UmrahGroupPicker[\s\S]{0,400}trigger=/);
  });

  it("on select: fills umrahGroupId + passengerCount + customerName + source", () => {
    expect(QUESTIONNAIRE).toMatch(/setUmrahGroupId\(String\(g\.id\)\)/);
    expect(QUESTIONNAIRE).toMatch(/setPassengerCount\(String\(g\.mutamerCount\)\)/);
    expect(QUESTIONNAIRE).toMatch(/setCustomerName\(g\.name\)/);
    expect(QUESTIONNAIRE).toMatch(/setBookingSource\("umrah_group"\)/);
  });

  it("audit-fix: the old inline umrah block is gone (no duplicate UX)", () => {
    // The audit found booking-create rendered BOTH the questionnaire AND
    // an inline `{isUmrah && <Input id="umrahGroupId" />}` form — operator
    // filled the same data twice. The inline block must stay deleted.
    expect(BOOKING_CREATE).not.toMatch(/<Input\s+id="umrahGroupId"/);
    expect(BOOKING_CREATE).not.toMatch(/<Input\s+id="flightNumber"/);
    expect(BOOKING_CREATE).not.toMatch(/<Input\s+id="hotelName"/);
  });

  it("audit-trail hint visible — either via inline note or via the questionnaire's auto-fill toast", () => {
    // After the inline duplicate removal, the operator still gets the
    // audit-trail cue from the picker's confirmation toast OR via the
    // form's umrah panel hint (both paths satisfy this assertion).
    const hasHint =
      /أي تعديل على عدد الركاب موثّق في سجل التدقيق/.test(BOOKING_CREATE) ||
      /أي تعديل على عدد الركاب موثّق في سجل التدقيق/.test(QUESTIONNAIRE);
    expect(hasHint, "audit-trail hint must appear in booking-create OR the questionnaire").toBe(true);
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
