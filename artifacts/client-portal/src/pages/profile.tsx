import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value || "-"}</span>
    </div>
  );
}

function ProfileSaveSubmit({ loading }: { loading: boolean }) {
  const { isCoolingDown, label } = useRateLimitCooldown();
  const busy = loading || isCoolingDown;
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm"
    >
      {isCoolingDown ? label : loading ? "جارٍ الحفظ..." : "حفظ"}
    </button>
  );
}

export default function Profile() {
  const { client, logout } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [form, setForm] = useState({ current: "", newPass: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.current || !form.newPass || !form.confirm) {
      setError("يرجى ملء جميع الحقول");
      return;
    }
    if (form.newPass !== form.confirm) {
      setError("كلمة المرور الجديدة وتأكيدها غير متطابقتين");
      return;
    }
    if (form.newPass.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch("/profile/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.newPass }),
      });
      setSuccess("تم تغيير كلمة المرور بنجاح");
      setForm({ current: "", newPass: "", confirm: "" });
      setShowPasswordForm(false);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء تغيير كلمة المرور");
    } finally {
      setLoading(false);
    }
  };

  if (!client) return null;

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">الملف الشخصي</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-700 text-xl font-bold">
              {client.name?.charAt(0) || "؟"}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{client.name}</h2>
            <p className="text-sm text-gray-500">{client.portalEmail || client.email}</p>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          <InfoRow label="الاسم الكامل" value={client.name || "-"} />
          <InfoRow label="البريد الإلكتروني" value={client.email || "-"} />
          <InfoRow label="رقم الجوال" value={client.phone || "-"} />
          {client.lastLoginAt && (
            <InfoRow label="آخر تسجيل دخول" value={formatDateAr(client.lastLoginAt)} />
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">الأمان</h2>
        </div>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm mb-4">
            {success}
          </div>
        )}

        {!showPasswordForm ? (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            تغيير كلمة المرور
          </button>
        ) : (
          <form onSubmit={handlePasswordChange} className="space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور الحالية</label>
              <input
                type="password"
                value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور الجديدة</label>
              <input
                type="password"
                value={form.newPass}
                onChange={(e) => setForm({ ...form, newPass: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="6 أحرف على الأقل"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تأكيد كلمة المرور</label>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <div className="flex gap-2">
              <ProfileSaveSubmit loading={loading} />
              <button
                type="button"
                onClick={() => { setShowPasswordForm(false); setError(""); setForm({ current: "", newPass: "", confirm: "" }); }}
                className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <button
          onClick={logout}
          className="flex items-center gap-2 text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
