import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2712 (الدفعة 3) — تنبيه الدخول من جهاز جديد، مركزيًّا في createUserSession
 * (يغطّي كل مداخل الدخول بلا تكرار). الكشف بمفتاح User-Agent قبل الإدراج،
 * والأثر (Audit + Event) بلا هجرة. البريد best-effort يصمت بلا قالب.
 * اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const SESSION = readFileSync(join(import.meta.dirname!, "../../src/lib/authSession.ts"), "utf8");

const createFn = (() => {
  const m = SESSION.match(/export async function createUserSession\([\s\S]*?\n\}/);
  if (!m) throw new Error("createUserSession not found");
  return m[0];
})();

describe("createUserSession — new-device detection (before insert)", () => {
  it("probes by User-Agent (device signature), keyed to the user", () => {
    expect(createFn).toMatch(/EXISTS\(SELECT 1 FROM refresh_tokens rt WHERE rt\."userId"=\$1 AND rt\."userAgent"=\$2\) AS seen/);
  });
  it("detects BEFORE inserting the new row (so the new session isn't its own 'prior')", () => {
    const probeIdx = createFn.indexOf("AS seen");
    const insertIdx = createFn.indexOf("INSERT INTO refresh_tokens");
    expect(probeIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(probeIdx);
  });
  it("fires the alert best-effort (void) so it never blocks the session", () => {
    expect(createFn).toMatch(/void alertNewDeviceLogin\(/);
  });
});

describe("alertNewDeviceLogin — migration-free trace + graceful email", () => {
  it("writes an audit trail + emits a distinct event (no migration needed)", () => {
    expect(SESSION).toMatch(/action: "login_new_device"/);
    expect(SESSION).toMatch(/action: "auth\.login\.new_device"/);
  });
  it("attempts a best-effort email via the existing auth-email path", () => {
    expect(SESSION).toMatch(/templateKey: "auth\.new_device_login\.email"/);
  });
  it("is wrapped so a notification failure never breaks login", () => {
    expect(SESSION).toMatch(/\[authSession\] new-device login alert failed \(non-blocking\)/);
  });
});
