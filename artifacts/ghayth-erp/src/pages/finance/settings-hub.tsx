import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Percent, Receipt, Workflow, Package, Eye, Globe, RefreshCw,
  Calendar, Wallet, Settings as SettingsIcon, Layers, Handshake, ClipboardList,
  History,
} from "lucide-react";

/**
 * Finance Settings Hub — single landing page for all admin / setup
 * pages added during the line-level allocation campaign + the tax
 * + WHT registries. Replaces "scattered URLs" with one navigation
 * surface for the finance admin.
 */

interface SettingsCard {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  group: "registries" | "allocation" | "currency" | "periods" | "procurement";
}

const CARDS: SettingsCard[] = [
  // ── Tax / WHT registries ─────────────────────────────────────
  {
    href: "/finance/accounts",
    title: "دليل الحسابات (Chart of Accounts)",
    description: "إدارة شجرة الحسابات — أصول / خصوم / حقوق ملكية / إيرادات / مصروفات. حماية من تكرار الرمز ومن تغيير النوع بعد الاستخدام.",
    icon: BookOpen,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "registries",
  },
  {
    href: "/finance/tax-codes",
    title: "رموز الضريبة (Tax Codes)",
    description: "VAT15 / VAT0 / EXEMPT / OOS / RCM15 — ربط بالحسابات + إعدادات شامل/غير شامل + ربط بـ ZATCA codes.",
    icon: Percent,
    iconClass: "text-purple-600 bg-purple-50",
    group: "registries",
  },
  {
    href: "/finance/wht-categories",
    title: "فئات الاستقطاع (WHT)",
    description: "10 فئات سعودية مبذورة (إتاوات 15% / خدمات فنية 15% / إدارة 20% / فوائد 5% / ...) قابلة للتعديل.",
    icon: Receipt,
    iconClass: "text-status-warning-foreground bg-status-warning-surface",
    group: "registries",
  },
  {
    href: "/finance/cost-centers",
    title: "مراكز التكلفة (Cost Centers)",
    description: "أبعاد محاسبية لكل بند JE — تحليل الأرباح حسب المشروع / المركبة / الإدارة. تستخدمها قواعد التوجيه عبر استراتيجيات from_*.",
    icon: Layers,
    iconClass: "text-purple-600 bg-purple-50",
    group: "registries",
  },

  // ── Allocation engine ────────────────────────────────────────
  {
    href: "/finance/allocation-rules",
    title: "قواعد التوجيه المحاسبي",
    description: "Auto-routing rules — تحدد كيف يتم توجيه كل بند مالي إلى حسابه ومركز تكلفته وكيانه التشغيلي تلقائياً.",
    icon: Workflow,
    iconClass: "text-emerald-700 bg-emerald-50",
    group: "allocation",
  },
  {
    href: "/finance/product-catalog",
    title: "كتالوج المنتجات والخدمات",
    description: "Product Accounting Catalog — كل منتج/خدمة له توجيه افتراضي للحساب ومركز التكلفة والكيان المرتبط ينطبق تلقائياً عند الاختيار.",
    icon: Package,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "allocation",
  },
  {
    href: "/finance/allocation-results",
    title: "سجل توجيه البنود (Audit Trail)",
    description: "كل قرار توجيه يحفظه الـ resolver — أي بند، أي قاعدة، أي حساب ومركز تكلفة. الـ override اليدوي مع السبب.",
    icon: Eye,
    iconClass: "text-orange-600 bg-orange-50",
    group: "allocation",
  },

  // ── Multi-currency ───────────────────────────────────────────
  {
    href: "/finance/fx-rates",
    title: "أسعار صرف العملات",
    description: "إدارة أسعار الصرف (USD/EUR/AED/...) — يدوية أو من البنك المركزي. تُستخدم في الفواتير متعددة العملات.",
    icon: Globe,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "currency",
  },
  {
    href: "/finance/fx-revaluation",
    title: "إعادة تقييم العملات (FX Revaluation)",
    description: "قيد شهري لتعديل قيمة الفواتير وأوامر الشراء المفتوحة بعملات أجنبية إلى سعر إقفال الفترة.",
    icon: RefreshCw,
    iconClass: "text-emerald-600 bg-emerald-50",
    group: "currency",
  },
  {
    href: "/finance/fx-revaluation/history",
    title: "سجل إعادة التقييم",
    description: "كل قيود FX revaluation اللي أُنشئت — الأثر التراكمي على الأرباح/الخسائر من تذبذب أسعار الصرف عبر الفترات.",
    icon: History,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "currency",
  },

  // ── Procurement (Purchase Requests / Vendor Contracts) ───────
  {
    href: "/finance/purchase-requests",
    title: "طلبات الشراء (Purchase Requests)",
    description: "تدفّق طلب الشراء قبل إصدار PO — اعتماد ثم تحويل إلى أمر شراء رسمي. حوكمة مسبقة على الالتزامات.",
    icon: ClipboardList,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "procurement",
  },
  {
    href: "/finance/contracts",
    title: "عقود الموردين (Vendor Contracts)",
    description: "إدارة عقود الإطار مع الموردين، تنبيهات قبل انتهاء العقد بـ 30 يوم لتفادي انقطاع التوريد.",
    icon: Handshake,
    iconClass: "text-emerald-700 bg-emerald-50",
    group: "procurement",
  },

  // ── Periods & close ──────────────────────────────────────────
  {
    href: "/finance/fiscal-periods",
    title: "الفترات المالية",
    description: "تقفيل/فتح الفترات الشهرية — يمنع الترحيل في فترات مقفلة. مع سياسة قفل بعد الإقرار الضريبي.",
    icon: Calendar,
    iconClass: "text-status-warning-foreground bg-status-warning-surface",
    group: "periods",
  },
  {
    href: "/finance/year-end-close",
    title: "إقفال السنة المالية",
    description: "ترحيل الأرباح/الخسائر للأرباح المحتجزة. يستلزم إقفال كل الـ 12 فترة + GL integrity gaps clean.",
    icon: Wallet,
    iconClass: "text-purple-700 bg-purple-50",
    group: "periods",
  },
  {
    href: "/finance/opening-balances",
    title: "الأرصدة الافتتاحية",
    description: "إدخال الأرصدة الافتتاحية عند بدء العمل بالنظام — مع CSV import للأرصدة الكبيرة.",
    icon: BookOpen,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "periods",
  },
];

const GROUP_INFO: Record<SettingsCard["group"], { label: string; description: string }> = {
  registries: {
    label: "🗂 السجلات الأساسية",
    description: "دليل الحسابات + رموز الضرائب + فئات الاستقطاع",
  },
  allocation: {
    label: "⚙ محرك التوجيه المحاسبي (Line-Level Allocation)",
    description: "القواعد + الكتالوج + سجل القرارات",
  },
  currency: {
    label: "🌍 العملات المتعددة (Multi-Currency)",
    description: "الأسعار + إعادة التقييم الشهرية",
  },
  periods: {
    label: "📅 الفترات والإقفالات",
    description: "الفترات المالية + إقفال السنة + الأرصدة الافتتاحية",
  },
  procurement: {
    label: "🛒 المشتريات (Procurement)",
    description: "طلبات الشراء + عقود الموردين",
  },
};

const GROUP_ORDER: SettingsCard["group"][] = ["registries", "allocation", "currency", "periods", "procurement"];

export default function FinanceSettingsHubPage() {
  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    info: GROUP_INFO[g],
    cards: CARDS.filter((c) => c.group === g),
  }));

  return (
    <PageShell
      title="مركز إعدادات النظام المالي"
      subtitle="كل الإعدادات الإدارية للنظام المالي في صفحة واحدة — دليل الحسابات، الضرائب، التوجيه المحاسبي، العملات، الفترات"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "الإعدادات" },
      ]}
    >
      <Card className="mb-6 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" /> لماذا هذا المركز؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            من حملة الإصلاح المالي وLine-Level Allocation، أُضيفت كثير من الصفحات
            الإدارية. هذا المركز يجمعها في مكان واحد بحيث يقدر المسؤول المالي يرى
            كل مكونات النظام المالي ويفتح ما يحتاج إلى تعديل بنقرة واحدة.
          </p>
        </CardContent>
      </Card>

      {grouped.map((g) => (
        <div key={g.group} className="mb-6">
          <div className="mb-3">
            <h3 className="text-base font-semibold">{g.info.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{g.info.description}</p>
          </div>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {g.cards.map((c) => {
              const Icon = c.icon;
              return (
                <Link key={c.href} href={c.href}>
                  <Card className="cursor-pointer hover:shadow-md hover:border-status-info-surface transition-all h-full">
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

      <Card className="mt-8 bg-muted/30">
        <CardContent className="p-4 text-center">
          <Badge variant="outline" className="text-xs">
            {CARDS.length} صفحة إدارية موزعة على {GROUP_ORDER.length} مجموعة
          </Badge>
          <p className="text-xs text-muted-foreground mt-2">
            هذي الصفحات أُضيفت تباعاً خلال حملة Line-Level Accounting Allocation +
            تكامل ZATCA + الـ Daftra-style tax. التقارير المالية في
            <Link href="/finance/reports" className="text-status-info-foreground hover:underline mx-1">/finance/reports</Link>
            و
            <Link href="/finance/reports/zatca" className="text-status-info-foreground hover:underline mx-1">/finance/reports/zatca</Link>.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
