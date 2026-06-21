import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// TA-T18-UX-AUDIT-01 · UX-05 — توحيد ROUTE_TYPES في مصدر واحد بدل 3 نسخ
// حرفية متطابقة (نموذج الإنشاء + محرّر المقاطع + استبيان سياق العمرة).

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const read = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const SHARED = "lib/transport-constants.ts";
// #1812 audit fix — transport-booking-create.tsx no longer renders the
// routeType select (it moved to the canonical UmrahContextQuestionnaire),
// so it's no longer a ROUTE_TYPES consumer. The editor + questionnaire remain.
const CONSUMERS = [
  "components/shared/multi-leg-booking-editor.tsx",
  "components/shared/umrah-context-questionnaire.tsx",
];

describe("UX-05 — ROUTE_TYPES مصدر واحد", () => {
  it("الملف المشترك يصدّر ROUTE_TYPES بالقيم السبع", () => {
    expect(existsSync(join(spaSrc, SHARED))).toBe(true);
    const src = read(SHARED);
    expect(src).toMatch(/export const ROUTE_TYPES/);
    for (const v of [
      "airport_to_makkah", "makkah_to_madinah", "madinah_to_airport",
      "makkah_local", "madinah_local", "ziyarah", "custom",
    ]) {
      expect(src, `route ${v} missing`).toContain(v);
    }
  });

  it("المستهلكون يستوردونه ولا يعرّفونه محليًا", () => {
    for (const f of CONSUMERS) {
      const src = read(f);
      expect(src, `${f} لا يستورد المصدر المشترك`).toMatch(
        /import \{ ROUTE_TYPES \} from "@\/lib\/transport-constants"/,
      );
      expect(src, `${f} ما زال يعرّف ROUTE_TYPES محليًا`).not.toMatch(
        /const ROUTE_TYPES\s*[:=]/,
      );
    }
  });
});
