import { useState } from "react";
import { useApiMutation } from "@/lib/api";
import { useLocation, Link } from "wouter";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";

const CATEGORIES = [
  { value: "general", label: "استفسار عام" },
  { value: "billing", label: "استفسار فوترة" },
  { value: "technical", label: "مشكلة تقنية" },
  { value: "complaint", label: "شكوى" },
  { value: "service", label: "طلب خدمة" },
];

const PRIORITIES = [
  { value: "low", label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high", label: "عالية" },
];

function SubmitButton({ isPending }: { isPending: boolean }) {
  const { isCoolingDown, label } = useRateLimitCooldown();
  const busy = isPending || isCoolingDown;
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
    >
      {isCoolingDown ? label : isPending ? "جارٍ الإرسال..." : "إرسال الطلب"}
    </button>
  );
}

export default function NewTicket() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "general",
    priority: "medium",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const mutation = useApiMutation<any, any>("/tickets", "POST", [["portal-tickets"]]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("يرجى إدخال عنوان الطلب");
      return;
    }
    setError("");
    try {
      await mutation.mutateAsync(form);
      setSuccess(true);
      setTimeout(() => setLocation("/tickets"), 2000);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء إرسال الطلب");
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-2">
        <Link href="/tickets" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            الطلبات
          </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-900 text-sm">طلب جديد</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-5">إنشاء طلب جديد</h1>

        {success ? (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 text-center">
            <p className="font-medium">تم إرسال طلبك بنجاح!</p>
            <p className="text-sm mt-1">سيتواصل معك الفريق في أقرب وقت.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                عنوان الطلب <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="وصف موجز للطلب"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">نوع الطلب</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الأولوية</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {PRIORITIES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تفاصيل الطلب</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={5}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="اشرح طلبك بالتفصيل..."
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <SubmitButton isPending={mutation.isPending} />
              <Link href="/tickets" className="px-4 py-2.5 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                  إلغاء
                </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
