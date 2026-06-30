import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

/**
 * شريط أنواع الإنشاء المالي الموحّد (نظام بروحين — واجهة موحّدة، doc 25 §١١.٢).
 * يعرض صفحات الإنشاء المالية الثلاث (+ القيد) كسطح تبويبي واحد فتبدو **مترابطة**
 * بدل صفحات متفرّقة. كل تبويب ينتقل لصفحته — والمحرّك الخلفي لكل نوع يبقى كما هو
 * (لا نقل منطق، لا هجرة، لا مساس بالدفتر). يحلّ محلّ روابط «أنواع أخرى» النصّية.
 */
type FinanceCreateTab = "event" | "sales" | "purchase" | "journal";

const TABS: { key: FinanceCreateTab; label: string; path: string }[] = [
  { key: "event", label: "قبض / صرف", path: "/finance/documents/create" },
  { key: "sales", label: "فاتورة مبيعات", path: "/finance/documents/invoice" },
  { key: "purchase", label: "فاتورة مشتريات", path: "/finance/documents/vendor-invoice" },
  { key: "journal", label: "قيد محاسبي", path: "/finance/journal/create" },
];

export function FinanceCreateTabs({ active }: { active: FinanceCreateTab }) {
  const [, navigate] = useLocation();
  return (
    <div
      className="flex flex-wrap gap-1 rounded-lg border bg-surface-subtle p-1"
      role="tablist"
      aria-label="نوع الواقعة المالية"
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => { if (!isActive) navigate(t.path); }}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
