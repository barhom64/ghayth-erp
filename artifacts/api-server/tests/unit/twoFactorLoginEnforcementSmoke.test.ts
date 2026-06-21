import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2712 (1ب) — تثبيت ربط إنفاذ 2FA عند تسجيل الدخول في auth.ts.
 * يقين الرمز المؤقّت في twoFactorPendingToken.test.ts؛ هنا نثبّت أن:
 *  - الدخول (ويب + موبايل) يفرّع على twoFactorEnabled ويعيد رمزًا مؤقّتًا.
 *  - verify-login يتحقق من الرمز المؤقّت ثم العامل الثاني ثم يُصدر الجلسة.
 *  - الرمز الاحتياطي يُستهلك (usedAt) عند استخدامه.
 *  - سياق الجلسة يُحمّل عبر loadUserSessionContext (مصدر واحد مشترك).
 * اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const AUTH = readFileSync(join(import.meta.dirname!, "../../src/routes/auth.ts"), "utf8");

function handler(method: "post" | "get", path: string): string {
  const re = new RegExp(`router\\.${method}\\("${path.replace(/\//g, "\\/")}"[\\s\\S]*?\\n\\}\\);`);
  const m = AUTH.match(re);
  if (!m) throw new Error(`handler ${method.toUpperCase()} ${path} not found`);
  return m[0];
}

describe("imports the secure pending-token + shared session loader", () => {
  it("auth.ts imports signPending2faToken/verifyPending2faToken + loadUserSessionContext", () => {
    expect(AUTH).toMatch(/signPending2faToken, verifyPending2faToken/);
    expect(AUTH).toMatch(/loadUserSessionContext/);
  });
});

describe("POST /2fa/verify-login (web)", () => {
  const h = handler("post", "/2fa/verify-login");
  it("is rate-limited by the login limiter (public, pre-session)", () => {
    expect(h).toMatch(/router\.post\("\/2fa\/verify-login", loginLimiter,/);
  });
  it("validates the pending token, then the second factor, then mints a session", () => {
    expect(h).toMatch(/verifyPending2faToken\(pendingToken\)/);
    expect(h).toMatch(/passSecondFactor\(pending\.userId, token, backupCode\)/);
    expect(h).toMatch(/loadUserSessionContext\(pending\.userId, pending\.employeeId\)/);
    expect(h).toMatch(/createUserSession\(/);
    expect(h).toMatch(/setAccessTokenCookie\(res, session\.accessToken\)/);
  });
  it("an invalid/expired pending token is a clean 403, not a crash", () => {
    expect(h).toMatch(/catch \{ throw new ForbiddenError\("انتهت الجلسة المؤقتة/);
  });
});

describe("POST /mobile/2fa/verify-login", () => {
  const h = handler("post", "/mobile/2fa/verify-login");
  it("returns tokens in the body (no Set-Cookie) like mobile login", () => {
    expect(h).toMatch(/accessToken: session\.accessToken/);
    expect(h).toMatch(/refreshToken: session\.refreshToken/);
  });
});

describe("second-factor verification + backup-code consumption", () => {
  it("passSecondFactor accepts a TOTP code via the decrypted secret", () => {
    expect(AUTH).toMatch(/verifyTOTP\(decryptField\(u\.twoFactorSecret\), token\)/);
  });
  it("a backup code is matched by hash, must be UNUSED, and is consumed (usedAt set + persisted)", () => {
    expect(AUTH).toMatch(/hashBackupCode\(backupCode\)/);
    expect(AUTH).toMatch(/c && !c\.usedAt && c\.hash === wanted/);
    expect(AUTH).toMatch(/codes\[idx\]!\.usedAt = new Date\(\)\.toISOString\(\)/);
    expect(AUTH).toMatch(/UPDATE users SET "twoFactorBackupCodes"=\$1 WHERE id=\$2/);
  });
});
