import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  BookOpen, FileText, ScrollText, Wallet, ShoppingCart, Receipt,
  Building2, BarChart3, CreditCard, Banknote, HandCoins, ClipboardList,
  Box, Landmark, BadgeDollarSign, Repeat, FileSpreadsheet,
  Percent, Boxes, Coins, Network, MoreHorizontal, ChevronDown,
} from "lucide-react";

interface Tab { href: string; label: string; icon: any; match: string[]; }

// 15 تبويبًا رئيسيًّا (الأكثر استخدامًا يوميًّا، مُرتَّبة: دفتر → مدينون →
// مصروفات/مشتريات → موازنة/أصول → ضرائب → تقارير) + قائمة «المزيد» المنسدلة
// للتبويبات الثانوية (المطالبات والعهد + تفاصيل الضرائب) — تقصير الشريط من 22
// مسطّحًا إلى 15 + منسدلة، على نمط شريط العمرة («الرقابة»).
const PRIMARY_TABS: Tab[] = [
  { href: "/finance/accounts", label: "الحسابات", icon: BookOpen, match: ["/finance/accounts"] },
  { href: "/finance/journal", label: "القيود", icon: ScrollText, match: ["/finance/journal", "/finance/journal-manual", "/finance/opening-balances", "/finance/recurring-journals"] },
  { href: "/finance/vouchers", label: "السندات", icon: FileSpreadsheet, match: ["/finance/vouchers"] },
  { href: "/finance/invoices", label: "الفواتير", icon: FileText, match: ["/finance/invoices"] },
  { href: "/finance/receivables", label: "المقبوضات", icon: Receipt, match: ["/finance/receivables"] },
  { href: "/finance/customer-advances", label: "دفعات مقدمة", icon: Coins, match: ["/finance/customer-advances"] },
  { href: "/finance/expenses", label: "المصروفات", icon: CreditCard, match: ["/finance/expenses"] },
  { href: "/finance/payments", label: "المدفوعات", icon: Banknote, match: ["/finance/payments"] },
  { href: "/finance/purchase-orders", label: "المشتريات", icon: ShoppingCart, match: ["/finance/purchase-orders", "/finance/purchase-requests"] },
  { href: "/finance/vendors", label: "الموردون", icon: Building2, match: ["/finance/vendors"] },
  { href: "/finance/budget", label: "الميزانية", icon: Wallet, match: ["/finance/budget"] },
  { href: "/finance/fixed-assets", label: "الأصول الثابتة", icon: Box, match: ["/finance/fixed-assets"] },
  { href: "/finance/tax", label: "الزكاة والضريبة", icon: Repeat, match: ["/finance/tax"] },
  { href: "/finance/reports", label: "التقارير", icon: BarChart3, match: ["/finance/reports"] },
  { href: "/finance/dimensional-routing", label: "التوجيه البُعدي", icon: Network, match: ["/finance/dimensional-routing", "/finance/subsidiary-accounts", "/finance/cost-centers"] },
];

const MORE_TABS: Tab[] = [
  { href: "/finance/financial-requests", label: "الطلبات المالية", icon: HandCoins, match: ["/finance/financial-requests"] },
  { href: "/finance/commitments", label: "الالتزامات", icon: ClipboardList, match: ["/finance/commitments"] },
  { href: "/finance/salary-advances", label: "السلف", icon: BadgeDollarSign, match: ["/finance/salary-advances"] },
  { href: "/finance/custodies", label: "العهد", icon: Landmark, match: ["/finance/custodies"] },
  { href: "/finance/tax-codes", label: "رموز الضريبة", icon: Percent, match: ["/finance/tax-codes"] },
  { href: "/finance/wht-categories", label: "فئات الاستقطاع", icon: Receipt, match: ["/finance/wht-categories"] },
  { href: "/finance/reports/zatca", label: "تقارير الزكاة والضريبة", icon: Boxes, match: ["/finance/reports/zatca", "/finance/reports/vat-reconciliation", "/finance/reports/wht-summary", "/finance/reports/cogs-summary", "/finance/reports/inventory-valuation", "/finance/reports/inventory-turnover", "/finance/reports/lot-expiry-alerts", "/finance/reports/negative-stock", "/finance/reports/gl-integrity-gaps", "/finance/reports/unmapped-lines"] },
];

function isActive(tab: Tab, location: string): boolean {
  return tab.match.some((m) => location === m || location.startsWith(`${m}/`));
}

export function FinanceTabsNav() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_TABS.some((t) => isActive(t, location));

  return (
    <div className="border-b mb-4 -mt-2 overflow-x-auto">
      <nav className="flex gap-1 min-w-max items-center" dir="rtl">
        {PRIMARY_TABS.map((tab) => {
          const active = isActive(tab, location);
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} asChild>
              <a
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </a>
            </Link>
          );
        })}

        {/* «المزيد» — التبويبات المالية الثانوية في قائمة منسدلة واحدة */}
        <div className="relative" onMouseLeave={() => setMoreOpen(false)}>
          <button
            type="button"
            data-testid="finance-tab-more-dropdown"
            onClick={() => setMoreOpen((v) => !v)}
            onMouseEnter={() => setMoreOpen(true)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              moreActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
            المزيد
            <ChevronDown className="h-3 w-3" />
          </button>
          {moreOpen && (
            <div className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-md py-1 min-w-[200px] z-50">
              {MORE_TABS.map((tab) => {
                const active = isActive(tab, location);
                const Icon = tab.icon;
                return (
                  <Link key={tab.href} href={tab.href} asChild>
                    <a
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors",
                        active ? "text-primary font-medium" : "text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </a>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
