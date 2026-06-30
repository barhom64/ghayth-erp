/**
 * CookieConsent — بانر موافقة ملفات تعريف الارتباط
 * يظهر للزوار الجدد ويُخزن تفضيلهم في localStorage
 * متوافق مع متطلبات GDPR وPDPL السعودي
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Cookie } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const CONSENT_KEY = "wafd_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const { t, dir } = useLanguage();

  useEffect(() => {
    // لا تُظهر البانر إذا كان المستخدم قد اختار مسبقاً
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      // تأخير بسيط لتجنب الوميض عند تحميل الصفحة
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] p-4 md:p-6"
      dir={dir}
      role="dialog"
      aria-label={t.cookie.ariaLabel}
    >
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl border border-[oklch(0.90_0.006_80)] p-5 md:p-6">
        <div className="flex items-start gap-4">
          {/* أيقونة */}
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[oklch(0.94_0.008_185)] flex items-center justify-center">
            <Cookie size={20} className="text-[oklch(0.52_0.12_185)]" />
          </div>

          {/* النص */}
          <div className="flex-1 min-w-0">
            <h3
              className="text-base font-bold text-[oklch(0.14_0.005_0)] mb-1"
              style={{ fontFamily: "'Cairo', sans-serif" }}
            >
              {t.cookie.title}
            </h3>
            <p
              className="text-sm text-[oklch(0.55_0.005_0)] leading-relaxed"
              style={{ fontFamily: "'Tajawal', sans-serif" }}
            >
              {t.cookie.desc}{" "}
              <a
                href="/privacy"
                className="text-[oklch(0.52_0.12_185)] underline hover:no-underline"
              >
                {t.cookie.privacyLink}
              </a>
              .
            </p>
          </div>

          {/* زر الإغلاق */}
          <button
            onClick={decline}
            className="flex-shrink-0 text-[oklch(0.70_0.005_0)] hover:text-[oklch(0.40_0.005_0)] transition-colors"
            aria-label={t.cookie.closeLabel}
          >
            <X size={18} />
          </button>
        </div>

        {/* الأزرار */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4 sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={decline}
            className="text-sm"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          >
            {t.cookie.rejectNonEssential}
          </Button>
          <Button
            size="sm"
            onClick={accept}
            className="text-sm text-white"
            style={{
              background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            {t.cookie.acceptAll}
          </Button>
        </div>
      </div>
    </div>
  );
}
