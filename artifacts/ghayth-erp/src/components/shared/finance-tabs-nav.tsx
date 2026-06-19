import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  BookOpen, FileText, ScrollText, Wallet, ShoppingCart, Receipt,
  Building2, BarChart3, CreditCard, Banknote, HandCoins, ClipboardList,
  Box, Landmark, BadgeDollarSign, Repeat, FileSpreadsheet,
  Percent, Boxes, Coins, Network,
} from "lucide-react";

const TABS = [
  { href: "/finance/accounts", label: "الحسابات", icon: BookOpen, match: ["/finance/accounts"] },
  { href: "/finance/invoices", label: "الفواتير", icon: FileText, match: ["/finance/invoices"] },
  { href: "/finance/journal", label: "القيود", icon: ScrollText, match: ["/finance/journal", "/finance/journal-manual", "/finance/opening-balances", "/finance/recurring-journals"] },
  { href: "/finance/vouchers", label: "السندات", icon: FileSpreadsheet, match: ["/finance/vouchers"] },
  { href: "/finance/expenses", label: "المصروفات", icon: CreditCard, match: ["/finance/expenses"] },
  { href: "/finance/budget", label: "الميزانية", icon: Wallet, match: ["/finance/budget"] },
  { href: "/finance/purchase-orders", label: "المشتريات", icon: ShoppingCart, match: ["/finance/purchase-orders", "/finance/purchase-requests"] },
  { href: "/finance/receivables", label: "التحصيل", icon: Receipt, match: ["/finance/receivables"] },
  { href: "/finance/customer-advances", label: "دفعات مقدمة", icon: Coins, match: ["/finance/customer-advances"] },
  { href: "/finance/commitments", label: "الالتزامات", icon: ClipboardList, match: ["/finance/commitments"] },
  { href: "/finance/financial-requests", label: "الطلبات المالية", icon: HandCoins, match: ["/finance/financial-requests"] },
  { href: "/finance/salary-advances", label: "السلف", icon: BadgeDollarSign, match: ["/finance/salary-advances"] },
  { href: "/finance/custodies", label: "العهد", icon: Landmark, match: ["/finance/custodies"] },
  { href: "/finance/fixed-assets", label: "الأصول الثابتة", icon: Box, match: ["/finance/fixed-assets"] },
  { href: "/finance/vendors", label: "الموردون", icon: Building2, match: ["/finance/vendors"] },
  { href: "/finance/payments", label: "المدفوعات", icon: Banknote, match: ["/finance/payments"] },
  { href: "/finance/tax", label: "الزكاة والضريبة", icon: Repeat, match: ["/finance/tax"] },
  // الـ tabs الجديدة من حملة الإصلاح المالي (هـ سعادة المحامي إبراهيم):
  { href: "/finance/tax-codes", label: "رموز الضريبة", icon: Percent, match: ["/finance/tax-codes"] },
  { href: "/finance/wht-categories", label: "فئات الاستقطاع", icon: Receipt, match: ["/finance/wht-categories"] },
  { href: "/finance/reports/zatca", label: "تقارير الزكاة والضريبة", icon: Boxes, match: ["/finance/reports/zatca", "/finance/reports/vat-reconciliation", "/finance/reports/wht-summary", "/finance/reports/cogs-summary", "/finance/reports/inventory-valuation", "/finance/reports/inventory-turnover", "/finance/reports/lot-expiry-alerts", "/finance/reports/negative-stock", "/finance/reports/gl-integrity-gaps", "/finance/reports/unmapped-lines"] },
  { href: "/finance/reports", label: "التقارير", icon: BarChart3, match: ["/finance/reports"] },
  // التأصيل المالي — نظرة موحّدة على ربط الكيانات بالحسابات + مراكز التكلفة
  { href: "/finance/dimensional-routing", label: "التأصيل المالي", icon: Network, match: ["/finance/dimensional-routing", "/finance/subsidiary-accounts", "/finance/cost-centers"] },
];

export function FinanceTabsNav() {
  const [location] = useLocation();

  return (
    <div className="border-b mb-4 -mt-2 overflow-x-auto">
      <nav className="flex gap-1 min-w-max" dir="rtl">
        {TABS.map((tab) => {
          const isActive = tab.match.some((m) => location === m || location.startsWith(`${m}/`));
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href}>
              <a
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
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
      </nav>
    </div>
  );
}
