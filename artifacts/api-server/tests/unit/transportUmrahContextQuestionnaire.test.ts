import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — closes the user's gap #2:
//   "تكامل العمرة ناقص. من الصورة لا يوجد سؤال:
//      هل النقل من مجموعة عمرة؟
//      هل من برنامج عمرة؟
//      هل من رحلة جوية؟
//      هل من فندق؟
//    وهذا كان من أهم متطلبات #1812."

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const PANEL  = readFileSync(join(spaSrc, "components/shared/umrah-context-questionnaire.tsx"), "utf8");
const CREATE = readFileSync(join(spaSrc, "pages/fleet/transport-booking-create.tsx"), "utf8");

describe("#1812 — UmrahContextQuestionnaire component (gap #2)", () => {
  it("file exists", () => {
    expect(existsSync(join(spaSrc, "components/shared/umrah-context-questionnaire.tsx"))).toBe(true);
  });

  it("renders only when active (passenger_umrah service type)", () => {
    expect(PANEL).toMatch(/if \(!props\.active\) return null/);
  });

  it("asks all 4 user-specified questions explicitly", () => {
    // Question 1 — group from system
    expect(PANEL).toMatch(/١\.\s*هل النقل من مجموعة عمرة موجودة في النظام/);
    // Question 2 — flight
    expect(PANEL).toMatch(/٢\.\s*هل النقل مرتبط برحلة جوية/);
    // Question 3 — hotel
    expect(PANEL).toMatch(/٣\.\s*هل وجهة النقل فندق محدد/);
    // Question 4 — supervisor
    expect(PANEL).toMatch(/٤\.\s*هل يوجد مشرف للمجموعة على متن الرحلة/);
  });

  it("integrates UmrahGroupPicker for question 1 + auto-fills 3 fields", () => {
    expect(PANEL).toContain("UmrahGroupPicker");
    expect(PANEL).toMatch(/setUmrahGroupId\(String\(g\.id\)\)/);
    expect(PANEL).toMatch(/setPassengerCount\(String\(g\.mutamerCount\)\)/);
    expect(PANEL).toMatch(/setBookingSource\("umrah_group"\)/);
  });

  it("uses status icons to show which questions are answered", () => {
    // CheckCircle2 when answered, AlertCircle when pending.
    expect(PANEL).toContain("CheckCircle2");
    expect(PANEL).toContain("AlertCircle");
    expect(PANEL).toMatch(/hasGroup[\s\S]{0,200}CheckCircle2/);
    expect(PANEL).toMatch(/hasFlight[\s\S]{0,200}CheckCircle2/);
    expect(PANEL).toMatch(/hasHotel[\s\S]{0,200}CheckCircle2/);
    expect(PANEL).toMatch(/hasSupervisor[\s\S]{0,200}CheckCircle2/);
  });

  it("tracks a completion summary (N/4)", () => {
    expect(PANEL).toMatch(/اكتمل:\s*\{\[hasGroup,\s*hasFlight,\s*hasHotel,\s*hasSupervisor\]\.filter\(Boolean\)\.length\}\s*\/ 4/);
    expect(PANEL).toMatch(/جميع المعلومات السياقية مكتملة/);
  });

  it("RTL-friendly Arabic placeholders for flight + supervisor inputs", () => {
    expect(PANEL).toMatch(/SV1234.*EK803/);
    expect(PANEL).toMatch(/فندق مكة هيلتون/);
  });
});

describe("#1812 — booking-create wires the umrah questionnaire", () => {
  it("imports the component", () => {
    expect(CREATE).toContain("UmrahContextQuestionnaire");
    expect(CREATE).toContain('from "@/components/shared/umrah-context-questionnaire"');
  });

  it("renders the panel with active={isUmrah} + all 10 controlled props", () => {
    expect(CREATE).toMatch(/<UmrahContextQuestionnaire/);
    expect(CREATE).toMatch(/active=\{isUmrah\}/);
    // The 10 controlled props (5 values + 5 setters from existing state).
    for (const prop of [
      "umrahGroupId=", "flightNumber=", "hotelName=",
      "supervisorName=", "supervisorPhone=", "routeType=",
      "setUmrahGroupId=", "setPassengerCount=", "setFlightNumber=", "setHotelName=",
    ]) {
      expect(CREATE, `prop ${prop} missing on UmrahContextQuestionnaire`).toContain(prop);
    }
  });
});
