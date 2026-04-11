import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { useLocation } from "wouter";

export default function ChangePassword() {
  const { logout, clearMustChangePassword } = useAuth();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ current: "", newPass: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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
    try {
      await apiFetch("/profile/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.newPass }),
      });
      clearMustChangePassword();
      setSuccess(true);
      setTimeout(() => setLocation("/"), 2000);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء تغيير كلمة المرور");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">تغيير كلمة المرور</h1>
            <p className="text-gray-500 mt-1 text-sm">يرجى تغيير كلمة المرور المؤقتة قبل المتابعة</p>
          </div>

          {success ? (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 text-center text-sm">
              تم تغيير كلمة المرور بنجاح! جارٍ التحويل...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور الجديدة</label>
                <input
                  type="password"
                  value={form.newPass}
                  onChange={(e) => setForm({ ...form, newPass: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="6 أحرف على الأقل"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">تأكيد كلمة المرور</label>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                {loading ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}
              </button>
              <button
                type="button"
                onClick={logout}
                className="w-full text-gray-500 text-sm hover:text-gray-700 py-1"
              >
                تسجيل الخروج
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
