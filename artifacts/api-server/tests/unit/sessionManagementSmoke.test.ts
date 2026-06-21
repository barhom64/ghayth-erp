import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2712 (الدفعة 2) — إدارة الجلسات: عرض/إنهاء جلسات المستخدم نفسه فقط.
 * مبنية على refresh_tokens (مخزن الجلسات الفعلي الذي يكتبه createUserSession).
 * تثبيت ربط آمن: ownership عبر userId، تمييز الجلسة الحالية بكوكي التحديث.
 * اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const AUTH = readFileSync(join(import.meta.dirname!, "../../src/routes/auth.ts"), "utf8");

function handler(method: "post" | "get", path: string): string {
  const re = new RegExp(`router\\.${method}\\("${path.replace(/[/:]/g, (c) => "\\" + c)}"[\\s\\S]*?\\n\\}\\);`);
  const m = AUTH.match(re);
  if (!m) throw new Error(`handler ${method.toUpperCase()} ${path} not found`);
  return m[0];
}

describe("GET /sessions — list active devices", () => {
  const h = handler("get", "/sessions");
  it("is authenticated (authMiddleware + per-user limiter)", () => {
    expect(h).toMatch(/authMiddleware, authedUserLimiter/);
  });
  it("lists only the caller's own, non-revoked, non-expired sessions", () => {
    expect(h).toMatch(/FROM refresh_tokens\s+WHERE "userId"=\$1 AND "revokedAt" IS NULL AND "expiresAt" > NOW\(\)/);
  });
  it("flags the current session by matching the refresh cookie", () => {
    expect(h).toMatch(/req\.cookies\?\.erp_refresh/);
    expect(h).toMatch(/current: r\.id === currentId/);
  });
});

describe("POST /sessions/:id/revoke — terminate one session (ownership-scoped)", () => {
  const h = handler("post", "/sessions/:id/revoke");
  it("only revokes a row that belongs to the caller", () => {
    expect(h).toMatch(/UPDATE refresh_tokens SET "revokedAt"=NOW\(\) WHERE id=\$1 AND "userId"=\$2 AND "revokedAt" IS NULL/);
  });
  it("404s when nothing was revoked + writes an audit log", () => {
    expect(h).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
    expect(h).toMatch(/session_revoked/);
  });
});

describe("POST /sessions/revoke-others — keep current, drop the rest", () => {
  const h = handler("post", "/sessions/revoke-others");
  it("revokes the caller's other sessions, never the current refresh token", () => {
    expect(h).toMatch(/WHERE "userId"=\$1 AND "revokedAt" IS NULL AND \(\$2::text IS NULL OR token <> \$2\)/);
    expect(h).toMatch(/sessions_revoked_others/);
  });
});
