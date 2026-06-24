// B1 + B3 — first-time setup wizard.
//
// Page is reachable at /setup. On mount it probes /api/auth/setup-state;
// if the system is already configured (any company exists), redirects
// to the login page. Otherwise renders a 4-field form that hits
// /api/auth/bootstrap-tenant atomically and routes to login on success.
//
// Deliberately minimal: the goal is to break the "fresh deploy can't
// onboard" loop (B3) by giving the operator ONE working CTA from the
// login page (B1 setup link). A real billing-aware sign-up flow ships
// when subscription integration lands.
import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";
import { useLocation } from "wouter";
import { Loader2, Building2 } from "lucide-react";

const BASE = API_BASE;

interface SetupForm {
  companyName: string;
  companyNameEn: string;
  ownerName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  branchName: string;
}

const EMPTY: SetupForm = {
  companyName: "",
  companyNameEn: "",
  ownerName: "",
  email: "",
  password: "",
  passwordConfirm: "",
  branchName: "",
};

export default function SetupPage() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<SetupForm>(EMPTY);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Guard: if the system is already set up, no business being here.
    // Redirect to login. Fail-open on probe error so a broken DB
    // doesn't trap the operator on a blank page.
    fetch(`${BASE}/api/auth/setup-state`)
      .then((r) => (r.ok ? r.json() : { needsSetup: true }))
      .then((d) => {
        if (!d.needsSetup) {
          setLocation("/");
          return;
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [setLocation]);

  const onChange = (k: keyof SetupForm) => (e: { target: { value: string } }) => {
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
  };

  const onSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.passwordConfirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    if (form.password.length < 8) {
      setError("كلمة المرور 8 أحرف على الأقل");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`${BASE}/api/auth/bootstrap-tenant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          companyName: form.companyName,
          companyNameEn: form.companyNameEn || undefined,
          ownerName: form.ownerName,
          branchName: form.branchName || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "فشل الإعداد");
        return;
      }
      setSuccess(true);
      // Redirect to login after 2 seconds so the operator sees the
      // success message.
      setTimeout(() => setLocation("/"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" data-testid="setup-success">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-status-success-surface">
            <Building2 className="h-8 w-8 text-status-success-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">تم الإعداد بنجاح</h1>
          <p className="text-gray-600 mb-4">سيتم توجيهك لتسجيل الدخول خلال لحظات…</p>
          <p className="text-sm text-gray-500">إذا لم يتم التوجيه تلقائياً، <a href="/" className="text-status-info-foreground hover:underline">اضغط هنا</a></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" data-testid="setup-form">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-status-info-surface">
            <Building2 className="h-7 w-7 text-status-info-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">إعداد النظام لأول مرة</h1>
          <p className="text-sm text-gray-600">
            أنشئ شركتك وحساب المالك للبدء. هذه الخطوة تتم مرة واحدة فقط.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" data-testid="form-setup">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم الشركة *</label>
            <input
              type="text"
              required
              data-testid="input-company-name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-status-info-foreground focus:border-transparent"
              value={form.companyName}
              onChange={onChange("companyName")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم الشركة (إنجليزي)</label>
            <input
              type="text"
              data-testid="input-company-name-en"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-status-info-foreground focus:border-transparent"
              value={form.companyNameEn}
              onChange={onChange("companyNameEn")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الفرع الرئيسي (اختياري)</label>
            <input
              type="text"
              placeholder="مثال: الفرع الرئيسي — الرياض"
              data-testid="input-branch-name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-status-info-foreground focus:border-transparent"
              value={form.branchName}
              onChange={onChange("branchName")}
            />
          </div>
          <hr className="border-gray-200" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم المالك *</label>
            <input
              type="text"
              required
              data-testid="input-owner-name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-status-info-foreground focus:border-transparent"
              value={form.ownerName}
              onChange={onChange("ownerName")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني *</label>
            <input
              type="email"
              required
              data-testid="input-email"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-status-info-foreground focus:border-transparent"
              value={form.email}
              onChange={onChange("email")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور * (8 أحرف على الأقل)</label>
            <input
              type="password"
              required
              minLength={8}
              data-testid="input-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-status-info-foreground focus:border-transparent"
              value={form.password}
              onChange={onChange("password")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">تأكيد كلمة المرور *</label>
            <input
              type="password"
              required
              minLength={8}
              data-testid="input-password-confirm"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-status-info-foreground focus:border-transparent"
              value={form.passwordConfirm}
              onChange={onChange("passwordConfirm")}
            />
          </div>

          {error && (
            <div className="bg-status-error-surface border border-status-error-surface rounded-md p-3 text-sm text-status-error-foreground" data-testid="setup-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            data-testid="button-submit"
            className="w-full bg-status-info-foreground text-white py-2 px-4 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "جاري الإعداد..." : "إنشاء الشركة"}
          </button>

          <p className="text-center text-sm text-gray-500">
            <a href="/" className="hover:underline">العودة لتسجيل الدخول</a>
          </p>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200 text-xs text-gray-500 text-center">
          سيتم تفعيل تجربة مجانية لمدة 30 يوم تلقائياً
        </div>
      </div>
    </div>
  );
}
