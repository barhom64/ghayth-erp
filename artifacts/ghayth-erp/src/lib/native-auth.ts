// ════════════════════════════════════════════════════════════════════════════
// مصادقة التطبيق الأصلي (Bearer) — الجسر بين الويب والقشرة الأصلية.
//
// لماذا: كوكيز الويب `sameSite: "strict"` + httpOnly لا تُرسَل عبر-المصدر من
// WebView الأصلي (الحزمة من https://localhost، الخادم من hr.door.sa). الباك
// يوفّر مسار Bearer كاملاً أصلاً: POST /auth/mobile/login يُرجع التوكنات في
// الجسم، /auth/mobile/refresh يدوّرها، و authMiddleware يقبل Authorization:
// Bearer. هذه الوحدة تخزّن التوكن وتزوّد apiFetch به في الأصلي فقط.
//
// التخزين: localStorage — متاح ومتزامن ودائم في WebView الأصلي (لا يحتاج
// plugin)، ومعزول لكل تطبيق. على الويب هذه الدوال خاملة (isNativeAuth=false)،
// فلا تغيير في سلوك المتصفح (يبقى على الكوكيز).
// ════════════════════════════════════════════════════════════════════════════

const ACCESS_KEY = "erp_native_access";
const REFRESH_KEY = "erp_native_refresh";

/** هل نعمل داخل تطبيق Capacitor أصلي (لا متصفح عادي)؟ */
export function isNativeAuth(): boolean {
  const cap = (globalThis as any)?.Capacitor;
  return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

export function getNativeAccessToken(): string | null {
  try { return localStorage.getItem(ACCESS_KEY); } catch { return null; }
}
export function getNativeRefreshToken(): string | null {
  try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
}
export function setNativeTokens(accessToken: string, refreshToken: string): void {
  try {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  } catch { /* تخزين غير متاح — غير قاتل */ }
}
export function clearNativeTokens(): void {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch { /* ignore */ }
}

/**
 * يدوّر زوج التوكن عبر /auth/mobile/refresh باستخدام refresh المخزَّن.
 * يرجّع true عند النجاح (التوكنات حُدّثت)، false عند الفشل (تُمسح الجلسة).
 * يستقبل `apiBase` كي لا تنشأ تبعية دائرية مع api.ts.
 */
export async function nativeRefresh(apiBase: string): Promise<boolean> {
  const refreshToken = getNativeRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${apiBase}/api/auth/mobile/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) { clearNativeTokens(); return false; }
    const data = await res.json();
    if (!data?.accessToken || !data?.refreshToken) { clearNativeTokens(); return false; }
    setNativeTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}
