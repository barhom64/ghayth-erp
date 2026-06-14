/**
 * GAP_MATRIX P2 — Pure navigation hub for ZATCA-related reports.
 * Makes NO API calls; links out to individual report pages.
 * Intentional: a landing page for ZATCA compliance report navigation.
 */
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@workspace/ui-core";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  Receipt, FileBarChart2, Boxes, Layers, Clock,
  AlertTriangle, RefreshCw, ShieldAlert, Percent, Receipt as ReceiptIcon,
  FileSearch, Calendar, FileCheck2,
} from "lucide-react";

/**
 * ZATCA & inventory reports hub — single landing page that links
 * to the 8 new reports + 2 admin registries shipped in the audit
 * campaign. Lets the operator discover the new surfaces without
 * memorising URLs.
 *
 * Pure read-only / navigation; no API call here — each card
 * deep-links into its own page.
 */

interface ReportCard {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  group: "tax" | "inventory" | "registry";
}

const CARDS: ReportCard[] = [
  // ── Tax + ZATCA ────────────────────────────────────────────────────
  {
    href: "/finance/reports/vat-reconciliation",
    title: "مطابقة ضريبة القيمة المضافة",
    description: "تحقق ضريبة المخرجات / المدخلات قبل تقديم الإقرار الشهري لزاتكا — يكشف الفرق بين الحركة والرصيد الفعلي.",
    icon: FileBarChart2,
    iconClass: "text-emerald-600 bg-emerald-50",
    group: "tax",
  },
  {
    href: "/finance/reports/wht-summary",
    title: "ملخص استقطاع الضريبة (WHT)",
    description: "تقرير الاستقطاع الشهري للموردين غير المقيمين — تقسيم حسب الفئة + المورد لتعبئة إقرار زاتكا.",
    icon: Receipt,
    iconClass: "text-status-warning-foreground bg-status-warning-surface",
    group: "tax",
  },
  {
    href: "/finance/reports/cogs-summary",
    title: "ملخص التكلفة وهامش الربح (COGS)",
    description: "إيراد − تكلفة المباع = الربح. تقسيم حسب المنتج / العميل / الشهر مع badge ملوّن للهامش.",
    icon: ReceiptIcon,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "tax",
  },

  // ── Inventory ──────────────────────────────────────────────────────
  {
    href: "/finance/reports/inventory-valuation",
    title: "تقييم المخزون",
    description: "Σ (الكمية × تكلفة الوحدة) عبر التشغيلات النشطة — رقم بند المخزون في الميزانية.",
    icon: Boxes,
    iconClass: "text-emerald-700 bg-emerald-50",
    group: "inventory",
  },
  {
    href: "/finance/reports/inventory-turnover",
    title: "معدل دوران المخزون",
    description: "COGS / قيمة المخزون = معدل الدوران. لرصد المنتجات السريعة والجامدة.",
    icon: RefreshCw,
    iconClass: "text-status-warning-foreground bg-status-warning-surface",
    group: "inventory",
  },
  {
    href: "/finance/reports/lot-expiry-alerts",
    title: "تنبيهات صلاحية التشغيلات",
    description: "التشغيلات المتجهة للانتهاء (30/60/90 يوم) — تخطيط FIFO ومنع الخسائر.",
    icon: Clock,
    iconClass: "text-status-warning-foreground bg-status-warning-surface",
    group: "inventory",
  },
  {
    href: "/finance/reports/negative-stock",
    title: "تشغيلات بمخزون سالب",
    description: "lot.quantity < 0 لا يجب أن يحدث. تقرير الـ outliers لإصلاحها قبل تقرير الميزانية.",
    icon: AlertTriangle,
    iconClass: "text-destructive bg-destructive/10",
    group: "inventory",
  },

  // ── Audit ───────────────────────────────────────────────────────────
  {
    href: "/finance/reports/gl-integrity-gaps",
    title: "فجوات سلامة الـ GL (قبل الإقفال)",
    description: "فواتير معتمدة بدون قيد، إشعارات بدون JE، دفعات بدون GL — يجب التسوية قبل أي إقفال شهري.",
    icon: ShieldAlert,
    iconClass: "text-orange-600 bg-orange-50",
    group: "tax",
  },
  {
    href: "/finance/reports/unmapped-lines",
    title: "البنود غير المُوجَّهة",
    description: "بنود فواتير / أوامر شراء / إيصالات استلام بدون allocation لحساب GL محدد — تخفي قيمتها عن تحليل الإيرادات والمصروفات.",
    icon: FileSearch,
    iconClass: "text-status-warning-foreground bg-status-warning-surface",
    group: "tax",
  },

  // ── Admin registries ──────────────────────────────────────────────
  {
    href: "/finance/tax-codes",
    title: "إدارة رموز الضريبة",
    description: "VAT15 / VAT0 / EXEMPT / OOS / RCM15 — ربط بالحسابات + إعدادات شامل / غير شامل.",
    icon: Percent,
    iconClass: "text-purple-600 bg-purple-50",
    group: "registry",
  },
  {
    href: "/finance/wht-categories",
    title: "إدارة فئات الاستقطاع",
    description: "10 فئات سعودية مبذورة (إتاوات 15% / خدمات فنية 15% / إدارة 20% / ...) قابلة للتعديل.",
    icon: Layers,
    iconClass: "text-status-warning-foreground bg-status-warning-surface",
    group: "registry",
  },
];

const GROUP_LABEL: Record<ReportCard["group"], string> = {
  tax: "🧾 الضريبة وزاتكا",
  inventory: "📦 المخزون",
  registry: "⚙ السجلات الإدارية",
};
const GROUP_ORDER: ReportCard["group"][] = ["tax", "inventory", "registry"];

export default function ZatcaReportsHubPage() {
  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    label: GROUP_LABEL[g],
    cards: CARDS.filter((c) => c.group === g),
  }));

  return (
    <PageShell
      title="تقارير الضرائب والمخزون"
      subtitle="مركز التقارير الجديدة من حملة الإصلاح المالي — كل شي تحتاجه قبل إقفال الشهر والإقرار الضريبي"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "ضريبة + مخزون" },
      ]}
      actions={
        <div className="flex gap-2">
          <Link href="/finance/tax-filing-calendar">
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Calendar className="h-3.5 w-3.5 ml-1" />
              تقويم الإقرارات
            </Button>
          </Link>
          <Link href="/finance/vat-filing-readiness">
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <FileCheck2 className="h-3.5 w-3.5 ml-1" />
              جاهزية VAT
            </Button>
          </Link>
          <Link href="/finance/wht-filing-workbench">
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Receipt className="h-3.5 w-3.5 ml-1" />
              منضدة WHT
            </Button>
          </Link>
          <PrintButton
            entityType="report_finance_zatca_reports_hub"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "تقارير الضرائب والمخزون — الفهرس", total: CARDS.length },
              items: CARDS.map((c) => ({
                "المجموعة": c.group === "tax" ? "ضريبة" : c.group === "inventory" ? "مخزون" : "سجل",
                "التقرير": c.title,
                "الوصف": c.description,
              })),
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />
      <Card className="mb-6 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1">📋 سير العمل المقترح قبل إقفال الشهر</p>
          <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
            <li>افتح <span className="font-medium">فجوات سلامة الـ GL</span> → تأكد من خلوها من البنود.</li>
            <li>افتح <span className="font-medium">تشغيلات بمخزون سالب</span> → صحّح أي عجز.</li>
            <li>افتح <span className="font-medium">تقييم المخزون</span> → طابق رصيد بند المخزون في الميزانية.</li>
            <li>افتح <span className="font-medium">مطابقة ضريبة القيمة المضافة</span> → تأكد من driftIsClean.</li>
            <li>افتح <span className="font-medium">ملخص استقطاع الضريبة</span> → استخدم byCategory لإقرار زاتكا.</li>
            <li>افتح <span className="font-medium">ملخص التكلفة وهامش الربح</span> → راجع المنتجات الخاسرة.</li>
          </ol>
        </CardContent>
      </Card>

      {grouped.map((g) => (
        <div key={g.group} className="mb-6">
          <h3 className="text-base font-semibold mb-3">{g.label}</h3>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {g.cards.map((c) => {
              const Icon = c.icon;
              return (
                <Link key={c.href} href={c.href}>
                  <Card className="cursor-pointer hover:shadow-md hover:border-status-info-surface transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${c.iconClass} shrink-0`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm mb-1">{c.title}</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {c.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer with badge count */}
      <Card className="mt-8 bg-muted/30">
        <CardContent className="p-4 text-center">
          <Badge variant="outline" className="text-xs">
            {CARDS.length} صفحة جديدة ضمن حملة الإصلاح المالي
          </Badge>
          <p className="text-xs text-muted-foreground mt-2">
            هذه التقارير تستهلك APIs الـ Backend المدموجة من PRs #999 / #1002 / #1006 / #1010 /
            #1013 / #1017 / #1027 / #1033 / #1034 / #1035 / #1036 / #1037 / #1042.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
