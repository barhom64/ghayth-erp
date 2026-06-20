// ─── employeeOnboarding — رموز الاستكمال الذاتي للموظف ───────────────────────
// الموظف المُضاف سريعًا لا يملك حساب مستخدم بعد، فلا يصلح auth_tokens (المرتبط
// بـ userId). هذا الرمز مرتبط بالموظف مباشرة، أحادي الاستخدام ومنتهٍ، يفتح صفحة
// عامة لاستكمال البيانات الشخصية فقط. لا يمنح أي صلاحية دخول للنظام.

import { randomBytes } from "node:crypto";
import { rawQuery } from "./rawdb.js";
import { hashAuthToken, PublicBaseUrlMissingError } from "./authTokens.js";
import { config } from "./config.js";

/** صلاحية رابط الاستكمال الذاتي (بالدقائق) — 7 أيام. */
export const ONBOARDING_TOKEN_TTL_MINUTES = 7 * 24 * 60;

export interface IssuedOnboardingToken {
  url: string;
  rawToken: string;
  expiresAt: Date;
}

/**
 * يُصدِر رمز استكمال ذاتي للموظف ويبني رابطه المطلق. يُبطِل أي رمز معلّق سابق
 * لنفس الموظف (رابط واحد فعّال). يرمي PublicBaseUrlMissingError إن لم يُضبط
 * PUBLIC_BASE_URL — فيُسطح المتصل رسالة عربية بدل إرسال رابط مكسور.
 */
export async function issueOnboardingToken(params: {
  companyId: number;
  employeeId: number;
  createdBy?: number | null;
}): Promise<IssuedOnboardingToken> {
  const base = config.publicBaseUrl;
  if (!base) throw new PublicBaseUrlMissingError();

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashAuthToken(rawToken);
  const expiresAt = new Date(Date.now() + ONBOARDING_TOKEN_TTL_MINUTES * 60 * 1000);

  // أبطِل المعلّق السابق ثم أدرج الجديد.
  await rawQuery(
    `UPDATE employee_onboarding_tokens SET status = 'revoked'
      WHERE "employeeId" = $1 AND status = 'pending'`,
    [params.employeeId],
  );
  await rawQuery(
    `INSERT INTO employee_onboarding_tokens
       ("companyId","employeeId","tokenHash",status,"expiresAt","createdBy")
     VALUES ($1,$2,$3,'pending',$4,$5)`,
    [params.companyId, params.employeeId, tokenHash, expiresAt.toISOString(), params.createdBy ?? null],
  );

  const trimmed = base.replace(/\/+$/, "");
  const url = `${trimmed}/onboarding?token=${encodeURIComponent(rawToken)}`;
  return { url, rawToken, expiresAt };
}

export interface VerifiedOnboardingToken {
  tokenId: number;
  companyId: number;
  employeeId: number;
}

/**
 * يتحقّق من رمز خام (بلا استهلاك): معلّق، غير منتهٍ، غير مستخدَم. يُرجِع هوية
 * الموظف أو null. الاستهلاك (الوسم used) يتم عند الإرسال الناجح فقط.
 */
export async function verifyOnboardingToken(rawToken: string): Promise<VerifiedOnboardingToken | null> {
  if (!rawToken) return null;
  const tokenHash = hashAuthToken(rawToken);
  const rows = await rawQuery<{ id: number; companyId: number; employeeId: number }>(
    `SELECT id, "companyId", "employeeId"
       FROM employee_onboarding_tokens
      WHERE "tokenHash" = $1 AND status = 'pending' AND "expiresAt" > NOW()
      LIMIT 1`,
    [tokenHash],
  );
  if (rows.length === 0) return null;
  return { tokenId: rows[0].id, companyId: rows[0].companyId, employeeId: rows[0].employeeId };
}

/** يَسِم الرمز مستخدَمًا (بعد الإرسال الناجح). */
export async function markOnboardingTokenUsed(tokenId: number): Promise<void> {
  await rawQuery(
    `UPDATE employee_onboarding_tokens SET status = 'used', "usedAt" = NOW()
      WHERE id = $1 AND status = 'pending'`,
    [tokenId],
  );
}
