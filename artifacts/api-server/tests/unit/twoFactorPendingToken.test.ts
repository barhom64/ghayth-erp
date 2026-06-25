import { describe, it, expect } from "vitest";
import {
  signPending2faToken,
  verifyPending2faToken,
  verifyToken,
  signToken,
} from "../../src/lib/auth.js";

/**
 * #2712 (1ب) — الخاصية الأمنية الحرجة للرمز المؤقّت.
 * الرمز المؤقّت (نصف-مُصادَق) يجب ألّا يصلح أبدًا كرمز جلسة، وإلا صار تجاوزًا
 * للمصادقة الثنائية. هنا نثبت ذلك سلوكيًا (لا قراءة مصدر): verifyToken — الذي
 * يعتمده authMiddleware — يرفض الرمز المؤقّت لأنه موقَّع بمفتاح مشتق مختلف.
 */
const pending = { userId: 7, employeeId: 3, assignmentId: 11, role: "manager" };

describe("pending-2FA token round-trip", () => {
  it("verifyPending2faToken decodes what signPending2faToken issued, with p2fa flag", () => {
    const t = signPending2faToken(pending);
    const decoded = verifyPending2faToken(t);
    expect(decoded.userId).toBe(7);
    expect(decoded.employeeId).toBe(3);
    expect(decoded.assignmentId).toBe(11);
    expect(decoded.role).toBe("manager");
    expect(decoded.p2fa).toBe(true);
  });
});

describe("pending-2FA token is NOT a session token (the anti-bypass property)", () => {
  it("verifyToken (used by authMiddleware) REJECTS a pending token", () => {
    const t = signPending2faToken(pending);
    expect(() => verifyToken(t)).toThrow(); // different signing key → invalid signature
  });
  it("a real session token is NOT accepted as a pending token", () => {
    const session = signToken({ userId: 7, assignmentId: 11, role: "manager" });
    expect(() => verifyPending2faToken(session)).toThrow();
  });
  it("a tampered/garbage string is rejected by both verifiers", () => {
    expect(() => verifyPending2faToken("not.a.jwt")).toThrow();
    expect(() => verifyToken("not.a.jwt")).toThrow();
  });
});
