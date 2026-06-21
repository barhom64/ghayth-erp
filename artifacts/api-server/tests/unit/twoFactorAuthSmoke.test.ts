import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2712 الدفعة 1أ — تثبيت ربط نقاط المصادقة الثنائية في auth.ts.
 * يقين الخوارزمية (RFC 6238) مغطّى في totp.test.ts؛ هنا نثبّت أن النقاط
 * موصولة بشكل آمن: السرّ يُخزَّن مشفّرًا، التفعيل يتحقق من الرمز ويُصدر رموزًا
 * احتياطية، التعطيل يتطلب كلمة المرور، وكلها محميّة بـauthMiddleware.
 * اختبار ثابت (يقرأ المصدر) — لا DB ولا تغيير لمسار /login (دفعة 1أ).
 */
const AUTH = readFileSync(join(import.meta.dirname!, "../../src/routes/auth.ts"), "utf8");

function handler(method: "post" | "get", path: string): string {
  const re = new RegExp(
    `router\\.${method}\\("${path.replace(/\//g, "\\/")}"[\\s\\S]*?\\n\\}\\);`,
  );
  const m = AUTH.match(re);
  if (!m) throw new Error(`handler ${method.toUpperCase()} ${path} not found`);
  return m[0];
}

describe("2FA — imports + safe primitives", () => {
  it("imports TOTP helpers + field encryption (no plaintext secret storage)", () => {
    expect(AUTH).toMatch(/from "\.\.\/lib\/totp\.js"/);
    expect(AUTH).toMatch(/import \{ encryptField, decryptField \} from "\.\.\/lib\/fieldEncryption\.js"/);
    expect(AUTH).toMatch(/import QRCode from "qrcode"/);
  });
});

describe("POST /2fa/setup", () => {
  const h = handler("post", "/2fa/setup");
  it("is protected by authMiddleware + per-user limiter", () => {
    expect(h).toMatch(/authMiddleware, authedUserLimiter/);
  });
  it("rejects re-setup when 2FA already enabled", () => {
    expect(h).toMatch(/twoFactorEnabled[\s\S]*?ConflictError\("المصادقة الثنائية مفعّلة بالفعل"/);
  });
  it("stores the secret ENCRYPTED (never plaintext) and not-yet-enabled", () => {
    expect(h).toMatch(/"twoFactorSecret"=\$1, "twoFactorEnabled"=FALSE/);
    expect(h).toMatch(/encryptField\(secret\)/);
  });
  it("returns a QR data URL for authenticator enrollment", () => {
    expect(h).toMatch(/QRCode\.toDataURL\(otpauthUrl\)/);
    expect(h).toMatch(/res\.json\(\{ secret, otpauthUrl, qrDataUrl \}\)/);
  });
});

describe("POST /2fa/enable", () => {
  const h = handler("post", "/2fa/enable");
  it("verifies the first TOTP token against the decrypted secret", () => {
    expect(h).toMatch(/decryptField\(user\.twoFactorSecret\)/);
    expect(h).toMatch(/verifyTOTP\(secret, token\)[\s\S]*?ForbiddenError\("رمز التحقق غير صحيح"/);
  });
  it("on success enables + stamps enrolledAt + stores HASHED backup codes", () => {
    expect(h).toMatch(/hashBackupCode/);
    expect(h).toMatch(/"twoFactorEnabled"=TRUE, "twoFactorEnrolledAt"=NOW\(\), "twoFactorBackupCodes"=\$1/);
  });
  it("returns the plaintext backup codes ONCE + writes an audit log", () => {
    expect(h).toMatch(/res\.json\(\{ success: true, backupCodes,/);
    expect(h).toMatch(/createAuditLog\([\s\S]*?2fa_enabled/);
  });
});

describe("POST /2fa/disable", () => {
  const h = handler("post", "/2fa/disable");
  it("requires the account password", () => {
    expect(h).toMatch(/verifyPassword\(password, user\.passwordHash\)[\s\S]*?ForbiddenError\("كلمة المرور غير صحيحة"/);
  });
  it("also requires a current token when 2FA is active (hijacked-session defense)", () => {
    expect(h).toMatch(/if \(user\.twoFactorEnabled && user\.twoFactorSecret\)/);
    expect(h).toMatch(/verifyTOTP\(decryptField\(user\.twoFactorSecret\), token\)/);
  });
  it("clears every 2FA column on disable", () => {
    expect(h).toMatch(/"twoFactorEnabled"=FALSE, "twoFactorSecret"=NULL, "twoFactorBackupCodes"=NULL, "twoFactorEnrolledAt"=NULL/);
  });
});

describe("GET /2fa/status", () => {
  const h = handler("get", "/2fa/status");
  it("reports enabled + remaining unused backup codes (no secret leaked)", () => {
    expect(h).toMatch(/backupCodesRemaining: remaining/);
    expect(h).not.toMatch(/twoFactorSecret/); // status must never read/return the secret
  });
});

describe("login flow enforces 2FA when enabled (batch 1b)", () => {
  it("/login branches on twoFactorEnabled → returns a pending token, NOT a session", () => {
    const login = handler("post", "/login");
    expect(login).toMatch(/authenticateUserByPassword\(email, password\)/);
    expect(login).toMatch(/SELECT "twoFactorEnabled" FROM users/);
    expect(login).toMatch(/signPending2faToken\(/);
    expect(login).toMatch(/res\.json\(\{ twoFactorRequired: true, pendingToken \}\)/);
  });
  it("non-2FA users still get a full session immediately (unchanged path)", () => {
    expect(handler("post", "/login")).toMatch(/createUserSession\(/);
  });
});
